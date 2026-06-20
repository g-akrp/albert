/**
 * Adds a `{{name}}` suggestion dropdown to a plain text input, mirroring the env-var completion
 * Monaco already offers in the Scripts/Schema tabs (see monacoSetup.ts's `isInVarBrackets`).
 * Plain <input> elements have no built-in completion UI, so this renders a small absolutely
 * positioned list under the input instead.
 */
export function attachVariableSuggestions(input: HTMLInputElement, getVarNames: () => string[]): void {
  let dropdown: HTMLDivElement | null = null;

  function close(): void {
    dropdown?.remove();
    dropdown = null;
  }

  function open(matches: string[], braceStart: number): void {
    close();
    dropdown = document.createElement('div');
    dropdown.className = 'albert-var-suggest';

    for (const name of matches) {
      const item = document.createElement('div');
      item.className = 'albert-var-suggest-item';
      item.textContent = name;
      // mousedown (not click) fires before the input's blur handler would close the dropdown.
      item.onmousedown = (e) => {
        e.preventDefault();
        const value = input.value;
        const cursor = input.selectionStart ?? value.length;
        const insertText = `{{${name}}}`;
        input.value = value.slice(0, braceStart) + insertText + value.slice(cursor);
        const newCursor = braceStart + insertText.length;
        input.setSelectionRange(newCursor, newCursor);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        close();
        input.focus();
      };
      dropdown.appendChild(item);
    }

    const rect = input.getBoundingClientRect();
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom}px`;
    dropdown.style.minWidth = `${rect.width}px`;
    document.body.appendChild(dropdown);
  }

  function update(): void {
    const value = input.value;
    const cursor = input.selectionStart ?? value.length;
    const braceIdx = value.lastIndexOf('{{', cursor);
    if (braceIdx === -1) { close(); return; }
    const between = value.slice(braceIdx + 2, cursor);
    if (between.includes('}') || between.includes('{') || /\s/.test(between)) { close(); return; }
    const matches = getVarNames().filter((n) => n.toLowerCase().startsWith(between.toLowerCase()));
    if (matches.length === 0) { close(); return; }
    open(matches, braceIdx);
  }

  input.addEventListener('input', update);
  input.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') update();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  // Deferred so a suggestion's mousedown (which calls input.focus()) doesn't get raced by this blur.
  input.addEventListener('blur', () => setTimeout(close, 100));
}
