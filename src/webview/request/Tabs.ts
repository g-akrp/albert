import {
  AuthType,
  BodyMode,
  DEFAULT_CONTENT_TYPE_BY_BODY_MODE,
  ExpectAssertion,
  ExpectOperator,
  ExpectTarget,
} from '../../model/types';
import { renderKeyValueTable } from '../components/KeyValueTable';
import { renderQueryTable } from '../components/QueryTable';
import { renderTestResults } from '../components/TestResults';
import { renderResolvedRequestBlocks } from '../components/ResolvedRequestBlocks';
import { applyVariableLint } from '../lint/variableLint';
import { attachVariableSuggestions } from '../lint/varSuggest';
import { CodeEditorHandle, createCodeEditor } from '../components/codeEditor';
import { completionContext } from '../components/monacoSetup';
import { lintScript, lintScriptVariables } from '../lint/scriptLint';
import { lintSchema } from '../lint/schemaLint';
import { extractSampleKeyPaths } from '../lint/sampleKeys';
import { renderResponseTab } from './ResponseTab';
import { renderHistoryTab } from './HistoryTab';
import { genId, store } from './state';

type TabId = 'headers' | 'query' | 'body' | 'auth' | 'preview' | 'expect' | 'schema' | 'scripts' | 'sample' | 'response' | 'history';

let activeTab: TabId = 'headers';

/** Switch to the Response tab (e.g. when the user clicks Send). The caller re-renders. */
export function showResponseTab(): void {
  activeTab = 'response';
}

function isInvalidJson(text: string): boolean {
  if (!text.trim()) return false;
  try {
    JSON.parse(text);
    return false;
  } catch {
    return true;
  }
}

function hasJsSyntaxError(text: string): boolean {
  if (!text.trim()) return false;
  try {
    // Compiles only — does not execute the script body.
    new Function(text);
    return false;
  } catch {
    return true;
  }
}

/** Whether a tab's editor currently holds a validation error, used to flag the tab. */
function tabHasError(id: TabId): boolean {
  const file = store.file;
  switch (id) {
    case 'body':
      return file.request.body.mode === 'json' && isInvalidJson(file.request.body.content);
    case 'schema':
      return isInvalidJson(file.schemaValidation.schema);
    case 'sample':
      return isInvalidJson(file.sampleResponse);
    case 'scripts':
      return hasJsSyntaxError(file.scripts.preRequest) || hasJsSyntaxError(file.scripts.postResponse);
    default:
      return false;
  }
}

// Monaco editor instances mounted by the currently rendered tab — disposed before every re-render
// since renderTabs() rebuilds the DOM subtree from scratch and would otherwise orphan them.
let mountedEditors: CodeEditorHandle[] = [];

interface TabEntry {
  id: TabId;
  label: string;
}

