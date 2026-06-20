import * as vscode from 'vscode';
import { createEmptyRequestFile } from '../model/types';

export async function newRequestFile(targetUri?: vscode.Uri): Promise<void> {
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

  const fileUri = vscode.Uri.joinPath(folderUri, `${sanitizeFileName(name)}.abrq`);
  const content = Buffer.from(JSON.stringify(createEmptyRequestFile(name), null, 2), 'utf8');

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
