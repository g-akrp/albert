import * as path from 'path';
import { spawn } from 'child_process';
import { existsSync } from 'fs';

/**
 * Brings the bundled InfluxDB 1.8 + Grafana stack up/down via podman-compose (or docker compose).
 * The compose files live in `albert-stack/` at the repo root (sibling of `out/`); they are repo-only
 * tooling, so on a published/installed extension they may be absent — we warn and point at the repo.
 */
export function stackCommand(action: 'up' | 'down', engine: 'podman' | 'docker'): Promise<number> {
  const composeFile = path.join(__dirname, '..', 'albert-stack', 'compose.yml');
  if (!existsSync(composeFile)) {
    console.error(
      `albert-stack not found at ${composeFile}.\n` +
        `The Grafana/InfluxDB stack ships with the Albert repo (not the published extension).\n` +
        `Clone the repo and run 'albert stack up' from there, or point --influx at your own InfluxDB.`
    );
    return Promise.resolve(2);
  }

  const [cmd, baseArgs] =
    engine === 'docker' ? (['docker', ['compose', '-f', composeFile]] as const) : (['podman-compose', ['-f', composeFile]] as const);
  const args = action === 'up' ? [...baseArgs, 'up', '-d'] : [...baseArgs, 'down'];

  console.log(`$ ${cmd} ${args.join(' ')}`);
  return new Promise<number>((resolve) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('error', (err) => {
      console.error(`Failed to run ${cmd}: ${err.message}. Is ${engine} installed and on PATH?`);
      resolve(1);
    });
    child.on('close', (code) => {
      if (action === 'up' && code === 0) {
        console.log('\nStack up. Grafana: http://localhost:3000  ·  InfluxDB: http://localhost:8086 (db "k6")');
        console.log('Run a sim with:  albert run <sim>.abl --influx http://localhost:8086/k6');
      }
      resolve(code ?? 0);
    });
  });
}
