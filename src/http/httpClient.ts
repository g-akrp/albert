import {
  AuthConfig,
  BodyMode,
  DEFAULT_CONTENT_TYPE_BY_BODY_MODE,
  EnvSettings,
  KeyValueEntry,
  QueryEntry,
  RequestBody,
  RequestDetails,
  ResolvedRequestPreview,
  SendResult,
  ValueFormat,
} from '../model/types';
import { resolveVariables } from '../variables/substitute';

export async function sendRequest(
  request: RequestDetails,
  variables: KeyValueEntry[],
  settings: EnvSettings = {},
  externalSignal?: AbortSignal
): Promise<SendResult> {
  const start = Date.now();
  const controller = new AbortController();
  let timedOut = false;
  const timeoutHandle = settings.timeoutMs
    ? setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, settings.timeoutMs)
    : undefined;

  // Let an external signal (a user "Cancel") abort the in-flight fetch too.
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const { url, headers } = buildUrlAndHeaders(request, variables);
    const body = buildBody(request.body, variables);

    const res = await fetch(url, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : body,
      redirect: settings.followRedirects === false ? 'manual' : 'follow',
      signal: controller.signal,
    });

    const text = await res.text();
    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      status: res.status,
      statusText: res.statusText,
      timeMs: Date.now() - start,
      headers: responseHeaders,
      body: text,
    };
  } catch (err: any) {
    const aborted = err?.name === 'AbortError';
    const cancelled = aborted && !timedOut;
    return {
      status: 0,
      statusText: '',
      timeMs: Date.now() - start,
      headers: {},
      body: '',
      error: cancelled
        ? 'Request cancelled'
        : aborted
          ? `Request timed out after ${settings.timeoutMs}ms`
          : err?.message ?? String(err),
    };
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
  }
}

export function buildUrlAndHeaders(
  request: RequestDetails,
  variables: KeyValueEntry[]
): { url: string; headers: Record<string, string> } {
  const endpoint = resolveVariables(request.endpoint, variables).replace(/\/+$/, '');
  const rawPath = resolveVariables(request.path, variables);
  const path = rawPath ? (rawPath.startsWith('/') ? rawPath : `/${rawPath}`) : '';
  const urlObj = new URL(endpoint + path);

  for (const entry of enabledQueryEntries(request.query)) {
    const value = coerceQueryValue(resolveVariables(entry.value, variables), entry.format);
    urlObj.searchParams.set(resolveVariables(entry.key, variables), value);
  }

  const headers: Record<string, string> = {};
  for (const header of enabledEntries(request.headers)) {
    headers[resolveVariables(header.name, variables)] = resolveVariables(header.value, variables);
  }

  applyDefaultContentType(request.method, request.body.mode, headers);
  applyAuth(request.auth, variables, headers, urlObj);

  return { url: urlObj.toString(), headers };
}

/** `buildBody()` always hands fetch() a plain string, even for JSON/form-urlencoded bodies — that
 *  defeats fetch's own spec-mandated Content-Type inference (which only kicks in for body values
 *  it recognizes as JSON/URLSearchParams, not opaque strings). Fill in the same default fetch would
 *  have picked, but only if the user hasn't already set Content-Type explicitly via the Headers tab.
 *  Skipped for GET/HEAD, matching sendRequest()'s own rule of stripping the body for those methods —
 *  no point advertising a body Content-Type when no body is ever sent. */
function applyDefaultContentType(method: string, mode: BodyMode, headers: Record<string, string>): void {
  if (method === 'GET' || method === 'HEAD') return;
  const defaultType = DEFAULT_CONTENT_TYPE_BY_BODY_MODE[mode];
  if (!defaultType) return;
  const hasContentType = Object.keys(headers).some((name) => name.toLowerCase() === 'content-type');
  if (!hasContentType) headers['Content-Type'] = defaultType;
}

function coerceQueryValue(value: string, format: ValueFormat): string {
  switch (format) {
    case 'json':
      try {
        return JSON.stringify(JSON.parse(value));
      } catch {
        return value;
      }
    case 'number':
    case 'boolean':
    case 'string':
    default:
      return value;
  }
}

function applyAuth(
  auth: AuthConfig,
  variables: KeyValueEntry[],
  headers: Record<string, string>,
  urlObj: URL
): void {
  switch (auth.type) {
    case 'basic': {
      if (!auth.basic) break;
      const username = resolveVariables(auth.basic.username, variables);
      const password = resolveVariables(auth.basic.password, variables);
      headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
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
      if (auth.apiKey.in === 'query') {
        urlObj.searchParams.set(key, value);
      } else {
        headers[key] = value;
      }
      break;
    }
    case 'none':
    default:
      break;
  }
}

