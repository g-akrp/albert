# ARCHITECTURE.md

## Two runtimes, one wire protocol

Every custom editor in Albert is a `CustomTextEditorProvider`: the on-disk file stays plain JSON
text the whole time, so undo/redo/save/hot-reload and "Open as Text" all come for free from VS
Code, and the same document gets JSON Schema validation when viewed as plain text.

The webview (browser sandbox) and the extension host (Node.js) are two different JS runtimes
joined only by `postMessage`. **`src/model/types.ts` is the single source of truth for that wire
protocol** — one `*HostToWebviewMessage` / `*WebviewToHostMessage` union pair per editor (request,
env-config, flow, sim, history). Change a message shape there first, then fix the two sides that
break.

Variable substitution and the actual `fetch()` call always happen in the **extension host**
(`http/httpClient.ts`), never in the webview — the webview only ever sees already-resolved display
data (`ResolvedRequestPreview`) or results (`SendResult`/`TestRunResult`). Scripts run in the host
too, via a Node `vm.Context` (`scripting/sandbox.ts`), not in the webview's Monaco editor.

## Directory map

```
src/
├── extension.ts                  activate(): registers custom editors, commands, status bar, format-on-save
├── activeEnvironment.ts          workspace-wide "which env_config is active" singleton (persisted in workspaceState)
├── statusBar.ts                  the "Env: <name>" status bar item
├── formatOnSave.ts               reformats a JSON request body on save (onWillSaveTextDocument)
├── model/
│   ├── types.ts                  shared TS types + every webview<->host message protocol (source of truth)
│   ├── parse.ts                  tryParse*File() helpers shared by editors + CLI
│   └── loadProfile.ts            sim load-profile math (planned-load preview + generateSimScript share this)
├── commands/                     newRequestFile, newEnvConfigFile, newFlowFile, newSimFile, selectActiveEnvironment, installCli
├── editor/
│   ├── RequestEditorProvider.ts  CustomTextEditorProvider for *.abrq; orchestrates send/sample-run/Allure-picker pipeline
│   ├── EnvConfigEditorProvider.ts CustomTextEditorProvider for *.abenv
│   ├── FlowEditorProvider.ts     CustomTextEditorProvider for *.abf; loads step requests, generates+runs k6, saves .abh, reports to Allure
│   ├── SimEditorProvider.ts      CustomTextEditorProvider for *.abl; one k6 scenario per flow, live ticks + summary, APM export
│   └── HistoryViewerProvider.ts  read-only CustomTextEditorProvider for *.abh (saved flow run history)
├── k6/
│   ├── binaryCore.ts             ensureK6At(): vscode-free k6 download/extract/cache (shared by extension + CLI)
│   ├── binary.ts                 ensureK6(): extension wrapper over binaryCore (albert.k6Path override, progress, global storage)
│   ├── resolveTargets.ts         Node-fs loaders: resolve a .abf/.abl and the files it references (for the CLI)
│   ├── generateFlowScript.ts     emits a self-contained k6 script from a flow (env vars resolved host-side)
│   ├── generateSimScript.ts      emits a multi-scenario k6 script (arrival-rate per flow) for load/stress (uses model/loadProfile)
│   ├── runner.ts                 spawns k6 (1 VU/1 iter), parses per-step __albert_step lines, streams results
│   └── simRunner.ts              spawns k6 --out json, polls it for live per-scenario ticks, builds per-flow summary
├── allure/
│   └── allureReporter.ts         reportFlowToAllure(): aggregates a flow result + per-step Allure metadata, POSTs to an Allure server
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
├── cli/
│   ├── index.ts                  arg parsing + dispatch (run/serve/stack), --help text
│   ├── runCommand.ts             loads/resolves a .abrq/.abf/.abl with resolveTargets.ts, runs it, writes an .ablog
│   ├── ablog.ts / ablogTypes.ts  NDJSON result-log writer/types shared by run and serve
│   ├── serveCommand.ts           starts the localhost viewer server for an .ablog
│   ├── stackCommand.ts           up/down for the bundled InfluxDB+Grafana podman/docker-compose stack
│   └── web/main.ts               browser-side script for the serve viewer (reuses sim chart rendering)
└── webview/
    ├── vscodeApi.ts, styles.ts, format.ts   shared webview utilities
    ├── components/                          shared UI pieces (KeyValueTable, QueryTable, TestResults, CodeBlock,
    │                                         ResolvedRequestBlocks, flowResults.ts, Monaco setup/wrapper)
    ├── lint/                                client-side lint helpers (unknown {{var}}, AJV schema, sample-key extraction)
    ├── request/                             the .abrq editor's webview (state.ts, Tabs.ts, ResponseTab.ts, HistoryTab.ts, resultMarkdown.ts, main.ts)
    ├── envconfig/                           the .abenv editor's webview (state.ts, main.ts)
    ├── flow/                                the .abf editor's webview (state.ts, FlowEditor.ts, main.ts)
    ├── sim/                                 the .abl editor's webview (state.ts, SimEditor.ts, charts.ts, main.ts)
    └── history/                             the .abh read-only viewer's webview (main.ts; shares components/flowResults.ts)
```

