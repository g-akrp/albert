import { FlowHostToWebviewMessage } from '../../model/types';
import { onHostMessage } from '../vscodeApi';
import { injectStyles } from '../styles';
import { flowResultStyles } from '../components/flowResults';
import { renderFlow } from './FlowEditor';
import { store, vscodeApi } from './state';

injectStyles();
injectFlowStyles();

const root = document.getElementById('root')!;
root.innerHTML = '<div class="albert-main"><div id="albert-flow-root"></div></div>';
const flowRoot = document.getElementById('albert-flow-root') as HTMLElement;

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
      store.setAllureEnabled(message.allureEnabled);
      break;
    case 'documentChanged':
      store.setFile(message.file);
      break;
    case 'activeEnvironmentChanged':
      store.setActiveEnvName(message.activeEnvName);
      break;
    case 'allureEnabledChanged':
      store.setAllureEnabled(message.allureEnabled);
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
    /* Revamped Flow Container and Header */
    .albert-flow-container { display: flex; flex-direction: column; gap: 12px; height: 100%; }
    .albert-flow-toolbar-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; border-bottom: 1px solid var(--albert-border); padding-bottom: 10px; }
    .toolbar-title-wrap { display: flex; align-items: baseline; gap: 10px; flex: 1; }
    .flow-name-input { font-size: 18px; font-weight: 600; background: transparent; border: 1px solid transparent; padding: 2px 6px; border-radius: var(--albert-radius-sm); color: var(--vscode-foreground); width: 60%; transition: border-color 0.15s ease, background-color 0.15s ease; }
    .flow-name-input:hover { border-color: var(--albert-border-subtle); background: var(--vscode-input-background); }
    .flow-name-input:focus { border-color: var(--vscode-focusBorder); background: var(--vscode-input-background); outline: none; }
    .albert-env-readout { font-size: 11px; font-weight: 500; text-transform: uppercase; color: var(--albert-muted); letter-spacing: 0.5px; }
    .albert-allure-status { font-size: 11px; font-weight: 500; letter-spacing: 0.3px; padding: 2px 8px; border-radius: 10px; display: inline-flex; align-items: center; gap: 5px; }
    .albert-allure-status::before { content: ''; width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
    .albert-allure-status.on { color: var(--albert-ok); background: color-mix(in srgb, var(--albert-ok) 12%, transparent); border: 1px solid color-mix(in srgb, var(--albert-ok) 30%, transparent); }
    .albert-allure-status.on::before { background: var(--albert-ok); }
    .albert-allure-status.off { color: var(--albert-muted); background: color-mix(in srgb, var(--albert-muted) 10%, transparent); border: 1px solid var(--albert-border); }
    .albert-allure-status.off::before { background: var(--albert-muted); }
    .albert-flow-toolbar { display: flex; gap: 8px; }

    /* Dashboard Stats Box */
    .albert-flow-dashboard { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; padding: 12px 16px; background: var(--vscode-editorWidget-background, rgba(128,128,128,0.05)); border: 1px solid var(--albert-border); border-radius: var(--albert-radius); box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
    .albert-dashboard-metric { display: flex; flex-direction: column; gap: 4px; }
    .metric-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--albert-muted); }
    .metric-value { font-size: 13.5px; font-weight: 600; }
    .metric-value.status-idle { color: var(--albert-muted); }
    .metric-value.status-running { color: var(--vscode-statusBar-debuggingBackground, #007acc); }
    .metric-value.status-passed { color: var(--albert-ok); }
    .metric-value.status-failed { color: var(--albert-err); }

    /* Workspace Split Grid Layout */
    .albert-flow-workspace { display: flex; gap: 14px; min-height: 480px; flex: 1; align-items: stretch; }
    
    /* Left Sidebar (Steps list) */
    .albert-flow-sidebar { flex: 0 0 280px; width: 280px; display: flex; flex-direction: column; border: 1px solid var(--albert-border); border-radius: var(--albert-radius); background: var(--vscode-sideBar-background, transparent); }
    .sidebar-section-header { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--albert-muted); padding: 10px 14px; border-bottom: 1px solid var(--albert-border); font-weight: 600; }
    .albert-sidebar-steps { flex: 1; overflow-y: auto; display: flex; flex-direction: column; padding: 6px 0; }
    
    .albert-sidebar-step-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; border-left: 3px solid transparent; transition: background 0.15s ease, border-color 0.15s ease; position: relative; }
    .albert-sidebar-step-item:hover { background: var(--vscode-list-hoverBackground); }
    .albert-sidebar-step-item.selected { background: var(--vscode-list-activeSelectionBackground, rgba(0, 122, 204, 0.1)); border-left-color: var(--vscode-focusBorder, #007acc); }
    .albert-sidebar-step-item.disabled { opacity: 0.5; }
    
    .step-status-indicator { width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 11px; }
    .step-index-badge { width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 10.5px; font-weight: 600; background: var(--albert-border-subtle); color: var(--albert-muted); }
    .sidebar-step-name { flex: 1; font-size: 12.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--vscode-foreground); padding-right: 4px; }
    .sidebar-step-actions { display: flex; gap: 2px; opacity: 0; transition: opacity 0.15s ease; }
    .albert-sidebar-step-item:hover .sidebar-step-actions { opacity: 1; }
    
    .sidebar-spinner { width: 11px; height: 11px; border: 2px solid var(--vscode-focusBorder); border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .status-dot.pending { background: var(--albert-border); }
    .icon-check { color: var(--albert-ok); }
    .icon-cross { color: var(--albert-err); }
    .add-step-sidebar-btn { border-top: 1px solid var(--albert-border); border-radius: 0 0 var(--albert-radius) var(--albert-radius); padding: 8px 12px; }

    /* Right Details Panel */
    .albert-detail-panel { flex: 1; display: flex; flex-direction: column; border: 1px solid var(--albert-border); border-radius: var(--albert-radius); background: var(--vscode-editor-background); overflow: hidden; }
    .albert-detail-welcome { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; color: var(--albert-muted); padding: 24px; }
    .welcome-icon { font-size: 32px; color: var(--albert-border); margin-bottom: 12px; }
    .welcome-icon svg { width: 36px; height: 36px; }
    .albert-detail-welcome h3 { margin: 0 0 6px 0; font-size: 15px; font-weight: 600; color: var(--vscode-foreground); }
    .albert-detail-welcome p { margin: 0; max-width: 320px; font-size: 12px; line-height: 1.5; }
    
    /* Tabs inside Detail Panel */
    .albert-detail-tabs { display: flex; border-bottom: 1px solid var(--albert-border); background: var(--vscode-tab-inactiveBackground, rgba(128,128,128,0.05)); }
    .albert-detail-tab { padding: 9px 16px; font-size: 12px; font-weight: 600; cursor: pointer; color: var(--albert-muted); border-bottom: 2px solid transparent; transition: color 0.1s ease, border-color 0.1s ease; }
    .albert-detail-tab:hover { color: var(--vscode-tab-activeForeground, var(--vscode-foreground)); }
    .albert-detail-tab.active { color: var(--vscode-tab-activeForeground, var(--vscode-foreground)); border-bottom-color: var(--vscode-focusBorder); background: var(--vscode-tab-activeBackground, var(--vscode-editor-background)); }
    .albert-tab-content { flex: 1; overflow-y: auto; padding: 16px; }

    /* Configure Tab Settings */
    .albert-config-tab { display: flex; flex-direction: column; gap: 14px; }
    .albert-form-group { display: flex; flex-direction: column; gap: 6px; }
    .albert-form-group label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--albert-muted); letter-spacing: 0.5px; }
    .albert-form-group input[type=text] { width: 100%; padding: 6px 10px; }
    .albert-picker-wrapper { display: flex; gap: 8px; align-items: center; }
    .albert-picker-path { flex: 1; padding: 6px 10px; border: 1px solid var(--albert-border); border-radius: var(--albert-radius-sm); font-family: var(--vscode-editor-font-family); font-size: 11.5px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); min-height: 28px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .albert-picker-path.missing { color: var(--vscode-errorForeground); font-style: italic; }
    .albert-form-checkbox-row { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
    .albert-form-checkbox-row label { font-size: 12px; cursor: pointer; }
    .albert-divider { border: 0; border-top: 1px solid var(--albert-border); margin: 8px 0; }

    /* Variable Autocomplete / Help Tip */
    .albert-available-vars-tip { display: flex; flex-direction: column; gap: 4px; padding: 8px 12px; background: var(--vscode-textBlockQuote-background, rgba(128,128,128,0.08)); border-left: 3px solid var(--vscode-infoSymbolForeground, #007acc); border-radius: var(--albert-radius-sm); font-size: 11px; margin-bottom: 6px; }
    .available-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
    .var-badge { font-family: var(--vscode-editor-font-family); background: var(--vscode-badge-background, rgba(128,128,128,0.15)); color: var(--vscode-badge-foreground, var(--vscode-foreground)); padding: 1px 5px; border-radius: 3px; font-size: 10.5px; cursor: help; }

    /* Captures Configuration List */
    .albert-captures-section { display: flex; flex-direction: column; gap: 8px; }
    .captures-section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--albert-muted); letter-spacing: 0.5px; margin: 0 0 4px 0; }
    .albert-captures-list { display: flex; flex-direction: column; gap: 6px; }
    .albert-captures-empty { font-size: 11.5px; font-style: italic; color: var(--albert-muted); padding: 8px 0; }
    .albert-capture-row { display: flex; gap: 6px; align-items: center; }
    .capture-source-select { padding: 4.5px 6px; font-size: 12px; }

    /* Results Tab Styles */
    .albert-results-tab { display: flex; flex-direction: column; gap: 14px; }
    .albert-result-empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 16px; color: var(--albert-muted); text-align: center; }
    .albert-result-empty-state .empty-icon { font-size: 24px; color: var(--albert-border); margin-bottom: 8px; opacity: 0.6; }
    .albert-result-details-header { display: flex; align-items: center; gap: 10px; }
    .status-badge { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 12px; color: #fff; text-shadow: 0 1px 1px rgba(0,0,0,0.15); }
    .status-badge.ok { background: var(--albert-ok); }
    .status-badge.err { background: var(--albert-err); }
    .result-meta-text { font-size: 12.5px; color: var(--albert-muted); }
    .result-meta-text strong { color: var(--vscode-foreground); }
    .albert-result-url-row { font-family: var(--vscode-editor-font-family); font-size: 11px; color: var(--albert-muted); padding: 4px 8px; background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.06)); border-radius: var(--albert-radius-sm); word-break: break-all; }
    
    .albert-result-checks { display: flex; flex-direction: column; gap: 5px; border-top: 1px dashed var(--albert-border); padding-top: 10px; }
    .albert-result-checks h5, .albert-result-captured-values h5, .albert-result-body-preview h5 { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--albert-muted); letter-spacing: 0.5px; margin: 0 0 6px 0; }
    .albert-result-check-row { display: flex; align-items: center; gap: 8px; font-size: 12px; font-family: var(--vscode-editor-font-family); }
    .albert-result-check-row.pass { color: var(--albert-ok); }
    .albert-result-check-row.fail { color: var(--albert-err); }

    /* Live Captured Values Panel (New Feature) */
    .albert-result-captured-values { display: flex; flex-direction: column; border-top: 1px dashed var(--albert-border); padding-top: 10px; }
    .captured-values-empty { font-size: 11.5px; font-style: italic; color: var(--albert-muted); }
    .captured-values-grid { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.05)); border: 1px solid var(--albert-border); border-radius: var(--albert-radius-sm); padding: 8px 12px; }
    .captured-value-item { display: contents; }
    .captured-key { font-family: var(--vscode-editor-font-family); font-size: 11.5px; font-weight: 600; color: var(--vscode-symbolIcon-variableForeground, #a31515); }
    .captured-val { font-family: var(--vscode-editor-font-family); font-size: 11.5px; color: var(--vscode-foreground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .albert-result-body-preview { display: flex; flex-direction: column; border-top: 1px dashed var(--albert-border); padding-top: 10px; }
    .albert-result-body-preview pre { margin: 0; max-height: 180px; overflow: auto; background: var(--vscode-editor-background); border: 1px solid var(--albert-border); border-radius: var(--albert-radius-sm); padding: 8px 10px; font-size: 11px; font-family: var(--vscode-editor-font-family); white-space: pre-wrap; word-break: break-all; }

    /* Collapsible Bottom Console Panel */
    .albert-console-panel { border: 1px solid var(--albert-border); border-radius: var(--albert-radius); overflow: hidden; margin-top: 6px; }
    .albert-console-header { display: flex; justify-content: space-between; align-items: center; padding: 8px 14px; background: var(--vscode-panel-background, rgba(128,128,128,0.1)); cursor: pointer; transition: background 0.15s ease; font-weight: 600; }
    .albert-console-header:hover { background: var(--vscode-list-hoverBackground); }
    .console-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--vscode-foreground); }
    .console-caret { font-size: 11px; color: var(--albert-muted); }
    .albert-console-body { padding: 10px; background: #000; border-top: 1px solid var(--albert-border); }
    .albert-console-body pre { margin: 0; max-height: 220px; overflow-y: auto; font-family: var(--vscode-editor-font-family); font-size: 11px; line-height: 1.4; color: #00ff00; background: transparent; white-space: pre-wrap; border: none; padding: 0; }

    /* History & General Styles */
    .albert-flow-history-section { border-top: 1px solid var(--albert-border); padding-top: 12px; margin-top: 12px; }
    .history-items-list { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
    .albert-flow-history-item { border: 1px solid var(--albert-border); border-radius: var(--albert-radius); margin-bottom: 6px; overflow: hidden; }
    .albert-flow-history-summary { display: flex; align-items: center; gap: 8px; padding: 8px 10px; cursor: pointer; font-size: 12px; }
    .albert-flow-history-summary:hover { background: var(--vscode-list-hoverBackground); }
    .albert-flow-history-summary .ok { color: var(--albert-ok); }
    .albert-flow-history-summary .err { color: var(--albert-err); }
    .albert-flow-history-item > div:not(.albert-flow-history-summary) { padding: 0 10px 10px; }
    .del-btn:hover { color: var(--albert-err) !important; border-color: var(--albert-err) !important; }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  ` + flowResultStyles();
  document.head.appendChild(style);
}
