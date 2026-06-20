import { HttpMethod, RequestHostToWebviewMessage } from '../../model/types';
import { onHostMessage } from '../vscodeApi';
import { injectStyles } from '../styles';
import { applyVariableLint } from '../lint/variableLint';
import { attachVariableSuggestions } from '../lint/varSuggest';
import { setWorkerBaseUri } from '../components/codeEditor';
import { renderTabs, showResponseTab } from './Tabs';
import { store, vscodeApi } from './state';

declare global {
  interface Window {
    albertWorkerBaseUri?: string;
  }
}

setWorkerBaseUri(window.albertWorkerBaseUri ?? '');

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

injectStyles();

const root = document.getElementById('root')!;
root.innerHTML = `
  <div class="albert-main">
    <div id="albert-header"></div>
    <div id="albert-tabs"></div>
  </div>
`;

const headerEl = document.getElementById('albert-header') as HTMLElement;
const tabsEl = document.getElementById('albert-tabs') as HTMLElement;

function render(): void {
  renderHeader(headerEl);
  renderTabs(tabsEl);
  store.scheduleDiagnostics();
}

function styleMethodSelect(select: HTMLSelectElement): void {
  const method = select.value as HttpMethod;
  const colors: Record<HttpMethod, { color: string; bg: string; border: string }> = {
    GET: { color: 'var(--vscode-testing-iconPassed, #2cbb4b)', bg: 'rgba(44, 187, 75, 0.1)', border: 'rgba(44, 187, 75, 0.4)' },
    POST: { color: '#e28743', bg: 'rgba(226, 135, 67, 0.1)', border: 'rgba(226, 135, 67, 0.4)' },
    PUT: { color: '#2d8cf0', bg: 'rgba(45, 140, 240, 0.1)', border: 'rgba(45, 140, 240, 0.4)' },
    DELETE: { color: 'var(--vscode-testing-iconFailed, #d9534f)', bg: 'rgba(217, 83, 79, 0.1)', border: 'rgba(217, 83, 79, 0.4)' },
    PATCH: { color: '#a951ed', bg: 'rgba(169, 81, 237, 0.1)', border: 'rgba(169, 81, 237, 0.4)' },
    HEAD: { color: 'var(--vscode-descriptionForeground, gray)', bg: 'rgba(128, 128, 128, 0.1)', border: 'rgba(128, 128, 128, 0.3)' },
    OPTIONS: { color: 'var(--vscode-descriptionForeground, gray)', bg: 'rgba(128, 128, 128, 0.1)', border: 'rgba(128, 128, 128, 0.3)' },
  };

  const scheme = colors[method] || colors.GET;
  select.style.color = scheme.color;
  select.style.backgroundColor = scheme.bg;
  select.style.borderColor = scheme.border;
  select.style.fontWeight = 'bold';
}

