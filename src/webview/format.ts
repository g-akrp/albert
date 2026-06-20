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
