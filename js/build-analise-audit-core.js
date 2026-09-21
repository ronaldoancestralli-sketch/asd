import * as core from './build-analise.js?core=18&sb=20260823-security-supabase-pin-1&sc=20260906-1&eq=20260907-effects-1';
import {
  applyEquipmentStats,
  STAT_DEFINITIONS
} from './game-stat-engine.js?v=15&sc=20260906-1&eq=20260907-effects-1';

/*
 * Camada de auditoria da Análise da Build.
 *
 * IMPORTANTE:
 * - não substitui nem altera a matemática oficial existente;
 * - o resultado numérico continua vindo de core.analisarBuild();
 * - a repetição de applyEquipmentStats abaixo serve somente para identificar
 *   qual fonte produziu cada etapa do cálculo e é descartada caso não confira
 *   exatamente com o total oficial já calculado.
 */

export const carregarDadosAnalise = core.carregarDadosAnalise;
export const calcularBonusAtivos = core.calcularBonusAtivos;

const EPSILON = 1e-8;

function bonusAuditById(id) {
  return (globalThis.__echoBonusAudit || []).find(
    item => String(item?.id ?? '') === String(id ?? '')
  ) || null;
}

function sourceStatusLabel(status = '') {
  return ({
    structured: 'dados estruturados',
    derived: 'compatibilidade legada',
    unresolved: 'sem regra numérica',
    'text-only': 'informativo'
  })[status] || '';
}

function buildAuditTrail(contexto, resultado) {
  if (!resultado?.base || !resultado?.total) return [];

  const fontes = [];
  const metadados = [];
  const equipados = contexto?.equipados || {};

  for (const [slotKey, item] of Object.entries(equipados)) {
    if (!item) continue;

    const level = item.levels?.find(levelItem => levelItem.slug === item.raridade)
      || item.levels?.[0];

    if (!level?.calculationSource && (!level?.stats || !Object.keys(level.stats).length)) continue;

    fontes.push(level.stats);
    metadados.push({
      tipo: 'equipamento',
      nome: item.nome || 'Equipamento',
      slot: item.slotLabel || item.slot || slotKey || '',
      raridade: level.nome || item.raridade || '',
      equipmentId: item.databaseId || null
    });
  }

  for (const bonus of core.calcularBonusAtivos(contexto)) {
    const stats = contexto?.dados?.statsBonus?.get?.(bonus.id);
    if (!stats || !Object.keys(stats).length) continue;

    const audit = bonusAuditById(bonus.id);

    fontes.push(stats);
    metadados.push({
      tipo: 'bonus-conjunto',
      nome: bonus.set || 'Conjunto',
      titulo: bonus.titulo || '',
      pecas: Number(bonus.pecas || 0),
      bonusId: bonus.id,
      statusDados: audit?.status || '',
      origemDados: audit?.source || ''
    });
  }

  if (resultado.statusCalculation?.registry) {
    return resultado.statusCalculation.applied.map(mod => ({ ...mod, fonte: metadados[mod.sourceIndex] || (mod.source?.kind?.startsWith('hero_skill') ? { tipo: 'habilidade', nome: mod.sourceKey, skillId: mod.source.id } : null) }));
  }

  const modificadores = [];
  let valorAtual = { ...resultado.base };

  fontes.forEach((stats, sourceIndex) => {
    const passo = applyEquipmentStats(valorAtual, [stats]);
    const fonte = metadados[sourceIndex] || null;

    passo.applied.forEach(modificador => {
      modificadores.push({
        ...modificador,
        sourceIndex,
        fonte
      });
    });

    valorAtual = passo.final;
  });

  const todasAsChaves = new Set([
    ...Object.keys(resultado.total || {}),
    ...Object.keys(valorAtual || {})
  ]);

  const confere = [...todasAsChaves].every(key => {
    const oficial = Number(resultado.total?.[key]);
    const auditado = Number(valorAtual?.[key]);

    if (!Number.isFinite(oficial) && !Number.isFinite(auditado)) return true;
    if (!Number.isFinite(oficial) || !Number.isFinite(auditado)) return false;

    return Math.abs(oficial - auditado) <= EPSILON;
  });

  if (!confere) {
    console.warn(
      '[build-analise-audit] A trilha de auditoria não reproduziu exatamente o total oficial. ' +
      'Os detalhes de origem foram ocultados para não exibir informação incerta.'
    );
    return [];
  }

  return modificadores;
}

