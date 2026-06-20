import * as vscode from 'vscode';
import * as path from 'path';
import { existsSync } from 'fs';

export type ComposeStackName = 'grafana' | 'allure';

const STACKS: Record<ComposeStackName, { label: string; composeRelPath: string; readyMessage: string }> = {
  grafana: {
    label: 'Grafana/InfluxDB',
    composeRelPath: path.join('albert-stack', 'compose.yml'),
    readyMessage: 'Grafana: http://localhost:3000 · InfluxDB: http://localhost:8086 (db "k6")',
  },
  allure: {
    label: 'Allure Report Server',
    composeRelPath: path.join('example', 'allure', 'compose.yml'),
    readyMessage: 'Allure: http://localhost:5050/allure-docker-service/projects/default/reports/latest/index.html',
  },
};

/**
 * Brings up one of the bundled compose stacks (Grafana/InfluxDB or Allure) via an integrated
 * terminal, mirroring the `npm install -g` pattern used by installCli. Compose files are repo-only
 * tooling, so on a published/installed extension they may be absent.
 */
export async function startComposeStack(context: vscode.ExtensionContext, stack: ComposeStackName): Promise<void> {
  const { label, composeRelPath, readyMessage } = STACKS[stack];
  const composeFile = path.join(context.extensionPath, composeRelPath);

  if (!existsSync(composeFile)) {
    vscode.window.showErrorMessage(
      `Albert: ${label} compose file not found at ${composeFile}. This stack ships with the Albert repo, not the published extension — clone the repo to use it.`
    );
    return;
  }

  const engine = await vscode.window.showQuickPick(['podman', 'docker'], {
    placeHolder: `Start ${label} with…`,
  });
  if (!engine) return;

  const terminal = vscode.window.createTerminal(`Albert: ${label}`);
  terminal.show();
  const command = engine === 'docker' ? `docker compose -f "${composeFile}" up -d` : `podman-compose -f "${composeFile}" up -d`;
  terminal.sendText(command);

  vscode.window.showInformationMessage(`Albert: starting ${label}… ${readyMessage}`);
}
