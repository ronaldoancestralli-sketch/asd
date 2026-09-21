import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const CONTRACT = 'contracts/equipment-effect-contract-v1.js';
const CORE = 'admin/js/equipment-effect-central-core.js';
const ABSENT = 'absent';
const source = path => new URL(`../${path}`, import.meta.url);

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'echo-pages-contract-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ['scripts', 'admin/js', 'assets', 'css', 'js', 'contracts']) {
    await mkdir(join(root, dir), { recursive: true });
  }
  for (const file of ['scripts/build-gitlab-pages.mjs', 'scripts/validate-gitlab-pages.mjs', CONTRACT, CORE]) {
    await copyFile(source(file), join(root, file));
  }
  const files = {
    'index.html': `<html><head></head><body><script type="module">await import("./${'admin/js/entry.js'}");</script></body></html>`,
    'admin/js/entry.js': `import "./${CORE.split('/').at(-1)}";\n`,
    'js/public-release-manifest.js': 'export const version = "fixture";\n',
    'js/media-config.js': 'export const media = "fixture";\n',
    'contracts/internal.js': 'export const internal = true;\n',
    'contracts/README.md': 'Internal documentation: must not be published.\n',
    // This preloader is used ONLY by this disposable fixture, never the real build.
    'scripts/offline-fixture.mjs': 'globalThis.fetch = async () => ({ ok: true });\n'
  };
  for (const [file, contents] of Object.entries(files)) await writeFile(join(root, file), contents);
  const run = script => spawnSync(process.execPath, [
    '--import', pathToFileURL(join(root, 'scripts/offline-fixture.mjs')).href,
    join(root, 'scripts', script), 'artifact'
  ], {
    cwd: root, encoding: 'utf8', timeout: 15000,
    env: { ...process.env,
      SUPABASE_URL: 'https://nqklhsfaqpbjqmfzjzxk.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture_not_a_real_key_000000'
    }
  });
  const build = () => run('build-gitlab-pages.mjs');
  const validate = () => run('validate-gitlab-pages.mjs');
  return { root, build, validate };
}

const output = result => `${result.stdout}\n${result.stderr}`;
const passes = result => assert.equal(result.status, 0, output(result));
const fails = (result, message) => {
  assert.notEqual(result.status, 0, output(result));
  assert.match(output(result), message);
};

test('artefato inclui somente o contrato autorizado e executa o core real sem ativar cálculo', async t => {
  const f = await fixture(t);
  passes(f.build());
  assert.deepEqual(await readdir(join(f.root, 'artifact/contracts')), ['equipment-effect-contract-v1.js']);
  assert.equal(await readFile(join(f.root, 'artifact', CONTRACT), 'utf8'), await readFile(source(CONTRACT), 'utf8'));
  passes(f.validate());
  const core = await import(pathToFileURL(join(f.root, 'artifact', CORE)).href);
  assert.ok(core.EFFECT_TARGET_OPTIONS.includes('armor_capacity'));
  const contract = await import(pathToFileURL(join(f.root, 'artifact', CONTRACT)).href);
  assert.equal(contract.EQUIPMENT_EFFECT_NUMERIC_AUTHORITY.enabled, false);
});

test('gate recusa exatamente a omissão transitiva que travou a Central', async t => {
  const f = await fixture(t);
  passes(f.build());
  await rm(join(f.root, 'artifact/contracts'), { recursive: true, force: true });
  fails(f.validate(), /Referência local ausente.*equipment-effect-central-core.*equipment-effect-contract-v1/);
});

for (const [label, importer] of [
  ['import estático multilinha', `import {\n value\n} from "./${ABSENT}.js?v=1#export";`],
  ['import por efeito colateral', `import "./${ABSENT}.js";`],
  ['reexport', `export { value } from "./${ABSENT}.js";`],
  ['import dinâmico literal', `await import(\n "./${ABSENT}.mjs?version=1"\n);`],
  ['URL relativa ao módulo', `const url = new URL("./${ABSENT}.js", import.meta.url);`]
]) {
  test(`gate verifica ${label} dentro do artefato`, async t => {
    const f = await fixture(t);
    await writeFile(join(f.root, 'admin/js/entry.js'), importer);
    passes(f.build());
    fails(f.validate(), /Referência local ausente.*entry\.js.*absent/);
  });
}

test('gate verifica import dinâmico literal em script inline fora das quatro árvores antigas', async t => {
  const f = await fixture(t);
  await writeFile(join(f.root, 'index.html'), `<html><head></head><body><script type="module">import("./contracts/${ABSENT}.js");</script></body></html>`);
  passes(f.build());
  fails(f.validate(), /Referência local ausente.*index\.html.*absent/);
});

test('gate recusa contrato adicional mesmo com extensão JavaScript permitida', async t => {
  const f = await fixture(t);
  passes(f.build());
  await mkdir(join(f.root, 'artifact/contracts'), { recursive: true });
  await copyFile(join(f.root, 'contracts/internal.js'), join(f.root, 'artifact/contracts/internal.js'));
  fails(f.validate(), /Contrato não autorizado.*internal\.js/);
});

test('gate ignora comentários e não consulta imports externos', async t => {
  const f = await fixture(t);
  await writeFile(join(f.root, 'admin/js/entry.js'), [
    `// import "./${ABSENT}.js";`,
    `/* export * from "./${ABSENT}.mjs"; */`,
    'export { version } from "https://example.invalid/module.js";'
  ].join('\n'));
  passes(f.build());
  passes(f.validate());
});

test('builder recusa symlink no contrato explicitamente autorizado', async t => {
  const f = await fixture(t);
  await rm(join(f.root, CONTRACT));
  await symlink(join(f.root, 'contracts/internal.js'), join(f.root, CONTRACT));
  fails(f.build(), /Contrato publicável ausente ou inseguro/);
});
