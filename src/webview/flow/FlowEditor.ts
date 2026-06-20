import { FlowCapture, FlowRunHistoryEntry, FlowStep } from '../../model/types';
import { renderRunResultBody, renderStepResult } from '../components/flowResults';
import { genId, store } from './state';

const CAPTURE_SOURCES: FlowCapture['source'][] = ['body', 'header', 'status'];

export function renderFlow(container: HTMLElement): void {
  container.innerHTML = '';
  container.appendChild(renderHeader());
  container.appendChild(renderSteps());
  container.appendChild(renderResults());
  container.appendChild(renderHistory());
}

function renderHeader(): HTMLElement {
  const header = document.createElement('div');
  header.id = 'akrp-flow-header';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = store.file.name;
  nameInput.style.fontWeight = '600';
  nameInput.style.width = '100%';
  nameInput.style.marginBottom = '6px';
  nameInput.oninput = () => store.mutateQuiet(() => (store.file.name = nameInput.value));
  header.appendChild(nameInput);

  const env = document.createElement('div');
  env.className = 'akrp-env-readout';
  env.textContent = `Env: ${store.activeEnvName ?? 'none'}`;
  header.appendChild(env);

  const bar = document.createElement('div');
  bar.className = 'akrp-flow-toolbar';

  const runBtn = document.createElement('button');
  if (store.running) {
    runBtn.textContent = '■ Stop';
    runBtn.className = 'secondary';
    runBtn.onclick = () => store.stop();
  } else {
    runBtn.textContent = '▶ Run flow';
    runBtn.disabled = store.file.steps.filter((s) => s.enabled).length === 0;
    runBtn.onclick = () => store.run();
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'secondary';
  addBtn.textContent = '+ Add step';
  addBtn.onclick = () =>
    store.mutate(() =>
      store.file.steps.push({ id: genId('step'), name: `Step ${store.file.steps.length + 1}`, requestPath: '', enabled: true, validate: true, captures: [] })
    );

  bar.append(runBtn, addBtn);
  header.appendChild(bar);
  return header;
}

function renderSteps(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'akrp-flow-steps';

  if (store.file.steps.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'akrp-empty';
    empty.textContent = 'No steps yet. Click "Add step" and pick a .abrq request for each.';
    wrap.appendChild(empty);
    return wrap;
  }

  store.file.steps.forEach((step, index) => wrap.appendChild(renderStepCard(step, index)));
  return wrap;
}

function renderStepCard(step: FlowStep, index: number): HTMLElement {
  const card = document.createElement('div');
  card.className = 'akrp-flow-step' + (step.enabled ? '' : ' disabled');

  const top = document.createElement('div');
  top.className = 'akrp-flow-step-top';

  const num = document.createElement('span');
  num.className = 'akrp-flow-step-num';
  num.textContent = String(index + 1);

  const enabled = checkbox(step.enabled, (v) => store.mutate(() => (step.enabled = v)), 'enabled');

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = step.name;
  nameInput.placeholder = 'Step name';
  nameInput.style.flex = '1';
  nameInput.oninput = () => store.mutateQuiet(() => (step.name = nameInput.value));

  const up = iconBtn('▲', index === 0, () => moveStep(index, -1));
  const down = iconBtn('▼', index === store.file.steps.length - 1, () => moveStep(index, 1));
  const del = iconBtn('✕', false, () => store.mutate(() => store.file.steps.splice(index, 1)));

  top.append(num, enabled, nameInput, up, down, del);
  card.appendChild(top);

  // request path row
  const reqRow = document.createElement('div');
  reqRow.className = 'akrp-flow-req-row';
  const reqPath = document.createElement('span');
  reqPath.className = 'akrp-flow-req-path' + (step.requestPath ? '' : ' missing');
  reqPath.textContent = step.requestPath || '(no request selected)';
  const pickBtn = document.createElement('button');
  pickBtn.className = 'secondary';
  pickBtn.textContent = 'Pick request…';
  pickBtn.onclick = () => store.pickRequest(step.id);
  reqRow.append(reqPath, pickBtn);
  card.appendChild(reqRow);

  // validate toggle
  const valRow = document.createElement('label');
  valRow.className = 'akrp-flow-validate';
  const valBox = document.createElement('input');
  valBox.type = 'checkbox';
  valBox.checked = step.validate;
  valBox.onchange = () => store.mutate(() => (step.validate = valBox.checked));
  valRow.append(valBox, document.createTextNode(' Run this request’s validations (expect + schema) as checks'));
  card.appendChild(valRow);

  card.appendChild(renderCaptures(step));
  return card;
}

function renderCaptures(step: FlowStep): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'akrp-flow-captures';

  const title = document.createElement('div');
  title.className = 'akrp-flow-captures-title';
  title.textContent = 'Captures (reuse as {{variable}} in later steps)';
  wrap.appendChild(title);

  step.captures.forEach((cap, ci) => {
    const row = document.createElement('div');
    row.className = 'akrp-kv-row';

    const varInput = document.createElement('input');
    varInput.type = 'text';
    varInput.placeholder = 'variable';
    varInput.value = cap.variable;
    varInput.oninput = () => store.mutateQuiet(() => (cap.variable = varInput.value));

    const sourceSel = document.createElement('select');
    for (const src of CAPTURE_SOURCES) {
      const opt = document.createElement('option');
      opt.value = src;
      opt.textContent = src;
      if (src === cap.source) opt.selected = true;
      sourceSel.appendChild(opt);
    }
    sourceSel.onchange = () => store.mutate(() => (cap.source = sourceSel.value as FlowCapture['source']));

    const pathInput = document.createElement('input');
    pathInput.type = 'text';
    pathInput.placeholder = cap.source === 'header' ? 'header name' : cap.source === 'body' ? 'body path e.g. data.token' : '(status)';
    pathInput.value = cap.path ?? '';
    pathInput.disabled = cap.source === 'status';
    pathInput.oninput = () => store.mutateQuiet(() => (cap.path = pathInput.value));

    const del = iconBtn('✕', false, () => store.mutate(() => step.captures.splice(ci, 1)));

    row.append(varInput, sourceSel, pathInput, del);
    wrap.appendChild(row);
  });

  const addCap = document.createElement('button');
  addCap.className = 'secondary akrp-flow-add-capture';
  addCap.textContent = '+ Add capture';
  addCap.onclick = () => store.mutate(() => step.captures.push({ variable: '', source: 'body', path: '' }));
  wrap.appendChild(addCap);

  return wrap;
}

