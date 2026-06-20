import * as vscode from 'vscode';
import { ActiveEnvironment } from '../activeEnvironment';

export async function selectActiveEnvironment(activeEnvironment: ActiveEnvironment): Promise<void> {
  const files = await vscode.workspace.findFiles('**/*.abenv', '**/node_modules/**');
  if (files.length === 0) {
    vscode.window.showInformationMessage('Albert: no .abenv files found in this workspace.');
    return;
  }

  const items: (vscode.QuickPickItem & { uri: vscode.Uri | undefined })[] = files
    .map((uri) => ({
      label: vscode.workspace.asRelativePath(uri),
      uri,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  items.push({ label: 'None (clear active environment)', uri: undefined });

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select the active Albert environment',
  });
  if (!picked) return;

  await activeEnvironment.setActive(picked.uri);
}