export function renderTabs(container: HTMLElement): void {
  for (const editor of mountedEditors) editor.dispose();
  mountedEditors = [];

  completionContext.envVariableNames = store.activeEnvVariableNames;
  completionContext.sampleKeyPaths = extractSampleKeyPaths(store.file.sampleResponse);
  completionContext.envVariables = store.activeEnvVariables;

  container.innerHTML = '';

  const tabBar = document.createElement('div');
  tabBar.className = 'akrp-tabs';

  const sections: { label: string; tabs: TabEntry[] }[] = [
    {
      label: 'Compose Request',
      tabs: [
        { id: 'headers', label: 'Headers' },
        { id: 'query', label: 'Query' },
        { id: 'body', label: 'Body' },
        { id: 'auth', label: 'Auth' },
        { id: 'preview', label: 'Preview' },
      ],
    },
    {
      label: 'Validate Response',
      tabs: [
        { id: 'expect', label: 'Expect' },
        { id: 'schema', label: 'Schema' },
        { id: 'scripts', label: 'Scripts' },
        { id: 'sample', label: 'Sample' },
        { id: 'response', label: 'Response' },
      ],
    },
    {
      label: 'History',
      tabs: [
        { id: 'history', label: `History (${store.history.length})` },
      ],
    },
  ];

  for (const section of sections) {
    const sectionLabel = document.createElement('div');
    sectionLabel.className = 'akrp-tab-section';
    sectionLabel.textContent = section.label;
    tabBar.appendChild(sectionLabel);

    for (const tab of section.tabs) {
      const el = document.createElement('div');
      el.className = 'akrp-tab' + (tab.id === activeTab ? ' active' : '');
      el.textContent = tab.label;
      if (tabHasError(tab.id)) {
        const warn = document.createElement('span');
        warn.className = 'akrp-tab-warning';
        warn.textContent = '⚠';
        warn.title = 'This tab has a validation error';
        el.appendChild(warn);
      }
      el.onclick = () => {
        activeTab = tab.id;
        renderTabs(container);
      };
      tabBar.appendChild(el);
    }
  }

  container.appendChild(tabBar);

  const content = document.createElement('div');
  switch (activeTab) {
    case 'headers':
      renderKeyValueTable(
        content,
        () => store.file.request.headers,
        () => store.mutateQuiet(() => {}),
        () => store.mutate(() => {}),
        store.activeEnvVariableNames,
        store.activeEnvVariables
      );
      break;
    case 'query':
      renderQueryTable(
        content,
        () => store.file.request.query,
        () => store.mutateQuiet(() => {}),
        () => store.mutate(() => {}),
        store.activeEnvVariableNames,
        store.activeEnvVariables
      );
      break;
    case 'body':
      renderBodyTab(content);
      break;
    case 'auth':
      renderAuthTab(content);
      break;
    case 'preview':
      renderPreviewTab(content);
      break;
    case 'expect':
      renderExpectTab(content);
      break;
    case 'schema':
      renderSchemaTab(content);
      break;
    case 'scripts':
      renderScriptsTab(content);
      break;
    case 'sample':
      renderSampleTab(content);
      break;
    case 'response':
      renderResponseTab(container, content);
      break;
    case 'history':
      renderHistoryTab(content);
      break;
  }
  container.appendChild(content);
}



function renderPreviewTab(container: HTMLElement): void {
  const refreshBtn = document.createElement('button');
  refreshBtn.textContent = 'Refresh preview';
  refreshBtn.className = 'secondary';
  refreshBtn.style.marginBottom = '8px';
  refreshBtn.onclick = () => store.requestPreview();
  container.appendChild(refreshBtn);

  if (!store.currentPreview) {
    store.requestPreview();
    const loading = document.createElement('div');
    loading.className = 'akrp-empty';
    loading.textContent = 'Resolving variables…';
    container.appendChild(loading);
    return;
  }

  const blocksEl = document.createElement('div');
  container.appendChild(blocksEl);
  renderResolvedRequestBlocks(blocksEl, store.currentPreview);
}

