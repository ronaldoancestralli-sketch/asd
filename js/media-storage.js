import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import { MEDIA_API_URL, MEDIA_PUBLIC_URL, LEGACY_MEDIA_API_URL } from './media-config.js?v=20260828-r2-account-1';

const LEGACY_BUCKET = 'game-media';

function workerConfigured() {
  return Boolean(MEDIA_API_URL && !MEDIA_API_URL.includes('SEU_SUBDOMINIO'));
}

function legacyWorkerUrl(path) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `${LEGACY_MEDIA_API_URL.replace(/\/$/, '')}/legacy/${encodedPath}`;
}

export function isExternalMedia(value = '') {
  return /^(https?:\/\/|blob:|data:)/i.test(String(value).trim());
}

export function resolveMediaUrl(value = '') {
  const source = String(value || '').trim();
  if (!source) return '';

  /*
    URLs absolutas já publicadas são o destino final. Em especial,
    v_heroes_complete fornece main_source/card_source/gif_source como URLs
    públicas completas do Storage; reenviá-las para /legacy no Worker cria
    uma segunda resolução desnecessária e pode quebrar a mídia pública.

    O Worker continua sendo usado para caminhos legados relativos, enquanto
    URLs externas, blob/data e caminhos web explícitos permanecem intactos.
  */
  if (isExternalMedia(source) || source.startsWith('/') || source.startsWith('./') || source.startsWith('../')) {
    return source;
  }
  if (LEGACY_MEDIA_API_URL && !LEGACY_MEDIA_API_URL.includes('SEU_SUBDOMINIO')) {
    return legacyWorkerUrl(source);
  }
  return supabase.storage.from(LEGACY_BUCKET).getPublicUrl(source).data.publicUrl || '';
}

function assertConfigured() {
  if (!workerConfigured()) {
    throw new Error('Configure a URL do Cloudflare Worker em js/media-config.js.');
  }
}

async function accessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) throw new Error('Sua sessão administrativa expirou. Entre novamente.');
  return token;
}

async function workerRequest(path, options = {}) {
  assertConfigured();
  const token = await accessToken();
  const response = await fetch(`${MEDIA_API_URL.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Falha no serviço de mídia (${response.status}).`);
  return payload;
}

export async function uploadMedia(file, folder = 'uploads') {
  if (!file) return null;
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('folder', String(folder || 'uploads'));
  const result = await workerRequest('/media', { method: 'POST', body: form });
  return result.url;
}

export async function removeR2Media(value) {
  // A limpeza de upload incompleto só pode alcançar a conta nova.
  // URLs históricas e mídias externas não são propriedade deste Worker.
  const base = `${MEDIA_PUBLIC_URL.replace(/\/$/, '')}/`;
  if (!isExternalMedia(value) || !String(value).startsWith(base)) return false;
  await workerRequest('/media', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: value })
  });
  return true;
}

export function normalizeHeroMedia(hero = {}) {
  const slots = {
    main: hero.image_path,
    card: hero.card_image_path,
    gif: hero.gif_path,
    build: hero.build_image_path,
    build_card: hero.build_card_image_path
  };

  Object.entries(slots).forEach(([slot, path]) => {
    if (!path) return;
    hero[`${slot}_source`] = resolveMediaUrl(path);
    if (!hero[`${slot}_mime_type`]) {
      hero[`${slot}_mime_type`] = /\.(mp4|webm)(?:\?|$)/i.test(path)
        ? 'video/mp4'
        : /\.gif(?:\?|$)/i.test(path) ? 'image/gif' : 'image/*';
    }
  });

  return hero;
}
