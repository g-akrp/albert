import { createDefaultSimProfile, SimFlowEntry, SimScenarioSummary } from '../../model/types';
import {
  combinedSpanSec,
  planLoad,
  plannedRequests,
  sampleScheduledCurve,
  ScheduledPlan,
  sumScheduledCurves,
  totalDurationSec,
} from '../../model/loadProfile';
import { barChart, lineChart, LineSeries, PALETTE, sankeyChart, SankeyLink, SankeyNode } from './charts';
import { genId, store } from './state';

export function renderSim(container: HTMLElement): void {
  container.innerHTML = '';
  container.appendChild(renderHeader());
  container.appendChild(renderTabBar());

  if (store.activeTab === 'configure') {
    container.appendChild(renderPlannedPreview());
    container.appendChild(renderFlows());
    container.appendChild(renderApm());
    container.appendChild(renderStreaming());
  } else {
    container.appendChild(renderExecutionReport());
  }
}

function renderTabBar(): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'albert-tabs';

  const tabs: { id: 'configure' | 'report'; label: string }[] = [
    { id: 'configure', label: 'Configure' },
    { id: 'report', label: 'Execution Report' },
  ];
  for (const t of tabs) {
    const el = document.createElement('div');
    el.className = 'albert-tab' + (store.activeTab === t.id ? ' active' : '');
    el.textContent = t.label;
    el.onclick = () => store.setActiveTab(t.id);
    bar.appendChild(el);
  }
  return bar;
}

function renderHeader(): HTMLElement {
  const header = document.createElement('div');

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = store.file.name;
  nameInput.disabled = store.running;
  nameInput.style.fontWeight = '600';
  nameInput.style.width = '100%';
  nameInput.style.marginBottom = '6px';
  nameInput.oninput = () => store.mutateQuiet(() => (store.file.name = nameInput.value));
  header.appendChild(nameInput);

  header.appendChild(renderEnvBadge());

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

  header.appendChild(bar);
  return header;
}

function renderEnvBadge(): HTMLElement {
  const hasEnv = !!store.activeEnvName;
  const envBadge = document.createElement('div');
  envBadge.className = 'albert-env-badge';
  envBadge.style.cssText =
    'display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;border:1px solid var(--albert-border);background:var(--vscode-editorWidget-background,rgba(128,128,128,0.08));margin-bottom:8px';
  const envDot = document.createElement('span');
  envDot.style.cssText = `width:6px;height:6px;border-radius:50%;background:${hasEnv ? 'var(--albert-ok,#2cbb4b)' : 'var(--albert-muted,#808080)'}`;
  const envText = document.createElement('span');
  envText.textContent = hasEnv ? `Env: ${store.activeEnvName}` : 'No environment';
  envText.style.color = hasEnv ? 'var(--vscode-foreground)' : 'var(--albert-muted)';
  envBadge.append(envDot, envText);
  return envBadge;
}

function renderFlows(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'albert-sim-flows';

  const titleRow = document.createElement('div');
  titleRow.style.display = 'flex';
  titleRow.style.alignItems = 'center';
  titleRow.style.justifyContent = 'space-between';
  titleRow.style.marginBottom = '6px';

  const title = document.createElement('div');
  title.className = 'albert-section-title';
  title.style.marginBottom = '0';
  title.textContent = 'Flows & load pattern';
  titleRow.appendChild(title);

  const addBtn = document.createElement('button');
  addBtn.className = 'secondary';
  addBtn.textContent = '+ Add flow';
  addBtn.disabled = store.running;
  addBtn.onclick = () =>
    store.mutate(() =>
      store.file.flows.push({
        id: genId('flow'),
        flowPath: '',
        targetTps: 10,
        profile: createDefaultSimProfile(),
        startAtSec: 0,
        enabled: true,
      })
    );
  titleRow.appendChild(addBtn);

  wrap.appendChild(titleRow);

  if (store.file.flows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'albert-empty';
    empty.textContent = 'No flows yet. Click "Add flow" and pick a .abf for each, with its own target TPS, profile, duration and ramp.';
    wrap.appendChild(empty);
    return wrap;
  }

  store.file.flows.forEach((entry, index) => wrap.appendChild(renderFlowCard(entry, index)));
  return wrap;
}

