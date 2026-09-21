import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import worker from '../cloudflare/media-worker/src/index.js';

const ORIGIN = 'https://echo-arena-restaurado-7201c6.gitlab.io';
const API = 'https://echo-arena-media-api.echo-arena-midia-20c30ea6.workers.dev';
const SNV = 'https://nqklhsfaqpbjqmfzjzxk.supabase.co';
const USER_ID = '00000000-0000-4000-8000-000000000001';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6xAAAAABJRU5ErkJggg==', 'base64');

function memoryBucket() {
  const values = new Map();
  const calls = { head: [], get: [], put: [], delete: [] };
  function metadata(key, value) {
    const etag = createHash('sha256').update(value.bytes).digest('hex');
    return {
      key, size: value.bytes.length, etag, httpEtag: `"${etag}"`,
      uploaded: new Date('2026-08-28T00:00:00Z'),
      httpMetadata: { contentType: value.type },
      writeHttpMetadata(headers) { headers.set('Content-Type', value.type); }
    };
  }
  return {
    calls, values,
    seed(key, bytes, type = 'video/mp4') { values.set(key, { bytes: new Uint8Array(bytes), type }); },
    async head(key) { calls.head.push(key); const value = values.get(key); return value ? metadata(key, value) : null; },
    async get(key, options) {
      calls.get.push({ key, options });
      const value = values.get(key);
      if (!value) return null;
      const result = metadata(key, value);
      let bytes = value.bytes;
      if (options?.range) {
        const { offset, length } = options.range;
        bytes = bytes.slice(offset, offset + length);
        result.range = { offset, length: bytes.length };
      }
      return { ...result, body: new Response(bytes).body };
    },
    async put(key, body, options) {
      const bytes = new Uint8Array(await new Response(body).arrayBuffer());
      calls.put.push({ key, options, size: bytes.length });
      values.set(key, { bytes, type: options.httpMetadata.contentType });
      return metadata(key, values.get(key));
    },
    async delete(key) { calls.delete.push(key); values.delete(key); }
  };
}

function fixture(t, options = {}) {
  const bucket = memoryBucket();
  const env = {
    MEDIA_BUCKET: bucket, MEDIA_PUBLIC_URL: `${API}/files`, ALLOWED_ORIGINS: ORIGIN,
    SUPABASE_URL: SNV, SUPABASE_ANON_KEY: 'publishable-test-fixture', ADMIN_USER_IDS: USER_ID,
    ...options.env
  };
  const calls = [];
  // O serviço Auth é simulado; estes JWTs não são credenciais nem provas de login real.
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url, init });
    if (String(url) === `${SNV}/auth/v1/user`) return Response.json({ id: options.userId ?? USER_ID }, { status: options.authStatus ?? 200 });
    if (String(url) === `${SNV}/rest/v1/rpc/echo_is_admin`) return Response.json(options.admin ?? true);
    assert.fail(`Requisição externa inesperada no teste: ${url}`);
  });
  const claims = { sub: USER_ID, aal: 'aal2', role: 'authenticated', iss: `${SNV}/auth/v1`, exp: Math.floor(Date.now() / 1000) + 3600, ...options.claims };
  const jwt = `fixture.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.not-a-real-signature`;
  const headers = { Origin: ORIGIN, Authorization: `Bearer ${jwt}` };
  const pending = [];
  const context = { waitUntil(promise) { pending.push(promise); } };
  const request = (path, init = {}) => new Request(`${API}${path}`, init);
  const run = (path, init = {}) => worker.fetch(request(path, init), env, context);
  const upload = (file = new File([PNG], 'fixture.png', { type: 'image/png' }), folder = 'Heros/test/ScreenVideo', extra = {}) => {
    const body = new FormData(); body.set('file', file); body.set('folder', folder);
    return run('/media', { method: 'POST', headers, body, ...extra });
  };
  return { bucket, env, calls, headers, run, upload, pending };
}

