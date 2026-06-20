import { FlowCapture, FlowRunHistoryEntry, FlowStep, FlowStepResult } from '../../model/types';
import { renderRunResultBody } from '../components/flowResults';
import { genId, store } from './state';

const CAPTURE_SOURCES: FlowCapture['source'][] = ['body', 'header', 'status'];

let activeTab: 'config' | 'results' = 'config';
let logsExpanded = false;

function svgIcon(name: string): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.style.display = 'inline-block';
  svg.style.verticalAlign = 'middle';
  svg.style.fill = 'currentColor';

  let pathData = '';
  if (name === 'play') pathData = 'M3 2l10 6-10 6V2z';
  else if (name === 'stop') pathData = 'M3 3h10v10H3V3z';
  else if (name === 'plus') pathData = 'M14 7H9V2H7v5H2v2h5v5h2V9h5V7z';
  else if (name === 'up') pathData = 'M8 3.5l6 6-1.4 1.4L8 6.3 3.4 10.9 2 9.5l6-6z';
  else if (name === 'down') pathData = 'M8 12.5l-6-6 1.4-1.4 4.6 4.6 4.6-4.6 1.4 1.4-6 6z';
  else if (name === 'trash') pathData = 'M2 3h12v1H2V3zm2 2h8v9H4V5zm2 2v5h1V7H6zm3 0v5h1V7H9z';
  else if (name === 'checkbox-on') pathData = 'M14 0H2C0.9 0 0 0.9 0 2v12c0 1.1 0.9 2 2 2h12c1.1 0 2-0.9 2-2V2c0-1.1-0.9-2-2-2zM7 12L3 8l1.4-1.4L7 9.2l5.6-5.6L14 5l-7 7z';
  else if (name === 'checkbox-off') pathData = 'M14 2v12H2V2h12zm0-2H2C0.9 0 0 0.9 0 2v12c0 1.1 0.9 2 2 2h12c1.1 0 2-0.9 2-2V2c0-1.1-0.9-2-2-2z';
  else if (name === 'terminal') pathData = 'M2 2h12v12H2V2zm1 1v8h10V3H3zm0 9v1h10v-1H3z M4 5h5v1H4V5zm0 2h8v1H4V7zm0 2h6v1H4V9z';
  else if (name === 'info') pathData = 'M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16zM7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z';
  else if (name === 'settings') pathData = 'M9.405 1.02c0-.414-.336-.75-.75-.75h-.31a.75.75 0 0 0-.75.75l-.234 1.4a5.249 5.249 0 0 0-.916.53L5.13 2.128a.75.75 0 0 0-1.06 0l-.22.22a.75.75 0 0 0 0 1.061l.822.822c-.156.294-.28.605-.368.932l-1.332.222a.75.75 0 0 0-.622.74v.31a.75.75 0 0 0 .622.74l1.332.222c.088.327.212.638.368.932l-.822.822a.75.75 0 0 0 0 1.06l.22.22a.75.75 0 0 0 1.06 0l.823-.822c.293.155.604.28.931.368l.222 1.332a.75.75 0 0 0 .74.622h.31a.75.75 0 0 0 .74-.622l.222-1.332c.327-.088.638-.212.932-.368l.822.822a.75.75 0 0 0 1.061 0l.22-.22a.75.75 0 0 0 0-1.061l-.822-.822c.155-.293.28-.604.368-.931l1.332-.222a.75.75 0 0 0 .622-.74v-.31a.75.75 0 0 0-.622-.74l-1.332-.222a5.253 5.253 0 0 0-.368-.932l.822-.822a.75.75 0 0 0 0-1.06l-.22-.22a.75.75 0 0 0-1.061 0l-.822.822a5.249 5.249 0 0 0-.932-.368L9.405 1.02zM8 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4z';
  else if (name === 'check') pathData = 'M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z';
  else if (name === 'cross') pathData = 'M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z';
  else if (name === 'copy') pathData = 'M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1a1.5 1.5 0 0 0-1.5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z';

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  svg.appendChild(path);

  return svg;
}

