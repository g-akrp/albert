import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';
import { ensureK6At } from '../k6/binaryCore';
import { parseEnvConfigFile, parseRequestFile } from '../model/parse';
import { resolveFlow, resolveSim } from '../k6/resolveTargets';
import { generateFlowScript } from '../k6/generateFlowScript';
import { generateSimScript, ResolvedSimFlow } from '../k6/generateSimScript';
import { planLoad, plannedRequests, totalDurationSec } from '../model/loadProfile';
import { runFlowOnce } from '../k6/runner';
import { runSim } from '../k6/simRunner';
import { resolveRequestPreview, sendRequest } from '../http/httpClient';
import { runResponseTests } from '../testing/runTests';
import { runPreRequestScript } from '../scripting/sandbox';
import { EnvSettings, KeyValueEntry, SimFile, SimSummary } from '../model/types';
import { AblogWriter, timestampedAblogPath } from './ablog';
import { startServer } from './serveCommand';
import { readFile } from 'fs/promises';
import { sendToNewRelic } from '../apm/newrelic';

export interface RunOptions {
  file: string;
  env?: string;
  ablog?: string;
  influx?: string;
  serve?: boolean;
  port?: number;
  k6?: string;
  /** skip the pre-run load-plan confirmation prompt for .abl sims. */
  quick?: boolean;
}

export async function runCommand(opts: RunOptions): Promise<number> {
  const file = path.resolve(opts.file);
  const kind = kindFromExt(file);
  if (!kind) {
    console.error(`Unsupported file type: ${opts.file} (expected .abrq, .abf, or .abl)`);
    return 2;
  }

  const { variables, settings } = await loadEnv(opts.env);
  // Sims get a timestamped log per run (matching the GUI editor) so successive runs don't clobber
  // each other's results; requests/flows keep the single overwrite-in-place log.
  const ablogPath = opts.ablog ? path.resolve(opts.ablog) : kind === 'sim' ? timestampedAblogPath(file) : defaultAblogPath(file);
  const log = new AblogWriter(ablogPath);

  // Start the live server first (if requested) so it polls the log as events arrive.
  if (opts.serve) {
    const port = opts.port ?? 7070;
    startServer(ablogPath, port);
    console.log(`Serving live results at http://localhost:${port}`);
  }

  let ok = false;
  let runError: string | undefined;
  try {
    if (kind === 'request') {
      ({ ok } = await runRequest(file, variables, settings, log));
    } else if (kind === 'flow') {
      ({ ok } = await runFlow(file, variables, opts, log));
    } else {
      ({ ok } = await runLoadSim(file, variables, opts, log));
    }
  } catch (err: any) {
    runError = err?.message ?? String(err);
    console.error(`Error: ${runError}`);
  }

  log.write({ type: 'runEnd', ok, error: runError });
  await log.close();
  console.log(`\nResult log written to ${ablogPath}`);

  if (opts.serve) {
    console.log('Press Ctrl+C to stop the server.');
    return new Promise<number>(() => undefined); // keep process alive
  }
  return ok ? 0 : 1;
}

async function runRequest(file: string, variables: KeyValueEntry[], settings: EnvSettings, log: AblogWriter) {
  const req = parseRequestFile(await readFile(file, 'utf8'));
  if (!req) throw new Error(`Not a valid .abrq request file: ${file}`);
  log.write({ type: 'runStart', target: file, kind: 'request', name: req.name });
  console.log(`▶ Request: ${req.name}`);

  const liveVars = [...variables];
  const preview = resolveRequestPreview(req.request, liveVars);
  const pre = runPreRequestScript(req.scripts.preRequest, liveVars, {
    method: preview.method,
    url: preview.url,
    headers: preview.headers,
    body: preview.body,
  });
  applyChanges(liveVars, pre.environmentChanges);

  const result = await sendRequest(req.request, liveVars, settings);
  const { testRun } = runResponseTests(req.expectations, req.schemaValidation, req.scripts.postResponse, liveVars, {
    status: result.status,
    headers: result.headers,
    bodyText: result.body,
  });
  testRun.scriptResults = [...pre.assertions, ...testRun.scriptResults];
  testRun.consoleLogs = [...pre.logs, ...testRun.consoleLogs];

  log.write({ type: 'request', result, testRun });

  const checks = [...testRun.expectResults, ...testRun.scriptResults];
  const failed = checks.filter((c) => !c.pass).length;
  console.log(`  ${result.error ? '✗ ' + result.error : `${result.status} ${result.statusText} · ${result.timeMs} ms`}`);
  for (const c of checks) console.log(`  ${c.pass ? '✓' : '✗'} ${c.description}${c.message ? ` — ${c.message}` : ''}`);
  const ok = !result.error && failed === 0;
  return { ok };
}

