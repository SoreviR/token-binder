import fs from 'fs';
import path from 'path';
import { build, context } from 'esbuild';

// Release builds (`npm run package`, the GitHub workflow) never include private testing tools. A local build
// (`npm run build`, F5) swaps the empty src/devhook.ts for src/devhook.local.ts when that git-ignored file exists.
const release = process.argv.includes('--release') || process.env.TB_RELEASE === '1';
const localHook = path.resolve('src/devhook.local.ts');
const useLocal = !release && fs.existsSync(localHook);
const plugins = useLocal
  ? [{ name: 'local-devhook', setup(b) { b.onResolve({ filter: /(^|[\/])devhook$/ }, () => ({ path: localHook })); } }]
  : [];

const opts = {
  entryPoints: ['src/extension.ts'], bundle: true, outfile: 'dist/extension.js',
  platform: 'node', format: 'cjs', external: ['vscode'], sourcemap: true, target: 'node20', plugins,
};
if (useLocal) { console.log('[esbuild] local build: including src/devhook.local.ts (testing tools)'); }
if (process.argv.includes('--watch')) { (await context(opts)).watch(); } else { await build(opts); }
if (release && fs.existsSync('dist/extension.js') && /devhook\.local|applyDevGrants/.test(fs.readFileSync('dist/extension.js', 'utf8'))) {
  throw new Error('release build contains private testing tools');
}
