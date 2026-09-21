import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const config = await readFile(new URL('../js/media-config.js', import.meta.url), 'utf8');
const source = await readFile(new URL('../js/media-storage.js', import.meta.url), 'utf8');
const NEW = 'https://echo-arena-media-api.echo-arena-midia-20c30ea6.workers.dev';
const OLD = 'https://echo-arena-media-api.28vkwpbtz5.workers.dev';
const SNV = 'https://nqklhsfaqpbjqmfzjzxk.supabase.co';

function client(overrides = {}, session = true) {
  const calls = [];
  const context = vm.createContext({
    window: overrides, FormData, URL,
    supabase: {
      auth: { async getSession() { return { data: { session: session ? { access_token: 'test-session-not-a-jwt' } : null }, error: null }; } },
      storage: { from(bucket) { return { getPublicUrl(path) { return { data: { publicUrl: `${SNV}/storage/v1/object/public/${bucket}/${path}` } }; } }; } }
    },
    async fetch(url, options) { calls.push({ url, options }); return Response.json({ url: `${NEW}/files/new.png` }); }
  });
  const script = config.replace(/\bexport /g, '') + '\n' + source.replace(/^import .*;\n/gm, '').replace(/\bexport /g, '') + '\nglobalThis.media = { MEDIA_API_URL, MEDIA_PUBLIC_URL, LEGACY_MEDIA_API_URL, resolveMediaUrl, uploadMedia, removeR2Media };';
  new vm.Script(script).runInContext(context);
  return { ...context.media, calls };
}

test('conta nova recebe uploads e caminhos antigos mantêm seu servidor original', () => {
  const media = client();
  assert.equal(media.MEDIA_API_URL, NEW); assert.equal(media.MEDIA_PUBLIC_URL, `${NEW}/files`);
  assert.equal(media.resolveMediaUrl('Heros/Slayer/ScreenVideo/movie one.mp4'), `${OLD}/legacy/Heros/Slayer/ScreenVideo/movie%20one.mp4`);
  for (const path of [`${OLD}/legacy/image.png`, `${SNV}/storage/v1/object/public/game-media/a.png`, `${NEW}/files/a.png`, 'https://media.example.org/a.png', './assets/a.png', '/assets/a.png', 'blob:fixture', 'data:image/png;base64,AA==']) {
    assert.equal(media.resolveMediaUrl(path), path);
  }
});

test('override do upload não modifica o legado e legado vazio usa o SNV', () => {
  const custom = client({ ECHO_MEDIA_API_URL: 'https://media.example.org' });
  assert.equal(custom.MEDIA_PUBLIC_URL, 'https://media.example.org/files');
  assert.equal(custom.resolveMediaUrl('old.png'), `${OLD}/legacy/old.png`);
  assert.equal(client({ ECHO_LEGACY_MEDIA_API_URL: '' }).resolveMediaUrl('old.png'), `${SNV}/storage/v1/object/public/game-media/old.png`);
});

test('upload usa a nova API com a sessão do usuário; sem sessão não envia nada', async () => {
  const media = client(); const file = new File(['fixture'], 'file.png', { type: 'image/png' });
  assert.equal(await media.uploadMedia(file, 'Heros/test'), `${NEW}/files/new.png`);
  assert.equal(media.calls[0].url, `${NEW}/media`);
  assert.equal(media.calls[0].options.headers.Authorization, 'Bearer test-session-not-a-jwt');
  assert.equal(media.calls[0].options.body.get('folder'), 'Heros/test');
  const anonymous = client({}, false); await assert.rejects(() => anonymous.uploadMedia(file), /expirou/);
  assert.equal(anonymous.calls.length, 0);
});

test('limpeza de upload não tenta excluir arquivo de conta antiga nem externo', async () => {
  const media = client();
  for (const url of [`${OLD}/files/a.png`, `${SNV}/storage/v1/object/public/game-media/a.png`, `${NEW}/files-foreign/a.png`, 'blob:test', 'relative.png']) {
    assert.equal(await media.removeR2Media(url), false);
  }
  assert.equal(media.calls.length, 0);
  assert.equal(await media.removeR2Media(`${NEW}/files/a.png`), true);
  assert.equal(media.calls[0].url, `${NEW}/media`); assert.equal(media.calls[0].options.method, 'DELETE');
});

test('CSP permite somente os endereços exatos de mídia atual e legada', async () => {
  const postprocess = await readFile(new URL('../scripts/security-pages-postprocess.mjs', import.meta.url), 'utf8');
  const connect = postprocess.split('\n').find(line => line.includes('connect-src'));
  assert.ok(connect.includes(NEW)); assert.ok(connect.includes(OLD));
  assert.ok(!connect.includes('*.workers.dev'));
});

test('mudança da configuração de mídia renova cache em builder e validador', async () => {
  const runtime = { url: SNV, publishableKey: 'public-fixture' };
  const results = [];
  for (const script of ['build-gitlab-pages.mjs', 'validate-gitlab-pages.mjs']) {
    const content = await readFile(new URL(`../scripts/${script}`, import.meta.url), 'utf8');
    const code = content.match(/function cacheVersion\([\s\S]*?\n\}/)?.[0];
    assert.ok(code, script);
    const context = vm.createContext({ createHash }); new vm.Script(`${code}; globalThis.version = cacheVersion;`).runInContext(context);
    const before = context.version(runtime, 'same-release', 'old-media-config');
    const after = context.version(runtime, 'same-release', config);
    assert.notEqual(before, after); results.push(after);
    assert.ok(content.includes("readFile(join(ROOT, 'js/media-config.js'), 'utf8')"));
    assert.ok(content.includes('cacheVersion(publicRuntimeConfig, publicReleaseManifest, mediaConfig)'));
  }
  assert.equal(results[0], results[1]);
});
