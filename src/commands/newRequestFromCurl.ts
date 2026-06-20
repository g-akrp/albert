import * as vscode from 'vscode';
import { createEmptyRequestFile } from '../model/types';
import { parseCurlCommand } from '../model/curlParser';

export async function newRequestFromCurl(targetUri?: vscode.Uri): Promise<void> {
  const curl = await vscode.window.showInputBox({
    prompt: 'Paste the cURL command to import',
    placeHolder: "curl -X POST https://api.example.com/users -H 'Content-Type: application/json' -d '{}'",
    ignoreFocusOut: true,
  });
  if (!curl) return;
  if (!/^\s*curl\b/i.test(curl)) {
    vscode.window.showErrorMessage('Albert: that does not look like a curl command.');
    return;
  }

  const name = await vscode.window.showInputBox({
    prompt: 'Name for the new API request',
    value: 'New Request',
  });
  if (!name) return;

  const folderUri = targetUri ?? vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!folderUri) {
    vscode.window.showErrorMessage('Albert: open a folder or workspace before creating a request file.');
    return;
  }

  const file = createEmptyRequestFile(name);
  try {
    file.request = parseCurlCommand(curl);
  } catch (err: any) {
    vscode.window.showErrorMessage(`Albert: failed to parse curl command: ${err?.message ?? err}`);
    return;
  }

  const fileUri = vscode.Uri.joinPath(folderUri, `${sanitizeFileName(name)}.abrq`);
  const content = Buffer.from(JSON.stringify(file, null, 2), 'utf8');

  try {
    await vscode.workspace.fs.writeFile(fileUri, content);
  } catch (err: any) {
    vscode.window.showErrorMessage(`Albert: failed to create file: ${err?.message ?? err}`);
    return;
  }

  await vscode.commands.executeCommand('vscode.openWith', fileUri, 'albert.requestEditor');
}

function sanitizeFileName(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|]/g, '_') || 'New Request';
}
