import { LoadProfile, SimFlowEntry, SimScenarioSummary } from '../../model/types';
import { planLoad, plannedRequests, sampleRateCurve, totalDurationSec } from '../../model/loadProfile';
import { barChart, lineChart, LineSeries, PALETTE, sankeyChart, SankeyLink, SankeyNode } from './charts';
import { genId, store } from './state';

const PROFILES: LoadProfile[] = ['constant', 'load', 'stress', 'spike', 'soak'];

export function renderSim(container: HTMLElement): void {
  container.innerHTML = '';
  container.appendChild(renderHeader());
  container.appendChild(renderProfile());
  container.appendChild(renderFlows());
  container.appendChild(renderApm());
  container.appendChild(renderVisualization());
}

function renderHeader(): HTMLElement {
  const header = document.createElement('div');

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = store.file.name;
  nameInput.style.fontWeight = '600';
  nameInput.style.width = '100%';
  nameInput.style.marginBottom = '6px';
  nameInput.oninput = () => store.mutateQuiet(() => (store.file.name = nameInput.value));
  header.appendChild(nameInput);

  const env = document.createElement('div');
  env.className = 'albert-env-readout';
  env.textContent = `Env: ${store.activeEnvName ?? 'none'}`;
  header.appendChild(env);

  const bar = document.createElement('div');
  bar.className = 'albert-flow-toolbar';

  if (store.running) {
    const stopBtn = document.createElement('button');
    stopBtn.textContent = '■ Stop';
    stopBtn.onclick = () => store.stop();
    bar.appendChild(stopBtn);
  } else {
    const runBtn = document.createElement('button');
    runBtn.textContent = '▶ Run sim';
    runBtn.disabled = store.file.flows.filter((f) => f.enabled).length === 0;
    runBtn.onclick = () => store.run();
    bar.appendChild(runBtn);
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'secondary';
  addBtn.textContent = '+ Add flow';
  addBtn.disabled = store.running;
  addBtn.onclick = () =>
    store.mutate(() => store.file.flows.push({ id: genId('flow'), flowPath: '', targetTps: 10, enabled: true }));
  bar.appendChild(addBtn);

  header.appendChild(bar);
  return header;
}

function renderProfile(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'albert-sim-profile';

  const profileSel = document.createElement('select');
  for (const p of PROFILES) {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    if (p === store.file.profile.type) opt.selected = true;
    profileSel.appendChild(opt);
  }
  profileSel.onchange = () => store.mutate(() => (store.file.profile.type = profileSel.value as LoadProfile));

  const duration = numberField('Duration (s)', store.file.profile.durationSec, (v) =>
    store.mutateQuiet(() => (store.file.profile.durationSec = v))
  );
  const ramp = numberField('Ramp (s)', store.file.profile.rampUpSec ?? 0, (v) =>
    store.mutateQuiet(() => (store.file.profile.rampUpSec = v))
  );

  wrap.append(labeled('Profile', profileSel), duration, ramp);
  return wrap;
}

function renderFlows(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'albert-sim-flows';

  const title = document.createElement('div');
  title.className = 'albert-section-title';
  title.textContent = 'Flows & target TPS';
  wrap.appendChild(title);

  if (store.file.flows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'albert-empty';
    empty.textContent = 'No flows yet. Click "Add flow" and pick a .abf for each, with a target TPS.';
    wrap.appendChild(empty);
    return wrap;
  }

  store.file.flows.forEach((entry, index) => wrap.appendChild(renderFlowRow(entry, index)));
  return wrap;
}

function renderFlowRow(entry: SimFlowEntry, index: number): HTMLElement {
  const row = document.createElement('div');
  row.className = 'albert-sim-flow-row';

  const enabled = document.createElement('input');
  enabled.type = 'checkbox';
  enabled.checked = entry.enabled;
  enabled.title = 'enabled';
  enabled.onchange = () => store.mutate(() => (entry.enabled = enabled.checked));

  const flowPath = document.createElement('span');
  flowPath.className = 'albert-flow-req-path' + (entry.flowPath ? '' : ' missing');
  flowPath.textContent = entry.flowPath || '(no flow selected)';
  flowPath.style.flex = '1';

  const pickBtn = document.createElement('button');
  pickBtn.className = 'secondary';
  pickBtn.textContent = 'Pick flow…';
  pickBtn.onclick = () => store.pickFlow(entry.id);

  const tps = document.createElement('input');
  tps.type = 'number';
  tps.min = '1';
  tps.value = String(entry.targetTps);
  tps.title = 'target TPS';
  tps.style.width = '70px';
  tps.oninput = () => store.mutateQuiet(() => (entry.targetTps = Math.max(1, Number(tps.value) || 1)));

  const tpsLabel = document.createElement('span');
  tpsLabel.className = 'albert-sim-tps-label';
  tpsLabel.textContent = 'TPS';

  const del = document.createElement('button');
  del.className = 'secondary albert-icon-btn';
  del.textContent = '✕';
  del.onclick = () => store.mutate(() => store.file.flows.splice(index, 1));

  row.append(enabled, flowPath, pickBtn, tps, tpsLabel, del);
  return row;
}

function renderApm(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'albert-sim-apm';

  const title = document.createElement('div');
  title.className = 'albert-section-title';
  title.textContent = 'APM export';
  wrap.appendChild(title);

  const toggleRow = document.createElement('label');
  toggleRow.className = 'albert-flow-validate';
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = !!store.file.apm;
  toggle.onchange = () =>
    store.mutate(() => {
      store.file.apm = toggle.checked ? { provider: 'newrelic', region: 'US' } : undefined;
    });
  toggleRow.append(toggle, document.createTextNode(' Send results to New Relic after the run'));
  wrap.appendChild(toggleRow);

  if (store.file.apm) {
    const cfg = document.createElement('div');
    cfg.className = 'albert-row';

    const regionSel = document.createElement('select');
    for (const r of ['US', 'EU'] as const) {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r;
      if (r === store.file.apm.region) opt.selected = true;
      regionSel.appendChild(opt);
    }
    regionSel.onchange = () => store.mutate(() => store.file.apm && (store.file.apm.region = regionSel.value as 'US' | 'EU'));

    const keyBtn = document.createElement('button');
    keyBtn.className = 'secondary';
    keyBtn.textContent = store.hasApmKey ? 'Update API key' : 'Set API key';
    keyBtn.onclick = () => store.setApmKey();

    const status = document.createElement('span');
    status.className = 'albert-sim-apm-status ' + (store.hasApmKey ? 'ok' : 'missing');
    status.textContent = store.hasApmKey ? 'API key set' : 'No API key set';

    cfg.append(labeled('Region', regionSel), keyBtn, status);
    wrap.appendChild(cfg);
  }

  return wrap;
}

function renderVisualization(): HTMLElement {
  const wrap = document.createElement('div');
  const enabledFlows = store.file.flows.filter((f) => f.enabled);
  const hasResults = store.running || store.ticks.length > 0 || !!store.summary || !!store.error;
  if (enabledFlows.length === 0 && !hasResults) return wrap;

  // One switcher drives both the planned-load preview and the actual results.
  wrap.appendChild(renderViewSwitcher());

  if (enabledFlows.length > 0) wrap.appendChild(renderPreviewPanel(enabledFlows));
  if (hasResults) wrap.appendChild(renderResultsPanel());

  return wrap;
}

function renderPreviewPanel(enabledFlows: SimFlowEntry[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'albert-flow-results';

  const heading = document.createElement('div');
  heading.className = 'albert-section-title';
  heading.textContent = 'Planned load (preview)';
  wrap.appendChild(heading);

  if (store.resultView === 'xy') wrap.appendChild(renderPlannedXY(enabledFlows));
  else if (store.resultView === 'table') wrap.appendChild(renderPlannedTable(enabledFlows));
  else wrap.appendChild(renderPlannedSankey(enabledFlows));

  return wrap;
}

function renderResultsPanel(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'albert-flow-results';

  const heading = document.createElement('div');
  heading.className = 'albert-section-title';
  heading.textContent = store.running ? 'Live results (running…)' : 'Results';
  wrap.appendChild(heading);

  if (store.error) {
    const err = document.createElement('div');
    err.className = 'albert-response-status err';
    err.textContent = store.error;
    wrap.appendChild(err);
  }

  if (store.resultView === 'xy') wrap.appendChild(renderXYView());
  else if (store.resultView === 'table') wrap.appendChild(renderTableView());
  else wrap.appendChild(renderSankeyView());

  if (store.summary?.apmExport) {
    const apm = document.createElement('div');
    apm.className = 'albert-response-status ' + (store.summary.apmExport.ok ? 'ok' : 'err');
    apm.textContent = `APM (${store.summary.apmExport.provider}): ${store.summary.apmExport.message}`;
    wrap.appendChild(apm);
  }

  return wrap;
}

// ---- planned-load preview (derived from profile + target TPS, no run required) ----

function flowEntryLabel(entry: SimFlowEntry, index: number): string {
  if (!entry.flowPath) return `Flow ${index + 1}`;
  const base = entry.flowPath.split('/').pop() ?? entry.flowPath;
  return base.replace(/\.albert\.flow$/, '');
}

function renderPlannedXY(enabledFlows: SimFlowEntry[]): HTMLElement {
  const wrap = document.createElement('div');
  const plans = enabledFlows.map((e) => planLoad(store.file.profile, e.targetTps));
  const maxDuration = Math.max(1, ...plans.map(totalDurationSec));

  const series: LineSeries[] = enabledFlows.map((entry, i) => ({
    name: flowEntryLabel(entry, i),
    color: PALETTE[i % PALETTE.length],
    values: sampleRateCurve(plans[i]).map((p) => p.rate),
  }));
  wrap.appendChild(lineChart('Planned throughput over time (req/s)', series, { yFormat: (n) => `${Math.round(n)}` }));

  const note = document.createElement('div');
  note.className = 'albert-env-readout';
  note.textContent = `Profile: ${store.file.profile.type} · ~${maxDuration}s · combined target ${enabledFlows.reduce((s, f) => s + f.targetTps, 0)} req/s`;
  wrap.appendChild(note);
  return wrap;
}

function renderPlannedSankey(enabledFlows: SimFlowEntry[]): HTMLElement {
  const wrap = document.createElement('div');
  const planned = enabledFlows.map((e) => plannedRequests(planLoad(store.file.profile, e.targetTps)));
  const total = planned.reduce((s, n) => s + n, 0);

  if (total === 0) {
    const empty = document.createElement('div');
    empty.className = 'albert-empty';
    empty.textContent = 'Set a target TPS and duration to preview the planned load distribution.';
    wrap.appendChild(empty);
    return wrap;
  }

  const rootNode: SankeyNode = { id: 'root', label: `Planned total (${total})`, value: total, color: '#888' };
  const flowNodes: SankeyNode[] = enabledFlows.map((entry, i) => ({
    id: `flow:${entry.id}`,
    label: `${flowEntryLabel(entry, i)} (${planned[i]})`,
    value: planned[i],
    color: PALETTE[i % PALETTE.length],
  }));
  const links: SankeyLink[] = enabledFlows.map((entry, i) => ({ source: 'root', target: `flow:${entry.id}`, value: planned[i] }));

  wrap.appendChild(sankeyChart('Planned request distribution', [[rootNode], flowNodes], links));
  return wrap;
}

function renderPlannedTable(enabledFlows: SimFlowEntry[]): HTMLElement {
  const wrap = document.createElement('div');
  const table = document.createElement('table');
  table.className = 'albert-sim-summary';
  table.innerHTML = `<thead><tr>
    <th>Flow</th><th>Target TPS</th><th>Profile</th><th>Duration</th><th>Planned requests</th>
  </tr></thead>`;
  const tbody = document.createElement('tbody');
  enabledFlows.forEach((entry, i) => {
    const plan = planLoad(store.file.profile, entry.targetTps);
    const tr = document.createElement('tr');
    for (const c of [
      flowEntryLabel(entry, i),
      String(entry.targetTps),
      store.file.profile.type,
      `${totalDurationSec(plan)}s`,
      `~${plannedRequests(plan)}`,
    ]) {
      const td = document.createElement('td');
      td.textContent = c;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function renderViewSwitcher(): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'albert-sim-view-switcher';
  const views: { id: 'xy' | 'sankey' | 'table'; label: string }[] = [
    { id: 'xy', label: 'XY chart' },
    { id: 'sankey', label: 'Sankey' },
    { id: 'table', label: 'Table' },
  ];
  for (const v of views) {
    const btn = document.createElement('button');
    btn.textContent = v.label;
    btn.className = store.resultView === v.id ? '' : 'secondary';
    btn.onclick = () => store.setResultView(v.id);
    bar.appendChild(btn);
  }
  return bar;
}

/** Per-flow summary data for the table/sankey views: the final summary if present, otherwise derived
 *  live from the accumulated ticks so the views work mid-run too. */
function effectiveScenarios(): SimScenarioSummary[] {
  if (store.summary) return store.summary.scenarios;
  const keys = scenarioKeys();
  const elapsed = Math.max(1, store.ticks.length);
  return keys.map((key) => {
    const meta = store.scenarios.find((s) => s.key === key);
    let totalReqs = 0;
    let errors = 0;
    let lastP95 = 0;
    for (const t of store.ticks) {
      const sc = t.scenarios.find((s) => s.key === key);
      if (!sc) continue;
      totalReqs += sc.reqs;
      errors += sc.reqs * sc.errorRate;
      if (sc.p95) lastP95 = sc.p95;
    }
    return {
      key,
      label: store.scenarioLabel(key),
      targetTps: meta?.targetTps ?? 0,
      achievedTps: totalReqs / elapsed,
      totalReqs,
      errorRate: totalReqs > 0 ? errors / totalReqs : 0,
      p50: 0,
      p95: lastP95,
      p99: 0,
      checksPassed: 0,
      checksTotal: 0,
    };
  });
}

function renderXYView(): HTMLElement {
  const wrap = document.createElement('div');
  const keys = scenarioKeys();

  const tpsSeries: LineSeries[] = keys.map((key, i) => ({
    name: store.scenarioLabel(key),
    color: PALETTE[i % PALETTE.length],
    values: store.ticks.map((t) => t.scenarios.find((s) => s.key === key)?.tps ?? 0),
  }));
  wrap.appendChild(lineChart('Throughput (req/s)', tpsSeries, { yLabel: 'req/s' }));

  const latSeries: LineSeries[] = keys.map((key, i) => ({
    name: store.scenarioLabel(key),
    color: PALETTE[i % PALETTE.length],
    values: store.ticks.map((t) => t.scenarios.find((s) => s.key === key)?.p95 ?? 0),
  }));
  wrap.appendChild(lineChart('p95 latency (ms)', latSeries, { yFormat: (n) => `${Math.round(n)}` }));

  const errSeries: LineSeries[] = keys.map((key, i) => ({
    name: store.scenarioLabel(key),
    color: PALETTE[i % PALETTE.length],
    values: store.ticks.map((t) => (t.scenarios.find((s) => s.key === key)?.errorRate ?? 0) * 100),
  }));
  wrap.appendChild(lineChart('Error rate (%)', errSeries, { yMax: 100, yFormat: (n) => `${Math.round(n)}%` }));

  const scenarios = effectiveScenarios();
  if (scenarios.length) {
    const charts = document.createElement('div');
    charts.className = 'albert-sim-summary-charts';
    charts.appendChild(
      barChart(
        'Achieved TPS by flow',
        scenarios.map((sc, i) => ({ label: sc.label, value: sc.achievedTps, color: PALETTE[i % PALETTE.length] })),
        (n) => n.toFixed(1)
      )
    );
    charts.appendChild(
      barChart(
        'p95 latency by flow (ms)',
        scenarios.map((sc, i) => ({ label: sc.label, value: sc.p95, color: PALETTE[i % PALETTE.length] })),
        (n) => `${Math.round(n)}`
      )
    );
    wrap.appendChild(charts);
  }

  return wrap;
}

function renderTableView(): HTMLElement {
  const wrap = document.createElement('div');
  const scenarios = effectiveScenarios();

  if (scenarios.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'albert-empty';
    empty.textContent = 'No data yet.';
    wrap.appendChild(empty);
    return wrap;
  }

  const table = document.createElement('table');
  table.className = 'albert-sim-summary';
  table.innerHTML = `<thead><tr>
    <th>Flow</th><th>Target TPS</th><th>Achieved</th><th>Requests</th>
    <th>Errors</th><th>p50</th><th>p95</th><th>p99</th><th>Checks</th>
  </tr></thead>`;
  const tbody = document.createElement('tbody');
  scenarios.forEach((sc) => tbody.appendChild(summaryRow(sc)));
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

/** Sankey of load distribution: Total → each flow (by request count) → Success / Error outcome. */
function renderSankeyView(): HTMLElement {
  const wrap = document.createElement('div');
  const scenarios = effectiveScenarios();
  const totalReqs = scenarios.reduce((s, sc) => s + sc.totalReqs, 0);

  if (totalReqs === 0) {
    const empty = document.createElement('div');
    empty.className = 'albert-empty';
    empty.textContent = 'No requests recorded yet — the Sankey appears once load is flowing.';
    wrap.appendChild(empty);
    return wrap;
  }

  const okColor = 'var(--vscode-testing-iconPassed, #2cbb4b)';
  const errColor = 'var(--vscode-testing-iconFailed, #d9534f)';

  const rootNode: SankeyNode = { id: 'root', label: 'Total load', value: totalReqs, color: '#888' };
  const flowNodes: SankeyNode[] = scenarios.map((sc, i) => ({
    id: `flow:${sc.key}`,
    label: `${sc.label} (${sc.totalReqs})`,
    value: sc.totalReqs,
    color: PALETTE[i % PALETTE.length],
  }));

  const totalErrors = scenarios.reduce((s, sc) => s + sc.totalReqs * sc.errorRate, 0);
  const outcomeNodes: SankeyNode[] = [
    { id: 'ok', label: `Success (${Math.round(totalReqs - totalErrors)})`, value: totalReqs - totalErrors, color: okColor },
    { id: 'err', label: `Error (${Math.round(totalErrors)})`, value: totalErrors, color: errColor },
  ].filter((n) => n.value > 0);

  const links: SankeyLink[] = [];
  for (const sc of scenarios) {
    links.push({ source: 'root', target: `flow:${sc.key}`, value: sc.totalReqs });
    const errs = sc.totalReqs * sc.errorRate;
    if (sc.totalReqs - errs > 0) links.push({ source: `flow:${sc.key}`, target: 'ok', value: sc.totalReqs - errs });
    if (errs > 0) links.push({ source: `flow:${sc.key}`, target: 'err', value: errs });
  }

  wrap.appendChild(sankeyChart('Load distribution (requests)', [[rootNode], flowNodes, outcomeNodes], links));
  return wrap;
}

function summaryRow(sc: SimScenarioSummary): HTMLElement {
  const tr = document.createElement('tr');
  const cells = [
    sc.label,
    String(sc.targetTps),
    sc.achievedTps.toFixed(1),
    String(sc.totalReqs),
    `${(sc.errorRate * 100).toFixed(1)}%`,
    `${Math.round(sc.p50)}`,
    `${Math.round(sc.p95)}`,
    `${Math.round(sc.p99)}`,
    sc.checksTotal > 0 ? `${sc.checksPassed}/${sc.checksTotal}` : '—',
  ];
  for (const c of cells) {
    const td = document.createElement('td');
    td.textContent = c;
    tr.appendChild(td);
  }
  if (sc.errorRate > 0) tr.classList.add('err');
  return tr;
}

function scenarioKeys(): string[] {
  if (store.scenarios.length) return store.scenarios.map((s) => s.key);
  const keys = new Set<string>();
  for (const t of store.ticks) for (const s of t.scenarios) keys.add(s.key);
  return [...keys];
}

function numberField(label: string, value: number, onChange: (v: number) => void): HTMLElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.value = String(value);
  input.style.width = '80px';
  input.oninput = () => onChange(Math.max(0, Number(input.value) || 0));
  return labeled(label, input);
}

function labeled(label: string, control: HTMLElement): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'albert-sim-field';
  const span = document.createElement('span');
  span.textContent = label;
  wrap.append(span, control);
  return wrap;
}
