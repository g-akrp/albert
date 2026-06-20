---
name: api-testing-with-albert
description: Use when asked to write, edit, or run API tests for some service using Albert's file formats — creating .abrq request files, chaining them into .abf flows, driving load with .abl sims, or running any of those via the `albert` CLI. Triggers include "add an API test for X", "write a request/flow/sim file", "test this endpoint with Albert", or seeing .abrq/.abf/.abl/.abenv files in a repo.
---

# API testing with Albert

Albert tests are plain JSON files, not code — one file per request (`.abrq`), one per chained
multi-step flow (`.abf`), one per load profile (`.abl`), one per environment (`.abenv`). Read an
existing file of the same kind in the repo first and copy its shape; the schemas in `schemas/*.json`
are the ground truth if none exists yet.

## Request file (`.abrq`)

```json
{
  "albertType": "request",
  "albertVersion": 1,
  "name": "Login",
  "request": {
    "method": "POST",
    "endpoint": "{{baseUrl}}",
    "path": "/login",
    "headers": [],
    "query": [],
    "body": { "mode": "json", "content": "{\n  \"username\": \"{{username}}\"\n}" },
    "auth": { "type": "none" }
  },
  "scripts": {
    "preRequest": "",
    "postResponse": "const body = response.json();\nexpect(body.token).toBeTruthy();\nenvironment.set('token', body.token);\n"
  },
  "expectations": [
    { "id": "e_status", "target": "status", "operator": "equals", "expected": "200" },
    { "id": "e_token", "target": "body", "path": "token", "operator": "exists", "expected": "" }
  ],
  "schemaValidation": { "enabled": false, "schema": "" }
}
```

- `method`: `GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS`. `body.mode`: `none|json|text|form-urlencoded`.
  `auth.type`: `none|basic|bearer|api-key` (matching `auth.basic`/`auth.bearer`/`auth.apiKey` object).
- `{{variable}}` substitution happens against the active `.abenv` (or `--env` on the CLI) — never
  hardcode secrets, reference a variable instead.
- `scripts.postResponse` runs after the response, with `request`/`response`/`environment`/`expect`/
  `console` globals available; use `environment.set(name, value)` to capture a value for later steps,
  and `expect(...).toBe(...)`/`.toBeTruthy()` for assertions beyond the declarative `expectations` list.
- `expectations[].target`: `status|header|body`. `path` is the header name (for `header`) or a
  dot/bracket JSON path (for `body`, e.g. `user.id`). `operator`:
  `equals|notEquals|contains|exists|matches|greaterThan|lessThan`.
- `schemaValidation.schema` is a JSON Schema string (escaped), validated against the response body
  when `enabled: true`.
- Importing from curl: there's a "New Request from cURL" path (`src/model/curlParser.ts`) — if asked
  to convert a curl command, build the `request` object via the same fields above rather than writing
  a one-off parser.

## Flow file (`.abf`) — chaining requests

```json
{
  "albertType": "flow",
  "albertVersion": 1,
  "name": "User journey",
  "steps": [
    {
      "id": "s_login",
      "name": "Login",
      "requestPath": "../requests/02-login.abrq",
      "enabled": true,
      "validate": true,
      "captures": [{ "variable": "token", "source": "body", "path": "token" }]
    }
  ]
}
```

`requestPath` is relative to the `.abf` file. `captures` pulls a value out of one step's response
(`source: "body"` + dot path) into a variable later steps' `{{variable}}` substitution can use —
this is how a login step's token reaches a later authenticated step. Set `validate: false` on a step
only if you deliberately want it to run without failing the flow on assertion errors.

## Sim file (`.abl`) — load/stress testing

```json
{
  "albertType": "sim",
  "albertVersion": 1,
  "name": "Smoke load",
  "flows": [
    {
      "id": "f_journey",
      "flowPath": "../flows/user-journey.abf",
      "targetTps": 5,
      "profile": { "rampUpSec": 5, "holdSec": 20, "rampDownSec": 5 },
      "startAtSec": 0,
      "enabled": true
    }
  ]
}
```

Each entry drives one flow at a target transactions-per-second with a ramp-up/hold/ramp-down profile,
optionally staggered with `startAtSec`. Multiple flows can run concurrently in one sim. Sims execute
via k6 under the hood (arrival-rate scenarios), so scripts inside a flow run goja-side without Node
APIs — keep `preRequest`/`postResponse` scripts portable JS, no `require`/Node built-ins.

## Running tests

In VS Code: open the file in its custom editor and use the Send/Run action. Headlessly (CI or
terminal): `albert run <file.abrq|.abf|.abl> --env <file.abenv>` — writes an NDJSON `.ablog` result
log; add `--serve` to view it in a local browser viewer immediately after the run. See
[CLI.md](../../../CLI.md) for the full command reference (`run`/`serve`/`stack`).

## Common mistakes

- Forgetting `requestPath`/`flowPath` are relative to the referencing file, not the repo root.
- Hardcoding a value that should be `{{variable}}`-substituted from an `.abenv` file or captured
  from an earlier flow step.
- Writing Node-specific JS (`require`, `fs`, etc.) into scripts that will run inside a `.abl` sim —
  those execute in k6/goja, not Node.
- Adding fields not present in `schemas/request.schema.json` / `flow.schema.json` / `sim.schema.json`
  — check the schema when unsure of a field name or enum value.
