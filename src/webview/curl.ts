import { ResolvedRequestPreview } from '../model/types';

/** Builds a copy-pasteable curl command from an already-resolved request (variables substituted,
 *  auth headers/query already applied) — same shape used by the Preview tab, Response > Request
 *  sub-tab, and History entries. */
export function buildCurlCommand(preview: ResolvedRequestPreview): string {
  const lines = [`curl -X ${preview.method} ${quote(preview.url)}`];
  for (const header of preview.headers) {
    lines.push(`-H ${quote(`${header.name}: ${header.value}`)}`);
  }
  // sendRequest() drops the body for GET/HEAD (fetch's own rule) — match that here so the
  // copied command never sends data the live "Send" button wouldn't actually transmit.
  const sendsBody = preview.method !== 'GET' && preview.method !== 'HEAD';
  if (sendsBody && preview.body.mode !== 'none' && preview.body.content) {
    lines.push(`-d ${quote(preview.body.content)}`);
  }
  return lines.join(' \\\n  ');
}

function quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
