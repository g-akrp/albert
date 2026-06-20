import { FlowRunResult, FlowStepResult } from '../../model/types';

/** Renders a single step's result card (status, checks, body preview). Shared by the flow editor's
 *  live results / history and the .abh viewer. */
export function renderStepResult(result: FlowStepResult): HTMLElement {
  const card = document.createElement('div');
  const failed = !!result.error || result.checks.some((c) => !c.pass);
  card.className = 'albert-flow-result' + (failed ? ' err' : ' ok');

  const head = document.createElement('div');
  head.className = 'albert-flow-result-head';
  const statusClass = result.status >= 200 && result.status < 400 ? 'ok' : 'err';
  head.innerHTML = `<strong>${escapeHtml(result.name)}</strong> <span class="albert-flow-result-meta">${escapeHtml(
    result.method
  )} <span class="${statusClass}">${result.status || '—'}</span> · ${Math.round(result.durationMs)} ms</span>`;
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
    .albert-flow-result-head { display: flex; justify-content: space-between; gap: 8px; }
    .albert-flow-result-meta { color: var(--albert-muted); font-size: 12px; }
    .albert-flow-result-meta .ok { color: var(--albert-ok); }
    .albert-flow-result-meta .err { color: var(--albert-err); }
    .albert-flow-result-url { font-family: var(--vscode-editor-font-family); font-size: 11px; color: var(--albert-muted); word-break: break-all; margin: 3px 0; }
    .albert-flow-check { font-size: 12px; }
    .albert-flow-check.ok { color: var(--albert-ok); }
    .albert-flow-check.err { color: var(--albert-err); }
    .albert-flow-result pre { margin: 6px 0 0; max-height: 160px; overflow: auto; background: var(--vscode-editor-background); border-radius: var(--albert-radius-sm); padding: 8px 10px; font-size: 11px; white-space: pre-wrap; word-break: break-word; }
  `;
}
