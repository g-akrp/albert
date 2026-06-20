# Albert

A VS Code extension for API testing built around two plain-JSON file formats:

- **`*.abrq`** — one HTTP request per file (method, endpoint/path, headers, query, body, auth, pre/post-response scripts, declarative assertions, an AJV schema, and a sample response for offline test authoring).
- **`*.abenv`** — a named set of variables (`{{var}}`) plus per-environment settings (timeout, follow-redirects).
- **`*.abf`** — an ordered composition of request steps (each referencing a `.abrq` file) run end-to-end via [k6](https://k6.io/), with a per-step toggle for running that request's validations as checks and per-step **captures** that feed values forward as `{{variables}}` for later steps.
- **`*.abl`** — a load/stress simulation that combines multiple flows, each with its own **target TPS**, into a single k6 run; results are visualized locally (live + summary charts) and can optionally be exported to New Relic.
- **`*.abh`** — a saved **flow run history** (one or more past flow runs with full per-step detail), opened in a read-only viewer.

There is no collection file. A "collection" is just a folder containing `.abrq` / `.abenv` files — VS Code's own Explorer is the browser.

## Using it

1. Right-click a folder → **Albert: New Environment Config**, add variables (e.g. `baseUrl`).
2. Command Palette → **Albert: Select Active Environment** and pick that file. The status bar shows `Env: <name>` and is clickable to switch.
3. Right-click a folder → **Albert: New API Request File**. This opens a custom editor with three tab groups:
   - **Compose Request** — Headers, Query, Body (with JSON Prettify + format-on-save), Auth, and **Preview** (shows the request with `{{variables}}` already resolved, without sending, with a **Copy as cURL** button).
   - **Validate Response** — Expect (no-code assertions on status/header/body), Schema (AJV JSON Schema against the response body), Scripts (pre-request/post-response JS with `request`/`response`/`environment` globals + Jest-style `expect()`, plus a pasted **sample response** so you can develop tests with "Run against sample" before a live call works), and Response (the live result: Body (with a **Copy body** button)/Headers/Tests/Request sub-tabs).
   - **History** — every live send this session (request + response + test results), expandable, not persisted to disk.
4. Click **Send**. While a request is in flight the button becomes **Cancel** — click it to abort the send (flows and sims have the same Stop/Cancel control while running).

### Flows

Right-click a folder → **Albert: New API Flow** to create a `.abf`. Add steps, pick a `.abrq`
request for each, optionally toggle **validate** (runs that request's Expect assertions + schema as
k6 checks) and add **captures** (pull a value from a step's response body/header/status into a
flow-scoped `{{variable}}` usable by later steps). Click **▶ Run flow** to execute the whole flow
once via k6 (1 VU / 1 iteration); per-step status, timing, validation checks, and a response-body
preview stream into the results panel as the run progresses.

Each run is added to a **Run history** list at the bottom of the flow editor (most recent first, kept
per editor session). Expand any entry to see that run's per-step detail. Click **Save history…** to
write the runs to a `*.abh` file; opening that file uses a read-only **history viewer** that
renders the same per-step results — handy for archiving a run or sharing it alongside the repo.

k6 is the execution engine for flows (and, later, load sims). On first run Albert downloads and caches
a pinned k6 release into its global storage automatically — no manual install. To use your own k6
binary instead, set the **`albert.k6Path`** setting to its path.

### Sims (load & stress testing)

Right-click a folder → **Albert: New Load Simulation** to create a `.abl`. Pick a **load profile**
(`constant`/`load`/`stress`/`spike`/`soak`), set the duration/ramp, then add flows — each row picks a
`.abf` and sets a **target TPS**. Each flow becomes its own k6 arrival-rate scenario, so a single
sim can drive several flows at independent throughputs simultaneously. Click **▶ Run sim**; results
update live during the run and stay after it finishes, with a switcher between three views — all
rendered locally, no external service required:

- **XY chart** — throughput (req/s), p95 latency, and error-rate plotted over time per flow, plus
  achieved-TPS and p95 bar charts.
- **Sankey** — load distribution as a flow diagram: total load → each flow (width ∝ request count) →
  Success / Error outcome, so you can see at a glance where traffic and failures concentrate.
- **Table** — per-flow summary (achieved vs. target TPS, request count, error %, p50/p95/p99, checks).

Before you run anything, the same view switcher also shows a **Planned load (preview)** panel computed
from the profile + per-flow target TPS — the **XY** view plots the arrival-rate curve each flow will
follow over time (ramp/hold/spike shape), the **Sankey** shows how the planned request volume splits
across flows, and the **Table** lists planned requests per flow. The preview is derived from the same
load model the k6 scenarios are generated from (`src/model/loadProfile.ts`), so what you preview is what
runs.

**New Relic export (optional):** tick "Send results to New Relic", choose the region (US/EU), and set
your Metric API key (the in-editor button, or **Albert: Set New Relic API Key** — stored in VS Code
SecretStorage, never in the `.sim` file). After each run Albert POSTs per-flow metrics (achieved TPS,
error rate, latency percentiles, request counts, check pass-rate) to New Relic's Metric API. Runs work
fine without a key — the export is simply skipped.

Opening a `.abrq`/`.abenv`/`.abf`/`.abl` file as plain text (via the editor-title "Open File as Text" button) gets JSON Schema-backed autocomplete/validation from VS Code's built-in JSON language service.

## `albert` CLI

Run the same tests outside VS Code (CI, a terminal, a headless box). Install it from the editor with
**Albert: Install CLI** (runs `npm install -g "<extension>"`, needs npm on PATH), or use `node
out/cli.js` from the repo.

```
albert run <file.abrq|.abf|.abl> [--env e.abenv] [--ablog out.ablog] [--influx URL] [--serve [--port N]]
albert serve <file.ablog> [--port 7070]          # view a result log in the browser
albert stack up|down [--engine podman|docker]    # bundled InfluxDB 1.8 + Grafana
```

- **run** executes a request (`.abrq`, native fetch), a flow (`.abf`, k6 1 VU/1 iter), or a load sim
  (`.abl`, k6 arrival-rate per flow). It prints a summary and writes an **NDJSON `.ablog`** result log
  (one event per line: `runStart` · `step`/`request`/`tick` · `summary` · `runEnd`). k6 is
  auto-downloaded on first use (or set `--k6` / `ALBERT_K6_PATH`).
- **serve** (or `run --serve`) starts a tiny localhost server that renders the `.ablog` with the same
  XY / Sankey / table charts the sim editor uses, polling so it updates live during a run.
- **stack** brings up a podman-compose (or `--engine docker`) **InfluxDB 1.8 + Grafana** stack with a
  pre-provisioned datasource + k6 dashboard. Stream metrics to it with `albert run <sim>.abl --influx
  http://localhost:8086/k6` and watch Grafana at `localhost:3000`. (The `albert-stack/` files ship with
  the repo, not the published extension.)

## Architecture

```
src/
├── extension.ts                  activate(): registers both custom editors, commands, status bar, format-on-save
├── activeEnvironment.ts          workspace-wide "which env_config is active" singleton (persisted in workspaceState)
├── statusBar.ts                  the "Env: <name>" status bar item
├── formatOnSave.ts               reformats a JSON request body on save (onWillSaveTextDocument)
├── model/types.ts                shared TS types + the webview<->host message protocols (source of truth)
├── commands/                     newRequestFile, newEnvConfigFile, selectActiveEnvironment
├── editor/
│   ├── RequestEditorProvider.ts  CustomTextEditorProvider for *.abrq; orchestrates send/sample-run pipeline
│   ├── EnvConfigEditorProvider.ts CustomTextEditorProvider for *.abenv
│   ├── FlowEditorProvider.ts     CustomTextEditorProvider for *.abf; loads step requests, generates+runs k6, saves .abh
│   ├── SimEditorProvider.ts      CustomTextEditorProvider for *.abl; one k6 scenario per flow, live ticks + summary
│   └── HistoryViewerProvider.ts  read-only CustomTextEditorProvider for *.abh (saved flow run history)
├── k6/
│   ├── binaryCore.ts             ensureK6At(): vscode-free k6 download/extract/cache (shared by extension + CLI)
│   ├── resolveTargets.ts         Node-fs loaders: resolve a .abf/.abl and the files it references (for the CLI)
│   ├── binary.ts                 ensureK6(): extension wrapper over binaryCore (albert.k6Path override, progress, global storage)
│   ├── generateFlowScript.ts     emits a self-contained k6 script from a flow (env vars resolved host-side)
│   ├── generateSimScript.ts      emits a multi-scenario k6 script (arrival-rate per flow) for load/stress (uses model/loadProfile)
│   ├── runner.ts                 spawns k6 (1 VU/1 iter), parses per-step __albert_step lines, streams results
│   └── simRunner.ts              spawns k6 --out json, polls it for live per-scenario ticks, builds per-flow summary
├── apm/
│   ├── index.ts                  APM key (SecretStorage) + provider dispatch
│   └── newrelic.ts               posts a sim summary to New Relic's Metric API
├── http/httpClient.ts            builds the real request (vars resolved) and calls fetch(); also resolveRequestForDisplay() for Preview/History
├── variables/substitute.ts       {{var}} substitution
├── scripting/sandbox.ts          runs pre/post scripts in a Node vm.Context; exposes request/response/environment, console.log, expect()
├── testing/
│   ├── expectations.ts           evaluates declarative Expect rows against a response
│   ├── schemaValidator.ts        AJV compile+validate (host-side, used for the real response)
│   └── runTests.ts               orchestrates expectations + schema + post-response script into one TestRunResult
└── webview/
    ├── vscodeApi.ts, styles.ts, format.ts   shared webview utilities
    ├── components/                          shared UI pieces (KeyValueTable, QueryTable, TestResults,
    │                                         ResolvedRequestBlocks, Monaco setup/wrapper)
    ├── lint/                                client-side lint helpers (unknown {{var}}, AJV schema, sample-key extraction)
    ├── request/                             the .abrq editor's webview (state.ts, Tabs.ts, ResponseTab.ts, HistoryTab.ts, main.ts)
    ├── envconfig/                           the .abenv editor's webview (state.ts, main.ts)
    ├── flow/                                the .abf editor's webview (state.ts, FlowEditor.ts, main.ts)
    ├── sim/                                 the .abl editor's webview (state.ts, SimEditor.ts, charts.ts, main.ts)
    └── history/                             the .abh read-only viewer's webview (main.ts; shares components/flowResults.ts)
```

Both custom editors are `CustomTextEditorProvider`s — the on-disk file stays plain JSON text the whole time, so undo/redo/save/hot-reload and "Open as Text" all come for free from VS Code, and the same document gets JSON Schema validation when viewed as text.

The webview and extension host are two different JS runtimes (browser webview vs. Node extension host) joined only by `postMessage`. **`src/model/types.ts` is the single source of truth for that wire protocol** (`RequestHostToWebviewMessage` / `RequestWebviewToHostMessage` and the env-config equivalents) — change a message shape there first, then fix the two sides that break.

Variable substitution and the actual `fetch()` call always happen in the **extension host** (`http/httpClient.ts`), never in the webview — the webview only ever sees already-resolved display data (`ResolvedRequestPreview`) or results (`SendResult`/`TestRunResult`). Scripts run in the host too, via a Node `vm.Context` (`scripting/sandbox.ts`), not in the webview's Monaco editor.

Monaco (full code editor with autocomplete/lint) is used only for the Scripts and Schema tabs' text editors. It's a separate concern from VS Code's own editor — see `webview/components/monacoSetup.ts` and `codeEditor.ts`. Worker scripts (`editor.worker.js`, `json.worker.js`, `ts.worker.js`) are bundled as their own esbuild entry points. `MonacoEnvironment.getWorker` cannot construct `new Worker(webviewResourceUrl)` directly — the webview sandbox rejects cross-origin Worker scripts that way — so it `fetch()`es the worker source as text, wraps it in a `Blob`, and constructs the `Worker` from `URL.createObjectURL(blob)` instead (see `c946eff`). This needs `connect-src ${cspSource}` in the CSP for the fetch and `worker-src ${cspSource} blob:` for the resulting blob worker.

## Build

```
npm install
npm run compile     # one-shot build (esbuild): out/extension.js, out/webview-request.js, out/webview-env.js, worker bundles
npm run typecheck   # tsc --noEmit, esbuild does not type-check
npm run watch        # used by .vscode/tasks.json as the F5 preLaunchTask
npx @vscode/vsce package --no-dependencies   # produces albert-0.2.1.vsix
```

Press **F5** in this folder to launch the Extension Development Host.

## Known limitations (deliberate v1 scope cuts)

- Single workspace-wide active environment, not folder-scoped; one flat variable list per env_config file (no multi-environment-per-file switcher).
- Auth: none/basic/bearer/api-key only (no OAuth2/digest/client-certs). Body: none/json/text/form-urlencoded (no multipart file upload).
- No Postman/Bruno/cURL import. No cookie jar. No folder-level shared headers.
- History is in-memory per webview session only (capped at 20 entries), not persisted to disk.
- Script linting does not validate usage of the `request`/`response`/`environment` script globals themselves (e.g. a typo'd `environment.get`) — only JS syntax errors, unknown `{{variable}}` references, and invalid AJV schema JSON are linted.
- Flows/sims require k6 (auto-downloaded once, or `albert.k6Path`). In a flow's k6 checks, a step's **schema validation is a stub** — it only confirms the body is valid JSON; full AJV-against-schema inside k6 is a follow-up. Per-step pre/post-response **scripts are not executed** under k6 (only Expect assertions + the schema stub become checks); data is chained between steps via flow **captures** instead.
- Sim summary latency percentiles use reservoir sampling (capped per scenario) for bounded memory on long, high-TPS runs, so p50/p95/p99 are close approximations rather than exact. Per-scenario VU counts in the live view reflect the global k6 VU count.
- APM export covers New Relic's Metric API only (end-of-run summary, not streamed); the key is stored in SecretStorage.
- Flow run history is in-memory per editor session (capped at 50 runs) until you **Save history…** to a `.abh` file; it is not auto-persisted, mirroring the request editor's History.
