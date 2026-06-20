import { renderTestResults } from '../components/TestResults';
import { renderResolvedRequestBlocks } from '../components/ResolvedRequestBlocks';
import { formatResponseBody } from '../format';
import { HistoryEntry, store } from './state';

export function renderHistoryTab(container: HTMLElement): void {
  container.innerHTML = '';

  if (store.history.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'akrp-empty';
    empty.textContent = 'No requests sent yet this session.';
    container.appendChild(empty);
    return;
  }

  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear history';
  clearBtn.className = 'secondary';
  clearBtn.style.marginBottom = '8px';
  clearBtn.onclick = () => store.clearHistory();
  container.appendChild(clearBtn);

  for (const entry of store.history) {
    container.appendChild(buildHistoryEntry(entry));
  }
}

function buildHistoryEntry(entry: HistoryEntry): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'akrp-result-block';

  const headerRow = document.createElement('div');
  headerRow.className = 'akrp-tree-item';
  headerRow.style.cursor = 'pointer';
  const ok = !entry.result.error && entry.result.status >= 200 && entry.result.status < 400;
  const badge = document.createElement('span');
  badge.className = 'icon ' + (ok ? 'pass' : 'fail');
  badge.textContent = ok ? '✓' : '✗';
  const label = document.createElement('span');
  label.style.flex = '1';
  label.textContent = `${formatTime(entry.timestamp)} — ${entry.request.method} ${entry.request.url} (${entry.result.status || 'error'}, ${entry.result.timeMs}ms)`;
  headerRow.append(badge, label);
  headerRow.onclick = () => store.toggleHistoryExpanded(entry.id);
  wrapper.appendChild(headerRow);

  if (store.expandedHistoryIds.has(entry.id)) {
    const details = document.createElement('div');
    details.style.marginTop = '8px';

    const requestTitle = document.createElement('div');
    requestTitle.className = 'akrp-section-title';
    requestTitle.textContent = 'Request';
    details.appendChild(requestTitle);
    const requestBlocks = document.createElement('div');
    renderResolvedRequestBlocks(requestBlocks, entry.request);
    details.appendChild(requestBlocks);

    const responseTitle = document.createElement('div');
    responseTitle.className = 'akrp-section-title';
    responseTitle.textContent = 'Response body';
    details.appendChild(responseTitle);
    const responsePre = document.createElement('pre');
    responsePre.textContent = formatResponseBody(entry.result.body, entry.result.headers);
    details.appendChild(responsePre);

    const testsTitle = document.createElement('div');
    testsTitle.className = 'akrp-section-title';
    testsTitle.textContent = 'Tests';
    details.appendChild(testsTitle);
    const testsEl = document.createElement('div');
    renderTestResults(testsEl, entry.testRun);
    details.appendChild(testsEl);

    wrapper.appendChild(details);
  }

  return wrapper;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString();
}
