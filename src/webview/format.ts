export function formatResponseBody(body: string, headers: Record<string, string>): string {
  const contentType = headers['content-type'] ?? '';
  if (contentType.includes('application/json')) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  return body;
}

/** Pretty-prints `body` as JSON when it parses, otherwise returns it unchanged. */
export function prettyJson(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

/** Whether a response body should default to JSON formatting (by content-type, then by parse). */
export function responseLooksJson(body: string, headers: Record<string, string>): boolean {
  const contentType = headers['content-type'] ?? '';
  if (contentType.includes('json')) return true;
  try {
    JSON.parse(body);
    return true;
  } catch {
    return false;
  }
}
