import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const read = relative => fs.readFileSync(new URL(relative, root), 'utf8');
function extract(source, name) {
  const start = source.indexOf('async function ' + name + '(');
  assert.ok(start >= 0, name);
  const end = source.indexOf('\n}', start);
  return source.slice(start, end + 2);
}
test('Pages collection excludes the prototype while retaining public pages, assets and runtime', async () => {
  const source = read('scripts/build-gitlab-pages.mjs');
  const start = source.indexOf('const WEB_TREES');
  const end = source.indexOf('const FORBIDDEN_CONTENT', start);
  assert.ok(start >= 0 && end > start);
  const visited = [];
  const context = vm.createContext({
    ROOT: '/repo', sep: '/',
    join: (...parts) => parts.join('/'),
    extname: name => name.includes('.') ? name.slice(name.lastIndexOf('.')) : '',
    dirname: name => name.slice(0, name.lastIndexOf('/')),
    readdir: async () => [
      {name: 'index.html', isFile: () => true},
      {name: 'prototypes', isFile: () => false},
      {name: 'admin', isFile: () => false}
    ],
    listFiles: async tree => { visited.push(tree); return [tree + '/fixture.js']; },
    lstat: async name => ({
      isDirectory: () => name === '/repo/contracts',
      isFile: () => name !== '/repo/contracts',
      isSymbolicLink: () => false
    })
  });
  vm.runInContext(source.slice(start, end) + '\n' + extract(source, 'collectPublishableFiles'), context);
  const files = [...await context.collectPublishableFiles()];
  assert.ok(files.includes('/repo/index.html'));
  assert.ok(files.includes('/repo/js/fixture.js'));
  assert.ok(files.includes('/repo/admin/fixture.js'));
  assert.ok(files.includes('/repo/contracts/equipment-effect-contract-v1.js'));
  assert.ok(!files.some(path => path.includes('/prototypes/')));
  assert.ok(!visited.some(path => path.includes('/prototypes')));
});

test('governance keeps published HTML public and requires an internal ledger for the prototype', () => {
  const script = [
    'import importlib.util',
    'spec = importlib.util.spec_from_file_location("governance", "scripts/check-change-governance.py")',
    'module = importlib.util.module_from_spec(spec)',
    'spec.loader.exec_module(module)',
    'assert module.relevant("prototypes/calculation-v2/index.html")',
    'assert not module.is_public_surface("prototypes/calculation-v2/index.html")',
    'assert module.is_public_surface("index.html")',
    'assert module.is_public_surface("criar-build.html")',
    'assert module.is_public_surface("js/criar-build.js")',
    'assert not module.is_public_surface("admin/equipment-editor.html")',
    'assert module.is_public_surface("prototypes/other/index.html")'
  ].join('\n');
  const result = spawnSync(process.env.PYTHON || 'python3', ['-c', script], {
    cwd: fileURLToPath(root), encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout);
});
