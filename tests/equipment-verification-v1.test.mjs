import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearEquipmentVerificationV1Cache,
  indexEquipmentVerificationV1,
  loadEquipmentVerificationV1,
  resolveEquipmentVerificationV1,
} from '../js/equipment-verification-v1.js';

const publication = {
  id: 10,
  workspaceRevision: 3,
  fingerprint: 'a'.repeat(64),
  publishedAt: '2026-09-16T12:00:00Z',
};

function sourceReference(kind) {
  if (kind === 'official') return 'zeptolab-official:equipment-table-v1';
  if (kind === 'game_capture') return `game-capture:sha256:${'b'.repeat(64)}`;
  return `source-${kind}`;
}

function numeric(kind = 'official', id = `numeric-${kind}`) {
  return {
    id,
    kind: 'numeric',
    description: 'Efeito numérico publicado.',
    target: 'hero.health',
    operation: 'flat',
    scope: 'self',
    condition: 'always',
    conditionExpected: null,
    evaluatedOn: 'source',
    source: kind ? { kind, reference: sourceReference(kind) } : null,
    values: { comum: 1 },
  };
}

function equipment(effects, overrides = {}) {
  return {
    id: 'equipment-one',
    publication: { ...publication },
    effects,
    ...overrides,
  };
}

function rawCatalog(items = [equipment([numeric()])]) {
  return {
    contract: 'echo-calculation-catalog/v2',
    catalogRevision: 'revision-1',
    generatedAt: '2026-09-16T12:00:00Z',
    definitions: [],
    conditions: [],
    rarities: [],
    equipment: items,
  };
}

test('exige publicação válida e ao menos um efeito numérico', () => {
  assert.equal(resolveEquipmentVerificationV1(equipment([numeric()], { publication: null })), null);
  assert.equal(resolveEquipmentVerificationV1(equipment([numeric()], {
    publication: { ...publication, fingerprint: 'inválido' },
  })), null);
  assert.equal(resolveEquipmentVerificationV1(equipment([{
    id: 'info', kind: 'informational', description: 'Texto conhecido.',
    scope: 'self', condition: 'always', conditionExpected: null, evaluatedOn: 'source',
  }])), null);
});

test('qualquer unresolved elimina o selo mesmo com fonte oficial', () => {
  const unresolved = {
    id: 'pending', kind: 'unresolved', description: 'Valor ainda pendente.',
    scope: 'self', condition: 'always', conditionExpected: null, evaluatedOn: 'source',
  };
  assert.equal(resolveEquipmentVerificationV1(equipment([numeric(), unresolved])), null);
});

test('todos os efeitos numéricos oficiais recebem Oficial ZeptoLab', () => {
  assert.deepEqual(resolveEquipmentVerificationV1(equipment([
    numeric('official', 'one'),
    numeric('official', 'two'),
  ])), {
    kind: 'official',
    label: 'Oficial ZeptoLab',
  });
});

test('fontes somente official/game_capture com captura recebem Verificação Master', () => {
  assert.deepEqual(resolveEquipmentVerificationV1(equipment([
    numeric('official', 'one'),
    numeric('game_capture', 'two'),
  ])), {
    kind: 'master',
    label: 'Verificação Master',
  });
  assert.equal(resolveEquipmentVerificationV1(equipment([
    numeric('game_capture'),
  ]))?.kind, 'master');
});

test('fonte numérica ausente ou diferente das duas permitidas não recebe selo', () => {
  assert.equal(resolveEquipmentVerificationV1(equipment([numeric(null)])), null);
  assert.equal(resolveEquipmentVerificationV1(equipment([{
    ...numeric('official'), source: { kind: 'official', reference: '' },
  }])), null);
  assert.equal(resolveEquipmentVerificationV1(equipment([numeric('developer_statement')])), null);
  assert.equal(resolveEquipmentVerificationV1(equipment([
    numeric('official', 'one'),
    numeric('other', 'two'),
  ])), null);
  assert.equal(resolveEquipmentVerificationV1(equipment([
    numeric(), { kind: 'unknown' },
  ])), null);
});

