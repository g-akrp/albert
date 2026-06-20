---
name: albert-maintenance
description: Maintain and extend the Albert VS Code extension in this repository (C:\Users\akara\akrp) — API testing in plain JSON files (.abrq requests, .abenv environments, .abf k6-powered flows, .abl load sims, .abh run history, .abepic/.abfeat Allure hierarchy), plus a standalone CLI for CI. Use this skill whenever working in this repo on the extension's source (src/**, esbuild.js, package.json contributions), even if the request doesn't name "Albert" — e.g. "add a tab to the flow editor", "the sim chart isn't updating", "fix k6 script generation", "add a field to the request format", "the CLI run command needs a flag", or any change to src/model/types.ts, src/editor/, src/webview/, src/k6/, or src/cli/. This skill exists because this codebase has several non-obvious patterns (host/webview split per editor, mutate vs mutateQuiet, Monaco worker bootstrapping, k6 script generation) that are easy to get wrong by guessing from first principles.
---

# Maintaining Albert

Albert is a VS Code extension, not a web app — read [README.md](../../../README.md) first for the
current file types, features, and CLI usage; it's the source of truth and gets updated as the
extension evolves. This skill captures the *why* behind patterns that aren't obvious from reading
one file in isolation, so you don't accidentally fight the existing design when adding something new.

The extension was previously named "AKRP" with `.akrp.req` / `.akrp.env_config` file extensions —
if you see those names in old commit messages, issues, or stale comments, they refer to the same
project under its current name (`albert`, `.abrq` / `.abenv`).

## Build & verify loop

There is no automated test suite — `pretest` only runs compile + typecheck, there's no test
runner config or `*.test.ts` anywhere. Verification is build + typecheck + (ideally) manual F5
testing:

```
npm run compile      # esbuild one-shot (node esbuild.js) — out/extension.js + all webview bundles + worker bundles
npm run typecheck    # tsc --noEmit -p ./ — esbuild does NOT type-check, always run this too
npm run vsix         # production build + vsce package --out .albert_built/vsix/ — final packaging sanity check
```

