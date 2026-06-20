import { ResolvedRequestPreview, SendResult, TestRunResult } from '../../model/types';

/**
 * Renders a request run as a Markdown report. Order: Status → Tests (emoji bullet lists) → Request →
 * Response (endpoint / headers / body, body in a json code block) → Test script (the post-response
 * script, for reference) → AJV (verdict + the schema json, for reference).
 */
export function buildResultMarkdown(
  name: string,
  request: ResolvedRequestPreview | null,
  result: SendResult | null,
  testRun: TestRunResult | null,
  postResponseScript: string,
  schemaJson: string
): string {
  const expectResults = testRun?.expectResults ?? [];
  const scriptResults = testRun?.scriptResults ?? [];
  const schema = testRun?.schemaValidation;
  const allChecks = [...expectResults, ...scriptResults];
  const failed = allChecks.filter((c) => !c.pass).length;
  const httpOk = !!result && !result.error && result.status >= 200 && result.status < 400;
  const pass = !result?.error && failed === 0 && !(schema && !schema.valid) && !testRun?.scriptError;

  const out: string[] = [];
  out.push(`# ${name || 'Request'} — result`);
  out.push('');
  out.push(`**${mark(pass)} ${pass ? 'PASS' : 'FAIL'}**`);
  out.push('');
  out.push(`_Tested: ${utcStamp()}_`);
  out.push('');

  // 1. Status — emoji bullets
  out.push('## Status');
  out.push(`- ${mark(pass)} **${pass ? 'PASS' : 'FAIL'}**`);
  if (result) {
    out.push(`- ${mark(httpOk)} ${result.error ? `HTTP error: ${result.error}` : `HTTP ${result.status} ${result.statusText} (${result.timeMs} ms)`}`);
  }
  out.push(`- ${mark(failed === 0)} Checks: ${allChecks.length - failed}/${allChecks.length} passed`);
  if (schema) out.push(`- ${mark(schema.valid)} Schema: ${schema.valid ? 'valid' : 'invalid'}`);
  out.push('');

  // 2. Tests — emoji bullets
  out.push('## Tests');
  if (expectResults.length === 0) out.push('- _(no assertions)_');
  else for (const r of expectResults) out.push(`- ${mark(r.pass)} ${r.description}${r.message ? ` — ${r.message}` : ''}`);
  out.push('');

  // 3. Request
  out.push('## Request');
  if (request) {
    out.push('**Endpoint**');
    out.push('');
    out.push('`' + `${request.method} ${request.url}` + '`');
    out.push('');
    out.push('**Headers**');
    out.push(fence(headerLines(request.headers)));
    if (request.body.mode !== 'none' && request.body.content) {
      out.push('');
      out.push(`**Body** (${request.body.mode})`);
      out.push(codeBlock(request.body.content, request.body.mode === 'json'));
    }
  } else {
    out.push('_(no request)_');
  }
  out.push('');

  // 4. Response
  out.push('## Response');
  if (!result) {
    out.push('_(no response)_');
  } else if (result.error) {
    out.push('**Endpoint**');
    out.push('');
    out.push('`' + `${request?.method ?? ''} ${request?.url ?? ''}`.trim() + '`');
    out.push('');
    out.push(`**Error:** ${result.error}`);
  } else {
    out.push(`**Status:** ${result.status} ${result.statusText} — ${result.timeMs} ms`);
    out.push('');
    out.push('**Headers**');
    out.push(fence(Object.entries(result.headers).map(([k, v]) => `${k}: ${v}`).join('\n')));
    out.push('');
    out.push('**Body**');
    out.push(codeBlock(result.body, looksJson(result)));
  }
  out.push('');

  // 5. Test script — the post-response script, for reference (+ its assertions / console)
  out.push('## Test script');
  for (const r of scriptResults) out.push(`- ${mark(r.pass)} ${r.description}${r.message ? ` — ${r.message}` : ''}`);
  if (testRun?.consoleLogs?.length) {
    out.push('');
    out.push('**console**');
    out.push(fence(testRun.consoleLogs.join('\n')));
  }
  if (testRun?.scriptError) {
    out.push('');
    out.push(`**error:** ${testRun.scriptError}`);
  }
  out.push('');
  out.push('**Post-response script** (reference)');
  out.push(codeBlock(postResponseScript.trim() || '// (no post-response script)', false, 'js'));
  out.push('');

  // 6. AJV — verdict + the schema json, for reference
  out.push('## AJV (schema validation)');
  if (!schema) {
    out.push('- _(schema validation disabled)_');
  } else if (schema.valid) {
    out.push(`- ${mark(true)} valid`);
  } else {
    out.push(`- ${mark(false)} invalid`);
    for (const e of schema.errors) out.push(`  - ${e}`);
  }
  out.push('');
  out.push('**Schema** (reference)');
  out.push(codeBlock(schemaJson.trim() || '{}', true));
  out.push('');

  return out.join('\n');
}

function mark(ok: boolean): string {
  return ok ? '✅' : '❌';
}

function utcStamp(): string {
  // "2026-06-20T01:44:24.149Z" -> "2026-06-20 01:44:24 UTC"
  return new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

function headerLines(headers: { name: string; value: string }[]): string {
  return headers.length ? headers.map((h) => `${h.name}: ${h.value}`).join('\n') : '(none)';
}

function looksJson(result: SendResult): boolean {
  const ct = Object.entries(result.headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? '';
  if (ct.includes('json')) return true;
  try {
    JSON.parse(result.body);
    return true;
  } catch {
    return false;
  }
}

/** A code block; when `json` is true and the content parses, it's pretty-printed and json-fenced. */
function codeBlock(content: string, json: boolean, lang = ''): string {
  let text = (content ?? '').replace(/\r/g, '');
  let language = lang;
  if (json) {
    try {
      text = JSON.stringify(JSON.parse(text), null, 2);
      language = 'json';
    } catch {
      // not valid JSON — fall back to a plain block
    }
  }
  return fence(text || '(empty)', language);
}

/** Fenced code block whose fence is always longer than any backtick run inside the content. */
function fence(body: string, lang = ''): string {
  const text = (body ?? '').replace(/\r/g, '') || '(none)';
  let ticks = '```';
  while (text.includes(ticks)) ticks += '`';
  return `${ticks}${lang}\n${text}\n${ticks}`;
}