function renderHeader(container: HTMLElement): void {
  container.innerHTML = '';

  const topRow = document.createElement('div');
  topRow.style.display = 'flex';
  topRow.style.alignItems = 'center';
  topRow.style.justifyContent = 'space-between';
  topRow.style.gap = '12px';
  topRow.style.marginBottom = '12px';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = store.file.name;
  nameInput.style.fontWeight = '600';
  nameInput.style.flex = '1';
  nameInput.oninput = () => {
    store.mutateQuiet(() => {
      store.file.name = nameInput.value;
    });
  };
  topRow.appendChild(nameInput);

  const envBadge = document.createElement('div');
  const hasEnv = !!store.activeEnvName;
  envBadge.className = 'albert-env-badge';
  envBadge.style.display = 'inline-flex';
  envBadge.style.alignItems = 'center';
  envBadge.style.gap = '6px';
  envBadge.style.padding = '4px 10px';
  envBadge.style.borderRadius = '12px';
  envBadge.style.fontSize = '11px';
  envBadge.style.fontWeight = '600';
  envBadge.style.border = '1px solid var(--albert-border)';
  envBadge.style.background = 'var(--vscode-editorWidget-background, rgba(128, 128, 128, 0.08))';

  const dot = document.createElement('span');
  dot.style.width = '6px';
  dot.style.height = '6px';
  dot.style.borderRadius = '50%';
  dot.style.background = hasEnv ? 'var(--albert-ok, #2cbb4b)' : 'var(--albert-muted, #808080)';

  const text = document.createElement('span');
  text.textContent = hasEnv ? `Env: ${store.activeEnvName}` : 'No environment';
  text.style.color = hasEnv ? 'var(--vscode-foreground)' : 'var(--albert-muted)';

  envBadge.append(dot, text);
  topRow.appendChild(envBadge);
  container.appendChild(topRow);

  const urlBar = document.createElement('div');
  urlBar.className = 'albert-url-bar';

  const methodSelect = document.createElement('select');
  for (const method of METHODS) {
    const opt = document.createElement('option');
    opt.value = method;
    opt.textContent = method;
    if (method === store.file.request.method) opt.selected = true;
    methodSelect.appendChild(opt);
  }
  styleMethodSelect(methodSelect);

  methodSelect.onchange = () => {
    store.mutate(() => {
      store.file.request.method = methodSelect.value as HttpMethod;
    });
    styleMethodSelect(methodSelect);
  };

  const endpointInput = document.createElement('input');
  endpointInput.type = 'text';
  endpointInput.placeholder = 'Endpoint, e.g. {{baseUrl}}';
  endpointInput.value = store.file.request.endpoint;
  endpointInput.style.flex = '1';
  endpointInput.oninput = () => {
    store.mutateQuiet(() => {
      store.file.request.endpoint = endpointInput.value;
    });
    applyVariableLint(endpointInput, store.activeEnvVariableNames, store.activeEnvVariables);
  };
  applyVariableLint(endpointInput, store.activeEnvVariableNames, store.activeEnvVariables);
  attachVariableSuggestions(endpointInput, () => store.activeEnvVariableNames);

  const pathInput = document.createElement('input');
  pathInput.type = 'text';
  pathInput.placeholder = 'Path, e.g. /users/1';
  pathInput.value = store.file.request.path;
  pathInput.style.flex = '1';
  pathInput.oninput = () => {
    store.mutateQuiet(() => {
      store.file.request.path = pathInput.value;
    });
    applyVariableLint(pathInput, store.activeEnvVariableNames, store.activeEnvVariables);
  };
  applyVariableLint(pathInput, store.activeEnvVariableNames, store.activeEnvVariables);
  attachVariableSuggestions(pathInput, () => store.activeEnvVariableNames);

  const sendBtn = document.createElement('button');
  if (store.sending) {
    sendBtn.textContent = 'Cancel';
    sendBtn.className = 'secondary';
    sendBtn.onclick = () => store.cancelSend();
  } else {
    sendBtn.textContent = 'Send';
    sendBtn.onclick = () => {
      showResponseTab();
      store.send();
    };
  }

  urlBar.append(methodSelect, endpointInput, pathInput, sendBtn);
  container.appendChild(urlBar);
}

store.subscribe(render);

onHostMessage<RequestHostToWebviewMessage>((message) => {
  switch (message.type) {
    case 'init':
      store.setFile(message.file);
      store.setFileUri(message.fileUri);
      store.setActiveEnvName(message.activeEnvName, message.envVariableNames, message.envVariables);
      store.availableStories = message.allureStories || [];
      break;
    case 'documentChanged':
      store.setFile(message.file);
      store.availableStories = message.allureStories || [];
      break;
    case 'activeEnvironmentChanged':
      store.setActiveEnvName(message.activeEnvName, message.envVariableNames, message.envVariables);
      break;
    case 'responseResult':
      store.setResponse(message.result, message.testRun, message.request);
      break;
    case 'sampleTestResult':
      store.setSampleTestRun(message.testRun);
      break;
    case 'previewResult':
      store.setPreviewResult(message.preview);
      break;
    case 'epicPicked':
      store.mutate((file) => {
        file.allureReportConfig.epicPath = message.epicPath;
        file.allureReportConfig.featurePath = '';
        file.allureReportConfig.feature = '';
        file.allureReportConfig.story = '';
      });
      store.availableStories = [];
      break;
    case 'featurePicked':
      store.mutate((file) => {
        file.allureReportConfig.featurePath = message.featurePath;
        file.allureReportConfig.feature = message.featureName;
        file.allureReportConfig.story = message.stories[0] || '';
      });
      store.availableStories = message.stories;
      break;
    case 'error':
      console.error('[Albert]', message.message);
      break;
  }
});

vscodeApi.postMessage({ type: 'ready' });

render();
