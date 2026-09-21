import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { createGameCaptureEvidence } from '../admin/js/equipment-capture-evidence.js';

const file = (content, options = {}) => {
  const bytes = new TextEncoder().encode(content);
  return {
    size: bytes.byteLength,
    type: options.type || 'image/png',
    lastModified: options.lastModified || 1,
    arrayBuffer: async () => bytes.buffer.slice(0)
  };
};

test('registra a coleta por SHA-256 sem guardar caminho ou conteúdo da imagem', async () => {
  const options = { cryptoApi: webcrypto, now: () => '2026-09-16T12:00:00.000Z' };
  const first = await createGameCaptureEvidence([file('comum'), file('divino')], options);
  const second = await createGameCaptureEvidence([file('comum'), file('divino')], options);
  const changed = await createGameCaptureEvidence([file('comum'), file('imortal')], options);

  assert.match(first.digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first.fileCount, 2);
  assert.equal(first.kind, 'game_capture');
  assert.equal(first.digest, second.digest);
  assert.notEqual(first.digest, changed.digest);
  assert.equal(JSON.stringify(first).includes('comum'), false);
});
