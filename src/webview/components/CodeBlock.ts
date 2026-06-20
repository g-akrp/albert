export interface CodeBlockHandle {
  element: HTMLElement;
  setContent(text: string): void;
}

/**
 * A read-only, markdown-style code block: a bordered monospace panel with an optional
 * "Copy" button (and room for extra toolbar controls) in its top-right corner.
 * The copy button always copies the block's current content, even after setContent().
 */
export function createCodeBlock(
  initial: string,
  opts: { copy?: boolean; toolbarExtra?: HTMLElement } = {}
): CodeBlockHandle {
  let current = initial;

  const wrap = document.createElement('div');
  wrap.className = 'albert-codeblock';

  const showCopy = opts.copy !== false;
  if (showCopy || opts.toolbarExtra) {
    const bar = document.createElement('div');
    bar.className = 'albert-codeblock-toolbar';
    if (opts.toolbarExtra) bar.appendChild(opts.toolbarExtra);
    if (showCopy) {
      const btn = document.createElement('button');
      btn.className = 'secondary albert-copy-btn';
      btn.textContent = 'Copy';
      btn.onclick = () => {
        navigator.clipboard.writeText(current).then(
          () => {
            btn.textContent = 'Copied!';
            setTimeout(() => (btn.textContent = 'Copy'), 1500);
          },
          (err) => console.error('[Albert] failed to copy', err)
        );
      };
      bar.appendChild(btn);
    }
    wrap.appendChild(bar);
  }

  const pre = document.createElement('pre');
  pre.textContent = initial;
  wrap.appendChild(pre);

  return {
    element: wrap,
    setContent(text: string) {
      current = text;
      pre.textContent = text;
    },
  };
}
