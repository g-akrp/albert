# BUILD.md

## Setup

```
npm install
```

## Build

```
npm run compile     # one-shot build (esbuild): out/extension.js, webview bundles, worker bundles, out/cli.js
npm run typecheck   # tsc --noEmit, esbuild does not type-check
npm run watch        # used by .vscode/tasks.json as the F5 preLaunchTask
```

## Run in the Extension Development Host

Press **F5** in this folder to launch a VS Code window with the extension loaded from source
(`npm run watch` runs automatically as the `preLaunchTask`).

## Package a `.vsix`

```
npm run vsix         # production build + vsce package, output to .albert_built/vsix/
```

This runs `npm run package` (production esbuild) then `vsce package`. See
[package.json](package.json) for the marketplace metadata (`icon`, `categories`, `keywords`,
`galleryBanner`) and [.vscodeignore](.vscodeignore) for what's excluded from the published package
(source, internal tooling under `.agent/`, `STATUS.md`, etc.).

## Run the CLI from source

```
npm run cli -- run example/some-request.abrq
```

or directly: `node out/cli.js run <file>` after `npm run compile`. See [CLI.md](CLI.md) for the
full command surface.
