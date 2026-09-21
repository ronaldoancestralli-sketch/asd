import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';
import { initAdminShell } from './admin-shell.js?v=20260906-home-featured-phase-e-1&sb=20260823-security-supabase-pin-1&sc=20260906-1';

const shell = await initAdminShell({
  activeId: 'echo-pulse',
  pageTitle: 'Echo Pulse',
  pageSubtitle: 'Acesso interno · Inbox editorial · coleta automática'
});
if (!shell) throw new Error('Admin Shell indisponível.');

const state = { items: [], sources: [], runs: [], links: [], heroes: new Map(), status: 'inbox', search: '' };
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const fmt = value => { const d = new Date(value); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); };
const statusLabel = value => ({inbox:'Inbox',review:'Em revisão',approved:'Aprovado',published:'Preparado',ignored:'Ignorado'})[value] || value;
const categoryLabel = value => ({update:'Atualização',patch:'Patch',event:'Evento',community:'Comunidade',creator:'Criadores',gaming:'Jogos',other:'Outro'})[value] || value || 'Atualização';
const sourceTypeLabel = value => ({official:'Oficial',community:'Comunidade',creator:'Criador',gaming:'Jogos',news:'Notícias'})[value] || value || 'Fonte';
const adapterLabel = value => ({manual:'Manual',zeptolab_news:'Notícias ZeptoLab'})[value] || value || 'Manual';
const triggerLabel = value => ({cron:'Agendado',manual:'Manual'})[value] || value || 'Execução';
const runStatusLabel = value => ({success:'Sucesso',partial:'Parcial',error:'Erro',running:'Em execução'})[value] || value || 'Desconhecido';

