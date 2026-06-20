import {
  createEmptyFlowFile,
  FlowFile,
  FlowRunHistoryEntry,
  FlowRunResult,
  FlowStepResult,
  FlowWebviewToHostMessage,
} from '../../model/types';
import { getVsCodeApi } from '../vscodeApi';

export const vscodeApi = getVsCodeApi<FlowWebviewToHostMessage>();

const MAX_HISTORY_ENTRIES = 50;

type Listener = () => void;

class FlowStore {
  file: FlowFile = createEmptyFlowFile('');
  fileUri = '';
  activeEnvName: string | null = null;
  running = false;
  stepResults: FlowStepResult[] = [];
  lastRun: FlowRunResult | null = null;
  history: FlowRunHistoryEntry[] = [];
  expandedHistoryIds = new Set<string>();

  private listeners: Listener[] = [];
  private editTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe(fn: Listener): void {
    this.listeners.push(fn);
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  setFile(file: FlowFile): void {
    this.file = file;
    this.notify();
  }

  setActiveEnvName(name: string | null): void {
    this.activeEnvName = name;
    this.notify();
  }

  mutate(fn: (file: FlowFile) => void): void {
    fn(this.file);
    this.scheduleEdit();
    this.notify();
  }

  mutateQuiet(fn: (file: FlowFile) => void): void {
    fn(this.file);
    this.scheduleEdit();
  }

  private scheduleEdit(): void {
    if (this.editTimer) clearTimeout(this.editTimer);
    this.editTimer = setTimeout(() => {
      vscodeApi.postMessage({ type: 'edit', file: this.file });
    }, 200);
  }

  run(): void {
    this.running = true;
    this.stepResults = [];
    this.lastRun = null;
    this.notify();
    vscodeApi.postMessage({ type: 'runFlow' });
  }

  stop(): void {
    vscodeApi.postMessage({ type: 'stopFlow' });
  }

  onStarted(): void {
    this.running = true;
    this.stepResults = [];
    this.lastRun = null;
    this.notify();
  }

  onStep(result: FlowStepResult): void {
    this.stepResults.push(result);
    this.notify();
  }

  onDone(result: FlowRunResult): void {
    this.running = false;
    this.lastRun = result;
    if (result.steps.length) this.stepResults = result.steps;
    this.history.unshift({
      id: genId('run'),
      timestamp: Date.now(),
      flowName: this.file.name,
      result,
    });
    if (this.history.length > MAX_HISTORY_ENTRIES) this.history.length = MAX_HISTORY_ENTRIES;
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

  saveHistory(): void {
    vscodeApi.postMessage({ type: 'saveHistory', history: this.history });
  }

  pickRequest(stepId: string): void {
    vscodeApi.postMessage({ type: 'pickRequestForStep', stepId });
  }

  setRequestPath(stepId: string, requestPath: string): void {
    this.mutate(() => {
      const step = this.file.steps.find((s) => s.id === stepId);
      if (step) step.requestPath = requestPath;
    });
  }
}

export const store = new FlowStore();

export function genId(prefix: string): string {
  return `${prefix}_${(globalThis.crypto as Crypto).randomUUID().slice(0, 8)}`;
}