Run compile + typecheck before calling any change done; run `vsix` when you want to confirm the
packaged extension actually builds (e.g. before a version bump). `npm run watch` exists for F5
(it's the preLaunchTask in `.vscode/tasks.json`) but isn't needed for a quick compile check. The
`cli` script (`node out/cli.js`) runs the built CLI directly — useful for testing CLI changes
without `npm link`/global install.

You cannot interactively click through any webview yourself. After a change to webview behavior
(request/env/flow/sim editors, history viewer), say so explicitly rather than claiming it works —
ask the user to press F5 and check, the way you would for any UI change you can't screenshot.

## The host/webview split — five editors, same boundary

This extension has two completely separate JS runtimes that only talk via `postMessage`, and there
are now **five** custom editors/viewers built on the same split:

- **Extension host** (`src/extension.ts`, `src/editor/*Provider.ts`, `src/http/`, `src/scripting/`,
  `src/testing/`, `src/activeEnvironment.ts`, `src/k6/`, `src/cli/`, `src/allure/`, `src/apm/`) —
  real Node.js. This is where `fetch()` happens, where variables get resolved, where scripts run in
  a `vm.Context`, where k6 gets invoked. Bundled by esbuild with `platform: 'node'`,
  `external: ['vscode']`.
- **Webview** (`src/webview/**`) — a browser sandbox with no Node APIs and no `vscode` import.
  Bundled as **five separate entry points** in `esbuild.js`: `webview-request.js`, `webview-env.js`,
  `webview-flow.js`, `webview-sim.js`, `webview-history.js` (read-only, no mutate side).

**`src/model/types.ts` is the wire-protocol source of truth.** Each editor has its own
`*HostToWebviewMessage` / `*WebviewToHostMessage` pair (`Request*`, `Env*`, `Flow*`, `Sim*`,
`HistoryViewer*`) — these are the *only* contract between the two sides of that editor.
TypeScript won't catch a mismatch across the `postMessage` boundary the way it would a normal
function call, since both sides just cast `event.data`. When adding a feature that needs new data
flowing between host and webview for a given editor:

1. Add the field/message variant to that editor's message types in `model/types.ts` first.
2. Wire the host side (the matching `*Provider.ts` in `src/editor/`) to send/handle it.
3. Wire the webview side (`src/webview/<editor>/main.ts` for top-level message routing, plus
   whichever store/component needs the data).

Variable substitution and HTTP calls always happen host-side (`src/http/httpClient.ts`). Never
resolve `{{variables}}` or call `fetch` in a webview — webviews only ever receive already-resolved
data (`ResolvedRequestPreview`) or results (`SendResult`/`TestRunResult`/flow & sim run results).
If you're tempted to add fetch/variable/k6-invocation logic inside `src/webview/`, that's a sign
the feature needs a new host-side message instead.

## CustomTextEditorProvider pattern (all five follow this)

`RequestEditorProvider`, `EnvConfigEditorProvider`, `FlowEditorProvider`, `SimEditorProvider`, and
`HistoryViewerProvider` are deliberately separate providers with separate webview bundles —
**don't merge them**, even though their plumbing looks similar. They edit structurally different
file types and keeping them independent means a change to one can't accidentally break another.
(`HistoryViewerProvider` is read-only — it has no save path and doesn't need the echo-loop guard
below.)

The four editable providers follow the same save/sync pattern:
- The on-disk file stays plain JSON text the whole time (not a custom binary format), so undo/
  redo/save/hot-reload/"Open File as Text" all come free from VS Code.
- Webview edits arrive as `{ type: 'edit', file: ... }` and get written back via a
  **full-document-replace** `WorkspaceEdit` (not a minimal diff) — simple, and fine at this file
  size.
- Each provider tracks `selfAppliedText` (a `Map<docKey, text>`) so that when its own
  `WorkspaceEdit` triggers `onDidChangeTextDocument`, it recognizes the change as self-caused and
  skips re-broadcasting a `documentChanged` message back to the webview — otherwise you'd get an
  infinite echo loop. If you add a new way of writing to the document, route it through the
  existing `applyEditFromWebview`-style helper rather than calling `workspace.applyEdit` directly,
  or you'll need to replicate this tracking in your new provider too.

## Webview rendering pattern: `mutate` vs `mutateQuiet`

There's no framework in any webview (no React/Vue) — just plain DOM manipulation rebuilding
subtrees via `innerHTML = ''` + `appendChild`. Every editable store (`src/webview/request/state.ts`,
`src/webview/envconfig/state.ts`, `src/webview/flow/state.ts`, `src/webview/sim/state.ts`) has two
mutation methods, and **picking the wrong one is the easiest mistake to make when adding a new
editable field**:

- **`store.mutate(fn)`** — mutates the file object, schedules the debounced save, AND calls
  `notify()` → triggers a full re-render of the current tab. Use this for *structural* changes:
  adding/removing a row, toggling a checkbox, changing a dropdown — anything where the DOM needs to
  change shape anyway.
- **`store.mutateQuiet(fn)`** — mutates and schedules the save, but does **not** re-render. Use this
  for keystroke-level text input (`oninput` on a text field). If you use `mutate` here instead,
  every keystroke tears down and rebuilds the input element, which steals focus and resets cursor
  position — the field becomes unusable for typing more than one character at a time.

The same logic applies to Monaco editors (`src/webview/components/codeEditor.ts`): the `onChange`
callback wired into `createCodeEditor` should go through `mutateQuiet`, while structural changes
(e.g. switching the Schema tab's enabled checkbox, adding a flow step) go through `mutate`.

When you add a new tab or sub-tab to any editor, look at an existing one of the same shape first —
the pattern to copy is almost always already there (key-value tables, row-editors, Monaco editors,
chart panels in the sim editor's `charts.ts`).

## Monaco editor gotchas

Monaco (full code editor, used for the request editor's Scripts/Schema tabs — not the simple
Headers/Query/Body/Auth inputs) is bundled and wired up in `src/webview/components/monacoSetup.ts`
and `codeEditor.ts`. Two things here are easy to break if touched without understanding why they're
built this way:

1. **Worker loading**: `editor.worker.js`, `json.worker.js`, and `ts.worker.js` are bundled as
   **separate esbuild entry points** (see `esbuild.js`). `MonacoEnvironment.getWorker` cannot do
   `new Worker(webviewResourceUrl)` directly — the webview sandbox treats that as a cross-origin
   Worker load and rejects it. The working fix is to `fetch()` the worker script as text, wrap it
   in a `Blob`, and construct the `Worker` from `URL.createObjectURL(blob)` — see
   `ensureMonacoInitialized` in `monacoSetup.ts`. Don't "simplify" this back to a direct
   `new Worker(url)` call — that's the version that breaks under the webview's CSP, not an
   improvement.
2. **CSP**: the request editor's CSP (`RequestEditorProvider.getHtmlForWebview`) needs
   `'unsafe-eval'` in `script-src` (AJV's schema compiler generates and runs code via
   `new Function(...)` for the client-side Schema-tab linting), `connect-src ${cspSource}` (the
   worker `fetch()` above), and `worker-src ${cspSource} blob:` (the blob-constructed worker). If
   you add another library that does codegen/eval anywhere in a webview, it'll need the same
   allowance in that webview's CSP.

JS semantic validation is **on** (`noSemanticValidation: false` in `monacoSetup.ts`) because the
script globals (`request`, `response`, `environment`, `expect`, `console`) are fully typed via an
ambient `.d.ts` (`SCRIPT_AMBIENT_TYPES`) — real type errors against those interfaces are useful
signal. If you add a new global, type it properly in `SCRIPT_AMBIENT_TYPES` rather than flipping
semantic validation back off, or you'll lose type-checking for everything else too.

## Problems panel: Monaco line/col vs file line/col are not the same axis

`RequestEditorProvider.ts`'s `locateDiagnosticRange()` maps a Monaco diagnostic (line/column within
a script's *decoded* string value, real newlines) back onto a position in the on-disk JSON file.
The trap: `JSON.stringify` escapes embedded newlines, so a multi-line pre/post script's entire
value — however many logical lines it has in Monaco — sits on **one physical line** in the file. A
diagnostic on Monaco line 3 does *not* correspond to "the field's file line + 2"; that line doesn't
exist as a separate file line at all. The fix walks the raw encoded text and decodes escape
sequences one at a time to find the right column on the *same* file line. If you touch this code
again, verify with a multi-line script and a diagnostic past line 1, not just a one-line script —
that's the case a naive line-counting approach silently gets wrong.

## k6 is the execution engine for flows and sims

`src/k6/` owns everything related to actually running a `.abf` flow or `.abl` sim:

- `binary.ts` / `binaryCore.ts` — downloads and caches a pinned k6 release into extension global
  storage on first run; `albert.k6Path` setting overrides this with a user-supplied binary.
- `generateFlowScript.ts` — compiles a `.abf` into a k6 JS script: resolves each step's request,
  wires up captures into k6-scoped variables, replays Expect/schema validations as k6 checks.
- `generateSimScript.ts` — compiles a `.abl` into a k6 JS script: each flow entry becomes its own
  k6 arrival-rate scenario with independent `startTime`, ramp/hold/ramp-down shape, and target TPS
  (`src/model/loadProfile.ts` is the shared load-shape model used both to generate the k6 scenario
  and to render the "planned load" preview before a run, so preview and actual run never drift).
- `runner.ts` / `simRunner.ts` — spawn the generated script via the k6 binary, stream progress back
  (per-step status for flows; live metrics for sims) to the editor while it runs.
- `resolveTargets.ts` — resolves `.abrq`/`.abf` references across the workspace.

If a flow or sim run looks wrong, check the generated k6 script logic in `generateFlowScript.ts` /
`generateSimScript.ts` before assuming the editor or webview is at fault — a lot of behavior (capture
ordering, check semantics, scenario timing) is decided at script-generation time, not at render time.

## The CLI is a separate execution path, not a thin wrapper

`src/cli/` (entry point `src/cli/index.ts`, built to `out/cli.js`, exposed as the `albert run|serve|stack`
commands) runs requests/flows/sims **outside VS Code** — no extension host, no webview. It shares
`src/k6/` and `src/http/` with the extension but has its own `runCommand.ts` (resolves `--env`,
streams to InfluxDB via `--influx`, optionally serves live results via `--serve`/`--port`),
`serveCommand.ts` (serves a saved `.ablog` result file in the browser via `src/cli/web/main.ts`),
and `stackCommand.ts` (starts/stops the Grafana+InfluxDB docker/podman compose stack via
`src/commands/startComposeStack.ts`'s shared logic). `ablog.ts`/`ablogTypes.ts` define the
`.ablog` result-log format the CLI writes and `serve` reads back — if you change what a run
produces, check whether `.ablog`'s shape needs to follow.

Because the CLI doesn't report to Allure (only flow runs from inside the extension do — see
below), don't assume CLI and in-editor runs are interchangeable when working on reporting-related
features.

## Allure reporting and New Relic export are flow-run-only

- **Allure** (`src/allure/allureReporter.ts`): only **flow** runs (`.abf`, triggered from the Flow
  editor's "▶ Run flow") get reported — not individual `.abrq` sends via the Send button, and not
  CLI runs. Each `.abrq`'s Allure tab (description, severity, epic/feature/story picker, suite,
  owner, tags) is aggregated per-step when a flow runs; the reporter attaches each step's
  request/response as result attachments and its checks as nested steps, then POSTs to the Allure
  server's `send-results` endpoint. The epic/feature/story picker reads `.abepic`/`.abfeat` files
  (schema-validated JSON, no custom editor) — if you add a new Allure metadata field, it needs to
  flow through both the `.abrq` schema and `allureReporter.ts`'s aggregation step.
- **New Relic** (`src/apm/newrelic.ts`, dispatched via `src/apm/index.ts`): only **sim** runs
  (`.abl`) can export — per-flow metrics (achieved TPS, error rate, latency percentiles, request
  counts, check pass-rate) POST to New Relic's Metric API after the run, gated on a SecretStorage
  API key (never stored in the `.abl` file). Runs work fine without a key; export is just skipped.

## cURL import

`src/commands/newRequestFromCurl.ts` + `src/model/curlParser.ts` implement a best-effort cURL
command parser (handles `-X`, `-H`, `-d`, `-u`, `-b`, `-A`, `-e`, `-G`, etc.) that creates a new
`.abrq` file from a pasted cURL command. It's intentionally best-effort, not a full shell-quoting
parser — if you extend it, prefer adding a new recognized flag over trying to generalize the
tokenizer.

## When you genuinely need to change a wire protocol or file format

Changing any `*File` shape in `model/types.ts` (`RequestFile`, `EnvConfigFile`, `FlowFile`,
`SimFile`, `HistoryFile`) means updating the matching JSON Schema by hand too — `schemas/*.schema.json`
(used for `jsonValidation` IntelliSense when a file is opened as text) is **not** auto-derived from
the TS types and will silently drift if you forget one side. Check `package.json`'s
`jsonValidation` contributions to confirm the schema is actually registered for the file's
extension.

## Don't silently "fix" these without confirming first

These look like gaps but are deliberate scope cuts, not oversights:

- Active environment is **workspace-wide**, not folder-scoped, and one flat variable list per
  `.abenv` file (no multi-environment-per-file switcher).
- Auth is none/basic/bearer/api-key only; body is none/json/text/form-urlencoded only (no
  multipart).
- No Postman/Bruno import (cURL import exists — see above), no cookie jar, no folder-level shared
  headers.
- The request editor's **History** tab is in-memory per webview session only, capped, not
  persisted to disk, not part of the `.abrq` file format. (This is distinct from `.abh` flow-run
  history, which *is* a persisted file format with its own viewer.)
- Script linting intentionally checks JS syntax errors, unknown `{{variable}}` references, and
  invalid AJV schema JSON — it does **not** validate usage of the `request`/`response`/`environment`
  script globals themselves (e.g. a typo'd `environment.get`). This was an explicit choice, not an
  oversight.
- The CLI does not report to Allure (see above) — this is intentional, not a missing feature.

If a task seems to require changing one of these, treat it as a design decision worth confirming
with the user first.