function renderFlowCard(entry: SimFlowEntry, index: number): HTMLElement {
  const locked = store.running;
  const card = document.createElement('div');
  card.className = 'albert-sim-flow-card';

  const top = document.createElement('div');
  top.className = 'albert-sim-flow-row';

  const enabled = document.createElement('input');
  enabled.type = 'checkbox';
  enabled.checked = entry.enabled;
  enabled.disabled = locked;
  enabled.title = 'enabled';
  enabled.onchange = () => store.mutate(() => (entry.enabled = enabled.checked));

  const flowPath = document.createElement('span');
  flowPath.className = 'albert-flow-req-path' + (entry.flowPath ? '' : ' missing');
  flowPath.textContent = entry.flowPath || '(no flow selected)';
  flowPath.style.flex = '1';

  const pickBtn = document.createElement('button');
  pickBtn.className = 'secondary';
  pickBtn.disabled = locked;
  pickBtn.textContent = 'Pick flow…';
  pickBtn.onclick = () => store.pickFlow(entry.id);

  const del = document.createElement('button');
  del.className = 'secondary albert-icon-btn';
  del.disabled = locked;
  del.textContent = '✕';
  del.onclick = () => store.mutate(() => store.file.flows.splice(index, 1));

  top.append(enabled, flowPath, pickBtn, del);

  const fields = document.createElement('div');
  fields.className = 'albert-sim-flow-fields';

  const startAt = durationField('Start at', entry.startAtSec, (v) => store.mutateQuiet(() => (entry.startAtSec = v)), locked);
  const tps = numberField('Target TPS', entry.targetTps, (v) => store.mutateQuiet(() => (entry.targetTps = Math.max(1, v || 1))), locked, 1);
  const rampUp = durationField('Ramp up', entry.profile.rampUpSec, (v) => store.mutateQuiet(() => (entry.profile.rampUpSec = v)), locked);
  const hold = durationField('Hold', entry.profile.holdSec, (v) => store.mutateQuiet(() => (entry.profile.holdSec = v)), locked);
  const rampDown = durationField('Ramp down', entry.profile.rampDownSec, (v) => store.mutateQuiet(() => (entry.profile.rampDownSec = v)), locked);

  const total = document.createElement('span');
  total.className = 'albert-sim-total-label';
  const updateTotal = () =>
    (total.textContent = `Ends at: ${formatDurationSec(entry.startAtSec + entry.profile.rampUpSec + entry.profile.holdSec + entry.profile.rampDownSec)}`);
  updateTotal();
  for (const field of [startAt, rampUp, hold, rampDown]) {
    field.querySelector('input')?.addEventListener('input', updateTotal);
  }

  fields.append(startAt, tps, rampUp, hold, rampDown, total);

  card.append(top, fields);
  return card;
}

function renderApm(): HTMLElement {
  const locked = store.running;
  const enabled = !!store.file.apm;

  const panel = document.createElement('div');
  panel.className = 'albert-sim-apm-panel' + (enabled ? ' on' : '');

  const header = document.createElement('div');
  header.className = 'albert-sim-apm-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'albert-sim-apm-title';
  const title = document.createElement('div');
  title.className = 'albert-section-title';
  title.style.marginBottom = '0';
  title.textContent = 'New Relic export';
  const subtitle = document.createElement('div');
  subtitle.className = 'albert-env-readout';
  subtitle.style.margin = '0';
  subtitle.textContent = 'Send per-flow metrics to New Relic after the run finishes.';
  titleWrap.append(title, subtitle);

  const toggleLabel = document.createElement('label');
  toggleLabel.className = 'albert-sim-apm-toggle';
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = enabled;
  toggle.disabled = locked;
  toggle.onchange = () =>
    store.mutate(() => {
      store.file.apm = toggle.checked ? { provider: 'newrelic', region: 'US' } : undefined;
    });
  toggleLabel.append(toggle, document.createTextNode(' Enabled'));

  header.append(titleWrap, toggleLabel);
  panel.appendChild(header);

  if (store.file.apm) {
    const body = document.createElement('div');
    body.className = 'albert-sim-apm-body';

    const regionSel = document.createElement('select');
    regionSel.disabled = locked;
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
    keyBtn.disabled = locked;
    keyBtn.textContent = store.hasApmKey ? 'Update API key' : 'Set API key';
    keyBtn.onclick = () => store.setApmKey();

    const status = document.createElement('span');
    status.className = 'albert-sim-apm-status ' + (store.hasApmKey ? 'ok' : 'missing');
    const statusDot = document.createElement('span');
    statusDot.className = 'albert-sim-apm-status-dot';
    status.append(statusDot, document.createTextNode(store.hasApmKey ? 'API key set' : 'No API key set'));

    body.append(labeled('Provider', readonlyText('New Relic')), labeled('Region', regionSel), keyBtn, status);
    panel.appendChild(body);
  }

  return panel;
}