test('health identifica a implantação sem consultar Auth nem listar o bucket', async t => {
  const f = fixture(t); const response = await f.run('/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: 'echo-arena-media', revision: '20260828-r2-account-1' });
  assert.equal(f.calls.length, 0); assert.equal(f.bucket.calls.get.length, 0);
  const head = await f.run('/health', { method: 'HEAD' }); assert.equal(await head.text(), '');
});

test('CORS de escrita permite só a origem configurada; localhost exige opt-in', async t => {
  const f = fixture(t);
  assert.equal((await f.run('/media', { method: 'OPTIONS', headers: { Origin: ORIGIN } })).status, 204);
  for (const origin of ['https://untrusted.invalid', 'http://localhost:3000', 'null']) {
    assert.equal((await f.run('/media', { method: 'OPTIONS', headers: { Origin: origin } })).status, 403);
  }
  assert.equal(f.calls.length, 0);
});

test('envio sem Bearer é negado antes de ler o corpo ou escrever', async t => {
  const f = fixture(t); const response = await f.upload(undefined, undefined, { headers: { Origin: ORIGIN } });
  assert.equal(response.status, 403); assert.equal(f.calls.length, 0); assert.equal(f.bucket.calls.put.length, 0);
});

for (const [label, options] of [
  ['Auth rejeitado', { authStatus: 401 }], ['MFA ausente', { claims: { aal: 'aal1' } }],
  ['emissor incorreto', { claims: { iss: 'https://untrusted.invalid/auth/v1' } }],
  ['JWT expirado', { claims: { exp: 1 } }], ['identidade divergente', { claims: { sub: 'other-user' } }],
  ['sem allowlist', { env: { ADMIN_USER_IDS: '' } }], ['RPC sem privilégio', { admin: false }],
  ['provedor incorreto', { env: { SUPABASE_URL: 'https://untrusted.invalid' } }],
  ['metadados não concedem acesso', { admin: false, claims: { user_metadata: { is_admin: true } } }]
]) {
  test(`escrita negada: ${label}`, async t => {
    const f = fixture(t, options); assert.equal((await f.upload()).status, 403); assert.equal(f.bucket.calls.put.length, 0);
  });
}

test('upload autorizado grava só no R2, preserva bytes e usa extensão do MIME', async t => {
  const f = fixture(t); const response = await f.upload(new File([PNG], 'nome.html', { type: 'image/png' }));
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.match(result.key, /^Heros\/test\/ScreenVideo\/[a-f0-9-]+\.png$/);
  assert.equal(result.url, `${API}/files/${result.key}`);
  assert.equal(result.size, PNG.length);
  assert.deepEqual(Buffer.from(f.bucket.values.get(result.key).bytes), PNG);
  assert.equal(f.calls.length, 2); assert.ok(f.calls.every(call => !call.url.includes('/storage/')));
});

test('MIME inválido e assinatura falsa não chegam ao R2', async t => {
  const f = fixture(t);
  for (const file of [new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }), new File(['fake'], 'x.png', { type: 'image/png' })]) {
    assert.equal((await f.upload(file)).status, 415);
  }
  assert.equal(f.bucket.calls.put.length, 0);
});

test('limite de imagem continua em 8 MiB', async t => {
  const f = fixture(t); const bytes = new Uint8Array(8 * 1024 * 1024 + 1); bytes.set(PNG);
  assert.equal((await f.upload(new File([bytes], 'large.png', { type: 'image/png' }))).status, 413);
  assert.equal(f.bucket.calls.put.length, 0);
});

