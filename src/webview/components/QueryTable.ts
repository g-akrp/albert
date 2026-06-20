import { EnvVariable, ValueFormat } from '../../model/types';
import { applyVariableLint } from '../lint/variableLint';
import { attachVariableSuggestions } from '../lint/varSuggest';

export interface QueryTableEntry {
  key: string;
  format: ValueFormat;
  value: string;
  enabled: boolean;
}

const FORMATS: ValueFormat[] = ['string', 'number', 'boolean', 'json'];

export function renderQueryTable(
  container: HTMLElement,
  getEntries: () => QueryTableEntry[],
  onQuietChange: () => void,
  onStructuralChange: () => void,
  knownVarNames?: string[],
  envVariables?: EnvVariable[]
): void {
  const rows = getEntries();
  container.innerHTML = '';

  rows.forEach((row, idx) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'albert-kv-row';

    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.checked = row.enabled;
    enabled.onchange = () => {
      rows[idx].enabled = enabled.checked;
      onStructuralChange();
    };

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.placeholder = 'Key';
    keyInput.value = row.key;
    keyInput.oninput = () => {
      rows[idx].key = keyInput.value;
      onQuietChange();
    };

    const formatSelect = document.createElement('select');
    for (const format of FORMATS) {
      const opt = document.createElement('option');
      opt.value = format;
      opt.textContent = format;
      if (format === row.format) opt.selected = true;
      formatSelect.appendChild(opt);
    }
    formatSelect.onchange = () => {
      rows[idx].format = formatSelect.value as ValueFormat;
      onStructuralChange();
    };

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.placeholder = 'Value';
    valueInput.value = row.value;
    const refreshValueValidity = () => {
      const isValid = validateFormat(valueInput.value, rows[idx].format);
      if (!isValid) {
        valueInput.style.borderColor = 'var(--vscode-inputValidation-errorBorder, #d9534f)';
        valueInput.title = `Value does not look like a valid ${rows[idx].format}`;
      } else if (knownVarNames) {
        applyVariableLint(valueInput, knownVarNames, envVariables);
      } else {
        valueInput.style.borderColor = '';
        valueInput.title = '';
      }
    };
    valueInput.oninput = () => {
      rows[idx].value = valueInput.value;
      onQuietChange();
      refreshValueValidity();
    };
    refreshValueValidity();
    if (knownVarNames) attachVariableSuggestions(valueInput, () => knownVarNames);

    const removeBtn = document.createElement('span');
    removeBtn.textContent = '✕';
    removeBtn.style.cursor = 'pointer';
    removeBtn.style.opacity = '0.6';
    removeBtn.onclick = () => {
      rows.splice(idx, 1);
      onStructuralChange();
    };

    rowEl.append(enabled, keyInput, formatSelect, valueInput, removeBtn);
    container.appendChild(rowEl);
  });

  const addBtn = document.createElement('button');
  addBtn.textContent = '+ Add';
  addBtn.className = 'secondary';
  addBtn.onclick = () => {
    rows.push({ key: '', format: 'string', value: '', enabled: true });
    onStructuralChange();
  };
  container.appendChild(addBtn);
}

function validateFormat(value: string, format: ValueFormat): boolean {
  if (!value) return true;
  switch (format) {
    case 'number':
      return !Number.isNaN(Number(value));
    case 'boolean':
      return value === 'true' || value === 'false';
    case 'json':
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    case 'string':
    default:
      return true;
  }
}
