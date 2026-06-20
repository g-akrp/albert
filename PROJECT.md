# PROJECT.md

## What this is

Albert is a VS Code extension for API testing. It replaces a Postman/Insomnia-style proprietary
collection with plain JSON files that live in the repo next to the code they test: one file per
request, one per environment, one per multi-step flow, one per load profile. Everything is
diffable, reviewable in a PR, and editable as text even without the extension installed.

The extension wraps those files in purpose-built custom editors (rich forms, not raw JSON editing),
and an `albert` CLI runs the same files headlessly for CI.

## Why it exists

Team-shared API collections in tools like Postman live outside version control (or behind a paid
sync feature), drift from the code they test, and can't be reviewed in a pull request. Albert's bet
is that if a request, a flow, and a load profile are each just a JSON file:

- they go through the same review process as the code they exercise
- "the collection" is just whatever's in the folder — no export/import step, no separate app
- a CI pipeline can run exactly the same file a developer just clicked "Send" on, via the CLI

## Who it's for

A single developer or small team working inside VS Code who wants request/flow/load testing
checked into the same repo as the service under test, without standing up a separate API platform
or account. It assumes comfort with JSON and JavaScript (for scripts/assertions) — it is not aimed
at non-technical QA users driving a no-code tool.

## Scope

In scope:
- Composing and sending individual HTTP requests with variable substitution, auth, and scripting.
- Declarative + scripted response validation (Expect rules, AJV schema, Jest-style `expect()`).
- Chaining requests into flows with data captured forward between steps.
- Driving flows at controlled throughput as load/stress simulations via k6.
- Reporting flow runs to an Allure server, with epic/feature/story metadata.
- Running all of the above headlessly via a CLI, with NDJSON result logs and a local viewer.
- Optional metrics export (New Relic; bundled InfluxDB/Grafana stack for local use).

Explicitly out of scope (see [ROADMAP.md](ROADMAP.md) for what might change this):
- A hosted/team-sync backend — collaboration model is "it's in git."
- A general-purpose collection-import tool (Postman/Bruno/cURL).
- Non-HTTP protocols (gRPC, WebSocket, GraphQL-specific tooling beyond plain HTTP).

## Current status

Functionally complete for its core loop (compose → validate → chain into flows → load-test →
report) across two parallel runtimes (VS Code custom editors + a standalone CLI). Actively
maintained: an autonomous maintenance loop and human-directed sessions both land fixes/features
directly on top of the existing architecture rather than redesigning it. See
[ROADMAP.md](ROADMAP.md) for open gaps and [ARCHITECTURE.md](ARCHITECTURE.md) for how it's built.

Versioning is currently pre-1.0 (`0.4.x` in `package.json`); no published-marketplace stability
guarantees yet — file formats have an `albertVersion` field reserved for future migrations, but no
breaking migration has shipped.

## Key decisions and why

- **Plain JSON on disk, custom editor on top** (`CustomTextEditorProvider`, not a virtual
  document) — so undo/redo/save/diff/"Open as Text" all come from VS Code for free, and nothing is
  lost if the extension is disabled.
- **k6 as the execution engine for flows/sims**, not a hand-rolled runner — gets a mature
  load-generation engine (arrival-rate scenarios, VU scheduling) for free, at the cost of: scripts
  don't execute inside k6 (goja has no Node APIs), and schema validation inside a k6 check is
  currently a stub (see [ARCHITECTURE.md](ARCHITECTURE.md)).
- **Variable substitution and `fetch()` always happen in the extension host**, never in the
  webview — keeps secrets and real network access out of the webview's browser sandbox.
- **No collection file** — a folder is a collection. Removes an entire class of "import/export your
  collection" features and bugs, at the cost of no folder-level shared headers/auth yet.