function renderStreaming(): HTMLElement {
  const locked = store.running;
  const enabled = !!store.file.streaming;

  const panel = document.createElement('div');
  panel.className = 'albert-sim-apm-panel' + (enabled ? ' on' : '');

  const header = document.createElement('div');
  header.className = 'albert-sim-apm-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'albert-sim-apm-title';
  const title = document.createElement('div');
  title.className = 'albert-section-title';
  title.style.marginBottom = '0';
  title.textContent = 'Stream to Grafana';
  const subtitle = document.createElement('div');
  subtitle.className = 'albert-env-readout';
  subtitle.style.margin = '0';
  subtitle.textContent = 'Stream live k6 metrics to InfluxDB while the sim run.';
  titleWrap.append(title, subtitle);

  const toggleLabel = document.createElement('label');
  toggleLabel.className = 'albert-sim-apm-toggle';
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = enabled;
  toggle.disabled = locked;
  toggle.onchange = () =>
    store.mutate(() => {
      store.file.streaming = toggle.checked ? { provider: 'influxdb', url: 'http://localhost:8086/k6' } : undefined;
    });
  toggleLabel.append(toggle, document.createTextNode(' Enabled'));

  header.append(titleWrap, toggleLabel);
  panel.appendChild(header);

  if (store.file.streaming) {
    const body = document.createElement('div');
    body.className = 'albert-sim-apm-body';

    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.value = store.file.streaming.url;
    urlInput.disabled = locked;
    urlInput.placeholder = 'http://localhost:8086/k6';
    urlInput.style.width = '220px';
    urlInput.oninput = () => store.mutateQuiet(() => store.file.streaming && (store.file.streaming.url = urlInput.value));

    body.append(labeled('Provider', readonlyText('InfluxDB')), labeled('URL', urlInput));
    panel.appendChild(body);
  }

  return panel;
}

function readonlyText(value: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'albert-sim-apm-readonly';
  span.textContent = value;
  return span;
}

function renderPlannedPreview(): HTMLElement {
  const wrap = document.createElement('div');
  const enabledFlows = store.file.flows.filter((f) => f.enabled);
  if (enabledFlows.length === 0) return wrap;

  wrap.className = 'albert-flow-results';

  const headingRow = document.createElement('div');
  headingRow.className = 'albert-sim-preview-heading';

  const heading = document.createElement('div');
  heading.className = 'albert-section-title';
  heading.style.marginBottom = '0';
  heading.textContent = 'Planned load (preview)';
  headingRow.appendChild(heading);

  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'secondary';
  refreshBtn.textContent = '↻ Refresh preview';
  refreshBtn.title = 'Recompute the preview from the current field values';
  refreshBtn.onclick = () => store.refresh();
  headingRow.appendChild(refreshBtn);

  wrap.appendChild(headingRow);

  wrap.appendChild(renderSimGrid(renderPlannedXY(enabledFlows), renderPlannedSankey(enabledFlows), renderPlannedTable(enabledFlows)));
  return wrap;
}

