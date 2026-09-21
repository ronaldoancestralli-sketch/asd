
import { resolveMediaUrl, uploadMedia } from '../../js/media-storage.js?v=20260823-security-supabase-pin-1';

export function publicMediaUrl(path) {
  return resolveMediaUrl(path);
}

export async function uploadEquipmentImage(file) {
  if (!file) return null;
  const allowed = ['image/png','image/jpeg','image/webp','image/gif'];
  if (!allowed.includes(file.type)) throw new Error('Use PNG, JPG, WEBP ou GIF.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Imagem maior que 8 MB.');

  return uploadMedia(file, 'Gears');
}
