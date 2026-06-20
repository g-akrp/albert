import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
// editor.api is the barebones editor — it registers NO interactive contributions. Without these
// three, `editor.action.formatDocument` doesn't exist (Format buttons silently no-op) and the
// suggest/hover *widgets* never render, so our registered completion/hover providers below have
// nowhere to display. Import them explicitly (editor.all pulls in everything; we only need these).
import 'monaco-editor/esm/vs/editor/contrib/format/browser/formatActions';
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController';
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution';
import 'monaco-editor/esm/vs/language/json/monaco.contribution';
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';
import { DiagnosticItem, EnvVariable } from '../../model/types';

/** Live values the registered completion providers read at suggestion-time — updated by the Tabs module on every render. */
export const completionContext = {
  envVariableNames: [] as string[],
  sampleKeyPaths: [] as string[],
  envVariables: [] as EnvVariable[],
};

const modelScriptNames = new Map<string, string>();

export function registerModelScriptName(modelUri: string, scriptName: string): void {
  modelScriptNames.set(modelUri, scriptName);
}

export function collectScriptDiagnostics(): DiagnosticItem[] {
  const result: DiagnosticItem[] = [];
  for (const [uri, scriptName] of modelScriptNames) {
    const model = monaco.editor.getModel(monaco.Uri.parse(uri));
    if (!model) continue;
    const markers = monaco.editor.getModelMarkers({ resource: model.uri });
    for (const marker of markers) {
      result.push({
        scriptName,
        line: marker.startLineNumber,
        column: marker.startColumn,
        length: marker.endColumn - marker.startColumn,
        message: marker.message,
        severity: marker.severity === monaco.MarkerSeverity.Error ? 'error' : 'warning',
      });
    }
  }
  return result;
}

const SCRIPT_AMBIENT_TYPES = `
declare const console: { log: (...args: any[]) => void };

interface RequestContext {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}
declare const request: RequestContext | undefined;

interface ResponseContext {
  body: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  json(): any;
}
declare const response: ResponseContext | undefined;

interface EnvContext {
  get(name: string): string | undefined;
  set(name: string, value: string): void;
}
declare const environment: EnvContext;

interface ExpectMatchers<R = void> {
  toBe(expected: any): R;
  toEqual(expected: any): R;
  toStrictEqual(expected: any): R;
  toBeDefined(): R;
  toBeUndefined(): R;
  toBeNull(): R;
  toBeTruthy(): R;
  toBeFalsy(): R;
  toBeNaN(): R;
  toBeGreaterThan(expected: number | bigint): R;
  toBeGreaterThanOrEqual(expected: number | bigint): R;
  toBeLessThan(expected: number | bigint): R;
  toBeLessThanOrEqual(expected: number | bigint): R;
  toContain(expected: any): R;
  toContainEqual(expected: any): R;
  toMatch(expected: string | RegExp): R;
  toHaveLength(expected: number): R;
  toHaveProperty(key: string, value?: any): R;
  toThrow(expected?: string | RegExp): R;
  toThrowError(expected?: string | RegExp): R;
  toBeInstanceOf(expected: Function): R;
  toMatchObject(expected: object | any[]): R;
}
declare function expect(actual: any): ExpectMatchers & { not: ExpectMatchers };
`;

const JSON_SCHEMA_KEYWORD_SNIPPETS: { label: string; insertText: string }[] = [
  { label: 'type', insertText: '"type": "${1:object}"' },
  { label: 'properties', insertText: '"properties": {\n\t$0\n}' },
  { label: 'required', insertText: '"required": [$0]' },
  { label: 'items', insertText: '"items": {\n\t$0\n}' },
  { label: 'enum', insertText: '"enum": [$0]' },
  { label: 'additionalProperties', insertText: '"additionalProperties": ${1:false}' },
  { label: 'minimum', insertText: '"minimum": ${1:0}' },
  { label: 'maximum', insertText: '"maximum": ${1:100}' },
  { label: 'minLength', insertText: '"minLength": ${1:1}' },
  { label: 'pattern', insertText: '"pattern": "${1}"' },
  { label: 'format', insertText: '"format": "${1:date-time}"' },
];

let initialized = false;

