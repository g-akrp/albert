import { runCommand, RunOptions } from './runCommand';
import { serveCommand } from './serveCommand';
import { stackCommand } from './stackCommand';

const HELP = `albert — run Albert tests outside VS Code

Usage:
  albert run <file.abrq|.abf|.abl> [options]   Run a request, flow, or load sim
  albert serve <file.ablog> [--port N]         Serve a result log in the browser
  albert stack up|down [--engine podman|docker] Start/stop the Grafana+InfluxDB stack
  albert --help

run options:
  --env <file.abenv>   Environment variables/settings to resolve {{vars}}
  --ablog <path>       Result log path (default: <file>.ablog next to the target)
  --influx <url>       Stream k6 metrics to InfluxDB 1.8 (e.g. http://localhost:8086/k6)
  --serve [--port N]   Also serve live results in the browser (default port 7070)
  --k6 <path>          Use a specific k6 binary (else ALBERT_K6_PATH or auto-download)
  --quick              Skip the load-plan confirmation prompt for .abl sims
`;

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    console.log(HELP);
    return command ? 0 : 1;
  }

  switch (command) {
    case 'run': {
      const positional = rest.find((a) => !a.startsWith('--'));
      if (!positional) {
        console.error('run: missing <file>. See `albert --help`.');
        return 2;
      }
      const opts: RunOptions = {
        file: positional,
        env: flagValue(rest, '--env'),
        ablog: flagValue(rest, '--ablog'),
        influx: flagValue(rest, '--influx'),
        serve: hasFlag(rest, '--serve'),
        port: numberFlag(rest, '--port'),
        k6: flagValue(rest, '--k6'),
        quick: hasFlag(rest, '--quick'),
      };
      return runCommand(opts);
    }
    case 'serve': {
      const positional = rest.find((a) => !a.startsWith('--'));
      if (!positional) {
        console.error('serve: missing <file.ablog>.');
        return 2;
      }
      return serveCommand(positional, numberFlag(rest, '--port') ?? 7070);
    }
    case 'stack': {
      const action = rest.find((a) => a === 'up' || a === 'down') as 'up' | 'down' | undefined;
      if (!action) {
        console.error('stack: specify `up` or `down`.');
        return 2;
      }
      const engine = (flagValue(rest, '--engine') as 'podman' | 'docker') || 'podman';
      return stackCommand(action, engine);
    }
    default:
      console.error(`Unknown command: ${command}. See \`albert --help\`.`);
      return 2;
  }
}

function flagValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

function numberFlag(args: string[], flag: string): number | undefined {
  const v = flagValue(args, flag);
  return v !== undefined ? Number(v) : undefined;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err?.stack ?? err);
    process.exit(1);
  });
