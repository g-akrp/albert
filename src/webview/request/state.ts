import {
  createEmptyRequestFile,
  DiagnosticItem,
  EnvVariable,
  RequestFile,
  RequestWebviewToHostMessage,
  ResolvedRequestPreview,
  SendResult,
  TestRunResult,
} from '../../model/types';
import { getVsCodeApi } from '../vscodeApi';
import { collectScriptDiagnostics } from '../components/monacoSetup';
import { buildResultMarkdown } from './resultMarkdown';

export const vscodeApi = getVsCodeApi<RequestWebviewToHostMessage>();

export interface HistoryEntry {
  id: string;
  timestamp: number;
  request: ResolvedRequestPreview;
  result: SendResult;
  testRun: TestRunResult;
}

const MAX_HISTORY_ENTRIES = 20;

type Listener = () => void;

class RequestStore {
  file: RequestFile = createEmptyRequestFile('');
  fileUri: string = '';
  activeEnvName: string | null = null;
  activeEnvVariableNames: string[] = [];
  activeEnvVariables: EnvVariable[] = [];
  sending = false;
  lastResult: SendResult | null = null;
  lastTestRun: TestRunResult | null = null;
  lastTestRunSource: 'live' | 'sample' | null = null;
  lastRequestUsed: ResolvedRequestPreview | null = null;
  currentPreview: ResolvedRequestPreview | null = null;
  history: HistoryEntry[] = [];
  expandedHistoryIds = new Set<string>();
  availableStories: string[] = [];

  private listeners: Listener[] = [];
  private editTimer: ReturnType<typeof setTimeout> | null = null;
  private editInFlight = false;
  private diagTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe(fn: Listener): void {
    this.listeners.push(fn);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  setFile(file: RequestFile): void {
    if (this.editTimer) return;
    if (this.editInFlight) {
      this.editInFlight = false;
      if (JSON.stringify(file) === JSON.stringify(this.file)) return;
    }
    this.file = file;
    this.notify();
  }

  setFileUri(uri: string): void {
    this.fileUri = uri;
  }

  mutate(fn: (file: RequestFile) => void): void {
    fn(this.file);
    this.scheduleEdit();
    this.notify();
  }

  mutateQuiet(fn: (file: RequestFile) => void): void {
    fn(this.file);
    this.scheduleEdit();
  }

  private scheduleEdit(): void {
    if (this.editTimer) clearTimeout(this.editTimer);
    this.editTimer = setTimeout(() => {
      this.editTimer = null;
      this.editInFlight = true;
      vscodeApi.postMessage({ type: 'edit', file: this.file });
    }, 200);
  }

  send(): void {
    this.sending = true;
    this.lastResult = null;
    this.lastTestRun = null;
    this.notify();
    vscodeApi.postMessage({ type: 'sendRequest' });
  }

  cancelSend(): void {
    vscodeApi.postMessage({ type: 'cancelRequest' });
  }

  saveResultMarkdown(): void {
    if (!this.lastResult) return;
    const markdown = buildResultMarkdown(
      this.file.name,
      this.lastRequestUsed,
      this.lastResult,
      this.lastTestRunSource === 'live' ? this.lastTestRun : null,
      this.file.scripts.postResponse,
      this.file.schemaValidation.schema
    );
    const suggestedName = (this.file.name || 'request').replace(/[\\/:*?"<>|]/g, '_') + '-result.md';
    vscodeApi.postMessage({ type: 'saveMarkdown', markdown, suggestedName });
  }

  runAgainstSample(): void {
    vscodeApi.postMessage({ type: 'runAgainstSample' });
  }

  requestPreview(): void {
    vscodeApi.postMessage({ type: 'requestPreview' });
  }

  pickEpic(): void {
    vscodeApi.postMessage({ type: 'pickEpic' });
  }

  pickFeature(epicPath: string): void {
    vscodeApi.postMessage({ type: 'pickFeature', epicPath });
  }

  setPreviewResult(preview: ResolvedRequestPreview): void {
    this.currentPreview = preview;
    this.notify();
  }

  setResponse(result: SendResult, testRun: TestRunResult, request: ResolvedRequestPreview): void {
    this.sending = false;
    this.lastResult = result;
    this.lastTestRun = testRun;
    this.lastTestRunSource = 'live';
    this.lastRequestUsed = request;
    this.history.unshift({ id: genId('hist'), timestamp: Date.now(), request, result, testRun });
    if (this.history.length > MAX_HISTORY_ENTRIES) this.history.length = MAX_HISTORY_ENTRIES;
    this.notify();
  }

  setSampleTestRun(testRun: TestRunResult): void {
    this.lastTestRun = testRun;
    this.lastTestRunSource = 'sample';
    this.notify();
  }

  toggleHistoryExpanded(id: string): void {
    if (this.expandedHistoryIds.has(id)) this.expandedHistoryIds.delete(id);
    else this.expandedHistoryIds.add(id);
    this.notify();
  }

  clearHistory(): void {
    this.history = [];
    this.expandedHistoryIds.clear();
    this.notify();
  }

  setActiveEnvName(name: string | null, variableNames: string[], envVariables: EnvVariable[]): void {
    this.activeEnvName = name;
    this.activeEnvVariableNames = variableNames;
    this.activeEnvVariables = envVariables;
    this.notify();
  }

  scheduleDiagnostics(): void {
    if (!this.fileUri) return;
    if (this.diagTimer) clearTimeout(this.diagTimer);
    this.diagTimer = setTimeout(() => {
      const items = collectScriptDiagnostics();
      vscodeApi.postMessage({ type: 'diagnostics', fileUri: this.fileUri, diagnostics: items });
    }, 400);
  }
}

export const store = new RequestStore();

export function genId(prefix: string): string {
  return `${prefix}_${(globalThis.crypto as Crypto).randomUUID().slice(0, 8)}`;
}
