import { FlowRunHistoryEntry, HistoryFile, HistoryViewerHostToWebviewMessage, HistoryViewerWebviewToHostMessage } from '../../model/types';
import { getVsCodeApi, onHostMessage } from '../vscodeApi';
import { injectStyles } from '../styles';
import { flowResultStyles, renderRunResultBody } from '../components/flowResults';

const vscodeApi = getVsCodeApi<HistoryViewerWebviewToHostMessage>();

injectStyles();
injectHistoryStyles();

const root = document.getElementById('root')!;
root.innerHTML = '<div class="akrp-main"><div id="akrp-history-root"></div></div>';
const historyRoot = document.getElementById('akrp-history-root') as HTMLElement;

let file: HistoryFile | null = null;
let errorMessage: string | null = null;
const expanded = new Set<string>();

function render(): void {
  historyRoot.innerHTML = '';

  if (errorMessage) {
    const err = document.createElement('div');
    err.className = 'akrp-response-status err';
    err.textContent = errorMessage;
    historyRoot.appendChild(err);
    return;
  }
  if (!file) return;

  const title = document.createElement('div');
  title.className = 'akrp-history-title';
  title.textContent = file.name || 'Flow run history';
  historyRoot.appendChild(title);

  const sub = document.createElement('div');
  sub.className = 'akrp-env-readout';
  sub.textContent = `${file.flowRuns.length} run${file.flowRuns.length === 1 ? '' : 's'}`;
  historyRoot.appendChild(sub);

  if (file.flowRuns.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'akrp-empty';
    empty.textContent = 'This history file has no runs.';
    historyRoot.appendChild(empty);
    return;
  }

  for (const entry of file.flowRuns) historyRoot.appendChild(renderEntry(entry));
}

function renderEntry(entry: FlowRunHistoryEntry): HTMLElement {
  const item = document.createElement('div');
  item.className = 'akrp-flow-history-item';

  const isOpen = expanded.has(entry.id);
  const failed = !entry.result.ok;
  const stepCount = entry.result.steps.length;

  const summary = document.createElement('div');
  summary.className = 'akrp-flow-history-summary';
  summary.innerHTML = `<span class="akrp-flow-history-caret">${isOpen ? '▾' : '▸'}</span>
    <span class="${failed ? 'err' : 'ok'}">${failed ? '✗' : '✓'}</span>
    <strong>${escapeHtml(entry.flowName)}</strong>
    <span class="akrp-flow-history-time">${new Date(entry.timestamp).toLocaleString()}</span>
    <span class="akrp-flow-history-meta">${stepCount} step${stepCount === 1 ? '' : 's'}</span>`;
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
    .akrp-history-title { font-weight: 600; font-size: 14px; margin-bottom: 2px; }
    .akrp-env-readout { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 10px; }
    .akrp-flow-history-item { border: 1px solid var(--vscode-panel-border); border-radius: 4px; margin-bottom: 6px; }
    .akrp-flow-history-summary { display: flex; align-items: center; gap: 8px; padding: 6px 8px; cursor: pointer; font-size: 12px; }
    .akrp-flow-history-summary:hover { background: var(--vscode-list-hoverBackground); }
    .akrp-flow-history-summary .ok { color: var(--vscode-testing-iconPassed, #2cbb4b); }
    .akrp-flow-history-summary .err { color: var(--vscode-testing-iconFailed, #d9534f); }
    .akrp-flow-history-caret { width: 12px; color: var(--vscode-descriptionForeground); }
    .akrp-flow-history-time { color: var(--vscode-descriptionForeground); }
    .akrp-flow-history-meta { color: var(--vscode-descriptionForeground); }
    .akrp-flow-history-item > div:not(.akrp-flow-history-summary) { padding: 0 8px 8px; }
  ` + flowResultStyles();
  document.head.appendChild(style);
}
