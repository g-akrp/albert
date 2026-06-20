import { FlowRunResult, FlowStepResult } from '../../model/types';

/** Renders a single step's result card (status, checks, body preview). Shared by the flow editor's
 *  live results / history and the .abh viewer. */
export function renderStepResult(result: FlowStepResult): HTMLElement {
  const card = document.createElement('div');
  const failed = !!result.error || result.checks.some((c) => !c.pass);
  card.className = 'akrp-flow-result' + (failed ? ' err' : ' ok');

  const head = document.createElement('div');
  head.className = 'akrp-flow-result-head';
  const statusClass = result.status >= 200 && result.status < 400 ? 'ok' : 'err';
  head.innerHTML = `<strong>${escapeHtml(result.name)}</strong> <span class="akrp-flow-result-meta">${escapeHtml(
    result.method
  )} <span class="${statusClass}">${result.status || '—'}</span> · ${Math.round(result.durationMs)} ms</span>`;
  card.appendChild(head);

  const url = document.createElement('div');
  url.className = 'akrp-flow-result-url';
  url.textContent = result.url;
  card.appendChild(url);

  if (result.error) {
    const err = document.createElement('div');
    err.className = 'akrp-response-status err';
    err.textContent = result.error;
    card.appendChild(err);
  }

  for (const check of result.checks) {
    const row = document.createElement('div');
    row.className = 'akrp-flow-check ' + (check.pass ? 'ok' : 'err');
    row.textContent = `${check.pass ? '✓' : '✗'} ${check.description}`;
    card.appendChild(row);
  }

  if (result.bodyPreview) {
    const pre = document.createElement('pre');
    pre.textContent = result.bodyPreview;
    card.appendChild(pre);
  }

  return card;
}

/** Renders the body of a whole run: each step plus a pass/fail verdict. */
export function renderRunResultBody(result: FlowRunResult): HTMLElement {
  const wrap = document.createElement('div');

  if (result.error) {
    const err = document.createElement('div');
    err.className = 'akrp-response-status err';
    err.textContent = result.error;
    wrap.appendChild(err);
  }

  for (const step of result.steps) wrap.appendChild(renderStepResult(step));

  if (!result.error) {
    const verdict = document.createElement('div');
    verdict.className = 'akrp-response-status ' + (result.ok ? 'ok' : 'err');
    verdict.textContent = result.ok ? '✓ Flow passed' : '✗ Flow had failures';
    wrap.appendChild(verdict);
  }

  return wrap;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

/** CSS for the result cards — shared so the flow editor and the viewer look identical. */
export function flowResultStyles(): string {
  return `
    .akrp-response-status.ok { color: var(--vscode-testing-iconPassed, #2cbb4b); }
    .akrp-response-status.err { color: var(--vscode-testing-iconFailed, #d9534f); }
    .akrp-flow-result { border-left: 3px solid var(--vscode-panel-border); padding: 6px 8px; margin-bottom: 6px; background: var(--vscode-textCodeBlock-background); }
    .akrp-flow-result.ok { border-left-color: var(--vscode-testing-iconPassed, #2cbb4b); }
    .akrp-flow-result.err { border-left-color: var(--vscode-testing-iconFailed, #d9534f); }
    .akrp-flow-result-head { display: flex; justify-content: space-between; gap: 8px; }
    .akrp-flow-result-meta { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .akrp-flow-result-meta .ok { color: var(--vscode-testing-iconPassed, #2cbb4b); }
    .akrp-flow-result-meta .err { color: var(--vscode-testing-iconFailed, #d9534f); }
    .akrp-flow-result-url { font-family: var(--vscode-editor-font-family); font-size: 11px; color: var(--vscode-descriptionForeground); word-break: break-all; margin: 2px 0; }
    .akrp-flow-check { font-size: 12px; }
    .akrp-flow-check.ok { color: var(--vscode-testing-iconPassed, #2cbb4b); }
    .akrp-flow-check.err { color: var(--vscode-testing-iconFailed, #d9534f); }
    .akrp-flow-result pre { margin: 6px 0 0; max-height: 160px; overflow: auto; background: var(--vscode-editor-background); padding: 6px; font-size: 11px; white-space: pre-wrap; word-break: break-word; }
  `;
}
