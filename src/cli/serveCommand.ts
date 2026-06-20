import * as http from 'http';
import * as path from 'path';
import { readFile } from 'fs/promises';
import { AblogEvent } from './ablog';

const PAGE = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><title>Albert results</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#1e1e1e;color:#ddd;padding:16px;}</style>
</head><body><div id="root"></div><script src="/cli-web.js"></script></body></html>`;

/** Starts the lightweight results server: serves the web bundle + the parsed .ablog as JSON. */
export function startServer(ablogPath: string, port: number): http.Server {
  const webBundle = path.join(__dirname, 'cli-web.js');

  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === '/' || req.url === '/index.html') {
        send(res, 200, 'text/html; charset=utf-8', PAGE);
      } else if (req.url === '/cli-web.js') {
        send(res, 200, 'text/javascript; charset=utf-8', await readFile(webBundle, 'utf8'));
      } else if (req.url?.startsWith('/ablog')) {
        const events = await readAblog(ablogPath);
        send(res, 200, 'application/json', JSON.stringify(events));
      } else {
        send(res, 404, 'text/plain', 'Not found');
      }
    } catch (err: any) {
      send(res, 500, 'text/plain', String(err?.message ?? err));
    }
  });
  server.listen(port);
  return server;
}

/** Standalone `albert serve <file.ablog>`: keeps the process alive. */
export function serveCommand(ablogPath: string, port: number): Promise<number> {
  startServer(path.resolve(ablogPath), port);
  console.log(`Serving ${ablogPath} at http://localhost:${port}  (Ctrl+C to stop)`);
  return new Promise<number>(() => undefined);
}

async function readAblog(ablogPath: string): Promise<AblogEvent[]> {
  let text: string;
  try {
    text = await readFile(ablogPath, 'utf8');
  } catch {
    return [];
  }
  const events: AblogEvent[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      events.push(JSON.parse(t));
    } catch {
      // ignore partial trailing line (file may be mid-append)
    }
  }
  return events;
}

function send(res: http.ServerResponse, status: number, type: string, body: string): void {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}
