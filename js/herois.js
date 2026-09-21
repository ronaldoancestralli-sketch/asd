import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import { normalizeHeroMedia } from './media-storage.js?v=20260823-security-supabase-pin-1';

import {
  initSiteShell,
  escapeHtml,
  compactNumber,
  classColor,
  mediaOf,
  mediaStyle,
  mediaInner
} from './site-shell.js?v=20260831-hero-gif-rollback-1&sb=20260823-security-supabase-pin-1&identity=20260825-v6-public-1&ops=20260905&sc=20260906-1&eq=20260907-effects-1';

const shell = await initSiteShell({ activeId: 'herois' });
if (!shell) throw new Error('BLOQUEADO');

const $ = (id) => document.getElementById(id);
const grid = $('grid');
const search = $('search');
const sort = $('sort');
const countLabel = $('count');
const classFilters = $('class-filters');
const detail = $('hero-detail');
const detailBackdrop = $('hd-backdrop');
const detailClose = $('hd-close');
const detailMedia = $('hd-media');
const detailBody = $('hd-body');
const initialParams = new URLSearchParams(location.search);

let heroes = [];
let classes = [];
let activeClass = initialParams.get('classe') || '';
let requestedHeroSlug = initialParams.get('heroi') || '';
let skillsByHero = new Map();
let skillLevelsBySkill = new Map();
let baseStatsByHero = new Map();
let statDefinitions = new Map();
let sourceLinksBySkill = new Map();
let sourcesById = new Map();
let balanceHistoryBySkill = new Map();
let auditCreditsBySkill = new Map();
let identityCardsByUser = new Map();
let activeAuditTarget = null;

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function syncRoute() {
  const url = new URL(location.href);
  if (activeClass) url.searchParams.set('classe', activeClass);
  else url.searchParams.delete('classe');
  if (requestedHeroSlug) url.searchParams.set('heroi', requestedHeroSlug);
  else url.searchParams.delete('heroi');
  history.replaceState({}, '', url);
}

function visibleHeroes() {
  const query = normalize(search?.value);
  const rows = heroes.filter(hero => {
    const matchesClass = !activeClass || hero.class_slug === activeClass;
    const matchesQuery = !query || normalize(hero.name).includes(query) || normalize(hero.subtitle).includes(query) || normalize(hero.class_name).includes(query);
    return matchesClass && matchesQuery;
  });
  const mode = sort?.value || 'ordem';
  return rows.sort((first, second) => {
    if (mode === 'nome') return String(first.name || '').localeCompare(String(second.name || ''), 'pt-BR');
    if (mode === 'builds') return Number(second.total_builds || 0) - Number(first.total_builds || 0);
    const orderDiff = Number(first.display_order ?? 0) - Number(second.display_order ?? 0);
    return orderDiff || String(first.name || '').localeCompare(String(second.name || ''), 'pt-BR');
  });
}

function renderClassFilters() {
  const buttons = classes.map(item => `<b class="${item.slug === activeClass ? 'on' : ''}" data-class="${escapeHtml(item.slug)}" style="--class-color:${escapeHtml(classColor(item))}">${escapeHtml(item.name)}</b>`).join('');
  classFilters.innerHTML = `<b class="${activeClass ? '' : 'on'}" data-class="">Todas</b>${buttons}`;
}

function renderGrid() {
  const rows = visibleHeroes();
  countLabel.textContent = rows.length === 1 ? '1 herói' : `${rows.length} heróis`;
  if (!rows.length) {
    grid.innerHTML = '<div class="loading-card">Nenhum herói encontrado.</div>';
    return;
  }
  grid.innerHTML = rows.map(hero => {
    const media = mediaOf(hero, 'card');
    const color = classColor(hero);
    const enabled = hero.enabled !== false;
    return `<article class="hc ${enabled ? '' : 'off'}" data-slug="${escapeHtml(hero.slug)}" style="--class-color:${escapeHtml(color)}">
      <div class="thumb"><div class="media ${media ? '' : 'empty'}" style="${mediaStyle(media, 'cover')}">${mediaInner(media, hero.name)}</div><div class="fade"></div><div class="cap"><div class="n">${escapeHtml(hero.name)}</div><div class="r">${escapeHtml(hero.class_name || 'Sem classe')}</div></div></div>
    </article>`;
  }).join('');
}

function formatStatValue(stat) {
  const def = statDefinitions.get(stat.stat_key);
  const number = Number(stat.value);
  if (!Number.isFinite(number)) return '—';
  const decimals = Math.max(0, Math.min(4, Number(def?.decimals ?? 0)));
  const value = number.toLocaleString('pt-BR', { maximumFractionDigits: decimals });
  const unit = String(def?.unit || '').trim();
  if (!unit) return value;
  if (unit === '%') return `${value}%`;
  return `${value} ${unit}`;
}