async function runFlow(file: string, variables: KeyValueEntry[], opts: RunOptions, log: AblogWriter) {
  const { name, steps } = await resolveFlow(file);
  log.write({ type: 'runStart', target: file, kind: 'flow', name });
  console.log(`▶ Flow: ${name} (${steps.length} step${steps.length === 1 ? '' : 's'})`);

  const k6Path = await resolveK6(opts);
  const script = generateFlowScript(steps, variables);
  const handle = await runFlowOnce(k6Path, script, (step) => {
    log.write({ type: 'step', step });
    const failed = step.error || step.checks.some((c) => !c.pass);
    console.log(`  ${failed ? '✗' : '✓'} ${step.name} — ${step.method} ${step.status || '—'} · ${Math.round(step.durationMs)} ms`);
    for (const c of step.checks) if (!c.pass) console.log(`      ✗ ${c.description}`);
    if (step.error) console.log(`      ✗ ${step.error}`);
  });
  const result = await handle.result;
  console.log('--- k6 summary output start ---');
  console.log(result.summary);
  console.log('--- k6 summary output end ---');
  if (result.error) console.log(`  ${result.error}`);
  console.log(result.ok ? '  ✓ Flow passed' : '  ✗ Flow had failures');
  return { ok: result.ok };
}

async function runLoadSim(file: string, variables: KeyValueEntry[], opts: RunOptions, log: AblogWriter) {
  const { name, flows, metas, apm, streaming } = await resolveSim(file);
  log.write({ type: 'runStart', target: file, kind: 'sim', name });
  console.log(`▶ Sim: ${name} · ${flows.length} flow(s)`);
  printLoadPlan(flows);

  // CLI flag wins if both an explicit --influx and a sim-configured streaming target are present.
  const influxUrl = opts.influx ?? streaming?.url;
  if (influxUrl) console.log(`  streaming → Grafana/InfluxDB at ${influxUrl}`);
  if (apm) console.log(`  apm: New Relic (${apm.region})`);

  if (!opts.quick && !(await confirmStart())) {
    console.log('  Aborted (pass --quick to skip this prompt).');
    return { ok: false };
  }

  const k6Path = await resolveK6(opts);
  const script = generateSimScript(flows, variables);
  const extraArgs = influxUrl ? ['--out', `influxdb=${influxUrl}`] : [];
  const labelByKey = new Map(metas.map((m) => [m.key, m.label]));

  const handle = await runSim(
    k6Path,
    script,
    metas,
    () => console.log('  running…'),
    (tick) => {
      log.write({ type: 'tick', tick });
      process.stdout.write(`\r  ${formatTickLine(tick, labelByKey)}   `);
    },
    extraArgs
  );
  const result = await handle.result;
  process.stdout.write('\n');
  if (result.summary) {
    log.write({ type: 'summary', summary: result.summary });
    for (const sc of result.summary.scenarios) {
      console.log(
        `  ${sc.label}: ${sc.achievedTps.toFixed(1)}/${sc.targetTps} TPS · ${sc.totalReqs} req · ` +
          `${(sc.errorRate * 100).toFixed(1)}% err · p95 ${Math.round(sc.p95)}ms`
      );
    }
    if (apm) {
      result.summary.apmExport = await exportApm(name, apm.region, result.summary);
      console.log(`  ${result.summary.apmExport.ok ? '✓' : '✗'} ${result.summary.apmExport.message}`);
    }
  }
  if (result.error) console.log(`  ${result.error}`);
  return { ok: result.ok };
}

