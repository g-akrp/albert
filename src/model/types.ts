export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type BodyMode = 'none' | 'json' | 'text' | 'form-urlencoded';

/** Content-Type sent automatically for a given body mode when the Headers tab doesn't already
 *  set one explicitly — shared by httpClient.ts (applies it) and the Body tab UI (shows it as a hint). */
export const DEFAULT_CONTENT_TYPE_BY_BODY_MODE: Partial<Record<BodyMode, string>> = {
  json: 'application/json',
  'form-urlencoded': 'application/x-www-form-urlencoded',
};

export type AuthType = 'none' | 'basic' | 'bearer' | 'api-key';

export type ApiKeyLocation = 'header' | 'query';

export type ValueFormat = 'string' | 'number' | 'boolean' | 'json';

export interface KeyValueEntry {
  name: string;
  value: string;
  enabled: boolean;
}

export interface QueryEntry {
  key: string;
  format: ValueFormat;
  value: string;
  enabled: boolean;
}

export interface RequestBody {
  mode: BodyMode;
  content: string;
  formData?: KeyValueEntry[];
}

export interface AuthConfig {
  type: AuthType;
  basic?: { username: string; password: string };
  bearer?: { token: string };
  apiKey?: { key: string; value: string; in: ApiKeyLocation };
}

export interface RequestDetails {
  method: HttpMethod;
  endpoint: string;
  path: string;
  headers: KeyValueEntry[];
  query: QueryEntry[];
  body: RequestBody;
  auth: AuthConfig;
}

// --- Scripting & testing ---

export interface RequestScripts {
  preRequest: string;
  postResponse: string;
}

export type ExpectTarget = 'status' | 'header' | 'body';
export type ExpectOperator = 'equals' | 'notEquals' | 'contains' | 'exists' | 'matches' | 'greaterThan' | 'lessThan';

export interface ExpectAssertion {
  id: string;
  target: ExpectTarget;
  path?: string; // header name when target === 'header'; dot/bracket path when target === 'body'
  operator: ExpectOperator;
  expected: string;
}

export interface SchemaValidationConfig {
  enabled: boolean;
  schema: string;
}

export interface AssertionResult {
  description: string;
  pass: boolean;
  message?: string;
}

export interface TestRunResult {
  expectResults: AssertionResult[];
  schemaValidation?: { valid: boolean; errors: string[] };
  scriptResults: AssertionResult[];
  consoleLogs: string[];
  scriptError?: string;
}

// --- Request file (.abrq) ---

export interface RequestFile {
  akrpType: 'request';
  akrpVersion: 1;
  name: string;
  request: RequestDetails;
  scripts: RequestScripts;
  expectations: ExpectAssertion[];
  schemaValidation: SchemaValidationConfig;
  sampleResponse: string;
}

export function createEmptyRequestFile(name: string): RequestFile {
  return {
    akrpType: 'request',
    akrpVersion: 1,
    name,
    request: {
      method: 'GET',
      endpoint: '',
      path: '',
      headers: [],
      query: [],
      body: { mode: 'none', content: '' },
      auth: { type: 'none' },
    },
    scripts: { preRequest: '', postResponse: '' },
    expectations: [],
    schemaValidation: { enabled: false, schema: '' },
    sampleResponse: '',
  };
}

// --- Flow file (.abf) ---

/** Pulls a value out of a step's response so later steps can use it as {{variable}}. */
export interface FlowCapture {
  variable: string;
  source: 'body' | 'header' | 'status';
  /** dot/bracket JSON path when source === 'body'; header name when source === 'header'. */
  path?: string;
}

export interface FlowStep {
  id: string;
  name: string;
  /** workspace-relative path to a .abrq file. */
  requestPath: string;
  enabled: boolean;
  /** run this request's expectations + schema as k6 checks. */
  validate: boolean;
  captures: FlowCapture[];
}

export interface FlowFile {
  akrpType: 'flow';
  akrpVersion: 1;
  name: string;
  steps: FlowStep[];
}

export function createEmptyFlowFile(name: string): FlowFile {
  return { akrpType: 'flow', akrpVersion: 1, name, steps: [] };
}

export interface FlowCheckResult {
  description: string;
  pass: boolean;
}

