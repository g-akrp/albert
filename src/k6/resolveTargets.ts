import * as fs from 'fs/promises';
import * as path from 'path';
import { ApmConfig, KeyValueEntry, SimProfile, SimScenarioMeta } from '../model/types';
import { parseEnvConfigFile, parseFlowFile, parseRequestFile, parseSimFile } from '../model/parse';
import { ResolvedFlowStep } from './generateFlowScript';
import { ResolvedSimFlow } from './generateSimScript';

/**
 * Node-fs target resolvers shared by the CLI: load a flow/sim file and the `.abrq`/`.abf` files it
 * references (relative to the target), producing the resolved structures the k6 codegen consumes.
 */

export async function resolveFlow(flowPath: string): Promise<{ name: string; steps: ResolvedFlowStep[] }> {
  const flow = parseFlowFile(await readText(flowPath));
  if (!flow) throw new Error(`Not a valid .abf flow file: ${flowPath}`);
  const flowDir = path.dirname(path.resolve(flowPath));
  const steps = await resolveFlowSteps(flowDir, flow.steps);
  return { name: flow.name, steps };
}

export async function resolveSim(
  simPath: string
): Promise<{ name: string; profile: SimProfile; flows: ResolvedSimFlow[]; metas: SimScenarioMeta[]; apm?: ApmConfig }> {
  const sim = parseSimFile(await readText(simPath));
  if (!sim) throw new Error(`Not a valid .abl sim file: ${simPath}`);
  const simDir = path.dirname(path.resolve(simPath));

  const flows: ResolvedSimFlow[] = [];
  const metas: SimScenarioMeta[] = [];
  for (const entry of sim.flows) {
    if (!entry.enabled) continue;
    if (!entry.flowPath) throw new Error('A sim flow entry has no flow selected.');
    const flowAbs = path.resolve(simDir, entry.flowPath);
    const flow = parseFlowFile(await readText(flowAbs));
    if (!flow) throw new Error(`Could not load flow "${entry.flowPath}".`);
    const steps = await resolveFlowSteps(path.dirname(flowAbs), flow.steps);
    const key = scenarioKey(entry.id);
    const label = flow.name || entry.flowPath;
    flows.push({ key, label, targetTps: entry.targetTps, steps });
    metas.push({ key, label, targetTps: entry.targetTps });
  }
  if (flows.length === 0) throw new Error('Sim has no enabled flows.');
  return { name: sim.name, profile: sim.profile, flows, metas, apm: sim.apm };
}

async function resolveFlowSteps(flowDir: string, steps: { enabled: boolean; requestPath: string; name: string }[]): Promise<ResolvedFlowStep[]> {
  const resolved: ResolvedFlowStep[] = [];
  for (const step of steps as any[]) {
    if (!step.enabled) continue;
    if (!step.requestPath) throw new Error(`Step "${step.name}" has no request selected.`);
    const reqAbs = path.resolve(flowDir, step.requestPath);
    const req = parseRequestFile(await readText(reqAbs));
    if (!req) throw new Error(`Could not load request "${step.requestPath}".`);
    resolved.push({ step, request: req.request, expectations: req.expectations, schemaValidation: req.schemaValidation });
  }
  return resolved;
}

/** Mirrors SimEditorProvider.scenarioKey — a valid JS identifier used as both scenario key and exec name. */
function scenarioKey(id: string): string {
  return 's_' + id.replace(/[^a-zA-Z0-9_]/g, '_');
}

export async function loadEnvVariables(envPath: string | undefined): Promise<KeyValueEntry[]> {
  if (!envPath) return [];
  const env = parseEnvConfigFile(await readText(envPath));
  if (!env) throw new Error(`Not a valid .abenv env file: ${envPath}`);
  return env.variables;
}

async function readText(p: string): Promise<string> {
  return fs.readFile(p, 'utf8');
}
