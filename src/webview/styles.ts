export function injectStyles(): void {
  const style = document.createElement('style');
  style.textContent = `
    /* ---- Design tokens -------------------------------------------------- */
    :root {
      --albert-radius: 5px;
      --albert-radius-sm: 4px;
      --albert-gap: 8px;
      --albert-border: var(--vscode-panel-border, rgba(128,128,128,0.28));
      --albert-border-subtle: var(--vscode-widget-border, rgba(128,128,128,0.18));
      --albert-ok: var(--vscode-testing-iconPassed, #2cbb4b);
      --albert-err: var(--vscode-testing-iconFailed, #d9534f);
      --albert-muted: var(--vscode-descriptionForeground);
    }

    /* ---- Base ----------------------------------------------------------- */
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 0;
      font-family: var(--vscode-font-family);
      font-size: 13px; line-height: 1.5;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    ::selection { background: var(--vscode-selection-background, var(--vscode-editor-selectionBackground)); }

    /* Minimal, themed scrollbars */
    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background); border-radius: 6px; border: 2px solid transparent; background-clip: padding-box; }
    ::-webkit-scrollbar-thumb:hover { background: var(--vscode-scrollbarSlider-hoverBackground); }
    ::-webkit-scrollbar-corner { background: transparent; }

    /* ---- Layout --------------------------------------------------------- */
    .albert-layout { display: flex; height: 100vh; }
    .albert-sidebar { width: 240px; border-right: 1px solid var(--albert-border); overflow-y: auto; padding: 8px; }
    .albert-main { flex: 1; display: flex; flex-direction: column; overflow-y: auto; padding: 16px 18px; gap: 2px; }

    .albert-toolbar { display: flex; gap: 6px; margin-bottom: 12px; }
    .albert-toolbar button { flex: 1; }

    /* ---- Buttons -------------------------------------------------------- */
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: 1px solid transparent;
      padding: 5px 12px;
      cursor: pointer;
      border-radius: var(--albert-radius-sm);
      font-family: inherit; font-size: 12px; line-height: 1.4;
      transition: background 80ms ease, opacity 80ms ease;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
    button:disabled { opacity: 0.5; cursor: default; }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    /* Subtle/ghost icon buttons */
    .albert-icon-btn {
      background: transparent; color: var(--vscode-foreground);
      border: 1px solid transparent; padding: 3px 7px; min-width: 26px;
      opacity: 0.75;
    }
    .albert-icon-btn:hover { background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground)); opacity: 1; }

    /* ---- Form controls -------------------------------------------------- */
    input, select, textarea {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--albert-border-subtle));
      padding: 5px 8px;
      border-radius: var(--albert-radius-sm);
      font-family: inherit; font-size: 13px;
      transition: border-color 80ms ease;
    }
    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }
    input::placeholder, textarea::placeholder { color: var(--vscode-input-placeholderForeground); }
    select { cursor: pointer; }
    textarea { font-family: var(--vscode-editor-font-family); }
    input[type=checkbox] { accent-color: var(--vscode-focusBorder); cursor: pointer; }

    /* ---- Sidebar tree --------------------------------------------------- */
    .albert-tree-item { display: flex; align-items: center; gap: 6px; padding: 4px 6px; cursor: pointer; border-radius: var(--albert-radius-sm); white-space: nowrap; }
    .albert-tree-item:hover { background: var(--vscode-list-hoverBackground); }
    .albert-tree-item.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
    .albert-tree-children { margin-left: 14px; }
    .albert-method-badge { font-weight: 600; font-size: 10.5px; letter-spacing: 0.3px; width: 42px; flex-shrink: 0; color: var(--albert-muted); }

    /* ---- URL bar -------------------------------------------------------- */
    .albert-url-bar { display: flex; gap: 6px; margin-bottom: 14px; }
    .albert-url-bar select { flex: 0 0 96px; font-weight: 600; }
    .albert-url-bar input { flex: 1; font-family: var(--vscode-editor-font-family); }

    /* ---- Tabs ----------------------------------------------------------- */
    .albert-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--albert-border); margin-bottom: 14px; flex-wrap: wrap; align-items: stretch; }
    .albert-tab {
      padding: 6px 12px; cursor: pointer;
      border-bottom: 2px solid transparent;
      color: var(--vscode-tab-inactiveForeground, var(--albert-muted));
      font-size: 12.5px;
      margin-bottom: -1px;
      transition: color 80ms ease, font-weight 80ms ease;
    }
    .albert-tab:hover {
      color: var(--vscode-tab-hoverForeground, var(--vscode-foreground));
      font-weight: bold;
    }
    .albert-tab.active {
      color: var(--vscode-tab-activeForeground, var(--vscode-foreground));
      border-bottom: 2px solid var(--vscode-panelTitle-activeBorder, var(--vscode-focusBorder));
      font-weight: bold;
    }
    .albert-tab-warning { color: var(--albert-err); margin-left: 5px; font-size: 11px; }
    .albert-tab-section { padding: 6px 10px 6px 4px; font-weight: 600; font-size: 10.5px; text-transform: uppercase; color: var(--albert-muted); letter-spacing: 0.6px; align-self: center; pointer-events: none; user-select: none; }

    /* ---- Key/value rows ------------------------------------------------- */
    .albert-kv-row { display: flex; gap: 6px; margin-bottom: 6px; align-items: center; }
    .albert-kv-row input[type=text] { flex: 1; }

    .albert-empty { color: var(--albert-muted); padding: 12px 4px; font-style: italic; }

    /* ---- Response ------------------------------------------------------- */
    .albert-response { margin-top: 16px; border-top: 1px solid var(--albert-border); padding-top: 14px; }
    .albert-response-status { font-weight: 600; margin-bottom: 6px; }
    .albert-response-statusrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .albert-response-statusrow .albert-response-status { margin-bottom: 0; }
    .albert-response-status.ok { color: var(--albert-ok); }
    .albert-response-status.err { color: var(--albert-err); }
    .albert-response pre { background: var(--vscode-textCodeBlock-background); padding: 10px 12px; border-radius: var(--albert-radius); overflow-x: auto; white-space: pre-wrap; word-break: break-word; font-family: var(--vscode-editor-font-family); font-size: 12.5px; }

    textarea.albert-body { width: 100%; min-height: 140px; font-family: var(--vscode-editor-font-family); resize: vertical; }
    textarea.albert-script { width: 100%; min-height: 100px; font-family: var(--vscode-editor-font-family); resize: vertical; }

    /* ---- Generic rows / sections --------------------------------------- */
    .albert-section-title { font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--albert-muted); margin: 14px 0 6px; }
    .albert-allure-note { font-size: 11px; color: var(--vscode-editorWarning-foreground, #cca700); background: color-mix(in srgb, var(--vscode-editorWarning-foreground, #cca700) 10%, transparent); border: 1px solid color-mix(in srgb, var(--vscode-editorWarning-foreground, #cca700) 30%, transparent); border-radius: var(--albert-radius-sm, 4px); padding: 6px 10px; margin-bottom: 10px; line-height: 1.5; }
    .albert-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
    .albert-row label { width: 130px; flex-shrink: 0; color: var(--albert-muted); }
    .albert-checkbox-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }

    /* ---- Monaco code editor wrapper ------------------------------------ */
    .albert-code-editor { min-height: 60px; border: 1px solid var(--albert-border); border-radius: var(--albert-radius); margin-bottom: 10px; overflow: hidden; }

    /* ---- Test results --------------------------------------------------- */
    .albert-test-results { margin-top: 14px; }
    .albert-result-block { border: 1px solid var(--albert-border); border-radius: var(--albert-radius); padding: 12px 14px; margin-bottom: 12px; background: var(--vscode-editorWidget-background, transparent); }
    .albert-result-block .albert-section-title { margin-top: 0; }
    .albert-assertion { display: flex; gap: 8px; align-items: flex-start; padding: 4px 0; font-family: var(--vscode-editor-font-family); font-size: 12px; }
    .icon.pass { color: var(--albert-ok); }
    .icon.fail { color: var(--albert-err); }
    .albert-log-line { font-family: var(--vscode-editor-font-family); font-size: 12px; color: var(--albert-muted); padding: 2px 0; }
    .albert-env-readout { font-size: 12px; color: var(--albert-muted); margin-bottom: 8px; }

    /* ---- Variable suggest popup ---------------------------------------- */
    .albert-var-suggest { position: fixed; z-index: 1000; background: var(--vscode-editorSuggestWidget-background, var(--vscode-input-background)); border: 1px solid var(--vscode-editorSuggestWidget-border, var(--albert-border)); border-radius: var(--albert-radius-sm); max-height: 180px; overflow-y: auto; font-size: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.28); }
    .albert-var-suggest-item { padding: 4px 10px; cursor: pointer; white-space: nowrap; }
    .albert-var-suggest-item:hover { background: var(--vscode-editorSuggestWidget-selectedBackground, var(--vscode-list-hoverBackground)); }

    /* ---- Inline code block (copyable) ---------------------------------- */
    .albert-codeblock { border: 1px solid var(--albert-border); border-radius: var(--albert-radius); margin-bottom: 10px; overflow: hidden; }
    .albert-codeblock-toolbar { display: flex; justify-content: flex-end; align-items: center; gap: 6px; padding: 5px 8px; border-bottom: 1px solid var(--albert-border); background: transparent; }
    .albert-codeblock pre { margin: 0; padding: 10px 12px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; font-family: var(--vscode-editor-font-family); font-size: 12.5px; line-height: 1.5; }
  `;
  document.head.appendChild(style);
}
