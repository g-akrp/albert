import { SimHostToWebviewMessage } from '../../model/types';
import { onHostMessage } from '../vscodeApi';
import { injectStyles } from '../styles';
import { renderSim } from './SimEditor';
import { store, vscodeApi } from './state';

injectStyles();
injectSimStyles();

const root = document.getElementById('root')!;
root.innerHTML = '<div class="albert-main"><div id="albert-sim-root"></div></div>';
const simRoot = document.getElementById('albert-sim-root') as HTMLElement;

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
    .albert-env-readout { color: var(--albert-muted); font-size: 12px; margin-bottom: 8px; }
    .albert-flow-toolbar { display: flex; gap: 6px; margin-bottom: 12px; }
    .albert-sim-profile { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 12px; }
    .albert-sim-field { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--albert-muted); }
    .albert-sim-flow-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .albert-flow-req-path { font-family: var(--vscode-editor-font-family); font-size: 12px; }
    .albert-flow-req-path.missing { color: var(--vscode-errorForeground); }
    .albert-sim-tps-label { font-size: 11px; color: var(--albert-muted); }
    .albert-flow-validate { display: flex; align-items: center; gap: 6px; font-size: 12px; }
    .albert-row { display: flex; gap: 10px; align-items: center; margin-top: 6px; }
    .albert-sim-apm-status { font-size: 12px; }
    .albert-sim-apm-status.ok { color: var(--albert-ok); }
    .albert-sim-apm-status.missing { color: var(--albert-muted); }
    .albert-flow-results { margin-top: 16px; border-top: 1px solid var(--albert-border); padding-top: 12px; }
    .albert-response-status.ok { color: var(--albert-ok); }
    .albert-response-status.err { color: var(--albert-err); }
    .albert-chart { margin: 12px 0; max-width: 560px; }
    .albert-chart-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--albert-muted); margin-bottom: 4px; }
    .albert-chart-svg { width: 100%; height: auto; background: var(--vscode-textCodeBlock-background); border: 1px solid var(--albert-border); border-radius: var(--albert-radius); }
    .albert-chart-grid { stroke: var(--albert-border); stroke-width: 0.5; }
    .albert-chart-axis { fill: var(--albert-muted); font-size: 9px; }
    .albert-chart-legend { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 6px; font-size: 11px; }
    .albert-legend-item { display: flex; align-items: center; gap: 5px; }
    .albert-legend-swatch { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
    .albert-bar-list { display: flex; flex-direction: column; gap: 5px; }
    .albert-bar-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
    .albert-bar-label { width: 140px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .albert-bar-track { flex: 1; height: 12px; background: var(--vscode-textCodeBlock-background); border-radius: 6px; overflow: hidden; }
    .albert-bar-fill { height: 100%; border-radius: 6px; }
    .albert-bar-value { width: 60px; text-align: right; flex-shrink: 0; }
    .albert-sim-summary { border-collapse: collapse; width: 100%; max-width: 720px; margin: 12px 0; font-size: 12px; border: 1px solid var(--albert-border); border-radius: var(--albert-radius); overflow: hidden; }
    .albert-sim-summary th, .albert-sim-summary td { border-bottom: 1px solid var(--albert-border-subtle); padding: 6px 10px; text-align: left; }
    .albert-sim-summary tr:last-child td { border-bottom: none; }
    .albert-sim-summary th { background: var(--vscode-editorWidget-background, var(--vscode-textCodeBlock-background)); font-weight: 600; }
    .albert-sim-summary tr.err td { color: var(--albert-err); }
    .albert-sim-summary-charts { display: flex; flex-direction: column; gap: 4px; }
    .albert-sim-view-switcher { display: flex; gap: 4px; margin: 8px 0 12px; }
    .albert-sim-view-switcher button { flex: 0 0 auto; }
    .albert-sankey-label { fill: var(--vscode-foreground); font-size: 10px; }
  `;
  document.head.appendChild(style);
}