function renderExecutionReport(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'albert-flow-results';
  const hasResults = store.running || store.ticks.length > 0 || !!store.summary || !!store.error;

  const heading = document.createElement('div');
  heading.className = 'albert-section-title';
  heading.textContent = store.running ? 'Execution report (running…)' : 'Execution report';
  wrap.appendChild(heading);

  if (!hasResults) {
    const empty = document.createElement('div');
    empty.className = 'albert-empty';
    empty.textContent = 'Run the sim from the Configure tab to see results here.';
    wrap.appendChild(empty);
    return wrap;
  }

  if (store.error) {
    const err = document.createElement('div');
    err.className = 'albert-response-status err';
    err.textContent = store.error;
    wrap.appendChild(err);
  }

  wrap.appendChild(renderSimGrid(renderXYView(), renderSankeyView(), renderTableView()));

  if (store.summary?.apmExport) {
    const apm = document.createElement('div');
    apm.className = 'albert-response-status ' + (store.summary.apmExport.ok ? 'ok' : 'err');
    apm.textContent = `APM (${store.summary.apmExport.provider}): ${store.summary.apmExport.message}`;
    wrap.appendChild(apm);
  }

  if (store.ablogPath) {
    const logNote = document.createElement('div');
    logNote.className = 'albert-env-readout';
    logNote.textContent = `Log saved to ${store.ablogPath}`;
    wrap.appendChild(logNote);
  }

  return wrap;
}

/** Fixed layout shared by the planned-load preview and the execution report: XY top-left, Sankey
 *  top-right, table spanning the full width underneath. */
function renderSimGrid(xy: HTMLElement, sankey: HTMLElement, table: HTMLElement): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'albert-sim-grid';

  const top = document.createElement('div');
  top.className = 'albert-sim-grid-top';
  top.append(xy, sankey);

  wrap.append(top, table);
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
  const scheduled: ScheduledPlan[] = enabledFlows.map((e) => ({ plan: planLoad(e.profile, e.targetTps), startAtSec: e.startAtSec }));
  const span = combinedSpanSec(scheduled);

  const series: LineSeries[] = enabledFlows.map((entry, i) => ({
    name: flowEntryLabel(entry, i),
    color: PALETTE[i % PALETTE.length],
    values: sampleScheduledCurve(scheduled[i], span).map((p) => p.rate),
  }));
  if (enabledFlows.length > 1) {
    series.push({
      name: 'Total',
      color: '#888888',
      dashed: true,
      values: sumScheduledCurves(scheduled, span).map((p) => p.rate),
    });
  }
  wrap.appendChild(lineChart('Planned throughput over time (req/s)', series, { yFormat: (n) => `${Math.round(n)}`, xMax: span }));

  const note = document.createElement('div');
  note.className = 'albert-env-readout';
  note.textContent = `~${formatDurationSec(span)} sim span · combined target ${enabledFlows.reduce((s, f) => s + f.targetTps, 0)} req/s`;
  wrap.appendChild(note);
  return wrap;
}

