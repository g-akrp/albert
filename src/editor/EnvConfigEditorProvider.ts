import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { EnvConfigFile, EnvHostToWebviewMessage, EnvWebviewToHostMessage } from '../model/types';

export class EnvConfigEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'albert.envConfigEditor';

  private readonly selfAppliedText = new Map<string, string>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new EnvConfigEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(EnvConfigEditorProvider.viewType, provider, {
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

    const postToWebview = (message: EnvHostToWebviewMessage) => {
      void webviewPanel.webview.postMessage(message);
    };

    const docKey = document.uri.toString();

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== docKey) return;
      const currentText = e.document.getText();
      if (this.selfAppliedText.get(docKey) === currentText) return;
      const parsed = tryParseEnvConfigFile(currentText);
      if (parsed) postToWebview({ type: 'documentChanged', file: parsed });
      else postToWebview({ type: 'error', message: 'Document contains invalid Albert environment config JSON.' });
    });

    webviewPanel.onDidDispose(() => {
      changeSub.dispose();
      this.selfAppliedText.delete(docKey);
    });

    webviewPanel.webview.onDidReceiveMessage(async (message: EnvWebviewToHostMessage) => {
      switch (message.type) {
        case 'ready': {
          const parsed = tryParseEnvConfigFile(document.getText());
          if (parsed) postToWebview({ type: 'init', file: parsed });
          else postToWebview({ type: 'error', message: 'Document contains invalid Albert environment config JSON.' });
          break;
        }
        case 'edit': {
          await this.applyEditFromWebview(document, message.file, docKey);
          break;
        }
      }
    });
  }

  private async applyEditFromWebview(
    document: vscode.TextDocument,
    file: EnvConfigFile,
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
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview-env.js'));
    const nonce = crypto.randomBytes(16).toString('base64');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; connect-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Albert Environment Config Editor</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function tryParseEnvConfigFile(text: string): EnvConfigFile | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.akrpType === 'env_config' && parsed.akrpVersion === 1 && Array.isArray(parsed.variables)) {
      return parsed as EnvConfigFile;
    }
    return null;
  } catch {
    return null;
  }
}
