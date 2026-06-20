import { FlowRunResult, FlowStepResult } from '../../model/types';

/** Renders a single step's result card (status, checks, body preview). Shared by the flow editor's
 *  live results / history and the .abh viewer. */
export function renderStepResult(result: FlowStepResult): HTMLElement {
  const card = document.createElement('div');
  const failed = !!result.error || result.checks.some((c) => !c.pass);
  card.className = 'albert-flow-result' + (failed ? ' err' : ' ok');

  const head = document.createElement('div');
  head.className = 'albert-flow-result-head';
  
  const titleContainer = document.createElement('div');
  titleContainer.className = 'albert-flow-result-title-container';
  
  const nameEl = document.createElement('strong');
  nameEl.textContent = result.name;
  titleContainer.appendChild(nameEl);

  const allure = result.allureReportConfig;
  if (allure && (allure.epicPath || allure.featurePath || allure.story || allure.suite || allure.owner || allure.severity || allure.description || (allure.tags && allure.tags.length))) {
    const badge = document.createElement('span');
    badge.className = 'albert-allure-badge';
    badge.innerHTML = `Allure <div class="tooltip"></div>`;

    const tooltip = badge.querySelector('.tooltip') as HTMLElement;
    
    const addTooltipRow = (label: string, value: string) => {
      const row = document.createElement('div');
      row.className = 'albert-tooltip-row';
      row.innerHTML = `<span class="albert-tooltip-label">${escapeHtml(label)}</span><span class="albert-tooltip-value">${escapeHtml(value)}</span>`;
      tooltip.appendChild(row);
    };

    if (allure.epicPath) addTooltipRow('Epic File', allure.epicPath);
    if (allure.featurePath) addTooltipRow('Feature File', allure.featurePath);
    if (allure.story) addTooltipRow('Story', allure.story);
    if (allure.suite) addTooltipRow('Suite', allure.suite);
    if (allure.severity) addTooltipRow('Severity', allure.severity);
    if (allure.owner) addTooltipRow('Owner', allure.owner);
    if (allure.tags && allure.tags.length) addTooltipRow('Tags', allure.tags.join(', '));
    if (allure.description) addTooltipRow('Description', allure.description);

    titleContainer.appendChild(badge);
  }
  head.appendChild(titleContainer);

  const statusClass = result.status >= 200 && result.status < 400 ? 'ok' : 'err';
  const metaContainer = document.createElement('span');
  metaContainer.className = 'albert-flow-result-meta';
  metaContainer.innerHTML = `${escapeHtml(result.method)} <span class="${statusClass}">${result.status || '—'}</span> · ${Math.round(result.durationMs)} ms`;
  head.appendChild(metaContainer);
  card.appendChild(head);

  const url = document.createElement('div');
  url.className = 'albert-flow-result-url';
  url.textContent = result.url;
  card.appendChild(url);

  if (result.error) {
    const err = document.createElement('div');
    err.className = 'albert-response-status err';
    err.textContent = result.error;
    card.appendChild(err);
  }

  for (const check of result.checks) {
    const row = document.createElement('div');
    row.className = 'albert-flow-check ' + (check.pass ? 'ok' : 'err');
    row.textContent = `${check.pass ? '✓' : '✗'} ${check.description}`;
    card.appendChild(row);
  }

  // Request Headers collapsible section
  if (result.requestHeaders && Object.keys(result.requestHeaders).length > 0) {
    const table = renderHeaderTable(result.requestHeaders);
    card.appendChild(createDetailsSection('Request Headers', table, Object.keys(result.requestHeaders).length));
  }

  // Auth details collapsible section
  if (result.auth && result.auth.type && result.auth.type !== 'none') {
    const authTable = renderAuthDetails(result.auth);
    if (authTable) {
      card.appendChild(createDetailsSection('Authentication', authTable));
    }
  }

  // Request Body collapsible section
  if (result.requestBody && result.requestBody.trim().length > 0) {
    card.appendChild(createDetailsSection('Request Body', result.requestBody));
  }

  // Response Headers collapsible section
  if (result.responseHeaders && Object.keys(result.responseHeaders).length > 0) {
    const table = renderHeaderTable(result.responseHeaders);
    card.appendChild(createDetailsSection('Response Headers', table, Object.keys(result.responseHeaders).length));
  }

  // Response Body collapsible section
  if (result.bodyPreview && result.bodyPreview.trim().length > 0) {
    card.appendChild(createDetailsSection('Response Body', result.bodyPreview));
  }

  return card;
}