test('fonte válida não mascara vínculo ou valores numéricos incompletos', () => {
  assert.equal(resolveEquipmentVerificationV1(equipment([{
    ...numeric('game_capture'), target: '',
  }])), null);
  assert.equal(resolveEquipmentVerificationV1(equipment([{
    ...numeric('game_capture'), operation: null,
  }])), null);
  assert.equal(resolveEquipmentVerificationV1(equipment([{
    ...numeric('game_capture'), values: { comum: null, raro: null },
  }])), null);
});

test('referência declarada sem evidência estruturada nunca gera selo', () => {
  const arbitraryReferences = [
    { kind: 'game_capture', reference: 'captura-direta-do-jogo' },
    { kind: 'game_capture', reference: `game-capture:sha256:${'a'.repeat(63)}` },
    { kind: 'game_capture', reference: `game-capture:sha256:${'A'.repeat(64)}` },
    { kind: 'game_capture', reference: `game-capture:sha256:${'a'.repeat(64)}\n` },
    { kind: 'official', reference: 'site oficial da ZeptoLab' },
    { kind: 'official', reference: 'zeptolab-official:' },
    { kind: 'official', reference: 'zeptolab-official:ab' },
    { kind: 'official', reference: 'zeptolab-official:tabela oficial' },
    { kind: 'official', reference: 'zeptolab-official:equipment-table-v1\n' },
  ];

  for (const source of arbitraryReferences) {
    assert.equal(resolveEquipmentVerificationV1(equipment([{
      ...numeric(source.kind),
      source,
    }])), null, `${source.kind}:${source.reference}`);
  }
});

test('aceita somente as referências canônicas das duas origens verificáveis', () => {
  assert.equal(resolveEquipmentVerificationV1(equipment([{
    ...numeric('game_capture'),
    source: { kind: 'game_capture', reference: `game-capture:sha256:${'0'.repeat(64)}` },
  }]))?.kind, 'master');
  assert.equal(resolveEquipmentVerificationV1(equipment([{
    ...numeric('official'),
    source: { kind: 'official', reference: 'zeptolab-official:gear-table/v2.1' },
  }]))?.kind, 'official');
});

test('índice omite itens sem selo e usa ids textuais', () => {
  const index = indexEquipmentVerificationV1({ equipment: [
    equipment([numeric()], { id: 42 }),
    equipment([numeric('other')], { id: 43 }),
  ] });
  assert.deepEqual([...index.keys()], ['42']);
  assert.equal(index.get('42')?.label, 'Oficial ZeptoLab');
});

test('loader compartilha a Promise por cliente e permite limpar o cache', async () => {
  let calls = 0;
  const supabase = {
    async rpc(name) {
      calls += 1;
      assert.equal(name, 'get_calculation_catalog_v2');
      return { data: rawCatalog(), error: null };
    },
  };

  const [first, second] = await Promise.all([
    loadEquipmentVerificationV1(supabase),
    loadEquipmentVerificationV1(supabase),
  ]);
  assert.equal(first, second);
  assert.equal(calls, 1);

  clearEquipmentVerificationV1Cache(supabase);
  await loadEquipmentVerificationV1(supabase, { force: true });
  assert.equal(calls, 2);
});

test('falha do RPC não envenena o cache do loader', async () => {
  let calls = 0;
  const supabase = {
    async rpc() {
      calls += 1;
      return calls === 1
        ? { data: null, error: { message: 'rpc indisponível' } }
        : { data: rawCatalog(), error: null };
    },
  };

  await assert.rejects(loadEquipmentVerificationV1(supabase), /rpc indisponível/);
  const result = await loadEquipmentVerificationV1(supabase);
  assert.equal(result.get('equipment-one')?.kind, 'official');
  assert.equal(calls, 2);
});
