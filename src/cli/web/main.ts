import { FlowRunResult, FlowStepResult, SimScenarioSummary, SimTick } from '../../model/types';
import { AblogEvent } from '../ablogTypes';
import { flowResultStyles, renderRunResultBody } from '../../webview/components/flowResults';
import { lineChart, LineSeries, PALETTE, sankeyChart, SankeyLink, SankeyNode } from '../../webview/sim/charts';

injectStyles();
const root = document.getElementById('root')!;

async function refresh(): Promise<void> {
  let events: AblogEvent[];
  try {
    events = await (await fetch('/ablog')).json();
  } catch {
    return;
  }
  render(events);
}

function render(events: AblogEvent[]): void {
  root.innerHTML = '';
  const start = events.find((e) => e.type === 'runStart') as Extract<AblogEvent, { type: 'runStart' }> | undefined;
  const end = events.find((e) => e.type === 'runEnd') as Extract<AblogEvent, { type: 'runEnd' }> | undefined;

  const header = document.createElement('div');
  header.className = 'hdr';
  header.innerHTML = start
    ? `<h2>${esc(start.name)}</h2><div class="sub">${start.kind}${end ? (end.ok ? ' · ✓ passed' : ' · ✗ failed') : ' · running…'}</div>`
    : '<div class="sub">Waiting for results…</div>';
  root.appendChild(header);

  if (!start) return;
  if (start.kind === 'request') renderRequest(events);
  else if (start.kind === 'flow') renderFlow(events, end);
  else renderSim(events);
}

function renderRequest(events: AblogEvent[]): void {
  const ev = events.find((e) => e.type === 'request') as Extract<AblogEvent, { type: 'request' }> | undefined;
  if (!ev) return;
  const box = document.createElement('div');
  const status = ev.result.error ? `✗ ${ev.result.error}` : `${ev.result.status} ${ev.result.statusText} · ${ev.result.timeMs} ms`;
  box.innerHTML = `<div class="status">${esc(status)}</div>`;
  for (const c of [...ev.testRun.expectResults, ...ev.testRun.scriptResults]) {
    const row = document.createElement('div');
    row.className = 'chk ' + (c.pass ? 'ok' : 'err');
    row.textContent = `${c.pass ? '✓' : '✗'} ${c.description}${c.message ? ` — ${c.message}` : ''}`;
    box.appendChild(row);
  }
  if (ev.result.body) {
    const pre = document.createElement('pre');
    pre.textContent = ev.result.body.slice(0, 4000);
    box.appendChild(pre);
  }
  root.appendChild(box);
}

function renderFlow(events: AblogEvent[], end?: Extract<AblogEvent, { type: 'runEnd' }>): void {
  const steps = events.filter((e) => e.type === 'step').map((e) => (e as Extract<AblogEvent, { type: 'step' }>).step) as FlowStepResult[];
  const result: FlowRunResult = { ok: end?.ok ?? false, steps, error: end?.error };
  root.appendChild(renderRunResultBody(result));
}

function renderSim(events: AblogEvent[]): void {
  const ticks = events.filter((e) => e.type === 'tick').map((e) => (e as Extract<AblogEvent, { type: 'tick' }>).tick) as SimTick[];
  const summary = (events.find((e) => e.type === 'summary') as Extract<AblogEvent, { type: 'summary' }> | undefined)?.summary;
  const scenarios = summary ? summary.scenarios : deriveScenarios(ticks);
  const keys = scenarios.map((s) => s.key);

  // XY
  root.appendChild(
    lineChart('Throughput (req/s)', keys.map((key, i) => series(ticks, key, i, (sc) => sc.tps)), { yFormat: (n) => `${Math.round(n)}` })
  );
  root.appendChild(
    lineChart('p95 latency (ms)', keys.map((key, i) => series(ticks, key, i, (sc) => sc.p95)), { yFormat: (n) => `${Math.round(n)}` })
  );
  root.appendChild(
    lineChart('Error rate (%)', keys.map((key, i) => series(ticks, key, i, (sc) => sc.errorRate * 100)), { yMax: 100, yFormat: (n) => `${Math.round(n)}%` })
  );

  // Sankey + table
  root.appendChild(renderSimSankey(scenarios));
  root.appendChild(renderSimTable(scenarios));
}

function series(ticks: SimTick[], key: string, i: number, pick: (sc: SimTick['scenarios'][number]) => number): LineSeries {
  return {
    name: key,
    color: PALETTE[i % PALETTE.length],
    values: ticks.map((t) => { const sc = t.scenarios.find((s) => s.key === key); return sc ? pick(sc) : 0; }),
  };
}

