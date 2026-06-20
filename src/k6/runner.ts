import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import { FlowRunResult, FlowStepResult } from '../model/types';

const STEP_PREFIX = '__albert_step ';

export interface FlowRunHandle {
  result: Promise<FlowRunResult>;
  stop: () => void;
}

/**
 * Runs a generated flow script once (1 VU / 1 iteration) via k6, parsing the per-step `__albert_step`
 * lines into ordered results. Streams each step to `onStep` as it arrives so the UI can fill live.
 * Returns a handle so the caller can cancel the run; any steps already emitted are kept.
 *
 * Takes a resolved `k6Path` (callers resolve it via `ensureK6`/`ensureK6At`) so this stays vscode-free
 * and reusable by the CLI. `extraArgs` are appended to the k6 invocation (e.g. `--out influxdb=…`).
 */
export async function runFlowOnce(
  k6Path: string,
  script: string,
  onStep: (result: FlowStepResult) => void,
  extraArgs: string[] = []
): Promise<FlowRunHandle> {
  const scriptDir = await fs.mkdtemp(path.join(os.tmpdir(), 'albert-flow-'));
  const scriptPath = path.join(scriptDir, 'flow.js');
  await fs.writeFile(scriptPath, script, 'utf8');

  let child: ReturnType<typeof spawn> | undefined;
  let stoppedByUser = false;

  const result = (async () => {
    try {
      return await new Promise<FlowRunResult>((resolve) => {
        const c = spawn(k6Path, ['run', '--no-usage-report', '--vus', '1', '--iterations', '1', ...extraArgs, scriptPath], {
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        child = c;

        const steps: FlowStepResult[] = [];
        let tail = '';
        let outBuf = '';
        let errBuf = '';

      const consumeLines = (chunk: string) => {
        tail += chunk;
        let idx: number;
        while ((idx = tail.indexOf('\n')) >= 0) {
          const line = tail.slice(0, idx).replace(/\r$/, '');
          tail = tail.slice(idx + 1);
          handleLine(line);
        }
      };

      const handleLine = (line: string) => {
        const at = line.indexOf(STEP_PREFIX);
        if (at < 0) return;
        // k6 wraps console.log as `INFO[0000] __albert_step {json} source=console`, so slice from the
        // first brace and take only the balanced JSON object (the trailing ` source=console` and any
        // log prefix are ignored).
        const json = extractJsonObject(line, at + STEP_PREFIX.length);
        if (!json) return;
        try {
          const result = JSON.parse(json) as FlowStepResult;
          steps.push(result);
          onStep(result);
        } catch {
          // ignore malformed step lines
        }
      };

        c.stdout.on('data', (d) => {
          const s = d.toString();
          outBuf += s;
          consumeLines(s);
        });
        c.stderr.on('data', (d) => {
          const s = d.toString();
          errBuf += s;
          consumeLines(s);
        });

        c.on('error', (err) => {
          resolve({ ok: false, steps, error: `Failed to launch k6: ${err.message}` });
        });

        c.on('close', (code) => {
          if (tail.trim()) handleLine(tail);
          const summary = (outBuf + errBuf).split('\n').filter((l) => !l.includes(STEP_PREFIX)).join('\n').trim();
          if (stoppedByUser) {
            resolve({ ok: false, steps, summary, error: 'Flow run cancelled.' });
            return;
          }
          const ok = code === 0 && steps.every((s) => !s.error && s.checks.every((ck) => ck.pass));
          resolve({
            ok,
            steps,
            summary,
            error: code !== 0 && steps.length === 0 ? `k6 exited with code ${code}: ${errBuf.slice(-2000)}` : undefined,
          });
        });
      });
    } finally {
      await fs.rm(scriptDir, { recursive: true, force: true }).catch(() => undefined);
    }
  })();

  return {
    result,
    stop: () => {
      stoppedByUser = true;
      try {
        child?.kill();
      } catch {
        // ignore
      }
    },
  };
}

/** Extracts the first balanced `{…}` JSON object starting at/after `from`, respecting strings and
 *  escapes, so trailing text after the object (e.g. k6's ` source=console`) is ignored. */
function extractJsonObject(line: string, from: number): string | null {
  const start = line.indexOf('{', from);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < line.length; i++) {
    const ch = line[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return line.slice(start, i + 1);
    }
  }
  return null;
}
