import { HttpMethod, RequestHostToWebviewMessage } from '../../model/types';
import { onHostMessage } from '../vscodeApi';
import { injectStyles } from '../styles';
import { applyVariableLint } from '../lint/variableLint';
import { attachVariableSuggestions } from '../lint/varSuggest';
import { setWorkerBaseUri } from '../components/codeEditor';
import { renderTabs } from './Tabs';
import { store, vscodeApi } from './state';

declare global {
  interface Window {
    akrpWorkerBaseUri?: string;
  }
}

setWorkerBaseUri(window.akrpWorkerBaseUri ?? '');

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

injectStyles();

const root = document.getElementById('root')!;
root.innerHTML = `
  <div class="akrp-main">
    <div id="akrp-header"></div>
    <div id="akrp-tabs"></div>
  </div>
`;

const headerEl = document.getElementById('akrp-header') as HTMLElement;
const tabsEl = document.getElementById('akrp-tabs') as HTMLElement;

function render(): void {
  renderHeader(headerEl);
  renderTabs(tabsEl);
  store.scheduleDiagnostics();
}

function renderHeader(container: HTMLElement): void {
  container.innerHTML = '';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = store.file.name;
  nameInput.style.fontWeight = '600';
  nameInput.style.marginBottom = '6px';
  nameInput.style.width = '100%';
  nameInput.oninput = () => {
    store.mutateQuiet(() => {
      store.file.name = nameInput.value;
    });
  };
  container.appendChild(nameInput);

  const envReadout = document.createElement('div');
  envReadout.className = 'akrp-env-readout';
  envReadout.textContent = `Env: ${store.activeEnvName ?? 'none'}`;
  container.appendChild(envReadout);

  const urlBar = document.createElement('div');
  urlBar.className = 'akrp-url-bar';

  const methodSelect = document.createElement('select');
  for (const method of METHODS) {
    const opt = document.createElement('option');
    opt.value = method;
    opt.textContent = method;
    if (method === store.file.request.method) opt.selected = true;
    methodSelect.appendChild(opt);
  }
  methodSelect.onchange = () => {
    store.mutate(() => {
      store.file.request.method = methodSelect.value as HttpMethod;
    });
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
    sendBtn.onclick = () => store.send();
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
      break;
    case 'documentChanged':
      store.setFile(message.file);
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
    case 'error':
      console.error('[Albert]', message.message);
      break;
  }
});

vscodeApi.postMessage({ type: 'ready' });

render();
