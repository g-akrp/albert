import { ResolvedRequestPreview } from '../../model/types';
import { buildCurlCommand } from '../curl';
import { createCodeBlock } from './CodeBlock';

/** Read-only block-style breakdown of a resolved request (variables already substituted) —
 *  used by the Preview tab and the Response > Request sub-tab / History entries. */
export function renderResolvedRequestBlocks(container: HTMLElement, preview: ResolvedRequestPreview): void {
  container.innerHTML = '';

  const general = document.createElement('div');
  general.className = 'akrp-result-block';
  const generalTitleRow = document.createElement('div');
  generalTitleRow.style.display = 'flex';
  generalTitleRow.style.alignItems = 'center';
  generalTitleRow.style.gap = '8px';
  const generalTitle = document.createElement('div');
  generalTitle.className = 'akrp-section-title';
  generalTitle.textContent = 'General';
  generalTitleRow.appendChild(generalTitle);

  const copyCurlBtn = document.createElement('button');
  copyCurlBtn.textContent = 'Copy as cURL';
  copyCurlBtn.className = 'secondary';
  copyCurlBtn.onclick = () => {
    navigator.clipboard.writeText(buildCurlCommand(preview)).then(
      () => {
        copyCurlBtn.textContent = 'Copied!';
        setTimeout(() => (copyCurlBtn.textContent = 'Copy as cURL'), 1500);
      },
      (err) => console.error('[Albert] failed to copy cURL command', err)
    );
  };
  generalTitleRow.appendChild(copyCurlBtn);
  general.appendChild(generalTitleRow);

  const generalLine = document.createElement('div');
  generalLine.textContent = `${preview.method} ${preview.url}`;
  general.appendChild(generalLine);
  container.appendChild(general);

  appendKeyValueBlock(
    container,
    'Query',
    preview.query.map((q) => [q.key, q.value])
  );
  appendKeyValueBlock(
    container,
    'Headers',
    preview.headers.map((h) => [h.name, h.value])
  );

  const bodyBlock = document.createElement('div');
  bodyBlock.className = 'akrp-result-block';
  const bodyTitle = document.createElement('div');
  bodyTitle.className = 'akrp-section-title';
  bodyTitle.textContent = `Body (${preview.body.mode})`;
  bodyBlock.appendChild(bodyTitle);
  if (preview.body.mode !== 'none' && preview.body.content) {
    bodyBlock.appendChild(createCodeBlock(preview.body.content, { copy: true }).element);
  } else {
    const empty = document.createElement('div');
    empty.className = 'akrp-empty';
    empty.textContent = 'No body';
    bodyBlock.appendChild(empty);
  }
  container.appendChild(bodyBlock);

  const authBlock = document.createElement('div');
  authBlock.className = 'akrp-result-block';
  const authTitle = document.createElement('div');
  authTitle.className = 'akrp-section-title';
  authTitle.textContent = 'Auth';
  authBlock.appendChild(authTitle);
  const authLine = document.createElement('div');
  authLine.textContent = preview.auth.summary;
  authBlock.appendChild(authLine);
  container.appendChild(authBlock);
}

function appendKeyValueBlock(container: HTMLElement, title: string, entries: [string, string][]): void {
  const block = document.createElement('div');
  block.className = 'akrp-result-block';
  const heading = document.createElement('div');
  heading.className = 'akrp-section-title';
  heading.textContent = title;
  block.appendChild(heading);

  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'akrp-empty';
    empty.textContent = 'None';
    block.appendChild(empty);
  } else {
    for (const [name, value] of entries) {
      const row = document.createElement('div');
      row.className = 'akrp-kv-row';
      const nameEl = document.createElement('span');
      nameEl.style.fontWeight = '600';
      nameEl.style.minWidth = '120px';
      nameEl.textContent = name;
      const valueEl = document.createElement('span');
      valueEl.textContent = value;
      row.append(nameEl, valueEl);
      block.appendChild(row);
    }
  }
  container.appendChild(block);
}
