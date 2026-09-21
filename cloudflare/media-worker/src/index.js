const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif',
  'video/mp4', 'video/webm'
]);
const SUPABASE_URL = 'https://nqklhsfaqpbjqmfzjzxk.supabase.co';
const PUBLIC_PREFIX = '/files/';
const MAX_UPLOAD_BODY = 21 * 1024 * 1024;
const MEDIA_REVISION = '20260828-r2-account-1';

class RequestError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function json(body, status = 200, origin = '*') {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Vary': 'Origin'
    }
  });
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const configured = String(env.ALLOWED_ORIGINS || '')
    .split(',').map(value => value.trim()).filter(Boolean);
  if (configured.includes(origin)) return origin;
  if (env.ALLOW_LOCAL_ORIGINS === 'true' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return '';
}

function decodeJwtPayload(token) {
  try {
    const encoded = String(token || '').split('.')[1] || '';
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

async function adminUser(request, env) {
  if (env.SUPABASE_URL !== SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) return null;

  const token = authorization.slice('Bearer '.length).trim();
  if (!token) return null;

  /* O JWT só é lido depois de ser validado pelo endpoint /auth/v1/user.
     A assinatura/expiração não são confiadas a este parser local. */
  const headers = { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization };
  const userResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers });
  if (!userResponse.ok) return null;
  const user = await userResponse.json();

  const claims = decodeJwtPayload(token);
  if (!claims || claims.sub !== user.id || claims.aal !== 'aal2') return null;
  if (claims.iss !== `${SUPABASE_URL}/auth/v1` || claims.role !== 'authenticated') return null;
  if (!Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000) return null;

  /* Segunda trava independente do banco. Mesmo que uma política RLS seja
     configurada incorretamente, somente UUIDs registrados no Worker entram. */
  const allowedAdminIds = String(env.ADMIN_USER_IDS || '')
    .split(',').map(value => value.trim()).filter(Boolean);
  if (!allowedAdminIds.length || !allowedAdminIds.includes(user.id)) return null;

  /* A query é executada com o JWT AAL2 do próprio usuário. Após o hardening
     de profiles, role deixa de ser uma coluna globalmente legível; por isso
     a autorização forte é resolvida pela RPC echo_is_admin(). */
  const adminResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/echo_is_admin`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: '{}'
  });
  if (!adminResponse.ok) return null;
  const isAdmin = await adminResponse.json();
  return isAdmin === true ? user : null;
}

async function matchesFileSignature(file) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = String.fromCharCode(...bytes);
  const signatures = {
    'image/jpeg': bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    'image/png': bytes[0] === 0x89 && ascii.slice(1, 4) === 'PNG',
    'image/gif': ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a'),
    'image/webp': ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP',
    'image/avif': ascii.slice(4, 8) === 'ftyp' && /avif|avis/.test(ascii.slice(8, 16)),
    'video/mp4': ascii.slice(4, 8) === 'ftyp',
    'video/webm': bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
  };
  return signatures[file.type] === true;
}

function safeSegment(value = '') {
  return String(value).normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').replace(/^\.+$/, '').slice(0, 80);
}

function publicBase(env) {
  return String(env.MEDIA_PUBLIC_URL || '').replace(/\/$/, '');
}

function publicHeaders(object) {
  const headers = new Headers();
  if (object) {
    object.writeHttpMetadata(headers);
    headers.set('ETag', object.httpEtag);
    headers.set('Last-Modified', object.uploaded.toUTCString());
    headers.set('Content-Length', String(object.size));
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    headers.set('Cache-Control', 'no-store');
  }
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Range, If-Range, If-None-Match, If-Modified-Since');
  headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, ETag');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('X-Content-Type-Options', 'nosniff');
  return headers;
}

function objectKey(encoded) {
  if (!encoded || encoded.length > 1024) return null;
  try {
    const parts = encoded.split('/').map(decodeURIComponent);
    if (parts.some(part => !part || part === '.' || part === '..' || /[\u0000-\u001f\u007f\\/]/.test(part))) return null;
    return parts.join('/');
  } catch {
    return null;
  }
}

function byteRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value || '');
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  const first = match[1] ? Number(match[1]) : null;
  const last = match[2] ? Number(match[2]) : null;
  if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) return null;
  if (first === null) {
    if (last <= 0) return null;
    const length = Math.min(last, size);
    return { offset: size - length, length };
  }
  if (first >= size || (last !== null && last < first)) return null;
  return { offset: first, length: Math.min(last ?? size - 1, size - 1) - first + 1 };
}

function etagMatches(value, etag) {
  return (value || '').split(',').some(tag => tag.trim() === '*' || tag.trim().replace(/^W\//, '') === etag);
}

async function publicMedia(request, env, context, pathname) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: publicHeaders() });
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: publicHeaders() });
  const key = objectKey(pathname.slice(PUBLIC_PREFIX.length));
  if (!key) return new Response(null, { status: 400, headers: publicHeaders() });

  // Nunca grava/importa dados em GET. Só os uploads administrativos abastecem o bucket.
  const cache = globalThis.caches?.default;
  const cacheUrl = new URL(request.url);
  cacheUrl.search = '';
  const cacheKey = new Request(cacheUrl.href);
  const rangeHeader = request.headers.get('Range');
  const ifRange = request.headers.get('If-Range');
  if (request.method === 'GET' && !ifRange && cache) {
    const cacheRequest = new Request(cacheKey, { headers: request.headers });
    const cached = await cache.match(cacheRequest).catch(() => undefined);
    if (cached) return cached;
  }

  let range = null;
  let object;
  const conditional = request.headers.has('If-None-Match') || request.headers.has('If-Modified-Since');
  if (request.method === 'HEAD' || rangeHeader || conditional) {
    const metadata = await env.MEDIA_BUCKET.head(key);
    if (!metadata) return new Response(null, { status: 404, headers: publicHeaders() });
    const headers = publicHeaders(metadata);
    const ifNoneMatch = request.headers.get('If-None-Match');
    const since = Date.parse(request.headers.get('If-Modified-Since') || '');
    if (etagMatches(ifNoneMatch, metadata.httpEtag) || (!ifNoneMatch && Number.isFinite(since) && Math.floor(metadata.uploaded.getTime() / 1000) <= Math.floor(since / 1000))) {
      headers.delete('Content-Length');
      return new Response(null, { status: 304, headers });
    }
    if (request.method === 'HEAD') return new Response(null, { headers });

    const rangeDate = Date.parse(ifRange || '');
    const useRange = !ifRange || ifRange === metadata.httpEtag || (Number.isFinite(rangeDate) && Math.floor(metadata.uploaded.getTime() / 1000) <= Math.floor(rangeDate / 1000));
    if (rangeHeader && useRange) {
      range = byteRange(rangeHeader, metadata.size);
      if (!range) {
        headers.set('Content-Range', `bytes */${metadata.size}`);
        headers.set('Content-Length', '0');
        headers.set('Cache-Control', 'no-store');
        return new Response(null, { status: 416, headers });
      }
    }
  }
  object = await env.MEDIA_BUCKET.get(key, range ? { range } : undefined);
  if (!object) return new Response(null, { status: 404, headers: publicHeaders() });
  const headers = publicHeaders(object);
  if (range) {
    const returned = object.range || range;
    headers.set('Content-Range', `bytes ${returned.offset}-${returned.offset + returned.length - 1}/${object.size}`);
    headers.set('Content-Length', String(returned.length));
  }
  const response = new Response(object.body, { status: range ? 206 : 200, headers });
  if (!range && cache && context?.waitUntil) {
    context.waitUntil(cache.put(cacheKey, response.clone()).catch(() => {}));
  }
  return response;
}

async function uploadForm(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_UPLOAD_BODY) throw new RequestError('O envio ultrapassa o limite permitido.', 413);
  if (!request.body) throw new RequestError('Nenhum arquivo recebido.', 400);
  let received = 0;
  let tooLarge = false;
  const limited = request.body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > MAX_UPLOAD_BODY) {
        tooLarge = true;
        throw new RequestError('O envio ultrapassa o limite permitido.', 413);
      }
      controller.enqueue(chunk);
    }
  }));
  try {
    return await new Response(limited, { headers: { 'Content-Type': request.headers.get('Content-Type') || '' } }).formData();
  } catch {
    throw new RequestError(tooLarge ? 'O envio ultrapassa o limite permitido.' : 'Formulário de mídia inválido.', tooLarge ? 413 : 400);
  }
}

async function upload(request, env, origin) {
  if (!(await adminUser(request, env))) return json({ error: 'Acesso administrativo inválido ou MFA ausente.' }, 403, origin);
  if (!publicBase(env)) return json({ error: 'MEDIA_PUBLIC_URL não configurada no Worker.' }, 500, origin);
  const form = await uploadForm(request);
  const file = form.get('file');
  if (!(file instanceof File) || !file.size) return json({ error: 'Nenhum arquivo recebido.' }, 400, origin);
  if (!ALLOWED_TYPES.has(file.type)) return json({ error: 'Formato de mídia não permitido.' }, 415, origin);
  if (!(await matchesFileSignature(file))) return json({ error: 'O conteúdo do arquivo não corresponde ao formato informado.' }, 415, origin);

  const maximum = file.type.startsWith('video/') ? 20 * 1024 * 1024 : 8 * 1024 * 1024;
  if (file.size > maximum) {
    return json({ error: `O arquivo ultrapassa ${maximum / 1024 / 1024} MB.` }, 413, origin);
  }

  const rawFolder = String(form.get('folder') || 'uploads');
  if (rawFolder.length > 512) return json({ error: 'Pasta de mídia inválida.' }, 400, origin);
  const folder = rawFolder
    .split('/').map(safeSegment).filter(Boolean).join('/') || 'uploads';
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm' }[file.type];
  const key = `${folder}/${crypto.randomUUID()}.${extension}`;
  await env.MEDIA_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' }
  });

  return json({ key, url: `${publicBase(env)}/${key}`, size: file.size, contentType: file.type }, 201, origin);
}

async function remove(request, env, origin, context) {
  if (!(await adminUser(request, env))) return json({ error: 'Acesso administrativo inválido ou MFA ausente.' }, 403, origin);
  const body = await request.json().catch(() => ({}));
  const base = `${publicBase(env)}/`;
  const url = String(body.url || '');
  if (!url.startsWith(base)) return json({ error: 'A mídia não pertence a este bucket.' }, 400, origin);
  const key = objectKey(url.slice(base.length).split(/[?#]/)[0]);
  if (!key) return json({ error: 'Caminho de mídia inválido.' }, 400, origin);
  await env.MEDIA_BUCKET.delete(key);
  if (globalThis.caches?.default && context?.waitUntil) {
    const cacheUrl = `${publicBase(env)}/${key.split('/').map(encodeURIComponent).join('/')}`;
    context.waitUntil(globalThis.caches.default.delete(cacheUrl).catch(() => {}));
  }
  return json({ ok: true, key }, 200, origin);
}

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env);
    try {
      if (url.pathname === '/health' && ['GET', 'HEAD'].includes(request.method)) {
        const response = json({ ok: Boolean(env.MEDIA_BUCKET), service: 'echo-arena-media', revision: MEDIA_REVISION }, env.MEDIA_BUCKET ? 200 : 503);
        return request.method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response;
      }
      if (url.pathname.startsWith(PUBLIC_PREFIX)) return await publicMedia(request, env, context, url.pathname);
      if (!origin) return json({ error: 'Origem não autorizada.' }, 403, 'null');
      if (request.method === 'OPTIONS') return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
          'Access-Control-Max-Age': '86400',
          'Vary': 'Origin'
        }
      });
      if (url.pathname !== '/media') return json({ error: 'Rota não encontrada.' }, 404, origin);
      if (request.method === 'POST') return await upload(request, env, origin);
      if (request.method === 'DELETE') return await remove(request, env, origin, context);
      return json({ error: 'Método não permitido.' }, 405, origin);
    } catch (error) {
      return json({ error: error instanceof RequestError ? error.message : 'Serviço de mídia temporariamente indisponível.' }, error instanceof RequestError ? error.status : 503, origin || 'null');
    }
  }
};
