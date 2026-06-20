import { KeyValueEntry } from '../model/types';

const VARIABLE_PATTERN = /\{\{\s*([\w.-]+)\s*\}\}/g;

export function resolveVariables(input: string, variables: KeyValueEntry[]): string {
  if (!input) return input;
  const lookup = new Map(variables.filter((v) => v.enabled).map((v) => [v.name, v.value]));
  return input.replace(VARIABLE_PATTERN, (match, name) => {
    return lookup.has(name) ? (lookup.get(name) as string) : match;
  });
}
