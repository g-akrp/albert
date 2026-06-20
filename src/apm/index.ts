import * as vscode from 'vscode';
import { ApmExportResult, SimFile, SimSummary } from '../model/types';
import { sendToNewRelic } from './newrelic';

const SECRET_KEY = 'albert.newRelicApiKey';

export async function hasApmKey(context: vscode.ExtensionContext): Promise<boolean> {
  return !!(await context.secrets.get(SECRET_KEY));
}

export async function getApmKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  return context.secrets.get(SECRET_KEY);
}

/** Prompts for a New Relic Insert (License) API key and stores it in VS Code SecretStorage. */
export async function promptAndStoreApmKey(context: vscode.ExtensionContext): Promise<void> {
  const key = await vscode.window.showInputBox({
    prompt: 'New Relic Metric API key (Insert/License key). Stored securely in VS Code SecretStorage.',
    password: true,
    ignoreFocusOut: true,
  });
  if (key === undefined) return;
  if (key.trim() === '') {
    await context.secrets.delete(SECRET_KEY);
    vscode.window.showInformationMessage('Albert: New Relic API key cleared.');
    return;
  }
  await context.secrets.store(SECRET_KEY, key.trim());
  vscode.window.showInformationMessage('Albert: New Relic API key saved.');
}

/** Dispatches a completed sim summary to the configured APM provider. */
export async function exportToApm(sim: SimFile, summary: SimSummary, key: string): Promise<ApmExportResult> {
  if (!sim.apm) return { provider: 'none', ok: false, message: 'No APM configured.' };
  switch (sim.apm.provider) {
    case 'newrelic':
      return sendToNewRelic(sim, summary, key, sim.apm.region);
    default:
      return { provider: sim.apm.provider, ok: false, message: `Unsupported APM provider "${sim.apm.provider}".` };
  }
}
