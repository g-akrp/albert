import { SendResult } from '../../model/types';
import { renderTestResults } from '../components/TestResults';
import { renderResolvedRequestBlocks } from '../components/ResolvedRequestBlocks';
import { createCodeBlock } from '../components/CodeBlock';
import { prettyJson, responseLooksJson } from '../format';
import { store } from './state';

type ResponseSubTabId = 'body' | 'headers' | 'tests' | 'request';
type BodyFormat = 'json' | 'plaintext';

let activeSubTab: ResponseSubTabId = 'body';
// User's chosen response-body view; null means "auto" (pick by content-type on first render).
let bodyFormat: BodyFormat | null = null;

export function renderResponseTab(outerContainer: HTMLElement, container: HTMLElement): void {
  container.innerHTML = '';

  if (store.sending) {
    const status = document.createElement('div');
    status.className = 'akrp-response';
    status.textContent = 'Sending request...';
    container.appendChild(status);
    return;
  }

  if (!store.lastResult) {
    const empty = document.createElement('div');
    empty.className = 'akrp-empty';
    empty.textContent = 'No response yet. Click Send to make a request.';
    container.appendChild(empty);
    return;
  }

  const statusRow = document.createElement('div');
  statusRow.className = 'akrp-response-statusrow';
  statusRow.appendChild(buildStatusBadge(store.lastResult));
  const saveBtn = document.createElement('button');
  saveBtn.className = 'secondary';
  saveBtn.textContent = 'Save result as .md';
  saveBtn.title = 'Export this run (status, tests, request, response, scripts, schema) to a Markdown file';
  saveBtn.onclick = () => store.saveResultMarkdown();
  statusRow.appendChild(saveBtn);
  container.appendChild(statusRow);

  const subTabBar = document.createElement('div');
  subTabBar.className = 'akrp-tabs';
  const subTabs: { id: ResponseSubTabId; label: string }[] = [
    { id: 'body', label: 'Body' },
    { id: 'headers', label: 'Headers' },
    { id: 'tests', label: 'Tests' },
    { id: 'request', label: 'Request' },
  ];
  for (const tab of subTabs) {
    const el = document.createElement('div');
    el.className = 'akrp-tab' + (tab.id === activeSubTab ? ' active' : '');
    el.textContent = tab.label;
    el.onclick = () => {
      activeSubTab = tab.id;
      renderResponseTab(outerContainer, container);
    };
    subTabBar.appendChild(el);
  }
  container.appendChild(subTabBar);

  const content = document.createElement('div');
  switch (activeSubTab) {
    case 'body':
      renderBodySubTab(content);
      break;
    case 'headers':
      renderHeadersSubTab(content);
      break;
    case 'tests':
      renderTestsSubTab(content);
      break;
    case 'request':
      renderRequestSubTab(content);
      break;
  }
  container.appendChild(content);
}

function buildStatusBadge(result: SendResult): HTMLElement {
  const badge = document.createElement('div');
  const ok = !result.error && result.status >= 200 && result.status < 400;
  badge.className = 'akrp-response-status ' + (ok ? 'ok' : 'err');
  badge.textContent = result.error ? `Error: ${result.error}` : `${result.status} ${result.statusText} — ${result.timeMs}ms`;
  return badge;
}

function renderBodySubTab(container: HTMLElement): void {
  const result = store.lastResult!;
  if (bodyFormat === null) {
    bodyFormat = responseLooksJson(result.body, result.headers) ? 'json' : 'plaintext';
  }

  const formatSelect = document.createElement('select');
  for (const [value, label] of [['json', 'Pretty JSON'], ['plaintext', 'Plain text']] as const) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    if (value === bodyFormat) opt.selected = true;
    formatSelect.appendChild(opt);
  }

  const render = (fmt: BodyFormat): string => (fmt === 'json' ? prettyJson(result.body) : result.body);

  const block = createCodeBlock(render(bodyFormat), { copy: true, toolbarExtra: formatSelect });
  formatSelect.onchange = () => {
    bodyFormat = formatSelect.value as BodyFormat;
    block.setContent(render(bodyFormat));
  };
  container.appendChild(block.element);
}

function renderHeadersSubTab(container: HTMLElement): void {
  const result = store.lastResult!;
  const text = Object.entries(result.headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  container.appendChild(createCodeBlock(text, { copy: true }).element);
}

function renderTestsSubTab(container: HTMLElement): void {
  if (store.lastTestRunSource === 'live' && store.lastTestRun) {
    renderTestResults(container, store.lastTestRun);
  } else {
    const empty = document.createElement('div');
    empty.className = 'akrp-empty';
    empty.textContent = 'No test results for this response.';
    container.appendChild(empty);
  }
}

function renderRequestSubTab(container: HTMLElement): void {
  if (store.lastRequestUsed) {
    renderResolvedRequestBlocks(container, store.lastRequestUsed);
  } else {
    const empty = document.createElement('div');
    empty.className = 'akrp-empty';
    empty.textContent = 'No request info available.';
    container.appendChild(empty);
  }
}
