import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scorer = fs.readFileSync(path.join(ROOT, 'supabase/functions/echo-brain-score/index.ts'), 'utf8');
const context = fs.readFileSync(path.join(ROOT, 'supabase/functions/_shared/echo-brain-equipment-context-v1.ts'), 'utf8');

function position(token) {
  const at = scorer.indexOf(token);
  assert.ok(at >= 0, `token ausente no scorer: ${token}`);
  return at;
}

test('scorer lê catálogo/versionamento atuais e falha fechado quando a fonte não é confirmada', () => {
  assert.match(scorer, /from\('equipments'\)\.select\('id,name,description,slot_id,hero_id,class_id,is_personal,enabled'\)\.eq\('enabled', true\)/);
  assert.match(scorer, /from\('equipment_variants'\)\.select\('equipment_id,attributes'\)/);
  assert.match(scorer, /from\('equipment_brain_versions'\)/);
  assert.match(scorer, /const equipmentContextSourceAvailable = !equipmentResult\.error && !equipmentVariantsResult\.error/);
  assert.match(scorer, /const sourceError = \[heroesResult, skillsResult, equipmentResult, equipmentVariantsResult, seasonResult, heroVersionsResult, equipmentVersionsResult\]/);
  assert.match(scorer, /if \(sourceError\) return json\(\{ error: 'knowledge_source_unavailable'/);
});

test('contexto é determinístico e entra antes do blend aprendido sem mudar o vetor v4 treinado', () => {
  const contextAt = position('const rawEquipmentContext = assessCompositionEquipmentContextV1(heroes, equipmentCatalogue)');
  const baseAt = position('const heroSkillSemanticScore = Number(assessment.score)');
  const adjustedAt = position('const semanticScore = Number(clamp(heroSkillSemanticScore + equipmentAdjustment, 0, 100).toFixed(2))');
  const learnedAt = position('predict(spec.weights, featureVectorV4(heroes, spec.schema))');
  const finalAt = position('observedPerformance === null ? semanticScore : semanticScore * (1 - effectiveInfluence) + observedPerformance * effectiveInfluence');
  assert.ok(contextAt < adjustedAt && baseAt < adjustedAt);
  assert.ok(learnedAt < finalAt && adjustedAt < finalAt);
  assert.equal(scorer.includes('featureVectorV4(heroes, equipment'), false, 'equipamento não pode entrar disfarçado no vetor v4 treinado');
  assert.match(scorer, /it is NOT a fake v5 model/i);
});

test('cobertura insuficiente zera ajuste; fonte indisponível é rejeitada antes da nota', () => {
  assert.match(scorer, /const equipmentAdjustment = equipmentContextSourceAvailable && equipmentContext\.applied\s*\? Number\(equipmentContext\.adjustment \|\| 0\)\s*:\s*0/);
  assert.match(context, /const adjustment = sufficient\s*\?[\s\S]*:\s*0/);
  assert.match(context, /cobertura semântica suficiente[\s\S]*nenhum ajuste/i);
  assert.match(scorer, /knowledge_source_unavailable/);
});

test('scorer declara que mede potencial do catálogo e não uma build equipada', () => {
  assert.match(scorer, /selectedLoadoutAssumed: false/);
  assert.match(scorer, /setBonusesAssumed: false/);
  assert.match(scorer, /bestSemanticSupportPerSlotOnly: true/);
  assert.equal(scorer.includes("from('equipment_set_bonuses')"), false, 'v1 não pode assumir bônus de conjunto sem loadout selecionado');
  assert.equal(scorer.includes('bestBySlot:'), false, 'resposta pública não precisa expor item vencedor interno de cada slot');
});

test('ajuste público é explicitamente limitado e auditável', () => {
  assert.match(context, /COMPOSITION_EQUIPMENT_CONTEXT_V1_MAX_ADJUSTMENT = 4/);
  assert.match(scorer, /equipmentAdjustment: Number\(equipmentAdjustment\.toFixed\(2\)\)/);
  assert.match(scorer, /equipmentContextAdjustment: Number\(equipmentAdjustment\.toFixed\(2\)\)/);
  assert.match(scorer, /equipmentContextSchema: COMPOSITION_EQUIPMENT_CONTEXT_V1_SCHEMA/);
  assert.match(scorer, /equipmentContextSchemaVersion: COMPOSITION_EQUIPMENT_CONTEXT_V1_SCHEMA/);
  assert.match(scorer, /\['equipmentAdjustment', 1\]/);
});

test('confiança expõe equipamento como componente separado sem apagar os componentes existentes', () => {
  for (const token of ['rules:', 'verification:', 'knowledgeFreshness:', 'equipmentContext:', 'model:', 'observedEvidence:', 'overall:']) {
    assert.ok(scorer.includes(token), `componente de confiança ausente: ${token}`);
  }
});