function iconButton(iconName: string, text: string, disabled: boolean, onClick: () => void, isSecondary = true): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = isSecondary ? 'secondary' : '';
  btn.disabled = disabled;
  btn.onclick = onClick;
  btn.style.display = 'inline-flex';
  btn.style.alignItems = 'center';
  btn.style.gap = '6px';
  btn.appendChild(svgIcon(iconName));
  btn.appendChild(document.createTextNode(text));
  return btn;
}

export function renderFlow(container: HTMLElement): void {
  container.innerHTML = '';

  const flowContainer = document.createElement('div');
  flowContainer.className = 'albert-flow-container';

  // 1. Header Row
  flowContainer.appendChild(renderHeader());

  // 2. Stats Dashboard
  flowContainer.appendChild(renderDashboard());

  // 3. Workspace (Sidebar + Detail split)
  const workspace = document.createElement('div');
  workspace.className = 'albert-flow-workspace';

  // Sidebar (left)
  const sidebar = document.createElement('div');
  sidebar.className = 'albert-flow-sidebar';

  const sidebarHeader = document.createElement('div');
  sidebarHeader.className = 'sidebar-section-header';
  sidebarHeader.textContent = 'Steps List';
  sidebar.appendChild(sidebarHeader);

  sidebar.appendChild(renderSidebarSteps());

  const addStepBtn = document.createElement('button');
  addStepBtn.className = 'secondary add-step-sidebar-btn';
  addStepBtn.style.margin = '10px 12px';
  addStepBtn.style.display = 'flex';
  addStepBtn.style.justifyContent = 'center';
  addStepBtn.style.alignItems = 'center';
  addStepBtn.style.gap = '6px';
  addStepBtn.appendChild(svgIcon('plus'));
  addStepBtn.appendChild(document.createTextNode('Add Step'));
  addStepBtn.onclick = () => {
    store.mutate(() => {
      const newStep = {
        id: genId('step'),
        name: `Step ${store.file.steps.length + 1}`,
        requestPath: '',
        enabled: true,
        validate: true,
        captures: [],
      };
      store.file.steps.push(newStep);
      store.selectedStepId = newStep.id;
    });
  };
  sidebar.appendChild(addStepBtn);

  workspace.appendChild(sidebar);

  // Detail Panel (right)
  workspace.appendChild(renderDetailPanel());

  flowContainer.appendChild(workspace);

  // 4. Console Logs Panel
  flowContainer.appendChild(renderConsoleLogs());

  // 5. Run History Section
  flowContainer.appendChild(renderHistorySection());

  container.appendChild(flowContainer);
}

function renderHeader(): HTMLElement {
  const header = document.createElement('div');
  header.className = 'albert-flow-toolbar-row';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'toolbar-title-wrap';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'flow-name-input';
  nameInput.value = store.file.name;
  nameInput.placeholder = 'Flow Name';
  nameInput.oninput = () => store.mutateQuiet(() => (store.file.name = nameInput.value));
  titleWrap.appendChild(nameInput);

  const env = document.createElement('div');
  env.className = 'albert-env-readout';
  env.textContent = `Env: ${store.activeEnvName ?? 'none'}`;
  titleWrap.appendChild(env);

  const allureStatus = document.createElement('div');
  allureStatus.className = `albert-allure-status ${store.allureEnabled ? 'on' : 'off'}`;
  allureStatus.title = store.allureEnabled
    ? 'Allure reporting is enabled (Albert: Allure Enabled setting)'
    : 'Allure reporting is disabled — enable "Albert: Allure Enabled" in VS Code settings to send reports';
  allureStatus.textContent = `Allure: ${store.allureEnabled ? 'Enabled' : 'Disabled'}`;
  titleWrap.appendChild(allureStatus);

  header.appendChild(titleWrap);

  const bar = document.createElement('div');
  bar.className = 'albert-flow-toolbar';

  const runBtn = store.running
    ? iconButton('stop', 'Stop', false, () => store.stop())
    : iconButton('play', 'Run flow', store.file.steps.filter((s) => s.enabled).length === 0, () => store.run(), false);

  const addBtn = iconButton('plus', 'Add step', false, () =>
    store.mutate(() => {
      const newStep = {
        id: genId('step'),
        name: `Step ${store.file.steps.length + 1}`,
        requestPath: '',
        enabled: true,
        validate: true,
        captures: [],
      };
      store.file.steps.push(newStep);
      store.selectedStepId = newStep.id;
    })
  );

  bar.append(runBtn, addBtn);
  header.appendChild(bar);
  return header;
}

