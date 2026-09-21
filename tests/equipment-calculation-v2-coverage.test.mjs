import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  groupCalculationResolutionOccurrences,
  matchCalculationAttribute,
  publishedCalculationCoverage
} from '../admin/js/equipment-calculation-v2-coverage.js';

const catalog = JSON.parse(await readFile(
  new URL('./fixtures/calculation-semantic-catalog.json', import.meta.url),
  'utf8'
));
const [assistantSource, auditSource, editorSource, contractMigration] = await Promise.all([
  readFile(new URL('../admin/js/equipment-attribute-assistant.js', import.meta.url), 'utf8'),
  readFile(new URL('../admin/js/equipment-audit-v4.js', import.meta.url), 'utf8'),
  readFile(new URL('../admin/js/equipment-calculation-v2.js', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260920020646_calculation_resolution_contract_v2.sql', import.meta.url), 'utf8')
]);

const operations = [
  { id: 'flat', state: 'published' },
  { id: 'percent', state: 'published' }
];

function aliasFor(target) {
  return catalog.aliases.find(alias => alias.target === target);
}

function knownEffects() {
  const aimedAlias = aliasFor('weapon.aimed_range');
  const spreadAlias = aliasFor('weapon.spread_factor');
  return [
    {
      id: '10000000-0000-4000-8000-000000000001',
      kind: 'numeric',
      description: 'AO ALCANCE DO TIRO COM MIRA DO HERÓI',
      originalText: '+17 AO ALCANCE DO TIRO COM MIRA DO HERÓI',
      normalizedText: 'ao alcance do tiro com mira do heroi',
      observedUnit: 'implicit',
      semanticContext: 'aiming',
      resolvedAliasId: aimedAlias.id,
      definitionVersion: 1,
      resolutionStatus: 'resolved',
      target: 'weapon.aimed_range',
      operation: 'flat',
      rarityEvidence: {
        comum: {
          originalText: '+17 AO ALCANCE DO TIRO O COM MIRA DO HERÓI',
          sourceImageReference: 'bornal-comum.png',
          observedUnit: 'implicit'
        }
      },
      values: { comum: 17 }
    },
    {
      id: '10000000-0000-4000-8000-000000000002',
      kind: 'numeric',
      description: 'AO RECUO DA ARMA DO HERÓI',
      originalText: '-25% AO RECUO DA ARMA DO HERÓI',
      normalizedText: 'ao recuo da arma do heroi',
      observedUnit: 'percent',
      semanticContext: 'spread_factor',
      resolvedAliasId: spreadAlias.id,
      definitionVersion: 1,
      resolutionStatus: 'resolved',
      target: 'weapon.spread_factor',
      operation: 'percent',
      rarityEvidence: {
        comum: {
          originalText: '-25% AO RECUO DA ARMA DO HERÓI',
          sourceImageReference: 'bornal-comum.png',
          observedUnit: 'percent'
        }
      },
      values: { comum: -25 }
    }
  ];
}

function workspace({ published = null, revision = 4, effects = knownEffects(), definitions = catalog.definitions, aliases = catalog.aliases } = {}) {
  return {
    contract: 'echo-calculation-workspace/v2',
    revision,
    state: published?.workspaceRevision === revision ? 'published' : 'draft',
    effects,
    definitions,
    aliases,
    contexts: [],
    operations,
    published
  };
}

function coverage(options = {}) {
  return publishedCalculationCoverage(workspace(options), { source: 'fixture' });
}

const aimedAttribute = {
  label: 'AO ALCANCE DO TIRO O COM MIRA DO HERÓI',
  value: '17',
  operator: 'increase_flat',
  raw: '+17 AO ALCANCE DO TIRO O COM MIRA DO HERÓI'
};
const spreadAttribute = {
  label: 'AO RECUO DA ARMA DO HERÓI',
  value: '25',
  operator: 'decrease_percent',
  unit: '%',
  raw: '-25% AO RECUO DA ARMA DO HERÓI'
};

test('1. alias e fórmula publicados em rascunho resolvem sem erro de auditoria', () => {
  const draft = coverage();
  const aimed = matchCalculationAttribute(aimedAttribute, { coverage: draft, raritySlug: 'comum' });
  const spread = matchCalculationAttribute(spreadAttribute, { coverage: draft, raritySlug: 'comum' });
  assert.deepEqual([aimed.status, spread.status], ['resolved', 'resolved']);
  assert.deepEqual([aimed.target, spread.target], ['weapon.aimed_range', 'weapon.spread_factor']);
  assert.equal(aimed.publicationStatus, 'draft');
  assert.equal(spread.publicationStatus, 'draft');
  assert.equal([aimed, spread].filter(item => item.contentIssue).length, 0);
});

test('2. publicação da mesma revisão é distinta de publicação desatualizada', () => {
  const current = coverage({ published: { id: 8, workspaceRevision: 4, fingerprint: 'abc' } });
  const stale = coverage({ published: { id: 7, workspaceRevision: 3, fingerprint: 'old' } });
  assert.equal(current.publicationStatus, 'published');
  assert.equal(stale.publicationStatus, 'stale_publication');
  assert.equal(matchCalculationAttribute(spreadAttribute, { coverage: stale, raritySlug: 'comum' }).status, 'resolved');
});

test('3. texto novo sem alias gera uma pendência agrupada entre onze raridades', () => {
  const draft = coverage();
  const occurrences = Array.from({ length: 11 }, (_, index) => {
    const raritySlug = `raridade-${index + 1}`;
    const match = matchCalculationAttribute({
      label: 'RESSONÂNCIA QUÂNTICA DA ARMA',
      value: String(index + 1),
      operator: 'increase_percent',
      unit: '%'
    }, { coverage: draft, raritySlug });
    return { match, raritySlug };
  });
  const groups = groupCalculationResolutionOccurrences(occurrences);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].status, 'pending_alias');
  assert.equal(groups[0].rarityCount, 11);
  assert.equal(groups[0].occurrenceCount, 11);
});

