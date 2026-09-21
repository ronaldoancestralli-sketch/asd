import {
  listHeroes,
  listHeroPublicationChecks,
  deleteHero,
  setHeroEnabled
} from '../../js/api.js?v=20260823-security-supabase-pin-1';
import { getPublicMediaUrl, removeGameMedia } from '../../js/admin-media.js?v=20260823-security-supabase-pin-1';
import {
  loadHeroPublicParityData,
  mergeHeroPublicState
} from './heroes-public-parity.js?v=20260821-admin-experience-2&sb=20260823-security-supabase-pin-1';

const list = document.getElementById('heroes-list');
const search = document.getElementById('search');
const statusFilter = document.getElementById('status-filter');
const sortFilter = document.getElementById('sort-filter');
const message = document.getElementById('message');
const parityStatus = document.getElementById('hero-parity-status');

let heroes = [];
let publicationChecks = new Map();
let isLoading = false;
let activeActionId = null;
let publicParityAvailable = false;
let publicParityError = null;

function injectPublicationStyles() {
  if (document.getElementById('heroes-publication-style')) return;
  const style = document.createElement('style');
  style.id = 'heroes-publication-style';
  style.textContent = `
    .hero-readiness{display:flex;align-items:center;gap:5px;margin-top:7px;flex-wrap:wrap}
    .hero-readiness-badge{display:inline-flex;align-items:center;min-height:20px;padding:3px 7px;border:1px solid #28583a;border-radius:999px;background:#0b2518;color:#86efac;font-size:7px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
    .hero-readiness-badge.warn{border-color:#70571e;background:#2b210d;color:#f5d276}
    .hero-readiness-badge.block{border-color:#b52339;background:#490b16;color:#ff4057}
    .hero-readiness-note{color:var(--admin-muted);font-size:8px}
  `;
  document.head.appendChild(style);
}

function setMessage(text = '', type = '') {
  if (!message) return;
  message.textContent = text;
  message.className = `heroes-message${type ? ` ${type}` : ''}`;
}

function setMetric(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value === null || value === undefined ? '—' : String(value);
}

