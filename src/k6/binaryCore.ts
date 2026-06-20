import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';

/** Pinned k6 release. Bump deliberately — the asset names below are version-stable. */
export const K6_VERSION = 'v0.50.0';

export interface EnsureK6Options {
  /** explicit binary path to use as-is (skips download). */
  k6Path?: string;
  /** progress callback (e.g. download started). */
  onProgress?: (message: string) => void;
}

/**
 * Returns a usable k6 binary path, vscode-free. If `k6Path` is given it's returned as-is; otherwise
 * the pinned k6 release for the current platform is downloaded once into `cacheDir/<version>/` and
 * reused. Shared by the extension (via `binary.ts`) and the `albert` CLI.
 */
export async function ensureK6At(cacheDir: string, opts: EnsureK6Options = {}): Promise<string> {
  if (opts.k6Path && opts.k6Path.trim()) return opts.k6Path.trim();

  const binName = process.platform === 'win32' ? 'k6.exe' : 'k6';
  const dir = path.join(cacheDir, K6_VERSION);
  const binPath = path.join(dir, binName);
  if (await fileExists(binPath)) return binPath;

  const asset = k6AssetName();
  if (!asset) {
    throw new Error(
      `No prebuilt k6 binary for ${process.platform}/${process.arch}. ` +
        `Install k6 manually and set the "albert.k6Path" setting or ALBERT_K6_PATH env var.`
    );
  }

  opts.onProgress?.(`Downloading k6 ${K6_VERSION}…`);
  await fs.mkdir(dir, { recursive: true });
  const url = `https://github.com/grafana/k6/releases/download/${K6_VERSION}/${asset}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`k6 download failed (${res.status} ${res.statusText}) from ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const archivePath = path.join(dir, asset);
  await fs.writeFile(archivePath, buf);

  await extractArchive(archivePath, dir);

  const found = await findBinary(dir, binName);
  if (!found) throw new Error('k6 binary not found in the downloaded archive.');
  if (found !== binPath) await fs.copyFile(found, binPath);
  if (process.platform !== 'win32') await fs.chmod(binPath, 0o755);

  await fs.rm(archivePath, { force: true });
  return binPath;
}

/** Maps the current platform/arch to a grafana/k6 release asset filename. */
function k6AssetName(): string | null {
  const v = K6_VERSION;
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'amd64' : null;
  if (!arch) return null;
  switch (process.platform) {
    case 'win32':
      return process.arch === 'x64' ? `k6-${v}-windows-amd64.zip` : null;
    case 'darwin':
      return `k6-${v}-macos-${arch}.zip`;
    case 'linux':
      return `k6-${v}-linux-${arch}.tar.gz`;
    default:
      return null;
  }
}

/** Extracts a zip or tar.gz using the system `tar` (bsdtar on Win/macOS handles zip; GNU tar
 *  auto-detects gzip). Avoids pulling in a JS archive dependency. */
function extractArchive(archivePath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', ['-xf', archivePath, '-C', destDir], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => reject(new Error(`failed to run tar to extract k6: ${err.message}`)));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tar extraction of k6 failed (exit ${code}): ${stderr}`));
    });
  });
}

/** Recursively locates the k6 binary inside the extracted archive tree. */
async function findBinary(rootDir: string, binName: string): Promise<string | null> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findBinary(full, binName);
      if (nested) return nested;
    } else if (entry.name === binName) {
      return full;
    }
  }
  return null;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