function renderBodyTab(container: HTMLElement): void {
  const body = store.file.request.body;

  const modeRow = document.createElement('div');
  modeRow.className = 'akrp-kv-row';
  const select = document.createElement('select');
  const modes: BodyMode[] = ['none', 'json', 'text', 'form-urlencoded'];
  for (const mode of modes) {
    const opt = document.createElement('option');
    opt.value = mode;
    opt.textContent = mode;
    if (mode === body.mode) opt.selected = true;
    select.appendChild(opt);
  }
  select.onchange = () => {
    store.mutate(() => {
      store.file.request.body.mode = select.value as BodyMode;
    });
  };
  modeRow.appendChild(select);
  container.appendChild(modeRow);

  const method = store.file.request.method;
  const defaultContentType = DEFAULT_CONTENT_TYPE_BY_BODY_MODE[body.mode];
  if (defaultContentType && method !== 'GET' && method !== 'HEAD') {
    const hint = document.createElement('div');
    hint.className = 'akrp-env-readout';
    hint.textContent = `Sent with Content-Type: ${defaultContentType} unless overridden in the Headers tab.`;
    container.appendChild(hint);
  } else if (defaultContentType) {
    const hint = document.createElement('div');
    hint.className = 'akrp-env-readout';
    hint.textContent = `Body is not sent for ${method} requests, so no Content-Type default applies.`;
    container.appendChild(hint);
  }

  if (body.mode === 'json' || body.mode === 'text') {
    const editorContainer = document.createElement('div');
    editorContainer.className = 'akrp-code-editor';
    container.appendChild(editorContainer);
    const editor = createCodeEditor(
      editorContainer,
      body.mode === 'json' ? 'json' : 'plaintext',
      body.content,
      (value) => store.mutateQuiet(() => { store.file.request.body.content = value; }),
      body.mode === 'json' ? (monacoNs, model) => {
        try {
          const text = model.getValue();
          const markers: import('monaco-editor').editor.IMarkerData[] = [];
          if (text.trim()) {
            try {
              JSON.parse(text);
            } catch (e: any) {
              markers.push({
                severity: monacoNs.MarkerSeverity.Error,
                message: e.message || 'Invalid JSON',
                startLineNumber: 1,
                startColumn: 1,
                endLineNumber: model.getLineCount(),
                endColumn: 1,
              });
            }
          }
          monacoNs.editor.setModelMarkers(model, 'akrp-json-body-lint', markers);
        } catch (e) {
          console.error('[akrp] json body lint error:', e);
        }
        store.scheduleDiagnostics();
      } : undefined,
      'requestBody'
    );
    mountedEditors.push(editor);

    if (body.mode === 'json') {
      const prettifyBtn = document.createElement('button');
      prettifyBtn.textContent = 'Prettify';
      prettifyBtn.className = 'secondary';
      prettifyBtn.onclick = () => {
        try {
          const formatted = JSON.stringify(JSON.parse(store.file.request.body.content), null, 2);
          editor.setValue(formatted);
          store.mutateQuiet(() => { store.file.request.body.content = formatted; });
        } catch (e) {
          console.error('[akrp] prettify failed:', e);
        }
      };
      modeRow.appendChild(prettifyBtn);
    }
  } else if (body.mode === 'form-urlencoded') {
    const kvContainer = document.createElement('div');
    container.appendChild(kvContainer);
    renderKeyValueTable(
      kvContainer,
      () => {
        if (!store.file.request.body.formData) store.file.request.body.formData = [];
        return store.file.request.body.formData;
      },
      () => store.mutateQuiet(() => {}),
      () => store.mutate(() => {}),
      store.activeEnvVariableNames,
      store.activeEnvVariables
    );
  }
}