function metadataOf(item) {
  return item?.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata) ? item.metadata : {};
}
function translationChip(item) {
  const metadata = metadataOf(item);
  if (metadata.editorial_language === 'pt-BR') return '<span class="pulse-admin-chip official">PT-BR</span>';
  if (metadata.source_language && metadata.source_language !== 'pt-BR') return '<span class="pulse-admin-chip">Tradução pendente</span>';
  return '';
}
function originalSourceBlock(item) {
  const metadata = metadataOf(item);
  const sourceTitle = metadata.source_title || '';
  const sourceSummary = metadata.source_summary || item.source_excerpt || '';
  if (!sourceTitle && !sourceSummary) return '';
  const language = metadata.source_language ? String(metadata.source_language).toUpperCase() : 'ORIGINAL';
  return `<div class="pulse-admin-safety"><strong>Original da fonte · ${esc(language)}</strong>${sourceTitle ? `<p><b>${esc(sourceTitle)}</b></p>` : ''}${sourceSummary ? `<p>${esc(sourceSummary)}</p>` : ''}</div>`;
}
function message(text='', type='') {
  const node = $('pulse-admin-message');
  if (!node) return;
  node.textContent = text;
  node.className = `pulse-admin-message ${text ? 'is-visible' : ''} ${type}`.trim();
}
function linkedHeroes(itemId) {
  return state.links.filter(row => row.pulse_item_id === itemId).map(row => state.heroes.get(row.hero_id)?.name).filter(Boolean);
}
function renderMetrics() {
  const count = status => state.items.filter(item => item.status === status).length;
  $('pulse-metric-inbox').textContent = count('inbox');
  $('pulse-metric-review').textContent = count('review');
  $('pulse-metric-approved').textContent = count('approved');
  $('pulse-metric-published').textContent = count('published');
  $('pulse-metric-sources').textContent = state.sources.filter(source => source.enabled === true && source.auto_collect === true).length;
}
function renderSources() {
  const root = $('pulse-source-list');
  if (!root) return;
  if (!state.sources.length) { root.innerHTML = '<div class="pulse-admin-empty">Nenhuma fonte registrada.</div>'; return; }
  root.innerHTML = state.sources.map(source => `<article class="pulse-source"><strong>${esc(source.name)}</strong><span>${esc(sourceTypeLabel(source.source_type))} · ${esc(adapterLabel(source.adapter))} · ${source.auto_collect ? 'coleta automática' : 'coleta manual'}</span><span class="${source.last_error ? 'error' : 'ok'}">${source.last_error ? esc(source.last_error) : source.last_success_at ? `Último sucesso: ${esc(fmt(source.last_success_at))}` : 'Ainda sem execução registrada'}</span><span>Publicação automática: <b>${source.auto_publish ? 'ATIVA' : 'desativada'}</b></span></article>`).join('');
}
function renderRuns() {
  const root = $('pulse-run-list');
  if (!root) return;
  if (!state.runs.length) { root.innerHTML = '<div class="pulse-admin-empty">Nenhuma execução registrada.</div>'; return; }
  root.innerHTML = state.runs.slice(0,8).map(run => `<article class="pulse-run"><strong>${esc(triggerLabel(run.trigger_type))} · ${esc(runStatusLabel(run.status))}</strong><span>${esc(fmt(run.started_at))} · ${Number(run.items_seen||0)} vistos · ${Number(run.items_created||0)} novos · ${Number(run.items_updated||0)} atualizados</span><span class="${Number(run.error_count||0) ? 'error' : 'ok'}">${Number(run.error_count||0)} erro(s)</span></article>`).join('');
}
function actionButtons(item) {
  const out = [`<button type="button" data-edit="${item.id}">Curadoria</button>`];
  if (item.status === 'inbox') out.push(`<button class="primary" type="button" data-status="review" data-id="${item.id}">Revisar</button>`);
  if (item.status === 'review') out.push(`<button class="primary" type="button" data-status="approved" data-id="${item.id}">Aprovar</button>`);
  if (item.status === 'approved') out.push(`<button class="publish" type="button" data-status="published" data-id="${item.id}">Marcar preparado</button>`);
  if (item.status === 'published') out.push(`<button type="button" data-status="approved" data-id="${item.id}">Voltar para aprovado</button>`);
  if (item.status !== 'ignored') out.push(`<button class="danger" type="button" data-status="ignored" data-id="${item.id}">Ignorar</button>`);
  if (item.status === 'ignored') out.push(`<button type="button" data-status="inbox" data-id="${item.id}">Voltar à Inbox</button>`);
  return out.join('');
}
function card(item) {
  const heroes = linkedHeroes(item.id);
  return `<article class="pulse-admin-card" data-item-card="${item.id}"><div class="pulse-admin-card-head"><div class="pulse-admin-thumb">${item.image_url ? `<img src="${esc(item.image_url)}" alt="">` : ''}</div><div class="pulse-admin-card-copy"><div class="pulse-admin-card-meta"><span class="pulse-admin-chip status">${esc(statusLabel(item.status))}</span><span class="pulse-admin-chip">${esc(categoryLabel(item.category))}</span>${item.trust_level === 'official' ? '<span class="pulse-admin-chip official">Oficial</span>' : ''}${translationChip(item)}<span class="pulse-admin-chip">Relevância ${Number(item.relevance_score||0)}</span></div><h3>${esc(item.title)}</h3><p>${esc(item.summary || item.source_excerpt || 'Sem resumo coletado.')}</p><div class="pulse-admin-card-source"><span>${esc(item.source_name || 'Fonte registrada')} · ${esc(fmt(item.source_published_at || item.collected_at))}${heroes.length ? ` · Heróis: ${esc(heroes.join(', '))}` : ''}</span><a href="${esc(item.canonical_url)}" target="_blank" rel="noopener noreferrer">Abrir fonte ↗</a></div></div></div><div class="pulse-admin-card-actions">${actionButtons(item)}</div><div class="pulse-admin-editor" data-editor="${item.id}">${originalSourceBlock(item)}<div class="pulse-admin-editor-grid"><label>Título em PT-BR<input data-field="title" maxlength="220" value="${esc(item.title)}"></label><label>Categoria<select data-field="category"><option value="update" ${item.category==='update'?'selected':''}>Atualização</option><option value="patch" ${item.category==='patch'?'selected':''}>Patch</option><option value="event" ${item.category==='event'?'selected':''}>Evento</option><option value="community" ${item.category==='community'?'selected':''}>Comunidade</option><option value="creator" ${item.category==='creator'?'selected':''}>Criadores</option><option value="gaming" ${item.category==='gaming'?'selected':''}>Jogos</option><option value="other" ${item.category==='other'?'selected':''}>Outro</option></select></label></div><label>Resumo editorial em PT-BR<textarea data-field="summary" maxlength="1000">${esc(item.summary || item.source_excerpt || '')}</textarea></label><div class="pulse-admin-editor-flags"><label><input type="checkbox" data-field="is_featured" ${item.is_featured ? 'checked' : ''}> Destaque futuro</label><label><input type="checkbox" data-field="discussion_enabled" ${item.discussion_enabled !== false ? 'checked' : ''}> Permitir discussão quando lançado</label></div><div><button class="admin-button primary" type="button" data-save="${item.id}">Salvar curadoria PT-BR</button></div></div></article>`;
}
function renderItems() {
  const term = norm(state.search);
  const visible = state.items.filter(item => {
    const metadata = metadataOf(item);
    return (state.status === 'all' || item.status === state.status) && (!term || norm(`${item.title} ${item.summary||''} ${item.source_name||''} ${metadata.source_title||''} ${metadata.source_summary||''}`).includes(term));
  });
  const root = $('pulse-inbox'); const empty = $('pulse-inbox-state');
  if (!root || !empty) return;
  if (!visible.length) { root.innerHTML = ''; empty.hidden = false; empty.textContent = state.items.length ? 'Nenhum item corresponde a este filtro.' : 'Nenhum item foi coletado ainda.'; return; }
  empty.hidden = true; root.innerHTML = visible.map(card).join(''); bindItemActions();
}
async function setStatus(id, status) {
  message(`Atualizando para “${statusLabel(status)}”…`);
  const { error } = await supabase.rpc('admin_set_pulse_item_status',{ p_item_id:id, p_status:status });
  if (error) { message(error.message || 'Falha ao alterar status.','error'); return; }
  message(status === 'published' ? 'Item marcado como preparado internamente. O acesso público continua bloqueado por RLS.' : 'Status confirmado no banco.','ok');
  await load();
}
async function saveEditorial(id) {
  const node = document.querySelector(`[data-item-card="${CSS.escape(id)}"]`); if (!node) return;
  const item = state.items.find(row => row.id === id); if (!item) return;
  const title = node.querySelector('[data-field="title"]')?.value.trim();
  const summary = node.querySelector('[data-field="summary"]')?.value.trim();
  const category = node.querySelector('[data-field="category"]')?.value;
  const isFeatured = node.querySelector('[data-field="is_featured"]')?.checked === true;
  const discussionEnabled = node.querySelector('[data-field="discussion_enabled"]')?.checked === true;
  if (!title || !summary) { message('Título e resumo em PT-BR são obrigatórios antes de salvar a curadoria.','warn'); return; }
  if (item.status === 'inbox') {
    const { error: statusError } = await supabase.rpc('admin_set_pulse_item_status',{ p_item_id:id, p_status:'review' });
    if (statusError) { message(statusError.message,'error'); return; }
  }
  const metadata = {
    ...metadataOf(item),
    editorial_language:'pt-BR',
    translation_status:'translated-manual',
    translation_locked:true,
    translated_at:new Date().toISOString()
  };
  const { error } = await supabase.from('pulse_items').update({ title, summary, category, is_featured:isFeatured, discussion_enabled:discussionEnabled, metadata }).eq('id',id);
  if (error) { message(error.message || 'Falha ao salvar curadoria.','error'); return; }
  message('Curadoria PT-BR salva. O original da fonte foi preservado e o Cron não sobrescreverá esta tradução.','ok'); await load();
}
function bindItemActions() {
  document.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click',() => document.querySelector(`[data-editor="${CSS.escape(button.dataset.edit)}"]`)?.classList.toggle('is-open')));
  document.querySelectorAll('[data-status][data-id]').forEach(button => button.addEventListener('click',() => setStatus(button.dataset.id,button.dataset.status)));
  document.querySelectorAll('[data-save]').forEach(button => button.addEventListener('click',() => saveEditorial(button.dataset.save)));
}
async function load() {
  try {
    const [{data:items,error:itemError},{data:sources,error:sourceError},{data:runs,error:runError},{data:links,error:linkError}] = await Promise.all([
      supabase.from('pulse_items').select('*').order('collected_at',{ascending:false}),
      supabase.from('pulse_sources').select('*').order('name'),
      supabase.from('pulse_ingestion_runs').select('*').order('started_at',{ascending:false}).limit(12),
      supabase.from('pulse_item_heroes').select('pulse_item_id,hero_id,relation_type')
    ]);
    if (itemError) throw itemError; if (sourceError) throw sourceError; if (runError) throw runError; if (linkError) console.warn('[pulse-admin] vínculos indisponíveis:',linkError.message);
    state.items = items || []; state.sources = sources || []; state.runs = runs || []; state.links = links || [];
    const heroIds = [...new Set(state.links.map(row => row.hero_id).filter(Boolean))];
    if (heroIds.length) { const {data:heroes} = await supabase.from('heroes').select('id,name').in('id',heroIds); state.heroes = new Map((heroes||[]).map(row => [row.id,row])); } else state.heroes = new Map();
    renderMetrics(); renderSources(); renderRuns(); renderItems();
  } catch (error) {
    console.error('[pulse-admin] falha:',error); message(error.message || 'Não foi possível carregar o Echo Pulse. Confirme que a sessão atual é Admin.','error');
  }
}
async function refreshNow() {
  const button = $('pulse-refresh-now'); button.disabled = true; message('Executando coleta autenticada…');
  const {data,error} = await supabase.functions.invoke('echo-pulse-ingest',{body:{trigger:'admin'}});
  button.disabled = false;
  if (error) { message(error.message || 'A Edge Function respondeu com erro.','error'); return; }
  const result = data || {};
  message(`Coleta concluída: ${Number(result.itemsSeen||0)} visto(s), ${Number(result.itemsCreated||0)} novo(s), ${Number(result.itemsUpdated||0)} atualizado(s), ${(result.errors||[]).length} erro(s).`, result.status === 'success' ? 'ok' : 'warn');
  await load();
}

$('pulse-refresh-now')?.addEventListener('click',refreshNow);
$('pulse-admin-search')?.addEventListener('input',event => { state.search = event.target.value || ''; renderItems(); });
document.querySelectorAll('#pulse-status-tabs [data-status]').forEach(button => button.addEventListener('click',() => { document.querySelectorAll('#pulse-status-tabs [data-status]').forEach(item => item.classList.remove('is-active')); button.classList.add('is-active'); state.status = button.dataset.status || 'inbox'; renderItems(); }));
await load();
