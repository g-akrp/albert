import { AssertionResult, ExpectAssertion, KeyValueEntry, SchemaValidationConfig, TestRunResult } from '../model/types';
import { evaluateExpectations, EvaluatableResponse } from './expectations';
import { validateAgainstSchema } from './schemaValidator';
import { PmResponseContext, runPostResponseScript } from '../scripting/sandbox';

export function runResponseTests(
  expectations: ExpectAssertion[],
  schemaValidation: SchemaValidationConfig,
  postResponseScript: string,
  variables: KeyValueEntry[],
  response: EvaluatableResponse
): { testRun: TestRunResult; environmentChanges: Map<string, string> } {
  const expectResults: AssertionResult[] = evaluateExpectations(expectations, response);

  let schemaResult: { valid: boolean; errors: string[] } | undefined;
  if (schemaValidation.enabled && schemaValidation.schema.trim()) {
    schemaResult = validateAgainstSchema(schemaValidation.schema, response.bodyText);
  }

  const pmResponse: PmResponseContext = {
    code: response.status,
    status: String(response.status),
    headers: response.headers,
    bodyText: response.bodyText,
  };
  const scriptResult = runPostResponseScript(postResponseScript, variables, pmResponse);

  const testRun: TestRunResult = {
    expectResults,
    schemaValidation: schemaResult,
    scriptResults: scriptResult.assertions,
    consoleLogs: scriptResult.logs,
    scriptError: scriptResult.error,
  };

  return { testRun, environmentChanges: scriptResult.environmentChanges };
}
