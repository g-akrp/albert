import { EnvVariable } from '../../model/types';

const VAR_PATTERN = /\{\{\s*([\w.-]+)\s*\}\}/g;

export function findUnknownVariables(text: string, knownNames: string[]): string[] {
  if (!text) return [];
  const known = new Set(knownNames);
  const found = new Set<string>();
  const re = new RegExp(VAR_PATTERN);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (!known.has(match[1])) found.add(match[1]);
  }
  return [...found];
}

/** Builds a `name = value` tooltip listing every distinct known `{{var}}` referenced in text. */
function buildResolvedValueTooltip(text: string, envVariables: EnvVariable[]): string {
  if (!text) return '';
  const seen = new Set<string>();
  const lines: string[] = [];
  const re = new RegExp(VAR_PATTERN);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);
    const variable = envVariables.find((v) => v.name === name);
    if (variable) lines.push(`${name} = ${variable.value}`);
  }
  return lines.join('\n');
}

/**
 * Applies a warning border + tooltip to a plain input/textarea when it references an unknown
 * {{variable}}. When `envVariables` is provided and every referenced variable is known, the
 * tooltip instead shows each variable's resolved value (hover info, mirroring Monaco's hover provider).
 */
export function applyVariableLint(
  input: HTMLInputElement | HTMLTextAreaElement,
  knownNames: string[],
  envVariables?: EnvVariable[]
): void {
  const unknown = findUnknownVariables(input.value, knownNames);
  if (unknown.length > 0) {
    input.style.borderColor = 'var(--vscode-inputValidation-warningBorder, #cca700)';
    input.title = `Unknown variable(s): ${unknown.join(', ')}`;
    return;
  }
  input.style.borderColor = '';
  input.title = envVariables ? buildResolvedValueTooltip(input.value, envVariables) : '';
}
