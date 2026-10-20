import { build, context } from 'esbuild';
const opts = {
  entryPoints: ['src/extension.ts'], bundle: true, outfile: 'dist/extension.js',
  platform: 'node', format: 'cjs', external: ['vscode'], sourcemap: true, target: 'node20',
};
if (process.argv.includes('--watch')) { (await context(opts)).watch(); } else { await build(opts); }
