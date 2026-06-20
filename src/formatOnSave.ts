import * as vscode from 'vscode';
import { RequestFile } from './model/types';

export function registerFormatOnSave(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.onWillSaveTextDocument((e) => {
      if (!e.document.uri.fsPath.endsWith('.abrq')) return;
      e.waitUntil(formatJsonBodyIfNeeded(e.document));
    })
  );
}

async function formatJsonBodyIfNeeded(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
  let parsed: RequestFile;
  try {
    parsed = JSON.parse(document.getText());
  } catch {
    return [];
  }

  if (parsed.request?.body?.mode !== 'json' || !parsed.request.body.content.trim()) return [];

  let formattedContent: string;
  try {
    formattedContent = JSON.stringify(JSON.parse(parsed.request.body.content), null, 2);
  } catch {
    return [];
  }
  if (formattedContent === parsed.request.body.content) return [];

  parsed.request.body.content = formattedContent;
  const newText = JSON.stringify(parsed, null, 2);
  const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
  return [vscode.TextEdit.replace(fullRange, newText)];
}
