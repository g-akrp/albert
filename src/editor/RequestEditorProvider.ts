import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as path from 'path';
import * as jsonc from 'jsonc-parser';
import { DiagnosticItem, RequestFile, RequestHostToWebviewMessage, RequestWebviewToHostMessage } from '../model/types';
import { resolveRequestForDisplay, resolveRequestPreview, sendRequest } from '../http/httpClient';
import { runPreRequestScript } from '../scripting/sandbox';
import { runResponseTests } from '../testing/runTests';
import { ActiveEnvironment } from '../activeEnvironment';

export class RequestEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'albert.requestEditor';

  private readonly selfAppliedText = new Map<string, string>();
  private readonly activeSends = new Map<string, AbortController>();
  private readonly diagnostics = vscode.languages.createDiagnosticCollection('albert');

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly activeEnvironment: ActiveEnvironment
  ) {}

  public static register(context: vscode.ExtensionContext, activeEnvironment: ActiveEnvironment): vscode.Disposable {
    const provider = new RequestEditorProvider(context, activeEnvironment);
    return vscode.window.registerCustomEditorProvider(RequestEditorProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    });
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = { enableScripts: true };
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    const postToWebview = (message: RequestHostToWebviewMessage) => {
      void webviewPanel.webview.postMessage(message);
    };

    const docKey = document.uri.toString();

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== docKey) return;
      const currentText = e.document.getText();
      if (this.selfAppliedText.get(docKey) === currentText) return;
      const parsed = tryParseRequestFile(currentText);
      if (parsed) postToWebview({ type: 'documentChanged', file: parsed });
      else postToWebview({ type: 'error', message: 'Document contains invalid Albert request JSON.' });
    });

    const envSub = this.activeEnvironment.onDidChange(() => {
      void this.activeEnvironment.getActiveVariablesAndSettings().then(({ variables }) => {
        postToWebview({
          type: 'activeEnvironmentChanged',
          activeEnvName: this.activeEnvironment.getActiveName(),
          envVariableNames: variables.map((v) => v.name),
          envVariables: variables.filter((v) => v.enabled).map((v) => ({ name: v.name, value: v.value })),
        });
      });
    });

    webviewPanel.onDidDispose(() => {
      changeSub.dispose();
      envSub.dispose();
      this.activeSends.get(docKey)?.abort();
      this.activeSends.delete(docKey);
      this.selfAppliedText.delete(docKey);
      this.diagnostics.delete(document.uri);
    });

    webviewPanel.webview.onDidReceiveMessage(async (message: RequestWebviewToHostMessage) => {
      switch (message.type) {
        case 'ready': {
          const parsed = tryParseRequestFile(document.getText());
          if (parsed) {
            const { variables } = await this.activeEnvironment.getActiveVariablesAndSettings();
            postToWebview({
              type: 'init',
              file: parsed,
              fileUri: document.uri.toString(),
              activeEnvName: this.activeEnvironment.getActiveName(),
              envVariableNames: variables.map((v) => v.name),
              envVariables: variables.filter((v) => v.enabled).map((v) => ({ name: v.name, value: v.value })),
            });
          } else {
            postToWebview({ type: 'error', message: 'Document contains invalid Albert request JSON.' });
          }
          break;
        }
        case 'edit': {
          await this.applyEditFromWebview(document, message.file, docKey);
          break;
        }
        case 'sendRequest': {
          const parsed = tryParseRequestFile(document.getText());
          if (!parsed) {
            postToWebview({ type: 'error', message: 'Cannot send request: document has invalid JSON.' });
            break;
          }
          await this.handleSendRequest(parsed, postToWebview, docKey);
          break;
        }
        case 'cancelRequest': {
          this.activeSends.get(docKey)?.abort();
          break;
        }
        case 'saveMarkdown': {
          await this.handleSaveMarkdown(document, message.markdown, message.suggestedName);
          break;
        }
        case 'runAgainstSample': {
          const parsed = tryParseRequestFile(document.getText());
          if (!parsed) {
            postToWebview({ type: 'error', message: 'Cannot run sample: document has invalid JSON.' });
            break;
          }
          await this.handleRunAgainstSample(parsed, postToWebview);
          break;
        }
        case 'requestPreview': {
          const parsed = tryParseRequestFile(document.getText());
          if (!parsed) {
            postToWebview({ type: 'error', message: 'Cannot preview: document has invalid JSON.' });
            break;
          }
          const { variables } = await this.activeEnvironment.getActiveVariablesAndSettings();
          const preview = resolveRequestForDisplay(parsed.request, variables);
          postToWebview({ type: 'previewResult', preview });
          break;
        }
        case 'diagnostics': {
          this.handleDiagnostics(document, message.diagnostics);
          break;
        }
      }
    });
  }

  private async handleSendRequest(
    file: RequestFile,
    postToWebview: (message: RequestHostToWebviewMessage) => void,
    docKey: string
  ): Promise<void> {
    const { variables, settings } = await this.activeEnvironment.getActiveVariablesAndSettings();
    const liveVariables = [...variables];

    const preview = resolveRequestPreview(file.request, liveVariables);
    const preScript = runPreRequestScript(file.scripts.preRequest, liveVariables, {
      method: preview.method,
      url: preview.url,
      headers: preview.headers,
      body: preview.body,
    });
    applyChangesToLocalVariables(liveVariables, preScript.environmentChanges);
    await this.activeEnvironment.applyVariableChanges(preScript.environmentChanges);

    const controller = new AbortController();
    this.activeSends.set(docKey, controller);
    let result;
    try {
      result = await sendRequest(file.request, liveVariables, settings, controller.signal);
    } finally {
      this.activeSends.delete(docKey);
    }

    const { testRun, environmentChanges } = runResponseTests(
      file.expectations,
      file.schemaValidation,
      file.scripts.postResponse,
      liveVariables,
      { status: result.status, headers: result.headers, bodyText: result.body }
    );
    await this.activeEnvironment.applyVariableChanges(environmentChanges);

    if (preScript.error) {
      testRun.scriptError = testRun.scriptError
        ? `pre-request: ${preScript.error}; post-response: ${testRun.scriptError}`
        : `pre-request: ${preScript.error}`;
    }
    testRun.consoleLogs = [...preScript.logs, ...testRun.consoleLogs];
    testRun.scriptResults = [...preScript.assertions, ...testRun.scriptResults];

    const resolvedRequest = resolveRequestForDisplay(file.request, liveVariables);
    postToWebview({ type: 'responseResult', result, testRun, request: resolvedRequest });
  }

  private async handleRunAgainstSample(
    file: RequestFile,
    postToWebview: (message: RequestHostToWebviewMessage) => void
  ): Promise<void> {
    const { variables } = await this.activeEnvironment.getActiveVariablesAndSettings();
    const { testRun, environmentChanges } = runResponseTests(
      file.expectations,
      file.schemaValidation,
      file.scripts.postResponse,
      variables,
      { status: 200, headers: {}, bodyText: file.sampleResponse }
    );
    await this.activeEnvironment.applyVariableChanges(environmentChanges);
    postToWebview({ type: 'sampleTestResult', testRun });
  }

  private async handleSaveMarkdown(
    document: vscode.TextDocument,
    markdown: string,
    suggestedName: string
  ): Promise<void> {
    const defaultUri = vscode.Uri.file(path.join(path.dirname(document.uri.fsPath), suggestedName));
    const target = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { Markdown: ['md'] },
      saveLabel: 'Save result as Markdown',
    });
    if (!target) return;
    try {
      await vscode.workspace.fs.writeFile(target, Buffer.from(markdown, 'utf8'));
    } catch (err: any) {
      vscode.window.showErrorMessage(`Albert: failed to save result: ${err?.message ?? err}`);
      return;
    }
    const open = await vscode.window.showInformationMessage(
      `Albert: saved result to ${path.basename(target.fsPath)}.`,
      'Open'
    );
    if (open === 'Open') await vscode.commands.executeCommand('vscode.open', target);
  }

  private async applyEditFromWebview(
    document: vscode.TextDocument,
    file: RequestFile,
    docKey: string
  ): Promise<void> {
    const newText = JSON.stringify(file, null, 2);
    if (newText === document.getText()) return;

    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
    edit.replace(document.uri, fullRange, newText);

    this.selfAppliedText.set(docKey, newText);
    await vscode.workspace.applyEdit(edit);
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const outDir = vscode.Uri.joinPath(this.context.extensionUri, 'out');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(outDir, 'webview-request.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(outDir, 'webview-request.css'));
    const workerBaseUri = webview.asWebviewUri(outDir).toString();
    const nonce = crypto.randomBytes(16).toString('base64');

    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} data:`,
      `font-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}' 'unsafe-eval' ${webview.cspSource}`,
      `connect-src ${webview.cspSource}`,
      `worker-src ${webview.cspSource} blob:`,
    ].join('; ');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Albert Request Editor</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">window.akrpWorkerBaseUri = ${JSON.stringify(workerBaseUri)};</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private handleDiagnostics(
    document: vscode.TextDocument,
    items: DiagnosticItem[]
  ): void {
    if (items.length === 0) {
      this.diagnostics.delete(document.uri);
      return;
    }
    const jsonText = document.getText();
    const vscodeDiags: vscode.Diagnostic[] = [];
    for (const item of items) {
      const range = locateDiagnosticRange(jsonText, item);
      if (!range) continue;
      const severity = item.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
      vscodeDiags.push(new vscode.Diagnostic(range, item.message, severity));
    }
    this.diagnostics.set(document.uri, vscodeDiags);
  }
}