`*.abepic` / `*.abfeat` have no provider/webview of their own — they're plain JSON validated by
`schemas/epic.schema.json` / `schemas/feature.schema.json` via `jsonValidation` in `package.json`.
The request editor's Allure tab reads them directly off disk (`RequestEditorProvider.resolveAllureStories()`)
to populate its epic → feature → story pickers.

## Flows: how a `.abf` actually runs

`FlowEditorProvider.handleRunFlow()` orchestrates: `loadRequestFile()` reads each enabled step's
`.abrq` (workspace-relative `requestPath`), `generateFlowScript()` turns the resolved steps into a
self-contained k6 script (env `{{vars}}` resolved host-side; **capture** variables stay as
`{{name}}` placeholders resolved at runtime by an embedded `interp()` regex helper, since k6's goja
runtime has no access to the env_config or the host's variable-substitution code). `runner.ts`
spawns k6 `--vus 1 --iterations 1` and parses `__albert_step <json>` lines the script emits after
each step so the UI fills in live. Per-step **validate** replays that request's Expect assertions
(and a schema stub — see Known limitations) as k6 `check()`s. On completion,
`reportFlowToAllure()` fires (fire-and-forget) if `albert.allure.enabled` is on.

## Sims: how a `.abl` actually runs

`SimEditorProvider` resolves each enabled flow entry's steps (same `loadRequestFile`/`loadFlowFile`
pattern as Flows), assigns each a sanitized scenario key (`scenarioKey()` — `s_` + non-alnum chars
replaced with `_`, since the key doubles as the generated exec function name and must be a valid JS
identifier), and calls `generateSimScript()` to emit one `ramping-arrival-rate`/`constant-arrival-rate`
k6 scenario per flow (`buildExecutor()` maps `SimProfile.type` to stage shapes — spike has a brief
baseline/fast-ramp/short-hold/quick-drop, stress ramps past target then back down).
`simRunner.ts` spawns k6 with `--out json=<file>`, polls that file once a second (`SimAggregator`)
to emit `simTick` messages the webview renders as live SVG line charts (`webview/sim/charts.ts` —
no charting library), and on exit builds a final summary with reservoir-sampled latency percentiles
(capped at 100k samples/scenario, bounded memory on long high-TPS runs). `stop()` sets a
`stoppedByUser` flag so an early manual stop (no requests recorded yet) resolves as an empty
success, not a misleading "k6 exited with code null" error.

## Allure reporting

`allure/allureReporter.ts`'s `reportFlowToAllure(flowName, flowFilePath, result)` reads the
`albert.allure.*` settings; if disabled or no `serverUrl`, it's a no-op. Otherwise it builds one
Allure result per the run (UUID, history ID hashed from the flow's file path, mock timing derived
from cumulative step durations), attaches each step's request/response, nests each step's checks as
Allure steps, and aggregates the per-step `AllureReportConfig` (suite/severity/feature/story/owner/tags,
taking the highest severity present) into the result's labels. It POSTs to
`{serverUrl}/allure-docker-service/send-results?project_id={projectId}` with optional Basic Auth.
This only fires from a flow run (`FlowEditorProvider`) — single-request sends and the CLI do not
call it. The Flow editor's header shows a live `Allure: Enabled/Disabled` status pill
(`FlowEditor.ts`) sourced from an `allureEnabled` field on the `init` message and an
`allureEnabledChanged` message pushed via `vscode.workspace.onDidChangeConfiguration`, so the UI
never lies about whether a run will be reported.

