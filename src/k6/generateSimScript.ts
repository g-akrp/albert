import { KeyValueEntry, SimProfile } from '../model/types';
import { planLoad } from '../model/loadProfile';
import { flowRuntimePreamble, generateStepsBody, ResolvedFlowStep } from './generateFlowScript';

export interface ResolvedSimFlow {
  /** scenario key — also the exec function name; must be a valid JS identifier. */
  key: string;
  label: string;
  targetTps: number;
  /** this flow's own load pattern — each flow can ramp/hold/spike independently. */
  profile: SimProfile;
  /** seconds into the sim run before this flow's scenario starts (k6 scenario `startTime`). */
  startAtSec: number;
  steps: ResolvedFlowStep[];
}

/**
 * Emits a k6 script with one arrival-rate scenario per flow, each driving its flow's step sequence
 * at the flow's own target TPS and load profile. The load profile maps to constant- or
 * ramping-arrival-rate executors. Metrics are auto-tagged by k6 with `scenario: <key>`, which the
 * runner aggregates per flow.
 */
export function generateSimScript(flows: ResolvedSimFlow[], variables: KeyValueEntry[]): string {
  const execFns = flows
    .map((f) => `export function ${f.key}() {\n${generateStepsBody(f.steps, variables, false)}\n}`)
    .join('\n\n');

  const scenarios = flows.map((f) => `    ${f.key}: ${buildExecutor(f.profile, f.targetTps, f.key, f.startAtSec)}`).join(',\n');

  return `${flowRuntimePreamble()}

export const options = {
  scenarios: {
${scenarios}
  },
};

${execFns}
`;
}

function buildExecutor(profile: SimProfile, targetTps: number, execName: string, startAtSec: number): string {
  // Derived from the shared load model so the generated k6 scenarios exactly match the editor's
  // planned-load preview.
  const plan = planLoad(profile, targetTps);
  const preAllocatedVUs = Math.max(1, plan.rate);
  const maxVUs = Math.max(preAllocatedVUs, plan.rate * 5);
  const startTime = startAtSec > 0 ? `startTime: '${Math.round(startAtSec)}s', ` : '';
  const common = `${startTime}timeUnit: '1s', preAllocatedVUs: ${preAllocatedVUs}, maxVUs: ${maxVUs}, exec: '${execName}', gracefulStop: '5s'`;

  if (plan.constant) {
    return `{ executor: 'constant-arrival-rate', rate: ${plan.rate}, duration: '${plan.stages[0].durationSec}s', ${common} }`;
  }

  const stages = plan.stages.map((s) => `{ target: ${s.toRate}, duration: '${s.durationSec}s' }`);
  return `{ executor: 'ramping-arrival-rate', startRate: ${plan.startRate}, ${common}, stages: [${stages.join(', ')}] }`;
}
