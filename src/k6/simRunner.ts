import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ChildProcess, spawn } from 'child_process';
import {
  SimRunResult,
  SimScenarioMeta,
  SimScenarioSummary,
  SimScenarioTick,
  SimTick,
} from '../model/types';

const RESERVOIR_CAP = 100_000;

export interface SimRunHandle {
  result: Promise<SimRunResult>;
  stop: () => void;
}

/**
 * Runs a generated sim script via k6 with JSON metric output, polling the output file once per
 * second to emit live per-scenario ticks, and aggregating the full run into a per-flow summary.
 * Returns a handle so the caller can stop the run early.
 *
 * Takes a resolved `k6Path` so this stays vscode-free (shared with the CLI). `extraArgs` are appended
 * to the k6 invocation (e.g. the CLI's `--out influxdb=…` for live Grafana).
 */
export async function runSim(
  k6Path: string,
  script: string,
  scenarios: SimScenarioMeta[],
  onStarted: () => void,
  onTick: (tick: SimTick) => void,
  extraArgs: string[] = []
): Promise<SimRunHandle> {
  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'albert-sim-'));
  const scriptPath = path.join(workDir, 'sim.js');
  const jsonPath = path.join(workDir, 'metrics.json');
  await fsp.writeFile(scriptPath, script, 'utf8');

  const agg = new SimAggregator(scenarios);
  const series: SimTick[] = [];
  let child: ChildProcess | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let offset = 0;
  let lineTail = '';
  let tSec = 0;
  let stoppedByUser = false;

  const readNew = (final: boolean): void => {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(jsonPath);
    } catch {
      return;
    }
    if (stat.size <= offset) {
      if (final) flushTick();
      return;
    }
    const fd = fs.openSync(jsonPath, 'r');
    try {
      const len = stat.size - offset;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, offset);
      offset = stat.size;
      lineTail += buf.toString('utf8');
      let idx: number;
      while ((idx = lineTail.indexOf('\n')) >= 0) {
        const line = lineTail.slice(0, idx);
        lineTail = lineTail.slice(idx + 1);
        agg.consumeLine(line);
      }
    } finally {
      fs.closeSync(fd);
    }
    if (final && lineTail.trim()) {
      agg.consumeLine(lineTail);
      lineTail = '';
    }
    flushTick();
  };

  const flushTick = (): void => {
    const scenarioTicks = agg.takeIntervalTicks();
    const tick: SimTick = { tSec, scenarios: scenarioTicks };
    series.push(tick);
    onTick(tick);
    tSec += 1;
  };

  const result = new Promise<SimRunResult>((resolve) => {
    child = spawn(k6Path, ['run', '--no-usage-report', '--out', `json=${jsonPath}`, ...extraArgs, scriptPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr?.on('data', (d) => (stderr += d.toString()));
    child.stdout?.on('data', () => undefined); // drain k6's progress banner

    onStarted();
    const startedAt = Date.now();
    pollTimer = setInterval(() => readNew(false), 1000);

    child.on('error', (err) => {
      if (pollTimer) clearInterval(pollTimer);
      resolve({ ok: false, error: `Failed to launch k6: ${err.message}` });
    });

    child.on('close', (code) => {
      if (pollTimer) clearInterval(pollTimer);
      readNew(true);
      const elapsedSec = Math.max(1, (Date.now() - startedAt) / 1000);
      const base = agg.buildSummary(elapsedSec);
      void fsp.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
      if (!stoppedByUser && code !== 0 && base.scenarios.every((s) => s.totalReqs === 0)) {
        resolve({ ok: false, error: `k6 exited with code ${code}: ${stderr.slice(-2000)}` });
        return;
      }
      const ok = base.scenarios.every((s) => s.errorRate === 0);
      resolve({ ok, summary: { ...base, series } });
    });
  });

  return {
    result,
    stop: () => {
      stoppedByUser = true;
      try {
        child?.kill();
      } catch {
        // ignore
      }
    },
  };
}

interface ScenarioAcc {
  meta: SimScenarioMeta;
  intervalReqs: number;
  intervalErrors: number;
  intervalDurations: number[];
  totalReqs: number;
  totalErrors: number;
  durationReservoir: number[];
  durationSeen: number;
  checksPassed: number;
  checksTotal: number;
}

/** Parses k6 JSON-output lines and aggregates per-scenario interval + run-total metrics. */
class SimAggregator {
  private readonly byKey = new Map<string, ScenarioAcc>();
  private latestVus = 0;

  constructor(scenarios: SimScenarioMeta[]) {
    for (const meta of scenarios) {
      this.byKey.set(meta.key, {
        meta,
        intervalReqs: 0,
        intervalErrors: 0,
        intervalDurations: [],
        totalReqs: 0,
        totalErrors: 0,
        durationReservoir: [],
        durationSeen: 0,
        checksPassed: 0,
        checksTotal: 0,
      });
    }
  }

  consumeLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed || trimmed[0] !== '{') return;
    let rec: any;
    try {
      rec = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (rec.type !== 'Point' || !rec.data) return;
    const metric = rec.metric as string;
    const value = rec.data.value as number;
    const tags = rec.data.tags ?? {};

    if (metric === 'vus') {
      this.latestVus = value;
      return;
    }

    const acc = tags.scenario ? this.byKey.get(tags.scenario) : undefined;
    if (!acc) return;

    switch (metric) {
      case 'http_reqs':
        acc.intervalReqs += value;
        acc.totalReqs += value;
        break;
      case 'http_req_failed':
        acc.intervalErrors += value;
        acc.totalErrors += value;
        break;
      case 'http_req_duration':
        acc.intervalDurations.push(value);
        this.reservoirAdd(acc, value);
        break;
      case 'checks':
        acc.checksTotal += 1;
        if (value >= 1) acc.checksPassed += 1;
        break;
    }
  }

  takeIntervalTicks(): SimScenarioTick[] {
    const ticks: SimScenarioTick[] = [];
    for (const acc of this.byKey.values()) {
      const tick: SimScenarioTick = {
        key: acc.meta.key,
        reqs: acc.intervalReqs,
        tps: acc.intervalReqs,
        p95: percentile(acc.intervalDurations, 95),
        errorRate: acc.intervalReqs > 0 ? acc.intervalErrors / acc.intervalReqs : 0,
        vus: this.latestVus,
      };
      ticks.push(tick);
      acc.intervalReqs = 0;
      acc.intervalErrors = 0;
      acc.intervalDurations = [];
    }
    return ticks;
  }

  buildSummary(elapsedSec: number): { durationSec: number; scenarios: SimScenarioSummary[] } {
    const scenarios: SimScenarioSummary[] = [];
    for (const acc of this.byKey.values()) {
      scenarios.push({
        key: acc.meta.key,
        label: acc.meta.label,
        targetTps: acc.meta.targetTps,
        achievedTps: acc.totalReqs / elapsedSec,
        totalReqs: acc.totalReqs,
        errorRate: acc.totalReqs > 0 ? acc.totalErrors / acc.totalReqs : 0,
        p50: percentile(acc.durationReservoir, 50),
        p95: percentile(acc.durationReservoir, 95),
        p99: percentile(acc.durationReservoir, 99),
        checksPassed: acc.checksPassed,
        checksTotal: acc.checksTotal,
      });
    }
    return { durationSec: Math.round(elapsedSec), scenarios };
  }

  private reservoirAdd(acc: ScenarioAcc, value: number): void {
    acc.durationSeen += 1;
    if (acc.durationReservoir.length < RESERVOIR_CAP) {
      acc.durationReservoir.push(value);
    } else {
      const j = Math.floor(Math.random() * acc.durationSeen);
      if (j < RESERVOIR_CAP) acc.durationReservoir[j] = value;
    }
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return round2(sorted[lo]);
  return round2(sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
