import {
  resolveEquipmentModifierRule,
  STAT_DEFINITIONS
} from './game-stat-engine-v13.js?v=1';

/*
 * Regras compartilhadas pela auditoria administrativa.
 *
 * - a resolução vem diretamente do catálogo/motor oficial;
 * - não replica listas de alvos do motor;
 * - a migração legada é conservadora;
 * - valores cumulativos ambíguos nunca são convertidos automaticamente.
 */

function basicNormalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9%+\-.,\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeAuditText(value = '') {
  const rule = resolveEquipmentModifierRule(value);
  if (rule.recognized && rule.catalogId) {
    return `catalog ${rule.catalogId} ${rule.operation}`;
  }
  return basicNormalize(value);
}

export function humanizeAttributeKey(value = '') {
  const original = String(value || '').trim();
  if (!original) return 'Atributo sem nome';

  const rule = resolveEquipmentModifierRule(original);
  if (rule.recognized && rule.catalogId && rule.target) {
    const baseName = STAT_DEFINITIONS[rule.target]?.nome || original;
    return `${baseName}${rule.operation === 'percent' ? ' (%)' : ''}`;
  }

  const words = original
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const hasPercent = /percentual|porcentagem|_pct\b/i.test(original);
  const cleaned = words
    .replace(/\b(percentual|porcentagem|pct)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const label = cleaned
    ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
    : words;

  return `${label}${hasPercent ? ' (%)' : ''}`;
}

export function resolveEquipmentRule(rawKey) {
  const rule = resolveEquipmentModifierRule(rawKey);
  if (!rule.recognized) {
    return {
      recognized: false,
      target: null,
      operation: null,
      source: rule.source || 'sem regra no motor',
      structuredKey: null,
      catalogId: null,
      confidence: 0
    };
  }

  /* Migração automática só usa a chave canônica quando ela veio do
     catálogo/estrutura oficial. Compatibilidade textual legada continua
     reconhecida para cálculo, mas não vira stats automaticamente. */
  const safeStructured = Boolean(rule.catalogId || /atributo oficial|catálogo oficial/.test(rule.source || ''));

  return {
    recognized: true,
    target: rule.target,
    operation: rule.operation,
    source: rule.source || 'motor oficial',
    structuredKey: safeStructured ? rule.canonical : null,
    catalogId: rule.catalogId || null,
    confidence: Number(rule.confidence ?? 1)
  };
}

export function targetLabel(target = '') {
  return STAT_DEFINITIONS[target]?.nome || humanizeAttributeKey(target);
}

export function parseLegacyBonusDescription(description = '') {
  const text = String(description || '')
    .replace(/−/g, '-')
    .replace(/\u00a0/g, ' ');

  const regex = /([+-])\s*(\d+(?:[.,]\d+)?)\s*(%)?\s*(?:ao|à|a|de|do|da)?\s*([^+\-;\n.]+)/gi;
  const claims = [];
  let match;

  while ((match = regex.exec(text))) {
    const phrase = String(match[4] || '').trim();
    if (!phrase || /^bonus\s+de\s+\d+\s+pecas?/i.test(basicNormalize(phrase))) continue;

    const numeric = Number(String(match[2] || '').replace(',', '.'));
    if (!Number.isFinite(numeric)) continue;

    const percent = Boolean(match[3]);
    const value = (match[1] === '-' ? -1 : 1) * numeric;
    const engineKey = `${phrase}${percent ? ' percentual' : ''}`.trim();
    const rule = resolveEquipmentRule(engineKey);

    claims.push({
      phrase,
      value,
      percent,
      engineKey,
      rule,
      structuredKey: rule.structuredKey
    });
  }

  return claims;
}

export function numericClaimCount(description = '') {
  const cleaned = String(description || '')
    .replace(/[+-]\s*b[oô]nus\s+de\s+\d+\s+pe[cç]as?/gi, ' ');

  return cleaned.match(/[+-]\s*\d+(?:[.,]\d+)?\s*%?/g)?.length || 0;
}

function numericStats(stats) {
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return [];
  return Object.entries(stats).filter(([key, value]) =>
    !String(key).startsWith('__echo_') && Number.isFinite(Number(value))
  );
}

function aggregateClaims(claims) {
  const aggregate = new Map();

  for (const claim of claims) {
    if (!claim.structuredKey) continue;
    aggregate.set(
      claim.structuredKey,
      Number(aggregate.get(claim.structuredKey) || 0) + Number(claim.value || 0)
    );
  }

  return aggregate;
}

export function buildBonusMigrationAudit(rows = [], setsById = new Map()) {
  const groups = new Map();

  for (const row of rows) {
    const setId = String(row.set_id || '__sem_set__');
    if (!groups.has(setId)) groups.set(setId, []);
    groups.get(setId).push(row);
  }

  const output = [];
  const proposals = new Map();

  for (const group of groups.values()) {
    group.sort((a, b) => Number(a.required_pieces || 0) - Number(b.required_pieces || 0));
    let previousDescriptionSnapshot = new Map();

    for (const row of group) {
      const entries = numericStats(row.stats);
      const informational = row.stats?.__echo_mode === 'informational';
      const claims = parseLegacyBonusDescription(row.description || '');
      const expectedClaims = numericClaimCount(row.description || '');
      const currentSnapshot = aggregateClaims(claims);

      const item = {
        ...row,
        setName: setsById.get(row.set_id)?.name || 'Sem conjunto',
        entries,
        claims,
        mode: 'legacy',
        severity: 'attention',
        issues: [],
        proposal: null,
        safe: false
      };

      if (informational) {
        item.mode = 'informational';
        item.severity = 'ok';
        output.push(item);
        previousDescriptionSnapshot = currentSnapshot;
        continue;
      }

      if (entries.length) {
        item.mode = 'structured';
        item.severity = 'ok';

        for (const [key] of entries) {
          const rule = resolveEquipmentRule(key);
          if (!rule.recognized) {
            item.issues.push(`Chave estruturada sem regra no motor: ${key}`);
            item.severity = 'blocker';
          }
        }

        output.push(item);
        previousDescriptionSnapshot = currentSnapshot;
        continue;
      }

      if (expectedClaims !== claims.length) {
        item.issues.push(
          `A descrição possui ${expectedClaims} efeito(s) numérico(s), mas somente ${claims.length} foi(ram) interpretado(s).`
        );
      }

      for (const claim of claims) {
        if (!claim.rule.recognized) {
          item.issues.push(`Efeito sem regra no motor: ${claim.phrase}`);
        } else if (!claim.structuredKey) {
          item.issues.push(
            `O motor reconhece “${claim.phrase}”, mas a correspondência ainda não é segura o bastante para uma migração automática.`
          );
        }
      }

      const proposal = {};

      if (!item.issues.length) {
        for (const [key, currentValue] of currentSnapshot) {
          if (!previousDescriptionSnapshot.has(key)) {
            proposal[key] = currentValue;
            continue;
          }

          const previousValue = Number(previousDescriptionSnapshot.get(key));

          if (Math.abs(previousValue - currentValue) <= 1e-9) {
            continue;
          }

          item.issues.push(
            `Valor cumulativo ambíguo em ${humanizeAttributeKey(key)}: ` +
            `${previousValue} no marco anterior e ${currentValue} neste marco. ` +
            'Não é seguro decidir automaticamente se o novo número é total acumulado ou incremento.'
          );
        }
      }

      if (!expectedClaims && !item.issues.length) {
        item.issues.push(
          'Sem efeito numérico estruturado. Revise se este marco é especial/informativo.'
        );
      }

      if (expectedClaims && !Object.keys(proposal).length && !item.issues.length) {
        item.issues.push(
          'Todos os efeitos numéricos deste marco repetem o marco anterior. Revise manualmente antes de estruturar.'
        );
      }

      if (!item.issues.length && Object.keys(proposal).length) {
        item.proposal = proposal;
        item.safe = true;
        item.severity = 'attention';
        proposals.set(String(row.id), proposal);
      } else {
        item.severity = 'blocker';
      }

      output.push(item);
      previousDescriptionSnapshot = currentSnapshot;
    }
  }

  return { rows: output, proposals };
}
