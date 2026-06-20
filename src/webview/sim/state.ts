import {
  createEmptySimFile,
  SimFile,
  SimRunResult,
  SimScenarioMeta,
  SimSummary,
  SimTick,
  SimWebviewToHostMessage,
} from '../../model/types';
import { getVsCodeApi } from '../vscodeApi';

export const vscodeApi = getVsCodeApi<SimWebviewToHostMessage>();

type Listener = () => void;

class SimStore {
  file: SimFile = createEmptySimFile('');
  fileUri = '';
  activeEnvName: string | null = null;
  hasApmKey = false;
  running = false;
  scenarios: SimScenarioMeta[] = [];
  ticks: SimTick[] = [];
  summary: SimSummary | null = null;
  error: string | null = null;
  resultView: 'xy' | 'sankey' | 'table' = 'xy';

  private listeners: Listener[] = [];
  private editTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe(fn: Listener): void {
    this.listeners.push(fn);
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  setFile(file: SimFile): void {
    this.file = file;
    this.notify();
  }

  setActiveEnvName(name: string | null): void {
    this.activeEnvName = name;
    this.notify();
  }

  setHasApmKey(v: boolean): void {
    this.hasApmKey = v;
    this.notify();
  }

  mutate(fn: (file: SimFile) => void): void {
    fn(this.file);
    this.scheduleEdit();
    this.notify();
  }

  mutateQuiet(fn: (file: SimFile) => void): void {
    fn(this.file);
    this.scheduleEdit();
  }

  private scheduleEdit(): void {
    if (this.editTimer) clearTimeout(this.editTimer);
    this.editTimer = setTimeout(() => vscodeApi.postMessage({ type: 'edit', file: this.file }), 200);
  }

  run(): void {
    this.running = true;
    this.ticks = [];
    this.summary = null;
    this.error = null;
    this.scenarios = [];
    this.notify();
    vscodeApi.postMessage({ type: 'runSim' });
  }

  stop(): void {
    vscodeApi.postMessage({ type: 'stopSim' });
  }

  onStarted(scenarios: SimScenarioMeta[]): void {
    this.running = true;
    this.scenarios = scenarios;
    this.ticks = [];
    this.summary = null;
    this.error = null;
    this.notify();
  }

  onTick(tick: SimTick): void {
    this.ticks.push(tick);
    this.notify();
  }

  onDone(result: SimRunResult): void {
    this.running = false;
    this.summary = result.summary ?? null;
    this.error = result.error ?? null;
    this.notify();
  }

  pickFlow(entryId: string): void {
    vscodeApi.postMessage({ type: 'pickFlowForEntry', entryId });
  }

  setFlowPath(entryId: string, flowPath: string): void {
    this.mutate(() => {
      const entry = this.file.flows.find((f) => f.id === entryId);
      if (entry) entry.flowPath = flowPath;
    });
  }

  setApmKey(): void {
    vscodeApi.postMessage({ type: 'setApmKey' });
  }

  setResultView(view: 'xy' | 'sankey' | 'table'): void {
    this.resultView = view;
    this.notify();
  }

  scenarioLabel(key: string): string {
    return this.scenarios.find((s) => s.key === key)?.label ?? key;
  }
}

export const store = new SimStore();

export function genId(prefix: string): string {
  return `${prefix}_${(globalThis.crypto as Crypto).randomUUID().slice(0, 8)}`;
}