function renderAuthTab(container: HTMLElement): void {
  const auth = store.file.request.auth;

  const select = document.createElement('select');
  const types: AuthType[] = ['none', 'basic', 'bearer', 'api-key'];
  for (const type of types) {
    const opt = document.createElement('option');
    opt.value = type;
    opt.textContent = type;
    if (type === auth.type) opt.selected = true;
    select.appendChild(opt);
  }
  select.onchange = () => {
    store.mutate(() => {
      store.file.request.auth.type = select.value as AuthType;
    });
  };
  container.appendChild(select);

  const fields = document.createElement('div');
  fields.style.marginTop = '8px';

  if (auth.type === 'basic') {
    fields.append(
      textField('Username', auth.basic?.username ?? '', (v) =>
        store.mutateQuiet(() => {
          store.file.request.auth.basic = { username: v, password: store.file.request.auth.basic?.password ?? '' };
        })
      ),
      textField('Password', auth.basic?.password ?? '', (v) =>
        store.mutateQuiet(() => {
          store.file.request.auth.basic = { username: store.file.request.auth.basic?.username ?? '', password: v };
        })
      )
    );
  } else if (auth.type === 'bearer') {
    fields.append(
      textField('Token', auth.bearer?.token ?? '', (v) =>
        store.mutateQuiet(() => {
          store.file.request.auth.bearer = { token: v };
        })
      )
    );
  } else if (auth.type === 'api-key') {
    fields.append(
      textField('Key', auth.apiKey?.key ?? '', (v) =>
        store.mutateQuiet(() => {
          const cur = store.file.request.auth.apiKey;
          store.file.request.auth.apiKey = { key: v, value: cur?.value ?? '', in: cur?.in ?? 'header' };
        })
      ),
      textField('Value', auth.apiKey?.value ?? '', (v) =>
        store.mutateQuiet(() => {
          const cur = store.file.request.auth.apiKey;
          store.file.request.auth.apiKey = { key: cur?.key ?? '', value: v, in: cur?.in ?? 'header' };
        })
      )
    );

    const locationSelect = document.createElement('select');
    for (const loc of ['header', 'query'] as const) {
      const opt = document.createElement('option');
      opt.value = loc;
      opt.textContent = `Add to ${loc}`;
      if (loc === (auth.apiKey?.in ?? 'header')) opt.selected = true;
      locationSelect.appendChild(opt);
    }
    locationSelect.onchange = () => {
      store.mutate(() => {
        const cur = store.file.request.auth.apiKey;
        store.file.request.auth.apiKey = {
          key: cur?.key ?? '',
          value: cur?.value ?? '',
          in: locationSelect.value as 'header' | 'query',
        };
      });
    };
    fields.appendChild(locationSelect);
  }

  container.appendChild(fields);
}

function renderExpectTab(container: HTMLElement): void {
  const targets: ExpectTarget[] = ['status', 'header', 'body'];
  const operators: ExpectOperator[] = ['equals', 'notEquals', 'contains', 'exists', 'matches', 'greaterThan', 'lessThan'];

  store.file.expectations.forEach((assertion, idx) => {
    const row = document.createElement('div');
    row.className = 'akrp-kv-row';

    const targetSelect = document.createElement('select');
    for (const t of targets) {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      if (t === assertion.target) opt.selected = true;
      targetSelect.appendChild(opt);
    }
    targetSelect.onchange = () => {
      store.mutate(() => {
        store.file.expectations[idx].target = targetSelect.value as ExpectTarget;
      });
    };

    const pathInput = document.createElement('input');
    pathInput.type = 'text';
    pathInput.placeholder = assertion.target === 'header' ? 'Header name' : 'Body path (a.b[0].c)';
    pathInput.style.display = assertion.target === 'status' ? 'none' : '';
    pathInput.value = assertion.path ?? '';
    pathInput.oninput = () => {
      store.mutateQuiet(() => {
        store.file.expectations[idx].path = pathInput.value;
      });
    };

    const opSelect = document.createElement('select');
    for (const op of operators) {
      const opt = document.createElement('option');
      opt.value = op;
      opt.textContent = op;
      if (op === assertion.operator) opt.selected = true;
      opSelect.appendChild(opt);
    }
    opSelect.onchange = () => {
      store.mutate(() => {
        store.file.expectations[idx].operator = opSelect.value as ExpectOperator;
      });
    };

    const expectedInput = document.createElement('input');
    expectedInput.type = 'text';
    expectedInput.placeholder = 'Expected value';
    expectedInput.value = assertion.expected;
    expectedInput.style.display = assertion.operator === 'exists' ? 'none' : '';
    expectedInput.oninput = () => {
      store.mutateQuiet(() => {
        store.file.expectations[idx].expected = expectedInput.value;
      });
    };

    const removeBtn = document.createElement('span');
    removeBtn.textContent = '✕';
    removeBtn.style.cursor = 'pointer';
    removeBtn.style.opacity = '0.6';
    removeBtn.onclick = () => {
      store.mutate(() => {
        store.file.expectations.splice(idx, 1);
      });
    };

    row.append(targetSelect, pathInput, opSelect, expectedInput, removeBtn);
    container.appendChild(row);
  });

  const addBtn = document.createElement('button');
  addBtn.textContent = '+ Add assertion';
  addBtn.className = 'secondary';
  addBtn.onclick = () => {
    store.mutate(() => {
      const newAssertion: ExpectAssertion = {
        id: genId('exp'),
        target: 'status',
        operator: 'equals',
        expected: '200',
      };
      store.file.expectations.push(newAssertion);
    });
  };
  container.appendChild(addBtn);

  appendRunAgainstSample(container);
}

