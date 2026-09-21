import test from 'node:test';
import assert from 'node:assert/strict';
import {
  homeFeaturedPresentation,
  homeFeaturedPreviewRequested,
  normalizeHomeFeaturedAuthority,
  readHomeFeaturedAuthority
} from '../js/home-featured-authority.mjs';

function client(responses) {
  const calls = [];
  return {
    calls,
    rpc(name) {
      calls.push(name);
      return Promise.resolve(responses[name] || { data: null, error: new Error('missing fixture') });
    }
  };
}

test('autoridade canônica prevalece sobre o destaque legado do CMS', async () => {
  const api = client({ echo_home_featured_state_v1: {
    data: [{ hero_id: 'canonical', hero_slug: 'mirage', automation_enabled: true, revision: 9 }], error: null
  } });
  const result = await readHomeFeaturedAuthority(api, { fallbackHeroId: 'legacy' });
  assert.equal(result.featuredHeroId, 'canonical');
  assert.equal(result.source, 'canonical');
  assert.equal(result.automationEnabled, true);
  assert.deepEqual(api.calls, ['echo_home_featured_state_v1']);
});

test('estado canônico vazio não ressuscita um selo legado incorreto', async () => {
  const api = client({ echo_home_featured_state_v1: {
    data: [{ hero_id: null, hero_slug: null, automation_enabled: true }], error: null
  } });
  const result = await readHomeFeaturedAuthority(api, { fallbackHeroId: 'legacy' });
  assert.equal(result.featuredHeroId, '');
  assert.equal(result.source, 'canonical');
});

test('prévia administrativa usa somente o próximo herói devolvido pelo servidor', async () => {
  const api = client({
    echo_home_featured_state_v1: { data: [{ hero_id: 'current', hero_slug: 'slayer' }], error: null },
    echo_admin_preview_home_featured_rotation_v1: {
      data: { status: 'ready', revision: 10, scheduled_for: '2026-09-07T03:00:00Z', next_hero: { id: 'next', name: 'Mirage', slug: 'mirage' } },
      error: null
    }
  });
  const result = await readHomeFeaturedAuthority(api, { search: '?previewDestaque=proximo' });
  assert.equal(result.featuredHeroId, 'next');
  assert.equal(result.heroName, 'Mirage');
  assert.equal(result.preview, true);
  assert.equal(result.source, 'admin-preview');
  assert.deepEqual(api.calls.sort(), [
    'echo_admin_preview_home_featured_rotation_v1', 'echo_home_featured_state_v1'
  ]);
});

test('falha de permissão da prévia retorna ao estado canônico sem confiar na URL', async () => {
  const api = client({
    echo_home_featured_state_v1: { data: [{ hero_id: 'current', hero_slug: 'slayer' }], error: null },
    echo_admin_preview_home_featured_rotation_v1: { data: null, error: { code: '42501' } }
  });
  const result = await readHomeFeaturedAuthority(api, { search: '?previewDestaque=proximo&heroi=inventado' });
  assert.equal(result.featuredHeroId, 'current');
  assert.equal(result.preview, false);
  assert.equal(result.source, 'canonical');
});

test('fallback só existe quando a leitura canônica falha', async () => {
  const api = client({ echo_home_featured_state_v1: { data: null, error: new Error('offline') } });
  const result = await readHomeFeaturedAuthority(api, { fallbackHeroId: 'legacy' });
  assert.equal(result.featuredHeroId, 'legacy');
  assert.equal(result.source, 'fallback');
});

test('apresentação separa exploração, destaque e prévia com textos literais', () => {
  assert.equal(homeFeaturedPreviewRequested('?previewDestaque=proximo'), true);
  assert.equal(homeFeaturedPreviewRequested('?previewDestaque=qualquer'), false);
  assert.deepEqual(homeFeaturedPresentation({ isFeatured: false }), {
    mode: 'explore', eyebrow: 'Explorar heróis', sealLabel: '', announcementSuffix: ''
  });
  assert.equal(homeFeaturedPresentation({ isFeatured: true }).eyebrow, 'Herói em destaque');
  assert.equal(homeFeaturedPresentation({ isFeatured: true }).sealLabel, 'Destaque da Arena');
  assert.equal(homeFeaturedPresentation({ isFeatured: true, preview: true }).mode, 'preview');
});

test('normalizador aceita resposta em linha ou lista sem inventar revisão', () => {
  const row = normalizeHomeFeaturedAuthority([{ hero_id: 'a', revision: '4' }]);
  assert.equal(row.featuredHeroId, 'a');
  assert.equal(row.revision, 4);
  assert.equal(normalizeHomeFeaturedAuthority({}).revision, null);
});
