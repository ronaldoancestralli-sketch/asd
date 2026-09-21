/*
 * Echo Arena — efeitos conhecidos cujo resultado final ainda não pode ser
 * calculado com segurança porque falta um valor-base oficial/publicamente
 * verificável no jogo.
 *
 * IMPORTANTE:
 * - isto NÃO é uma lista de erros;
 * - nenhum valor-base é estimado ou inventado;
 * - quando um dado oficial confiável existir, o efeito deve sair desta lista
 *   e ganhar uma regra real no catálogo/motor.
 */

export const EXTERNAL_DATA_EFFECTS = [
  {
    id: 'crate_opening_time',
    label: 'Tempo de abertura de caixas',
    unit: '%',
    aliases: [
      'tempo de abertura de caixa',
      'tempo de abertura de caixas',
      'tempo para abrir caixa',
      'tempo para abrir caixas',
      'abertura de caixa',
      'abertura de caixas',
      'crate opening cooldown',
      'crate opening time',
      'crate_opening_cooldown_pct'
    ],
    reason: 'O jogo informa o modificador do equipamento, mas não disponibiliza publicamente um valor-base confiável para o tempo de abertura. Sem essa base, não existe resultado final sólido para calcular.',
    missingData: 'Valor-base oficial do tempo de abertura de caixas.',
    publicNote: 'Este efeito é real, porém o jogo não disponibiliza os dados-base necessários para calcular seu impacto final com segurança.'
  },
  {
    id: 'improvement_pickup_speed',
    label: 'Velocidade de coleta de melhorias',
    unit: '%',
    aliases: [
      'velocidade para pegar melhorias',
      'velocidade para coletar melhorias',
      'velocidade de coleta de melhorias',
      'tempo para pegar melhorias',
      'tempo para coletar melhorias',
      'coleta de melhorias',
      'pegar melhorias',
      'VelocidadeParaPegarMelhoriasPercentual'
    ],
    reason: 'O equipamento modifica a coleta de melhorias, mas o jogo não expõe uma base pública e confiável que permita transformar esse modificador em um resultado final.',
    missingData: 'Valor-base oficial da coleta de melhorias e sua regra exata de aplicação.',
    publicNote: 'O efeito existe no equipamento, mas a base usada pelo jogo não é pública; por isso ele é exibido sem estimativa matemática.'
  }
];

function normalize(value = '') {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/%/g, ' percentual ')
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\bporcentagem\b|\bpct\b/g, ' percentual ')
    .replace(/\s+/g, ' ')
    .trim();
}

function damerau(a = '', b = '') {
  const A = String(a);
  const B = String(b);
  const d = Array.from({ length: A.length + 1 }, () => Array(B.length + 1).fill(0));
  for (let i = 0; i <= A.length; i += 1) d[i][0] = i;
  for (let j = 0; j <= B.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= A.length; i += 1) {
    for (let j = 1; j <= B.length; j += 1) {
      const cost = A[i - 1] === B[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && A[i - 1] === B[j - 2] && A[i - 2] === B[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[A.length][B.length];
}

function tokenMatch(a, b) {
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  if (n < 5) return false;
  return damerau(a, b) <= (n >= 9 ? 2 : 1);
}

function score(input, alias) {
  const inputTokens = normalize(input).split(' ').filter(Boolean);
  const aliasTokens = normalize(alias).split(' ').filter(Boolean);
  if (!inputTokens.length || !aliasTokens.length) return 0;
  const used = new Set();
  let matched = 0;
  for (const token of aliasTokens) {
    const index = inputTokens.findIndex((candidate, i) => !used.has(i) && tokenMatch(candidate, token));
    if (index >= 0) {
      matched += 1;
      used.add(index);
    }
  }
  const coverage = matched / aliasTokens.length;
  if (coverage < 0.82) return 0;
  return coverage * 0.75 + (used.size / inputTokens.length) * 0.25;
}

export function resolveExternalDataEffect(rawKey = '') {
  const normalized = normalize(rawKey);
  if (!normalized) return null;

  const exact = [];
  for (const effect of EXTERNAL_DATA_EFFECTS) {
    for (const alias of effect.aliases) {
      if (normalize(alias) === normalized) exact.push(effect);
    }
  }
  if (exact.length === 1) return { ...exact[0], confidence: 1, match: 'exact' };

  const candidates = [];
  for (const effect of EXTERNAL_DATA_EFFECTS) {
    for (const alias of effect.aliases) {
      const matchScore = score(rawKey, alias);
      if (matchScore > 0) candidates.push({ effect, score: matchScore });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const second = candidates.find(candidate => candidate.effect.id !== best?.effect.id);
  if (!best || best.score < 0.9) return null;
  if (second && best.score - second.score < 0.08) return null;

  return { ...best.effect, confidence: best.score, match: 'tolerant' };
}

export function externalDataStatus(rawKey = '') {
  const effect = resolveExternalDataEffect(rawKey);
  if (!effect) return null;
  return {
    kind: 'awaiting_official_data',
    calculable: false,
    actionable: false,
    effect
  };
}
