/* Novos uploads pertencem à conta Cloudflare atual. Não reescrever URLs
   publicadas nem redirecionar caminhos legados para o bucket novo vazio. */
export const MEDIA_API_URL =
  window.ECHO_MEDIA_API_URL ||
  'https://echo-arena-media-api.echo-arena-midia-20c30ea6.workers.dev';

export const MEDIA_PUBLIC_URL =
  window.ECHO_MEDIA_PUBLIC_URL || `${MEDIA_API_URL.replace(/\/$/, '')}/files`;

export const LEGACY_MEDIA_API_URL =
  window.ECHO_LEGACY_MEDIA_API_URL ??
  'https://echo-arena-media-api.28vkwpbtz5.workers.dev';
