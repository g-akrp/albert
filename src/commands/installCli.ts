import * as vscode from 'vscode';

/**
 * Installs the bundled `albert` CLI globally by running `npm install -g "<extensionPath>"` in an
 * integrated terminal. npm reads the manifest's `"bin"` and generates a cross-platform `albert` shim
 * pointing at the shipped `out/cli.js`. Requires npm on PATH.
 */
export async function installCli(context: vscode.ExtensionContext): Promise<void> {
  const choice = await vscode.window.showInformationMessage(
    'Install the `albert` CLI globally? This opens a terminal and runs ' +
      '`npm install -g "<extension>"` (requires Node/npm on your PATH).',
    'Install',
    'Cancel'
  );
  if (choice !== 'Install') return;

  const terminal = vscode.window.createTerminal('Albert: install CLI');
  terminal.show();
  terminal.sendText(`npm install -g "${context.extensionPath}"`);
}

export function uninstallCli(): void {
  const terminal = vscode.window.createTerminal('Albert: uninstall CLI');
  terminal.show();
  terminal.sendText('npm uninstall -g albert');
}
