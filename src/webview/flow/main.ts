import { FlowHostToWebviewMessage } from '../../model/types';
import { onHostMessage } from '../vscodeApi';
import { injectStyles } from '../styles';
import { flowResultStyles } from '../components/flowResults';
import { renderFlow } from './FlowEditor';
import { store, vscodeApi } from './state';

injectStyles();
injectFlowStyles();

const root = document.getElementById('root')!;
root.innerHTML = '<div class="akrp-main"><div id="akrp-flow-root"></div></div>';
const flowRoot = document.getElementById('akrp-flow-root') as HTMLElement;

function render(): void {
  renderFlow(flowRoot);
}

store.subscribe(render);

onHostMessage<FlowHostToWebviewMessage>((message) => {
  switch (message.type) {
    case 'init':
      store.setFile(message.file);
      store.fileUri = message.fileUri;
      store.setActiveEnvName(message.activeEnvName);
      break;
    case 'documentChanged':
      store.setFile(message.file);
      break;
    case 'activeEnvironmentChanged':
      store.setActiveEnvName(message.activeEnvName);
      break;
    case 'requestPicked':
      store.setRequestPath(message.stepId, message.requestPath);
      break;
    case 'flowStarted':
      store.onStarted();
      break;
    case 'flowStep':
      store.onStep(message.result);
      break;
    case 'flowDone':
      store.onDone(message.result);
      break;
    case 'error':
      console.error('[Albert]', message.message);
      break;
  }
});

vscodeApi.postMessage({ type: 'ready' });
render();

function injectFlowStyles(): void {
  const style = document.createElement('style');
  style.textContent = `
    .akrp-env-readout { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 8px; }
    .akrp-flow-toolbar { display: flex; gap: 6px; margin-bottom: 12px; }
    .akrp-flow-step { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px; margin-bottom: 8px; }
    .akrp-flow-step.disabled { opacity: 0.55; }
    .akrp-flow-step-top { display: flex; align-items: center; gap: 6px; }
    .akrp-flow-step-num { font-weight: 600; width: 18px; text-align: center; color: var(--vscode-descriptionForeground); }
    .akrp-icon-btn { padding: 2px 6px; min-width: 24px; }
    .akrp-flow-req-row { display: flex; align-items: center; gap: 8px; margin: 6px 0 4px 24px; }
    .akrp-flow-req-path { font-family: var(--vscode-editor-font-family); font-size: 12px; }
    .akrp-flow-req-path.missing { color: var(--vscode-errorForeground); }
    .akrp-flow-validate { display: flex; align-items: center; gap: 6px; margin: 4px 0 6px 24px; font-size: 12px; }
    .akrp-flow-captures { margin: 4px 0 0 24px; border-top: 1px dashed var(--vscode-panel-border); padding-top: 6px; }
    .akrp-flow-captures-title { font-size: 11px; text-transform: uppercase; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
    .akrp-flow-captures .akrp-kv-row input[type=text] { flex: 1; }
    .akrp-flow-captures select { flex: 0 0 90px; }
    .akrp-flow-add-capture { margin-top: 2px; }
    .akrp-flow-results { margin-top: 16px; border-top: 1px solid var(--vscode-panel-border); padding-top: 8px; }
    .akrp-flow-history { margin-top: 16px; border-top: 1px solid var(--vscode-panel-border); padding-top: 8px; }
    .akrp-flow-history-head { display: flex; align-items: center; gap: 6px; }
    .akrp-flow-history-head .akrp-section-title { margin: 0; }
    .akrp-flow-history-item { border: 1px solid var(--vscode-panel-border); border-radius: 4px; margin-bottom: 6px; }
    .akrp-flow-history-summary { display: flex; align-items: center; gap: 8px; padding: 6px 8px; cursor: pointer; font-size: 12px; }
    .akrp-flow-history-summary:hover { background: var(--vscode-list-hoverBackground); }
    .akrp-flow-history-summary .ok { color: var(--vscode-testing-iconPassed, #2cbb4b); }
    .akrp-flow-history-summary .err { color: var(--vscode-testing-iconFailed, #d9534f); }
    .akrp-flow-history-caret { width: 12px; color: var(--vscode-descriptionForeground); }
    .akrp-flow-history-meta { color: var(--vscode-descriptionForeground); }
    .akrp-flow-history-item > div:not(.akrp-flow-history-summary) { padding: 0 8px 8px; }
  ` + flowResultStyles();
  document.head.appendChild(style);
}