test('vídeo MP4 válido usa o limite próprio de 20 MiB', async t => {
  const f = fixture(t);
  const small = new Uint8Array(16); small.set(new TextEncoder().encode('ftypisom'), 4);
  const response = await f.upload(new File([small], 'clip.mp4', { type: 'video/mp4' }));
  assert.equal(response.status, 201); assert.match((await response.json()).url, /\.mp4$/);
  const large = new Uint8Array(20 * 1024 * 1024 + 1); large.set(small);
  assert.equal((await f.upload(new File([large], 'large.mp4', { type: 'video/mp4' }))).status, 413);
  assert.equal(f.bucket.calls.put.length, 1);
});

test('corpo multipart acima do limite é interrompido mesmo sem Content-Length', async t => {
  const f = fixture(t); const bytes = new Uint8Array(22 * 1024 * 1024); bytes.set(PNG);
  const form = new FormData(); form.set('file', new File([bytes], 'large.png', { type: 'image/png' }));
  const encoded = new Request(`${API}/media`, { method: 'POST', body: form });
  // O Worker recebe bytes HTTP, não o produtor FormData do Undici/Node.
  // Este último tem uma rejeição assíncrona própria quando cancelado no meio.
  const body = await encoded.arrayBuffer();
  const response = await f.run('/media', { method: 'POST', headers: { ...f.headers, 'Content-Type': encoded.headers.get('Content-Type') }, body });
  assert.equal(response.status, 413);
  assert.equal(f.bucket.calls.put.length, 0);
});

test('corpo anunciado excessivo e formulário malformado são rejeitados', async t => {
  const f = fixture(t);
  assert.equal((await f.run('/media', { method: 'POST', headers: { ...f.headers, 'Content-Length': '999999999' }, body: 'x' })).status, 413);
  assert.equal((await f.run('/media', { method: 'POST', headers: f.headers, body: 'not multipart' })).status, 400);
});

test('GET e HEAD públicos não exigem login e não escrevem no R2', async t => {
  const f = fixture(t); f.bucket.seed('video.mp4', new Uint8Array([1, 2, 3, 4]));
  const full = await f.run('/files/video.mp4'); assert.equal(full.status, 200);
  assert.equal(full.headers.get('Content-Length'), '4'); assert.equal(full.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(full.headers.get('Access-Control-Allow-Origin'), '*'); assert.equal(full.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.deepEqual([...new Uint8Array(await full.arrayBuffer())], [1, 2, 3, 4]);
  const head = await f.run('/files/video.mp4', { method: 'HEAD', headers: { Range: 'bytes=0-1' } });
  assert.equal(head.status, 200); assert.equal(head.headers.get('Content-Length'), '4'); assert.equal(await head.text(), '');
  assert.equal(f.bucket.calls.get.length, 1); assert.equal(f.bucket.calls.put.length, 0); assert.equal(f.calls.length, 0);
});

for (const [range, contentRange, expected] of [
  ['bytes=0-1', 'bytes 0-1/10', [0, 1]], ['bytes=7-', 'bytes 7-9/10', [7, 8, 9]],
  ['bytes=-3', 'bytes 7-9/10', [7, 8, 9]], ['bytes=8-999', 'bytes 8-9/10', [8, 9]]
]) {
  test(`leitura parcial Safari: ${range}`, async t => {
    const f = fixture(t); f.bucket.seed('video.mp4', new Uint8Array([0,1,2,3,4,5,6,7,8,9]));
    const response = await f.run('/files/video.mp4', { headers: { Range: range } });
    assert.equal(response.status, 206); assert.equal(response.headers.get('Content-Range'), contentRange);
    assert.equal(response.headers.get('Content-Length'), String(expected.length));
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], expected);
  });
}

test('ranges inválidos retornam 416 sem baixar o objeto completo', async t => {
  const f = fixture(t); f.bucket.seed('video.mp4', new Uint8Array(10));
  for (const value of ['bytes=10-', 'bytes=9-1', 'bytes=-0', 'bytes=-', 'bytes=0-1,4-5', 'bytes=99999999999999999-', 'invalid']) {
    const response = await f.run('/files/video.mp4', { headers: { Range: value } });
    assert.equal(response.status, 416, value); assert.equal(response.headers.get('Content-Range'), 'bytes */10');
  }
  assert.equal(f.bucket.calls.get.length, 0);
});

