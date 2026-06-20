# Albert examples

A self-contained showcase of every Albert feature, running against a local **WireMock** mock API so
there are no external dependencies or flaky third-party endpoints.

```
example/
├── Local.abenv              Environment: baseUrl → WireMock, credentials, token, apiKey
├── requests/               One .abrq per request feature
│   ├── 01-list-users.abrq   GET · query param · expectations (status/header/body) · post-response script
│   ├── 02-login.abrq        POST JSON · schema validation · captures token via environment.set()
│   ├── 03-get-user.abrq     Path var · Bearer auth · JSON Schema · expectations · pre/post scripts
│   ├── 04-create-user.abrq  POST JSON · 201 created · expectations
│   └── 05-search.abrq       API-key auth (in query) · expectations
├── flows/                  Compose requests into scenarios (.abf)
│   ├── user-journey.abf     login → get-user → create-user, chaining {{token}}/{{userId}} via captures
│   └── browse.abf           single-step list-users flow
├── sims/
│   └── smoke.abl            Load sim: user-journey @ 5 TPS + browse @ 20 TPS, "load" profile, 30s
└── wiremock/               The mock API (compose + request/response mappings)
```

## 1. Start the mock API (WireMock)

Needs podman or docker. From the repo root:

```bash
podman compose -f example/wiremock/compose.yml up      # or: docker compose -f example/wiremock/compose.yml up
```

It serves `http://localhost:8080` with these endpoints:

| Endpoint                  | Behavior                                                            |
|---------------------------|---------------------------------------------------------------------|
| `POST /login`             | Returns `{ token, expiresIn, user }`                                |
| `GET /users`              | Returns `{ users: [...], total }`                                   |
| `GET /users/{id}`         | `200` with a Bearer token, **`401`** without (auth showcase)        |
| `POST /users`             | `201`, echoes the posted name/email                                 |
| `GET /search?api_key=…`   | `200` only when `api_key=demo-key-789` (API-key showcase)           |

## 2. Run it in VS Code

1. Command Palette → **AKRP/Albert: Select Active Environment** → pick `example/Local.abenv`.
2. Open any `requests/*.abrq` and click **Send** — try the **Preview**, **Expect**, **Schema**,
   **Scripts** (with **Run against sample**), and **Response** tabs.
3. Open `flows/user-journey.abf` → **▶ Run flow**. Watch the login step capture `token`/`userId` and
   the later steps reuse them. **Save history…** to a `.abh` and open it in the viewer.
4. Open `sims/smoke.abl` → see the **Planned load** preview (XY / Sankey / Table), then **▶ Run sim**
   and switch between the live **XY / Sankey / Table** result views.

## 3. Run it from the CLI

```bash
# build the CLI once (repo): npm run compile      (or install it: Albert: Install CLI → `albert …`)
node out/cli.js run example/requests/02-login.abrq   --env example/Local.abenv
node out/cli.js run example/flows/user-journey.abf   --env example/Local.abenv
node out/cli.js run example/sims/smoke.abl           --env example/Local.abenv --serve   # live charts at http://localhost:7070
```

Each run writes an NDJSON `.ablog` next to the target; view any of them later with
`node out/cli.js serve <file>.ablog`.

### Optional: stream sim metrics to Grafana

```bash
node out/cli.js stack up                                                  # InfluxDB 1.8 + Grafana
node out/cli.js run example/sims/smoke.abl --env example/Local.abenv --influx http://localhost:8086/k6
# open http://localhost:3000
```
