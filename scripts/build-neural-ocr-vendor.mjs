import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = resolve(ROOT, 'scripts/neural-ocr-browser-entry.mjs');
const OUTPUT = resolve(ROOT, 'admin/js/vendor/paddleocr-browser.bundle.mjs');

await mkdir(dirname(OUTPUT), { recursive: true });

await build({
  entryPoints: [ENTRY],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: ['safari17'],
  outfile: OUTPUT,
  minify: true,
  legalComments: 'none',
  sourcemap: false,
  treeShaking: true
});

const bundled = await readFile(OUTPUT, 'utf8');
for (const forbidden of [
  '[unenv]',
  'process.binding is not implemented yet',
  'process.binding(',
  'node:fs',
  'node:path',
  'node:module',
  'node:process'
]) {
  if (bundled.includes(forbidden)) {
    throw new Error(
      'Bundle neural incompatível com navegador; token proibido encontrado: ' +
      forbidden
    );
  }
}

if (!bundled.includes('PaddleOcrService')) {
  throw new Error('Bundle neural não exportou PaddleOcrService.');
}

console.log(
  'Bundle browser do PaddleOCR gerado sem shims Node/unenv: ' +
  OUTPUT.replace(ROOT + '/', '')
);