export function analisarBuild(contexto = {}) {
  const resultado = core.analisarBuild(contexto);

  if (resultado?.status !== 'ready') return resultado;

  return {
    ...resultado,
    modificadoresAuditados: buildAuditTrail(contexto, resultado)
  };
}

function withAuditTrail(contexto, resultado) {
  if (resultado?.status !== 'ready') return resultado;
  return {
    ...resultado,
    modificadoresAuditados: buildAuditTrail(contexto, resultado)
  };
}

export function prepararAnalisePublicaV4(contexto = {}) {
  return withAuditTrail(contexto, core.prepararAnalisePublicaV4(contexto));
}

export async function analisarBuildComAutoridadeV4(contexto = {}, surface = 'build_lab') {
  return withAuditTrail(contexto, await core.analisarBuildComAutoridadeV4(contexto, surface));
}

function ensureAuditStyles() {
  if (document.getElementById('build-analysis-audit-styles')) return;

  const style = document.createElement('style');
  style.id = 'build-analysis-audit-styles';
  style.textContent = `
    .an-stat-audit{grid-column:1/-1;margin:8px 0 2px;border:1px solid rgba(139,92,246,.24);border-radius:10px;background:rgba(6,12,24,.72);overflow:hidden}
    .an-stat-audit>summary{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;cursor:pointer;list-style:none;color:#bca7ff;font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
    .an-stat-audit>summary::-webkit-details-marker{display:none}
    .an-stat-audit>summary:after{content:'+';font-size:14px;color:#8b5cf6}
    .an-stat-audit[open]>summary:after{content:'−'}
    .an-stat-audit>summary b{margin-left:auto;color:#77849b;font-size:8px;font-weight:800}
    .an-audit-body{display:grid;gap:7px;padding:0 10px 10px}
    .an-audit-step{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px 12px;align-items:center;padding:8px 9px;border:1px solid #202d43;border-radius:8px;background:#081321}
    .an-audit-step>div{min-width:0}
    .an-audit-step strong{display:block;color:#e8edf6;font-size:10px;line-height:1.25;overflow-wrap:anywhere}
    .an-audit-step small{display:block;margin-top:2px;color:#78869d;font-size:8px;line-height:1.35}
    .an-audit-step .an-audit-value{color:#79e6ab;font-size:11px;font-weight:900;white-space:nowrap}
    .an-audit-step.base .an-audit-value,.an-audit-step.total .an-audit-value{color:#e5e7eb}
    .an-audit-step.total{border-color:rgba(74,222,128,.34);background:rgba(16,78,55,.12)}
    .an-audit-sequence{grid-column:1/-1;color:#65748c;font-size:8px}
    .an-audit-sequence b{color:#9ba8bc;font-weight:800}
    .an-source-badge{display:inline-flex;margin-left:5px;padding:2px 5px;border:1px solid #34445e;border-radius:999px;color:#9caac0;font-size:7px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;vertical-align:middle}
    .an-source-badge.legacy{border-color:#76591c;color:#f5c95f;background:rgba(120,83,8,.12)}
    .an-source-badge.structured{border-color:#225d49;color:#67e8a5;background:rgba(16,92,64,.12)}
    .an-bonus-calc-status{display:flex!important;align-items:center;gap:5px;margin-top:5px!important;font-size:8px!important;font-weight:900!important;letter-spacing:.035em;text-transform:uppercase}
    .an-bonus-calc-status.ok{color:#67e8a5!important}.an-bonus-calc-status.warn{color:#fbbf24!important}.an-bonus-calc-status.info{color:#94a3b8!important}
    .an-bonus-effects{display:flex!important;flex-wrap:wrap;gap:5px;margin-top:5px!important}
    .an-bonus-effects em{padding:3px 5px;border:1px solid #26364e;border-radius:6px;background:#0a1525;color:#cbd5e1;font-size:8px;font-style:normal}
    @media(max-width:560px){
      .an-stat-audit{margin-top:7px}
      .an-stat-audit>summary{padding:9px 8px}
      .an-audit-body{padding:0 8px 8px}
      .an-audit-step{grid-template-columns:minmax(0,1fr) auto;padding:8px}
      .an-audit-step strong{font-size:9px}.an-audit-step .an-audit-value{font-size:10px}
    }
  `;

  document.head.appendChild(style);
}

