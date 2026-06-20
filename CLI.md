# CLI.md

Run the same tests outside VS Code (CI, a terminal, a headless box) with the `albert` CLI.

## Install

From the editor: **Albert: Install CLI** (runs `npm install -g "<extension>"`, needs npm on PATH).
From a checkout of this repo: `node out/cli.js` after `npm run compile`.

## Commands

```
albert run <file.abrq|.abf|.abl> [--env e.abenv] [--ablog out.ablog] [--influx URL] [--serve [--port N]] [--k6 path]
albert serve <file.ablog> [--port 7070]          # view a result log in the browser
albert stack up|down [--engine podman|docker]    # bundled InfluxDB 1.8 + Grafana
```

### `run`

Executes a request (`.abrq`, native fetch), a flow (`.abf`, k6 1 VU/1 iter), or a load sim (`.abl`,
k6 arrival-rate per flow). Prints a summary and writes an **NDJSON `.ablog`** result log (one event
per line: `runStart` · `step`/`request`/`tick` · `summary` · `runEnd`).

- `--env <file.abenv>` — environment to resolve `{{variables}}` against.
- `--ablog <path>` — where to write the NDJSON result log (defaults to a generated name).
- `--influx <url>` — stream sim metrics to an InfluxDB endpoint as the run progresses (e.g.
  `http://localhost:8086/k6`).
- `--serve [--port N]` — after the run, start the local viewer server on the result log (see
  `serve` below) instead of just exiting.
- `--k6 <path>` / `ALBERT_K6_PATH` env var — use a specific k6 binary instead of the
  auto-downloaded pinned release.

### `serve`

`albert serve <file.ablog> [--port 7070]` starts a tiny localhost server that renders the `.ablog`
with the same XY / Sankey / table charts the sim editor uses, polling the file so it updates live
during a run. Equivalent to passing `--serve` to `run`.

### `stack`

`albert stack up|down [--engine podman|docker]` brings up a podman-compose (or `--engine docker`)
**InfluxDB 1.8 + Grafana** stack with a pre-provisioned datasource and k6 dashboard. Stream metrics
to it with `albert run <sim>.abl --influx http://localhost:8086/k6` and watch Grafana at
`localhost:3000`. The `albert-stack/` compose files ship with the repo, not the published
extension.

## What the CLI doesn't do (yet)

The CLI does not currently send Allure reports or read `.abepic`/`.abfeat` files — Allure reporting
and the epic/feature picker are VS-Code-editor-side features today (see
[ROADMAP.md](ROADMAP.md#execution-engine) for CLI Allure parity as a planned gap).

## k6 binary

k6 is never bundled. `run`/`serve` auto-download a pinned k6 release into a CLI-appropriate cache
directory on first use (same `binaryCore.ts` logic the extension uses), unless `--k6`/`ALBERT_K6_PATH`
points at your own binary. See [ARCHITECTURE.md](ARCHITECTURE.md#k6-binary-management).