/** One refreshing status line per tick: total throughput plus each scenario's live tps/p95/err/vus,
 *  the same fields the GUI's live charts already plot (SimScenarioTick). */
function formatTickLine(tick: { tSec: number; scenarios: { key: string; reqs: number; p95: number; errorRate: number; vus: number }[] }, labelByKey: Map<string, string>): string {
  const total = tick.scenarios.reduce((s, x) => s + x.reqs, 0);
  const perScenario = tick.scenarios
    .map((sc) => `${labelByKey.get(sc.key) ?? sc.key} ${sc.reqs}/s p95 ${Math.round(sc.p95)}ms err ${(sc.errorRate * 100).toFixed(0)}% vus ${sc.vus}`)
    .join(' · ');
  return `t=${tick.tSec}s  ${total} req/s total${perScenario ? ' · ' + perScenario : ''}`;
}

async function exportApm(simName: string, region: 'US' | 'EU', summary: SimSummary) {
  const key = process.env.ALBERT_NEWRELIC_KEY;
  if (!key) return { provider: 'newrelic', ok: false, message: 'apm export skipped — set ALBERT_NEWRELIC_KEY to enable' };
  const sim: SimFile = { albertType: 'sim', albertVersion: 1, name: simName, flows: [] };
  return sendToNewRelic(sim, summary, key, region);
}

/** k6-style pre-run banner: one line per scenario plus totals, so the operator can sanity-check the
 *  load shape before it actually starts hitting a target. */
function printLoadPlan(flows: ResolvedSimFlow[]): void {
  let maxEndSec = 0;
  let totalReqs = 0;
  console.log(`  scenarios: (${flows.length} total)`);
  for (const f of flows) {
    const plan = planLoad(f.profile, f.targetTps);
    const durationSec = totalDurationSec(plan);
    const reqs = plannedRequests(plan);
    totalReqs += reqs;
    maxEndSec = Math.max(maxEndSec, f.startAtSec + durationSec);
    const shape = plan.constant ? `constant ${plan.rate} req/s` : `ramping ${plan.startRate}→${plan.rate} req/s`;
    const start = f.startAtSec > 0 ? `, starts at ${f.startAtSec}s` : '';
    console.log(`    * ${f.label}: ${shape}, ${durationSec}s duration, ~${reqs} reqs${start}`);
  }
  console.log(`  total: ~${totalReqs} reqs over ${maxEndSec}s`);
}

async function confirmStart(): Promise<boolean> {
  const rl = readline.promises.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question('  Proceed with load test? [y/N] ');
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function resolveK6(opts: RunOptions): Promise<string> {
  const cacheDir = path.join(os.homedir(), '.albert', 'k6');
  const k6Path = opts.k6 ?? process.env.ALBERT_K6_PATH;
  return ensureK6At(cacheDir, { k6Path, onProgress: (m) => console.log(`  ${m}`) });
}

function kindFromExt(file: string): 'request' | 'flow' | 'sim' | null {
  if (file.endsWith('.abrq')) return 'request';
  if (file.endsWith('.abf')) return 'flow';
  if (file.endsWith('.abl')) return 'sim';
  return null;
}

function defaultAblogPath(file: string): string {
  return path.join(path.dirname(file), path.basename(file).replace(/\.[^.]+$/, '') + '.ablog');
}

async function loadEnv(envPath: string | undefined): Promise<{ variables: KeyValueEntry[]; settings: EnvSettings }> {
  if (!envPath) return { variables: [], settings: {} };
  const text = await readFile(path.resolve(envPath), 'utf8');
  const env = parseEnvConfigFile(text);
  if (!env) throw new Error(`Not a valid .abenv env file: ${envPath}`);
  return { variables: env.variables, settings: env.settings ?? {} };
}

function applyChanges(variables: KeyValueEntry[], changes: Map<string, string>): void {
  for (const [name, value] of changes) {
    const existing = variables.find((v) => v.name === name);
    if (existing) existing.value = value;
    else variables.push({ name, value, enabled: true });
  }
}
