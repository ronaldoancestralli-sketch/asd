import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const output = process.argv[2];
if (!output) throw new Error('Informe o caminho de saída da prévia.');
const page = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const markup = page.slice(page.indexOf('<div id="ea-engine-lab">'), page.indexOf('<script type="module"'));
const css = fs.readFileSync(path.join(directory, 'demo.css'), 'utf8').split('\n').slice(1).join('\n');
const engine = fs.readFileSync(path.join(directory, 'engine.mjs'), 'utf8').replace(/^export /gm, '');
const app = fs.readFileSync(path.join(directory, 'demo.mjs'), 'utf8').replace(/^import .*\r?\n/, '');
const fragment = ['<style>', css, '</style>', markup, '<script>', '{', engine, app, '}', '</script>', ''].join('\n');
if (Buffer.byteLength(fragment, 'utf8') > 1000000) throw new Error('Prévia excede o limite.');
fs.writeFileSync(output, fragment, 'utf8');
console.log('Prévia gerada: ' + path.resolve(output));
