/** Walks a parsed sample-response JSON value and returns dot/bracket paths to every field, for autocomplete. */
export function extractSampleKeyPaths(sampleText: string): string[] {
  if (!sampleText || !sampleText.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(sampleText);
  } catch {
    return [];
  }
  const paths: string[] = [];
  walk(parsed, '', paths);
  return paths;
}

function walk(value: unknown, prefix: string, out: string[]): void {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      out.push(path);
      walk((value as Record<string, unknown>)[key], path, out);
    }
  } else if (Array.isArray(value) && value.length > 0) {
    walk(value[0], `${prefix}[0]`, out);
  }
}
