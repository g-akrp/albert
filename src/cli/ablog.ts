import * as fs from 'fs';
import * as path from 'path';
import { AblogEvent } from './ablogTypes';

export { AblogEvent };

/** One timestamped `.ablog` per run, kept alongside the source file so past runs aren't overwritten. */
export function timestampedAblogPath(sourceFsPath: string): string {
  const dir = path.dirname(sourceFsPath);
  const base = path.basename(sourceFsPath).replace(/\.[^.]+$/, '');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(dir, `${base}.${ts}.ablog`);
}

/** Distributive omit so each union member keeps its own keys (a plain Omit would merge them). */
type AblogEventInput = AblogEvent extends infer T ? (T extends AblogEvent ? Omit<T, 'ts'> : never) : never;

/** Appends events as NDJSON. Truncates on open so each run produces a fresh log. */
export class AblogWriter {
  private readonly stream: fs.WriteStream;

  constructor(public readonly path: string) {
    this.stream = fs.createWriteStream(path, { flags: 'w' });
  }

  write(event: AblogEventInput): void {
    const full = { ts: Date.now(), ...event } as AblogEvent;
    this.stream.write(JSON.stringify(full) + '\n');
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.stream.end(resolve));
  }
}
