const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

// Prints fixed, greppable lines so .vscode/tasks.json's background problem matcher
// has something real to match for "build started"/"build finished" gating.
const watchLogPlugin = {
  name: 'watch-log',
  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      if (result.errors.length > 0) {
        for (const err of result.errors) {
          const loc = err.location;
          const file = loc ? loc.file : 'unknown';
          const line = loc ? loc.line : 0;
          const col = loc ? loc.column : 0;
          console.log(`${file}:${line}:${col}: error: ${err.text}`);
        }
      }
      console.log('[watch] build finished');
    });
  },
};

const browserBundleOptions = {
  bundle: true,
  platform: 'browser',
  target: 'es2020',
  sourcemap: !production,
  minify: production,
  loader: { '.ttf': 'dataurl' },
  plugins: [watchLogPlugin],
};

async function main() {
  const ctxExt = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'out/extension.js',
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    external: ['vscode'],
    // jsonc-parser's CJS build (lib/umd/main.js) does `require("./impl/format")`
    // through a parameter-aliased `require`, which esbuild can't statically inline —
    // it survives as a real runtime require that fails once bundled into a single file.
    // The ESM build uses static imports esbuild can fully resolve, so prefer it.
    mainFields: ['module', 'main'],
    sourcemap: !production,
    minify: production,
    plugins: [watchLogPlugin],
  });

  const ctxRequestWebview = await esbuild.context({
    ...browserBundleOptions,
    entryPoints: ['src/webview/request/main.ts'],
    outfile: 'out/webview-request.js',
    format: 'iife',
  });

  const ctxEnvWebview = await esbuild.context({
    ...browserBundleOptions,
    entryPoints: ['src/webview/envconfig/main.ts'],
    outfile: 'out/webview-env.js',
    format: 'iife',
  });

  const ctxFlowWebview = await esbuild.context({
    ...browserBundleOptions,
    entryPoints: ['src/webview/flow/main.ts'],
    outfile: 'out/webview-flow.js',
    format: 'iife',
  });

  const ctxSimWebview = await esbuild.context({
    ...browserBundleOptions,
    entryPoints: ['src/webview/sim/main.ts'],
    outfile: 'out/webview-sim.js',
    format: 'iife',
  });

  const ctxHistoryWebview = await esbuild.context({
    ...browserBundleOptions,
    entryPoints: ['src/webview/history/main.ts'],
    outfile: 'out/webview-history.js',
    format: 'iife',
  });

  // The `albert` CLI — a standalone Node bundle (never imports vscode).
  const ctxCli = await esbuild.context({
    entryPoints: ['src/cli/index.ts'],
    bundle: true,
    outfile: 'out/cli.js',
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    banner: { js: '#!/usr/bin/env node' },
    mainFields: ['module', 'main'],
    sourcemap: !production,
    minify: production,
    plugins: [watchLogPlugin],
  });

  // The CLI's served results page (reuses the editor's DOM-only chart code).
  const ctxCliWeb = await esbuild.context({
    ...browserBundleOptions,
    entryPoints: ['src/cli/web/main.ts'],
    outfile: 'out/cli-web.js',
    format: 'iife',
  });

  // Monaco's language workers run as standalone Web Workers inside the webview;
  // each needs its own bundle since they execute in a separate worker global scope.
  const ctxEditorWorker = await esbuild.context({
    ...browserBundleOptions,
    entryPoints: ['node_modules/monaco-editor/esm/vs/editor/editor.worker.js'],
    outfile: 'out/editor.worker.js',
    format: 'iife',
  });

  const ctxJsonWorker = await esbuild.context({
    ...browserBundleOptions,
    entryPoints: ['node_modules/monaco-editor/esm/vs/language/json/json.worker.js'],
    outfile: 'out/json.worker.js',
    format: 'iife',
  });

  const ctxTsWorker = await esbuild.context({
    ...browserBundleOptions,
    entryPoints: ['node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js'],
    outfile: 'out/ts.worker.js',
    format: 'iife',
  });

  const contexts = [ctxRequestWebview, ctxEnvWebview, ctxFlowWebview, ctxSimWebview, ctxHistoryWebview, ctxCliWeb, ctxEditorWorker, ctxJsonWorker, ctxTsWorker];

  const nodeContexts = [ctxExt, ctxCli];

  if (watch) {
    await Promise.all([...nodeContexts.map((c) => c.watch()), ...contexts.map((c) => c.watch())]);
  } else {
    for (const ctx of nodeContexts) {
      await ctx.rebuild();
      await ctx.dispose();
    }
    for (const ctx of contexts) {
      await ctx.rebuild();
      await ctx.dispose();
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
