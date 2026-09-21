import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import { resolveMediaUrl } from './media-storage.js?v=20260823-security-supabase-pin-1';
import { syncPublicNavigation } from './public-navigation.js?v=20260822-drawer-unified-1&sb=20260823-security-supabase-pin-1&ops=20260905&sc=20260906-1&eq=20260907-effects-1';

const moduleKey = document.body?.dataset.publicModule || '';
const $ = id => document.getElementById(id);

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' });
}

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function slugSafe(value = '') {
  return normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function setCount(value, label = 'registros') {
  const target = $('module-count');
  if (!target) return;
  const number = Number(value || 0);
  target.innerHTML = `<strong>${number.toLocaleString('pt-BR')}</strong><small>${escapeHtml(label)}</small>`;
}

function setState(kind, title, detail = '') {
  const grid = $('module-grid');
  if (!grid) return;
  const cls = kind === 'error' ? 'module-error' : kind === 'loading' ? 'module-loading' : 'module-empty';
  grid.innerHTML = `<div class="${cls}"><strong>${escapeHtml(title)}</strong>${escapeHtml(detail)}</div>`;
}

function articleText(value = '') {
  const text = String(value || '').replace(/\r/g, '').trim();
  if (!text) return '<p>Este conteúdo ainda não possui texto publicado.</p>';
  const lines = text.split('\n');
  const html = [];
  let list = [];
  const flushList = () => {
    if (!list.length) return;
    html.push(`<ul>${list.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`);
    list = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushList(); continue; }
    if (/^###\s+/.test(line)) { flushList(); html.push(`<h3>${escapeHtml(line.replace(/^###\s+/, ''))}</h3>`); continue; }
    if (/^##\s+/.test(line)) { flushList(); html.push(`<h2>${escapeHtml(line.replace(/^##\s+/, ''))}</h2>`); continue; }
    if (/^[-*]\s+/.test(line)) { list.push(line.replace(/^[-*]\s+/, '')); continue; }
    flushList();
    html.push(`<p>${escapeHtml(line)}</p>`);
  }
  flushList();
  return html.join('');
}

function bindShell() {
  syncPublicNavigation(moduleKey);
  const sidebar = $('site-sidebar');
  const backdrop = $('sidebar-backdrop');
  const open = $('sidebar-open');
  const close = $('sidebar-close');
  const setOpen = state => {
    sidebar?.classList.toggle('open', state);
    backdrop?.classList.toggle('open', state);
    open?.setAttribute('aria-expanded', String(state));
    if (sidebar) sidebar.setAttribute('aria-hidden', String(!state));
    document.body.style.overflow = state ? 'hidden' : '';
  };
  open?.addEventListener('click', () => setOpen(true));
  close?.addEventListener('click', () => setOpen(false));
  backdrop?.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') setOpen(false); });
  sidebar?.addEventListener('click', event => { if (event.target.closest('a')) setOpen(false); });
}

function setupSearch(filter) {
  const input = $('module-search');
  if (!input) return;
  input.addEventListener('input', () => filter(input.value));
}

async function fetchHeroes() {
  const { data, error } = await supabase
    .from('heroes')
    .select('id,name,slug,class_id,enabled,display_order,card_image_path,image_path,card_image_url,image_url')
    .eq('enabled', true)
    .order('display_order', { ascending:true })
    .order('name', { ascending:true });
  if (error) throw error;
  return data || [];
}

function heroMedia(hero) {
  return resolveMediaUrl(hero?.card_image_path || hero?.image_path || hero?.card_image_url || hero?.image_url || '');
}

async function loadClasses() {
  setState('loading', 'Carregando classes', 'Lendo classes e heróis ativos do banco.');
  const [{ data: classes, error: classError }, heroes] = await Promise.all([
    supabase.from('hero_classes').select('id,name,slug,color,icon').order('name', { ascending:true }),
    fetchHeroes()
  ]);
  if (classError) throw classError;

  const grouped = new Map((classes || []).map(item => [item.id, { ...item, heroes:[] }]));
  heroes.forEach(hero => grouped.get(hero.class_id)?.heroes.push(hero));
  const rows = [...grouped.values()];
  setCount(rows.length, 'classes cadastradas');

  const render = search => {
    const term = normalize(search);
    const visible = rows.filter(row => !term || normalize(`${row.name} ${row.slug} ${row.heroes.map(h => h.name).join(' ')}`).includes(term));
    const grid = $('module-grid');
    if (!visible.length) { setState('empty', 'Nenhuma classe encontrada', 'A busca não corresponde a uma classe ou herói ativo.'); return; }
    grid.innerHTML = visible.map(row => `
      <article class="module-card class-card" style="--class-color:${escapeHtml(row.color || '#9b62ff')}">
        <div class="class-icon">${escapeHtml(row.icon || '◆')}</div>
        <div>
          <span class="module-card-kicker">CLASSE · ${row.heroes.length} ${row.heroes.length === 1 ? 'HERÓI' : 'HERÓIS'}</span>
          <h3>${escapeHtml(row.name)}</h3>
          <p>Heróis ativos vinculados a esta função no cadastro oficial do site.</p>
          <div class="class-heroes">${row.heroes.length ? row.heroes.map(hero => `<span class="class-hero-chip">${escapeHtml(hero.name)}</span>`).join('') : '<span class="class-hero-chip">Sem heróis ativos</span>'}</div>
          <div class="module-card-footer"><span>${escapeHtml(row.slug || slugSafe(row.name))}</span><a class="module-card-action" href="./herois.html">Ver heróis →</a></div>
        </div>
      </article>`).join('');
  };
  render('');
  setupSearch(render);
}

async function fetchMediaMap(ids) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (!list.length) return new Map();
  const { data, error } = await supabase.from('media').select('id,public_url,alt_text,enabled').in('id', list);
  if (error) return new Map();
  return new Map((data || []).filter(item => item.enabled !== false).map(item => [item.id, item]));
}

async function fetchHeroMap(ids = null) {
  let query = supabase.from('heroes').select('id,name,slug,enabled,card_image_path,image_path,card_image_url,image_url,class_id');
  if (Array.isArray(ids) && ids.length) query = query.in('id', [...new Set(ids.filter(Boolean))]);
  const { data, error } = await query;
  if (error) throw error;
  return new Map((data || []).map(item => [item.id, item]));
}

async function loadEditorial(type) {
  const isGuide = type === 'guides';
  const table = isGuide ? 'guides' : 'news';
  setState('loading', isGuide ? 'Carregando guias' : 'Carregando notícias', 'Buscando somente conteúdo publicado.');
  const { data, error } = await supabase.from(table).select('*').eq('published', true).order('created_at', { ascending:false });
  if (error) throw error;
  const rows = data || [];
  const mediaMap = await fetchMediaMap(rows.map(row => row.cover_media_id));
  const heroMap = isGuide ? await fetchHeroMap(rows.map(row => row.hero_id)) : new Map();
  setCount(rows.length, isGuide ? 'guias publicados' : 'notícias publicadas');

  const requested = new URLSearchParams(location.search).get('slug');
  if (requested) {
    const row = rows.find(item => item.slug === requested);
    const detail = $('module-detail');
    const listing = $('module-listing');
    if (!row) {
      if (detail) {
        detail.hidden = false;
        detail.innerHTML = `<div class="module-empty"><strong>Conteúdo não encontrado</strong>O item pode não existir ou ainda não estar publicado.</div><a class="article-back" href="./${isGuide ? 'guias' : 'noticias'}.html">← Voltar</a>`;
      }
      if (listing) listing.hidden = true;
      return;
    }
    const cover = mediaMap.get(row.cover_media_id);
    const hero = heroMap.get(row.hero_id);
    if (listing) listing.hidden = true;
    if (detail) {
      detail.hidden = false;
      detail.innerHTML = `
        <article class="article-detail">
          ${cover?.public_url ? `<div class="article-cover"><img src="${escapeHtml(resolveMediaUrl(cover.public_url))}" alt="${escapeHtml(cover.alt_text || '')}"></div>` : ''}
          <span class="module-kicker">${isGuide ? 'GUIA' : 'NOTÍCIA'} PUBLICADO</span>
          <h1>${escapeHtml(row.title)}</h1>
          <div class="article-detail-meta"><span class="module-badge">${escapeHtml(formatDate(row.created_at))}</span>${hero ? `<span class="module-badge cyan">${escapeHtml(hero.name)}</span>` : ''}${isGuide ? `<span class="module-badge green">${Number(row.views || 0).toLocaleString('pt-BR')} visualizações</span>` : ''}</div>
          ${row.summary ? `<p style="color:#9eabc0;font-size:14px;line-height:1.7">${escapeHtml(row.summary)}</p>` : ''}
          <div class="article-content">${articleText(row.content)}</div>
          <a class="article-back" href="./${isGuide ? 'guias' : 'noticias'}.html">← Voltar para ${isGuide ? 'guias' : 'notícias'}</a>
        </article>`;
    }
    return;
  }

  const render = search => {
    const term = normalize(search);
    const visible = rows.filter(row => !term || normalize(`${row.title} ${row.summary || ''} ${heroMap.get(row.hero_id)?.name || ''}`).includes(term));
    const grid = $('module-grid');
    if (!visible.length) {
      setState('empty', isGuide ? 'Nenhum guia publicado' : 'Nenhuma notícia publicada', isGuide ? 'O módulo está pronto; novos guias aparecerão aqui assim que forem publicados pelo Admin.' : 'O módulo está pronto; novas notícias aparecerão aqui assim que forem publicadas pelo Admin.');
      return;
    }
    grid.innerHTML = visible.map(row => {
      const cover = mediaMap.get(row.cover_media_id);
      const hero = heroMap.get(row.hero_id);
      return `<article class="module-card article-card">
        <div class="article-cover">${cover?.public_url ? `<img src="${escapeHtml(resolveMediaUrl(cover.public_url))}" alt="${escapeHtml(cover.alt_text || '')}" loading="lazy">` : ''}</div>
        <div class="article-body">
          <div style="display:flex;gap:6px;flex-wrap:wrap"><span class="module-badge">${isGuide ? 'Guia' : 'Notícia'}</span>${hero ? `<span class="module-badge cyan">${escapeHtml(hero.name)}</span>` : ''}</div>
          <h3>${escapeHtml(row.title)}</h3>
          <p>${escapeHtml(row.summary || 'Conteúdo publicado sem resumo.')}</p>
          <div class="module-card-footer"><span>${escapeHtml(formatDate(row.created_at))}</span><a class="module-card-action" href="./${isGuide ? 'guias' : 'noticias'}.html?slug=${encodeURIComponent(row.slug)}">Ler →</a></div>
        </div>
      </article>`;
    }).join('');
  };
  render('');
  setupSearch(render);
}

async function loadTierList() {
  setState('loading', 'Carregando Tier List', 'Buscando a classificação publicada mais recente.');
  const { data: lists, error } = await supabase.from('tier_lists').select('*').eq('published', true).order('updated_at', { ascending:false });
  if (error) throw error;
  const available = lists || [];
  setCount(available.length, 'listas publicadas');
  if (!available.length) { setState('empty', 'Nenhuma Tier List publicada', 'O módulo está conectado ao banco e aguardando a primeira lista ser publicada pelo Admin.'); return; }

  const requested = new URLSearchParams(location.search).get('slug');
  const selected = available.find(item => item.slug === requested) || available[0];
  const { data: entries, error: entriesError } = await supabase.from('tier_list_entries').select('*').eq('tier_list_id', selected.id).order('display_order', { ascending:true });
  if (entriesError) throw entriesError;
  const heroMap = await fetchHeroMap((entries || []).map(item => item.hero_id));
  $('module-title-secondary') && ($('module-title-secondary').textContent = selected.title);
  $('module-subtitle-secondary') && ($('module-subtitle-secondary').textContent = selected.description || 'Classificação publicada no painel administrativo.');

  const pills = $('module-filter-pills');
  if (pills && available.length > 1) {
    pills.innerHTML = available.map(item => `<a class="module-pill ${item.id === selected.id ? 'active' : ''}" href="./tier-list.html?slug=${encodeURIComponent(item.slug)}">${escapeHtml(item.title)}</a>`).join('');
  }

  const groups = new Map();
  for (const entry of entries || []) {
    if (!groups.has(entry.tier)) groups.set(entry.tier, []);
    groups.get(entry.tier).push(entry);
  }
  const grid = $('module-grid');
  if (!groups.size) { setState('empty', 'Lista publicada sem entradas', 'Adicione heróis à Tier List pelo Admin para preencher esta classificação.'); return; }
  grid.className = 'tier-board';
  grid.innerHTML = [...groups.entries()].map(([tier, group]) => `
    <section class="tier-row">
      <div class="tier-label">${escapeHtml(tier)}</div>
      <div class="tier-heroes">${group.map(entry => {
        const hero = heroMap.get(entry.hero_id);
        const media = heroMedia(hero);
        return `<div class="tier-hero" title="${escapeHtml(entry.notes || '')}"><div class="tier-avatar">${media ? `<img src="${escapeHtml(media)}" alt="${escapeHtml(hero?.name || '')}" loading="lazy">` : ''}</div><b>${escapeHtml(hero?.name || 'Herói')}</b></div>`;
      }).join('')}</div>
    </section>`).join('');
}

async function fetchPublicCompositions() {
  const { data, error } = await supabase.from('team_compositions').select('*').eq('is_public', true).order('updated_at', { ascending:false });
  if (error) throw error;
  return data || [];
}

async function renderCompositions(rows, heroes) {
  const grid = $('module-grid');
  if (!rows.length) { setState('empty', 'Nenhuma composição pública', 'O módulo já está pronto para receber composições 3×3 criadas pela comunidade.'); return; }
  const ids = rows.map(row => row.id);
  const { data: members, error } = await supabase.from('team_composition_members').select('*').in('composition_id', ids).order('position', { ascending:true });
  if (error) throw error;
  const byComposition = new Map();
  for (const member of members || []) {
    if (!byComposition.has(member.composition_id)) byComposition.set(member.composition_id, []);
    byComposition.get(member.composition_id).push(member);
  }
  grid.innerHTML = rows.map(row => {
    const team = byComposition.get(row.id) || [];
    return `<article class="module-card composition-card">
      <span class="module-badge green">Composição pública</span>
      <h3>${escapeHtml(row.title)}</h3>
      <p>${escapeHtml(row.description || 'Composição criada pela comunidade.')}</p>
      <div class="composition-members">${[1,2,3].map(position => {
        const member = team.find(item => Number(item.position) === position);
        const hero = heroes.get(member?.hero_id);
        const media = heroMedia(hero);
        return `<div class="composition-member">${media ? `<img src="${escapeHtml(media)}" alt="${escapeHtml(hero?.name || '')}" loading="lazy">` : '<div style="height:78px;display:grid;place-items:center;color:#58667c">◇</div>'}<b>${escapeHtml(hero?.name || 'Slot vazio')}</b></div>`;
      }).join('')}</div>
      <div class="module-card-footer"><span>${escapeHtml(formatDate(row.updated_at || row.created_at))}</span><span>${team.length}/3 heróis</span></div>
    </article>`;
  }).join('');
}

async function loadSynergies(heroMap) {
  const target = $('synergy-grid');
  if (!target) return;
  const { data, error } = await supabase.from('team_synergies').select('*').order('synergy_score', { ascending:false }).limit(6);
  if (error || !(data || []).length) {
    target.innerHTML = '<div class="module-empty"><strong>Sem dados oficiais de sinergia</strong>Quando resultados confiáveis forem cadastrados, eles aparecerão aqui sem estimativas.</div>';
    return;
  }
  target.innerHTML = (data || []).map(row => {
    const names = [row.hero_1_id,row.hero_2_id,row.hero_3_id].map(id => heroMap.get(id)?.name || 'Herói').join(' + ');
    return `<article class="module-card"><span class="module-badge cyan">Sinergia medida</span><h3>${escapeHtml(names)}</h3><p>${escapeHtml(row.notes || 'Resultado baseado nos dados registrados para esta combinação.')}</p><div class="module-card-footer"><span>${Number(row.matches || 0).toLocaleString('pt-BR')} partidas</span><span class="module-card-action">Score ${Number(row.synergy_score || 0).toLocaleString('pt-BR',{maximumFractionDigits:2})}</span></div></article>`;
  }).join('');
}

function mountCompositionForm(heroes) {
  const form = $('composition-form');
  if (!form) return;
  const selects = [...form.querySelectorAll('.composition-hero-select')];
  const options = [...heroes.values()].sort((a,b) => a.name.localeCompare(b.name,'pt-BR')).map(hero => `<option value="${escapeHtml(hero.id)}">${escapeHtml(hero.name)}</option>`).join('');
  const availableIds = new Set(heroes.keys());
  selects.forEach(select => {
    const currentValue = select.value;
    select.innerHTML = `<option value="">Escolha um herói</option>${options}`;
    if (availableIds.has(currentValue)) select.value = currentValue;
  });
  form.dispatchEvent(new CustomEvent('echo:composition-options-ready', { bubbles: true }));
  const message = $('composition-form-message');
  const button = form.querySelector('button[type="submit"]');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    message.className = 'module-form-message';
    message.textContent = '';
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      message.className = 'module-form-message error';
      message.textContent = 'Entre na sua conta para salvar uma composição.';
      return;
    }
    const title = String(form.elements.title?.value || '').trim();
    const description = String(form.elements.description?.value || '').trim();
    const heroIds = selects.map(select => select.value).filter(Boolean);
    if (!title) { message.className = 'module-form-message error'; message.textContent = 'Dê um nome para a composição.'; return; }
    if (heroIds.length !== 3 || new Set(heroIds).size !== 3) { message.className = 'module-form-message error'; message.textContent = 'Escolha três heróis diferentes.'; return; }
    button.disabled = true;
    try {
      const { data: composition, error } = await supabase.from('team_compositions').insert({
        user_id: session.user.id,
        title,
        description: description || null,
        is_public: Boolean(form.elements.is_public?.checked)
      }).select('id').single();
      if (error) throw error;
      const members = heroIds.map((hero_id,index) => ({ composition_id:composition.id, position:index+1, hero_id }));
      const { error: memberError } = await supabase.from('team_composition_members').insert(members);
      if (memberError) {
        await supabase.from('team_compositions').delete().eq('id', composition.id);
        throw memberError;
      }
      form.reset();
      selects.forEach(select => { select.innerHTML = `<option value="">Escolha um herói</option>${options}`; });
      form.dispatchEvent(new CustomEvent('echo:composition-options-ready', { bubbles: true }));
      message.className = 'module-form-message ok';
      message.textContent = 'Composição salva com sucesso.';
      const rows = await fetchPublicCompositions();
      setCount(rows.length, 'composições públicas');
      await renderCompositions(rows, heroes);
    } catch (error) {
      console.error('[compositions] Falha ao salvar:', error);
      message.className = 'module-form-message error';
      message.textContent = `Não foi possível salvar: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  });
}

async function loadCompositions() {
  setState('loading', 'Carregando composições', 'Buscando equipes públicas e dados de sinergia.');
  const [rows, heroRows] = await Promise.all([fetchPublicCompositions(), fetchHeroes()]);
  const heroMap = new Map(heroRows.map(hero => [hero.id, hero]));
  setCount(rows.length, 'composições públicas');
  await renderCompositions(rows, heroMap);
  await loadSynergies(heroMap);
  mountCompositionForm(heroMap);
  setupSearch(search => {
    const term = normalize(search);
    renderCompositions(rows.filter(row => !term || normalize(`${row.title} ${row.description || ''}`).includes(term)), heroMap).catch(console.error);
  });
}

async function start() {
  bindShell();
  try {
    if (moduleKey === 'classes') await loadClasses();
    else if (moduleKey === 'guias') await loadEditorial('guides');
    else if (moduleKey === 'noticias') await loadEditorial('news');
    else if (moduleKey === 'tier-list') await loadTierList();
    else if (moduleKey === 'composicoes') await loadCompositions();
  } catch (error) {
    console.error(`[${moduleKey}] Falha no módulo:`, error);
    setState('error', 'Não foi possível carregar este módulo', error.message || 'O banco respondeu com erro.');
  }
}

start();