## k6 binary management

k6 is never bundled. `k6/binaryCore.ts`'s `ensureK6At()` is the vscode-free core (download a pinned
release, extract, cache) shared by both the extension (`k6/binary.ts`'s `ensureK6()`, which adds
`albert.k6Path` override + a VS Code progress notification + extension global storage as the cache
dir) and the CLI (`cli/runCommand.ts`, which uses a CLI-appropriate cache dir and `--k6`/`ALBERT_K6_PATH`
overrides). First run downloads ~10-20MB from `github.com`/`objects.githubusercontent.com`.

## Monaco editor integration

Monaco (full code editor with autocomplete/lint) is used only for the Body, Scripts, Schema, and
Sample tabs' text editors — a separate concern from VS Code's own editor (see
`webview/components/monacoSetup.ts` and `codeEditor.ts`). Worker scripts (`editor.worker.js`,
`json.worker.js`, `ts.worker.js`) are bundled as their own esbuild entry points.
`MonacoEnvironment.getWorker` cannot construct `new Worker(webviewResourceUrl)` directly — the
webview sandbox rejects cross-origin Worker scripts that way — so it `fetch()`es the worker source
as text, wraps it in a `Blob`, and constructs the `Worker` from `URL.createObjectURL(blob)` instead.
This needs `connect-src ${cspSource}` in the CSP for the fetch and `worker-src ${cspSource} blob:`
for the resulting blob worker.

### Diagnostics pipeline (Problems panel)

1. `lintScript()` — JavaScript syntax check via `new Function(text)` (syntax errors only, not runtime).
2. `lintScriptVariables()` — unknown `environment.get('X')` calls → warning markers.
3. `lintJsonBody()` / schema lint — `JSON.parse` / AJV-schema-shape validation → error markers.
4. Monaco markers → `collectScriptDiagnostics()` → `postMessage` → host `DiagnosticCollection` →
   Problems panel.

Field-to-JSON-path mapping (`SCRIPT_FIELD_PATHS`) is resolved via `jsonc-parser`'s `parseTree` +
`findNodeAtLocation` (AST-based, not text search, so a field name appearing as substring text
elsewhere in the file can't cause a wrong-position match). The line/column mapping itself
(`locateDiagnosticRange()`) walks the raw encoded JSON text to correctly handle multi-line scripts
(which `JSON.stringify` collapses onto a single physical file line) and escaped characters. Tabs
with an active diagnostic show a ⚠ badge in the tab bar so a problem is visible without opening
every tab.

### Scripting sandbox globals

- `request` — `{ method, url, headers, body? }`
- `response` — `{ body, status, statusText, headers, json() }`
- `environment` — `{ get(name), set(name, value) }`
- `console` — `{ log(...) }`
- `expect(actual)` — Jest-compatible matchers (`toBe`, `toEqual`, `toContain`, `toThrow`,
  `toHaveLength`, `toHaveProperty`, `.not`, etc.), via the standalone `expect` package (not
  `@jest/expect`, to avoid a babel dependency chain). Matchers are wrapped in a `Proxy` to record
  pass/fail without throwing, and only support the `.not` modifier (no `.resolves`/`.rejects` —
  scripts run synchronously via `vm.runInContext`).

## Known architectural gaps

See [ROADMAP.md](ROADMAP.md) for the prioritized list. The two with the widest blast radius if
changed later:

- A flow step's pre/post-response **scripts do not execute under k6** (goja has no Node APIs) —
  only Expect assertions and a JSON-parses-only schema stub become k6 checks. Closing this fully
  would mean either porting the sandbox to goja-compatible JS or running scripts host-side and
  feeding k6 only the resulting assertions.
- Sim per-scenario VU counts in the live view all reflect k6's single global `vus` metric (k6
  doesn't tag it per scenario), so concurrent flows at different TPS show identical VU numbers in
  their tick rows even though k6 allocates VUs per scenario internally.
