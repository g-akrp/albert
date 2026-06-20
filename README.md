# Albert

A VS Code extension for API testing, built around plain-JSON file formats that live in your repo
next to the code they test — no proprietary collection format, no separate server, no account.
## File types

| Extension | What it is |
|---|---|
| `*.abrq` | One HTTP request — method, endpoint/path, headers, query, body, auth, pre/post-response scripts, declarative assertions, an AJV JSON Schema, a pasted sample response, and Allure report metadata. |
| `*.abenv` | A named set of `{{variables}}` plus per-environment settings (timeout, follow-redirects). |
| `*.abf` | An ordered **flow**: a sequence of steps, each referencing a `.abrq` file, run end-to-end via [k6](https://k6.io/). Each step can replay its request's validations as checks and **capture** values forward into `{{variables}}` for later steps. |
| `*.abl` | A load/stress **simulation**: one or more flows, each at its own target TPS, combined into a single k6 run. Results render live as charts, with an optional New Relic export. |
| `*.abh` | A saved **flow run history** — one or more past flow runs with full per-step detail — opened in a read-only viewer. |
| `*.abepic` | An Allure **epic**: a name plus a list of feature names. Schema-validated JSON text, no custom editor. |
| `*.abfeat` | An Allure **feature**: a name, a path back to its `.abepic`, and a list of story names. Schema-validated JSON text, no custom editor. |

There is no collection file. A "collection" is just a folder of `.abrq` / `.abenv` files — VS Code's
own Explorer is the browser. Every file type is plain JSON, so they diff cleanly in git and stay
readable even outside the extension (open any of them as text and you still get JSON Schema
autocomplete/validation from VS Code's built-in JSON language service, via the editor-title
**Open File as Text** button).

## Getting started

1. Right-click a folder → **Albert: New Environment Config**, add variables (e.g. `baseUrl`).
2. Command Palette → **Albert: Select Active Environment** and pick that file. The status bar shows
   `Env: <name>` and is clickable to switch.
3. Right-click a folder → **Albert: New API Request File**. This opens a custom editor with three
   tab groups:
   - **Compose Request** — Headers, Query, Body (Monaco editor, JSON Prettify + format-on-save),
     Auth, and **Preview** (the request with `{{variables}}` resolved, without sending — with a
     **Copy as cURL** button).
   - **Validate Response** — Expect (no-code assertions on status/header/body), Schema (AJV JSON
     Schema against the response body), Scripts (pre-request/post-response JS with
     `request`/`response`/`environment` globals + Jest-style `expect()`), Sample (a pasted sample
     response so you can write and run tests with **Run against sample** before a live endpoint
     exists), Response (the live result: Body with **Copy body**, Headers, Tests, Request
     sub-tabs), and Allure (report metadata — see below).
   - **History** — every live send this session (request + response + test results), expandable,
     not persisted to disk. A **Save result as Markdown** action turns the latest result into a
     shareable `.md` snippet.
   Tabs with a validation problem (bad JSON, invalid schema, broken regex) show a ⚠ warning badge
   so you don't have to open every tab to find what's wrong.
4. Click **Send**. While a request is in flight the button becomes **Cancel** (flows and sims have
   the same Stop/Cancel control while running).

### Flows

Right-click a folder → **Albert: New API Flow** to create a `.abf`. Add steps, pick a `.abrq`
request for each, optionally toggle **validate** (runs that request's Expect assertions + schema as
k6 checks) and add **captures** (pull a value from a step's response body/header/status into a
flow-scoped `{{variable}}` usable by later steps). Click **▶ Run flow** to execute the whole flow
once via k6 (1 VU / 1 iteration); per-step status, timing, validation checks, and a response-body
preview stream into the results panel as the run progresses. Step result cards can expand to show
request headers/auth/body and response headers/body, and surface that step's Allure metadata
(epic/feature/story/suite/severity/owner/tags/description) as a badge with a tooltip.

Each run is added to a **Run history** list at the bottom of the flow editor (most recent first,
kept per editor session, outlined as bordered cards consistent with the `.abh` viewer). Expand any
entry to see that run's per-step detail. Click **Save history…** to write the runs to a `*.abh`
file; opening that file uses a read-only **history viewer** that renders the same per-step results
— handy for archiving a run or sharing it alongside the repo.

k6 is the execution engine for flows (and sims). On first run Albert downloads and caches a pinned
k6 release into its global storage automatically — no manual install. To use your own k6 binary
instead, set the **`albert.k6Path`** setting to its path.

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

Before you run anything, the same view switcher also shows a **Planned load (preview)** panel
computed from the profile + per-flow target TPS — the **XY** view plots the arrival-rate curve each
flow will follow over time (ramp/hold/spike shape), the **Sankey** shows how the planned request
volume splits across flows, and the **Table** lists planned requests per flow. The preview is
derived from the same load model the k6 scenarios are generated from (`src/model/loadProfile.ts`),
so what you preview is what runs.

**New Relic export (optional):** tick "Send results to New Relic", choose the region (US/EU), and set
your Metric API key (the in-editor button, or **Albert: Set New Relic API Key** — stored in VS Code
SecretStorage, never in the `.abl` file). After each run Albert POSTs per-flow metrics (achieved TPS,
error rate, latency percentiles, request counts, check pass-rate) to New Relic's Metric API. Runs work
fine without a key — the export is simply skipped.

### Allure reporting

Albert can report **flow** runs to an [Allure report server](https://github.com/fescobar/allure-docker-service)
(it does not report individual requests sent via the Send button, and the CLI does not report to
Allure). Turn it on in settings:

| Setting | Purpose |
|---|---|
| `albert.allure.enabled` | Master on/off switch. |
| `albert.allure.serverUrl` | e.g. `http://localhost:5050`. |
| `albert.allure.projectId` | Project ID on the server (default `default`). |
| `albert.allure.username` / `albert.allure.password` | Optional Basic Auth. |

The Flow editor's header shows a live **Allure: Enabled/Disabled** status pill so you always know
whether a run will be reported, without checking settings — it updates immediately if you flip the
setting while the editor is open.

Each `.abrq` request has an **Allure** tab to set its report metadata: description, severity
(blocker/critical/normal/minor/trivial), an epic/feature/story picker (pick a `.abepic` file, then a
`.abfeat` it lists, then one of that feature's stories), suite, owner, and tags. When a flow runs,
Albert aggregates each step's metadata, attaches that step's request/response as result
attachments and its checks as nested steps, and POSTs the run to the Allure server's
`send-results` endpoint — no extra setup beyond pointing the settings at a running server.

## `albert` CLI

Run the same tests outside VS Code (CI, a terminal, a headless box). Install it from the editor with
**Albert: Install CLI** (runs `npm install -g "<extension>"`, needs npm on PATH), or use `node
out/cli.js` from the repo.

```
albert run <file.abrq|.abf|.abl> [--env e.abenv] [--ablog out.ablog] [--influx URL] [--serve [--port N]] [--k6 path]
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

The CLI does not currently send Allure reports or read `.abepic`/`.abfeat` files — those are
VS-Code-editor-side features (see [ROADMAP.md](ROADMAP.md)).

## Build

```
npm install
npm run compile     # one-shot build (esbuild): out/extension.js, webview bundles, worker bundles, out/cli.js
npm run typecheck   # tsc --noEmit, esbuild does not type-check
npm run watch       # used by .vscode/tasks.json as the F5 preLaunchTask
npm run vsix        # production build + vsce package, output to .albert_built/vsix/
```

Press **F5** in this folder to launch the Extension Development Host.

## Known limitations

A deliberate v1 scope, not bugs — see [ROADMAP.md](ROADMAP.md) for the fuller list and what's
planned to close each gap.

- Single workspace-wide active environment, not folder-scoped.
- Auth: none/basic/bearer/api-key only. Body: none/json/text/form-urlencoded (no multipart upload).
- No Postman/Bruno/cURL import. No cookie jar.
- Request History and Flow run history are in-memory per editor session only, until explicitly saved.
- A flow step's pre/post-response **scripts are not executed under k6** — only Expect assertions and
  a JSON-parses-only schema stub become checks; data flows between steps via **captures** instead.
- Allure reporting covers flows only (not single-request sends, not the CLI); `.abepic`/`.abfeat`
  are schema-validated text files with no dedicated editor yet.
- APM export covers New Relic's Metric API only, end-of-run summary (not streamed).
