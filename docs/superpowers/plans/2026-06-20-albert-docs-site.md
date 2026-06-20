# albert-docs Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Docusaurus documentation site in `C:\Users\akara\albert-docs`, with user-facing content adapted from the `albert` extension's README/CLI.md, ready to deploy to GitHub Pages at `https://g-akrp.github.io/albert-docs/`.

**Architecture:** Docusaurus `classic` template (JavaScript variant, no TypeScript). Content lives as Markdown under `docs/`, manual sidebar ordering via `sidebars.js`, deploy via a GitHub Actions workflow that builds and publishes `build/` to the `gh-pages` branch.

**Tech Stack:** Docusaurus 3.x (classic preset), Node.js, npm, GitHub Actions (`peaceiris/actions-gh-pages@v4`).

## Global Constraints

- Working directory for all tasks: `C:\Users\akara\albert-docs` (separate repo from `akrp`/`albert`).
- `organizationName: g-akrp`, `projectName: albert-docs`, `url: https://g-akrp.github.io`, `baseUrl: /albert-docs/` — exact values, must match for asset paths to resolve once deployed.
- Content scope is **user-facing only**: adapt `README.md` and `CLI.md` from `C:\Users\akara\akrp`. Do NOT port `ARCHITECTURE.md`, `PROJECT.md`, `BUILD.md`, `ROADMAP.md`.
- Keep the Docusaurus blog plugin (default scaffold) — do not strip it.
- Do not push to GitHub or create the remote repo in this plan — local commits only, per the approved spec.
- No unit-test framework applies to a static docs site; "tests" in this plan mean `npm run build` succeeding (Docusaurus fails the build on broken internal links/anchors by default) plus a grep check that expected content landed.

---

### Task 1: Scaffold the Docusaurus project

**Files:**
- Create: entire `C:\Users\akara\albert-docs` tree via the Docusaurus classic template (JS variant) — `docusaurus.config.js`, `sidebars.js`, `package.json`, `src/`, `docs/`, `blog/`, `static/`.

**Interfaces:**
- Produces: a working `npm run build` and `npm start` in `C:\Users\akara\albert-docs`, with default template docs at `docs/intro.md` etc. (replaced in Task 3).

- [ ] **Step 1: Run the scaffold command**

```bash
cd "C:\Users\akara\albert-docs"
npx create-docusaurus@latest . classic
```

When prompted, accept the default (JavaScript, not TypeScript) variant. This also runs `npm install` and `git init` with an initial commit automatically.

- [ ] **Step 2: Verify the scaffold builds**

```bash
cd "C:\Users\akara\albert-docs"
npm run build
```

Expected: build succeeds, prints `Use \`npm run serve\` command to test your build locally.`

- [ ] **Step 3: Verify git state**

```bash
cd "C:\Users\akara\albert-docs"
git log --oneline -1
git status
```

Expected: one commit from the scaffold tool, clean working tree.

---

### Task 2: Configure site metadata and sidebar

**Files:**
- Modify: `C:\Users\akara\albert-docs\docusaurus.config.js`
- Modify: `C:\Users\akara\albert-docs\sidebars.js`

**Interfaces:**
- Consumes: nothing from Task 1 beyond the scaffolded files.
- Produces: `siteConfig.title` / `siteConfig.tagline` used by the homepage in Task 4; sidebar category `"Docs"` listing the five doc IDs used by Task 3.

- [ ] **Step 1: Edit `docusaurus.config.js` site identity fields**

Open `docusaurus.config.js` and set these top-level fields (keep everything else from the scaffold as-is):

```js
const config = {
  title: 'Albert',
  tagline: 'API testing with plain-JSON files that live in your repo',
  favicon: 'img/favicon.ico',

  url: 'https://g-akrp.github.io',
  baseUrl: '/albert-docs/',

  organizationName: 'g-akrp',
  projectName: 'albert-docs',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',
  // ...rest of scaffolded config (i18n, presets, themeConfig) unchanged
```

