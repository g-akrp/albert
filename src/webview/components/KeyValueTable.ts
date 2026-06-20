import { EnvVariable } from '../../model/types';
import { applyVariableLint } from '../lint/variableLint';
import { attachVariableSuggestions } from '../lint/varSuggest';

export interface KeyValueTableEntry {
  name: string;
  value: string;
  enabled: boolean;
}

/**
 * `getEntries` returns the live array reference inside the caller's store, so edits
 * write straight into store state. `onQuietChange` should skip re-render (preserves
 * input focus while typing); `onStructuralChange` should trigger a full re-render.
 */
export function renderKeyValueTable(
  container: HTMLElement,
  getEntries: () => KeyValueTableEntry[],
  onQuietChange: () => void,
  onStructuralChange: () => void,
  knownVarNames?: string[],
  envVariables?: EnvVariable[]
): void {
  const rows = getEntries();
  container.innerHTML = '';

  rows.forEach((row, idx) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'akrp-kv-row';

    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.checked = row.enabled;
    enabled.onchange = () => {
      rows[idx].enabled = enabled.checked;
      onStructuralChange();
    };

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Key';
    nameInput.value = row.name;
    nameInput.oninput = () => {
      rows[idx].name = nameInput.value;
      onQuietChange();
    };

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.placeholder = 'Value';
    valueInput.value = row.value;
    valueInput.oninput = () => {
      rows[idx].value = valueInput.value;
      onQuietChange();
      if (knownVarNames) applyVariableLint(valueInput, knownVarNames, envVariables);
    };
    if (knownVarNames) {
      applyVariableLint(valueInput, knownVarNames, envVariables);
      attachVariableSuggestions(valueInput, () => knownVarNames);
    }

    const removeBtn = document.createElement('span');
    removeBtn.textContent = '✕';
    removeBtn.style.cursor = 'pointer';
    removeBtn.style.opacity = '0.6';
    removeBtn.onclick = () => {
      rows.splice(idx, 1);
      onStructuralChange();
    };

    rowEl.append(enabled, nameInput, valueInput, removeBtn);
    container.appendChild(rowEl);
  });

  const addBtn = document.createElement('button');
  addBtn.textContent = '+ Add';
  addBtn.className = 'secondary';
  addBtn.onclick = () => {
    rows.push({ name: '', value: '', enabled: true });
    onStructuralChange();
  };
  container.appendChild(addBtn);
}