export interface FlowStepResult {
  stepId: string;
  name: string;
  method: string;
  url: string;
  status: number;
  durationMs: number;
  checks: FlowCheckResult[];
  bodyPreview: string;
  error?: string;
}

export interface FlowRunResult {
  ok: boolean;
  steps: FlowStepResult[];
  summary?: string;
  error?: string;
}

// --- Flow run history file (.abh) ---

export interface FlowRunHistoryEntry {
  id: string;
  /** epoch milliseconds when the run finished. */
  timestamp: number;
  flowName: string;
  result: FlowRunResult;
}

export interface HistoryFile {
  akrpType: 'history';
  akrpVersion: 1;
  name: string;
  kind: 'flow';
  flowRuns: FlowRunHistoryEntry[];
}

export function createHistoryFile(name: string, flowRuns: FlowRunHistoryEntry[]): HistoryFile {
  return { akrpType: 'history', akrpVersion: 1, name, kind: 'flow', flowRuns };
}

// --- Simulation file (.abl) ---

export type LoadProfile = 'constant' | 'load' | 'stress' | 'spike' | 'soak';

export interface SimFlowEntry {
  id: string;
  /** workspace-relative path to a .abf file. */
  flowPath: string;
  /** target throughput in iterations (flow runs) per second. */
  targetTps: number;
  enabled: boolean;
}

export interface SimProfile {
  type: LoadProfile;
  durationSec: number;
  /** ramp-up window (seconds) for staged profiles; ignored by 'constant'. */
  rampUpSec?: number;
}

/** APM export target. Behaviour wired in Phase 3; the API key is never stored here (SecretStorage). */
export interface ApmConfig {
  provider: 'newrelic';
  region: 'US' | 'EU';
}

export interface SimFile {
  akrpType: 'sim';
  akrpVersion: 1;
  name: string;
  profile: SimProfile;
  flows: SimFlowEntry[];
  apm?: ApmConfig;
}

export function createEmptySimFile(name: string): SimFile {
  return {
    akrpType: 'sim',
    akrpVersion: 1,
    name,
    profile: { type: 'load', durationSec: 60, rampUpSec: 10 },
    flows: [],
  };
}

/** Per-scenario aggregate for one 1-second interval (live view). */
export interface SimScenarioTick {
  key: string;
  reqs: number;
  tps: number;
  p95: number;
  errorRate: number;
  vus: number;
}

export interface SimTick {
  tSec: number;
  scenarios: SimScenarioTick[];
}

export interface SimScenarioSummary {
  key: string;
  label: string;
  targetTps: number;
  achievedTps: number;
  totalReqs: number;
  errorRate: number;
  p50: number;
  p95: number;
  p99: number;
  checksPassed: number;
  checksTotal: number;
}

export interface ApmExportResult {
  provider: string;
  ok: boolean;
  message: string;
}

export interface SimSummary {
  durationSec: number;
  scenarios: SimScenarioSummary[];
  series: SimTick[];
  apmExport?: ApmExportResult;
}

export interface SimRunResult {
  ok: boolean;
  summary?: SimSummary;
  error?: string;
}

// --- Environment config file (.abenv) ---

export interface EnvSettings {
  timeoutMs?: number;
  followRedirects?: boolean;
}

export interface EnvConfigFile {
  akrpType: 'env_config';
  akrpVersion: 1;
  name: string;
  variables: KeyValueEntry[];
  settings: EnvSettings;
}

export function createEmptyEnvConfigFile(name: string): EnvConfigFile {
  return {
    akrpType: 'env_config',
    akrpVersion: 1,
    name,
    variables: [],
    settings: { timeoutMs: 30000, followRedirects: true },
  };
}

// --- HTTP send result ---

export interface SendResult {
  status: number;
  statusText: string;
  timeMs: number;
  headers: Record<string, string>;
  body: string;
  error?: string;
}

// --- Resolved request preview (variables substituted), shown in the Preview tab and Response > Request sub-tab ---

export interface ResolvedRequestPreview {
  method: HttpMethod;
  endpoint: string;
  path: string;
  url: string;
  headers: { name: string; value: string }[];
  query: { key: string; value: string }[];
  body: { mode: BodyMode; content: string };
  auth: { type: AuthType; summary: string };
}

