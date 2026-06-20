import { EnvHostToWebviewMessage } from '../../model/types';
import { onHostMessage } from '../vscodeApi';
import { injectStyles } from '../styles';
import { renderKeyValueTable } from '../components/KeyValueTable';
import { store, vscodeApi } from './state';

injectStyles();

const root = document.getElementById('root')!;
root.innerHTML = `
  <div class="akrp-main">
    <div id="akrp-name"></div>
    <div id="akrp-variables"></div>
    <div id="akrp-settings"></div>
  </div>
`;

const nameEl = document.getElementById('akrp-name') as HTMLElement;
const variablesEl = document.getElementById('akrp-variables') as HTMLElement;
const settingsEl = document.getElementById('akrp-settings') as HTMLElement;

function render(): void {
  renderName(nameEl);
  renderVariables(variablesEl);
  renderSettings(settingsEl);
}

function renderName(container: HTMLElement): void {
  container.innerHTML = '';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = store.file.name;
  nameInput.style.fontWeight = '600';
  nameInput.style.marginBottom = '10px';
  nameInput.style.width = '100%';
  nameInput.oninput = () => {
    store.mutateQuiet(() => {
      store.file.name = nameInput.value;
    });
  };
  container.appendChild(nameInput);
}

function renderVariables(container: HTMLElement): void {
  container.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'akrp-section-title';
  title.textContent = 'Variables';
  container.appendChild(title);

  const tableEl = document.createElement('div');
  container.appendChild(tableEl);
  renderKeyValueTable(
    tableEl,
    () => store.file.variables,
    () => store.mutateQuiet(() => {}),
    () => store.mutate(() => {})
  );
}

function renderSettings(container: HTMLElement): void {
  container.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'akrp-section-title';
  title.textContent = 'Settings';
  container.appendChild(title);

  const timeoutRow = document.createElement('div');
  timeoutRow.className = 'akrp-row';
  const timeoutLabel = document.createElement('label');
  timeoutLabel.textContent = 'Timeout (ms)';
  const timeoutInput = document.createElement('input');
  timeoutInput.type = 'number';
  timeoutInput.value = String(store.file.settings.timeoutMs ?? '');
  timeoutInput.oninput = () => {
    store.mutateQuiet(() => {
      const parsed = Number(timeoutInput.value);
      store.file.settings.timeoutMs = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    });
  };
  timeoutRow.append(timeoutLabel, timeoutInput);
  container.appendChild(timeoutRow);

  const redirectsRow = document.createElement('div');
  redirectsRow.className = 'akrp-checkbox-row';
  const redirectsCheckbox = document.createElement('input');
  redirectsCheckbox.type = 'checkbox';
  redirectsCheckbox.checked = store.file.settings.followRedirects !== false;
  redirectsCheckbox.onchange = () => {
    store.mutate(() => {
      store.file.settings.followRedirects = redirectsCheckbox.checked;
    });
  };
  const redirectsLabel = document.createElement('span');
  redirectsLabel.textContent = 'Follow redirects';
  redirectsRow.append(redirectsCheckbox, redirectsLabel);
  container.appendChild(redirectsRow);
}

store.subscribe(render);

onHostMessage<EnvHostToWebviewMessage>((message) => {
  switch (message.type) {
    case 'init':
    case 'documentChanged':
      store.setFile(message.file);
      break;
    case 'error':
      console.error('[Albert]', message.message);
      break;
  }
});

vscodeApi.postMessage({ type: 'ready' });
render();
