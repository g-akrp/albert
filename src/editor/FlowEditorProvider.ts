import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as path from 'path';
import {
  createHistoryFile,
  FlowFile,
  FlowHostToWebviewMessage,
  FlowRunHistoryEntry,
  FlowStep,
  FlowWebviewToHostMessage,
  RequestFile,
} from '../model/types';
import { ActiveEnvironment } from '../activeEnvironment';
import { generateFlowScript, ResolvedFlowStep } from '../k6/generateFlowScript';
import { FlowRunHandle, runFlowOnce } from '../k6/runner';
import { ensureK6 } from '../k6/binary';
import { reportFlowToAllure } from '../allure/allureReporter';

export class FlowEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'albert.flowEditor';

  private readonly selfAppliedText = new Map<string, string>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly activeEnvironment: ActiveEnvironment
  ) {}

  public static register(context: vscode.ExtensionContext, activeEnvironment: ActiveEnvironment): vscode.Disposable {
    const provider = new FlowEditorProvider(context, activeEnvironment);
    return vscode.window.registerCustomEditorProvider(FlowEditorProvider.viewType, provider, {
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

    const postToWebview = (message: FlowHostToWebviewMessage) => {
      void webviewPanel.webview.postMessage(message);
    };
    const docKey = document.uri.toString();
    let activeRun: FlowRunHandle | undefined;

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== docKey) return;
      const currentText = e.document.getText();
      if (this.selfAppliedText.get(docKey) === currentText) return;
      const parsed = tryParseFlowFile(currentText);
      if (parsed) postToWebview({ type: 'documentChanged', file: parsed });
      else postToWebview({ type: 'error', message: 'Document contains invalid Albert flow JSON.' });
    });

    const envSub = this.activeEnvironment.onDidChange(() => {
      postToWebview({ type: 'activeEnvironmentChanged', activeEnvName: this.activeEnvironment.getActiveName() });
    });

    const configSub = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('albert.allure.enabled')) {
        postToWebview({ type: 'allureEnabledChanged', allureEnabled: isAllureEnabled() });
      }
    });

    webviewPanel.onDidDispose(() => {
      activeRun?.stop();
      changeSub.dispose();
      envSub.dispose();
      configSub.dispose();
      this.selfAppliedText.delete(docKey);
    });

    webviewPanel.webview.onDidReceiveMessage(async (message: FlowWebviewToHostMessage) => {
      switch (message.type) {
        case 'ready': {
          const parsed = tryParseFlowFile(document.getText());
          if (parsed) {
            postToWebview({
              type: 'init',
              file: parsed,
              fileUri: document.uri.toString(),
              activeEnvName: this.activeEnvironment.getActiveName(),
              allureEnabled: isAllureEnabled(),
            });
          } else {
            postToWebview({ type: 'error', message: 'Document contains invalid Albert flow JSON.' });
          }
          break;
        }
        case 'edit': {
          await this.applyEditFromWebview(document, message.file, docKey);
          break;
        }
        case 'pickRequestForStep': {
          await this.handlePickRequest(document, message.stepId, postToWebview);
          break;
        }
        case 'runFlow': {
          const parsed = tryParseFlowFile(document.getText());
          if (!parsed) {
            postToWebview({ type: 'error', message: 'Cannot run flow: document has invalid JSON.' });
            break;
          }
          activeRun = await this.handleRunFlow(document, parsed, postToWebview);
          break;
        }
        case 'stopFlow': {
          activeRun?.stop();
          break;
        }
        case 'saveHistory': {
          await this.handleSaveHistory(document, message.history, postToWebview);
          break;
        }
      }
    });
  }

  private async handleSaveHistory(
    document: vscode.TextDocument,
    history: FlowRunHistoryEntry[],
    postToWebview: (m: FlowHostToWebviewMessage) => void
  ): Promise<void> {
    if (history.length === 0) {
      vscode.window.showInformationMessage('Albert: no flow runs to save yet.');
      return;
    }
    const flow = tryParseFlowFile(document.getText());
    const baseName = (flow?.name || path.basename(document.uri.fsPath, '.abf') || 'flow').replace(/[\\/:*?"<>|]/g, '_');
    const defaultUri = vscode.Uri.file(path.join(path.dirname(document.uri.fsPath), `${baseName}-history.abh`));

    const target = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { 'Albert Flow Run History': ['abh'] },
      saveLabel: 'Save flow run history',
    });
    if (!target) return;

    const historyFile = createHistoryFile(flow?.name || baseName, history);
    try {
      await vscode.workspace.fs.writeFile(target, Buffer.from(JSON.stringify(historyFile, null, 2), 'utf8'));
    } catch (err: any) {
      postToWebview({ type: 'error', message: `Failed to save history: ${err?.message ?? err}` });
      return;
    }
    postToWebview({ type: 'historySaved', path: target.fsPath });
    const open = await vscode.window.showInformationMessage(
      `Albert: saved ${history.length} flow run(s) to ${path.basename(target.fsPath)}.`,
      'Open'
    );
    if (open === 'Open') await vscode.commands.executeCommand('vscode.openWith', target, 'albert.historyViewer');
  }

  private async handlePickRequest(
    document: vscode.TextDocument,
    stepId: string,
    postToWebview: (m: FlowHostToWebviewMessage) => void
  ): Promise<void> {
    const files = await vscode.workspace.findFiles('**/*.abrq', '**/node_modules/**', 500);
    if (files.length === 0) {
      vscode.window.showInformationMessage('Albert: no .abrq files found in this workspace.');
      return;
    }
    const flowDir = path.dirname(document.uri.fsPath);
    const items = files
      .map((uri) => ({ label: toRelative(flowDir, uri.fsPath), uri }))
      .sort((a, b) => a.label.localeCompare(b.label));
    const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Pick a request (.abrq) for this step' });
    if (!picked) return;
    postToWebview({ type: 'requestPicked', stepId, requestPath: picked.label });
  }

  private async handleRunFlow(
    document: vscode.TextDocument,
    flow: FlowFile,
    postToWebview: (m: FlowHostToWebviewMessage) => void
  ): Promise<FlowRunHandle | undefined> {
    postToWebview({ type: 'flowStarted' });

    const flowDir = path.dirname(document.uri.fsPath);
    const resolvedSteps: ResolvedFlowStep[] = [];
    for (const step of flow.steps) {
      if (!step.enabled) continue;
      if (!step.requestPath) {
        postToWebview({ type: 'flowDone', result: { ok: false, steps: [], error: `Step "${step.name}" has no request selected.` } });
        return undefined;
      }
      const reqFile = await this.loadRequestFile(flowDir, step.requestPath);
      if (!reqFile) {
        postToWebview({
          type: 'flowDone',
          result: { ok: false, steps: [], error: `Could not load request "${step.requestPath}" for step "${step.name}".` },
        });
        return undefined;
      }
      resolvedSteps.push({
        step,
        request: reqFile.request,
        expectations: reqFile.expectations,
        schemaValidation: reqFile.schemaValidation,
        allureReportConfig: reqFile.allureReportConfig,
      });
    }

    if (resolvedSteps.length === 0) {
      postToWebview({ type: 'flowDone', result: { ok: false, steps: [], error: 'Flow has no enabled steps.' } });
      return undefined;
    }

    const { variables } = await this.activeEnvironment.getActiveVariablesAndSettings();
    const script = generateFlowScript(resolvedSteps, variables);

    let k6Path: string;
    try {
      k6Path = await ensureK6(this.context);
    } catch (err: any) {
      postToWebview({ type: 'flowDone', result: { ok: false, steps: [], error: err?.message ?? String(err) } });
      return undefined;
    }

    try {
      const handle = await runFlowOnce(k6Path, script, (stepResult) => postToWebview({ type: 'flowStep', result: stepResult }));
      void handle.result.then((result) => {
        postToWebview({ type: 'flowDone', result });
        void reportFlowToAllure(flow.name || 'Flow', document.uri.fsPath, result);
      });
      return handle;
    } catch (err: any) {
      postToWebview({ type: 'flowDone', result: { ok: false, steps: [], error: err?.message ?? String(err) } });
      return undefined;
    }
  }

  private async loadRequestFile(flowDir: string, requestPath: string): Promise<RequestFile | null> {
    try {
      const uri = vscode.Uri.file(path.resolve(flowDir, requestPath));
      const bytes = await vscode.workspace.fs.readFile(uri);
      const parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
      if (parsed && parsed.albertType === 'request' && parsed.request) {
        if (!parsed.allureReportConfig) {
          parsed.allureReportConfig = {
            description: '',
            severity: 'normal',
            feature: '',
            story: '',
            suite: '',
            owner: '',
            tags: [],
          };
        }
        if (!Array.isArray(parsed.allureReportConfig.tags)) {
          parsed.allureReportConfig.tags = [];
        }
        return parsed as RequestFile;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async applyEditFromWebview(document: vscode.TextDocument, file: FlowFile, docKey: string): Promise<void> {
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
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(outDir, 'webview-flow.js'));
    const nonce = crypto.randomBytes(16).toString('base64');

    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} data:`,
      `font-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}' ${webview.cspSource}`,
    ].join('; ');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Albert Flow Editor</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function isAllureEnabled(): boolean {
  return vscode.workspace.getConfiguration('albert').get<boolean>('allure.enabled', false);
}

function toRelative(fromDir: string, target: string): string {
  return path.relative(fromDir, target).split(path.sep).join('/');
}

export function tryParseFlowFile(text: string): FlowFile | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.albertType === 'flow' && parsed.albertVersion === 1 && Array.isArray(parsed.steps)) {
      // tolerate older/hand-edited files missing optional arrays
      for (const s of parsed.steps as FlowStep[]) if (!Array.isArray(s.captures)) s.captures = [];
      return parsed as FlowFile;
    }
    return null;
  } catch {
    return null;
  }
}
