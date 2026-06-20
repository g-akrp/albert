import * as vscode from 'vscode';
import { RequestEditorProvider } from './editor/RequestEditorProvider';
import { EnvConfigEditorProvider } from './editor/EnvConfigEditorProvider';
import { FlowEditorProvider } from './editor/FlowEditorProvider';
import { SimEditorProvider } from './editor/SimEditorProvider';
import { HistoryViewerProvider } from './editor/HistoryViewerProvider';
import { ActiveEnvironment } from './activeEnvironment';
import { createStatusBarItem } from './statusBar';
import { newRequestFile } from './commands/newRequestFile';
import { newRequestFromCurl } from './commands/newRequestFromCurl';
import { newEnvConfigFile } from './commands/newEnvConfigFile';
import { newFlowFile } from './commands/newFlowFile';
import { newSimFile } from './commands/newSimFile';
import { selectActiveEnvironment } from './commands/selectActiveEnvironment';
import { installCli, uninstallCli } from './commands/installCli';
import { startComposeStack } from './commands/startComposeStack';
import { promptAndStoreApmKey } from './apm';
import { registerFormatOnSave } from './formatOnSave';

export function activate(context: vscode.ExtensionContext): void {
  const activeEnvironment = new ActiveEnvironment(context);

  context.subscriptions.push(
    RequestEditorProvider.register(context, activeEnvironment),
    EnvConfigEditorProvider.register(context),
    FlowEditorProvider.register(context, activeEnvironment),
    SimEditorProvider.register(context, activeEnvironment),
    HistoryViewerProvider.register(context),
    createStatusBarItem(activeEnvironment)
  );

  registerFormatOnSave(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('albert.newRequestFile', (targetUri?: vscode.Uri) => newRequestFile(targetUri)),
    vscode.commands.registerCommand('albert.newRequestFromCurl', (targetUri?: vscode.Uri) => newRequestFromCurl(targetUri)),
    vscode.commands.registerCommand('albert.newEnvConfigFile', (targetUri?: vscode.Uri) => newEnvConfigFile(targetUri)),
    vscode.commands.registerCommand('albert.newFlowFile', (targetUri?: vscode.Uri) => newFlowFile(targetUri)),
    vscode.commands.registerCommand('albert.newSimFile', (targetUri?: vscode.Uri) => newSimFile(targetUri)),
    vscode.commands.registerCommand('albert.setNewRelicKey', () => promptAndStoreApmKey(context)),
    vscode.commands.registerCommand('albert.installCli', () => installCli(context)),
    vscode.commands.registerCommand('albert.uninstallCli', () => uninstallCli()),
    vscode.commands.registerCommand('albert.startGrafanaStack', () => startComposeStack(context, 'grafana')),
    vscode.commands.registerCommand('albert.startAllureStack', () => startComposeStack(context, 'allure')),
    vscode.commands.registerCommand('albert.selectActiveEnvironment', () => selectActiveEnvironment(activeEnvironment)),
    vscode.commands.registerCommand('albert.openAsText', async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) return;
      await vscode.commands.executeCommand('vscode.openWith', target, 'default');
    })
  );
}

export function deactivate(): void {}
