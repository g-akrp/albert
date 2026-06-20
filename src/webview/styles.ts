export function injectStyles(): void {
  const style = document.createElement('style');
  style.textContent = `
    body { margin: 0; padding: 0; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    .akrp-layout { display: flex; height: 100vh; }
    .akrp-sidebar { width: 240px; border-right: 1px solid var(--vscode-panel-border); overflow-y: auto; padding: 8px; box-sizing: border-box; }
    .akrp-main { flex: 1; display: flex; flex-direction: column; overflow-y: auto; padding: 12px; box-sizing: border-box; }
    .akrp-toolbar { display: flex; gap: 6px; margin-bottom: 8px; }
    .akrp-toolbar button { flex: 1; }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 1px solid var(--vscode-button-border, var(--vscode-contrastBorder, var(--vscode-focusBorder))); padding: 4px 8px; cursor: pointer; border-radius: 2px; }
    button:hover { background: var(--vscode-button-hoverBackground); border-color: var(--vscode-focusBorder); }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border-color: var(--vscode-contrastBorder, var(--vscode-focusBorder)); }
    input, select, textarea { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); padding: 4px; box-sizing: border-box; font-family: var(--vscode-editor-font-family); }
    .akrp-tree-item { display: flex; align-items: center; gap: 4px; padding: 3px 4px; cursor: pointer; border-radius: 2px; white-space: nowrap; }
    .akrp-tree-item:hover { background: var(--vscode-list-hoverBackground); }
    .akrp-tree-item.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
    .akrp-tree-children { margin-left: 14px; }
    .akrp-method-badge { font-weight: 600; font-size: 11px; width: 42px; flex-shrink: 0; }
    .akrp-url-bar { display: flex; gap: 6px; margin-bottom: 10px; }
    .akrp-url-bar select { flex: 0 0 90px; }
    .akrp-url-bar input { flex: 1; }
    .akrp-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--vscode-panel-border); margin-bottom: 8px; flex-wrap: wrap; align-items: stretch; }
    .akrp-tab { padding: 4px 10px; cursor: pointer; border-bottom: 2px solid transparent; }
    .akrp-tab.active { border-bottom-color: var(--vscode-focusBorder); }
    .akrp-tab-warning { color: var(--vscode-editorError-foreground, #d9534f); margin-left: 4px; font-size: 11px; }
    .akrp-tab-section { padding: 4px 10px; font-weight: 600; font-size: 11px; text-transform: uppercase; color: var(--vscode-descriptionForeground); letter-spacing: 0.5px; align-self: center; pointer-events: none; user-select: none; }
    .akrp-kv-row { display: flex; gap: 4px; margin-bottom: 4px; align-items: center; }
    .akrp-kv-row input[type=text] { flex: 1; }
    .akrp-empty { color: var(--vscode-descriptionForeground); padding: 8px; }
    .akrp-response { margin-top: 14px; border-top: 1px solid var(--vscode-panel-border); padding-top: 10px; }
    .akrp-response-status { font-weight: 600; margin-bottom: 6px; }
    .akrp-response-statusrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
    .akrp-response-statusrow .akrp-response-status { margin-bottom: 0; }
    .akrp-response-status.ok { color: var(--vscode-testing-iconPassed, #2cbb4b); }
    .akrp-response-status.err { color: var(--vscode-testing-iconFailed, #d9534f); }
    .akrp-response pre { background: var(--vscode-textCodeBlock-background); padding: 8px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }
    textarea.akrp-body { width: 100%; min-height: 120px; font-family: var(--vscode-editor-font-family); }
    .akrp-section-title { font-weight: 600; margin: 10px 0 4px; }
    .akrp-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
    .akrp-row label { width: 130px; flex-shrink: 0; }
    textarea.akrp-script { width: 100%; min-height: 100px; font-family: var(--vscode-editor-font-family); }
    .akrp-code-editor { min-height: 60px; border: 1px solid var(--vscode-panel-border); margin-bottom: 8px; overflow: hidden; }
    .akrp-test-results { margin-top: 12px; }
    .akrp-result-block { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px 10px; margin-bottom: 10px; }
    .akrp-result-block .akrp-section-title { margin-top: 0; }
    .akrp-assertion { display: flex; gap: 6px; align-items: flex-start; padding: 3px 0; font-family: var(--vscode-editor-font-family); font-size: 12px; }
    .icon.pass { color: var(--vscode-testing-iconPassed, #2cbb4b); }
    .icon.fail { color: var(--vscode-testing-iconFailed, #d9534f); }
    .akrp-log-line { font-family: var(--vscode-editor-font-family); font-size: 12px; color: var(--vscode-descriptionForeground); }
    .akrp-env-readout { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 6px; }
    .akrp-checkbox-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
    .akrp-var-suggest { position: fixed; z-index: 1000; background: var(--vscode-editorSuggestWidget-background, var(--vscode-input-background)); border: 1px solid var(--vscode-editorSuggestWidget-border, var(--vscode-panel-border)); max-height: 160px; overflow-y: auto; font-size: 12px; }
    .akrp-var-suggest-item { padding: 3px 8px; cursor: pointer; white-space: nowrap; }
    .akrp-var-suggest-item:hover { background: var(--vscode-editorSuggestWidget-selectedBackground, var(--vscode-list-hoverBackground)); }
    .akrp-codeblock { border: 1px solid var(--vscode-panel-border); border-radius: 4px; background: var(--vscode-textCodeBlock-background); margin-bottom: 8px; overflow: hidden; }
    .akrp-codeblock-toolbar { display: flex; justify-content: flex-end; align-items: center; gap: 6px; padding: 4px 6px; border-bottom: 1px solid var(--vscode-panel-border); }
    .akrp-codeblock-toolbar .akrp-copy-btn { padding: 2px 8px; font-size: 11px; }
    .akrp-codeblock pre { margin: 0; padding: 8px 10px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; font-family: var(--vscode-editor-font-family); font-size: 12px; }
  `;
  document.head.appendChild(style);
}
