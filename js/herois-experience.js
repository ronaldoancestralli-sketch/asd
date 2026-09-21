import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import { normalizeHeroMedia } from './media-storage.js?v=20260823-security-supabase-pin-1';
import {
  escapeHtml,
  compactNumber,
  classColor,
  mediaOf,
  mediaStyle,
  mediaInner
} from './site-shell.js?v=20260831-hero-gif-rollback-1&sb=20260823-security-supabase-pin-1&identity=20260825-v6-public-1&ops=20260905&sc=20260906-1&eq=20260907-effects-1';

/* =========================================================
   HERÓIS — camada de descoberta / inteligência
   Usa somente dados já publicados no Supabase.
   A ficha detalhada continua pertencendo a herois.js.
   ========================================================= */

const $ = id => document.getElementById(id);
const page = document.querySelector('.heroes-page');
const grid = $('grid');
const classFilters = $('class-filters');
const classShowcase = $('class-showcase');
const explorer = $('hero-explorer');
const cycleControl = $('class-cycle-control');
const featuredLabel = document.querySelector('.featured-overline [data-cms-text="featured_label"]');
const featuredLiveLabel = document.querySelector('.featured-overline [data-cms-text="featured_live_label"]');
const featuredOpenLabel = document.querySelector('#featured-open [data-cms-text="featured_open_button"]');
const featuredOpenIcon = document.querySelector('#featured-open > span:last-child');

const defaultFeaturedCopy = {
  label: featuredLabel?.textContent || 'Herói em foco',
  live: featuredLiveLabel?.textContent || 'registro ativo',
  action: featuredOpenLabel?.textContent || 'Ver ficha completa',
  icon: featuredOpenIcon?.textContent || '→'
};