test('4. fórmula não publicada permanece pendente e não expõe destino calculável', () => {
  const definitions = catalog.definitions.map(definition => definition.id === 'weapon.aimed_range'
    ? { ...definition, formulaState: 'draft', policy: { ...definition.policy, state: 'draft' } }
    : definition);
  const result = matchCalculationAttribute({
    label: 'AO ALCANCE DO TIRO COM MIRA DO HERÓI',
    value: '17',
    operator: 'increase_flat'
  }, { coverage: coverage({ effects: [], definitions }), raritySlug: 'comum' });
  assert.equal(result.status, 'formula_unpublished');
  assert.equal(result.target, null);
  assert.equal(result.contentIssue, true);
});

test('5. contexto, unidade, operação e valor retornam motivos específicos', () => {
  const noWorkspace = coverage({ effects: [] });
  const context = matchCalculationAttribute({
    label: 'AO ALCANCE DO TIRO COM MIRA DO HERÓI', value: '1', operator: 'increase_flat'
  }, { coverage: noWorkspace, context: 'hip_fire' });
  const unit = matchCalculationAttribute({
    label: 'AO ALCANCE DO TIRO COM MIRA DO HERÓI', value: '1', operator: 'increase_flat', unit: 'segundos'
  }, { coverage: noWorkspace });
  const restrictedAliases = catalog.aliases.map(alias => alias.target === 'weapon.aimed_range'
    ? { ...alias, allowedOperations: ['percent'] }
    : alias);
  const restrictedDefinitions = catalog.definitions.map(definition => definition.id === 'weapon.aimed_range'
    ? { ...definition, allowedOperations: ['percent'] }
    : definition);
  const operation = matchCalculationAttribute({
    label: 'AO ALCANCE DO TIRO COM MIRA DO HERÓI', value: '1', operator: 'increase_flat'
  }, { coverage: coverage({ effects: [], aliases: restrictedAliases, definitions: restrictedDefinitions }) });
  const value = matchCalculationAttribute({
    label: 'AO ALCANCE DO TIRO COM MIRA DO HERÓI', value: 'não sei', operator: 'increase_flat'
  }, { coverage: noWorkspace });
  assert.deepEqual(
    [context.status, unit.status, operation.status, value.status],
    ['context_mismatch', 'unit_mismatch', 'operation_mismatch', 'invalid_value']
  );
});

test('6. dois efeitos conhecidos e um desconhecido preservam cálculo parcial', () => {
  const draft = coverage();
  const matches = [
    matchCalculationAttribute(aimedAttribute, { coverage: draft, raritySlug: 'comum' }),
    matchCalculationAttribute(spreadAttribute, { coverage: draft, raritySlug: 'comum' }),
    matchCalculationAttribute({
      label: 'MECÂNICA INÉDITA', value: '3', operator: 'increase_flat'
    }, { coverage: draft, raritySlug: 'comum' })
  ];
  assert.equal(matches.filter(item => item.status === 'resolved').length, 2);
  assert.equal(matches.filter(item => item.contentIssue).length, 1);
});

test('7. aliases de contextos distintos não colidem', () => {
  const draft = coverage({ effects: [] });
  const hip = matchCalculationAttribute({
    label: 'DISPERSÃO SEM MIRA', value: '5', operator: 'decrease_percent', unit: '%'
  }, { coverage: draft, context: 'hip_fire' });
  const aimed = matchCalculationAttribute({
    label: 'DISPERSÃO AO MIRAR', value: '5', operator: 'decrease_percent', unit: '%'
  }, { coverage: draft, context: 'aiming' });
  assert.deepEqual([hip.target, hip.context, aimed.target, aimed.context], [
    'weapon.spread', 'hip_fire', 'weapon.aimed_spread', 'aiming'
  ]);
});

