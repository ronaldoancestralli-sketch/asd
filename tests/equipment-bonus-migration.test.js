import {
  buildBonusMigrationAudit
} from '../js/equipment-audit-rules.js?v=3';

const tests = [];
const results = document.getElementById('results');

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Condição não atendida.');
}

function assertEqual(actual, expected, label = '') {
  if (actual !== expected) {
    throw new Error(`${label ? `${label}: ` : ''}esperado ${expected}, recebido ${actual}`);
  }
}

function audit(rows, externalClassifications = []) {
  const sets = new Map([['set-1', { id: 'set-1', name: 'Conjunto de teste' }]]);
  return buildBonusMigrationAudit(rows.map((row, index) => ({
    id: `bonus-${index + 1}`,
    set_id: 'set-1',
    required_pieces: row.required_pieces,
    title: row.title || '',
    description: row.description || '',
    stats: row.stats ?? null
  })), sets, externalClassifications);
}

const SWAP_MODE_EXTERNAL = [{
  active: true,
  classification: 'external_data_required',
  raw_label: 'Tempo de troca de modo da arma primária percentual',
  display_label: 'Tempo de troca de modo da arma primária',
  reason: 'O efeito é real, mas falta a base oficial.',
  missing_data: 'Tempo-base oficial da troca de modo da arma primária.',
  public_note: 'Resultado final indisponível enquanto a base não for pública.'
}];

test('Repetição idêntica em 4 peças não duplica o efeito de 2 peças', () => {
  const result = audit([
    { required_pieces: 2, description: '+5% de vida' },
    { required_pieces: 4, description: '+5% de vida; +10 de alcance de visão' }
  ]);

  assert(result.rows[0].safe, '2 peças deveria ser migrável');
  assert(result.rows[1].safe, '4 peças deveria ser migrável');
  assertEqual(result.rows[1].proposal['alcance de visao'], undefined, 'não deve inventar chave textual');
  assertEqual(result.rows[1].proposal.vision_range, 10, 'deve migrar somente o novo alcance');
  assertEqual(Object.keys(result.rows[1].proposal).length, 1, 'deve conter somente um efeito incremental');
});

test('Mesmo atributo com valor maior no marco seguinte é bloqueado como ambíguo', () => {
  const result = audit([
    { required_pieces: 2, description: '+5% de vida' },
    { required_pieces: 4, description: '+10% de vida' }
  ]);

  assert(result.rows[0].safe, '2 peças deveria ser migrável');
  assert(!result.rows[1].safe, '4 peças não pode ser migrado automaticamente');
  assert(
    result.rows[1].issues.some(issue => /cumulativo ambíguo/i.test(issue)),
    'deveria explicar a ambiguidade cumulativa'
  );
});

test('Dois efeitos novos reconhecidos no mesmo marco podem ser estruturados', () => {
  const result = audit([
    { required_pieces: 2, description: '+5% de vida; +3 de capacidade de munição' }
  ]);

  const row = result.rows[0];
  assert(row.safe, 'marco deveria ser migrável');
  assertEqual(row.proposal.health_max_pct, 5, 'vida');
  assertEqual(row.proposal.magazine_size, 3, 'munição');
});

test('Efeito realmente desconhecido continua bloqueando proposta automática', () => {
  const result = audit([
    { required_pieces: 2, description: '+5% de vida; +12% de teletransporte quântico' }
  ]);

  const row = result.rows[0];
  assert(!row.safe, 'não deve migrar parcialmente um efeito sem classificação');
  assert(
    row.issues.some(issue => /sem regra no motor/i.test(issue)),
    'deveria registrar o efeito sem regra'
  );
});

test('Efeito estático aguardando dado oficial não bloqueia a parte calculável', () => {
  const result = audit([
    { required_pieces: 2, description: '+5% de vida; -15% ao tempo de abertura de caixa' }
  ]);

  const row = result.rows[0];
  assert(row.safe, 'a parte calculável deveria continuar migrável');
  assertEqual(row.proposal.health_max_pct, 5, 'vida deve ser estruturada');
  assertEqual(row.externalClaims.length, 1, 'abertura de caixa deve ficar separada');
  assert(/abertura/i.test(row.externalClaims[0].externalData.label), 'deveria identificar abertura de caixa');
});

