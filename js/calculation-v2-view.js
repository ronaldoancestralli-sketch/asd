/**
 * Apresentação do cálculo v2.
 * Recebe somente o resultado já calculado; não interpreta descrições e não
 * substitui valores ausentes por zero.
 */

const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const finite = value => typeof value === 'number' && Number.isFinite(value);

const UNIT_LABELS = Object.freeze({
  health_point: 'PV',
  armor_point: 'armadura',
  game_value: '',
  ammo_round: 'tiros',
  second: 's',
  percent: '%'
});

const ICONS = Object.freeze({
  'hero.health': '♡',
  'hero.armor': '⬡',
  'hero.power': '◆',
  'hero.vision_range': '◉',
  'hero.movement_speed': 'ϟ',
  'weapon.damage': '⌖',
  'weapon.magazine': '▥',
  'weapon.reload_time': '↻',
  'weapon.fire_rate': '⌁',
  'weapon.fire_interval': '⌁',
  'weapon.range': '◎',
  'weapon.aimed_range': '◎',
  'weapon.recoil': '↘',
  'weapon.spread': '⊙',
  'weapon.moving_spread_modifier': '⊙',
  'weapon.spread_factor': '⊙',
  'weapon.armor_penetration': '◇',
  'weapon.armor_penetration_power': '◇',
  'weapon.aim_time': '◴'
});

const statusLabel = status => ({
  ready: 'Calculado',
  calculated: 'Calculado',
  unchanged: 'Sem alteração',
  partial: 'Cálculo parcial',
  pending: 'Pendente',
  unavailable: 'Base indisponível',
  invalid: 'Inválido',
  inactive: 'Inativo nesta condição',
  'waiting-hero': 'Aguardando herói',
  'catalog-unavailable': 'Catálogo indisponível'
}[status] || 'Pendente');

const statusClass = status => ['ready', 'calculated', 'unchanged'].includes(status)
  ? 'is-known'
  : status === 'partial' ? 'is-partial'
  : status === 'inactive' ? 'is-inactive'
  : status === 'invalid' ? 'is-invalid' : 'is-pending';

function decimalsFor(line = {}) {
  const explicit = line.decimals;
  if (Number.isInteger(explicit) && explicit >= 0 && explicit <= 6) return explicit;
  return 2;
}