const SCRIPT_FIELD_PATHS: Record<string, jsonc.JSONPath> = {
  preRequest: ['scripts', 'preRequest'],
  postResponse: ['scripts', 'postResponse'],
  schema: ['schemaValidation', 'schema'],
  sampleResponse: ['sampleResponse'],
  requestBody: ['request', 'body', 'content'],
};

/**
 * Locates a script/schema field's string value via the JSON AST (not text search) so a field name
 * that happens to also appear as substring text elsewhere in the document can't be mismatched, then
 * maps the diagnostic's Monaco line/column onto the file.
 *
 * `JSON.stringify` escapes embedded newlines, so a multi-line script's *entire* value — however many
 * logical lines it has in Monaco — sits on a single physical line in the on-disk file. A Monaco
 * diagnostic's line/column is relative to the decoded (real-newline) string value, so we can't just
 * add `item.line - 1` to the field's file line; instead we walk the raw encoded text, decoding escape
 * sequences one at a time, to find which raw column corresponds to the target decoded offset.
 */
function locateDiagnosticRange(jsonText: string, item: DiagnosticItem): vscode.Range | undefined {
  const path = SCRIPT_FIELD_PATHS[item.scriptName];
  if (!path) return undefined;

  const tree = jsonc.parseTree(jsonText);
  if (!tree) return undefined;
  const node = jsonc.findNodeAtLocation(tree, path);
  if (!node || node.type !== 'string' || typeof node.value !== 'string') return undefined;

  const decodedLines = node.value.split('\n');
  if (item.line < 1 || item.line > decodedLines.length) return undefined;
  let decodedStart = 0;
  for (let i = 0; i < item.line - 1; i++) decodedStart += decodedLines[i].length + 1;
  decodedStart += item.column - 1;
  const decodedEnd = decodedStart + item.length;

  // node.offset is the opening quote; content starts one char later.
  const contentStart = node.offset + 1;
  const before = jsonText.slice(0, contentStart);
  const beforeLines = before.split('\n');
  const fileLine = beforeLines.length;
  const startColumnBase = beforeLines[beforeLines.length - 1].length + 1;

  let raw = contentStart;
  let decoded = 0;
  let startColumn: number | undefined;
  let endColumn: number | undefined;
  const record = () => {
    const column = startColumnBase + (raw - contentStart);
    if (startColumn === undefined && decoded >= decodedStart) startColumn = column;
    if (endColumn === undefined && decoded >= decodedEnd) endColumn = column;
  };
  record();
  while (raw < jsonText.length && endColumn === undefined) {
    const ch = jsonText[raw];
    if (ch === '"') break;
    raw += ch === '\\' ? (jsonText[raw + 1] === 'u' ? 6 : 2) : 1;
    decoded += 1;
    record();
  }
  if (startColumn === undefined || endColumn === undefined) return undefined;

  return new vscode.Range(fileLine - 1, startColumn - 1, fileLine - 1, endColumn - 1);
}

function applyChangesToLocalVariables(
  variables: { name: string; value: string; enabled: boolean }[],
  changes: Map<string, string>
): void {
  for (const [name, value] of changes) {
    const existing = variables.find((v) => v.name === name);
    if (existing) existing.value = value;
    else variables.push({ name, value, enabled: true });
  }
}

function tryParseRequestFile(text: string): RequestFile | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.akrpType === 'request' && parsed.akrpVersion === 1 && parsed.request) {
      return parsed as RequestFile;
    }
    return null;
  } catch {
    return null;
  }
}
