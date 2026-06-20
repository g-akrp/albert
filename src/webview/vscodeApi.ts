interface VsCodeApi<TOutgoing> {
  postMessage(message: TOutgoing): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi<TOutgoing = unknown>(): VsCodeApi<TOutgoing>;

export function getVsCodeApi<TOutgoing>(): VsCodeApi<TOutgoing> {
  return acquireVsCodeApi<TOutgoing>();
}

export function onHostMessage<TIncoming>(handler: (message: TIncoming) => void): void {
  window.addEventListener('message', (event) => handler(event.data as TIncoming));
}