function statName(stat) {
  return statDefinitions.get(stat.stat_key)?.name || stat.stat_key.replaceAll('_', ' ');
}

function renderBaseStats(heroId) {
  const rows = (baseStatsByHero.get(heroId) || [])
    .filter(row => Number.isFinite(Number(row.value)))
    .sort((a, b) => Number(statDefinitions.get(a.stat_key)?.display_order ?? 9999) - Number(statDefinitions.get(b.stat_key)?.display_order ?? 9999))
    .slice(0, 9);
  if (!rows.length) return '';
  return `<div class="hd-section"><h3>Status base</h3><div class="hd-stats">${rows.map(row => `<div class="hd-stat"><span>${escapeHtml(statName(row))}</span><strong>${escapeHtml(formatStatValue(row))}</strong></div>`).join('')}</div></div>`;
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return number.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

function formatDate(value) {
  if (!value) return '';
  const raw = String(value);
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00Z` : raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

function skillMeta(skill) {
  const parts = [];
  if (skill.skill_type) parts.push(String(skill.skill_type));
  if (skill.cooldown !== null && skill.cooldown !== undefined) parts.push(`Recarga ${formatNumber(skill.cooldown)}s`);
  if (skill.duration !== null && skill.duration !== undefined) parts.push(`Duração ${formatNumber(skill.duration)}s`);
  if (skill.energy_cost !== null && skill.energy_cost !== undefined) parts.push(`Energia ${formatNumber(skill.energy_cost)}`);
  if (skill.unlock_level !== null && skill.unlock_level !== undefined) parts.push(`Desbloqueio nv. ${formatNumber(skill.unlock_level)}`);
  if (skill.max_level !== null && skill.max_level !== undefined) parts.push(`Máx. nv. ${formatNumber(skill.max_level)}`);
  return parts;
}

function levelValues(level) {
  const definitions = [
    ['damage', 'Dano'],
    ['healing', 'Cura'],
    ['shield', 'Escudo'],
    ['cooldown', 'Recarga'],
    ['duration', 'Duração'],
    ['radius', 'Raio'],
    ['range', 'Alcance'],
    ['speed', 'Velocidade'],
    ['energy_cost', 'Energia']
  ];

  return definitions
    .filter(([key]) => level[key] !== null && level[key] !== undefined && Number.isFinite(Number(level[key])))
    .map(([key, label]) => ({ label, value: formatNumber(level[key]) }));
}

function renderSkillLevels(skillId) {
  const levels = (skillLevelsBySkill.get(skillId) || [])
    .filter(level => Number.isInteger(Number(level.level)) && Number(level.level) >= 1)
    .sort((a, b) => Number(a.level) - Number(b.level));

  if (!levels.length) return '';

  return `<div class="skill-levels">${levels.map(level => {
    const values = levelValues(level);
    return `<div class="skill-level-row">
      <div class="skill-level-head"><strong>Nível ${escapeHtml(level.level)}</strong>${values.length ? `<span>${values.length} valor(es)</span>` : ''}</div>
      ${values.length ? `<div class="skill-pills">${values.map(item => `<span>${escapeHtml(item.label)} ${escapeHtml(item.value)}</span>`).join('')}</div>` : ''}
      ${level.description ? `<p class="hd-text skill-level-note">${escapeHtml(level.description)}</p>` : ''}
    </div>`;
  }).join('')}</div>`;
}

function sourceTypeLabel(value) {
  return ({ official: 'Oficial', wiki: 'Wiki comunitária', forum: 'Fórum', community: 'Página da comunidade', other: 'Outra fonte' })[value] || 'Fonte';
}

function sourcePriority(link) {
  const source = sourcesById.get(link.source_id);
  if (source?.source_type === 'official' && link.coverage === 'patch_override') return 0;
  if (source?.source_type === 'official') return 1;
  if (source?.source_type === 'wiki') return 2;
  return 3;
}

function officialLinksForHero(heroId) {
  return (skillsByHero.get(heroId) || [])
    .flatMap(skill => (sourceLinksBySkill.get(skill.id) || []).map(link => ({
      skillId: skill.id,
      source: sourcesById.get(link.source_id),
      link
    })))
    .filter(item => item.source?.source_type === 'official');
}

function renderHeroTrust(heroId) {
  const officialLinks = officialLinksForHero(heroId);
  if (!officialLinks.length) return '';
  const skillCount = new Set(officialLinks.map(item => item.skillId)).size;
  return `<div class="hd-trust-signal" role="note" aria-label="Fonte oficial ZeptoLab">
    <span class="hd-trust-seal" aria-hidden="true">✓</span>
    <span class="hd-trust-copy"><strong>Fonte oficial ZeptoLab</strong><small>Central de Ajuda oficial · ${skillCount} habilidade(s) com referência</small></span>
    <span class="hd-trust-state">Rastreável</span>
  </div>`;
}

function auditorName(userId) {
  const identity = identityCardsByUser.get(userId);
  if (!identity) return 'membro da comunidade';
  return identity.display_name || (identity.public_handle ? `@${identity.public_handle}` : 'membro da comunidade');
}

function auditorProfileUrl(userId) {
  const handle = identityCardsByUser.get(userId)?.public_handle;
  return handle ? `./perfil.html?u=${encodeURIComponent(handle)}` : '';
}

function renderSkillAuditCredit(skill) {
  const rows = auditCreditsBySkill.get(skill.id) || [];
  if (!rows.length) return '';
  const first = rows[0];
  const extra = rows.length > 1 ? ` <span class="skill-audit-extra">+${rows.length - 1}</span>` : '';
  const name = auditorName(first.contributor_id);
  const profileUrl = auditorProfileUrl(first.contributor_id);
  const identity = identityCardsByUser.get(first.contributor_id);
  const meta = identity
    ? `${Number(identity.reputation_points || 0).toLocaleString('pt-BR')} pontos de reputação`
    : 'contribuição aprovada pela comunidade';
  const nameMarkup = profileUrl
    ? `<a href="${escapeHtml(profileUrl)}">${escapeHtml(name)}</a>`
    : `<span>${escapeHtml(name)}</span>`;
  return `<div class="skill-audit-credit" role="note">
    <span class="skill-audit-gem" aria-hidden="true">✦</span>
    <span class="skill-audit-copy"><small>CONTRIBUIÇÃO RECONHECIDA</small><strong>Auditado por ${nameMarkup}${extra}</strong><em>${escapeHtml(meta)}</em></span>
  </div>`;
}

function heroAuditors(heroId) {
  const skills = (skillsByHero.get(heroId) || []).filter(skill => skill.enabled !== false);
  if (skills.length < 4) return [];
  const auditedByUser = new Map();
  for (const skill of skills) {
    for (const row of auditCreditsBySkill.get(skill.id) || []) {
      if (!auditedByUser.has(row.contributor_id)) auditedByUser.set(row.contributor_id, new Set());
      auditedByUser.get(row.contributor_id).add(skill.id);
    }
  }
  return [...auditedByUser.entries()]
    .filter(([, skillIds]) => skillIds.size === skills.length)
    .map(([userId]) => userId)
    .filter(userId => identityCardsByUser.has(userId));
}

function renderHeroAuditCredit(heroId) {
  const auditors = heroAuditors(heroId);
  if (!auditors.length) return '';
  const userId = auditors[0];
  const identity = identityCardsByUser.get(userId);
  const name = auditorName(userId);
  const profileUrl = auditorProfileUrl(userId);
  const extra = auditors.length > 1 ? ` e mais ${auditors.length - 1}` : '';
  return `<a class="hero-audit-crown" href="${escapeHtml(profileUrl)}" aria-label="Abrir perfil de ${escapeHtml(name)}">
    <span class="hero-audit-orbit" aria-hidden="true"><i>✦</i></span>
    <span><small>GUARDIÃO DE DADOS</small><strong>Herói auditado por ${escapeHtml(name)}${escapeHtml(extra)}</strong><em>As quatro habilidades foram conferidas e aprovadas · ${Number(identity.reputation_points || 0).toLocaleString('pt-BR')} pontos</em></span>
    <b>Ver perfil →</b>
  </a>`;
}

function verificationPresentation(skill) {
  if (skill.verification_status === 'verified' && skill.needs_recheck === false) {
    return { label: 'Verificado', className: 'verified', note: 'Os valores-base desta habilidade possuem verificação oficial completa.' };
  }
  if (skill.verification_status === 'corroborated') {
    return { label: 'Corroborado · revisão contínua', className: 'corroborated', note: 'Os valores-base foram corroborados em fonte comunitária. Patches oficiais indicados abaixo prevalecem apenas para as alterações que publicam.' };
  }
  return { label: 'Não verificado', className: 'unverified', note: 'Ainda não há evidência suficiente vinculada para classificar estes dados como corroborados.' };
}

function renderSkillSources(skill) {
  const links = (sourceLinksBySkill.get(skill.id) || [])
    .filter(link => sourcesById.has(link.source_id))
    .slice()
    .sort((a, b) => sourcePriority(a) - sourcePriority(b));
  if (!links.length && !skill.verification_status) return '';

  const state = verificationPresentation(skill);
  const sourceRows = links.map(link => {
    const source = sourcesById.get(link.source_id);
    const patch = link.verified_patch ? ` · ${link.verified_patch}` : '';
    const coverage = ({ baseline_values: 'valores-base', structure: 'estrutura', patch_override: 'alteração de patch', corroboration: 'corroboração', translation: 'tradução' })[link.coverage] || link.coverage;
    const publishedDate = formatDate(source.source_updated_at);
    const checkedDate = formatDate(source.last_checked_at);
    const freshness = publishedDate ? ` · fonte de ${publishedDate}` : checkedDate ? ` · conferida em ${checkedDate}` : '';
    return `<a class="skill-source-link" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer"><span class="skill-source-type">${escapeHtml(sourceTypeLabel(source.source_type))}</span><strong>${escapeHtml(source.title)}</strong><small>${escapeHtml(coverage)}${escapeHtml(patch)}${escapeHtml(freshness)}</small></a>`;
  }).join('');

  const officialSource = links
    .map(link => sourcesById.get(link.source_id))
    .find(source => source?.source_type === 'official');
  const officialMarkup = officialSource
    ? `<div class="skill-official-source" role="note">
        <span class="skill-official-mark" aria-hidden="true">✓</span>
        <span><strong>Fonte oficial ZeptoLab</strong><small>Central de Ajuda oficial · referência pública</small></span>
      </div>`
    : '';

  return `<div class="skill-proof-block">${officialMarkup}<details class="skill-proof">
    <summary><span class="skill-proof-status ${state.className}">${escapeHtml(state.label)}</span><span>Fontes e verificação</span></summary>
    <div class="skill-proof-body"><p>${escapeHtml(state.note)}</p>${skill.verified_patch ? `<div class="skill-proof-patch">Patch oficial mais recente rastreado: <strong>${escapeHtml(skill.verified_patch)}</strong></div>` : ''}${sourceRows ? `<div class="skill-source-list">${sourceRows}</div>` : '<p>Nenhuma fonte pública disponível para este registro.</p>'}</div>
  </details></div>`;
}

