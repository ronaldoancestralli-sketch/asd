import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditEquipmentBundlesCoverageV1,
  classifyEquipmentAttributeV1,
  classifySetBonusTextV1
} from '../js/echo-brain-equipment-coverage-v1.js';

test('atributos oficiais e aliases numéricos usam o motor canônico', () => {
  for (const key of ['damage_per_shot', 'reload_time_pct', 'Tempo de recarga da arma percentual']) {
    const result = classifyEquipmentAttributeV1(key, 10);
    assert.equal(result.classification, 'numeric_mapping_known', `${key} deveria ser calculável`);
    assert.equal(result.numeric, true);
    assert.ok(result.target, `${key} deveria apontar alvo numérico`);
  }
});

test('efeitos conhecidos sem fórmula/base segura ficam semantic_only', () => {
  const ability = classifyEquipmentAttributeV1('special_ability_cooldown_pct', -10);
  assert.equal(ability.classification, 'semantic_only');
  assert.equal(ability.semanticKind, 'ability_cooldown');

  const loot = classifyEquipmentAttributeV1('crate_opening_cooldown_pct', -20);
  assert.equal(loot.classification, 'semantic_only');
  assert.equal(loot.semanticKind, 'loot_speed');

  const switchMode = classifyEquipmentAttributeV1('tempo_de_troca_de_modo_da_arma_primaria_percentual', -15);
  assert.equal(switchMode.classification, 'semantic_only');
  assert.equal(switchMode.semanticKind, 'weapon_mode_switch');
});

test('atributo realmente desconhecido vira blocker explícito', () => {
  const result = classifyEquipmentAttributeV1('mystery_stat_foo', 77);
  assert.equal(result.classification, 'unmapped');
  assert.equal(result.numeric, false);
  assert.equal(result.semantic, false);
});

test('texto mecânico de bônus de conjunto precisa ativar semântica conhecida', () => {
  const known = classifySetBonusTextV1({ id: 'bonus-a', title: 'Pressão', description: 'Aumenta o dano e a velocidade de movimento.' });
  assert.equal(known.classification, 'semantic_text_known');
  assert.ok(known.effects.includes('damage'));

  const unknown = classifySetBonusTextV1({ id: 'bonus-b', title: 'Mistério', description: 'Amplifica energia espiritual quântica.' });
  assert.equal(unknown.classification, 'unmapped_text');
});

test('auditoria do catálogo separa calculável, semântico-only e não mapeado sem silêncio', () => {
  const audit = auditEquipmentBundlesCoverageV1([{
    equipment: { id: 'eq-1', name: 'Teste' },
    variants: [{
      rarity_slug: 'mythic',
      attributes: {
        reload_time_pct: -10,
        special_ability_cooldown_pct: -12,
        mystery_stat_foo: 3
      }
    }],
    bonuses: [{ id: 'set-2', set_id: 'set-x', required_pieces: 2, description: 'Aumenta o dano em 10%.' }]
  }]);

  assert.equal(audit.bundlesScanned, 1);
  assert.equal(audit.numericMappings, 1);
  assert.equal(audit.semanticOnlyMappings, 1);
  assert.equal(audit.unmappedMappings, 1);
  assert.equal(audit.unmappedSetBonusTexts, 0);
  assert.equal(audit.complete, false);
  assert.ok(audit.blockers.some(row => row.type === 'attribute' && row.key === 'mystery_stat_foo'));
});
