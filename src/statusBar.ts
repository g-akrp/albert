import * as vscode from 'vscode';
import { ActiveEnvironment } from './activeEnvironment';

export function createStatusBarItem(activeEnvironment: ActiveEnvironment): vscode.Disposable {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.command = 'albert.selectActiveEnvironment';

  const refresh = () => {
    const name = activeEnvironment.getActiveName();
    item.text = `$(globe) Env: ${name ?? 'none'}`;
    item.tooltip = 'Albert: click to select the active environment';
  };

  refresh();
  item.show();

  const sub = activeEnvironment.onDidChange(refresh);

  return vscode.Disposable.from(item, sub);
}