function renderSkillValidation(skill) {
  const needsHelp = skill.needs_recheck !== false || skill.verification_status !== 'verified';
  return `<div class="skill-validation-invite ${needsHelp ? 'is-priority' : ''}">
    <span class="skill-validation-spark" aria-hidden="true">◇</span>
    <span><small>${needsHelp ? 'ESTES DADOS PRECISAM DE VOCÊ' : 'MANTENHA ESTES DADOS ATUAIS'}</small><strong>${needsHelp ? 'Você conhece esta habilidade?' : 'Você joga com esta habilidade?'}</strong><em>Confira no jogo, envie uma evidência e ganhe reputação depois da revisão independente.</em></span>
    <button type="button" data-validate-skill="${escapeHtml(skill.id)}">Validar estes dados</button>
  </div>`;
}

function historyAttributeLabel(value = '') {
  const labels = {
    descricao: 'Descrição',
    fator_dano_armadura: 'Fator de dano à armadura',
    armadura_aliados_ao_acertar: 'Armadura de aliados ao acertar',
    reducao_armadura_inimiga_ao_acertar: 'Redução de armadura inimiga ao acertar',
    reducao_vida_maxima_inimigos_ao_receber_dano: 'Vida máxima de inimigos ao receber dano',
    poder_perfuracao_ao_acertar: 'Poder de perfuração ao acertar',
    raio_maximo: 'Raio máximo',
    reducao_vida_maxima_ao_abater: 'Vida máxima inimiga ao eliminar',
    cura_ao_receber_dano: 'Cura ao receber dano',
    recarga_arma_aliados_ao_abater: 'Recarga de arma dos aliados ao eliminar',
    penetracao_armadura_alvo_ao_acertar: 'Penetração de armadura do alvo ao acertar',
    penetracao_armadura_inimigos_ao_receber_dano: 'Penetração de armadura inimiga ao receber dano',
    recarga: 'Recarga',
    duracao_lentidao_ao_acertar: 'Duração da lentidão ao acertar',
    velocidade_movimento_aliados: 'Velocidade de movimento dos aliados',
    raio: 'Raio',
    descricao_efeito_parede: 'Efeito da parede',
    resistencia_armadura_aliados_ao_acertar: 'Resistência de armadura dos aliados ao acertar',
    dano_armadura_inimigos_ao_acertar: 'Dano à armadura dos inimigos ao acertar',
    resistencia_armadura_aliados: 'Resistência de armadura dos aliados'
  };
  return labels[value] || String(value).replaceAll('_', ' ');
}

