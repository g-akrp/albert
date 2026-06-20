import type * as monacoNs from 'monaco-editor';
import Ajv from 'ajv';

/** Validates the Schema tab's content as JSON and as a compilable JSON Schema, surfacing errors as editor markers. */
export function lintSchema(monaco: typeof monacoNs, model: monacoNs.editor.ITextModel): void {
  const text = model.getValue();
  const lineCount = model.getLineCount();
  const fullDocMarker = (message: string): monacoNs.editor.IMarkerData => ({
    severity: monaco.MarkerSeverity.Error,
    message,
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: lineCount,
    endColumn: model.getLineMaxColumn(lineCount),
  });

  if (!text.trim()) {
    monaco.editor.setModelMarkers(model, 'albert-schema-lint', []);
    return;
  }

  let schema: unknown;
  try {
    schema = JSON.parse(text);
  } catch (err: any) {
    monaco.editor.setModelMarkers(model, 'albert-schema-lint', [fullDocMarker(`Invalid JSON: ${err?.message ?? err}`)]);
    return;
  }

  try {
    new Ajv({ strict: false }).compile(schema as any);
    monaco.editor.setModelMarkers(model, 'albert-schema-lint', []);
  } catch (err: any) {
    monaco.editor.setModelMarkers(model, 'albert-schema-lint', [
      fullDocMarker(`Schema compile error: ${err?.message ?? err}`),
    ]);
  }
}