test('If-Range divergente retorna o objeto inteiro e ETag válido permite 304', async t => {
  const f = fixture(t); f.bucket.seed('video.mp4', new Uint8Array(10));
  const response = await f.run('/files/video.mp4', { headers: { Range: 'bytes=0-1', 'If-Range': '"old"' } });
  assert.equal(response.status, 200); assert.equal(response.headers.get('Content-Length'), '10');
  const etag = response.headers.get('ETag'); await response.arrayBuffer();
  const unchanged = await f.run('/files/video.mp4', { headers: { 'If-None-Match': `W/${etag}` } });
  assert.equal(unchanged.status, 304); assert.equal(await unchanged.text(), '');
  assert.equal(f.bucket.calls.get.length, 1);
});

test('mídia ausente e rota legacy não importam arquivos do Supabase', async t => {
  const f = fixture(t);
  assert.equal((await f.run('/files/missing.png')).status, 404);
  assert.equal((await f.run('/legacy/Heros/test/image.png', { headers: { Origin: ORIGIN } })).status, 404);
  assert.equal(f.calls.length, 0); assert.equal(f.bucket.calls.put.length, 0);
});

test('caminhos codificados inválidos não alcançam o bucket', async t => {
  const f = fixture(t);
  for (const path of ['/files/%ZZ.png', '/files/a%2Fb.png', '/files/%00.png', '/files/a/%5C.png']) {
    assert.equal((await f.run(path)).status, 400, path);
  }
  assert.equal(f.bucket.calls.get.length, 0); assert.equal(f.bucket.calls.head.length, 0);
});

test('remoção autenticada é limitada ao prefixo da conta nova', async t => {
  const f = fixture(t); f.bucket.seed('ok.png', PNG, 'image/png');
  for (const url of ['https://echo-arena-media-api.28vkwpbtz5.workers.dev/files/ok.png', `${API}/files-other/ok.png`, `${API}/files/../ok.png`, `${API}/files/%ZZ`]) {
    const response = await f.run('/media', { method: 'DELETE', headers: { ...f.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
    assert.equal(response.status, 400, url);
  }
  assert.equal(f.bucket.calls.delete.length, 0);
  assert.equal((await f.run('/media', { method: 'DELETE', headers: { ...f.headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: `${API}/files/ok.png` }) })).status, 200);
  assert.deepEqual(f.bucket.calls.delete, ['ok.png']);
});

test('cache de leitura não persiste respostas parciais e evita novo acesso ao R2', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  const entries = new Map(); const writes = [];
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: {
    async match(request) { return entries.get(request.url)?.clone(); },
    async put(request, response) { writes.push(request.url); entries.set(request.url, response); },
    async delete() { return true; }
  } } });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'caches', descriptor); else delete globalThis.caches; });
  const f = fixture(t); f.bucket.seed('video.mp4', new Uint8Array(10));
  const partial = await f.run('/files/video.mp4', { headers: { Range: 'bytes=0-1' } }); await partial.arrayBuffer();
  await Promise.all(f.pending); assert.equal(writes.length, 0);
  const full = await f.run('/files/video.mp4?first=1'); await full.arrayBuffer(); await Promise.all(f.pending);
  assert.deepEqual(writes, [`${API}/files/video.mp4`]);
  const count = f.bucket.calls.get.length;
  const cached = await f.run('/files/video.mp4?second=2'); assert.equal(cached.status, 200); await cached.arrayBuffer();
  assert.equal(f.bucket.calls.get.length, count);
});

test('falhas internas não revelam detalhes nem retornam sucesso', async t => {
  const f = fixture(t); f.bucket.get = async () => { throw new Error('private-provider-detail'); };
  const response = await f.run('/files/test.png'); assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private-provider-detail/);
});
