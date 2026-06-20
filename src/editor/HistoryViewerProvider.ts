import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { HistoryFile, HistoryViewerHostToWebviewMessage, HistoryViewerWebviewToHostMessage } from '../model/types';

/** Read-only viewer for *.abh flow run history files. Renders saved runs; never edits the file. */
export class HistoryViewerProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'albert.historyViewer';

  constructor(private readonly context: vscode.ExtensionContext) {}

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new HistoryViewerProvider(context);
    return vscode.window.registerCustomEditorProvider(HistoryViewerProvider.viewType, provider, {
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

    const postToWebview = (message: HistoryViewerHostToWebviewMessage) => {
      void webviewPanel.webview.postMessage(message);
    };
    const docKey = document.uri.toString();

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== docKey) return;
      const parsed = tryParseHistoryFile(e.document.getText());
      if (parsed) postToWebview({ type: 'documentChanged', file: parsed });
      else postToWebview({ type: 'error', message: 'Document contains invalid Albert history JSON.' });
    });

    webviewPanel.onDidDispose(() => changeSub.dispose());

    webviewPanel.webview.onDidReceiveMessage((message: HistoryViewerWebviewToHostMessage) => {
      if (message.type === 'ready') {
        const parsed = tryParseHistoryFile(document.getText());
        if (parsed) postToWebview({ type: 'init', file: parsed });
        else postToWebview({ type: 'error', message: 'Document contains invalid Albert history JSON.' });
      }
    });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const outDir = vscode.Uri.joinPath(this.context.extensionUri, 'out');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(outDir, 'webview-history.js'));
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
  <title>Albert Flow Run History</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

export function tryParseHistoryFile(text: string): HistoryFile | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.akrpType === 'history' && parsed.akrpVersion === 1 && Array.isArray(parsed.flowRuns)) {
      return parsed as HistoryFile;
    }
    return null;
  } catch {
    return null;
  }
}
