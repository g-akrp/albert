import { ensureMonacoInitialized, registerModelScriptName } from './monacoSetup';

export interface CodeEditorHandle {
  setValue(value: string): void;
  dispose(): void;
  relint(): void;
  modelUri: string;
  getAction(id: string): { run(): Promise<void> } | null;
}

export type CodeEditorLanguage = 'javascript' | 'json' | 'plaintext';

let workerBaseUri = '';
export function setWorkerBaseUri(uri: string): void {
  workerBaseUri = uri;
}

function detectTheme(): string {
  const classes = document.body.classList;
  if (classes.contains('vscode-high-contrast')) return 'hc-black';
  if (classes.contains('vscode-light')) return 'vs';
  return 'vs-dark';
}

function editorFont(): { family: string; size: number; weight: string; lineHeight: number } {
  const style = getComputedStyle(document.body);
  return {
    family: style.getPropertyValue('--vscode-editor-font-family').trim() || 'Consolas, "Courier New", monospace',
    size: parseInt(style.getPropertyValue('--vscode-editor-font-size'), 10) || 13,
    weight: style.getPropertyValue('--vscode-editor-font-weight').trim() || 'normal',
    lineHeight: parseInt(style.getPropertyValue('--vscode-editor-line-height'), 10) || 20,
  };
}

export function createCodeEditor(
  container: HTMLElement,
  language: CodeEditorLanguage,
  initialValue: string,
  onChange: (value: string) => void,
  lint?: (monacoNs: typeof import('monaco-editor'), model: import('monaco-editor').editor.ITextModel) => void,
  scriptName?: string
): CodeEditorHandle {
  const monaco = ensureMonacoInitialized(workerBaseUri);
  const font = editorFont();

  const editor = monaco.editor.create(container, {
    value: initialValue,
    language,
    theme: detectTheme(),
    automaticLayout: true,
    minimap: { enabled: false },
    fontFamily: font.family,
    fontSize: font.size,
    fontWeight: font.weight,
    lineHeight: font.lineHeight,
    scrollBeyondLastLine: false,
    scrollbar: { vertical: 'hidden' },
    wordWrap: 'on',
  });

  let applyingExternal = false;
  let lintTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleLint = () => {
    if (!lint) return;
    if (lintTimer) clearTimeout(lintTimer);
    lintTimer = setTimeout(() => lint(monaco, editor.getModel()!), 300);
  };

  editor.onDidChangeModelContent(() => {
    scheduleLint();
    if (applyingExternal) return;
    onChange(editor.getValue());
  });

  scheduleLint();

  const model = editor.getModel();
  const modelUri = model?.uri.toString() ?? '';

  if (scriptName && modelUri) {
    registerModelScriptName(modelUri, scriptName);
  }

  const sizeSub = editor.onDidContentSizeChange((e) => {
    container.style.height = `${Math.max(60, e.contentHeight)}px`;
  });

  queueMicrotask(() => {
    container.style.height = `${Math.max(60, editor.getContentHeight())}px`;
  });

  return {
    setValue(value: string) {
      if (editor.getValue() === value) return;
      applyingExternal = true;
      editor.setValue(value);
      applyingExternal = false;
      scheduleLint();
    },
    relint() {
      scheduleLint();
    },
    dispose() {
      if (lintTimer) clearTimeout(lintTimer);
      sizeSub.dispose();
      editor.dispose();
    },
    getAction(id: string) {
      const action = editor.getAction(id);
      return action ? { run: () => action.run() } : null;
    },
    modelUri,
  };
}
