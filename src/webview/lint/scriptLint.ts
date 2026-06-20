import type * as monacoNs from 'monaco-editor';

const ENV_GET_PATTERN = /environment\.get\(\s*['"]([\w.-]+)['"]\s*\)/g;

/** Flags JavaScript syntax errors in a script. Uses Function constructor (compiles only, no side effects). */
export function lintScript(
  monaco: typeof monacoNs,
  model: monacoNs.editor.ITextModel
): void {
  try {
    const text = model.getValue();
    const markers: monacoNs.editor.IMarkerData[] = [];

    if (text.trim()) {
      try {
        new Function(text);
      } catch (e: any) {
        const msg = e?.message ?? 'Syntax error';
        const lineMatch = msg.match(/(?:line|at)\s*(\d+)/i);
        const colMatch = msg.match(/column\s*(\d+)/i);
        const lineNum = lineMatch ? Math.max(1, parseInt(lineMatch[1], 10)) : 1;
        const colNum = colMatch ? Math.max(1, parseInt(colMatch[1], 10)) : 1;
        markers.push({
          severity: monaco.MarkerSeverity.Error,
          message: msg,
          startLineNumber: lineNum,
          startColumn: colNum,
          endLineNumber: lineNum,
          endColumn: colNum + 10,
        });
      }
    }

    monaco.editor.setModelMarkers(model, 'akrp-syntax-lint', markers);
  } catch (e) {
    console.error('[akrp] lintScript error:', e);
  }
}

/** Flags environment.get('X') calls in a script where X isn't a known active-environment variable. */
export function lintScriptVariables(
  monaco: typeof monacoNs,
  model: monacoNs.editor.ITextModel,
  knownVarNames: string[]
): void {
  try {
    const text = model.getValue();
    const markers: monacoNs.editor.IMarkerData[] = [];
    const known = new Set(knownVarNames);

    const re = new RegExp(ENV_GET_PATTERN);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      const varName = match[1];
      if (known.has(varName)) continue;
      const startPos = model.getPositionAt(match.index);
      const endPos = model.getPositionAt(match.index + match[0].length);
      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        message: `Unknown environment variable "${varName}" (not found in the active environment config)`,
        startLineNumber: startPos.lineNumber,
        startColumn: startPos.column,
        endLineNumber: endPos.lineNumber,
        endColumn: endPos.column,
      });
    }

    monaco.editor.setModelMarkers(model, 'akrp-var-lint', markers);
  } catch (e) {
    console.error('[akrp] lintScriptVariables error:', e);
  }
}