test('Classificação persistente aguardando dado oficial não bloqueia recarga', () => {
  const result = audit([
    {
      required_pieces: 2,
      description: '-10% ao tempo de recarregamento da arma do herói; -10% ao tempo de troca de modo da arma primária do herói'
    }
  ], SWAP_MODE_EXTERNAL);

  const row = result.rows[0];
  assert(row.safe, 'recarga deveria continuar migrável');
  assertEqual(row.proposal.reload_time_pct, -10, 'recarga');
  assertEqual(row.externalClaims.length, 1, 'troca de modo deve ficar fora do cálculo');
  assert(/troca de modo/i.test(row.externalClaims[0].externalData.label), 'deveria usar a classificação persistente');
});

test('Marco contendo somente efeito externo vira Aguardando dado oficial e não erro', () => {
  const result = audit([
    {
      required_pieces: 2,
      description: '-10% ao tempo de troca de modo da arma primária do herói'
    }
  ], SWAP_MODE_EXTERNAL);

  const row = result.rows[0];
  assertEqual(row.mode, 'external-data');
  assertEqual(row.issues.length, 0, 'não deve gerar erro');
  assert(!row.safe, 'não há parte matemática para gravar');
  assertEqual(row.externalClaims.length, 1);
});

test('Bônus 2/4/6 separa parte calculável dos efeitos externos sem duplicar herança', () => {
  const result = audit([
    { required_pieces: 2, description: '+5% ao dano da arma à vida do inimigo' },
    { required_pieces: 4, description: '+5% ao dano da arma à vida do inimigo; +10 ao alcance do tiro com mira do herói' },
    { required_pieces: 6, description: '+5% ao dano da arma à vida do inimigo; +10 ao alcance do tiro com mira do herói; -10% ao tempo de recarregamento da arma do herói; -10% ao tempo de troca de modo da arma primária do herói; -15% ao tempo de abertura de caixa' }
  ], SWAP_MODE_EXTERNAL);

  const row = result.rows[2];
  assert(row.safe, '6 peças deveria permitir estruturar somente o efeito calculável novo');
  assertEqual(Object.keys(row.proposal).length, 1, 'somente recarga deve entrar na proposta');
  assertEqual(row.proposal.reload_time_pct, -10, 'recarga de 6 peças');
  assertEqual(row.externalClaims.length, 2, 'troca de modo e abertura de caixa devem permanecer externos');
});

test('Bônus sem valor numérico permanece para revisão como possível informativo', () => {
  const result = audit([
    { required_pieces: 2, description: 'Permite detectar inimigos próximos.' }
  ]);

  const row = result.rows[0];
  assert(!row.safe, 'não deve criar stats sem números reais');
  assert(
    row.issues.some(issue => /especial\/informativo/i.test(issue)),
    'deveria sugerir revisão como informativo'
  );
});

test('Stats já estruturados continuam estruturados e são validados no motor', () => {
  const result = audit([
    {
      required_pieces: 2,
      description: '+5% de vida',
      stats: { health_max_pct: 5 }
    }
  ]);

  const row = result.rows[0];
  assertEqual(row.mode, 'structured');
  assertEqual(row.issues.length, 0);
});

let passed = 0;
let failed = 0;
const rendered = [];

for (const item of tests) {
  try {
    await item.fn();
    passed += 1;
    rendered.push(`<li><span class="badge pass">PASSOU</span><div><span class="test-title">${item.name}</span></div></li>`);
  } catch (error) {
    failed += 1;
    rendered.push(`<li><span class="badge fail">FALHOU</span><div><span class="test-title">${item.name}</span><span class="test-detail">${String(error?.message || error)}</span></div></li>`);
  }
}

document.getElementById('total').textContent = String(tests.length);
document.getElementById('passed').textContent = String(passed);
document.getElementById('failed').textContent = String(failed);
results.innerHTML = rendered.join('');
