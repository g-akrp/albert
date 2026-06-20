import { SimHostToWebviewMessage } from '../../model/types';
import { onHostMessage } from '../vscodeApi';
import { injectStyles } from '../styles';
import { renderSim } from './SimEditor';
import { store, vscodeApi } from './state';

injectStyles();
injectSimStyles();

const root = document.getElementById('root')!;
root.innerHTML = '<div class="akrp-main"><div id="akrp-sim-root"></div></div>';
const simRoot = document.getElementById('akrp-sim-root') as HTMLElement;

function render(): void {
  renderSim(simRoot);
}

store.subscribe(render);

onHostMessage<SimHostToWebviewMessage>((message) => {
  switch (message.type) {
    case 'init':
      store.setFile(message.file);
      store.fileUri = message.fileUri;
      store.setActiveEnvName(message.activeEnvName);
      store.setHasApmKey(message.hasApmKey);
      break;
    case 'documentChanged':
      store.setFile(message.file);
      break;
    case 'activeEnvironmentChanged':
      store.setActiveEnvName(message.activeEnvName);
      break;
    case 'apmKeyChanged':
      store.setHasApmKey(message.hasApmKey);
      break;
    case 'flowPicked':
      store.setFlowPath(message.entryId, message.flowPath);
      break;
    case 'simStarted':
      store.onStarted(message.scenarios);
      break;
    case 'simTick':
      store.onTick(message.tick);
      break;
    case 'simDone':
      store.onDone(message.result);
      break;
    case 'error':
      console.error('[Albert]', message.message);
      break;
  }
});

vscodeApi.postMessage({ type: 'ready' });
render();

function injectSimStyles(): void {
  const style = document.createElement('style');
  style.textContent = `
    .akrp-env-readout { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 8px; }
    .akrp-flow-toolbar { display: flex; gap: 6px; margin-bottom: 12px; }
    .akrp-icon-btn { padding: 2px 6px; min-width: 24px; }
    .akrp-sim-profile { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 12px; }
    .akrp-sim-field { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--vscode-descriptionForeground); }
    .akrp-sim-flow-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .akrp-flow-req-path { font-family: var(--vscode-editor-font-family); font-size: 12px; }
    .akrp-flow-req-path.missing { color: var(--vscode-errorForeground); }
    .akrp-sim-tps-label { font-size: 11px; color: var(--vscode-descriptionForeground); }
    .akrp-section-title { font-weight: 600; margin: 14px 0 6px; }
    .akrp-flow-validate { display: flex; align-items: center; gap: 6px; font-size: 12px; }
    .akrp-row { display: flex; gap: 10px; align-items: center; margin-top: 6px; }
    .akrp-sim-apm-status { font-size: 12px; }
    .akrp-sim-apm-status.ok { color: var(--vscode-testing-iconPassed, #2cbb4b); }
    .akrp-sim-apm-status.missing { color: var(--vscode-descriptionForeground); }
    .akrp-flow-results { margin-top: 16px; border-top: 1px solid var(--vscode-panel-border); padding-top: 8px; }
    .akrp-response-status.ok { color: var(--vscode-testing-iconPassed, #2cbb4b); }
    .akrp-response-status.err { color: var(--vscode-testing-iconFailed, #d9534f); }
    .akrp-chart { margin: 10px 0; max-width: 560px; }
    .akrp-chart-title { font-size: 12px; font-weight: 600; margin-bottom: 2px; }
    .akrp-chart-svg { width: 100%; height: auto; background: var(--vscode-textCodeBlock-background); border: 1px solid var(--vscode-panel-border); }
    .akrp-chart-grid { stroke: var(--vscode-panel-border); stroke-width: 0.5; }
    .akrp-chart-axis { fill: var(--vscode-descriptionForeground); font-size: 9px; }
    .akrp-chart-legend { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 4px; font-size: 11px; }
    .akrp-legend-item { display: flex; align-items: center; gap: 4px; }
    .akrp-legend-swatch { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
    .akrp-bar-list { display: flex; flex-direction: column; gap: 4px; }
    .akrp-bar-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
    .akrp-bar-label { width: 140px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .akrp-bar-track { flex: 1; height: 12px; background: var(--vscode-textCodeBlock-background); border-radius: 2px; overflow: hidden; }
    .akrp-bar-fill { height: 100%; }
    .akrp-bar-value { width: 60px; text-align: right; flex-shrink: 0; }
    .akrp-sim-summary { border-collapse: collapse; width: 100%; max-width: 720px; margin: 10px 0; font-size: 12px; }
    .akrp-sim-summary th, .akrp-sim-summary td { border: 1px solid var(--vscode-panel-border); padding: 4px 8px; text-align: left; }
    .akrp-sim-summary th { background: var(--vscode-textCodeBlock-background); }
    .akrp-sim-summary tr.err td { color: var(--vscode-testing-iconFailed, #d9534f); }
    .akrp-sim-summary-charts { display: flex; flex-direction: column; gap: 4px; }
    .akrp-sim-view-switcher { display: flex; gap: 4px; margin: 6px 0 10px; }
    .akrp-sim-view-switcher button { flex: 0 0 auto; }
    .akrp-sankey-label { fill: var(--vscode-foreground); font-size: 10px; }
  `;
  document.head.appendChild(style);
}
