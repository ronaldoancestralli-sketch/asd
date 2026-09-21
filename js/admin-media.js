import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import { resolveMediaUrl, uploadMedia, removeR2Media, isExternalMedia } from './media-storage.js?v=20260823-security-supabase-pin-1';
const BUCKET = 'game-media';
const MAX_SIZE = 8 * 1024 * 1024;
const ALLOWED = ['image/png','image/jpeg','image/gif','image/webp'];

function normalizeFolder(folder) {
  return String(folder).replace(/^\/+|\/+$/g, '');
}

export function getPublicMediaUrl(path) {
  return resolveMediaUrl(path);
}

export async function uploadGameMedia(file, folder) {
  if (!file) return null;
  if (!ALLOWED.includes(file.type)) throw new Error('Formato não permitido.');
  if (file.size > MAX_SIZE) throw new Error('Arquivo maior que 8 MB.');

  return uploadMedia(file, normalizeFolder(folder));
}

export async function removeGameMedia(path) {
  if (!path) return;
  if (isExternalMedia(path)) {
    await removeR2Media(path);
    return;
  }
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
