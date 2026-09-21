import {
  applyEquipmentStats,
  resolveEquipmentModifierRule
} from '../js/game-stat-engine.js?v=15';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const assert = (condition, message) => { if (!condition) throw new Error(message || 'Condição não atendida.'); };
const equal = (actual, expected, label = '') => {
  if (actual !== expected) throw new Error(`${label ? `${label}: ` : ''}esperado ${expected}, recebido ${actual}`);
};
const close = (actual, expected, epsilon = 1e-9) => {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > epsilon) throw new Error(`esperado ${expected}, recebido ${actual}`);
};

function expectRule(text, target, operation) {
  const rule = resolveEquipmentModifierRule(text);
  assert(rule.recognized, `“${text}” deveria ser reconhecido.`);
  equal(rule.target, target, `alvo de “${text}”`);
  equal(rule.operation, operation, `operação de “${text}”`);
  return rule;
}

test('DispersaoTiroComMiraArmaPercentual usa dispersão com mira', () => {
  const rule = expectRule('DispersaoTiroComMiraArmaPercentual', 'aimed_dispersion', 'percent');
  equal(rule.canonical, 'aimed_dispersion_pct');
});

test('Pequeno erro de escrita em dispersão ainda é reconhecido', () => {
  expectRule('Disperaso Tiro Com Mira Arma Percentual', 'aimed_dispersion', 'percent');
});

test('Dispersão com mira percentual aplica a fórmula sequencial existente', () => {
  const result = applyEquipmentStats(
    { aimed_dispersion: 100 },
    [{ DispersaoTiroComMiraArmaPercentual: -5 }, { 'dispersao com mira percentual': -10 }]
  );
  close(result.final.aimed_dispersion, 85.5);
});

test('Percentuais de vida continuam sequenciais', () => {
  const result = applyEquipmentStats({ health: 1000 }, [{ health_max_pct: 10 }, { health_max_pct: 10 }]);
  close(result.final.health, 1210);
});

test('Tempo de recarga e tempo de recarga da arma apontam para o mesmo alvo', () => {
  expectRule('tempo de recarga', 'reload_time', 'add');
  expectRule('tempo de recarga da arma percentual', 'reload_time', 'percent');
});

test('Velocidade de recarga é reconhecida como modificador de recarga', () => {
  expectRule('velocidade de recarga', 'reload_time', 'percent');
});

test('Erro pequeno em velocidade de recarga também é tolerado', () => {
  expectRule('velocidade de recagra', 'reload_time', 'percent');
});

test('Mecânica peculiar sem regra não é inventada', () => {
  const rule = resolveEquipmentModifierRule('VelocidadeParaPegarMelhoriasPercentual');
  assert(!rule.recognized, 'A mecânica ainda sem base oficial deve continuar sem mapeamento automático.');
});

test('Texto totalmente novo não é associado por aproximação arriscada', () => {
  const rule = resolveEquipmentModifierRule('PotenciaDaGranadaSolarPercentual');
  assert(!rule.recognized, 'Mecânica nova deve permanecer desconhecida até ser cadastrada no catálogo.');
});

let passed = 0;
let failed = 0;
const rows = [];

for (const item of tests) {
  try {
    await item.fn();
    passed += 1;
    rows.push(`<li><span class="badge pass">PASSOU</span><div><strong>${item.name}</strong></div></li>`);
  } catch (error) {
    failed += 1;
    rows.push(`<li><span class="badge fail">FALHOU</span><div><strong>${item.name}</strong><small>${String(error?.message || error)}</small></div></li>`);
  }
}

document.getElementById('total').textContent = String(tests.length);
document.getElementById('passed').textContent = String(passed);
document.getElementById('failed').textContent = String(failed);
document.getElementById('results').innerHTML = rows.join('');
document.title = failed ? `(${failed} falhas) Catálogo de atributos` : 'Catálogo de atributos aprovado';