function renderDashboard(): HTMLElement {
  const dash = document.createElement('div');
  dash.className = 'albert-flow-dashboard';

  const stepsCount = store.file.steps.length;
  const enabledCount = store.file.steps.filter((s) => s.enabled).length;

  let statusText = 'Idle';
  let statusClass = 'idle';
  let durationText = '—';
  let checksText = '—';

  if (store.running) {
    statusText = 'Running';
    statusClass = 'running';
    durationText = 'In progress...';

    let totalChecks = 0;
    let passedChecks = 0;
    for (const r of store.stepResults) {
      totalChecks += r.checks.length;
      passedChecks += r.checks.filter((c) => c.pass).length;
    }
    checksText = totalChecks > 0 ? `${passedChecks}/${totalChecks} passed` : 'No checks';
  } else if (store.lastRun) {
    const passed = store.lastRun.ok;
    statusText = passed ? 'Passed' : 'Failed';
    statusClass = passed ? 'passed' : 'failed';

    let totalDuration = 0;
    let totalChecks = 0;
    let passedChecks = 0;
    for (const r of store.stepResults) {
      totalDuration += r.durationMs;
      totalChecks += r.checks.length;
      passedChecks += r.checks.filter((c) => c.pass).length;
    }
    durationText = `${Math.round(totalDuration)} ms`;
    checksText =
      totalChecks > 0
        ? `${passedChecks}/${totalChecks} passed (${Math.round((passedChecks / totalChecks) * 100)}%)`
        : 'No checks';
  }

  dash.innerHTML = `
    <div class="albert-dashboard-metric">
      <span class="metric-label">Active Steps</span>
      <span class="metric-value">${enabledCount} / ${stepsCount}</span>
    </div>
    <div class="albert-dashboard-metric">
      <span class="metric-label">Status</span>
      <span class="metric-value status-${statusClass}">${statusText}</span>
    </div>
    <div class="albert-dashboard-metric">
      <span class="metric-label">Checks</span>
      <span class="metric-value">${checksText}</span>
    </div>
    <div class="albert-dashboard-metric">
      <span class="metric-label">Total Duration</span>
      <span class="metric-value">${durationText}</span>
    </div>
  `;
  return dash;
}

