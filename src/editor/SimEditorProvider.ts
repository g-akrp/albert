import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as path from 'path';
import {
  FlowFile,
  RequestFile,
  SimFile,
  SimHostToWebviewMessage,
  SimRunResult,
  SimScenarioMeta,
  SimWebviewToHostMessage,
} from '../model/types';
import { ActiveEnvironment } from '../activeEnvironment';
import { ResolvedFlowStep } from '../k6/generateFlowScript';
import { generateSimScript, ResolvedSimFlow } from '../k6/generateSimScript';
import { runSim, SimRunHandle } from '../k6/simRunner';
import { ensureK6 } from '../k6/binary';
import { exportToApm, getApmKey, hasApmKey, promptAndStoreApmKey } from '../apm';
import { AblogWriter, timestampedAblogPath } from '../cli/ablog';

export class SimEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'albert.simEditor';

  private readonly selfAppliedText = new Map<string, string>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly activeEnvironment: ActiveEnvironment
  ) {}

  public static register(context: vscode.ExtensionContext, activeEnvironment: ActiveEnvironment): vscode.Disposable {
    const provider = new SimEditorProvider(context, activeEnvironment);
    return vscode.window.registerCustomEditorProvider(SimEditorProvider.viewType, provider, {
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

    const postToWebview = (message: SimHostToWebviewMessage) => {
      void webviewPanel.webview.postMessage(message);
    };
    const docKey = document.uri.toString();
    let activeRun: SimRunHandle | undefined;

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== docKey) return;
      const currentText = e.document.getText();
      if (this.selfAppliedText.get(docKey) === currentText) return;
      const parsed = tryParseSimFile(currentText);
      if (parsed) postToWebview({ type: 'documentChanged', file: parsed });
      else postToWebview({ type: 'error', message: 'Document contains invalid Albert sim JSON.' });
    });

    const envSub = this.activeEnvironment.onDidChange(() => {
      postToWebview({ type: 'activeEnvironmentChanged', activeEnvName: this.activeEnvironment.getActiveName() });
    });

    webviewPanel.onDidDispose(() => {
      activeRun?.stop();
      changeSub.dispose();
      envSub.dispose();
      this.selfAppliedText.delete(docKey);
    });

    webviewPanel.webview.onDidReceiveMessage(async (message: SimWebviewToHostMessage) => {
      switch (message.type) {
        case 'ready': {
          const parsed = tryParseSimFile(document.getText());
          if (parsed) {
            postToWebview({
              type: 'init',
              file: parsed,
              fileUri: document.uri.toString(),
              activeEnvName: this.activeEnvironment.getActiveName(),
              hasApmKey: await hasApmKey(this.context),
            });
          } else {
            postToWebview({ type: 'error', message: 'Document contains invalid Albert sim JSON.' });
          }
          break;
        }
        case 'edit':
          await this.applyEditFromWebview(document, message.file, docKey);
          break;
        case 'pickFlowForEntry':
          await this.handlePickFlow(document, message.entryId, postToWebview);
          break;
        case 'setApmKey': {
          await promptAndStoreApmKey(this.context);
          postToWebview({ type: 'apmKeyChanged', hasApmKey: await hasApmKey(this.context) });
          break;
        }
        case 'stopSim':
          activeRun?.stop();
          break;
        case 'runSim': {
          const parsed = tryParseSimFile(document.getText());
          if (!parsed) {
            postToWebview({ type: 'error', message: 'Cannot run sim: document has invalid JSON.' });
            break;
          }
          activeRun = await this.handleRunSim(document, parsed, postToWebview);
          break;
        }
      }
    });
  }

  private async handlePickFlow(
    document: vscode.TextDocument,
    entryId: string,
    postToWebview: (m: SimHostToWebviewMessage) => void
  ): Promise<void> {
    const files = await vscode.workspace.findFiles('**/*.abf', '**/node_modules/**', 500);
    if (files.length === 0) {
      vscode.window.showInformationMessage('Albert: no .abf files found in this workspace.');
      return;
    }
    const simDir = path.dirname(document.uri.fsPath);
    const items = files
      .map((uri) => ({ label: toRelative(simDir, uri.fsPath), uri }))
      .sort((a, b) => a.label.localeCompare(b.label));
    const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Pick a flow (.abf) for this entry' });
    if (!picked) return;
    postToWebview({ type: 'flowPicked', entryId, flowPath: picked.label });
  }

  private async handleRunSim(
    document: vscode.TextDocument,
    sim: SimFile,
    postToWebview: (m: SimHostToWebviewMessage) => void
  ): Promise<SimRunHandle | undefined> {
    const simDir = path.dirname(document.uri.fsPath);
    const resolvedFlows: ResolvedSimFlow[] = [];
    const metas: SimScenarioMeta[] = [];

    for (const entry of sim.flows) {
      if (!entry.enabled) continue;
      if (!entry.flowPath) {
        postToWebview({ type: 'simDone', result: { ok: false, error: 'A flow entry has no flow selected.' } });
        return undefined;
      }
      const flowFile = await this.loadFlowFile(simDir, entry.flowPath);
      if (!flowFile) {
        postToWebview({ type: 'simDone', result: { ok: false, error: `Could not load flow "${entry.flowPath}".` } });
        return undefined;
      }
      const steps = await this.resolveFlowSteps(simDir, entry.flowPath, flowFile);
      if (!steps) {
        postToWebview({ type: 'simDone', result: { ok: false, error: `A request referenced by "${entry.flowPath}" could not be loaded.` } });
        return undefined;
      }
      const key = scenarioKey(entry.id);
      resolvedFlows.push({
        key,
        label: flowFile.name || entry.flowPath,
        targetTps: entry.targetTps,
        profile: entry.profile,
        startAtSec: entry.startAtSec,
        steps,
      });
      metas.push({ key, label: flowFile.name || entry.flowPath, targetTps: entry.targetTps });
    }

    if (resolvedFlows.length === 0) {
      postToWebview({ type: 'simDone', result: { ok: false, error: 'Sim has no enabled flows.' } });
      return undefined;
    }

    const { variables } = await this.activeEnvironment.getActiveVariablesAndSettings();
    const script = generateSimScript(resolvedFlows, variables);

    let k6Path: string;
    try {
      k6Path = await ensureK6(this.context);
    } catch (err: any) {
      postToWebview({ type: 'simDone', result: { ok: false, error: err?.message ?? String(err) } });
      return undefined;
    }

    const ablogPath = timestampedAblogPath(document.uri.fsPath);
    const log = new AblogWriter(ablogPath);
    log.write({ type: 'runStart', target: document.uri.fsPath, kind: 'sim', name: sim.name });

    const extraArgs = sim.streaming ? ['--out', `influxdb=${sim.streaming.url}`] : [];

    const handle = await runSim(
      k6Path,
      script,
      metas,
      () => postToWebview({ type: 'simStarted', scenarios: metas }),
      (tick) => {
        log.write({ type: 'tick', tick });
        postToWebview({ type: 'simTick', tick });
      },
      extraArgs
    );

    void handle.result.then(async (result) => {
      if (result.summary) log.write({ type: 'summary', summary: result.summary });
      log.write({ type: 'runEnd', ok: result.ok, error: result.error });
      await log.close();
      postToWebview({ type: 'ablogSaved', path: ablogPath });

      const finalResult = await this.maybeExportApm(sim, result);
      postToWebview({ type: 'simDone', result: finalResult });
    });

    return handle;
  }

  private async maybeExportApm(sim: SimFile, result: SimRunResult): Promise<SimRunResult> {
    if (!sim.apm || !result.summary) return result;
    const key = await getApmKey(this.context);
    if (!key) {
      result.summary.apmExport = { provider: sim.apm.provider, ok: false, message: 'APM export skipped — no API key set.' };
      return result;
    }
    result.summary.apmExport = await exportToApm(sim, result.summary, key);
    return result;
  }

  private async loadFlowFile(simDir: string, flowPath: string): Promise<FlowFile | null> {
    try {
      const uri = vscode.Uri.file(path.resolve(simDir, flowPath));
      const bytes = await vscode.workspace.fs.readFile(uri);
      const parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
      if (parsed && parsed.albertType === 'flow' && Array.isArray(parsed.steps)) return parsed as FlowFile;
      return null;
    } catch {
      return null;
    }
  }

  private async resolveFlowSteps(simDir: string, flowPath: string, flow: FlowFile): Promise<ResolvedFlowStep[] | null> {
    const flowDir = path.dirname(path.resolve(simDir, flowPath));
    const resolved: ResolvedFlowStep[] = [];
    for (const step of flow.steps) {
      if (!step.enabled) continue;
      const reqFile = await this.loadRequestFile(flowDir, step.requestPath);
      if (!reqFile) return null;
      resolved.push({
        step,
        request: reqFile.request,
        expectations: reqFile.expectations,
        schemaValidation: reqFile.schemaValidation,
      });
    }
    return resolved;
  }

  private async loadRequestFile(flowDir: string, requestPath: string): Promise<RequestFile | null> {
    try {
      const uri = vscode.Uri.file(path.resolve(flowDir, requestPath));
      const bytes = await vscode.workspace.fs.readFile(uri);
      const parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
      if (parsed && parsed.albertType === 'request' && parsed.request) return parsed as RequestFile;
      return null;
    } catch {
      return null;
    }
  }

  private async applyEditFromWebview(document: vscode.TextDocument, file: SimFile, docKey: string): Promise<void> {
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
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(outDir, 'webview-sim.js'));
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
  <title>Albert Sim Editor</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function scenarioKey(id: string): string {
  return 's_' + id.replace(/[^a-zA-Z0-9_]/g, '_');
}

function toRelative(fromDir: string, target: string): string {
  return path.relative(fromDir, target).split(path.sep).join('/');
}

export function tryParseSimFile(text: string): SimFile | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.albertType === 'sim' && parsed.albertVersion === 1 && Array.isArray(parsed.flows)) {
      return parsed as SimFile;
    }
    return null;
  } catch {
    return null;
  }
}
