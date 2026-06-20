import { FlowRunHistoryEntry, HistoryFile, HistoryViewerHostToWebviewMessage, HistoryViewerWebviewToHostMessage } from '../../model/types';
import { getVsCodeApi, onHostMessage } from '../vscodeApi';
import { injectStyles } from '../styles';
import { flowResultStyles, renderRunResultBody } from '../components/flowResults';

const vscodeApi = getVsCodeApi<HistoryViewerWebviewToHostMessage>();

injectStyles();
injectHistoryStyles();

const root = document.getElementById('root')!;
root.innerHTML = '<div class="albert-main"><div id="albert-history-root"></div></div>';
const historyRoot = document.getElementById('albert-history-root') as HTMLElement;

let file: HistoryFile | null = null;
let errorMessage: string | null = null;
const expanded = new Set<string>();

function render(): void {
  historyRoot.innerHTML = '';

  if (errorMessage) {
    const err = document.createElement('div');
    err.className = 'albert-response-status err';
    err.textContent = errorMessage;
    historyRoot.appendChild(err);
    return;
  }
  if (!file) return;

  const title = document.createElement('div');
  title.className = 'albert-history-title';
  title.textContent = file.name || 'Flow run history';
  historyRoot.appendChild(title);

  const sub = document.createElement('div');
  sub.className = 'albert-env-readout';
  sub.textContent = `${file.flowRuns.length} run${file.flowRuns.length === 1 ? '' : 's'}`;
  historyRoot.appendChild(sub);

  if (file.flowRuns.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'albert-empty';
    empty.textContent = 'This history file has no runs.';
    historyRoot.appendChild(empty);
    return;
  }

  for (const entry of file.flowRuns) historyRoot.appendChild(renderEntry(entry));
}

function renderEntry(entry: FlowRunHistoryEntry): HTMLElement {
  const item = document.createElement('div');
  item.className = 'albert-flow-history-item';

  const isOpen = expanded.has(entry.id);
  const failed = !entry.result.ok;
  const stepCount = entry.result.steps.length;

  const summary = document.createElement('div');
  summary.className = 'albert-flow-history-summary';
  summary.innerHTML = `<span class="albert-flow-history-caret">${isOpen ? '▾' : '▸'}</span>
    <span class="${failed ? 'err' : 'ok'}">${failed ? '✗' : '✓'}</span>
    <strong>${escapeHtml(entry.flowName)}</strong>
    <span class="albert-flow-history-time">${new Date(entry.timestamp).toLocaleString()}</span>
    <span class="albert-flow-history-meta">${stepCount} step${stepCount === 1 ? '' : 's'}</span>`;
  summary.onclick = () => {
    if (expanded.has(entry.id)) expanded.delete(entry.id);
    else expanded.add(entry.id);
    render();
  };
  item.appendChild(summary);

  if (isOpen) item.appendChild(renderRunResultBody(entry.result));
  return item;
}

onHostMessage<HistoryViewerHostToWebviewMessage>((message) => {
  switch (message.type) {
    case 'init':
      file = message.file;
      errorMessage = null;
      // default: expand the most recent run for quick glance
      if (file.flowRuns[0]) expanded.add(file.flowRuns[0].id);
      render();
      break;
    case 'documentChanged':
      file = message.file;
      errorMessage = null;
      render();
      break;
    case 'error':
      errorMessage = message.message;
      render();
      break;
  }
});

vscodeApi.postMessage({ type: 'ready' });
render();

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

function injectHistoryStyles(): void {
  const style = document.createElement('style');
  style.textContent = `
    .albert-history-title { font-weight: 600; font-size: 14px; margin-bottom: 2px; }
    .albert-env-readout { color: var(--albert-muted); font-size: 12px; margin-bottom: 10px; }
    .albert-flow-history-item { border: 1px solid var(--albert-border); border-radius: var(--albert-radius); margin-bottom: 6px; overflow: hidden; }
    .albert-flow-history-summary { display: flex; align-items: center; gap: 8px; padding: 8px 10px; cursor: pointer; font-size: 12px; }
    .albert-flow-history-summary:hover { background: var(--vscode-list-hoverBackground); }
    .albert-flow-history-summary .ok { color: var(--albert-ok); }
    .albert-flow-history-summary .err { color: var(--albert-err); }
    .albert-flow-history-caret { width: 12px; color: var(--albert-muted); }
    .albert-flow-history-time { color: var(--albert-muted); }
    .albert-flow-history-meta { color: var(--albert-muted); }
    .albert-flow-history-item > div:not(.albert-flow-history-summary) { padding: 0 10px 10px; }
  ` + flowResultStyles();
  document.head.appendChild(style);
}