function renderSchemaTab(container: HTMLElement): void {
  const schemaValidation = store.file.schemaValidation;

  const checkboxRow = document.createElement('div');
  checkboxRow.className = 'akrp-checkbox-row';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = schemaValidation.enabled;
  checkbox.onchange = () => {
    store.mutate(() => {
      store.file.schemaValidation.enabled = checkbox.checked;
    });
  };
  const label = document.createElement('span');
  label.textContent = 'Validate response body with this JSON Schema (AJV)';
  checkboxRow.append(checkbox, label);
  container.appendChild(checkboxRow);

  const editorContainer = document.createElement('div');
  editorContainer.className = 'akrp-code-editor';
  container.appendChild(editorContainer);

  const editor = createCodeEditor(
    editorContainer,
    'json',
    schemaValidation.schema,
    (value) => store.mutateQuiet(() => (store.file.schemaValidation.schema = value)),
    (monacoNs, model) => lintSchema(monacoNs, model)
  );
  mountedEditors.push(editor);

  const formatSchemaBtn = document.createElement('button');
  formatSchemaBtn.textContent = 'Format';
  formatSchemaBtn.className = 'secondary';
  formatSchemaBtn.style.marginLeft = '8px';
  formatSchemaBtn.onclick = () => {
    try {
      const formatted = JSON.stringify(JSON.parse(store.file.schemaValidation.schema), null, 2);
      editor.setValue(formatted);
      store.mutateQuiet(() => (store.file.schemaValidation.schema = formatted));
    } catch { /* ignore invalid JSON */ }
  };
  checkboxRow.appendChild(formatSchemaBtn);

  appendRunAgainstSample(container);
}

function renderScriptsTab(container: HTMLElement): void {
  const preTitleRow = document.createElement('div');
  preTitleRow.style.display = 'flex';
  preTitleRow.style.alignItems = 'center';
  preTitleRow.style.gap = '8px';
  const preTitle = document.createElement('div');
  preTitle.className = 'akrp-section-title';
  preTitle.textContent = 'Pre-request script';
  preTitleRow.appendChild(preTitle);

  const preContainer = document.createElement('div');
  preContainer.className = 'akrp-code-editor';
  const preEditor = createCodeEditor(
    preContainer,
    'javascript',
    store.file.scripts.preRequest,
    (value) => store.mutateQuiet(() => (store.file.scripts.preRequest = value)),
    (monacoNs, model) => {
      try {
        lintScript(monacoNs, model);
        lintScriptVariables(monacoNs, model, store.activeEnvVariableNames);
      } catch (e) {
        console.error('[akrp] lint callback error:', e);
      }
      store.scheduleDiagnostics();
    },
    'preRequest'
  );
  mountedEditors.push(preEditor);

  const formatPreBtn = document.createElement('button');
  formatPreBtn.textContent = 'Format';
  formatPreBtn.className = 'secondary';
  formatPreBtn.onclick = () => {
    const action = preEditor.getAction('editor.action.formatDocument');
    if (action) { action.run(); }
  };
  preTitleRow.appendChild(formatPreBtn);

  container.appendChild(preTitleRow);
  container.appendChild(preContainer);

  const postTitleRow = document.createElement('div');
  postTitleRow.style.display = 'flex';
  postTitleRow.style.alignItems = 'center';
  postTitleRow.style.gap = '8px';
  const postTitle = document.createElement('div');
  postTitle.className = 'akrp-section-title';
  postTitle.textContent = 'Post-response script';
  postTitleRow.appendChild(postTitle);

  const postContainer = document.createElement('div');
  postContainer.className = 'akrp-code-editor';
  const postEditor = createCodeEditor(
    postContainer,
    'javascript',
    store.file.scripts.postResponse,
    (value) => store.mutateQuiet(() => (store.file.scripts.postResponse = value)),
    (monacoNs, model) => {
      try {
        lintScript(monacoNs, model);
        lintScriptVariables(monacoNs, model, store.activeEnvVariableNames);
      } catch (e) {
        console.error('[akrp] lint callback error:', e);
      }
      store.scheduleDiagnostics();
    },
    'postResponse'
  );
  mountedEditors.push(postEditor);

  const formatPostBtn = document.createElement('button');
  formatPostBtn.textContent = 'Format';
  formatPostBtn.className = 'secondary';
  formatPostBtn.onclick = () => {
    const action = postEditor.getAction('editor.action.formatDocument');
    if (action) { action.run(); }
  };
  postTitleRow.appendChild(formatPostBtn);

  container.appendChild(postTitleRow);
  container.appendChild(postContainer);

  appendRunAgainstSample(container);
}

