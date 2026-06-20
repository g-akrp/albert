import Ajv from 'ajv';

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateAgainstSchema(schemaText: string, bodyText: string): SchemaValidationResult {
  let schema: unknown;
  try {
    schema = JSON.parse(schemaText);
  } catch (err: any) {
    return { valid: false, errors: [`Invalid JSON Schema: ${err?.message ?? err}`] };
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch (err: any) {
    return { valid: false, errors: [`Response body is not valid JSON: ${err?.message ?? err}`] };
  }

  const ajv = new Ajv({ allErrors: true, strict: false });
  let validateFn;
  try {
    validateFn = ajv.compile(schema as any);
  } catch (err: any) {
    return { valid: false, errors: [`Schema compile error: ${err?.message ?? err}`] };
  }

  const valid = validateFn(body);
  if (valid) return { valid: true, errors: [] };

  const errors = (validateFn.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`);
  return { valid: false, errors };
}
