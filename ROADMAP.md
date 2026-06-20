# ROADMAP.md

This tracks known gaps and where the project is headed. Items are grouped by area, not by release
— pull from whichever section is most relevant to what's being worked on next. See
[ARCHITECTURE.md](ARCHITECTURE.md) for the "why" behind each gap and [PROJECT.md](PROJECT.md) for
what's deliberately out of scope entirely.

## Known limitations

A deliberate v1 scope, not bugs — each has a corresponding entry below with what's planned to close
the gap.

- Single workspace-wide active environment, not folder-scoped.
- Auth: none/basic/bearer/api-key only. Body: none/json/text/form-urlencoded (no multipart upload).
- No Postman/Bruno/cURL import. No cookie jar.
- Request History and Flow run history are in-memory per editor session only, until explicitly saved.
- A flow step's pre/post-response **scripts are not executed under k6** — only Expect assertions and
  a JSON-parses-only schema stub become checks; data flows between steps via **captures** instead.
- Allure reporting covers flows only (not single-request sends, not the CLI); `.abepic`/`.abfeat`
  are schema-validated text files with no dedicated editor yet.
- APM export covers New Relic's Metric API only, end-of-run summary (not streamed).

## Near-term (most requested / highest leverage)

- **Allure for single-request sends, not just flows.** Today `reportFlowToAllure()` only fires
  from `FlowEditorProvider`; a one-off `.abrq` send via the Send button has an Allure tab full of
  metadata that's never used unless wrapped in a one-step flow. Wire `RequestEditorProvider`'s send
  path to the same reporter.
- **A dedicated editor for `.abepic` / `.abfeat`.** Right now they're schema-validated JSON text
  with no custom editor — you hand-edit the `features`/`stories` name arrays. A lightweight editor
  (or at least "Albert: New Epic/Feature" commands plus inline add/remove buttons) would match the
  experience the request/flow/sim editors already have.
- **Real AJV schema validation inside k6 checks.** `generateFlowScript.ts`'s schema check is
  currently a stub that only confirms the response body parses as JSON. Either port a
  goja-compatible subset of AJV into the generated script, or run the real schema check host-side
  after the k6 run and merge it into the step result.

## Execution engine

- **Run pre/post-response scripts under k6**, not just Expect + schema-stub checks, so flow steps
  get full parity with what a single-request send can do. Likely needs either a goja-compatible
  script runtime or a host-side script pass between k6 iterations (k6 doesn't support that natively
  for a single VU today, so this needs design work, not just a quick patch).
- **Per-scenario VU counts in sim live ticks.** k6 only exposes one global `vus` metric; scenarios
  running at different TPS currently show identical VU numbers. Worth checking whether newer k6
  versions expose per-scenario VU metrics before building a workaround.
- **CLI parity for Allure.** `albert run` never reports to Allure today. A CLI-side `--allure` flag
  (or always-on if the same `albert.allure.*` config is present via env vars or a project-level
  config file) would let CI runs show up in the same report server as editor-driven runs.

## File model / editor ergonomics

- **Folder-scoped or multiple simultaneous active environments**, instead of one workspace-wide
  active `.abenv`. Useful for multi-service repos where different folders target different hosts.
- **Multipart/file-upload body mode.** Body currently supports none/json/text/form-urlencoded only.
- **OAuth2 / client-certificate auth**, beyond today's none/basic/bearer/api-key.
- **Persisted request/flow history**, instead of in-memory-per-editor-session capped lists — would
  need a decision on where it lives (a sidecar file? a workspace-state DB?) without turning into a
  second source of truth alongside the `.abh` save flow that already exists for flows.
- **Postman/Bruno/cURL import** for onboarding existing collections, even as a one-way converter
  script rather than a live sync.

## Reporting / observability

- **Streaming APM export**, not just an end-of-run summary — would let a long-running sim show up
  in New Relic (or another APM) while it's still in progress, matching what the live charts already
  do locally.
- **More APM providers** beyond New Relic's Metric API, if there's demand (Datadog, Prometheus
  remote-write) — `src/apm/index.ts` already dispatches by provider, so this is additive, not a
  rework.

## Deliberately not planned

These came up as "could we" questions but are out of scope per [PROJECT.md](PROJECT.md)'s scope
section, and aren't on this roadmap:

- A hosted backend / team-sync service — the whole point is "it's just files in git."
- Non-HTTP protocol support (gRPC, WebSocket, GraphQL-specific UX).
- A general-purpose, always-on collection-import pipeline (one-shot conversion scripts are fine;
  an ongoing two-way sync with another tool's format is not the goal).