export interface DiagnosticItem {
  scriptName: string;
  line: number;
  column: number;
  length: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface EnvVariable {
  name: string;
  value: string;
}

// --- Webview <-> extension host message protocol: request editor ---

export type RequestHostToWebviewMessage =
  | { type: 'init'; file: RequestFile; fileUri: string; activeEnvName: string | null; envVariableNames: string[]; envVariables: EnvVariable[] }
  | { type: 'documentChanged'; file: RequestFile }
  | { type: 'activeEnvironmentChanged'; activeEnvName: string | null; envVariableNames: string[]; envVariables: EnvVariable[] }
  | { type: 'responseResult'; result: SendResult; testRun: TestRunResult; request: ResolvedRequestPreview }
  | { type: 'sampleTestResult'; testRun: TestRunResult }
  | { type: 'previewResult'; preview: ResolvedRequestPreview }
  | { type: 'error'; message: string };

export type RequestWebviewToHostMessage =
  | { type: 'ready' }
  | { type: 'edit'; file: RequestFile }
  | { type: 'sendRequest' }
  | { type: 'cancelRequest' }
  | { type: 'runAgainstSample' }
  | { type: 'requestPreview' }
  | { type: 'diagnostics'; fileUri: string; diagnostics: DiagnosticItem[] };

// --- Webview <-> extension host message protocol: env config editor ---

export type EnvHostToWebviewMessage =
  | { type: 'init'; file: EnvConfigFile }
  | { type: 'documentChanged'; file: EnvConfigFile }
  | { type: 'error'; message: string };

export type EnvWebviewToHostMessage = { type: 'ready' } | { type: 'edit'; file: EnvConfigFile };

// --- Webview <-> extension host message protocol: flow editor ---

export type FlowHostToWebviewMessage =
  | { type: 'init'; file: FlowFile; fileUri: string; activeEnvName: string | null }
  | { type: 'documentChanged'; file: FlowFile }
  | { type: 'activeEnvironmentChanged'; activeEnvName: string | null }
  | { type: 'requestPicked'; stepId: string; requestPath: string }
  | { type: 'flowStarted' }
  | { type: 'flowStep'; result: FlowStepResult }
  | { type: 'flowDone'; result: FlowRunResult }
  | { type: 'historySaved'; path: string }
  | { type: 'error'; message: string };

export type FlowWebviewToHostMessage =
  | { type: 'ready' }
  | { type: 'edit'; file: FlowFile }
  | { type: 'runFlow' }
  | { type: 'stopFlow' }
  | { type: 'pickRequestForStep'; stepId: string }
  | { type: 'saveHistory'; history: FlowRunHistoryEntry[] };

// --- Webview <-> extension host message protocol: history viewer (read-only) ---

export type HistoryViewerHostToWebviewMessage =
  | { type: 'init'; file: HistoryFile }
  | { type: 'documentChanged'; file: HistoryFile }
  | { type: 'error'; message: string };

export type HistoryViewerWebviewToHostMessage = { type: 'ready' };

// --- Webview <-> extension host message protocol: sim editor ---

export interface SimScenarioMeta {
  key: string;
  label: string;
  targetTps: number;
}

export type SimHostToWebviewMessage =
  | { type: 'init'; file: SimFile; fileUri: string; activeEnvName: string | null; hasApmKey: boolean }
  | { type: 'documentChanged'; file: SimFile }
  | { type: 'activeEnvironmentChanged'; activeEnvName: string | null }
  | { type: 'apmKeyChanged'; hasApmKey: boolean }
  | { type: 'flowPicked'; entryId: string; flowPath: string }
  | { type: 'simStarted'; scenarios: SimScenarioMeta[] }
  | { type: 'simTick'; tick: SimTick }
  | { type: 'simDone'; result: SimRunResult }
  | { type: 'error'; message: string };

export type SimWebviewToHostMessage =
  | { type: 'ready' }
  | { type: 'edit'; file: SimFile }
  | { type: 'runSim' }
  | { type: 'stopSim' }
  | { type: 'pickFlowForEntry'; entryId: string }
  | { type: 'setApmKey' };