function renderSkillHistory(skillId) {
  const rows = (balanceHistoryBySkill.get(skillId) || []).slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  if (!rows.length) return '';

  return `<details class="skill-history"><summary>Histórico oficial · ${rows.length}</summary><div class="skill-history-list">${rows.map(row => {
    const beforeAfter = row.old_value !== null && row.old_value !== undefined
      ? `<div class="skill-history-change"><span>${escapeHtml(row.old_value)}</span><b>→</b><span>${escapeHtml(row.new_value ?? '—')}</span></div>`
      : row.new_value !== null && row.new_value !== undefined
        ? `<div class="skill-history-change"><span>Novo</span><b>→</b><span>${escapeHtml(row.new_value)}</span></div>`
        : '';
    return `<article class="skill-history-row"><div class="skill-history-head"><strong>${escapeHtml(row.patch_version || 'Atualização oficial')}</strong><span>${escapeHtml(historyAttributeLabel(row.attribute_name))}</span></div>${beforeAfter}${row.description ? `<p>${escapeHtml(row.description)}</p>` : ''}</article>`;
  }).join('')}</div></details>`;
}

function renderSkills(heroId) {
  const skills = (skillsByHero.get(heroId) || []).filter(skill => skill.enabled !== false);
  if (!skills.length) return '';
  return `<div class="hd-section"><h3>Habilidades</h3><div class="skill-list">${skills.map(skill => {
    const meta = skillMeta(skill);
    const description = skill.description || 'Descrição em validação. A comunidade pode conferir esta habilidade diretamente no jogo.';
    return `<article class="skill-card"><div class="skill-card-head"><strong>${escapeHtml(skill.name)}</strong>${skill.skill_type ? `<span class="hd-badge skill-type">${escapeHtml(skill.skill_type)}</span>` : ''}</div><p class="hd-text skill-description">${escapeHtml(description)}</p>${meta.length ? `<div class="skill-pills">${meta.slice(skill.skill_type ? 1 : 0).map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : ''}${renderSkillAuditCredit(skill)}${renderSkillSources(skill)}${renderSkillHistory(skill.id)}${renderSkillLevels(skill.id)}${renderSkillValidation(skill)}</article>`;
  }).join('')}</div></div>`;
}

function ensureAuditDialog() {
  if ($('skill-audit-dialog')) return $('skill-audit-dialog');
  const dialog = document.createElement('div');
  dialog.id = 'skill-audit-dialog';
  dialog.className = 'skill-audit-dialog';
  dialog.setAttribute('aria-hidden', 'true');
  dialog.innerHTML = `<div class="skill-audit-backdrop" data-audit-close></div>
    <section class="skill-audit-panel" role="dialog" aria-modal="true" aria-labelledby="skill-audit-title">
      <button class="skill-audit-close" type="button" data-audit-close aria-label="Fechar">✕</button>
      <div class="skill-audit-kicker">ECHO ARENA DATA · COMUNIDADE</div>
      <h2 id="skill-audit-title">Validar estes dados</h2>
      <p id="skill-audit-context">Confira a habilidade no jogo e conte o que encontrou.</p>
      <div class="skill-audit-reward"><span>✦</span><div><strong>Sua conferência tem valor</strong><small>A reputação é liberada somente depois de dois pareceres independentes. Dados aprovados podem destacar seu nome nesta habilidade.</small></div></div>
      <form id="skill-audit-form">
        <fieldset class="skill-audit-verdicts">
          <legend>O que você encontrou?</legend>
          <label><input type="radio" name="verdict" value="confirmed" checked><span><strong>Os dados conferem</strong><small>Comparei com o jogo e estão corretos.</small></span></label>
          <label><input type="radio" name="verdict" value="needs_correction"><span><strong>Encontrei uma diferença</strong><small>Vou explicar o que precisa ser corrigido.</small></span></label>
        </fieldset>
        <label class="skill-audit-field"><span>O que você conferiu?</span><textarea id="skill-audit-observation" minlength="20" maxlength="800" required placeholder="Ex.: conferi descrição, recarga e efeito no jogo..."></textarea></label>
        <div class="skill-audit-grid">
          <label class="skill-audit-field"><span>Versão ou temporada</span><input id="skill-audit-version" maxlength="80" placeholder="Ex.: temporada atual"></label>
          <label class="skill-audit-field"><span>Link da evidência <small>opcional</small></span><input id="skill-audit-evidence" type="url" maxlength="1200" placeholder="https://..."></label>
        </div>
        <label class="skill-audit-confirm"><input id="skill-audit-confirm" type="checkbox" required><span>Confirmo que conferi estes dados e que minha contribuição pode ser revisada.</span></label>
        <div id="skill-audit-message" class="skill-audit-message" role="status" aria-live="polite"></div>
        <button id="skill-audit-submit" class="skill-audit-submit" type="submit">Enviar para auditoria</button>
      </form>
    </section>`;
  document.body.appendChild(dialog);
  dialog.querySelectorAll('[data-audit-close]').forEach(button => button.addEventListener('click', closeAuditDialog));
  dialog.querySelector('#skill-audit-form').addEventListener('submit', submitSkillAudit);
  return dialog;
}

function closeAuditDialog() {
  const dialog = $('skill-audit-dialog');
  dialog?.classList.remove('open');
  dialog?.setAttribute('aria-hidden', 'true');
  activeAuditTarget = null;
}

function auditErrorMessage(error) {
  const text = String(error?.message || 'Não foi possível enviar sua validação.');
  if (text.includes('duplicate_research_submission')) return 'Você já enviou esta mesma conferência recentemente.';
  if (text.includes('research_submission_rate_limited')) return 'Você atingiu o limite de contribuições deste período. Tente novamente mais tarde.';
  if (text.includes('research_pending_queue_full')) return 'Sua fila de contribuições pendentes está cheia. Aguarde as revisões.';
  if (text.includes('authentication_required')) return 'Entre na sua conta para validar estes dados.';
  if (text.includes('active_profile_required')) return 'Seu perfil precisa estar ativo para contribuir.';
  return text;
}

async function openSkillAudit(skillId) {
  const hero = heroes.find(item => (skillsByHero.get(item.id) || []).some(skill => skill.id === skillId));
  const skill = (hero ? (skillsByHero.get(hero.id) || []) : []).find(item => item.id === skillId);
  if (!hero || !skill) return;
  const userResult = await supabase.auth.getUser();
  if (userResult.error || !userResult.data?.user) {
    location.href = './meu-perfil.html';
    return;
  }
  activeAuditTarget = { hero, skill };
  const dialog = ensureAuditDialog();
  dialog.querySelector('#skill-audit-context').textContent = `${hero.name} · ${skill.name}. Compare os dados exibidos com a versão atual do jogo.`;
  dialog.querySelector('#skill-audit-form').reset();
  dialog.querySelector('input[name="verdict"][value="confirmed"]').checked = true;
  dialog.querySelector('#skill-audit-message').textContent = '';
  dialog.querySelector('#skill-audit-message').className = 'skill-audit-message';
  const submit = dialog.querySelector('#skill-audit-submit');
  submit.disabled = false;
  submit.textContent = 'Enviar para auditoria';
  dialog.classList.add('open');
  dialog.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => dialog.querySelector('#skill-audit-observation')?.focus());
}

async function submitSkillAudit(event) {
  event.preventDefault();
  if (!activeAuditTarget) return;
  const dialog = $('skill-audit-dialog');
  const button = dialog.querySelector('#skill-audit-submit');
  const message = dialog.querySelector('#skill-audit-message');
  const verdict = dialog.querySelector('input[name="verdict"]:checked')?.value || 'confirmed';
  const observation = dialog.querySelector('#skill-audit-observation').value.trim();
  const gameVersion = dialog.querySelector('#skill-audit-version').value.trim();
  const evidence = dialog.querySelector('#skill-audit-evidence').value.trim();
  if (observation.length < 20) {
    message.textContent = 'Descreva com um pouco mais de detalhe o que você conferiu.';
    message.className = 'skill-audit-message error';
    return;
  }
  let evidenceKind = 'text';
  if (evidence) {
    try {
      const host = new URL(evidence).hostname.toLowerCase();
      evidenceKind = host === 'zepto.helpshift.com' || host.endsWith('.zeptolab.com') ? 'official_link' : 'community_link';
    } catch {
      message.textContent = 'Informe um link HTTPS válido ou deixe a evidência vazia.';
      message.className = 'skill-audit-message error';
      return;
    }
  }

  button.disabled = true;
  button.textContent = 'Enviando...';
  message.textContent = 'Registrando sua conferência com segurança...';
  message.className = 'skill-audit-message';
  try {
    const { error } = await supabase.rpc('echo_submit_hero_skill_audit_v1', {
      p_hero_id: activeAuditTarget.hero.id,
      p_skill_id: activeAuditTarget.skill.id,
      p_verdict: verdict,
      p_observation: observation,
      p_game_version: gameVersion || null,
      p_evidence_kind: evidenceKind,
      p_evidence_reference: evidence || null
    });
    if (error) throw error;
    message.textContent = 'Validação enviada. Após dois pareceres independentes, ela poderá gerar reputação e seu crédito público.';
    message.className = 'skill-audit-message ok';
    button.textContent = 'Contribuição enviada ✓';
    setTimeout(closeAuditDialog, 2600);
  } catch (error) {
    message.textContent = auditErrorMessage(error);
    message.className = 'skill-audit-message error';
    button.disabled = false;
    button.textContent = 'Enviar para auditoria';
  }
}

function openDetail(slug, { syncUrl = true } = {}) {
  const hero = heroes.find(item => item.slug === slug);
  if (!hero) return;
  const color = classColor(hero);
  const media = mediaOf(hero, 'main');
  detail.style.setProperty('--class-color', color);
  detailMedia.setAttribute('style', mediaStyle(media, 'contain'));
  detailMedia.innerHTML = mediaInner(media, hero.name);
  detailMedia.classList.toggle('empty', !media);
  const enabled = hero.enabled !== false;

  detailBody.innerHTML = `
    <h2>${escapeHtml(hero.name)}</h2>
    <div class="hd-sub">${escapeHtml(hero.subtitle || hero.class_name || '')}</div>
    <div class="hd-badges"><span class="hd-badge">${escapeHtml(hero.class_name || 'Sem classe')}</span>${enabled ? '' : '<span class="hd-badge off">Indisponível</span>'}</div>
    ${renderHeroTrust(hero.id)}
    ${renderHeroAuditCredit(hero.id)}
    <div class="hd-section"><h3>Sobre</h3><div class="hd-text">${escapeHtml(hero.description || 'Informações em atualização.')}</div></div>
    ${hero.lore ? `<div class="hd-section"><h3>História</h3><div class="hd-text">${escapeHtml(hero.lore)}</div></div>` : ''}
    ${renderBaseStats(hero.id)}
    ${renderSkills(hero.id)}
    <div class="hd-section"><h3>Na comunidade</h3><div class="hd-stats"><div class="hd-stat"><span>Builds</span><strong>${compactNumber(hero.total_builds || 0)}</strong></div><div class="hd-stat"><span>Views</span><strong>${compactNumber(hero.total_views || 0)}</strong></div><div class="hd-stat"><span>Curtidas</span><strong>${compactNumber(hero.total_likes || 0)}</strong></div></div></div>
    <a class="hd-cta" href="./criar-build.html">Criar build com este herói</a>`;

  detail.classList.add('open');
  detail.setAttribute('aria-hidden', 'false');
  detailBackdrop.classList.add('open');
  requestedHeroSlug = hero.slug;
  if (syncUrl) syncRoute();
}

function closeDetail({ syncUrl = true } = {}) {
  closeAuditDialog();
  detail.classList.remove('open');
  detail.setAttribute('aria-hidden', 'true');
  detailBackdrop.classList.remove('open');
  requestedHeroSlug = '';
  if (syncUrl) syncRoute();
}

grid.addEventListener('click', event => {
  const card = event.target.closest('[data-slug]');
  if (card) openDetail(card.dataset.slug);
});
classFilters.addEventListener('click', event => {
  const button = event.target.closest('[data-class]');
  if (!button) return;
  if (detail.classList.contains('open')) closeDetail({ syncUrl: false });
  activeClass = button.dataset.class;
  requestedHeroSlug = '';
  classFilters.querySelectorAll('b').forEach(item => item.classList.toggle('on', item === button));
  syncRoute();
  renderGrid();
});
let searchTimer = null;
search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderGrid, 200); });
sort.addEventListener('change', renderGrid);
detailClose.addEventListener('click', () => closeDetail());
detailBackdrop.addEventListener('click', () => closeDetail());
detailBody.addEventListener('click', event => {
  const button = event.target.closest('[data-validate-skill]');
  if (button) openSkillAudit(button.dataset.validateSkill);
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if ($('skill-audit-dialog')?.classList.contains('open')) closeAuditDialog();
  else closeDetail();
});

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows || []) {
    const id = row[key];
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
  }
  return map;
}

async function loadAuditCredits() {
  const heroIds = heroes.map(hero => hero.id).filter(Boolean).slice(0, 50);
  if (!heroIds.length) return;
  const creditsResult = await supabase.rpc('echo_public_hero_audit_credits_v1', { p_hero_ids: heroIds });
  if (creditsResult.error) {
    console.warn('[herois] Créditos de auditoria indisponíveis:', creditsResult.error.message);
    return;
  }
  const credits = creditsResult.data || [];
  auditCreditsBySkill = groupBy(credits, 'skill_id');
  const userIds = [...new Set(credits.map(row => row.contributor_id).filter(Boolean))].slice(0, 50);
  if (!userIds.length) return;
  const identitiesResult = await supabase.rpc('echo_public_identity_cards_v1', { p_user_ids: userIds });
  if (identitiesResult.error) {
    console.warn('[herois] Identidades públicas de auditores indisponíveis:', identitiesResult.error.message);
    return;
  }
  identityCardsByUser = new Map((identitiesResult.data || []).map(row => [row.user_id, row]));
}

async function load() {
  try {
    const [
      heroesResult,
      classesResult,
      skillsResult,
      skillLevelsResult,
      statsResult,
      definitionsResult,
      sourceLinksResult,
      sourcesResult,
      balanceHistoryResult
    ] = await Promise.all([
      supabase.from('v_heroes_complete').select('*').eq('enabled', true),
      supabase.from('hero_classes').select('id, name, slug, color').order('name'),
      supabase.from('hero_skills').select('id,hero_id,name,slug,description,skill_type,cooldown,duration,energy_cost,unlock_level,max_level,display_order,enabled,verification_status,verified_at,verified_patch,needs_recheck,verification_note').eq('enabled', true).order('display_order', { ascending:true }),
      supabase.from('hero_skill_levels').select('id,skill_id,level,damage,healing,shield,cooldown,duration,radius,range,speed,energy_cost,description').order('level', { ascending:true }),
      supabase.from('hero_base_stats').select('hero_id,stat_key,value'),
      supabase.from('stat_definitions').select('key,name,unit,decimals,display_order,enabled').eq('enabled', true),
      supabase.from('hero_skill_source_links').select('id,skill_id,source_id,coverage,is_primary,verification_status,verified_at,verified_patch,needs_recheck,public_note'),
      supabase.from('source_references').select('id,url,source_type,language,title,publisher,last_checked_at,source_updated_at'),
      supabase.from('balance_history').select('id,skill_id,source_id,patch_version,change_type,attribute_name,old_value,new_value,description,created_at').not('skill_id', 'is', null)
    ]);
    if (heroesResult.error) throw heroesResult.error;
    if (classesResult.error) throw classesResult.error;
    if (skillsResult.error) console.warn('[herois] Habilidades indisponíveis:', skillsResult.error.message);
    if (skillLevelsResult.error) console.warn('[herois] Níveis de habilidades indisponíveis:', skillLevelsResult.error.message);
    if (statsResult.error) console.warn('[herois] Status base indisponíveis:', statsResult.error.message);
    if (definitionsResult.error) console.warn('[herois] Definições de status indisponíveis:', definitionsResult.error.message);
    if (sourceLinksResult.error) console.warn('[herois] Vínculos de fontes indisponíveis:', sourceLinksResult.error.message);
    if (sourcesResult.error) console.warn('[herois] Catálogo de fontes indisponível:', sourcesResult.error.message);
    if (balanceHistoryResult.error) console.warn('[herois] Histórico de habilidades indisponível:', balanceHistoryResult.error.message);

    heroes = (heroesResult.data ?? []).map(normalizeHeroMedia);
    classes = classesResult.data ?? [];
    skillsByHero = groupBy(skillsResult.data || [], 'hero_id');
    skillLevelsBySkill = groupBy(skillLevelsResult.data || [], 'skill_id');
    baseStatsByHero = groupBy(statsResult.data || [], 'hero_id');
    statDefinitions = new Map((definitionsResult.data || []).map(row => [row.key, row]));
    sourceLinksBySkill = groupBy(sourceLinksResult.error ? [] : (sourceLinksResult.data || []), 'skill_id');
    sourcesById = new Map((sourcesResult.error ? [] : (sourcesResult.data || [])).map(row => [row.id, row]));
    balanceHistoryBySkill = groupBy(balanceHistoryResult.error ? [] : (balanceHistoryResult.data || []), 'skill_id');
    await loadAuditCredits();

    if (activeClass && !classes.some(item => item.slug === activeClass)) activeClass = '';
    if (requestedHeroSlug && !heroes.some(item => item.slug === requestedHeroSlug)) requestedHeroSlug = '';

    renderClassFilters();
    renderGrid();
    syncRoute();

    if (requestedHeroSlug) openDetail(requestedHeroSlug, { syncUrl: false });
  } catch (error) {
    console.error('Erro ao carregar heróis:', error);
    grid.innerHTML = '<div class="loading-card">Não foi possível carregar os heróis.</div>';
    countLabel.textContent = '—';
  }
}

await load();
