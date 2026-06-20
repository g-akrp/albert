import { AssertionResult, ExpectAssertion, ExpectOperator } from '../model/types';

export interface EvaluatableResponse {
  status: number;
  headers: Record<string, string>;
  bodyText: string;
}

export function evaluateExpectations(
  assertions: ExpectAssertion[],
  response: EvaluatableResponse
): AssertionResult[] {
  return assertions.map((assertion) => evaluateOne(assertion, response));
}

function evaluateOne(assertion: ExpectAssertion, response: EvaluatableResponse): AssertionResult {
  const actual = resolveActual(assertion, response);
  const description = `${assertion.target}${assertion.path ? `[${assertion.path}]` : ''} ${assertion.operator} ${assertion.expected}`;

  if (assertion.operator === 'matches') {
    // applyOperator() swallows an invalid regex as a plain fail — without this check the user just
    // sees "actual: ..." and has no way to tell a broken pattern apart from a genuine mismatch.
    try {
      new RegExp(assertion.expected);
    } catch (err: any) {
      return { description, pass: false, message: `invalid regex "${assertion.expected}": ${err?.message ?? err}` };
    }
  }

  const pass = applyOperator(assertion.operator, actual, assertion.expected);
  return { description, pass, message: pass ? undefined : `actual: ${safeStringify(actual)}` };
}

function resolveActual(assertion: ExpectAssertion, response: EvaluatableResponse): unknown {
  if (assertion.target === 'status') return response.status;
  if (assertion.target === 'header') {
    if (!assertion.path) return undefined;
    const lower = assertion.path.toLowerCase();
    return response.headers[lower] ?? response.headers[assertion.path];
  }
  const parsed = tryParseJson(response.bodyText);
  if (!assertion.path) return parsed ?? response.bodyText;
  return getByPath(parsed ?? response.bodyText, assertion.path);
}

function applyOperator(operator: ExpectOperator, actual: unknown, expected: string): boolean {
  switch (operator) {
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'equals':
      return String(actual) === expected;
    case 'notEquals':
      return String(actual) !== expected;
    case 'contains':
      if (typeof actual === 'string') return actual.includes(expected);
      if (Array.isArray(actual)) return actual.some((v) => String(v) === expected);
      return false;
    case 'matches':
      try {
        return new RegExp(expected).test(String(actual));
      } catch {
        return false;
      }
    case 'greaterThan':
      return Number(actual) > Number(expected);
    case 'lessThan':
      return Number(actual) < Number(expected);
    default:
      return false;
  }
}

function getByPath(obj: unknown, path: string): unknown {
  const tokens = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let current: any = obj;
  for (const token of tokens) {
    if (current == null) return undefined;
    current = current[token];
  }
  return current;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
