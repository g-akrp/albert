import { FlowStepResult, SendResult, SimSummary, SimTick, TestRunResult } from '../model/types';

/** NDJSON event union written to a `.ablog`. Pure types — safe to import in the browser web bundle. */
export type AblogEvent =
  | { ts: number; type: 'runStart'; target: string; kind: 'request' | 'flow' | 'sim'; name: string }
  | { ts: number; type: 'step'; step: FlowStepResult }
  | { ts: number; type: 'request'; result: SendResult; testRun: TestRunResult }
  | { ts: number; type: 'tick'; tick: SimTick }
  | { ts: number; type: 'summary'; summary: SimSummary }
  | { ts: number; type: 'runEnd'; ok: boolean; error?: string };