function renderSidebarSteps(): HTMLElement {
  const stepsList = document.createElement('div');
  stepsList.className = 'albert-sidebar-steps';

  if (store.file.steps.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'albert-empty';
    empty.textContent = 'No steps yet. Click "Add step" to begin.';
    stepsList.appendChild(empty);
    return stepsList;
  }

  store.file.steps.forEach((step, index) => {
    const item = document.createElement('div');
    const isSelected = store.selectedStepId === step.id;

    item.className = 'albert-sidebar-step-item' + (isSelected ? ' selected' : '') + (step.enabled ? '' : ' disabled');

    item.onclick = (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('input') || target.closest('button')) return;
      store.setSelectedStepId(step.id);
    };

    const statusWrapper = document.createElement('div');
    statusWrapper.className = 'step-status-indicator';

    let statusIconName = '';
    const enabledSteps = store.file.steps.filter((s) => s.enabled);
    const result = store.stepResults.find((r) => r.stepId === step.id);

    if (result) {
      const failed = !!result.error || result.checks.some((c) => !c.pass);
      statusIconName = failed ? 'cross' : 'check';
    } else if (store.running && step.enabled) {
      const firstPendingEnabled = enabledSteps.find((s) => !store.stepResults.some((r) => r.stepId === s.id));
      if (firstPendingEnabled && firstPendingEnabled.id === step.id) {
        statusIconName = 'spinner';
      } else {
        statusIconName = 'pending';
      }
    } else {
      statusIconName = 'pending';
    }

    if (statusIconName === 'spinner') {
      const spinner = document.createElement('div');
      spinner.className = 'sidebar-spinner';
      statusWrapper.appendChild(spinner);
    } else if (statusIconName === 'check') {
      const icon = svgIcon('check');
      icon.classList.add('icon-check');
      statusWrapper.appendChild(icon);
    } else if (statusIconName === 'cross') {
      const icon = svgIcon('cross');
      icon.classList.add('icon-cross');
      statusWrapper.appendChild(icon);
    } else if (statusIconName === 'pending') {
      const dot = document.createElement('span');
      dot.className = 'status-dot pending';
      statusWrapper.appendChild(dot);
    } else {
      const indexBadge = document.createElement('span');
      indexBadge.className = 'step-index-badge';
      indexBadge.textContent = String(index + 1);
      statusWrapper.appendChild(indexBadge);
    }

    const enableBox = document.createElement('input');
    enableBox.type = 'checkbox';
    enableBox.checked = step.enabled;
    enableBox.title = step.enabled ? 'Disable step' : 'Enable step';
    enableBox.onchange = () => store.mutate(() => (step.enabled = enableBox.checked));

    const nameLabel = document.createElement('span');
    nameLabel.className = 'sidebar-step-name';
    nameLabel.textContent = step.name || `Step ${index + 1}`;
    nameLabel.title = nameLabel.textContent;

    const actions = document.createElement('div');
    actions.className = 'sidebar-step-actions';

    const upBtn = document.createElement('button');
    upBtn.className = 'secondary albert-icon-btn';
    upBtn.title = 'Move up';
    upBtn.disabled = index === 0;
    upBtn.appendChild(svgIcon('up'));
    upBtn.onclick = () => moveStep(index, -1);

    const downBtn = document.createElement('button');
    downBtn.className = 'secondary albert-icon-btn';
    downBtn.title = 'Move down';
    downBtn.disabled = index === store.file.steps.length - 1;
    downBtn.appendChild(svgIcon('down'));
    downBtn.onclick = () => moveStep(index, 1);

    const delBtn = document.createElement('button');
    delBtn.className = 'secondary albert-icon-btn del-btn';
    delBtn.title = 'Delete step';
    delBtn.appendChild(svgIcon('trash'));
    delBtn.onclick = () =>
      store.mutate(() => {
        store.file.steps.splice(index, 1);
        if (store.selectedStepId === step.id) {
          store.selectedStepId = store.file.steps[index]?.id || store.file.steps[index - 1]?.id || null;
        }
      });

    actions.append(upBtn, downBtn, delBtn);
    item.append(statusWrapper, enableBox, nameLabel, actions);
    stepsList.appendChild(item);
  });

  return stepsList;
}

function renderDetailPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'albert-detail-panel';

  const stepId = store.selectedStepId;
  const stepIndex = store.file.steps.findIndex((s) => s.id === stepId);
  const step = store.file.steps[stepIndex];

  if (!step) {
    const welcome = document.createElement('div');
    welcome.className = 'albert-detail-welcome';
    welcome.innerHTML = `
      <div class="welcome-icon">${svgIcon('settings').outerHTML}</div>
      <h3>Select a Step</h3>
      <p>Click a step in the sidebar to configure its request, assertions, and captures, or view its runtime result.</p>
    `;
    panel.appendChild(welcome);
    return panel;
  }

  // Tabs Header
  const tabHeader = document.createElement('div');
  tabHeader.className = 'albert-detail-tabs';

  const configTab = document.createElement('div');
  configTab.className = 'albert-detail-tab' + (activeTab === 'config' ? ' active' : '');
  configTab.textContent = 'Configure Step';
  configTab.onclick = () => {
    activeTab = 'config';
    store.setSelectedStepId(stepId);
  };

  const resultsTab = document.createElement('div');
  resultsTab.className = 'albert-detail-tab' + (activeTab === 'results' ? ' active' : '');
  resultsTab.textContent = 'Step Result';
  resultsTab.onclick = () => {
    activeTab = 'results';
    store.setSelectedStepId(stepId);
  };

  tabHeader.append(configTab, resultsTab);
  panel.appendChild(tabHeader);

  // Tab Content
  const tabContent = document.createElement('div');
  tabContent.className = 'albert-tab-content';

  if (activeTab === 'config') {
    tabContent.appendChild(renderConfigureTab(step, stepIndex));
  } else {
    tabContent.appendChild(renderStepResultTab(step, stepIndex));
  }

  panel.appendChild(tabContent);
  return panel;
}

