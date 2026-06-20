import { AssertionResult, TestRunResult } from '../../model/types';

export function renderTestResults(container: HTMLElement, testRun: TestRunResult): void {
  container.innerHTML = '';
  container.className = 'akrp-test-results';

  renderBlock(container, 'Expect', testRun.expectResults);
  renderSchemaBlock(container, testRun.schemaValidation);
  renderScriptsBlock(container, testRun.scriptResults, testRun.consoleLogs, testRun.scriptError);
}

function renderBlock(container: HTMLElement, title: string, assertions: AssertionResult[]): void {
  if (assertions.length === 0) return;

  const block = document.createElement('div');
  block.className = 'akrp-result-block';

  const heading = document.createElement('div');
  heading.className = 'akrp-section-title';
  heading.textContent = `${title} (${assertions.filter((a) => a.pass).length}/${assertions.length} passed)`;
  block.appendChild(heading);

  for (const assertion of assertions) {
    block.appendChild(renderAssertionRow(assertion.pass, assertion.message ? `${assertion.description} — ${assertion.message}` : assertion.description));
  }

  container.appendChild(block);
}

function renderSchemaBlock(container: HTMLElement, schemaValidation: TestRunResult['schemaValidation']): void {
  if (!schemaValidation) return;

  const block = document.createElement('div');
  block.className = 'akrp-result-block';

  const heading = document.createElement('div');
  heading.className = 'akrp-section-title';
  heading.textContent = 'Schema (AJV)';
  block.appendChild(heading);

  if (schemaValidation.valid) {
    block.appendChild(renderAssertionRow(true, 'Response matches schema'));
  } else {
    for (const error of schemaValidation.errors) {
      block.appendChild(renderAssertionRow(false, error));
    }
  }

  container.appendChild(block);
}

function renderScriptsBlock(
  container: HTMLElement,
  scriptResults: AssertionResult[],
  consoleLogs: string[],
  scriptError: string | undefined
): void {
  if (scriptResults.length === 0 && consoleLogs.length === 0 && !scriptError) return;

  const block = document.createElement('div');
  block.className = 'akrp-result-block';

  const heading = document.createElement('div');
  heading.className = 'akrp-section-title';
  const passed = scriptResults.filter((a) => a.pass).length;
  heading.textContent = scriptResults.length > 0 ? `Scripts (${passed}/${scriptResults.length} passed)` : 'Scripts';
  block.appendChild(heading);

  if (scriptError) {
    block.appendChild(renderAssertionRow(false, `Script error: ${scriptError}`));
  }

  for (const assertion of scriptResults) {
    block.appendChild(renderAssertionRow(assertion.pass, assertion.message ? `${assertion.description} — ${assertion.message}` : assertion.description));
  }

  for (const log of consoleLogs) {
    const line = document.createElement('div');
    line.className = 'akrp-log-line';
    line.textContent = log;
    block.appendChild(line);
  }

  container.appendChild(block);
}

function renderAssertionRow(pass: boolean, text: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'akrp-assertion';
  const icon = document.createElement('span');
  icon.className = 'icon ' + (pass ? 'pass' : 'fail');
  icon.textContent = pass ? '✓' : '✗';
  const textEl = document.createElement('span');
  textEl.textContent = text;
  row.append(icon, textEl);
  return row;
}