Also update the `presets` entry's `editUrl` (in the `docs` and `blog` blocks) from the scaffold placeholder to:

```js
editUrl: 'https://github.com/g-akrp/albert-docs/tree/main/',
```

And update `themeConfig.navbar.items` GitHub link (scaffold adds one by default) to point at:

```js
{
  href: 'https://github.com/g-akrp/albert',
  label: 'GitHub',
  position: 'right',
},
```

(This points at the extension repo, not `albert-docs` itself, since that's what a docs reader wants to find.)

- [ ] **Step 2: Replace `sidebars.js` with a manual sidebar**

```js
/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docsSidebar: [
    {
      type: 'category',
      label: 'Docs',
      items: [
        'intro',
        'getting-started',
        'flows',
        'sims',
        'cli',
      ],
    },
  ],
};

module.exports = sidebars;
```

- [ ] **Step 3: Verify build still succeeds**

```bash
cd "C:\Users\akara\albert-docs"
npm run build
```

Expected: fails at this point with broken-link/missing-doc errors, because `sidebars.js` now references doc IDs (`getting-started`, `flows`, `sims`, `cli`) that don't exist yet — only `intro` exists from the scaffold. This is expected; Task 3 creates them. Confirm the error specifically names the missing doc IDs, not a config syntax error.

- [ ] **Step 4: Commit**

```bash
cd "C:\Users\akara\albert-docs"
git add docusaurus.config.js sidebars.js
git commit -m "config: set site identity for g-akrp/albert-docs and manual sidebar"
```

---

### Task 3: Write the five content pages

**Files:**
- Modify: `C:\Users\akara\albert-docs\docs\intro.md` (replace scaffold content)
- Create: `C:\Users\akara\albert-docs\docs\getting-started.md`
- Create: `C:\Users\akara\albert-docs\docs\flows.md`
- Create: `C:\Users\akara\albert-docs\docs\sims.md`
- Create: `C:\Users\akara\albert-docs\docs\cli.md`
- Delete: any other scaffold tutorial docs left under `docs/` (e.g. `tutorial-basics/`, `tutorial-extras/` directories) since they're not part of this site's content.

**Interfaces:**
- Consumes: sidebar doc IDs defined in Task 2 (`intro`, `getting-started`, `flows`, `sims`, `cli`) — filenames must match exactly.
- Produces: complete doc set the build in Task 2 Step 3 was missing.

- [ ] **Step 1: Remove leftover scaffold tutorial docs**

```bash
cd "C:\Users\akara\albert-docs"
rm -rf docs/tutorial-basics docs/tutorial-extras
```

- [ ] **Step 2: Write `docs/intro.md`**

```markdown
---
sidebar_position: 1
---

# Introduction

Albert is a VS Code extension for API testing, built around plain-JSON file formats that live in
your repo next to the code they test — no proprietary collection format, no separate server, no
account.

## File types

| Extension | What it is |
|---|---|
| `*.abrq` | One HTTP request — method, endpoint/path, headers, query, body, auth, pre/post-response scripts, declarative assertions, an AJV JSON Schema, a pasted sample response, and Allure report metadata. |
| `*.abenv` | A named set of `{{variables}}` plus per-environment settings (timeout, follow-redirects). |
| `*.abf` | An ordered **flow**: a sequence of steps, each referencing a `.abrq` file, run end-to-end via [k6](https://k6.io/). Each step can replay its request's validations as checks and **capture** values forward into `{{variables}}` for later steps. |
| `*.abl` | A load/stress **simulation**: one or more flows, each at its own target TPS, ramp-up, hold, and ramp-down duration, combined into a single k6 run. Results render live as charts, with an optional New Relic export. |
| `*.abh` | A saved **flow run history** — one or more past flow runs with full per-step detail — opened in a read-only viewer. |
| `*.abepic` | An Allure **epic**: a name plus a list of feature names. Schema-validated JSON text, no custom editor. |
| `*.abfeat` | An Allure **feature**: a name, a path back to its `.abepic`, and a list of story names. Schema-validated JSON text, no custom editor. |

There is no collection file. A "collection" is just a folder of `.abrq` / `.abenv` files — VS Code's
own Explorer is the browser. Every file type is plain JSON, so they diff cleanly in git and stay
readable even outside the extension (open any of them as text and you still get JSON Schema
autocomplete/validation from VS Code's built-in JSON language service, via the editor-title
**Open File as Text** button).

Continue to [Getting Started](./getting-started.md) to create your first request.
```

- [ ] **Step 3: Write `docs/getting-started.md`**

```markdown
---
sidebar_position: 2
---

# Getting Started

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
     sub-tabs), and Allure (report metadata).
   - **History** — every live send this session (request + response + test results), expandable,
     not persisted to disk. A **Save result as Markdown** action turns the latest result into a
     shareable `.md` snippet.
   Tabs with a validation problem (bad JSON, invalid schema, broken regex) show a ⚠ warning badge
   so you don't have to open every tab to find what's wrong.
4. Click **Send**. While a request is in flight the button becomes **Cancel** (flows and sims have
   the same Stop/Cancel control while running).

Next: chain multiple requests together in a [flow](./flows.md), or drive load with a [sim](./sims.md).
```

- [ ] **Step 4: Write `docs/flows.md`**

```markdown
---
sidebar_position: 3
---

# Flows

Right-click a folder → **Albert: New API Flow** to create a `.abf`. Add steps, pick a `.abrq`
request for each, optionally toggle **validate** (runs that request's Expect assertions + schema as
k6 checks) and add **captures** (pull a value from a step's response body/header/status into a
flow-scoped `{{variable}}` usable by later steps). Click **▶ Run flow** to execute the whole flow
once via k6 (1 VU / 1 iteration); per-step status, timing, validation checks, and a response-body
preview stream into the results panel as the run progresses. Step result cards can expand to show
request headers/auth/body and response headers/body, and surface that step's Allure metadata
(epic/feature/story/suite/severity/owner/tags/description) as a badge with a tooltip.

Each run is added to a **Run history** list at the bottom of the flow editor (most recent first,
kept per editor session, outlined as bordered cards). Expand any entry to see that run's per-step
detail. Click **Save history…** to write the runs to a `*.abh` file; opening that file uses a
read-only **history viewer** that renders the same per-step results — handy for archiving a run or
sharing it alongside the repo.

k6 is the execution engine for flows (and [sims](./sims.md)). On first run Albert downloads and
caches a pinned k6 release into its global storage automatically — no manual install. To use your
own k6 binary instead, set the **`albert.k6Path`** setting to its path.

## Allure reporting

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
```

- [ ] **Step 5: Write `docs/sims.md`**

```markdown
---
sidebar_position: 4
---

# Sims (load & stress testing)

Right-click a folder → **Albert: New Load Simulation** to create a `.abl`, then click **+ Add flow**
for each `.abf` you want to drive. Each flow entry is fully independent: set its own **start at**
delay (seconds into the run before it kicks off, mapped to k6's scenario `startTime`), **target
TPS**, **ramp up**, **hold**, and **ramp down** durations — setting ramp up/down to 0 gives a flat
constant load for the hold duration. Duration fields accept `30s`, `10m`, `1h`, or a compound
`1h 12m 30s`; a bare number is treated as seconds, and values display the same way. Each flow
becomes its own k6 arrival-rate scenario with its own schedule and pattern, so a single sim can
stagger flows to start at different times and drive them at independent throughputs *and*
independent shapes/durations simultaneously.

Click **▶ Run sim**; results update live during the run and stay after it finishes, with a switcher
between three views — all rendered locally, no external service required:

- **XY chart** — throughput (req/s), p95 latency, and error-rate plotted over time per flow, plus
  achieved-TPS and p95 bar charts.
- **Sankey** — load distribution as a flow diagram: total load → each flow (width ∝ request count) →
  Success / Error outcome, so you can see at a glance where traffic and failures concentrate.
- **Table** — per-flow summary (achieved vs. target TPS, request count, error %, p50/p95/p99, checks).

Before you run anything, the same view switcher also shows a **Planned load (preview)** panel
computed from each flow's own profile + target TPS — the **XY** view plots the arrival-rate curve
each flow will follow over time (ramp/hold/spike shape), the **Sankey** shows how the planned
request volume splits across flows, and the **Table** lists planned requests per flow. The preview
is derived from the same load model the k6 scenarios are generated from, so what you preview is
what runs.

## New Relic export (optional)

Tick "Send results to New Relic", choose the region (US/EU), and set your Metric API key (the
in-editor button, or **Albert: Set New Relic API Key** — stored in VS Code SecretStorage, never in
the `.abl` file). After each run Albert POSTs per-flow metrics (achieved TPS, error rate, latency
percentiles, request counts, check pass-rate) to New Relic's Metric API. Runs work fine without a
key — the export is simply skipped.
```

- [ ] **Step 6: Write `docs/cli.md`**

```markdown
---
sidebar_position: 5
---

# CLI

Run the same tests outside VS Code (CI, a terminal, a headless box) with the `albert` CLI.

## Install

From the editor: **Albert: Install CLI** (runs `npm install -g "<extension>"`, needs npm on PATH).

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
`localhost:3000`.

## k6 binary

k6 is never bundled. `run`/`serve` auto-download a pinned k6 release into a CLI-appropriate cache
directory on first use, unless `--k6`/`ALBERT_K6_PATH` points at your own binary.
```

- [ ] **Step 7: Verify build succeeds**

```bash
cd "C:\Users\akara\albert-docs"
npm run build
```

Expected: build succeeds (no missing-doc-ID errors). If it fails, check the failing doc ID against the filenames created above.

- [ ] **Step 8: Spot-check content landed**

```bash
cd "C:\Users\akara\albert-docs"
grep -l "abrq" docs/*.md
```

Expected: lists `docs/intro.md` at minimum (file-type table references `.abrq`).

- [ ] **Step 9: Commit**

```bash
cd "C:\Users\akara\albert-docs"
git add docs/
git commit -m "docs: add intro, getting-started, flows, sims, cli pages"
```

---

### Task 4: Customize the homepage

**Files:**
- Modify: `C:\Users\akara\albert-docs\src\pages\index.js`
- Modify: `C:\Users\akara\albert-docs\src\components\HomepageFeatures\index.js`

**Interfaces:**
- Consumes: `siteConfig.title` / `siteConfig.tagline` from Task 2; links to `/docs/intro` (Task 3) and `https://github.com/g-akrp/albert`.
- Produces: a homepage that reflects Albert rather than the Docusaurus scaffold defaults.

- [ ] **Step 1: Edit the hero buttons in `src/pages/index.js`**

Replace the `<div className={styles.buttons}>...</div>` block (inside `HomepageHeader`) with:

```jsx
<div className={styles.buttons}>
  <Link
    className="button button--secondary button--lg"
    to="/docs/intro">
    Get Started
  </Link>
  <Link
    className="button button--outline button--secondary button--lg margin-left--md"
    to="https://github.com/g-akrp/albert">
    View on GitHub
  </Link>
</div>
```

Also update the `<Layout>` call in the default-exported `Home` component to use a real description:

```jsx
<Layout
  title={`${siteConfig.title}`}
  description="API testing with plain-JSON files that live in your repo — no proprietary collection format, no separate server, no account.">
```

- [ ] **Step 2: Replace the feature list in `src/components/HomepageFeatures/index.js`**

Find the `FeatureList` array (three entries with `title`/`Svg`/`description`) and replace the three `description` values (keep the existing `title` keys' structure, `Svg` imports, and component code unchanged — only the array contents change):

```js
const FeatureList = [
  {
    title: 'Plain JSON, Lives In Your Repo',
    Svg: require('@site/static/img/undraw_docusaurus_mountain.svg').default,
    description: (
      <>
        Requests, environments, flows, and sims are all plain-JSON files that diff cleanly in git —
        no proprietary collection format, no separate server, no account.
      </>
    ),
  },
  {
    title: 'Flows & Sims',
    Svg: require('@site/static/img/undraw_docusaurus_tree.svg').default,
    description: (
      <>
        Chain requests into an end-to-end <strong>flow</strong>, then reuse those flows as load
        profiles in a <strong>sim</strong> for stress testing, with live charts as it runs.
      </>
    ),
  },
  {
    title: 'k6-Powered',
    Svg: require('@site/static/img/undraw_docusaurus_react.svg').default,
    description: (
      <>
        Flows and sims execute via <a href="https://k6.io/">k6</a>, auto-downloaded on first run.
        Run the same tests in CI with the bundled <code>albert</code> CLI.
      </>
    ),
  },
];
```

- [ ] **Step 3: Verify build succeeds**

```bash
cd "C:\Users\akara\albert-docs"
npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
cd "C:\Users\akara\albert-docs"
git add src/pages/index.js src/components/HomepageFeatures/index.js
git commit -m "feat: customize homepage hero and feature list for Albert"
```

---

### Task 5: Add the GitHub Actions deploy workflow

**Files:**
- Create: `C:\Users\akara\albert-docs\.github\workflows\deploy.yml`

**Interfaces:**
- Consumes: `npm run build` (Task 1/4) producing `build/`.
- Produces: on push to `main`, publishes `build/` to the `gh-pages` branch.

- [ ] **Step 1: Create the workflow file**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./build
```

- [ ] **Step 2: Validate YAML syntax**

```bash
cd "C:\Users\akara\albert-docs"
node -e "require('js-yaml') || true" 2>/dev/null; python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/deploy.yml'))" 2>/dev/null || echo "no local yaml linter available, visually double-check indentation"
```

Expected: no parse error printed (or the fallback message if neither `js-yaml` nor `pyyaml` is available — in that case visually confirm indentation matches the block above exactly, since YAML is indentation-sensitive).

- [ ] **Step 3: Commit**

```bash
cd "C:\Users\akara\albert-docs"
git add .github/workflows/deploy.yml
git commit -m "ci: deploy to gh-pages via GitHub Actions on push to main"
```

---

### Task 6: Final verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Full clean build**

```bash
cd "C:\Users\akara\albert-docs"
rm -rf build .docusaurus
npm run build
```

Expected: succeeds with no broken-link errors.

- [ ] **Step 2: Confirm sidebar order locally**

```bash
cd "C:\Users\akara\albert-docs"
npm run serve
```

Open `http://localhost:3000/albert-docs/` in a browser, confirm:
- Homepage shows "Get Started" / "View on GitHub" buttons and the three custom feature blurbs.
- Sidebar under "Docs" lists, top to bottom: Introduction, Getting Started, Flows, Sims (load & stress testing), CLI.
- `/docs/intro` renders the file-type table.

Stop the server (Ctrl+C) once confirmed.

- [ ] **Step 3: Confirm git log**

```bash
cd "C:\Users\akara\albert-docs"
git log --oneline
git status
```

Expected: a clean working tree and a commit history showing the scaffold + each task's commit from this plan.

- [ ] **Step 4: Report next steps to the user**

No commit needed for this step — it's a verification-only task. Tell the user: the site builds and runs locally; to go live they need to (a) create the `g-akrp/albert-docs` repo on GitHub, (b) `git remote add origin https://github.com/g-akrp/albert-docs.git && git push -u origin main`, and (c) in repo Settings → Pages, set source to the `gh-pages` branch (created automatically after the first Actions run).