function setParityStatus(text, type = '') {
  if (!parityStatus) return;
  parityStatus.textContent = text;
  parityStatus.classList.toggle('error', type === 'error');
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getHeroMediaPath(hero) {
  return hero.card_image_path || hero.image_path || hero.gif_path || '';
}

function getHeroMediaUrl(hero) {
  const publicSource = hero.card_source || hero.main_source || '';
  if (publicSource) return publicSource;
  return getPublicMediaUrl(getHeroMediaPath(hero));
}

function getHeroClassName(hero) {
  return (
    hero.class_name ||
    hero.hero_class_name ||
    hero.class?.name ||
    hero.hero_classes?.name ||
    hero.classes?.name ||
    hero.class_id ||
    'Sem classe'
  );
}

function getPublicationCheck(heroId) {
  return publicationChecks.get(String(heroId)) || null;
}

function publicationMarkup(hero) {
  const check = getPublicationCheck(hero.id);
  if (!check) {
    return '<div class="hero-readiness"><span class="hero-readiness-badge warn">Não verificado</span></div>';
  }

  const blocking = Array.isArray(check.blocking) ? check.blocking : [];
  const warnings = Array.isArray(check.warnings) ? check.warnings : [];
  const counts = check.counts || {};

  if (!check.ready) {
    const title = blocking.map(item => item?.label).filter(Boolean).join(' ');
    return `<div class="hero-readiness" title="${escapeHtml(title)}"><span class="hero-readiness-badge block">Bloqueado</span><span class="hero-readiness-note">${blocking.length} requisito(s) ausente(s)</span></div>`;
  }

  if (warnings.length) {
    return `<div class="hero-readiness"><span class="hero-readiness-badge warn">Publicável</span><span class="hero-readiness-note">${warnings.length} atenção · ${toNumber(counts.skills, 0)} habilidade(s)</span></div>`;
  }

  return `<div class="hero-readiness"><span class="hero-readiness-badge">Completo</span><span class="hero-readiness-note">${toNumber(counts.skills, 0)} habilidade(s)</span></div>`;
}

function publicParityMarkup(hero) {
  if (!publicParityAvailable) {
    return '<div class="hero-public-parity"><span class="warn">Paridade indisponível</span></div>';
  }

  const skills = toNumber(hero.public_skill_count, 0);
  return `<div class="hero-public-parity">
    <span class="${hero.main_source ? 'ok' : 'warn'}">Main ${hero.main_source ? '✓' : '—'}</span>
    <span class="${hero.card_source ? 'ok' : 'warn'}">Card ${hero.card_source ? '✓' : '—'}</span>
    <span class="${skills === 4 ? 'ok' : 'warn'}">${skills} skills</span>
  </div>`;
}

function updateParityMetrics() {
  const blocked = [...publicationChecks.values()]
    .filter(check => check?.ready === false)
    .length;
  setMetric('hero-admin-blocked', blocked);

  if (!publicParityAvailable) {
    setMetric('hero-admin-active', null);
    setMetric('hero-admin-media', null);
    setMetric('hero-admin-skills', null);
    setParityStatus(
      `Paridade pública indisponível nesta leitura: ${publicParityError?.message || 'fonte pública não carregada'}. Os cards usam o fallback do cadastro Admin.`,
      'error'
    );
    return;
  }

  const active = heroes.filter(hero => hero.enabled !== false);
  const mediaReady = active.filter(hero => hero.main_source && hero.card_source).length;
  const skillTotal = heroes.reduce(
    (sum, hero) => sum + toNumber(hero.public_skill_count, 0),
    0
  );

  setMetric('hero-admin-active', active.length);
  setMetric('hero-admin-media', mediaReady);
  setMetric('hero-admin-skills', skillTotal);
  setParityStatus(
    'Paridade direta ativa: os cards já nascem com card_source/main_source de v_heroes_complete, sem patch pós-render.'
  );
}

function getFilteredHeroes() {
  const query = normalizeText(search?.value);
  const selectedStatus = statusFilter?.value || 'all';
  const selectedSort = sortFilter?.value || 'display_order';

  const filtered = heroes.filter(hero => {
    const matchesQuery =
      !query ||
      normalizeText(hero.name).includes(query) ||
      normalizeText(hero.slug).includes(query);

    const matchesStatus =
      selectedStatus === 'all' ||
      (selectedStatus === 'active' && hero.enabled !== false) ||
      (selectedStatus === 'inactive' && hero.enabled === false);

    return matchesQuery && matchesStatus;
  });

  filtered.sort((first, second) => {
    if (selectedSort === 'name') {
      return String(first.name || '').localeCompare(String(second.name || ''), 'pt-BR');
    }

    if (selectedSort === 'status') {
      const firstEnabled = first.enabled !== false ? 0 : 1;
      const secondEnabled = second.enabled !== false ? 0 : 1;
      if (firstEnabled !== secondEnabled) return firstEnabled - secondEnabled;
      return String(first.name || '').localeCompare(String(second.name || ''), 'pt-BR');
    }

    const orderDifference =
      toNumber(first.display_order, 0) - toNumber(second.display_order, 0);
    if (orderDifference !== 0) return orderDifference;

    return String(first.name || '').localeCompare(String(second.name || ''), 'pt-BR');
  });

  return filtered;
}

function renderHeroCard(hero) {
  const mediaUrl = getHeroMediaUrl(hero);
  const enabled = hero.enabled !== false;
  const isBusy = activeActionId === hero.id;
  const check = getPublicationCheck(hero.id);
  const activationBlocked = !enabled && check && check.ready === false;
  const hasDirectPublicMedia = Boolean(hero.card_source || hero.main_source);

  return `
    <article class="hero-card" data-hero-id="${escapeHtml(hero.id)}">
      <div class="hero-card-media" data-public-media="${hasDirectPublicMedia ? 'direct' : 'fallback'}">
        ${mediaUrl
          ? `<img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(hero.name || '')}" loading="lazy">`
          : '<span class="hero-card-media-empty">Sem imagem</span>'}

        <span class="hero-card-status ${enabled ? '' : 'is-inactive'}">
          ${enabled ? 'Ativo' : 'Inativo'}
        </span>
      </div>

      <div class="hero-card-body">
        <div class="hero-card-heading">
          <h2>${escapeHtml(hero.name || 'Herói sem nome')}</h2>
          <p>${escapeHtml(hero.slug || 'sem-identificador')}</p>
          ${publicationMarkup(hero)}
          ${publicParityMarkup(hero)}
        </div>

        <div class="hero-card-meta">
          <div class="hero-card-meta-item">
            <span>Classe</span>
            <strong>${escapeHtml(getHeroClassName(hero))}</strong>
          </div>
          <div class="hero-card-meta-item">
            <span>Ordem</span>
            <strong>${escapeHtml(toNumber(hero.display_order, 0))}</strong>
          </div>
        </div>

        <div class="hero-card-actions">
          <a class="admin-button" href="./hero-editor.html?id=${encodeURIComponent(hero.id)}">Editar</a>
          <a class="admin-button" href="./hero-editor.html?id=${encodeURIComponent(hero.id)}&tab=abilities">Habilidades</a>
          <a class="admin-button" href="./hero-stats.html?hero=${encodeURIComponent(hero.id)}">Status</a>
          <a class="admin-button public-preview" data-public-preview href="../herois.html?heroi=${encodeURIComponent(hero.slug || '')}" target="_blank" rel="noopener" title="Abrir ficha pública">Público</a>

          <button
            class="admin-button"
            type="button"
            data-toggle="${escapeHtml(hero.id)}"
            data-enabled="${enabled}"
            ${isBusy ? 'disabled' : ''}
            title="${activationBlocked ? 'Há requisitos de publicação ausentes. Clique para ver a validação.' : ''}"
          >
            ${isBusy ? 'Aguarde...' : enabled ? 'Desativar' : 'Ativar'}
          </button>

          <button
            class="admin-button danger"
            type="button"
            data-delete="${escapeHtml(hero.id)}"
            ${isBusy ? 'disabled' : ''}
          >Excluir</button>
        </div>
      </div>
    </article>
  `;
}

function render() {
  const rows = getFilteredHeroes();
  if (!rows.length) {
    list.innerHTML = '<div class="heroes-empty">Nenhum herói encontrado.</div>';
    return;
  }

  list.innerHTML = rows.map(renderHeroCard).join('');
  bindCardActions();
}

async function refreshPublicationChecks() {
  const checks = await listHeroPublicationChecks();
  publicationChecks = new Map(
    checks
      .filter(item => item?.hero_id)
      .map(item => [String(item.hero_id), item])
  );
}

async function toggleHero(heroId) {
  const hero = heroes.find(item => String(item.id) === String(heroId));
  if (!hero) return;

  activeActionId = hero.id;
  render();
  setMessage(hero.enabled !== false ? `Desativando ${hero.name}...` : `Validando publicação de ${hero.name}...`);

  try {
    const newEnabledValue = hero.enabled === false;
    const result = await setHeroEnabled(hero.id, newEnabledValue);

    hero.enabled = newEnabledValue;
    if (result?.check) publicationChecks.set(String(hero.id), result.check);

    setMessage(
      newEnabledValue ? `${hero.name} foi validado e ativado.` : `${hero.name} foi desativado.`,
      'ok'
    );
  } catch (error) {
    console.error('Erro ao alterar herói:', error);
    if (error.publicationCheck) {
      publicationChecks.set(String(hero.id), error.publicationCheck);
    }
    setMessage(
      error.message || 'Não foi possível alterar o status do herói.',
      'error'
    );
  } finally {
    activeActionId = null;
    render();
    updateParityMetrics();
  }
}

async function removeHeroMedia(hero) {
  const paths = [
    ...new Set([
      hero.image_path,
      hero.card_image_path,
      hero.gif_path
    ].filter(Boolean))
  ];

  for (const path of paths) {
    try {
      await removeGameMedia(path);
    } catch (error) {
      console.warn(`Não foi possível remover a mídia "${path}":`, error);
    }
  }
}

async function removeHero(heroId) {
  const hero = heroes.find(item => String(item.id) === String(heroId));
  if (!hero) return;

  const confirmed = window.confirm(
    `Excluir "${hero.name}" permanentemente?\n\n` +
    'Os dados do herói serão removidos. Essa ação não pode ser desfeita.'
  );
  if (!confirmed) return;

  activeActionId = hero.id;
  render();
  setMessage(`Excluindo ${hero.name}...`);

  try {
    await deleteHero(hero.id);
    await removeHeroMedia(hero);
    heroes = heroes.filter(item => item.id !== hero.id);
    publicationChecks.delete(String(hero.id));
    setMessage(`${hero.name} foi excluído.`, 'ok');
  } catch (error) {
    console.error('Erro ao excluir herói:', error);
    setMessage(error.message || 'Não foi possível excluir o herói.', 'error');
  } finally {
    activeActionId = null;
    render();
    updateParityMetrics();
  }
}

function bindCardActions() {
  list.querySelectorAll('[data-toggle]').forEach(button => {
    button.addEventListener('click', () => toggleHero(button.dataset.toggle));
  });

  list.querySelectorAll('[data-delete]').forEach(button => {
    button.addEventListener('click', () => removeHero(button.dataset.delete));
  });
}

async function load() {
  if (isLoading) return;
  isLoading = true;

  list.innerHTML = '<div class="heroes-empty">Carregando heróis...</div>';
  setMessage('Carregando e validando publicação...');

  try {
    const [heroRows, checks, parityResult] = await Promise.all([
      listHeroes(),
      listHeroPublicationChecks(),
      loadHeroPublicParityData()
        .then(data => ({ data, error: null }))
        .catch(error => ({ data: null, error }))
    ]);

    publicationChecks = new Map(
      (checks || [])
        .filter(item => item?.hero_id)
        .map(item => [String(item.hero_id), item])
    );

    publicParityAvailable = Boolean(parityResult.data);
    publicParityError = parityResult.error || null;
    heroes = publicParityAvailable
      ? heroRows.map(hero => mergeHeroPublicState(hero, parityResult.data))
      : heroRows;

    setMessage('');
    render();
    updateParityMetrics();
  } catch (error) {
    console.error('Erro ao carregar heróis:', error);
    list.innerHTML = '<div class="heroes-empty">Não foi possível carregar os heróis.</div>';
    setMessage(error.message || 'Não foi possível carregar os heróis.', 'error');
    setMetric('hero-admin-active', null);
    setMetric('hero-admin-media', null);
    setMetric('hero-admin-skills', null);
    setMetric('hero-admin-blocked', null);
    setParityStatus(`Paridade pública indisponível: ${error.message}`, 'error');
  } finally {
    isLoading = false;
  }
}

injectPublicationStyles();

search?.addEventListener('input', render);
statusFilter?.addEventListener('change', render);
sortFilter?.addEventListener('change', render);

await load();
