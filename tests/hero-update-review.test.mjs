import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildHeroReadiness,
  createDiff,
  projectUpdateState,
  summarizeDiffs,
  valuesEqual
} from '../admin/js/hero-update-review.js';

const completeBundle = {
  hero: {
    name: 'Slayer',
    class_id: 'sniper',
    rarity_id: 'mythic',
    faction: 'Força e Armas',
    description: 'Descrição em português.',
    enabled: true,
    image_path: 'Heros/slayer/Main/image.webp',
    card_image_path: null
  },
  heroStats: { health: 1000 },
  weaponStats: { damage_per_shot: 250 },
  weaponName: 'Rifle'
};

test('comparação diferencia formulário alterado de valores equivalentes', () => {
  assert.equal(valuesEqual(' 100 ', 100), true);
  assert.equal(valuesEqual(true, 1), false);
  assert.equal(valuesEqual('Slayer', 'Slayer atualizado'), false);

  const changed = createDiff({
    key: 'description',
    label: 'Descrição',
    group: 'Geral',
    before: 'Antiga',
    after: 'Nova',
    apply: { type: 'hero', column: 'description' }
  });
  assert.equal(changed.changed, true);
  assert.equal(changed.selected, true);
  assert.deepEqual(summarizeDiffs([changed]), {
    changed: 1,
    selected: 1,
    increases: 0,
    decreases: 0,
    texts: 1,
    same: 0
  });
});

test('campos desmarcados são preservados na projeção', () => {
  const nameDiff = createDiff({
    key: 'name',
    label: 'Nome',
    group: 'Geral',
    before: 'Slayer',
    after: 'Slayer X',
    apply: { type: 'hero', column: 'name' }
  });
  nameDiff.selected = false;

  const state = projectUpdateState(completeBundle, [nameDiff]);
  assert.equal(state.hero.name, 'Slayer');
  assert.equal(projectUpdateState(completeBundle, [nameDiff], { selectAll: true }).hero.name, 'Slayer X');
});

test('publicação bloqueia pendências reais, mas rascunho pode ser salvo', () => {
  const incomplete = {
    hero: { name: 'Novo', enabled: true },
    heroStats: {},
    weaponStats: {},
    weaponName: '',
    media: { image: false, card: false }
  };
  const published = buildHeroReadiness(incomplete);
  assert.deepEqual(published.blockers.map(item => item.key), ['class', 'base-stats', 'public-media']);

  incomplete.hero.enabled = false;
  const draft = buildHeroReadiness(incomplete);
  assert.equal(draft.blockers.length, 0);
  assert.equal(draft.publicationPending.length, 3);
});

test('status novo precisa ser salvo no rascunho antes de publicar', () => {
  const bundle = {
    hero: { name:'Novo', class_id:'sniper', enabled:false, image_path:'main.webp' },
    heroStats: {},
    weaponStats: {},
    weaponName: ''
  };
  const stat = createDiff({
    key:'hero.health', label:'Vida', group:'Status', before:null, after:1200, kind:'number',
    apply:{ type:'stat', table:'hero_base_stats', statKey:'health' }
  });
  const publish = createDiff({
    key:'enabled', label:'Publicação', group:'Geral', before:false, after:true,
    apply:{ type:'hero', column:'enabled' }
  });

  const readiness = buildHeroReadiness(projectUpdateState(bundle, [stat, publish]));
  assert.deepEqual(readiness.blockers.map(item => item.key), ['base-stats']);
});

test('herói completo fica pronto para atualização pública', () => {
  const state = projectUpdateState(completeBundle, []);
  const readiness = buildHeroReadiness(state);
  assert.equal(readiness.blockers.length, 0);
  assert.equal(readiness.publicationPending.length, 0);
  assert.equal(readiness.qualityPending.length, 0);
});

test('edição e duplicidade usam a mesma revisão antes de gravar', () => {
  const editor = readFileSync(new URL('../admin/js/hero-editor.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../admin/hero-editor.html', import.meta.url), 'utf8');

  assert.match(editor, /await openUpdateAssistant\(currentHero \|\| \{ id:heroId \}, \{ mode:'edit' \}\)/);
  assert.match(editor, /await openUpdateAssistant\(existingHero, \{ mode:'duplicate' \}\)/);
  assert.match(editor, /touchedFields\.has\(fieldKey\)/);
  assert.match(editor, /histórico indisponível; revisão mantida/);
  assert.match(editor, /id="update-requirements"/);
  assert.match(html, /20260831-hero-update-review-1/);
});
