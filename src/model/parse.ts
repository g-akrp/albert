import { EnvConfigFile, FlowFile, FlowStep, HistoryFile, RequestFile, SimFile } from './types';

/**
 * Pure (vscode-free) discriminator parsers for the Albert file formats, shared by the editors and the
 * `albert` CLI. Each returns the typed object or null if the text isn't valid JSON of that kind.
 */

export function parseRequestFile(text: string): RequestFile | null {
  const parsed = tryJson(text);
  if (parsed && parsed.albertType === 'request' && parsed.albertVersion === 1 && parsed.request) {
    return parsed as RequestFile;
  }
  return null;
}

export function parseFlowFile(text: string): FlowFile | null {
  const parsed = tryJson(text);
  if (parsed && parsed.albertType === 'flow' && parsed.albertVersion === 1 && Array.isArray(parsed.steps)) {
    for (const s of parsed.steps as FlowStep[]) if (!Array.isArray(s.captures)) s.captures = [];
    return parsed as FlowFile;
  }
  return null;
}

export function parseSimFile(text: string): SimFile | null {
  const parsed = tryJson(text);
  if (parsed && parsed.albertType === 'sim' && parsed.albertVersion === 1 && Array.isArray(parsed.flows)) {
    return parsed as SimFile;
  }
  return null;
}

export function parseEnvConfigFile(text: string): EnvConfigFile | null {
  const parsed = tryJson(text);
  if (parsed && parsed.albertType === 'env_config' && parsed.albertVersion === 1 && Array.isArray(parsed.variables)) {
    return parsed as EnvConfigFile;
  }
  return null;
}

export function parseHistoryFile(text: string): HistoryFile | null {
  const parsed = tryJson(text);
  if (parsed && parsed.albertType === 'history' && parsed.albertVersion === 1 && Array.isArray(parsed.flowRuns)) {
    return parsed as HistoryFile;
  }
  return null;
}

function tryJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
