import { KeyValueEntry, SimProfile } from '../model/types';
import { planLoad } from '../model/loadProfile';
import { flowRuntimePreamble, generateStepsBody, ResolvedFlowStep } from './generateFlowScript';

export interface ResolvedSimFlow {
  /** scenario key — also the exec function name; must be a valid JS identifier. */
  key: string;
  label: string;
  targetTps: number;
  steps: ResolvedFlowStep[];
}

/**
 * Emits a k6 script with one arrival-rate scenario per flow, each driving its flow's step sequence
 * at the flow's target TPS. The load profile maps to constant- or ramping-arrival-rate executors.
 * Metrics are auto-tagged by k6 with `scenario: <key>`, which the runner aggregates per flow.
 */
export function generateSimScript(flows: ResolvedSimFlow[], profile: SimProfile, variables: KeyValueEntry[]): string {
  const execFns = flows
    .map((f) => `export function ${f.key}() {\n${generateStepsBody(f.steps, variables, false)}\n}`)
    .join('\n\n');

  const scenarios = flows.map((f) => `    ${f.key}: ${buildExecutor(profile, f.targetTps, f.key)}`).join(',\n');

  return `${flowRuntimePreamble()}

export const options = {
  scenarios: {
${scenarios}
  },
};

${execFns}
`;
}

function buildExecutor(profile: SimProfile, targetTps: number, execName: string): string {
  // Derived from the shared load model so the generated k6 scenarios exactly match the editor's
  // planned-load preview.
  const plan = planLoad(profile, targetTps);
  const preAllocatedVUs = Math.max(1, plan.rate);
  const maxVUs = Math.max(preAllocatedVUs, plan.rate * 5);
  const common = `timeUnit: '1s', preAllocatedVUs: ${preAllocatedVUs}, maxVUs: ${maxVUs}, exec: '${execName}', gracefulStop: '5s'`;

  if (plan.constant) {
    return `{ executor: 'constant-arrival-rate', rate: ${plan.rate}, duration: '${plan.stages[0].durationSec}s', ${common} }`;
  }

  const stages = plan.stages.map((s) => `{ target: ${s.toRate}, duration: '${s.durationSec}s' }`);
  return `{ executor: 'ramping-arrival-rate', startRate: ${plan.startRate}, ${common}, stages: [${stages.join(', ')}] }`;
}