test('8. modal, simulador e auditoria consomem a mesma autoridade', () => {
  assert.match(assistantSource, /matchCalculationAttribute/);
  assert.match(auditSource, /matchCalculationAttribute/);
  assert.match(assistantSource, /equipment:calculation-v2-coverage-changed/);
  assert.match(editorSource, /equipment:calculation-v2-coverage-changed/);
  assert.doesNotMatch(auditSource, /resolveEquipmentModifierRule|Central de Status · vínculo publicado/);
});

test('9. mudanças relevantes reexecutam e difundem a resolução', () => {
  assert.match(editorSource, /publishAliasForCard[\s\S]*renderPreview\(\)/);
  assert.match(editorSource, /publishDefinitionForCard[\s\S]*renderPreview\(\)/);
  assert.match(editorSource, /runReprocessAction[\s\S]*renderPreview\(\)/);
  assert.match(editorSource, /handleEquipmentSaveSuccess[\s\S]*renderPreview\(\)/);
  assert.match(editorSource, /broadcastCalculationCoverage\(\)/);
});

test('10. onze raridades e dois bônus formam dois efeitos e 22 evidências', () => {
  const draft = coverage();
  const occurrences = [];
  for (let index = 0; index < 11; index += 1) {
    const raritySlug = index === 0 ? 'comum' : `raridade-${index + 1}`;
    const aimed = index === 0
      ? matchCalculationAttribute(aimedAttribute, { coverage: draft, raritySlug })
      : matchCalculationAttribute({
        label: 'AO ALCANCE DO TIRO COM MIRA DO HERÓI', value: String(18 + index), operator: 'increase_flat'
      }, { coverage: draft, raritySlug });
    const spread = index === 0
      ? matchCalculationAttribute(spreadAttribute, { coverage: draft, raritySlug })
      : matchCalculationAttribute({
        label: 'AO RECUO DA ARMA DO HERÓI', value: String(26 + index), operator: 'decrease_percent', unit: '%'
      }, { coverage: draft, raritySlug });
    occurrences.push({ match: aimed, raritySlug }, { match: spread, raritySlug });
  }
  const groups = groupCalculationResolutionOccurrences(occurrences);
  assert.equal(groups.length, 2);
  assert.equal(groups.reduce((sum, group) => sum + group.occurrenceCount, 0), 22);
});

test('11. a Central antiga não sobrescreve o catálogo semântico', () => {
  assert.doesNotMatch(auditSource, /status-registry-client|resolveEquipmentModifierRule/);
  assert.match(assistantSource, /Central antiga não substituirá esta decisão/);
  assert.ok(assistantSource.indexOf("semanticMatch.status === 'resolved'") < assistantSource.indexOf("classification === 'informational'"));
});

test('12. front-end e backend expõem a mesma classificação e os metadados obrigatórios', () => {
  for (const token of [
    'originalText', 'normalizedText', 'aliasState', 'canonicalKey',
    'definitionVersion', 'definitionState', 'formulaState', 'context',
    'observedUnit', 'operation', 'resolutionStatus', 'workspaceRevision',
    'publicationId', 'publishedRevision', 'publicationStatus'
  ]) assert.match(contractMigration, new RegExp(`'${token}'`));
  assert.match(contractMigration, /admin_get_calculation_resolution_coverage_v2/);
  assert.match(contractMigration, /calculation_validate_workspace_resolution_v2/);
  assert.match(contractMigration, /CALCULATION_WORKSPACE_RESOLUTION_STALE/);
  assert.match(auditSource, /admin_get_calculation_resolution_coverage_v2/);
});

test('13. banco incompatível gera um único problema de infraestrutura, não conteúdo falso', () => {
  const incompatible = publishedCalculationCoverage({ definitions: [] });
  const match = matchCalculationAttribute(aimedAttribute, { coverage: incompatible, raritySlug: 'comum' });
  assert.equal(incompatible.compatible, false);
  assert.equal(match.status, 'catalog_incompatible');
  assert.equal(match.infrastructureIssue, true);
  assert.equal(match.contentIssue, false);
  assert.match(match.message, /Catálogo semântico indisponível ou incompatível neste ambiente/);
  assert.match(auditSource, /não converteu esta falha em pendências de equipamentos/);
});

test('14. nenhum equipamento conhecido exige condicional por nome ou slug', () => {
  const combined = `${assistantSource}\n${auditSource}\n${editorSource}`;
  assert.doesNotMatch(combined, /equipment\.(?:slug|name)\s*===|equipment\.name\.includes/);
  assert.doesNotMatch(combined, /Bornal|Boina/);
});
