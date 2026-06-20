import { AuthConfig, BodyMode, HttpMethod, KeyValueEntry, QueryEntry, RequestDetails } from './types';

/** Best-effort parse of a `curl ...` command (as copied from a browser, Postman, or a terminal)
 *  into the same RequestDetails shape used by .abrq files. Unrecognized flags are ignored rather
 *  than rejected, since real-world copy-as-curl output carries many flags we don't act on
 *  (--compressed, -k, -L, -s, ...). */
export function parseCurlCommand(input: string): RequestDetails {
  const tokens = tokenize(input.trim());
  if (tokens[0] && /^curl(\.exe)?$/i.test(tokens[0])) {
    tokens.shift();
  }

  let rawUrl = '';
  let method: HttpMethod | undefined;
  const headers: KeyValueEntry[] = [];
  const dataParts: string[] = [];
  let user: string | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '-X' || token === '--request') {
      method = normalizeMethod(tokens[++i]);
    } else if (token === '-H' || token === '--header') {
      const header = tokens[++i] ?? '';
      const sep = header.indexOf(':');
      if (sep !== -1) {
        headers.push({ name: header.slice(0, sep).trim(), value: header.slice(sep + 1).trim(), enabled: true });
      }
    } else if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary' || token === '--data-ascii') {
      dataParts.push(tokens[++i] ?? '');
    } else if (token === '--data-urlencode') {
      dataParts.push(tokens[++i] ?? '');
    } else if (token === '-u' || token === '--user') {
      user = tokens[++i];
    } else if (token === '-b' || token === '--cookie') {
      headers.push({ name: 'Cookie', value: tokens[++i] ?? '', enabled: true });
    } else if (token === '-A' || token === '--user-agent') {
      headers.push({ name: 'User-Agent', value: tokens[++i] ?? '', enabled: true });
    } else if (token === '-e' || token === '--referer') {
      headers.push({ name: 'Referer', value: tokens[++i] ?? '', enabled: true });
    } else if (token === '-G' || token === '--get') {
      method = 'GET';
    } else if (!token.startsWith('-') && !rawUrl) {
      rawUrl = token;
    }
  }

  const { endpoint, path, query } = splitUrl(rawUrl);
  const body = buildBody(dataParts, headers);

  if (!method) {
    method = dataParts.length > 0 ? 'POST' : 'GET';
  }

  const auth = buildAuth(user, headers);

  return { method, endpoint, path, headers, query, body, auth };
}

function normalizeMethod(value: string | undefined): HttpMethod {
  const upper = (value ?? 'GET').toUpperCase();
  const known: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  return (known as string[]).includes(upper) ? (upper as HttpMethod) : 'GET';
}

function splitUrl(rawUrl: string): { endpoint: string; path: string; query: QueryEntry[] } {
  if (!rawUrl) {
    return { endpoint: '', path: '', query: [] };
  }
  try {
    const url = new URL(rawUrl);
    const query: QueryEntry[] = Array.from(url.searchParams.entries()).map(([key, value]) => ({
      key,
      value,
      format: 'string',
      enabled: true,
    }));
    return { endpoint: url.origin, path: url.pathname + url.hash, query };
  } catch {
    // Not an absolute URL (e.g. uses a {{variable}} as the host) — split on the first '/' after
    // the scheme/host portion and parse the query string manually.
    const [withoutHash] = rawUrl.split('#');
    const [beforeQuery, queryString] = withoutHash.split('?');
    const schemeEnd = beforeQuery.indexOf('://');
    const searchFrom = schemeEnd === -1 ? 0 : schemeEnd + 3;
    const slashIndex = beforeQuery.indexOf('/', searchFrom);
    const endpoint = slashIndex === -1 ? beforeQuery : beforeQuery.slice(0, slashIndex);
    const path = slashIndex === -1 ? '' : beforeQuery.slice(slashIndex);
    const query: QueryEntry[] = queryString
      ? Array.from(new URLSearchParams(queryString).entries()).map(([key, value]) => ({
          key,
          value,
          format: 'string',
          enabled: true,
        }))
      : [];
    return { endpoint, path, query };
  }
}

function buildBody(dataParts: string[], headers: KeyValueEntry[]): { mode: BodyMode; content: string } {
  if (dataParts.length === 0) {
    return { mode: 'none', content: '' };
  }
  const content = dataParts.join('&');
  const contentType = headers.find((h) => h.name.toLowerCase() === 'content-type')?.value.toLowerCase() ?? '';

  let mode: BodyMode = 'text';
  if (contentType.includes('json')) {
    mode = 'json';
  } else if (contentType.includes('x-www-form-urlencoded')) {
    mode = 'form-urlencoded';
  } else if (!contentType && isLikelyJson(content)) {
    mode = 'json';
  }
  return { mode, content };
}

function isLikelyJson(content: string): boolean {
  const trimmed = content.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
}

function buildAuth(user: string | undefined, headers: KeyValueEntry[]): AuthConfig {
  if (user) {
    const sep = user.indexOf(':');
    const username = sep === -1 ? user : user.slice(0, sep);
    const password = sep === -1 ? '' : user.slice(sep + 1);
    return { type: 'basic', basic: { username, password } };
  }

  const authHeaderIndex = headers.findIndex((h) => h.name.toLowerCase() === 'authorization');
  if (authHeaderIndex !== -1) {
    const value = headers[authHeaderIndex].value;
    const match = /^Bearer\s+(.+)$/i.exec(value);
    if (match) {
      headers.splice(authHeaderIndex, 1);
      return { type: 'bearer', bearer: { token: match[1] } };
    }
  }

  return { type: 'none' };
}

/** Shell-style tokenizer: handles single/double quotes, backslash escapes, and the line
 *  continuations used by bash (`\` + newline) and Windows cmd (`^` + newline). */
function tokenize(input: string): string[] {
  const normalized = input.replace(/\\\r?\n/g, ' ').replace(/\^\r?\n/g, ' ');
  const tokens: string[] = [];
  const n = normalized.length;
  let i = 0;

  while (i < n) {
    while (i < n && /\s/.test(normalized[i])) i++;
    if (i >= n) break;

    let token = '';
    while (i < n && !/\s/.test(normalized[i])) {
      const c = normalized[i];
      if (c === "'") {
        const end = normalized.indexOf("'", i + 1);
        if (end === -1) {
          token += normalized.slice(i + 1);
          i = n;
        } else {
          token += normalized.slice(i + 1, end);
          i = end + 1;
        }
      } else if (c === '"') {
        let j = i + 1;
        while (j < n && normalized[j] !== '"') {
          if (normalized[j] === '\\' && j + 1 < n && '"\\$`'.includes(normalized[j + 1])) {
            token += normalized[j + 1];
            j += 2;
          } else {
            token += normalized[j];
            j++;
          }
        }
        i = j + 1;
      } else if (c === '\\' && i + 1 < n) {
        token += normalized[i + 1];
        i += 2;
      } else {
        token += c;
        i++;
      }
    }
    tokens.push(token);
  }

  return tokens;
}
