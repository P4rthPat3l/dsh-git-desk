import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const EXTERNAL = ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'];

/**
 * Wrap a CommonJS bundle in the harness module loader format.
 * @param js the bundled text.
 * @returns the client artifact.
 */
function wrap(js) {
  return `window.__ModuleLoader__.load({
  id: 'dsh-git-desk',
  factory(require) {
    var module = { exports: {} };
    var exports = module.exports;
${js}
    return module.exports;
  },
});
`;
}

const result = await build({
  entryPoints: [path.join(ROOT, 'src/client/main.ts')],
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
  throw new Error('Bundle failed: src/client/main.ts');
}

const bundle = result.outputFiles[0].text;
await fs.writeFile(path.join(ROOT, 'client.js'), wrap(bundle));
console.log(`client.js ${bundle.length} bytes`);