function renderPlannedSankey(enabledFlows: SimFlowEntry[]): HTMLElement {
  const wrap = document.createElement('div');
  const planned = enabledFlows.map((e) => plannedRequests(planLoad(e.profile, e.targetTps)));
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
    <th>Flow</th><th>Start at</th><th>Target TPS</th><th>Ramp up</th><th>Hold</th><th>Ramp down</th><th>Ends at</th><th>Planned requests</th>
  </tr></thead>`;
  const tbody = document.createElement('tbody');
  const plans = enabledFlows.map((e) => planLoad(e.profile, e.targetTps));
  enabledFlows.forEach((entry, i) => {
    const plan = plans[i];
    const tr = document.createElement('tr');
    for (const c of [
      flowEntryLabel(entry, i),
      formatDurationSec(entry.startAtSec),
      String(entry.targetTps),
      formatDurationSec(entry.profile.rampUpSec),
      formatDurationSec(entry.profile.holdSec),
      formatDurationSec(entry.profile.rampDownSec),
      formatDurationSec(entry.startAtSec + totalDurationSec(plan)),
      `~${plannedRequests(plan)}`,
    ]) {
      const td = document.createElement('td');
      td.textContent = c;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  const totalTps = enabledFlows.reduce((s, f) => s + f.targetTps, 0);
  const span = combinedSpanSec(enabledFlows.map((e, i) => ({ plan: plans[i], startAtSec: e.startAtSec })));
  const totalPlanned = plans.reduce((s, p) => s + plannedRequests(p), 0);

  const tfoot = document.createElement('tfoot');
  const totalRow = document.createElement('tr');
  totalRow.className = 'albert-sim-summary-total';
  for (const c of ['Total', '—', String(totalTps), '—', '—', '—', formatDurationSec(span), `~${totalPlanned}`]) {
    const td = document.createElement('td');
    td.textContent = c;
    totalRow.appendChild(td);
  }
  tfoot.appendChild(totalRow);
  table.appendChild(tfoot);

  wrap.appendChild(table);
  return wrap;
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

  const xMax = store.ticks.length ? store.ticks[store.ticks.length - 1].tSec : 0;

  const tpsSeries: LineSeries[] = keys.map((key, i) => ({
    name: store.scenarioLabel(key),
    color: PALETTE[i % PALETTE.length],
    values: store.ticks.map((t) => t.scenarios.find((s) => s.key === key)?.tps ?? 0),
  }));
  wrap.appendChild(lineChart('Throughput (req/s)', tpsSeries, { yLabel: 'req/s', xMax }));

  const latSeries: LineSeries[] = keys.map((key, i) => ({
    name: store.scenarioLabel(key),
    color: PALETTE[i % PALETTE.length],
    values: store.ticks.map((t) => t.scenarios.find((s) => s.key === key)?.p95 ?? 0),
  }));
  wrap.appendChild(lineChart('p95 latency (ms)', latSeries, { yFormat: (n) => `${Math.round(n)}`, xMax }));

  const errSeries: LineSeries[] = keys.map((key, i) => ({
    name: store.scenarioLabel(key),
    color: PALETTE[i % PALETTE.length],
    values: store.ticks.map((t) => (t.scenarios.find((s) => s.key === key)?.errorRate ?? 0) * 100),
  }));
  wrap.appendChild(lineChart('Error rate (%)', errSeries, { yMax: 100, yFormat: (n) => `${Math.round(n)}%`, xMax }));

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

function numberField(label: string, value: number, onChange: (v: number) => void, disabled = false, min = 0): HTMLElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.min = String(min);
  input.value = String(value);
  input.disabled = disabled;
  input.style.width = '80px';
  input.oninput = () => onChange(Math.max(min, Number(input.value) || 0));
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

/** Parses a duration like "30s", "10m", "1h", or a compound "1h 12m 30s"; a bare number is seconds. */
export function parseDurationSec(text: string): number | null {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return null;
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) return Math.max(0, Math.round(parseFloat(trimmed)));

  let total = 0;
  for (const token of trimmed.split(/\s+/)) {
    const m = token.match(/^(\d+(?:\.\d+)?)(h|m|s)$/);
    if (!m) return null;
    const value = parseFloat(m[1]);
    total += m[2] === 'h' ? value * 3600 : m[2] === 'm' ? value * 60 : value;
  }
  return Math.max(0, Math.round(total));
}

/** Formats a duration in seconds as a compound "1h 12m 30s" string, omitting zero components
 *  (e.g. 90 -> "1m 30s", 3600 -> "1h"); zero itself renders as "0s". */
export function formatDurationSec(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (sec > 0 || parts.length === 0) parts.push(`${sec}s`);
  return parts.join(' ');
}

/** A text field accepting durations as "30s", "10m", "1h", or a compound "1h 12m 30s"; normalizes
 *  its display on blur. */
function durationField(label: string, value: number, onChange: (v: number) => void, disabled = false): HTMLElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = formatDurationSec(value);
  input.disabled = disabled;
  input.placeholder = '1h 12m 30s';
  input.title = 'Enter a duration like 30s, 10m, 1h, or a compound 1h 12m 30s';
  input.style.width = '90px';

  let lastValid = value;
  input.oninput = () => {
    const parsed = parseDurationSec(input.value);
    if (parsed !== null) {
      lastValid = parsed;
      onChange(parsed);
    }
  };
  input.onblur = () => {
    input.value = formatDurationSec(lastValid);
  };
  return labeled(label, input);
}