function renderConfigureTab(step: FlowStep, stepIndex: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'albert-config-tab';

  // Step Name Input
  const nameRow = document.createElement('div');
  nameRow.className = 'albert-form-group';
  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Step Name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = step.name;
  nameInput.placeholder = 'e.g. Authenticate User';
  nameInput.oninput = () => store.mutateQuiet(() => (step.name = nameInput.value));
  nameRow.append(nameLabel, nameInput);
  wrap.appendChild(nameRow);

  // Request Picker Row
  const reqRow = document.createElement('div');
  reqRow.className = 'albert-form-group';
  const reqLabel = document.createElement('label');
  reqLabel.textContent = 'API Request (.abrq)';

  const reqPickerWrapper = document.createElement('div');
  reqPickerWrapper.className = 'albert-picker-wrapper';

  const pathDisplay = document.createElement('div');
  pathDisplay.className = 'albert-picker-path' + (step.requestPath ? '' : ' missing');
  pathDisplay.textContent = step.requestPath || 'No request selected';

  const pickBtn = document.createElement('button');
  pickBtn.className = 'secondary';
  pickBtn.textContent = 'Select Request';
  pickBtn.onclick = () => store.pickRequest(step.id);

  reqPickerWrapper.append(pathDisplay, pickBtn);
  reqRow.append(reqLabel, reqPickerWrapper);
  wrap.appendChild(reqRow);

  // Assertions validations toggle
  const valRow = document.createElement('div');
  valRow.className = 'albert-form-checkbox-row';
  const valBox = document.createElement('input');
  valBox.type = 'checkbox';
  valBox.id = 'run-validations-checkbox';
  valBox.checked = step.validate;
  valBox.onchange = () => store.mutate(() => (step.validate = valBox.checked));

  const valLabel = document.createElement('label');
  valLabel.setAttribute('for', 'run-validations-checkbox');
  valLabel.textContent = 'Run this request’s expectations & JSON schemas as checks';

  valRow.append(valBox, valLabel);
  wrap.appendChild(valRow);

  // Divider
  const hr = document.createElement('hr');
  hr.className = 'albert-divider';
  wrap.appendChild(hr);

  // Captures Section
  wrap.appendChild(renderConfigureCaptures(step, stepIndex));

  return wrap;
}