export function resolveRequestPreview(
  request: RequestDetails,
  variables: KeyValueEntry[]
): { method: string; url: string; headers: Record<string, string>; body?: string } {
  const body = buildBody(request.body, variables);
  // A new/empty or malformed endpoint makes `new URL(...)` throw; degrade to a best-effort preview
  // instead of crashing (this runs in webview message handlers, where a throw is an unhandled rejection).
  try {
    const { url, headers } = buildUrlAndHeaders(request, variables);
    return { method: request.method, url, headers, body };
  } catch {
    return { method: request.method, url: rawUrlString(request, variables), headers: headersOnly(request, variables), body };
  }
}

/** Full block-style breakdown of a request with variables resolved — used for the Preview tab and
 *  the Response > Request sub-tab, where headers/query/body/auth are shown as separate sections. */
export function resolveRequestForDisplay(
  request: RequestDetails,
  variables: KeyValueEntry[]
): ResolvedRequestPreview {
  const endpoint = resolveVariables(request.endpoint, variables).replace(/\/+$/, '');
  const rawPath = resolveVariables(request.path, variables);
  const path = rawPath ? (rawPath.startsWith('/') ? rawPath : `/${rawPath}`) : '';

  let url: string;
  let headers: Record<string, string>;
  let query: { key: string; value: string }[];
  try {
    ({ url, headers } = buildUrlAndHeaders(request, variables));
    // Read the query block back off the final URL rather than re-deriving it from request.query —
    // that list misses params already present in the endpoint's own query string, and (more
    // importantly) an api-key auth configured to land "in: query" is added straight onto the URL
    // by applyAuth() inside buildUrlAndHeaders(), never into request.query. Recomputing from
    // request.query alone showed a URL with the key in it but a Query section without it.
    query = Array.from(new URL(url).searchParams.entries()).map(([key, value]) => ({ key, value }));
  } catch {
    // Empty/malformed endpoint (e.g. a brand-new request): degrade gracefully instead of throwing.
    url = endpoint + path;
    headers = headersOnly(request, variables);
    query = enabledQueryEntries(request.query).map((q) => ({
      key: resolveVariables(q.key, variables),
      value: resolveVariables(q.value, variables),
    }));
  }

  return {
    method: request.method,
    endpoint,
    path,
    url,
    headers: Object.entries(headers).map(([name, value]) => ({ name, value })),
    query,
    body: { mode: request.body.mode, content: buildBody(request.body, variables) ?? '' },
    auth: { type: request.auth.type, summary: summarizeAuth(request.auth, variables) },
  };
}

/** Best-effort headers (no URL needed) for degraded previews of requests with an invalid endpoint. */
function headersOnly(request: RequestDetails, variables: KeyValueEntry[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const header of enabledEntries(request.headers)) {
    headers[resolveVariables(header.name, variables)] = resolveVariables(header.value, variables);
  }
  applyDefaultContentType(request.method, request.body.mode, headers);
  // A throwaway valid URL lets applyAuth() set Authorization (or an api-key-in-query, harmlessly discarded).
  try {
    applyAuth(request.auth, variables, headers, new URL('http://localhost'));
  } catch {
    // ignore — auth is cosmetic in the degraded preview
  }
  return headers;
}

/** The raw endpoint+path string for a degraded preview, without URL normalization. */
function rawUrlString(request: RequestDetails, variables: KeyValueEntry[]): string {
  const endpoint = resolveVariables(request.endpoint, variables).replace(/\/+$/, '');
  const rawPath = resolveVariables(request.path, variables);
  const path = rawPath ? (rawPath.startsWith('/') ? rawPath : `/${rawPath}`) : '';
  return endpoint + path;
}

function summarizeAuth(auth: AuthConfig, variables: KeyValueEntry[]): string {
  switch (auth.type) {
    case 'basic':
      return `Basic — username: ${resolveVariables(auth.basic?.username ?? '', variables)}`;
    case 'bearer':
      return `Bearer — token: ${resolveVariables(auth.bearer?.token ?? '', variables)}`;
    case 'api-key':
      return `API Key — ${resolveVariables(auth.apiKey?.key ?? '', variables)} (added to ${auth.apiKey?.in ?? 'header'})`;
    case 'none':
    default:
      return 'No auth';
  }
}

function buildBody(body: RequestBody, variables: KeyValueEntry[]): string | undefined {
  switch (body.mode) {
    case 'none':
      return undefined;
    case 'json':
    case 'text':
      return resolveVariables(body.content, variables);
    case 'form-urlencoded': {
      const params = new URLSearchParams();
      for (const entry of enabledEntries(body.formData ?? [])) {
        params.set(resolveVariables(entry.name, variables), resolveVariables(entry.value, variables));
      }
      return params.toString();
    }
    default:
      return undefined;
  }
}

function enabledEntries(entries: KeyValueEntry[]): KeyValueEntry[] {
  return entries.filter((e) => e.enabled && e.name);
}

function enabledQueryEntries(entries: QueryEntry[]): QueryEntry[] {
  return entries.filter((e) => e.enabled && e.key);
}
