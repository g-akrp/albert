import * as os from 'os';
import * as path from 'path';
import { ensureK6At } from '../k6/binaryCore';
import { parseEnvConfigFile, parseRequestFile } from '../model/parse';
import { resolveFlow, resolveSim } from '../k6/resolveTargets';
import { generateFlowScript } from '../k6/generateFlowScript';
import { generateSimScript } from '../k6/generateSimScript';
import { runFlowOnce } from '../k6/runner';
import { runSim } from '../k6/simRunner';
import { resolveRequestPreview, sendRequest } from '../http/httpClient';
import { runResponseTests } from '../testing/runTests';
import { runPreRequestScript } from '../scripting/sandbox';
import { EnvSettings, KeyValueEntry } from '../model/types';
import { AblogWriter } from './ablog';
import { startServer } from './serveCommand';
import { readFile } from 'fs/promises';

export interface RunOptions {
  file: string;
  env?: string;
  ablog?: string;
  influx?: string;
  serve?: boolean;
  port?: number;
  k6?: string;
}

export async function runCommand(opts: RunOptions): Promise<number> {
  const file = path.resolve(opts.file);
  const kind = kindFromExt(file);
  if (!kind) {
    console.error(`Unsupported file type: ${opts.file} (expected .abrq, .abf, or .abl)`);
    return 2;
  }

  const { variables, settings } = await loadEnv(opts.env);
  const ablogPath = opts.ablog ? path.resolve(opts.ablog) : defaultAblogPath(file);
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
  if (result.error) console.log(`  ${result.error}`);
  console.log(result.ok ? '  ✓ Flow passed' : '  ✗ Flow had failures');
  return { ok: result.ok };
}

async function runLoadSim(file: string, variables: KeyValueEntry[], opts: RunOptions, log: AblogWriter) {
  const { name, profile, flows, metas } = await resolveSim(file);
  log.write({ type: 'runStart', target: file, kind: 'sim', name });
  console.log(`▶ Sim: ${name} · profile ${profile.type} · ${flows.length} flow(s)`);

  const k6Path = await resolveK6(opts);
  const script = generateSimScript(flows, profile, variables);
  const extraArgs = opts.influx ? ['--out', `influxdb=${opts.influx}`] : [];

  const handle = await runSim(
    k6Path,
    script,
    metas,
    () => console.log('  running…'),
    (tick) => {
      log.write({ type: 'tick', tick });
      const total = tick.scenarios.reduce((s, x) => s + x.reqs, 0);
      process.stdout.write(`\r  t=${tick.tSec}s  ${total} req/s   `);
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
  }
  if (result.error) console.log(`  ${result.error}`);
  return { ok: result.ok };
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
