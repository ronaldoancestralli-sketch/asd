import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  eligiblePreviewHeroes,
  previewHeroEligibility
} from '../admin/js/equipment-calculation-v2-eligibility.js';

const HEROES = [
  { id: 'blot', name: 'Blot', class_id: 'sniper', enabled: true },
  { id: 'firefly', name: 'Firefly', class_id: 'sniper', enabled: true },
  { id: 'slayer', name: 'Slayer', class_id: 'sniper', enabled: true },
  { id: 'bastion', name: 'Bastion', class_id: 'tank', enabled: true },
  { id: 'disabled-sniper', name: 'Disabled', class_id: 'sniper', enabled: false }
];

test('prévia de equipamento de classe lista somente heróis ativos da mesma classe', () => {
  const item = { id: 'arm', class_id: 'sniper', enabled: true };
  assert.deepEqual(
    eligiblePreviewHeroes(item, HEROES).map(hero => hero.id),
    ['blot', 'firefly', 'slayer']
  );
  assert.equal(previewHeroEligibility(item, HEROES[3]).reason, 'equipment_class_incompatible');
});

test('prévia respeita escopos pessoal e genérico', () => {
  assert.deepEqual(
    eligiblePreviewHeroes({ id: 'personal', hero_id: 'firefly', is_personal: true }, HEROES).map(hero => hero.id),
    ['firefly']
  );
  assert.deepEqual(
    eligiblePreviewHeroes({ id: 'generic', enabled: true }, HEROES).map(hero => hero.id),
    ['blot', 'firefly', 'slayer', 'bastion']
  );
});

test('integração carrega escopo, filtra o seletor e bloqueia seleção incompatível', () => {
  const source = fs.readFileSync(new URL('../admin/js/equipment-calculation-v2.js', import.meta.url), 'utf8');
  assert.match(source, /select\('id,name,slug,class_id,enabled'\)/);
  assert.match(source, /select\('id,name,hero_id,class_id,is_personal,enabled'\)/);
  assert.match(source, /eligiblePreviewHeroes\(state\.equipment, state\.heroes\)/);
  assert.match(source, /if \(!previewHeroEligibility\(state\.equipment, hero\)\.eligible\) return null;/);
  assert.match(source, /await loadPreviewData\(\);[\s\S]*renderHeroOptions\(\);/);
});
