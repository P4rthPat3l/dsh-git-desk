import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const EXTERNAL = ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'];

/**
 * Bundle one entry and return its CommonJS text.
 * @param entry the entry file, relative to the repository root.
 * @returns the bundled text.
 */
async function bundle(entry) {
  const result = await build({
    entryPoints: [path.join(ROOT, entry)],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'browser',
    target: ['chrome120'],
    minify: true,
    sourcemap: false,
    jsx: 'automatic',
    jsxImportSource: 'react',
    external: EXTERNAL,
    logLevel: 'silent',
  });
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(error.text);
    throw new Error(`Bundle failed: ${entry}`);
  }
  return result.outputFiles[0].text;
}

/**
 * Wrap a CommonJS bundle in the harness module loader format.
 * @param js the bundled text.
 * @param options the plugin id, the chunk file name, and whether to expose the chunk loader.
 * @returns the client artifact.
 */
function wrap(js, options) {
  const chunkLine = options.chunk === undefined ? '' : `\n  chunk: ${JSON.stringify(options.chunk)},`;
  const bridge = options.bridge === true
    ? '\n    globalThis.__dshGitDeskRequireAsync = require.async;'
    : '';
  return `window.__ModuleLoader__.load({
  id: ${JSON.stringify(options.id)},${chunkLine}
  factory(require) {
    var module = { exports: {} };
    var exports = module.exports;${bridge}
${js}
    return module.exports;
  },
});
`;
}

const main = await bundle('src/client/main.ts');
const highlight = await bundle('src/client/highlight/entry.ts');
await fs.writeFile(path.join(ROOT, 'client.js'), wrap(main, { id: 'dsh-git-desk', bridge: true }));
await fs.writeFile(path.join(ROOT, 'client.highlight.js'), wrap(highlight, { id: 'dsh-git-desk', chunk: 'client.highlight.js' }));
console.log(`client.js ${main.length} bytes`);
console.log(`client.highlight.js ${highlight.length} bytes`);