if (!page || !grid || !classFilters || !classShowcase) {
  console.warn('[herois-experience] Estrutura da página não encontrada.');
} else {
  const state = {
    heroes: [],
    classes: [],
    skillsByHero: new Map(),
    statsByHero: new Map(),
    definitions: new Map(),
    skillsAvailable: true,
    statsAvailable: true,
    featuredSlug: '',
    renderQueued: false,
    transitionTimer: 0
  };

  function activeClassSlug() {
    return classFilters.querySelector('[data-class].on')?.dataset.class ?? '';
  }

  function isRosterOverview() {
    return activeClassSlug() === '' && !new URLSearchParams(location.search).get('heroi');
  }

  function allSkills() {
    return [...state.skillsByHero.values()].flat().filter(skill => skill.enabled !== false);
  }

  function setFeaturedChrome({ label, live, action, icon }) {
    if (featuredLabel) featuredLabel.textContent = label;
    if (featuredLiveLabel) featuredLiveLabel.textContent = live;
    if (featuredOpenLabel) featuredOpenLabel.textContent = action;
    if (featuredOpenIcon) featuredOpenIcon.textContent = icon;
  }

  function animateClassTransition() {
    if (!explorer || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    explorer.classList.remove('is-class-switching');
    void explorer.offsetWidth;
    explorer.classList.add('is-class-switching');
    window.clearTimeout(state.transitionTimer);
    state.transitionTimer = window.setTimeout(() => explorer.classList.remove('is-class-switching'), 420);
  }

  function classOptions() {
    return [
      { slug: '', name: 'Todos', color: '#9367ff' },
      ...state.classes.map(item => ({ slug: item.slug || '', name: item.name || 'Classe', color: classColor(item) }))
    ];
  }

  function updateClassCycleControl() {
    if (!cycleControl) return;
    const options = classOptions();
    if (!options.length) return;
    const activeIndex = Math.max(0, options.findIndex(item => item.slug === activeClassSlug()));
    const nextIndex = (activeIndex + 1) % options.length;
    const next = options[nextIndex];
    cycleControl.style.setProperty('--cycle-color', next.color || '#9367ff');
    cycleControl.setAttribute('aria-label', `Ir para a classe ${next.name}`);
    $('class-cycle-name').textContent = next.name;
    $('class-cycle-index').textContent = `${activeIndex + 1}/${options.length}`;
  }

  function activateClass(slug = '') {
    const original = [...classFilters.querySelectorAll('[data-class]')]
      .find(item => item.dataset.class === slug);
    if (!original) return;
    animateClassTransition();
    original.click();
    syncClassShowcase(slug);
    window.setTimeout(() => {
      if (slug === '') renderRosterOverview();
      else {
        const first = firstVisibleHero();
        if (first) setFeatured(first);
      }
      updateClassCycleControl();
    }, 0);
  }

  function cycleClass() {
    const options = classOptions();
    if (!options.length) return;
    const activeIndex = Math.max(0, options.findIndex(item => item.slug === activeClassSlug()));
    activateClass(options[(activeIndex + 1) % options.length].slug);
  }

  function groupBy(rows, key) {
    const map = new Map();
    for (const row of rows || []) {
      const value = row[key];
      if (!map.has(value)) map.set(value, []);
      map.get(value).push(row);
    }
    return map;
  }

  function heroBySlug(slug = '') {
    return state.heroes.find(hero => String(hero.slug) === String(slug)) || null;
  }

  function definitionFor(key) {
    return state.definitions.get(key) || null;
  }

  function statName(row) {
    return definitionFor(row.stat_key)?.name || String(row.stat_key || '').replaceAll('_', ' ');
  }

  function statValue(row) {
    const numeric = Number(row.value);
    if (!Number.isFinite(numeric)) return '—';
    const definition = definitionFor(row.stat_key);
    const decimals = Math.max(0, Math.min(4, Number(definition?.decimals ?? 0)));
    const value = numeric.toLocaleString('pt-BR', { maximumFractionDigits: decimals });
    const unit = String(definition?.unit || '').trim();
    if (!unit) return value;
    return unit === '%' ? `${value}%` : `${value} ${unit}`;
  }

  function heroStats(heroId) {
    return (state.statsByHero.get(heroId) || [])
      .filter(row => Number.isFinite(Number(row.value)))
      .slice()
      .sort((a, b) => Number(definitionFor(a.stat_key)?.display_order ?? 9999) - Number(definitionFor(b.stat_key)?.display_order ?? 9999));
  }

  function heroSkills(heroId) {
    return (state.skillsByHero.get(heroId) || [])
      .filter(skill => skill.enabled !== false)
      .slice()
      .sort((a, b) => Number(a.display_order ?? 9999) - Number(b.display_order ?? 9999));
  }

  function verificationState(heroId) {
    if (!state.skillsAvailable) {
      return { label: 'Verificação indisponível nesta leitura', className: 'is-unverified', short: 'Indisponível' };
    }

    const skills = heroSkills(heroId);
    if (!skills.length) return { label: 'Sem habilidades publicadas', className: 'is-unverified', short: 'Sem dados' };

    const fullyVerified = skills.every(skill => skill.verification_status === 'verified' && skill.needs_recheck === false);
    if (fullyVerified) return { label: `${skills.length} habilidades com verificação completa`, className: 'is-verified', short: 'Verificado' };

    const corroborated = skills.filter(skill => ['verified', 'corroborated'].includes(skill.verification_status)).length;
    if (corroborated) return { label: `${corroborated}/${skills.length} habilidades corroboradas ou verificadas`, className: '', short: 'Corroborado' };

    return { label: 'Habilidades aguardando verificação suficiente', className: 'is-unverified', short: 'Em revisão' };
  }

  function mediaBackdrop(media) {
    if (!media?.source) return '';
    const isVideo = String(media.mime_type || '').startsWith('video/') || /\.(mp4|webm)$/i.test(media.source);
    return isVideo
      ? `<video src="${escapeHtml(media.source)}" autoplay muted loop playsinline></video>`
      : `<img src="${escapeHtml(media.source)}" alt="" loading="eager" decoding="async">`;
  }

  function setFeatured(hero, { preserveClass = true } = {}) {
    if (!hero) return;
    state.featuredSlug = hero.slug;
    page.classList.remove('is-roster-overview');
    setFeaturedChrome(defaultFeaturedCopy);

    const color = classColor(hero);
    const mainMedia = mediaOf(hero, 'main') || mediaOf(hero, 'card');
    const proof = verificationState(hero.id);
    const skills = state.skillsAvailable ? heroSkills(hero.id).slice(0, 4) : [];
    const stats = state.statsAvailable ? heroStats(hero.id).slice(0, 4) : [];

    page.style.setProperty('--featured-color', color);
    $('hero-explorer')?.style.setProperty('--featured-color', color);

    const background = $('hero-explorer-bg');
    if (background) background.innerHTML = mediaBackdrop(mainMedia);

    const media = $('featured-media');
    if (media) {
      media.setAttribute('style', mediaStyle(mainMedia, 'contain'));
      media.innerHTML = mediaInner(mainMedia, hero.name);
      media.classList.toggle('empty', !mainMedia);
    }

    $('featured-watermark').textContent = hero.name || '';
    $('featured-name').textContent = hero.name || '—';
    $('featured-role').textContent = hero.subtitle || hero.class_name || 'Herói';
    $('featured-description').textContent = hero.description || 'Informações em atualização.';

    const trust = $('featured-trust');
    if (trust) {
      trust.className = `featured-trust ${proof.className}`.trim();
      trust.innerHTML = `<span class="featured-trust-dot"></span><span>${escapeHtml(proof.label)}</span>`;
    }

    const statsHost = $('featured-stats');
    if (statsHost) {
      if (!state.statsAvailable) {
        statsHost.innerHTML = '<div class="featured-stat"><span>Status base</span><strong>—</strong></div>';
      } else {
        statsHost.innerHTML = stats.length
          ? stats.map(row => `<div class="featured-stat"><span>${escapeHtml(statName(row))}</span><strong>${escapeHtml(statValue(row))}</strong></div>`).join('')
          : '<div class="featured-stat"><span>Status base</span><strong>Sem registros</strong></div>';
      }
    }

    const skillsHost = $('featured-skills');
    if (skillsHost) {
      if (!state.skillsAvailable) {
        skillsHost.innerHTML = '<span class="featured-skill">Habilidades indisponíveis nesta leitura</span>';
      } else {
        skillsHost.innerHTML = skills.length
          ? skills.map(skill => `<span class="featured-skill">${escapeHtml(skill.name)}${skill.max_level ? ` · nv. ${escapeHtml(skill.max_level)}` : ''}</span>`).join('')
          : '<span class="featured-skill">Sem habilidades publicadas</span>';
      }
    }

    $('featured-builds').textContent = compactNumber(hero.total_builds || 0);
    $('featured-views').textContent = compactNumber(hero.total_views || 0);
    $('featured-likes').textContent = compactNumber(hero.total_likes || 0);

    grid.querySelectorAll('.hc').forEach(card => card.classList.toggle('is-featured', card.dataset.slug === hero.slug));

    if (!preserveClass) syncClassShowcase(hero.class_slug || '');
    updateClassCycleControl();
  }

  function renderRosterOverview() {
    const skills = state.skillsAvailable ? allSkills() : [];
    const trustedSkills = skills.filter(skill => ['verified', 'corroborated'].includes(skill.verification_status)).length;
    const coveredHeroes = state.skillsAvailable
      ? state.heroes.filter(hero => heroSkills(hero.id).length > 0).length
      : 0;
    const classCounts = new Map();
    for (const hero of state.heroes) {
      classCounts.set(hero.class_slug || '', (classCounts.get(hero.class_slug || '') || 0) + 1);
    }

    state.featuredSlug = '';
    page.classList.add('is-roster-overview');
    page.style.setProperty('--featured-color', '#9367ff');
    explorer?.style.setProperty('--featured-color', '#9367ff');
    grid.querySelectorAll('.hc').forEach(card => card.classList.remove('is-featured'));

    $('featured-watermark').textContent = 'TODOS';
    $('featured-name').textContent = 'Roster completo';
    $('featured-role').textContent = `${state.heroes.length} heróis · ${state.classes.length} classes`;
    $('featured-description').textContent = 'Uma visão geral do elenco ativo. Escolha uma classe para ver seu primeiro combatente em destaque ou explore todos os heróis no roster.';
    setFeaturedChrome({
      label: 'Visão geral do roster',
      live: 'elenco sincronizado',
      action: 'Explorar roster',
      icon: '↓'
    });

    const trust = $('featured-trust');
    if (trust) {
      trust.className = `featured-trust ${state.skillsAvailable && coveredHeroes === state.heroes.length ? 'is-verified' : ''}`.trim();
      trust.innerHTML = `<span class="featured-trust-dot"></span><span>${state.skillsAvailable
        ? `${coveredHeroes}/${state.heroes.length} heróis com habilidades publicadas · ${trustedSkills}/${skills.length} habilidades corroboradas`
        : 'Cobertura de habilidades indisponível nesta leitura'}</span>`;
    }

    const statsHost = $('featured-stats');
    if (statsHost) {
      statsHost.innerHTML = [
        ['Heróis ativos', state.heroes.length],
        ['Classes', state.classes.length],
        ['Habilidades', state.skillsAvailable ? skills.length : '—'],
        ['Cobertura', state.skillsAvailable ? `${coveredHeroes}/${state.heroes.length}` : '—']
      ].map(([label, value]) => `<div class="featured-stat overview-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
    }

    const skillsHost = $('featured-skills');
    if (skillsHost) {
      skillsHost.innerHTML = state.classes.length
        ? state.classes.map(item => `<span class="featured-skill overview-class" style="--overview-class-color:${escapeHtml(classColor(item))}"><i></i>${escapeHtml(item.name)} · ${escapeHtml(classCounts.get(item.slug) || 0)}</span>`).join('')
        : '<span class="featured-skill">Classes em atualização</span>';
    }

    $('featured-builds').textContent = compactNumber(state.heroes.reduce((sum, hero) => sum + Number(hero.total_builds || 0), 0));
    $('featured-views').textContent = compactNumber(state.heroes.reduce((sum, hero) => sum + Number(hero.total_views || 0), 0));
    $('featured-likes').textContent = compactNumber(state.heroes.reduce((sum, hero) => sum + Number(hero.total_likes || 0), 0));
    updateClassCycleControl();
  }

  function syncClassShowcase(activeSlug = null) {
    const filter = activeSlug ?? classFilters.querySelector('[data-class].on')?.dataset.class ?? '';
    classShowcase.querySelectorAll('[data-class-showcase]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.classShowcase === filter);
    });
  }

  function renderClassShowcase() {
    const counts = new Map();
    for (const hero of state.heroes) counts.set(hero.class_slug || '', (counts.get(hero.class_slug || '') || 0) + 1);

    const allCard = `<button class="class-card ${classFilters.querySelector('[data-class=""].on') ? 'is-active' : ''}" type="button" data-class-showcase="" style="--class-color:#9367ff"><small>Roster completo</small><strong>Todos</strong><span>${state.heroes.length} herói${state.heroes.length === 1 ? '' : 's'}</span></button>`;
    const classCards = state.classes.map(item => {
      const color = classColor(item);
      const count = counts.get(item.slug) || 0;
      return `<button class="class-card" type="button" data-class-showcase="${escapeHtml(item.slug)}" style="--class-color:${escapeHtml(color)}"><small>Classe</small><strong>${escapeHtml(item.name)}</strong><span>${count} herói${count === 1 ? '' : 's'}</span></button>`;
    }).join('');

    classShowcase.innerHTML = allCard + classCards;
    syncClassShowcase();
    updateClassCycleControl();
  }

  function enrichCards() {
    for (const card of grid.querySelectorAll('.hc[data-slug]')) {
      const hero = heroBySlug(card.dataset.slug);
      if (!hero) continue;

      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Abrir ficha de ${hero.name}`);
      card.classList.toggle('is-featured', hero.slug === state.featuredSlug);

      if (!card.querySelector('.hc-proof')) {
        const proof = verificationState(hero.id);
        const badge = document.createElement('div');
        badge.className = `hc-proof ${proof.className.replace('is-', '')}`.trim();
        badge.innerHTML = `<i></i><span>${escapeHtml(proof.short)}</span>`;
        card.appendChild(badge);
      }

      if (!card.querySelector('.hc-intel')) {
        const skillCount = state.skillsAvailable ? String(heroSkills(hero.id).length) : '—';
        const intel = document.createElement('div');
        intel.className = 'hc-intel';
        intel.innerHTML = `<div><span>Builds</span><strong>${escapeHtml(compactNumber(hero.total_builds || 0))}</strong></div><div><span>Habilidades</span><strong>${escapeHtml(skillCount)}</strong></div>`;
        card.appendChild(intel);
      }
    }
  }

  function firstVisibleHero() {
    const firstCard = grid.querySelector('.hc[data-slug]');
    return firstCard ? heroBySlug(firstCard.dataset.slug) : null;
  }

  function reconcileFeatured() {
    enrichCards();
    if (isRosterOverview()) {
      renderRosterOverview();
      syncClassShowcase();
      return;
    }
    const currentCard = [...grid.querySelectorAll('.hc[data-slug]')].find(card => card.dataset.slug === state.featuredSlug);
    if (!currentCard) {
      const first = firstVisibleHero();
      if (first) setFeatured(first);
    }
    syncClassShowcase();
  }

  function queueReconcile() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    requestAnimationFrame(() => {
      state.renderQueued = false;
      reconcileFeatured();
    });
  }

  function openFeaturedDetail() {
    if (isRosterOverview()) {
      document.querySelector('.roster-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const card = [...grid.querySelectorAll('.hc[data-slug]')].find(item => item.dataset.slug === state.featuredSlug);
    card?.click();
  }

  classShowcase.addEventListener('click', event => {
    const button = event.target.closest('[data-class-showcase]');
    if (!button) return;
    activateClass(button.dataset.classShowcase || '');
  });

  classFilters.addEventListener('click', () => window.setTimeout(queueReconcile, 0));
  cycleControl?.addEventListener('click', cycleClass);

  grid.addEventListener('mouseover', event => {
    if (isRosterOverview()) return;
    const card = event.target.closest('.hc[data-slug]');
    if (!card || card.dataset.slug === state.featuredSlug) return;
    const hero = heroBySlug(card.dataset.slug);
    if (hero) setFeatured(hero);
  });

  grid.addEventListener('focusin', event => {
    if (isRosterOverview()) return;
    const card = event.target.closest('.hc[data-slug]');
    const hero = card ? heroBySlug(card.dataset.slug) : null;
    if (hero) setFeatured(hero);
  });

  grid.addEventListener('click', event => {
    if (isRosterOverview()) return;
    const card = event.target.closest('.hc[data-slug]');
    const hero = card ? heroBySlug(card.dataset.slug) : null;
    if (hero) setFeatured(hero);
  }, true);

  grid.addEventListener('keydown', event => {
    const card = event.target.closest('.hc[data-slug]');
    if (!card || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    card.click();
  });

  $('featured-open')?.addEventListener('click', openFeaturedDetail);

  const observer = new MutationObserver(queueReconcile);
  observer.observe(grid, { childList: true });

  async function loadExperience() {
    try {
      const [heroesResult, classesResult, skillsResult, statsResult, definitionsResult] = await Promise.all([
        supabase.from('v_heroes_complete').select('*').eq('enabled', true).order('display_order', { ascending: true, nullsFirst: false }).order('name'),
        supabase.from('hero_classes').select('id,name,slug,color').order('name'),
        supabase.from('hero_skills').select('id,hero_id,name,skill_type,max_level,display_order,enabled,verification_status,needs_recheck').eq('enabled', true).order('display_order', { ascending: true }),
        supabase.from('hero_base_stats').select('hero_id,stat_key,value'),
        supabase.from('stat_definitions').select('key,name,unit,decimals,display_order,enabled').eq('enabled', true)
      ]);

      if (heroesResult.error) throw heroesResult.error;
      if (classesResult.error) throw classesResult.error;

      state.skillsAvailable = !skillsResult.error;
      state.statsAvailable = !statsResult.error && !definitionsResult.error;

      if (skillsResult.error) console.warn('[herois-experience] habilidades:', skillsResult.error.message);
      if (statsResult.error) console.warn('[herois-experience] status base:', statsResult.error.message);
      if (definitionsResult.error) console.warn('[herois-experience] definições:', definitionsResult.error.message);

      state.heroes = (heroesResult.data || []).map(normalizeHeroMedia);
      state.classes = classesResult.data || [];
      state.skillsByHero = groupBy(state.skillsAvailable ? (skillsResult.data || []) : [], 'hero_id');
      state.statsByHero = groupBy(state.statsAvailable ? (statsResult.data || []) : [], 'hero_id');
      state.definitions = new Map((state.statsAvailable ? (definitionsResult.data || []) : []).map(item => [item.key, item]));

      $('hero-total').textContent = String(state.heroes.length);
      $('class-total').textContent = String(state.classes.length);
      $('skill-total').textContent = state.skillsAvailable
        ? String([...state.skillsByHero.values()].reduce((sum, rows) => sum + rows.length, 0))
        : '—';

      renderClassShowcase();
      enrichCards();

      const requested = new URLSearchParams(location.search).get('heroi');
      const initial = heroBySlug(requested) || firstVisibleHero() || state.heroes[0] || null;
      if (requested && initial) setFeatured(initial);
      else if (isRosterOverview()) renderRosterOverview();
      else if (initial) setFeatured(initial);

      updateClassCycleControl();
      if (cycleControl && explorer && 'IntersectionObserver' in window) {
        const cycleObserver = new IntersectionObserver(([entry]) => {
          cycleControl.classList.toggle('is-visible', Boolean(entry?.isIntersecting));
        }, { threshold: 0.12 });
        cycleObserver.observe(explorer);
      } else {
        cycleControl?.classList.add('is-visible');
      }
    } catch (error) {
      console.error('[herois-experience] Não foi possível montar a experiência:', error);
      const title = $('featured-name');
      if (title) title.textContent = 'Heróis indisponíveis';
    }
  }

  await loadExperience();
}
