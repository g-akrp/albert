import * as vscode from 'vscode';
import { ensureK6At } from './binaryCore';

/**
 * Extension-side k6 resolver: honours the `albert.k6Path` setting, caches under the extension's
 * global storage, and surfaces download progress via a VS Code notification. Delegates the actual
 * download/extract to the vscode-free `ensureK6At` (shared with the CLI).
 */
export async function ensureK6(context: vscode.ExtensionContext): Promise<string> {
  const override = vscode.workspace.getConfiguration('albert').get<string>('k6Path');
  const cacheDir = vscode.Uri.joinPath(context.globalStorageUri, 'k6').fsPath;

  if (override && override.trim()) {
    return ensureK6At(cacheDir, { k6Path: override });
  }

  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Albert: preparing k6…', cancellable: false },
    (progress) => ensureK6At(cacheDir, { onProgress: (message) => progress.report({ message }) })
  );
}