function renderConfigureCaptures(step: FlowStep, stepIndex: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'albert-captures-section';

  const title = document.createElement('h4');
  title.className = 'captures-section-title';
  title.textContent = 'Captures (feed forward values to later steps)';
  wrap.appendChild(title);

  // Helper banner for variables available from previous steps
  const prevSteps = store.file.steps.slice(0, stepIndex);
  const availableVars: string[] = [];
  prevSteps.forEach((s) => {
    s.captures.forEach((c) => {
      if (c.variable && !availableVars.includes(c.variable)) {
        availableVars.push(c.variable);
      }
    });
  });

  if (availableVars.length > 0) {
    const tip = document.createElement('div');
    tip.className = 'albert-available-vars-tip';
    tip.innerHTML = `
      <span>💡 <strong>Available variables from previous steps:</strong></span>
      <div class="available-badges">
        ${availableVars.map((v) => `<span class="var-badge" title="Use as {{${v}}}">\`{{${v}}}\`</span>`).join(' ')}
      </div>
    `;
    wrap.appendChild(tip);
  }

  // Captures list
  const listWrap = document.createElement('div');
  listWrap.className = 'albert-captures-list';

  if (step.captures.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'albert-captures-empty';
    empty.textContent = 'No captures configured. Extract values from response body, headers, or status.';
    listWrap.appendChild(empty);
  } else {
    step.captures.forEach((cap, ci) => {
      const row = document.createElement('div');
      row.className = 'albert-capture-row';

      const varInput = document.createElement('input');
      varInput.type = 'text';
      varInput.placeholder = 'variable';
      varInput.value = cap.variable;
      varInput.style.flex = '1';
      varInput.oninput = () => store.mutateQuiet(() => (cap.variable = varInput.value));

      const sourceSel = document.createElement('select');
      sourceSel.className = 'capture-source-select';
      for (const src of CAPTURE_SOURCES) {
        const opt = document.createElement('option');
        opt.value = src;
        opt.textContent = src;
        if (src === cap.source) opt.selected = true;
        sourceSel.appendChild(opt);
      }
      sourceSel.onchange = () =>
        store.mutate(() => {
          cap.source = sourceSel.value as FlowCapture['source'];
          if (cap.source === 'status') cap.path = '';
        });

      const pathInput = document.createElement('input');
      pathInput.type = 'text';
      pathInput.placeholder =
        cap.source === 'header' ? 'Header name' : cap.source === 'body' ? 'JSON Path (e.g. data.token)' : 'Status';
      pathInput.value = cap.path ?? '';
      pathInput.disabled = cap.source === 'status';
      pathInput.style.flex = '2';
      pathInput.oninput = () => store.mutateQuiet(() => (cap.path = pathInput.value));

      const delBtn = document.createElement('button');
      delBtn.className = 'secondary albert-icon-btn del-btn';
      delBtn.title = 'Remove capture';
      delBtn.appendChild(svgIcon('trash'));
      delBtn.onclick = () => store.mutate(() => step.captures.splice(ci, 1));

      row.append(varInput, sourceSel, pathInput, delBtn);
      listWrap.appendChild(row);
    });
  }
  wrap.appendChild(listWrap);

  const addBtn = document.createElement('button');
  addBtn.className = 'secondary';
  addBtn.style.marginTop = '8px';
  addBtn.style.display = 'inline-flex';
  addBtn.style.alignItems = 'center';
  addBtn.style.gap = '6px';
  addBtn.appendChild(svgIcon('plus'));
  addBtn.appendChild(document.createTextNode('Add Capture'));
  addBtn.onclick = () => store.mutate(() => step.captures.push({ variable: '', source: 'body', path: '' }));
  wrap.appendChild(addBtn);

  return wrap;
}

function renderStepResultTab(step: FlowStep, stepIndex: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'albert-results-tab';

  const result = store.stepResults.find((r) => r.stepId === step.id);

  if (!result) {
    const empty = document.createElement('div');
    empty.className = 'albert-result-empty-state';
    empty.innerHTML = `
      <div class="empty-icon">${svgIcon('play').outerHTML}</div>
      <p>No execution results for this step. Click <strong>Run Flow</strong> in the toolbar to run the sequence.</p>
    `;
    wrap.appendChild(empty);
    return wrap;
  }

  // Header Details
  const header = document.createElement('div');
  header.className = 'albert-result-details-header';

  const failed = !!result.error || result.checks.some((c) => !c.pass);
  const statusClass = result.status >= 200 && result.status < 400 ? 'ok' : 'err';

  const statusBadge = document.createElement('span');
  statusBadge.className = `status-badge ${statusClass}`;
  statusBadge.textContent = String(result.status || 'ERROR');

  const metaText = document.createElement('span');
  metaText.className = 'result-meta-text';
  metaText.innerHTML = `<strong>${result.method}</strong> · ${Math.round(result.durationMs)} ms`;

  header.append(statusBadge, metaText);
  wrap.appendChild(header);

  // URL Display
  const urlRow = document.createElement('div');
  urlRow.className = 'albert-result-url-row';
  urlRow.textContent = result.url;
  wrap.appendChild(urlRow);

  // Error Message
  if (result.error) {
    const errBlock = document.createElement('div');
    errBlock.className = 'albert-response-status err';
    errBlock.style.marginTop = '8px';
    errBlock.textContent = result.error;
    wrap.appendChild(errBlock);
  }

  // Validation Checks
  if (result.checks.length > 0) {
    const checksWrap = document.createElement('div');
    checksWrap.className = 'albert-result-checks';
    const checksTitle = document.createElement('h5');
    checksTitle.textContent = 'Validation Checks';
    checksWrap.appendChild(checksTitle);

    result.checks.forEach((check) => {
      const row = document.createElement('div');
      row.className = 'albert-result-check-row ' + (check.pass ? 'pass' : 'fail');
      row.appendChild(svgIcon(check.pass ? 'check' : 'cross'));

      const txt = document.createElement('span');
      txt.textContent = check.description;
      row.appendChild(txt);
      checksWrap.appendChild(row);
    });
    wrap.appendChild(checksWrap);
  }

  // Captured Values (Live Variable Display)
  const capturesWrap = document.createElement('div');
  capturesWrap.className = 'albert-result-captured-values';
  const capturesTitle = document.createElement('h5');
  capturesTitle.textContent = 'Captured Values';
  capturesWrap.appendChild(capturesTitle);

  const capturedRecord = result.capturedValues || {};
  const capturedKeys = Object.keys(capturedRecord);

  if (capturedKeys.length === 0) {
    const emptyNote = document.createElement('div');
    emptyNote.className = 'captured-values-empty';
    emptyNote.textContent =
      step.captures.length > 0 ? 'No values were captured in this run.' : 'No captures are configured for this step.';
    capturesWrap.appendChild(emptyNote);
  } else {
    const grid = document.createElement('div');
    grid.className = 'captured-values-grid';
    capturedKeys.forEach((key) => {
      const row = document.createElement('div');
      row.className = 'captured-value-item';

      const keySpan = document.createElement('span');
      keySpan.className = 'captured-key';
      keySpan.textContent = `{{${key}}}`;

      const valSpan = document.createElement('span');
      valSpan.className = 'captured-val';
      valSpan.textContent = capturedRecord[key] || '""';
      valSpan.title = capturedRecord[key] || '""';

      row.append(keySpan, valSpan);
      grid.appendChild(row);
    });
    capturesWrap.appendChild(grid);
  }
  wrap.appendChild(capturesWrap);

  // Response Body Preview
  if (result.bodyPreview) {
    const bodyWrap = document.createElement('div');
    bodyWrap.className = 'albert-result-body-preview';
    const bodyTitle = document.createElement('h5');
    bodyTitle.textContent = 'Response Body Preview';
    bodyWrap.appendChild(bodyTitle);

    const pre = document.createElement('pre');
    pre.textContent = result.bodyPreview;
    bodyWrap.appendChild(pre);
    wrap.appendChild(bodyWrap);
  }

  return wrap;
}

function renderConsoleLogs(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'albert-console-panel' + (logsExpanded ? ' expanded' : '');

  const header = document.createElement('div');
  header.className = 'albert-console-header';
  header.onclick = () => {
    logsExpanded = !logsExpanded;
    store.setSelectedStepId(store.selectedStepId);
  };

  const title = document.createElement('span');
  title.className = 'console-title';
  title.style.display = 'inline-flex';
  title.style.alignItems = 'center';
  title.style.gap = '6px';
  title.appendChild(svgIcon('terminal'));
  title.appendChild(document.createTextNode('Console Logs & Execution Summary'));
  header.appendChild(title);

  const caret = document.createElement('span');
  caret.className = 'console-caret';
  caret.textContent = logsExpanded ? '▾' : '▸';
  header.appendChild(caret);

  panel.appendChild(header);

  if (logsExpanded) {
    const body = document.createElement('div');
    body.className = 'albert-console-body';

    const pre = document.createElement('pre');

    let logsText = '';
    if (store.running) {
      logsText = 'Executing k6 flow runner... Streaming results...';
    } else if (store.lastRun) {
      if (store.lastRun.summary) {
        logsText = store.lastRun.summary;
      } else if (store.lastRun.error) {
        logsText = `Execution error: ${store.lastRun.error}`;
      } else {
        logsText = 'Execution finished with no console output.';
      }
    } else {
      logsText = 'No active run. Click Run Flow to trigger.';
    }

    pre.textContent = logsText;
    body.appendChild(pre);
    panel.appendChild(body);
  }

  return panel;
}

function renderHistorySection(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'albert-flow-history-section';

  if (store.history.length === 0) return wrap;

  const headRow = document.createElement('div');
  headRow.className = 'albert-flow-history-head';

  const title = document.createElement('div');
  title.className = 'albert-section-title';
  title.textContent = `Run history (${store.history.length})`;

  const saveBtn = document.createElement('button');
  saveBtn.className = 'secondary';
  saveBtn.style.display = 'inline-flex';
  saveBtn.style.alignItems = 'center';
  saveBtn.style.gap = '6px';
  saveBtn.appendChild(svgIcon('copy'));
  saveBtn.appendChild(document.createTextNode('Save history…'));
  saveBtn.onclick = () => store.saveHistory();

  const clearBtn = document.createElement('button');
  clearBtn.className = 'secondary';
  clearBtn.style.display = 'inline-flex';
  clearBtn.style.alignItems = 'center';
  clearBtn.style.gap = '6px';
  clearBtn.appendChild(svgIcon('trash'));
  clearBtn.appendChild(document.createTextNode('Clear'));
  clearBtn.onclick = () => store.clearHistory();

  const spacer = document.createElement('span');
  spacer.style.flex = '1';
  clearBtn.style.marginLeft = '6px';
  headRow.append(title, spacer, saveBtn, clearBtn);
  wrap.appendChild(headRow);

  const historyList = document.createElement('div');
  historyList.className = 'history-items-list';
  for (const entry of store.history) {
    historyList.appendChild(renderHistoryEntry(entry));
  }
  wrap.appendChild(historyList);
  return wrap;
}

function renderHistoryEntry(entry: FlowRunHistoryEntry): HTMLElement {
  const item = document.createElement('div');
  item.className = 'albert-flow-history-item';

  const failed = !entry.result.ok;
  const summary = document.createElement('div');
  summary.className = 'albert-flow-history-summary';
  const expanded = store.expandedHistoryIds.has(entry.id);
  const stepCount = entry.result.steps.length;

  const totalDuration = entry.result.steps.reduce((sum, s) => sum + s.durationMs, 0);
  let totalChecks = 0;
  let passedChecks = 0;
  for (const step of entry.result.steps) {
    totalChecks += step.checks.length;
    passedChecks += step.checks.filter((c) => c.pass).length;
  }

  const durationText = stepCount > 0 ? ` · ${Math.round(totalDuration)} ms` : '';
  const checksText = totalChecks > 0 ? ` · ${passedChecks}/${totalChecks} checks` : '';
  const errorText = entry.result.error ? ` · Error: ${entry.result.error}` : '';

  summary.innerHTML = `<span class="albert-flow-history-caret">${expanded ? '▾' : '▸'}</span>
    <span class="${failed ? 'err' : 'ok'}">${failed ? '✗' : '✓'}</span>
    <span class="albert-flow-history-time">${new Date(entry.timestamp).toLocaleString()}</span>
    <span class="albert-flow-history-meta">${stepCount} step${stepCount === 1 ? '' : 's'}${durationText}${checksText}${errorText}</span>`;
  summary.onclick = () => store.toggleHistoryExpanded(entry.id);
  item.appendChild(summary);

  if (expanded) {
    const bodyWrap = document.createElement('div');
    bodyWrap.appendChild(renderRunResultBody(entry.result));
    item.appendChild(bodyWrap);
  }
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