export function ensureMonacoInitialized(workerBaseUri: string): typeof monaco {
  if (initialized) return monaco;
  initialized = true;

  (self as any).MonacoEnvironment = {
    getWorker(_moduleId: string, label: string): Promise<Worker> {
      const workerFile =
        label === 'json' ? 'json.worker.js' : label === 'typescript' || label === 'javascript' ? 'ts.worker.js' : 'editor.worker.js';
      return fetch(`${workerBaseUri}/${workerFile}`)
        .then(r => r.text())
        .then(code => {
          const blob = new Blob([code], { type: 'application/javascript' });
          return new Worker(URL.createObjectURL(blob));
        });
    },
  };

  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
  monaco.languages.typescript.javascriptDefaults.addExtraLib(SCRIPT_AMBIENT_TYPES, 'ts:albert-script-api.d.ts');
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    allowNonTsExtensions: true,
    target: monaco.languages.typescript.ScriptTarget.ES2020,
  });

  function wordRange(
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): monaco.IRange {
    const word = model.getWordUntilPosition(position);
    return {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: word.startColumn,
      endColumn: word.endColumn,
    };
  }

  function isInVarBrackets(
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): boolean {
    if (position.column < 3) return false;
    return (
      model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: position.column - 2,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      }) === '{{'
    );
  }

  function addEnvVarSuggestions(
    suggestions: monaco.languages.CompletionItem[],
    range: monaco.IRange
  ): void {
    for (const name of completionContext.envVariableNames) {
      suggestions.push({
        label: name,
        kind: monaco.languages.CompletionItemKind.Variable,
        insertText: `{{${name}}}`,
        detail: 'Environment variable',
        range,
      });
    }
  }

  const jsProviderOptions: monaco.languages.CompletionItemProvider = {
    triggerCharacters: ["'", '"', '.', '(', '{'],
    provideCompletionItems(model, position) {
      const range = wordRange(model, position);
      const suggestions: monaco.languages.CompletionItem[] = [];

      if (isInVarBrackets(model, position)) {
        addEnvVarSuggestions(suggestions, range);
        return { suggestions };
      }

      for (const name of completionContext.envVariableNames) {
        suggestions.push({
          label: name,
          kind: monaco.languages.CompletionItemKind.Variable,
          insertText: name,
          detail: 'Environment variable',
          range,
        });
      }
      for (const path of completionContext.sampleKeyPaths) {
        suggestions.push({
          label: path,
          kind: monaco.languages.CompletionItemKind.Field,
          insertText: path,
          detail: 'Sample response field',
          range,
        });
      }
      return { suggestions };
    },
  };
  monaco.languages.registerCompletionItemProvider('javascript', jsProviderOptions);
  monaco.languages.registerCompletionItemProvider('typescript', jsProviderOptions);

  monaco.languages.registerCompletionItemProvider('json', {
    triggerCharacters: ['{'],
    provideCompletionItems(model, position) {
      const range = wordRange(model, position);
      const suggestions: monaco.languages.CompletionItem[] = [];

      if (isInVarBrackets(model, position)) {
        addEnvVarSuggestions(suggestions, range);
        return { suggestions };
      }

      for (const keyword of JSON_SCHEMA_KEYWORD_SNIPPETS) {
        suggestions.push({
          label: keyword.label,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: keyword.insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'JSON Schema keyword',
          range,
        });
      }
      for (const path of completionContext.sampleKeyPaths) {
        const leaf = path.split('.').pop() ?? path;
        suggestions.push({
          label: leaf,
          kind: monaco.languages.CompletionItemKind.Field,
          insertText: `"${leaf}": $0`,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: `Sample response field (${path})`,
          range,
        });
      }
      for (const name of completionContext.envVariableNames) {
        suggestions.push({
          label: name,
          kind: monaco.languages.CompletionItemKind.Variable,
          insertText: `{{${name}}}`,
          detail: 'Environment variable',
          range,
        });
      }
      return { suggestions };
    },
  });

  monaco.languages.registerCompletionItemProvider('plaintext', {
    triggerCharacters: ['{'],
    provideCompletionItems(model, position) {
      const range = wordRange(model, position);
      const suggestions: monaco.languages.CompletionItem[] = [];

      if (isInVarBrackets(model, position)) {
        addEnvVarSuggestions(suggestions, range);
      }
      return { suggestions };
    },
  });

  function envVarHover(word: string): { contents: { value: string }[] } | null {
    for (const v of completionContext.envVariables) {
      if (v.name === word) {
        return { contents: [{ value: `**${v.name}** = \`${v.value}\`` }] };
      }
    }
    return null;
  }

  monaco.languages.registerHoverProvider('javascript', {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const textBefore = model.getValueInRange({
        startLineNumber: position.lineNumber, startColumn: Math.max(1, word.startColumn - 18),
        endLineNumber: position.lineNumber, endColumn: word.startColumn - 1,
      });
      if (textBefore.endsWith("environment.get('") || textBefore.endsWith('environment.get("')) {
        return envVarHover(word.word);
      }
      return null;
    },
  });
  monaco.languages.registerHoverProvider('typescript', {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const textBefore = model.getValueInRange({
        startLineNumber: position.lineNumber, startColumn: Math.max(1, word.startColumn - 18),
        endLineNumber: position.lineNumber, endColumn: word.startColumn - 1,
      });
      if (textBefore.endsWith("environment.get('") || textBefore.endsWith('environment.get("')) {
        return envVarHover(word.word);
      }
      return null;
    },
  });

  monaco.languages.registerHoverProvider('json', {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const line = model.getLineContent(position.lineNumber);
      const end = word.endColumn - 1;
      let start = end;
      while (start > 0 && line[start - 1] !== '{') start--;
      if (start > 0 && start >= 2 && line[start - 2] === '{') start -= 2;
      let close = end;
      while (close < line.length && line[close] !== '}') close++;
      if (close + 1 < line.length && line[close + 1] === '}') close++;
      const inner = line.substring(Math.max(0, start), Math.min(line.length, close + 1));
      if (inner.startsWith('{{') && inner.endsWith('}}')) {
        return envVarHover(inner.slice(2, -2));
      }
      return null;
    },
  });
  monaco.languages.registerHoverProvider('plaintext', {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const line = model.getLineContent(position.lineNumber);
      const end = word.endColumn - 1;
      let start = end;
      while (start > 0 && line[start - 1] !== '{') start--;
      if (start > 0 && start >= 2 && line[start - 2] === '{') start -= 2;
      let close = end;
      while (close < line.length && line[close] !== '}') close++;
      if (close + 1 < line.length && line[close + 1] === '}') close++;
      const inner = line.substring(Math.max(0, start), Math.min(line.length, close + 1));
      if (inner.startsWith('{{') && inner.endsWith('}}')) {
        return envVarHover(inner.slice(2, -2));
      }
      return null;
    },
  });

  return monaco;
}
