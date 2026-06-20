import * as vscode from 'vscode';
import { EnvConfigFile, EnvSettings, KeyValueEntry } from './model/types';

const STORAGE_KEY = 'albert.activeEnvConfigUri';

export class ActiveEnvironment {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  public readonly onDidChange = this._onDidChange.event;

  private activeUri: vscode.Uri | undefined;
  private activeName: string | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    const stored = context.workspaceState.get<string>(STORAGE_KEY);
    if (stored) {
      this.activeUri = vscode.Uri.parse(stored);
      void this.refreshName();
    }
  }

  public getActiveName(): string | null {
    return this.activeName ?? null;
  }

  public getActiveUri(): vscode.Uri | undefined {
    return this.activeUri;
  }

  public async setActive(uri: vscode.Uri | undefined): Promise<void> {
    this.activeUri = uri;
    await this.context.workspaceState.update(STORAGE_KEY, uri?.toString());
    await this.refreshName();
    this._onDidChange.fire();
  }

  private async refreshName(): Promise<void> {
    if (!this.activeUri) {
      this.activeName = undefined;
      return;
    }
    try {
      const bytes = await vscode.workspace.fs.readFile(this.activeUri);
      const parsed = JSON.parse(Buffer.from(bytes).toString('utf8')) as EnvConfigFile;
      this.activeName = parsed.name;
    } catch {
      this.activeName = undefined;
    }
  }

  public async getActiveVariableNames(): Promise<string[]> {
    const { variables } = await this.getActiveVariablesAndSettings();
    return variables.map((v) => v.name);
  }

  public async getActiveVariablesAndSettings(): Promise<{ variables: KeyValueEntry[]; settings: EnvSettings }> {
    if (!this.activeUri) {
      return { variables: [], settings: {} };
    }
    try {
      const bytes = await vscode.workspace.fs.readFile(this.activeUri);
      const parsed = JSON.parse(Buffer.from(bytes).toString('utf8')) as EnvConfigFile;
      return { variables: parsed.variables ?? [], settings: parsed.settings ?? {} };
    } catch {
      return { variables: [], settings: {} };
    }
  }

  /** Applies environment.set() changes from a script run back to the active env_config file on disk. */
  public async applyVariableChanges(changes: Map<string, string>): Promise<void> {
    if (!this.activeUri || changes.size === 0) return;
    try {
      const bytes = await vscode.workspace.fs.readFile(this.activeUri);
      const text = Buffer.from(bytes).toString('utf8');
      const parsed = JSON.parse(text) as EnvConfigFile;
      for (const [name, value] of changes) {
        const existing = parsed.variables.find((v) => v.name === name);
        if (existing) existing.value = value;
        else parsed.variables.push({ name, value, enabled: true });
      }
      const newText = JSON.stringify(parsed, null, 2);
      const edit = new vscode.WorkspaceEdit();
      const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === this.activeUri!.toString());
      if (doc) {
        const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
        edit.replace(this.activeUri, fullRange, newText);
        await vscode.workspace.applyEdit(edit);
      } else {
        await vscode.workspace.fs.writeFile(this.activeUri, Buffer.from(newText, 'utf8'));
      }
    } catch {
      // If the active env file is missing/invalid, silently skip — scripts shouldn't crash the send flow.
    }
  }
}
