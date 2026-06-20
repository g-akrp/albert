import {
  AllureReportConfig,
  AuthConfig,
  BodyMode,
  DEFAULT_CONTENT_TYPE_BY_BODY_MODE,
  ExpectAssertion,
  FlowStep,
  KeyValueEntry,
  RequestBody,
  RequestDetails,
  SchemaValidationConfig,
  ValueFormat,
} from '../model/types';
import { resolveVariables } from '../variables/substitute';

export interface ResolvedFlowStep {
  step: FlowStep;
  request: RequestDetails;
  expectations: ExpectAssertion[];
  schemaValidation: SchemaValidationConfig;
  allureReportConfig?: AllureReportConfig;
}

interface ResolvedHttp {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

/**
 * Emits a self-contained k6 script that runs the given flow steps in order. Environment `{{vars}}`
 * are resolved host-side here; capture variables produced by earlier steps remain as `{{name}}`
 * placeholders and are substituted at runtime by the embedded `interp()` helper (k6 has no access to
 * the env_config). Each step logs a `__albert_step <json>` line that the runner parses for per-step detail.
 */
export function generateFlowScript(steps: ResolvedFlowStep[], variables: KeyValueEntry[]): string {
  return `${RUNTIME_PREAMBLE}

export const options = { vus: 1, iterations: 1 };

export default function () {
${generateStepsBody(steps, variables)}
}
`;
}

/** The k6 runruntime preamble (helpers), exported so the sim generator can prepend it once. */
export function flowRuntimePreamble(): string {
  return RUNTIME_PREAMBLE;
}

/** The body of an exec function: declares `vars` and runs each enabled step in order. Shared by the
 *  single-flow script and each per-flow scenario exec function in a sim. `emitSteps` is true for a
 *  single functional run (per-step detail) and false under load (would flood stdout). */
export function generateStepsBody(steps: ResolvedFlowStep[], variables: KeyValueEntry[], emitSteps = true): string {
  const enabled = steps.filter((s) => s.step.enabled);
  const stepBlocks = enabled.map((rs) => generateStepBlock(rs, variables, emitSteps)).join('\n');
  return `  const vars = {};
${stepBlocks}`;
}

function generateStepBlock(rs: ResolvedFlowStep, variables: KeyValueEntry[], emitSteps: boolean): string {
  const resolved = resolveStepForK6(rs.request, variables);
  const checks = rs.step.validate ? buildCheckSpecs(rs.expectations, rs.schemaValidation) : [];
  const captures = rs.step.captures ?? [];

  const emitBlock = emitSteps
    ? `
    const stepCaptures = {};
    if (res) {
      const __captures = ${JSON.stringify(captures)};
      for (const cap of __captures) {
        stepCaptures[cap.variable] = vars[cap.variable] !== undefined ? vars[cap.variable] : '';
      }
    }
    const resHeaders = {};
    if (res && res.headers) {
      for (const k in res.headers) {
        resHeaders[k] = res.headers[k];
      }
    }
    try {
      emitStep({
        stepId: ${JSON.stringify(rs.step.id)},
        name: ${JSON.stringify(rs.step.name)},
        method: ${JSON.stringify(resolved.method)},
        url: url,
        status: res ? res.status : 0,
        durationMs: res && res.timings ? res.timings.duration : 0,
        checks: checkResults,
        bodyPreview: res && res.body ? String(res.body).slice(0, 2000) : '',
        error: err || (res && res.error ? res.error : undefined),
        capturedValues: stepCaptures,
        allureReportConfig: ${JSON.stringify(rs.allureReportConfig || null)},
        requestHeaders: headers,
        requestBody: body !== null ? String(body) : '',
        responseHeaders: resHeaders,
      });
    } catch (e) {
      console.log('Failed to emit step results: ' + String(e));
    }
    `
    : '';

  return `  {
    const url = interp(${JSON.stringify(resolved.url)}, vars);
    const headers = interpObj(${JSON.stringify(resolved.headers)}, vars);
    const body = ${resolved.body === null ? 'null' : `interp(${JSON.stringify(resolved.body)}, vars)`};
    let res, err;
    try {
      res = http.request(${JSON.stringify(resolved.method)}, url, body, { headers });
    } catch (e) {
      err = String(e && e.message ? e.message : e);
    }
    const checkResults = [];
    if (res) {
      const __checks = ${JSON.stringify(checks)};
      for (const c of __checks) {
        const pass = evalCheck(res, c);
        checkResults.push({ description: c.description, pass });
      }
      if (__checks.length) {
        const checkMap = {};
        for (const cr of checkResults) checkMap[cr.description] = cr.pass;
        check(res, mapToFns(checkMap));
      }
      const __captures = ${JSON.stringify(captures)};
      for (const cap of __captures) {
        vars[cap.variable] = captureValue(res, cap);
      }
    }${emitBlock}
  }`;
}

interface CheckSpec {
  description: string;
  target: 'status' | 'header' | 'body' | 'schema';
  path?: string;
  operator?: string;
  expected?: string;
}

function buildCheckSpecs(expectations: ExpectAssertion[], schema: SchemaValidationConfig): CheckSpec[] {
  const specs: CheckSpec[] = expectations.map((a) => ({
    description: `${a.target}${a.path ? `[${a.path}]` : ''} ${a.operator} ${a.expected}`,
    target: a.target,
    path: a.path,
    operator: a.operator,
    expected: a.expected,
  }));
  // Schema validation in k6 is a v1 stub: confirm the body parses as JSON. Full AJV-in-k6 is a follow-up.
  if (schema.enabled && schema.schema.trim()) {
    specs.push({ description: 'response body is valid JSON (schema check)', target: 'schema' });
  }
  return specs;
}

// ---- host-side request resolution (env vars only; capture {{vars}} left for runtime interp) ----

function resolveStepForK6(request: RequestDetails, variables: KeyValueEntry[]): ResolvedHttp {
  const endpoint = resolveVariables(request.endpoint, variables).replace(/\/+$/, '');
  const rawPath = resolveVariables(request.path, variables);
  const path = rawPath ? (rawPath.startsWith('/') ? rawPath : `/${rawPath}`) : '';
  let url = endpoint + path;

  const queryParts: string[] = [];
  for (const q of request.query.filter((e) => e.enabled && e.key)) {
    const key = resolveVariables(q.key, variables);
    const value = coerceQueryValue(resolveVariables(q.value, variables), q.format);
    queryParts.push(`${encodeMaybe(key)}=${encodeMaybe(value)}`);
  }

  const headers: Record<string, string> = {};
  for (const h of request.headers.filter((e) => e.enabled && e.name)) {
    headers[resolveVariables(h.name, variables)] = resolveVariables(h.value, variables);
  }
  applyDefaultContentType(request.method, request.body.mode, headers);
  applyAuth(request.auth, variables, headers, queryParts);

  if (queryParts.length) url += (url.includes('?') ? '&' : '?') + queryParts.join('&');

  const body = request.method === 'GET' || request.method === 'HEAD' ? null : buildBody(request.body, variables);
  return { method: request.method, url, headers, body };
}

/** Don't percent-encode strings still holding a {{capture}} placeholder — interp() resolves them at runtime. */
function encodeMaybe(s: string): string {
  return s.includes('{{') ? s : encodeURIComponent(s);
}

function coerceQueryValue(value: string, format: ValueFormat): string {
  if (format === 'json') {
    try {
      return JSON.stringify(JSON.parse(value));
    } catch {
      return value;
    }
  }
  return value;
}

function applyDefaultContentType(method: string, mode: BodyMode, headers: Record<string, string>): void {
  if (method === 'GET' || method === 'HEAD') return;
  const defaultType = DEFAULT_CONTENT_TYPE_BY_BODY_MODE[mode];
  if (!defaultType) return;
  if (!Object.keys(headers).some((n) => n.toLowerCase() === 'content-type')) headers['Content-Type'] = defaultType;
}

function applyAuth(auth: AuthConfig, variables: KeyValueEntry[], headers: Record<string, string>, queryParts: string[]): void {
  switch (auth.type) {
    case 'basic': {
      if (!auth.basic) break;
      const u = resolveVariables(auth.basic.username, variables);
      const p = resolveVariables(auth.basic.password, variables);
      headers['Authorization'] = `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`;
      break;
    }
    case 'bearer': {
      if (!auth.bearer) break;
      headers['Authorization'] = `Bearer ${resolveVariables(auth.bearer.token, variables)}`;
      break;
    }
    case 'api-key': {
      if (!auth.apiKey) break;
      const key = resolveVariables(auth.apiKey.key, variables);
      const value = resolveVariables(auth.apiKey.value, variables);
      if (auth.apiKey.in === 'query') queryParts.push(`${encodeMaybe(key)}=${encodeMaybe(value)}`);
      else headers[key] = value;
      break;
    }
  }
}

function buildBody(body: RequestBody, variables: KeyValueEntry[]): string | null {
  switch (body.mode) {
    case 'json':
    case 'text':
      return resolveVariables(body.content, variables);
    case 'form-urlencoded': {
      const parts: string[] = [];
      for (const e of (body.formData ?? []).filter((x) => x.enabled && x.name)) {
        parts.push(`${encodeMaybe(resolveVariables(e.name, variables))}=${encodeMaybe(resolveVariables(e.value, variables))}`);
      }
      return parts.join('&');
    }
    default:
      return null;
  }
}

/** Runtime helpers embedded verbatim in the generated k6 script (executed by k6's goja, not Node). */
const RUNTIME_PREAMBLE = `import http from 'k6/http';
import { check } from 'k6';

function interp(str, vars) {
  if (str == null) return str;
  return String(str).replace(/\\{\\{\\s*([\\w.-]+)\\s*\\}\\}/g, function (m, name) {
    return Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : m;
  });
}

function interpObj(obj, vars) {
  const out = {};
  for (const k in obj) out[interp(k, vars)] = interp(obj[k], vars);
  return out;
}

function mapToFns(map) {
  const out = {};
  for (const k in map) out[k] = (function (v) { return function () { return v; }; })(map[k]);
  return out;
}

function headerVal(res, name) {
  if (!res || !res.headers) return undefined;
  const want = String(name).toLowerCase();
  for (const k in res.headers) if (k.toLowerCase() === want) return res.headers[k];
  return undefined;
}

function bodyJson(res) {
  try { return JSON.parse(res.body); } catch (e) { return undefined; }
}

function getByPath(obj, path) {
  if (!path) return obj;
  const tokens = String(path).replace(/\\[(\\d+)\\]/g, '.$1').split('.').filter(Boolean);
  let cur = obj;
  for (const t of tokens) { if (cur == null) return undefined; cur = cur[t]; }
  return cur;
}

function applyOp(op, actual, expected) {
  switch (op) {
    case 'exists': return actual !== undefined && actual !== null;
    case 'equals': return String(actual) === expected;
    case 'notEquals': return String(actual) !== expected;
    case 'contains':
      if (typeof actual === 'string') return actual.indexOf(expected) !== -1;
      if (Array.isArray(actual)) return actual.some(function (v) { return String(v) === expected; });
      return false;
    case 'matches': try { return new RegExp(expected).test(String(actual)); } catch (e) { return false; }
    case 'greaterThan': return Number(actual) > Number(expected);
    case 'lessThan': return Number(actual) < Number(expected);
    default: return false;
  }
}

function evalCheck(res, c) {
  if (c.target === 'schema') return bodyJson(res) !== undefined;
  let actual;
  if (c.target === 'status') actual = res.status;
  else if (c.target === 'header') actual = headerVal(res, c.path);
  else { const parsed = bodyJson(res); actual = c.path ? getByPath(parsed, c.path) : (parsed !== undefined ? parsed : res.body); }
  return applyOp(c.operator, actual, c.expected);
}

function captureValue(res, cap) {
  if (cap.source === 'status') return String(res.status);
  if (cap.source === 'header') { const v = headerVal(res, cap.path); return v == null ? '' : String(v); }
  const v = getByPath(bodyJson(res), cap.path);
  if (v == null) return '';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

function emitStep(obj) { console.log('__albert_step ' + JSON.stringify(obj)); }`;