/** Renders the body of a whole run: each step plus a pass/fail verdict. */
export function renderRunResultBody(result: FlowRunResult): HTMLElement {
  const wrap = document.createElement('div');

  if (result.error) {
    const err = document.createElement('div');
    err.className = 'albert-response-status err';
    err.textContent = result.error;
    wrap.appendChild(err);
  }

  for (const step of result.steps) wrap.appendChild(renderStepResult(step));

  if (!result.error) {
    const verdict = document.createElement('div');
    verdict.className = 'albert-response-status ' + (result.ok ? 'ok' : 'err');
    verdict.textContent = result.ok ? '✓ Flow passed' : '✗ Flow had failures';
    wrap.appendChild(verdict);
  }

  if (result.summary) {
    const sumWrap = document.createElement('div');
    sumWrap.style.marginTop = '12px';

    const title = document.createElement('h5');
    title.textContent = 'Execution Metrics';
    title.style.margin = '0 0 6px 0';
    title.style.fontSize = '11px';
    title.style.textTransform = 'uppercase';
    title.style.color = 'var(--albert-muted, #808080)';
    title.style.letterSpacing = '0.5px';

    const pre = document.createElement('pre');
    pre.textContent = result.summary;
    pre.style.margin = '0';
    pre.style.maxHeight = '200px';
    pre.style.overflow = 'auto';
    pre.style.background = '#000';
    pre.style.color = '#00ff00';
    pre.style.borderRadius = 'var(--albert-radius-sm, 4px)';
    pre.style.padding = '8px 10px';
    pre.style.fontSize = '11px';
    pre.style.fontFamily = 'var(--vscode-editor-font-family, monospace)';
    pre.style.whiteSpace = 'pre';

    sumWrap.append(title, pre);
    wrap.appendChild(sumWrap);
  }

  return wrap;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

/** CSS for the result cards — shared so the flow editor and the viewer look identical. */
export function flowResultStyles(): string {
  return `
    .albert-response-status.ok { color: var(--albert-ok); }
    .albert-response-status.err { color: var(--albert-err); }
    .albert-flow-result { border: 1px solid var(--albert-border-subtle); border-left: 3px solid var(--albert-border); border-radius: var(--albert-radius-sm); padding: 8px 10px; margin-bottom: 6px; background: var(--vscode-textCodeBlock-background); }
    .albert-flow-result.ok { border-left-color: var(--albert-ok); }
    .albert-flow-result.err { border-left-color: var(--albert-err); }
    .albert-flow-result-head { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
    .albert-flow-result-title-container { display: flex; align-items: center; gap: 6px; position: relative; }
    .albert-flow-result-meta { color: var(--albert-muted); font-size: 12px; flex-shrink: 0; }
    .albert-flow-result-meta .ok { color: var(--albert-ok); }
    .albert-flow-result-meta .err { color: var(--albert-err); }
    .albert-flow-result-url { font-family: var(--vscode-editor-font-family); font-size: 11px; color: var(--albert-muted); word-break: break-all; margin: 3px 0; }
    .albert-flow-check { font-size: 12px; }
    .albert-flow-check.ok { color: var(--albert-ok); }
    .albert-flow-check.err { color: var(--albert-err); }
    .albert-flow-result pre { margin: 6px 0 0; max-height: 160px; overflow: auto; background: var(--vscode-editor-background); border-radius: var(--albert-radius-sm); padding: 8px 10px; font-size: 11px; white-space: pre-wrap; word-break: break-word; }

    /* Allure badge and tooltip styles */
    .albert-allure-badge {
      display: inline-flex;
      align-items: center;
      background: var(--vscode-badge-background, #007acc);
      color: var(--vscode-badge-foreground, #ffffff);
      font-size: 9px;
      padding: 1px 5px;
      border-radius: 8px;
      font-weight: bold;
      cursor: help;
      position: relative;
      letter-spacing: 0.3px;
      text-transform: uppercase;
    }
    
    .albert-allure-badge .tooltip {
      visibility: hidden;
      width: 260px;
      background-color: var(--vscode-editorHoverWidget-background, #252526);
      color: var(--vscode-editorHoverWidget-foreground, #cccccc);
      border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
      text-align: left;
      border-radius: var(--albert-radius-sm, 4px);
      padding: 8px;
      position: absolute;
      z-index: 100;
      bottom: 125%; /* Position above the badge */
      left: 50%;
      transform: translateX(-50%);
      opacity: 0;
      transition: opacity 0.2s;
      font-weight: normal;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      pointer-events: none;
      font-family: var(--vscode-font-family, sans-serif);
      text-transform: none;
    }
    
    .albert-allure-badge:hover .tooltip {
      visibility: visible;
      opacity: 1;
    }
    
    .albert-tooltip-row {
      display: flex;
      margin-bottom: 4px;
      line-height: 1.3;
    }
    .albert-tooltip-row:last-child {
      margin-bottom: 0;
    }
    .albert-tooltip-label {
      font-weight: bold;
      width: 80px;
      color: var(--vscode-descriptionForeground, #808080);
      flex-shrink: 0;
    }
    .albert-tooltip-value {
      flex-grow: 1;
      word-break: break-all;
    }
    
    /* Collapsible Details Styles */
    .albert-flow-details {
      margin-top: 6px;
      border: 1px solid var(--albert-border-subtle, #3c3c3c);
      border-radius: var(--albert-radius-sm, 4px);
      overflow: hidden;
      font-size: 11px;
    }
    .albert-flow-details summary {
      font-weight: 600;
      padding: 4px 8px;
      background: var(--vscode-sideBar-background, #252526);
      cursor: pointer;
      user-select: none;
      outline: none;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .albert-flow-details[open] summary {
      border-bottom: 1px solid var(--albert-border-subtle, #3c3c3c);
    }
    .albert-flow-details summary:hover {
      background: var(--vscode-list-hoverBackground, #2a2d2e);
    }
    .albert-flow-details summary .count {
      color: var(--albert-muted, #808080);
      font-weight: normal;
      font-size: 10px;
    }
    .albert-flow-details-content {
      padding: 6px 8px;
      background: var(--vscode-editor-background, #1e1e1e);
      font-family: var(--vscode-editor-font-family, monospace);
      white-space: pre-wrap;
      word-break: break-all;
      overflow-x: auto;
      max-height: 200px;
    }
    .albert-flow-details-table {
      width: 100%;
      border-collapse: collapse;
      margin: 0;
      font-size: 11px;
      line-height: 1.3;
    }
    .albert-flow-details-table tr {
      border-bottom: 1px solid rgba(128, 128, 128, 0.1);
    }
    .albert-flow-details-table tr:last-child {
      border-bottom: none;
    }
    .albert-flow-details-table td {
      padding: 3px 0;
      vertical-align: top;
    }
    .albert-flow-details-table td.key {
      font-weight: bold;
      color: var(--vscode-descriptionForeground, #808080);
      width: 30%;
      padding-right: 8px;
    }
    .albert-flow-details-table td.val {
      color: var(--vscode-editor-foreground, #d4d4d4);
    }
  `;
}

function renderHeaderTable(headers: Record<string, string>): HTMLElement {
  const table = document.createElement('table');
  table.className = 'albert-flow-details-table';
  
  for (const key in headers) {
    const row = document.createElement('tr');
    
    const tdKey = document.createElement('td');
    tdKey.className = 'key';
    tdKey.textContent = key;
    
    const tdVal = document.createElement('td');
    tdVal.className = 'val';
    tdVal.textContent = headers[key];
    
    row.appendChild(tdKey);
    row.appendChild(tdVal);
    table.appendChild(row);
  }
  return table;
}

function renderAuthDetails(auth?: any): HTMLElement | null {
  if (!auth || !auth.type || auth.type === 'none') {
    return null;
  }
  const table = document.createElement('table');
  table.className = 'albert-flow-details-table';

  const addRow = (label: string, value: string) => {
    const row = document.createElement('tr');
    const tdKey = document.createElement('td');
    tdKey.className = 'key';
    tdKey.textContent = label;
    const tdVal = document.createElement('td');
    tdVal.className = 'val';
    tdVal.textContent = value;
    row.appendChild(tdKey);
    row.appendChild(tdVal);
    table.appendChild(row);
  };

  addRow('Auth Type', auth.type);

  if (auth.type === 'basic' && auth.basic) {
    addRow('Username', auth.basic.username || '—');
    addRow('Password', auth.basic.password ? '••••••••' : '—');
  } else if (auth.type === 'bearer' && auth.bearer) {
    addRow('Token', auth.bearer.token ? '••••••••' : '—');
  } else if (auth.type === 'api-key' && auth.apiKey) {
    addRow('Key', auth.apiKey.key || '—');
    addRow('Value', auth.apiKey.value ? '••••••••' : '—');
    addRow('In', auth.apiKey.in || '—');
  }

  return table;
}

function createDetailsSection(title: string, contentElement: HTMLElement | string, count?: number): HTMLElement {
  const details = document.createElement('details');
  details.className = 'albert-flow-details';

  const summary = document.createElement('summary');
  summary.innerHTML = `<span>${escapeHtml(title)}</span>${count !== undefined ? ` <span class="count">(${count})</span>` : ''}`;
  details.appendChild(summary);

  const inner = document.createElement('div');
  inner.className = 'albert-flow-details-content';
  if (typeof contentElement === 'string') {
    const pre = document.createElement('pre');
    pre.style.margin = '0';
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.wordBreak = 'break-all';
    pre.textContent = contentElement;
    inner.appendChild(pre);
  } else {
    inner.appendChild(contentElement);
  }
  details.appendChild(inner);

  return details;
}