export function formatCalculationValue(value, line = {}) {
  if (!finite(value)) return '—';
  const unit = line.unit ? (UNIT_LABELS[line.unit] ?? line.unit) : '';
  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimalsFor(line)
  })}${unit ? ` ${unit}` : ''}`;
}

function effectAmount(trace, line) {
  if (!finite(trace?.amount)) return 'valor pendente';
  const value = trace.amount.toLocaleString('pt-BR', { maximumFractionDigits: decimalsFor(line) });
  const unit = line.unit ? (UNIT_LABELS[line.unit] ?? line.unit) : '';
  return trace.operation === 'percent' ? `${value}% da base` : `${value}${unit ? ` ${unit}` : ''}`;
}

function traceMarkup(trace, line) {
  const source = trace.equipmentName || trace.sourceName || trace.sourceId || 'Efeito';
  const condition = typeof trace.condition === 'string' && trace.condition !== 'always'
    ? ` · ${trace.condition} = ${trace.conditionExpected === false ? 'não' : 'sim'}`
    : '';
  const content = trace.status === 'applied'
    ? `${trace.operation === 'percent' || (finite(trace.amount) && trace.amount < 0) ? '' : '+'}${effectAmount(trace, line)}`
    : trace.reason || statusLabel(trace.status);
  return `<li class="calculation-v2-trace ${statusClass(trace.status)}">
    <span><b>${escapeHtml(source)}</b>${escapeHtml(condition)}</span>
    <em>${escapeHtml(content)}</em>
  </li>`;
}

function reasonMarkup(reason) {
  return `<li>${escapeHtml(reason?.message || reason?.reason || reason?.code || 'Informação pendente')}</li>`;
}

function statMarkup(line) {
  const changed = finite(line.base) && finite(line.valor) && Math.abs(line.valor - line.base) > 1e-9;
  const delta = changed ? line.valor - line.base : null;
  const traces = Array.isArray(line.trace) ? line.trace : [];
  const reasons = Array.isArray(line.reasons) ? line.reasons : [];
  return `<article class="calculation-v2-stat ${statusClass(line.status)}">
    <header>
      <span class="calculation-v2-stat-icon" aria-hidden="true">${escapeHtml(ICONS[line.key] || '◇')}</span>
      <div><h4>${escapeHtml(line.nome || line.label || line.key)}</h4><small>${escapeHtml(line.key)}</small></div>
      <span class="calculation-v2-status">${escapeHtml(statusLabel(line.status))}</span>
    </header>
    <div class="calculation-v2-equation">
      <span><small>Base</small><b>${formatCalculationValue(line.base, line)}</b></span>
      <i aria-hidden="true">→</i>
      <span><small>Com a build</small><b>${formatCalculationValue(line.valor, line)}</b></span>
      ${delta === null ? '' : `<strong class="${(line.direction === 'lower' ? -delta : delta) >= 0 ? 'is-positive' : 'is-negative'}">${delta >= 0 ? '+' : ''}${formatCalculationValue(delta, line)}</strong>`}
    </div>
    ${traces.length ? `<ul class="calculation-v2-traces">${traces.map(trace => traceMarkup(trace, line)).join('')}</ul>` : ''}
    ${reasons.length ? `<ul class="calculation-v2-reasons">${reasons.map(reasonMarkup).join('')}</ul>` : ''}
  </article>`;
}

function unresolvedMarkup(effect) {
  const source = effect.equipmentName || effect.sourceName || effect.sourceId || 'Equipamento';
  const amount = finite(effect.amount)
    ? effect.operation === 'percent'
      ? `${effect.amount.toLocaleString('pt-BR', { maximumFractionDigits: 6 })}%`
      : effect.amount.toLocaleString('pt-BR', { maximumFractionDigits: 6 })
    : '';
  const label = effect.rawLabel || effect.description || 'Efeito sem descrição';
  const reason = effect.reason || 'O efeito ainda não possui uma regra publicada.';
  return `<li><b>${escapeHtml(source)}</b><span>${amount ? `<strong>${escapeHtml(amount)}</strong> ` : ''}${escapeHtml(label)} — ${escapeHtml(reason)}</span></li>`;
}

export function renderCalculationDetailsV2(result, container = document.getElementById('analise')) {
  if (!container) return;
  if (!result || result.status === 'waiting-hero') {
    container.innerHTML = '<section class="calculation-v2-state"><b>Selecione um herói</b><span>Os valores serão calculados enquanto você monta a build.</span></section>';
    return;
  }
  if (result.status === 'catalog-unavailable' || result.status === 'invalid') {
    container.innerHTML = `<section class="calculation-v2-state is-error"><b>${escapeHtml(statusLabel(result.status))}</b><span>${escapeHtml(result.mensagem || 'Não foi possível produzir um resultado verificável.')}</span></section>`;
    return;
  }

  const lines = Array.isArray(result.linhas) ? result.linhas : [];
  const effects = Array.isArray(result.core?.effects) ? result.core.effects : [];
  const pending = effects.filter(effect => effect.status === 'pending' || effect.status === 'invalid');
  const informational = effects.filter(effect => effect.status === 'informational');
  const revision = result.catalogRevision == null ? '—' : result.catalogRevision;
  container.innerHTML = `<section class="calculation-v2-details">
    <header class="calculation-v2-title">
      <div><small>MOTOR DE CÁLCULO V2</small><h3>${escapeHtml(statusLabel(result.status))}</h3></div>
      <span class="${statusClass(result.status)}">Catálogo publicado · rev. ${escapeHtml(revision)}</span>
    </header>
    ${result.mensagem ? `<p class="calculation-v2-message">${escapeHtml(result.mensagem)}</p>` : ''}
    ${pending.length ? `<aside class="calculation-v2-pending"><b>Não calculado · ${pending.length} efeito(s)</b><ul>${pending.map(unresolvedMarkup).join('')}</ul></aside>` : ''}
    <div class="calculation-v2-stat-list">${lines.map(statMarkup).join('')}</div>
    ${informational.length ? `<aside class="calculation-v2-information"><b>Efeitos descritivos</b><ul>${informational.map(unresolvedMarkup).join('')}</ul></aside>` : ''}
  </section>`;
}

export function renderCalculationImpactV2(result, {
  grid = document.getElementById('impact-grid'),
  tip = document.getElementById('tactical-tip')
} = {}) {
  if (!grid) return;
  if (!result || ['waiting-hero', 'catalog-unavailable', 'invalid'].includes(result.status)) {
    grid.innerHTML = `<section class="calculation-v2-state ${result?.status === 'invalid' ? 'is-error' : ''}"><b>${escapeHtml(statusLabel(result?.status))}</b><span>${escapeHtml(result?.mensagem || 'Selecione um herói para começar.')}</span></section>`;
    if (tip) tip.textContent = result?.mensagem || 'Selecione um herói para começar.';
    return;
  }

  const lines = Array.isArray(result.linhas) ? result.linhas : [];
  const changed = lines.filter(line => finite(line.base) && finite(line.valor) && Math.abs(line.valor - line.base) > 1e-9);
  const pending = (result.core?.effects || []).filter(effect => effect.status === 'pending' || effect.status === 'invalid');
  const known = lines.filter(line => ['calculated', 'partial', 'unchanged'].includes(line.status) && finite(line.base));
  const selected = [...changed, ...known.filter(line => !changed.includes(line))].slice(0, Math.max(3, Math.min(8, changed.length || 3)));

  grid.innerHTML = selected.map(line => {
    const difference = finite(line.valor) && finite(line.base) ? line.valor - line.base : null;
    return `<article class="impact-card calculation-v2-impact ${statusClass(line.status)}">
      <div class="impact-head"><span class="impact-ico">${escapeHtml(ICONS[line.key] || '◇')}</span><h3>${escapeHtml(line.nome || line.label || line.key)}</h3><i class="impact-badge">${escapeHtml(statusLabel(line.status))}</i></div>
      <div class="calculation-v2-impact-values"><span><small>Base</small><b>${formatCalculationValue(line.base, line)}</b></span><i>→</i><span><small>Atual</small><b>${formatCalculationValue(line.valor, line)}</b></span></div>
      ${difference === null || Math.abs(difference) <= 1e-9 ? '' : `<strong>${difference >= 0 ? '+' : ''}${formatCalculationValue(difference, line)}</strong>`}
    </article>`;
  }).join('') + (pending.length ? `<aside class="calculation-v2-impact-pending"><b>Cálculo parcial</b><span>${pending.length} efeito(s) continuam pendentes e não foram tratados como zero.</span></aside>` : '');

  if (tip) tip.textContent = pending.length
    ? `${pending.length} efeito(s) ainda precisam de regra publicada. Os valores pendentes não entram no total.`
    : changed.length
      ? `${changed.length} atributo(s) alterado(s), com origem rastreável no painel Detalhes.`
      : 'Nenhum efeito publicado altera os valores-base desta build.';
}

export function renderCalculationCompactV2(result, container = document.getElementById('stats')) {
  if (!container) return;
  const lines = (result?.linhas || []).filter(line => finite(line.base)).slice(0, 8);
  container.innerHTML = lines.map(line => {
    const difference = finite(line.valor) ? line.valor - line.base : null;
    return `<div class="stat ${statusClass(line.status)}">
      <div class="h"><span class="ic">${escapeHtml(ICONS[line.key] || '◇')}</span><span class="nm">${escapeHtml(line.nome || line.label || line.key)}</span><span class="v">${formatCalculationValue(line.valor, line)}</span><span class="d">${difference === null ? 'Pendente' : `${difference >= 0 ? '+' : ''}${formatCalculationValue(difference, line)}`}</span></div>
    </div>`;
  }).join('');
}

export function renderHeroBaseSummaryV2(result, container = document.getElementById('hero-base-stats')) {
  if (!container) return;
  const wanted = [
    ['weapon.damage', '⌖', 'DANO DA ARMA'],
    ['hero.health', '♡', 'VIDA BASE'],
    ['hero.movement_speed', 'ϟ', 'VELOCIDADE BASE']
  ];
  const byKey = new Map((result?.linhas || []).map(line => [line.key, line]));
  container.innerHTML = wanted.map(([key, icon, label]) => {
    const line = byKey.get(key);
    return `<div><span>${icon} <b>${label}</b></span><i><u style="width:${finite(line?.base) ? '60' : '4'}%"></u></i><em>${line ? formatCalculationValue(line.base, line) : '—'}</em></div>`;
  }).join('');
}
