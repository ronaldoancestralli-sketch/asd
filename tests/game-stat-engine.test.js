import {
  applyEquipmentStats,
  buildRealStatLines,
  calculateShotDistribution,
  SHOT_DISTRIBUTION_LIMITS,
  SHOT_DISTRIBUTION_SOURCE
} from '../js/game-stat-engine.js?v=15';

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function assertEqual(actual, expected, label = '') {
  if (actual !== expected) {
    throw new Error(`${label ? `${label}: ` : ''}esperado ${expected}, recebido ${actual}`);
  }
}

function assertClose(actual, expected, epsilon = 1e-9, label = '') {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > epsilon) {
    throw new Error(`${label ? `${label}: ` : ''}esperado ${expected}, recebido ${actual}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Condição não atendida.');
}

test('Percentuais sequenciais usam o valor já atualizado', () => {
  const result = applyEquipmentStats(
    { health: 1000 },
    [{ health_max_pct: 10 }, { health_max_pct: 10 }]
  );
  assertClose(result.final.health, 1210, 1e-9, 'vida final');
  assertClose(result.applied[0].before, 1000);
  assertClose(result.applied[0].after, 1100);
  assertClose(result.applied[1].before, 1100);
  assertClose(result.applied[1].after, 1210);
});

test('A ordem entre soma fixa e percentual continua relevante', () => {
  const flatThenPct = applyEquipmentStats(
    { health: 1000 },
    [{ health: 100 }, { health_max_pct: 10 }]
  );
  const pctThenFlat = applyEquipmentStats(
    { health: 1000 },
    [{ health_max_pct: 10 }, { health: 100 }]
  );
  assertClose(flatThenPct.final.health, 1210);
  assertClose(pctThenFlat.final.health, 1200);
});

test('Penetração de armadura soma pontos percentuais', () => {
  const result = applyEquipmentStats(
    { weapon_armor_penetration: 85 },
    [{ armor_penetration: 6 }]
  );
  assertClose(result.final.armor_penetration, 91);
  assertEqual(result.applied[0].operation, 'add');
  assertClose(result.applied[0].before, 85);
  assertClose(result.applied[0].after, 91);
});

test('Dano contra vida percentual altera o multiplicador de forma sequencial', () => {
  const result = applyEquipmentStats(
    { health_damage_multiplier: 1 },
    [{ weapon_damage_to_health_pct: 5 }, { weapon_damage_to_health_pct: 10 }]
  );
  assertClose(result.final.health_damage_multiplier, 1.155);
  assertEqual(result.applied.length, 2);
  assertEqual(result.applied[0].operation, 'percent');
});

test('Descrição portuguesa com “percentual” é tratada como percentual', () => {
  const result = applyEquipmentStats(
    { armor_drone_multiplier: 1 },
    [{ 'Dano da arma a armadura do inimigo percentual': 3 }]
  );
  assertClose(result.final.armor_drone_multiplier, 1.03);
  assertEqual(result.applied[0].operation, 'percent');
});

test('Tempo de recarga percentual reduz o valor quando recebe bônus negativo', () => {
  const result = applyEquipmentStats(
    { reload_time: 2 },
    [{ reload_time_pct: -10 }]
  );
  assertClose(result.final.reload_time, 1.8);
});

test('Atributos desconhecidos não são inventados nem aplicados', () => {
  const result = applyEquipmentStats(
    { health: 1000 },
    [{ mecanica_totalmente_nova: 25 }]
  );
  assertClose(result.final.health, 1000);
  assertEqual(result.applied.length, 0);
  assert(result.unknown.some(item => item.includes('mecanica_totalmente_nova')), 'A chave desconhecida deveria aparecer em unknown.');
});

test('Linhas oficiais mantêm unidade percentual da penetração', () => {
  const calculation = applyEquipmentStats(
    { weapon_armor_penetration: 85, health: 1000 },
    [{ armor_penetration: 6 }]
  );
  const lines = buildRealStatLines(calculation, 99);
  const penetration = lines.find(line => line.key === 'armor_penetration');
  assert(penetration, 'Linha de penetração não encontrada.');
  assertEqual(penetration.unit, '%');
  assertClose(penetration.base, 85);
  assertClose(penetration.valor, 91);
  assertClose(penetration.difference, 6);
});

test('Distribuição do disparo usa penetração e resistência do alvo', () => {
  const result = calculateShotDistribution({
    damage_per_shot: 1000,
    armor_penetration: 80,
    health_damage_multiplier: 1,
    armor_drone_multiplier: 1
  }, 25);
  assertClose(result.effectivePenetration, 60);
  assertClose(result.healthShare, 0.6);
  assertClose(result.armorShare, 0.4);
  assertClose(result.healthDamage, 600);
  assertClose(result.armorDamage, 400);
  assertEqual(result.complete, true);
});

test('Exemplo oficial da ZeptoLab resulta em 98 de vida e 902 de armadura após arredondamento', () => {
  const result = calculateShotDistribution({
    damage_per_shot: 1000,
    armor_penetration: 11,
    health_damage_multiplier: 1,
    armor_drone_multiplier: 1
  }, 11);
  assertClose(result.effectivePenetration, 9.79);
  assertClose(result.healthDamage, 97.9);
  assertClose(result.armorDamage, 902.1);
  assertEqual(Math.round(result.healthDamage), 98);
  assertEqual(Math.round(result.armorDamage), 902);
  assertEqual(result.formulaModel, 'zeptolab-armor-penetration-rework');
});

test('Sem armadura ativa, todo o dano-base segue para a vida', () => {
  const result = calculateShotDistribution({
    damage_per_shot: 500,
    armor_penetration: 35,
    health_damage_multiplier: 1.1
  }, { armorActive: false, armorResistance: 90 });
  assertEqual(result.effectivePenetration, null);
  assertClose(result.healthShare, 1);
  assertClose(result.armorShare, 0);
  assertClose(result.healthDamage, 550);
  assertClose(result.armorDamage, 0);
  assertEqual(result.complete, true);
});

test('Fórmula continua disponível sem inventar multiplicadores ausentes', () => {
  const result = calculateShotDistribution({
    damage_per_shot: 1000,
    armor_penetration: 40
  }, 25);
  assertEqual(result.formulaComplete, true);
  assertEqual(result.multipliersComplete, false);
  assertEqual(result.complete, false);
  assertClose(result.healthDamageBeforeMultiplier, 300);
  assertClose(result.armorDamageBeforeMultiplier, 700);
  assertEqual(result.healthDamage, null);
  assertEqual(result.armorDamage, null);
});

test('Poder de perfuração não altera a divisão entre vida e armadura', () => {
  const base = {
    damage_per_shot: 800,
    armor_penetration: 40,
    health_damage_multiplier: 1.05,
    armor_drone_multiplier: 0.95
  };
  const normal = calculateShotDistribution(base, 20);
  const highPiercing = calculateShotDistribution({ ...base, penetration_power: 9999 }, 20);
  assertClose(highPiercing.healthDamage, normal.healthDamage);
  assertClose(highPiercing.armorDamage, normal.armorDamage);
});

test('Resultado carrega fonte oficial e limites explícitos do modelo', () => {
  const result = calculateShotDistribution({
    damage_per_shot: 100,
    armor_penetration: 50,
    health_damage_multiplier: 1,
    armor_drone_multiplier: 1
  });
  assertEqual(result.source.publisher, 'ZeptoLab');
  assertEqual(result.source.url, SHOT_DISTRIBUTION_SOURCE.url);
  assertEqual(result.damageBasis, 'registered-damage-unit');
  assert(Array.isArray(SHOT_DISTRIBUTION_LIMITS), 'Limites do modelo devem ser uma lista.');
  assert(SHOT_DISTRIBUTION_LIMITS.some(item => item.includes('projéteis')), 'A ausência de contagem de projéteis deve ficar explícita.');
});

async function run() {
  const results = [];

  for (const item of tests) {
    try {
      await item.fn();
      results.push({ name: item.name, pass: true, detail: '' });
    } catch (error) {
      results.push({
        name: item.name,
        pass: false,
        detail: error?.stack || error?.message || String(error)
      });
    }
  }

  const passed = results.filter(item => item.pass).length;
  const failed = results.length - passed;

  document.getElementById('total').textContent = results.length;
  document.getElementById('passed').textContent = passed;
  document.getElementById('failed').textContent = failed;

  document.getElementById('results').innerHTML = results.map(item => `
    <li>
      <span class="badge ${item.pass ? 'pass' : 'fail'}">${item.pass ? 'PASSOU' : 'FALHOU'}</span>
      <div>
        <span class="test-title">${escapeHtml(item.name)}</span>
        ${item.detail ? `<span class="test-detail">${escapeHtml(item.detail)}</span>` : ''}
      </div>
    </li>
  `).join('');

  document.title = failed
    ? `(${failed} falha${failed === 1 ? '' : 's'}) Testes do motor — Echo Arena`
    : 'Testes aprovados — Echo Arena';

  console.info(`[Echo Arena tests] ${passed}/${results.length} testes aprovados.`);
  if (failed) console.error('[Echo Arena tests] Falhas:', results.filter(item => !item.pass));
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

run().catch(error => {
  document.getElementById('results').innerHTML = `<li><span class="badge fail">ERRO</span><div><span class="test-title">Falha ao iniciar os testes</span><span class="test-detail">${escapeHtml(error?.stack || error?.message || String(error))}</span></div></li>`;
  console.error('[Echo Arena tests] Falha fatal:', error);
});
