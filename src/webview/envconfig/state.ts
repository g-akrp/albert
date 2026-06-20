import { createEmptyEnvConfigFile, EnvConfigFile, EnvWebviewToHostMessage } from '../../model/types';
import { getVsCodeApi } from '../vscodeApi';

export const vscodeApi = getVsCodeApi<EnvWebviewToHostMessage>();

type Listener = () => void;

class EnvStore {
  file: EnvConfigFile = createEmptyEnvConfigFile('');

  private listeners: Listener[] = [];
  private editTimer: ReturnType<typeof setTimeout> | null = null;
  private editInFlight = false;

  subscribe(fn: Listener): void {
    this.listeners.push(fn);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  setFile(file: EnvConfigFile): void {
    if (this.editTimer) return;
    if (this.editInFlight) {
      this.editInFlight = false;
      if (JSON.stringify(file) === JSON.stringify(this.file)) return;
    }
    this.file = file;
    this.notify();
  }

  mutate(fn: (file: EnvConfigFile) => void): void {
    fn(this.file);
    this.scheduleEdit();
    this.notify();
  }

  mutateQuiet(fn: (file: EnvConfigFile) => void): void {
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
}

export const store = new EnvStore();
