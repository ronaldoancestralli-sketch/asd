import test from 'node:test';
import assert from 'node:assert/strict';

import {
  identityProfileUrl,
  identitySignupGateEnabled,
  identitySignupMetadata,
  isValidPublicHandle,
  normalizePublicHandle,
  signupHandleFromUser
} from '../js/identity-public-launch-v6.js';

test('normaliza o handle sem transportar caracteres fora do contrato', () => {
  assert.equal(normalizePublicHandle('  Echo Jogador!  '), 'echojogador');
  assert.equal(normalizePublicHandle('Jogador_01'), 'jogador_01');
  assert.equal(normalizePublicHandle(`abc${'d'.repeat(30)}`).length, 24);
});

test('valida limites e pontuação interna do handle público', () => {
  assert.equal(isValidPublicHandle('abc'), true);
  assert.equal(isValidPublicHandle('echo.jogador-01'), true);
  assert.equal(isValidPublicHandle('ab'), false);
  assert.equal(isValidPublicHandle('_jogador'), false);
  assert.equal(isValidPublicHandle('jogador_'), false);
});

test('inclui a preferência de handle somente quando o gate está ativo', () => {
  assert.deepEqual(identitySignupMetadata('Ana', 'Ana.Player', false), { display_name: 'Ana' });
  assert.deepEqual(identitySignupMetadata('Ana', 'Ana.Player', true), {
    display_name: 'Ana',
    public_handle: 'ana.player'
  });
  assert.throws(() => identitySignupMetadata('Ana', '__', true), /invalid_public_handle/);
});

test('metadado de cadastro serve apenas como sugestão validada', () => {
  const user = {
    user_metadata: { public_handle: 'Echo_Player', role: 'admin' },
    app_metadata: { role: 'admin' }
  };
  assert.equal(signupHandleFromUser(user), 'echo_player');
  assert.equal(signupHandleFromUser({ user_metadata: { public_handle: '@@' } }), '');
});

test('destino de confirmação sempre aponta ao Meu Perfil sem parâmetros', () => {
  assert.equal(
    identityProfileUrl('https://example.test/projeto/index.html?from=home#auth'),
    'https://example.test/projeto/meu-perfil.html'
  );
});

test('gate de cadastro exige identidade principal e handle habilitados', async () => {
  const client = data => ({ rpc: async () => ({ data, error: null }) });
  assert.equal(await identitySignupGateEnabled(client({ public_identity_enabled: true, signup_handle_enabled: true })), true);
  assert.equal(await identitySignupGateEnabled(client({ public_identity_enabled: false, signup_handle_enabled: true })), false);
  assert.equal(await identitySignupGateEnabled(client([{ public_identity_enabled: true, signup_handle_enabled: true }])), true);
  assert.equal(await identitySignupGateEnabled({ rpc: async () => ({ data: null, error: new Error('offline') }) }), false);
});
