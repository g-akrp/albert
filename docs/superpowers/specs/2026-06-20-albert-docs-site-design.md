# albert-docs: Docusaurus site for Albert, deployed to GitHub Pages

## Goal

Give the Albert VS Code extension a public, user-facing documentation site at
`https://g-akrp.github.io/albert-docs/`, separate from the `g-akrp/albert` extension repo.

## Repo & hosting

- New repo: `g-akrp/albert-docs`, local root `C:\Users\akara\albert-docs` (currently empty, not
  yet a git repo).
- Built with Docusaurus (`classic` template, plain JS — no TypeScript needed for a docs site).
- `docusaurus.config.js`: `url: https://g-akrp.github.io`, `baseUrl: /albert-docs/`,
  `organizationName: g-akrp`, `projectName: albert-docs`.
- Deploy: GitHub Actions workflow (`.github/workflows/deploy.yml`) builds on push to `main` and
  publishes the `build/` output to the `gh-pages` branch via `peaceiris/actions-gh-pages`. The
  repo's Pages setting is configured to serve from the `gh-pages` branch. (Docusaurus produces a
  built static site, so Pages cannot serve the raw `main` branch directly — `gh-pages` is the
  standard pattern for this generator.)
- Blog plugin: kept (Docusaurus default), for future release notes/announcements.

## Content scope

User-facing docs only, adapted from `g-akrp/albert`'s `README.md` and `CLI.md`. Internal docs
(`ARCHITECTURE.md`, `PROJECT.md`, `BUILD.md`, `ROADMAP.md`) are intentionally **not** ported —
they stay contributor-facing material in the `albert` repo.

Pages under `docs/`, in sidebar order:

1. `intro.md` — what Albert is, the file-type table (`.abrq`/`.abenv`/`.abf`/`.abl`/`.abh`/
   `.abepic`/`.abfeat`), no proprietary collection format pitch.
2. `getting-started.md` — the numbered flow from the README: new environment → new request file →
   Compose/Validate/History tabs → Send.
3. `flows.md` — Flows section (steps, validate toggle, captures, run history, `.abh` viewer) plus a
   short Allure reporting subsection (flow-level reporting to an Allure server, per-request Allure
   metadata tab).
4. `sims.md` — Sims section (per-flow load profile, XY/Sankey/Table views, planned-load preview,
   optional New Relic export).
5. `cli.md` — adapted from `CLI.md`: install, `run`/`serve`/`stack` commands, k6 binary management
   note.

Sidebar (`sidebars.js`): single "Docs" category containing the five pages in the order above.

Homepage (`src/pages/index.tsx`): short hero with tagline, a "Get Started" button linking to
`/docs/intro`, and links out to the `g-akrp/albert` repo and (later) the VS Code Marketplace
listing.

## What's explicitly out of scope

- No port of ARCHITECTURE.md/PROJECT.md/BUILD.md/ROADMAP.md.
- No CI/build changes to the `albert` extension repo itself — this is a new, independent repo.
- No automatic push to GitHub in this pass; git init + local commit only, push happens after the
  user creates `g-akrp/albert-docs` on GitHub and confirms.

## Risks / edge cases

- `baseUrl` must match the eventual repo name (`/albert-docs/`) or all asset links break once
  deployed — config is set accordingly from the start.
- Keeping content in sync with the `albert` repo's README/CLI.md is a manual process (no shared
  source of truth) — acceptable for now given the small scope.