function decimalsFor(line = {}) {
  return Number(line.decimals || 0);
}

function numberText(value, decimals = 0) {
  return Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function statValueText(line, value) {
  return `${line.prefix || ''}${numberText(value, decimalsFor(line))}${line.unit || ''}`;
}

function isPercentagePointModifier(line, modifier) {
  return line?.unit === '%' && modifier?.operation === 'add';
}

function modifierValueText(line, modifier) {
  const value = Number(modifier?.value || 0);
  const sign = value > 0 ? '+' : '';
  const decimals = Number.isInteger(value) ? 0 : 2;

  if (modifier?.operation === 'percent') {
    return `${sign}${numberText(value, decimals)}%`;
  }

  if (isPercentagePointModifier(line, modifier)) {
    return `${sign}${numberText(value, decimals)} p.p.`;
  }

  return `${sign}${numberText(value, decimals)}${line?.unit || ''}`;
}

function sourceTitle(fonte = {}) {
  if (fonte.tipo === 'bonus-conjunto') {
    return `Bônus de conjunto · ${fonte.pecas} peças · ${fonte.nome}`;
  }
  return fonte.nome || 'Equipamento';
}

function sourceSubtitle(fonte = {}, modifier = {}) {
  const parts = [];

  if (fonte.tipo === 'equipamento') {
    if (fonte.slot) parts.push(fonte.slot);
    if (fonte.raridade) parts.push(fonte.raridade);
  } else if (fonte.tipo === 'bonus-conjunto') {
    if (fonte.titulo) parts.push(fonte.titulo);
    const status = sourceStatusLabel(fonte.statusDados);
    if (status) parts.push(status);
  }

  parts.push(
    modifier.operation === 'percent'
      ? 'percentual sobre o valor atual'
      : (modifier.target === 'armor_penetration' ? 'soma em pontos percentuais' : 'soma direta')
  );

  return parts.filter(Boolean).join(' · ');
}

function sourceBadge(fonte = {}) {
  if (fonte.tipo !== 'bonus-conjunto') return '';

  if (fonte.statusDados === 'derived') {
    return '<span class="an-source-badge legacy">legado</span>';
  }

  if (fonte.statusDados === 'structured') {
    return '<span class="an-source-badge structured">estruturado</span>';
  }

  return '';
}

function targetDefinition(target, resultado) {
  return resultado?.statusCalculation?.definitions?.[target] || STAT_DEFINITIONS[target] || {
    nome: String(target || '').replaceAll('_', ' '),
    unit: '',
    decimals: 0,
    prefix: ''
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function enrichStatRows(resultado) {
  const rows = [...document.querySelectorAll('#analise .an-real-values > li')];
  const linhas = resultado.estatisticas || resultado.linhas || [];
  const modifiers = resultado.modificadoresAuditados || [];

  linhas.forEach((line, index) => {
    const row = rows[index];
    if (!row) return;

    const lineModifiers = modifiers.filter(modifier => modifier.target === line.key);
    const changed = Math.abs(Number(line.difference || 0)) > EPSILON;
    const delta = row.querySelector('.an-current-value em');

    /* Atributo-base em % + soma direta = pontos percentuais, não porcentagem
       multiplicativa. Ex.: 85% + 6 p.p. = 91%. */
    if (
      changed &&
      delta &&
      line.unit === '%' &&
      lineModifiers.length &&
      lineModifiers.every(modifier => modifier.operation === 'add')
    ) {
      const difference = Number(line.difference || 0);
      const decimals = Number.isInteger(difference) ? 0 : 2;
      delta.textContent = `${difference > 0 ? '+' : ''}${numberText(difference, decimals)} p.p.`;
    }

    row.querySelector('.an-stat-audit')?.remove();
    if (!lineModifiers.length) return;

    const details = document.createElement('details');
    details.className = 'an-stat-audit';

    const steps = lineModifiers.map((modifier, modifierIndex) => {
      const fonte = modifier.fonte || {};
      return `
        <div class="an-audit-step">
          <div>
            <strong>${escapeHtml(sourceTitle(fonte))}${sourceBadge(fonte)}</strong>
            <small>${escapeHtml(sourceSubtitle(fonte, modifier))}</small>
          </div>
          <span class="an-audit-value">${escapeHtml(modifierValueText(line, modifier))}</span>
          <span class="an-audit-sequence">Etapa ${modifierIndex + 1}: <b>${escapeHtml(statValueText(line, modifier.before))}</b> → <b>${escapeHtml(statValueText(line, modifier.after))}</b></span>
        </div>`;
    }).join('');

    details.innerHTML = `
      <summary><span>Como chegou a este valor</span><b>${lineModifiers.length} fonte(s)</b></summary>
      <div class="an-audit-body">
        <div class="an-audit-step base">
          <div><strong>Base do herói / arma</strong><small>Valor oficial sem os equipamentos desta build.</small></div>
          <span class="an-audit-value">${escapeHtml(statValueText(line, line.base))}</span>
        </div>
        ${steps}
        <div class="an-audit-step total">
          <div><strong>Total da build</strong><small>Resultado após aplicar as fontes acima, na ordem registrada.</small></div>
          <span class="an-audit-value">${escapeHtml(statValueText(line, line.valor))}</span>
        </div>
      </div>`;

    row.appendChild(details);
  });
}

function enrichActiveBonuses(resultado) {
  const bonusRows = [...document.querySelectorAll('#analise .an-bonus .an-b')];
  const modifiers = resultado.modificadoresAuditados || [];
  const activeBonuses = resultado.bonusAtivos || [];

  activeBonuses.forEach((bonus, index) => {
    const row = bonusRows[index];
    if (!row) return;

    const body = row.querySelector('div');
    if (!body) return;

    body.querySelector('.an-bonus-calc-status')?.remove();
    body.querySelector('.an-bonus-effects')?.remove();

    const bonusModifiers = modifiers.filter(modifier =>
      modifier.fonte?.tipo === 'bonus-conjunto' &&
      String(modifier.fonte?.bonusId ?? '') === String(bonus.id ?? '')
    );

    const audit = bonusAuditById(bonus.id);
    const status = document.createElement('small');
    status.className = 'an-bonus-calc-status';

    if (bonusModifiers.length) {
      status.classList.add('ok');
      status.textContent = audit?.status === 'derived'
        ? '✓ Aplicado ao cálculo · compatibilidade legada'
        : '✓ Aplicado ao cálculo · dados estruturados';
    } else if (audit?.status === 'text-only') {
      status.classList.add('info');
      status.textContent = 'Informativo · sem alteração numérica';
    } else {
      status.classList.add('warn');
      status.textContent = '⚠ Nenhum efeito numérico foi aplicado';
    }

    body.appendChild(status);

    if (bonusModifiers.length) {
      const effects = document.createElement('small');
      effects.className = 'an-bonus-effects';
      effects.innerHTML = bonusModifiers.map(modifier => {
        const definition = targetDefinition(modifier.target, resultado);
        return `<em>${escapeHtml(modifierValueText(definition, modifier))} ${escapeHtml(definition.nome)}</em>`;
      }).join('');
      body.appendChild(effects);
    }
  });
}

export function renderAnalise(resultado) {
  core.renderAnalise(resultado);

  if (resultado?.status !== 'ready') return;

  ensureAuditStyles();
  enrichStatRows(resultado);
  enrichActiveBonuses(resultado);
}