function renderSampleTab(container: HTMLElement): void {
  const sampleTitleRow = document.createElement('div');
  sampleTitleRow.style.display = 'flex';
  sampleTitleRow.style.alignItems = 'center';
  sampleTitleRow.style.gap = '8px';
  const sampleTitle = document.createElement('div');
  sampleTitle.className = 'akrp-section-title';
  sampleTitle.textContent = 'Sample response (for developing tests without a live call)';
  sampleTitleRow.appendChild(sampleTitle);

  const sampleContainer = document.createElement('div');
  sampleContainer.className = 'akrp-code-editor';
  const sampleEditor = createCodeEditor(sampleContainer, 'json', store.file.sampleResponse, (value) =>
    store.mutateQuiet(() => (store.file.sampleResponse = value)), undefined, 'sampleResponse'
  );
  mountedEditors.push(sampleEditor);

  const formatSampleBtn = document.createElement('button');
  formatSampleBtn.textContent = 'Format';
  formatSampleBtn.className = 'secondary';
  formatSampleBtn.onclick = () => {
    try {
      const formatted = JSON.stringify(JSON.parse(store.file.sampleResponse), null, 2);
      sampleEditor.setValue(formatted);
      store.mutateQuiet(() => (store.file.sampleResponse = formatted));
    } catch { /* ignore invalid JSON */ }
  };
  sampleTitleRow.appendChild(formatSampleBtn);

  container.appendChild(sampleTitleRow);
  container.appendChild(sampleContainer);

  appendRunAgainstSample(container);
}

/** Shared "Run against sample" trigger + results block, used by the Expect, Schema, and Scripts tabs. */
function appendRunAgainstSample(container: HTMLElement): void {
  const runBtn = document.createElement('button');
  runBtn.textContent = 'Run against sample';
  runBtn.style.marginTop = '6px';
  runBtn.onclick = () => store.runAgainstSample();
  container.appendChild(runBtn);

  if (store.lastTestRun) {
    const resultsEl = document.createElement('div');
    container.appendChild(resultsEl);
    renderTestResults(resultsEl, store.lastTestRun);
  }
}

function textField(label: string, value: string, onInput: (value: string) => void): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'akrp-kv-row';
  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  labelEl.style.width = '80px';
  labelEl.style.flexShrink = '0';
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.oninput = () => {
    onInput(input.value);
    applyVariableLint(input, store.activeEnvVariableNames, store.activeEnvVariables);
  };
  applyVariableLint(input, store.activeEnvVariableNames, store.activeEnvVariables);
  attachVariableSuggestions(input, () => store.activeEnvVariableNames);
  wrapper.append(labelEl, input);
  return wrapper;
}
