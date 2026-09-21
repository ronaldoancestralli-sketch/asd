const PUBLIC_HANDLE_RE = /^[a-z0-9](?:[a-z0-9._-]{1,22}[a-z0-9])$/;

export function normalizePublicHandle(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 24);
}

export function isValidPublicHandle(value = '') {
  return PUBLIC_HANDLE_RE.test(normalizePublicHandle(value));
}

export function identityProfileUrl(currentUrl = window.location.href) {
  const url = new URL('./meu-perfil.html', currentUrl);
  url.search = '';
  url.hash = '';
  return url.href;
}

export function identitySignupMetadata(displayName = '', handle = '', enabled = false) {
  const metadata = { display_name: String(displayName).trim() };
  if (!enabled) return metadata;

  const publicHandle = normalizePublicHandle(handle);
  if (!PUBLIC_HANDLE_RE.test(publicHandle)) {
    const error = new Error('invalid_public_handle');
    error.code = 'invalid_public_handle';
    throw error;
  }

  metadata.public_handle = publicHandle;
  return metadata;
}

export function signupHandleFromUser(user) {
  const handle = normalizePublicHandle(user?.user_metadata?.public_handle);
  return PUBLIC_HANDLE_RE.test(handle) ? handle : '';
}

export async function identitySignupGateEnabled(client) {
  try {
    const { data, error } = await client.rpc('echo_identity_rollout_status_v1');
    if (error) return false;
    const rollout = Array.isArray(data) ? data[0] : data;
    return Boolean(rollout?.public_identity_enabled && rollout?.signup_handle_enabled);
  } catch {
    return false;
  }
}

export { PUBLIC_HANDLE_RE };
