function hex(bytes) {
  return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function sha256(value, cryptoApi) {
  const buffer = value instanceof ArrayBuffer ? value : value.buffer;
  const digest = await cryptoApi.subtle.digest('SHA-256', buffer);
  return hex(new Uint8Array(digest));
}

export async function createGameCaptureEvidence(files, {
  cryptoApi = globalThis.crypto,
  now = () => new Date().toISOString()
} = {}) {
  const list = Array.isArray(files) ? files : [...(files || [])];
  if (!list.length) return null;
  if (!cryptoApi?.subtle || typeof TextEncoder === 'undefined') {
    throw new Error('O navegador não oferece SHA-256 para registrar a coleta.');
  }

  const fileProofs = [];
  for (const file of list) {
    if (!file || typeof file.arrayBuffer !== 'function') {
      throw new TypeError('A coleta contém um arquivo inválido.');
    }
    const bytes = await file.arrayBuffer();
    fileProofs.push({
      bytes: Number(file.size ?? bytes.byteLength),
      type: String(file.type || ''),
      lastModified: Number(file.lastModified || 0),
      digest: await sha256(bytes, cryptoApi)
    });
  }

  const manifest = new TextEncoder().encode(JSON.stringify(fileProofs));
  return Object.freeze({
    kind: 'game_capture',
    digest: `sha256:${await sha256(manifest, cryptoApi)}`,
    fileCount: fileProofs.length,
    collectedAt: now()
  });
}