function renderSimSankey(scenarios: SimScenarioSummary[]): HTMLElement {
  const total = scenarios.reduce((s, sc) => s + sc.totalReqs, 0);
  if (total === 0) return document.createElement('div');
  const errs = scenarios.reduce((s, sc) => s + sc.totalReqs * sc.errorRate, 0);
  const root: SankeyNode = { id: 'root', label: `Total (${total})`, value: total, color: '#888' };
  const flowNodes: SankeyNode[] = scenarios.map((sc, i) => ({ id: `f:${sc.key}`, label: `${sc.label} (${sc.totalReqs})`, value: sc.totalReqs, color: PALETTE[i % PALETTE.length] }));
  const outcome: SankeyNode[] = [
    { id: 'ok', label: `Success (${Math.round(total - errs)})`, value: total - errs, color: '#2cbb4b' },
    { id: 'err', label: `Error (${Math.round(errs)})`, value: errs, color: '#d9534f' },
  ].filter((n) => n.value > 0);
  const links: SankeyLink[] = [];
  for (const sc of scenarios) {
    links.push({ source: 'root', target: `f:${sc.key}`, value: sc.totalReqs });
    const e = sc.totalReqs * sc.errorRate;
    if (sc.totalReqs - e > 0) links.push({ source: `f:${sc.key}`, target: 'ok', value: sc.totalReqs - e });
    if (e > 0) links.push({ source: `f:${sc.key}`, target: 'err', value: e });
  }
  return sankeyChart('Load distribution (requests)', [[root], flowNodes, outcome], links);
}

function renderSimTable(scenarios: SimScenarioSummary[]): HTMLElement {
  const table = document.createElement('table');
  table.className = 'summary';
  table.innerHTML = '<thead><tr><th>Flow</th><th>Target</th><th>Achieved</th><th>Reqs</th><th>Err</th><th>p50</th><th>p95</th><th>p99</th></tr></thead>';
  const tbody = document.createElement('tbody');
  for (const sc of scenarios) {
    const tr = document.createElement('tr');
    for (const c of [sc.label, String(sc.targetTps), sc.achievedTps.toFixed(1), String(sc.totalReqs), `${(sc.errorRate * 100).toFixed(1)}%`, `${Math.round(sc.p50)}`, `${Math.round(sc.p95)}`, `${Math.round(sc.p99)}`]) {
      const td = document.createElement('td');
      td.textContent = c;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

function deriveScenarios(ticks: SimTick[]): SimScenarioSummary[] {
  const keys = new Set<string>();
  for (const t of ticks) for (const s of t.scenarios) keys.add(s.key);
  const elapsed = Math.max(1, ticks.length);
  return [...keys].map((key) => {
    let totalReqs = 0, errors = 0, lastP95 = 0;
    for (const t of ticks) { const sc = t.scenarios.find((s) => s.key === key); if (!sc) continue; totalReqs += sc.reqs; errors += sc.reqs * sc.errorRate; if (sc.p95) lastP95 = sc.p95; }
    return { key, label: key, targetTps: 0, achievedTps: totalReqs / elapsed, totalReqs, errorRate: totalReqs > 0 ? errors / totalReqs : 0, p50: 0, p95: lastP95, p99: 0, checksPassed: 0, checksTotal: 0 };
  });
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

function injectStyles(): void {
  const style = document.createElement('style');
  style.textContent = `
    .hdr h2 { margin: 0 0 2px; }
    .hdr .sub { color: #9aa; font-size: 13px; margin-bottom: 12px; }
    .status { font-weight: 600; margin-bottom: 8px; }
    .chk.ok { color: #2cbb4b; } .chk.err { color: #d9534f; }
    pre { background: #111; padding: 8px; overflow:auto; white-space: pre-wrap; word-break: break-word; }
    .akrp-chart { margin: 10px 0; max-width: 620px; }
    .akrp-chart-title { font-size: 12px; font-weight: 600; margin-bottom: 2px; }
    .akrp-chart-svg { width: 100%; height: auto; background: #111; border: 1px solid #333; }
    .akrp-chart-grid { stroke: #333; stroke-width: 0.5; }
    .akrp-chart-axis { fill: #9aa; font-size: 9px; }
    .akrp-chart-legend { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 4px; font-size: 11px; }
    .akrp-legend-item { display: flex; align-items: center; gap: 4px; }
    .akrp-legend-swatch { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
    .akrp-sankey-label { fill: #ddd; font-size: 10px; }
    table.summary { border-collapse: collapse; margin: 12px 0; font-size: 12px; }
    table.summary th, table.summary td { border: 1px solid #333; padding: 4px 8px; text-align: left; }
  ` + flowResultStyles();
  document.head.appendChild(style);
}

void refresh();
setInterval(refresh, 1000);