function renderResults(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'akrp-flow-results';

  if (!store.running && store.stepResults.length === 0 && !store.lastRun) return wrap;

  const heading = document.createElement('div');
  heading.className = 'akrp-section-title';
  heading.textContent = store.running ? 'Run results (running…)' : 'Run results';
  wrap.appendChild(heading);

  if (store.lastRun?.error) {
    const err = document.createElement('div');
    err.className = 'akrp-response-status err';
    err.textContent = store.lastRun.error;
    wrap.appendChild(err);
  }

  for (const result of store.stepResults) wrap.appendChild(renderStepResult(result));

  if (store.lastRun && !store.lastRun.error) {
    const verdict = document.createElement('div');
    verdict.className = 'akrp-response-status ' + (store.lastRun.ok ? 'ok' : 'err');
    verdict.textContent = store.lastRun.ok ? '✓ Flow passed' : '✗ Flow had failures';
    wrap.appendChild(verdict);
  }

  return wrap;
}

function renderHistory(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'akrp-flow-history';

  if (store.history.length === 0) return wrap;

  const headRow = document.createElement('div');
  headRow.className = 'akrp-flow-history-head';

  const title = document.createElement('div');
  title.className = 'akrp-section-title';
  title.textContent = `Run history (${store.history.length})`;

  const saveBtn = document.createElement('button');
  saveBtn.className = 'secondary';
  saveBtn.textContent = 'Save history…';
  saveBtn.onclick = () => store.saveHistory();

  const clearBtn = document.createElement('button');
  clearBtn.className = 'secondary';
  clearBtn.textContent = 'Clear';
  clearBtn.onclick = () => store.clearHistory();

  const spacer = document.createElement('span');
  spacer.style.flex = '1';
  headRow.append(title, spacer, saveBtn, clearBtn);
  wrap.appendChild(headRow);

  for (const entry of store.history) wrap.appendChild(renderHistoryEntry(entry));
  return wrap;
}

function renderHistoryEntry(entry: FlowRunHistoryEntry): HTMLElement {
  const item = document.createElement('div');
  item.className = 'akrp-flow-history-item';

  const failed = !entry.result.ok;
  const summary = document.createElement('div');
  summary.className = 'akrp-flow-history-summary';
  const expanded = store.expandedHistoryIds.has(entry.id);
  const stepCount = entry.result.steps.length;
  summary.innerHTML = `<span class="akrp-flow-history-caret">${expanded ? '▾' : '▸'}</span>
    <span class="${failed ? 'err' : 'ok'}">${failed ? '✗' : '✓'}</span>
    <span class="akrp-flow-history-time">${new Date(entry.timestamp).toLocaleString()}</span>
    <span class="akrp-flow-history-meta">${stepCount} step${stepCount === 1 ? '' : 's'}</span>`;
  summary.onclick = () => store.toggleHistoryExpanded(entry.id);
  item.appendChild(summary);

  if (expanded) item.appendChild(renderRunResultBody(entry.result));
  return item;
}

function moveStep(index: number, delta: number): void {
  const target = index + delta;
  if (target < 0 || target >= store.file.steps.length) return;
  store.mutate(() => {
    const [s] = store.file.steps.splice(index, 1);
    store.file.steps.splice(target, 0, s);
  });
}

function checkbox(checked: boolean, onChange: (v: boolean) => void, title: string): HTMLInputElement {
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = checked;
  box.title = title;
  box.onchange = () => onChange(box.checked);
  return box;
}

function iconBtn(label: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'secondary akrp-icon-btn';
  btn.textContent = label;
  btn.disabled = disabled;
  btn.onclick = onClick;
  return btn;
}
