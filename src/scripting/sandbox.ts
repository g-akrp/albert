import * as vm from 'vm';
import { expect as jestExpect } from 'expect';
import { AssertionResult, KeyValueEntry } from '../model/types';

export interface SandboxResult {
  logs: string[];
  assertions: AssertionResult[];
  error?: string;
  environmentChanges: Map<string, string>;
}

export interface PmRequestContext {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface PmResponseContext {
  code: number;
  status: string;
  headers: Record<string, string>;
  bodyText: string;
}

export function runPreRequestScript(
  code: string,
  variables: KeyValueEntry[],
  request: PmRequestContext
): SandboxResult {
  return runScript(code, variables, request, undefined);
}

export function runPostResponseScript(
  code: string,
  variables: KeyValueEntry[],
  response: PmResponseContext
): SandboxResult {
  return runScript(code, variables, undefined, response);
}

function runScript(
  code: string,
  variables: KeyValueEntry[],
  request: PmRequestContext | undefined,
  response: PmResponseContext | undefined
): SandboxResult {
  const logs: string[] = [];
  const assertions: AssertionResult[] = [];
  const environmentChanges = new Map<string, string>();

  if (!code || !code.trim()) {
    return { logs, assertions, environmentChanges };
  }

  const varMap = new Map(variables.map((v) => [v.name, v.value]));

  const sandbox: Record<string, unknown> = {
    request: request ? { ...request } : undefined,
    response: response
      ? {
          body: response.bodyText,
          status: response.code,
          statusText: response.status,
          headers: response.headers,
          json: () => JSON.parse(response.bodyText),
        }
      : undefined,
    environment: {
      get: (name: string) => varMap.get(name),
      set: (name: string, value: string) => {
        varMap.set(name, value);
        environmentChanges.set(name, value);
      },
    },
    console: { log: (...args: unknown[]) => logs.push(args.map(stringifyArg).join(' ')) },
    expect: makeExpect(assertions),
  };

  let error: string | undefined;
  try {
    const context = vm.createContext(sandbox);
    vm.runInContext(code, context, { timeout: 5000 });
  } catch (err: any) {
    error = err?.message ?? String(err);
  }

  return { logs, assertions, error, environmentChanges };
}

function stringifyArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function makeExpect(assertions: AssertionResult[]) {
  return (actual: unknown) => {
    const matchers = jestExpect(actual);

    function proxyMatchers(obj: object, path: string[]): any {
      return new Proxy(obj, {
        get(target, prop, receiver) {
          if (typeof prop === 'symbol') return Reflect.get(target, prop, receiver);

          // Only `.not` is supported (and typed in SCRIPT_AMBIENT_TYPES) — scripts run synchronously
          // via vm.runInContext, so `.resolves`/`.rejects` would record pass/fail before any wrapped
          // promise actually settled, silently producing wrong results. Not worth exposing.
          if (prop === 'not') {
            const modifier = Reflect.get(target, prop, receiver);
            return modifier && typeof modifier === 'object'
              ? proxyMatchers(modifier, [...path, String(prop)])
              : modifier;
          }

          const fn = Reflect.get(target, prop, receiver);
          if (typeof fn === 'function') {
            const desc = `${path.join('.')}.${String(prop)}`;
            return (...args: unknown[]) => {
              try {
                fn(...args);
                assertions.push({ description: desc, pass: true });
              } catch (e: any) {
                assertions.push({ description: desc, pass: false, message: e.message });
              }
            };
          }
          return fn;
        },
      });
    }

    return proxyMatchers(matchers, [`expect(${stringifyArg(actual)})`]);
  };
}
