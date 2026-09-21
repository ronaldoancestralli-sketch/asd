import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';

const $ = id => document.getElementById(id);
const state = { heroes: [], skills: [], sources: [], links: [], history: [], levelCount: 0 };
const list = $('audit-list');
const message = $('audit-message');
const search = $('audit-search');
const heroFilter = $('audit-hero');
const sourceFilter = $('audit-source');
const recheckFilter = $('audit-recheck');
const sourceForm = $('source-form');
const linkForm = $('link-form');
const linkPanel = $('link-panel');

function esc(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function setMessage(text = '', type = '') {
  message.textContent = text;
  message.className = `skill-audit-message${type ? ` ${type}` : ''}`;
}

function heroById(id) { return state.heroes.find(item => item.id === id) || null; }
function sourceById(id) { return state.sources.find(item => item.id === id) || null; }
function skillById(id) { return state.skills.find(item => item.id === id) || null; }
function linksFor(skillId) { return state.links.filter(item => item.skill_id === skillId); }
function historyFor(skillId) { return state.history.filter(item => item.skill_id === skillId); }

function sourceTypeLabel(value) {
  return ({ official: 'Oficial', wiki: 'Wiki', forum: 'Fórum', community: 'Comunidade', other: 'Outro' })[value] || value || '—';
}

function coverageLabel(value) {
  return ({ baseline_values: 'Valores-base', structure: 'Estrutura', patch_override: 'Patch oficial', corroboration: 'Corroboração', translation: 'Tradução' })[value] || value || '—';
}

function verificationLabel(value) {
  return ({ verified: 'Verificado', corroborated: 'Corroborado', unverified: 'Não verificado' })[value] || value || 'Não verificado';
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function distinctSkillIds(rows) { return new Set(rows.map(item => item.skill_id).filter(Boolean)); }

function renderSummary() {
  const target = $('audit-summary');
  const publishedHeroes = state.heroes.filter(item => item.enabled !== false).length;
  const linkedSkills = distinctSkillIds(state.links).size;
  const officialSkills = distinctSkillIds(state.links.filter(item => sourceById(item.source_id)?.source_type === 'official' && item.coverage === 'patch_override')).size;
  const recheck = state.skills.filter(item => item.needs_recheck).length;
  target.innerHTML = `
    <article><small>Heróis publicados</small><strong>${publishedHeroes}</strong><span>${state.heroes.length} registros no total</span></article>
    <article><small>Habilidades</small><strong>${state.skills.length}</strong><span>${state.levelCount} níveis detalhados persistidos</span></article>
    <article><small>Com fonte</small><strong>${linkedSkills}</strong><span>${state.skills.length - linkedSkills} sem proveniência</span></article>
    <article><small>Patch oficial</small><strong>${officialSkills}</strong><span>habilidades com ajuste oficial rastreado</span></article>
    <article><small>Rechecagem</small><strong>${recheck}</strong><span>não significa erro; indica fonte-base ainda não oficial</span></article>
    <article><small>Histórico</small><strong>${state.history.length}</strong><span>eventos vinculados a habilidades</span></article>`;
}

function renderHeroOptions() {
  const selected = heroFilter.value;
  heroFilter.innerHTML = '<option value="">Todos</option>' + state.heroes
    .slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'))
    .map(hero => `<option value="${esc(hero.id)}">${esc(hero.name)}${hero.enabled === false ? ' (inativo)' : ''}</option>`).join('');
  heroFilter.value = state.heroes.some(item => item.id === selected) ? selected : '';
}

function renderSourceOptions() {
  const select = linkForm.elements.source_id;
  const current = select.value;
  select.innerHTML = '<option value="">Escolha uma fonte</option>' + state.sources
    .slice().sort((a, b) => (a.source_type === 'official' ? -1 : 1) - (b.source_type === 'official' ? -1 : 1) || String(a.title).localeCompare(String(b.title), 'pt-BR'))
    .map(source => `<option value="${esc(source.id)}">${esc(sourceTypeLabel(source.source_type))} · ${esc(source.title)}</option>`).join('');
  if (state.sources.some(item => item.id === current)) select.value = current;
}

function renderSourceCatalog() {
  const target = $('source-catalog');
  if (!state.sources.length) {
    target.innerHTML = '<div class="skill-audit-empty">Nenhuma fonte cadastrada.</div>';
    return;
  }
  target.innerHTML = state.sources
    .slice()
    .sort((a, b) => (a.source_type === 'official' ? 0 : 1) - (b.source_type === 'official' ? 0 : 1) || String(a.title).localeCompare(String(b.title), 'pt-BR'))
    .map(source => {
      const uses = state.links.filter(link => link.source_id === source.id).length;
      return `<div class="source-catalog-row"><div><strong>${esc(source.title)}</strong><span>${esc(sourceTypeLabel(source.source_type))} · ${esc(source.language)} · ${uses} vínculo(s)</span></div><button type="button" data-edit-source="${esc(source.id)}">Editar</button></div>`;
    }).join('');
}

function visibleSkills() {
  const term = normalize(search.value);
  const heroId = heroFilter.value;
  const sourceMode = sourceFilter.value;
  const recheckMode = recheckFilter.value;
  return state.skills.filter(skill => {
    const hero = heroById(skill.hero_id);
    const links = linksFor(skill.id);
    const sourceTypes = new Set(links.map(link => sourceById(link.source_id)?.source_type).filter(Boolean));
    if (heroId && skill.hero_id !== heroId) return false;
    if (term && !normalize(`${hero?.name || ''} ${skill.name} ${skill.slug}`).includes(term)) return false;
    if (sourceMode === 'missing' && links.length) return false;
    if ((sourceMode === 'official' || sourceMode === 'wiki') && !sourceTypes.has(sourceMode)) return false;
    if (recheckMode === 'yes' && !skill.needs_recheck) return false;
    if (recheckMode === 'no' && skill.needs_recheck) return false;
    return true;
  }).sort((a, b) => {
    const ha = heroById(a.hero_id); const hb = heroById(b.hero_id);
    const order = Number(ha?.display_order || 0) - Number(hb?.display_order || 0);
    if (order) return order;
    if (a.hero_id !== b.hero_id) return String(ha?.name || '').localeCompare(String(hb?.name || ''), 'pt-BR');
    return Number(a.display_order || 0) - Number(b.display_order || 0);
  });
}

function sourceMarkup(link) {
  const source = sourceById(link.source_id);
  if (!source) return '';
  const badge = link.verification_status === 'verified' ? 'ok' : link.needs_recheck ? 'warn' : '';
  return `<div class="skill-source-row">
    <strong><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)} ↗</a></strong>
    <span>${esc(sourceTypeLabel(source.source_type))} · idioma ${esc(source.language)} · ${esc(coverageLabel(link.coverage))} · ${esc(verificationLabel(link.verification_status))}${link.verified_patch ? ` · ${esc(link.verified_patch)}` : ''}</span>
    ${link.public_note ? `<span>${esc(link.public_note)}</span>` : ''}
    <div class="skill-source-actions"><button type="button" class="${badge}" data-edit-link="${esc(link.id)}">Editar vínculo</button><button type="button" class="danger" data-unlink="${esc(link.id)}">Desvincular</button></div>
  </div>`;
}

function historyMarkup(row) {
  const label = String(row.attribute_name || 'alteração').replaceAll('_', ' ');
  const source = sourceById(row.source_id);
  return `<div class="skill-history-row"><strong>${esc(row.patch_version || 'Patch')} · ${esc(label)}</strong><span>${row.old_value !== null && row.old_value !== undefined ? `${esc(row.old_value)} → ` : ''}${esc(row.new_value ?? 'efeito adicionado')}</span>${row.description ? `<span>${esc(row.description)}</span>` : ''}${source ? `<span>Fonte: ${esc(source.title)}</span>` : ''}</div>`;
}

function renderSkill(skill) {
  const hero = heroById(skill.hero_id);
  const links = linksFor(skill.id);
  const history = historyFor(skill.id);
  const officialLinks = links.filter(link => sourceById(link.source_id)?.source_type === 'official');
  const statusClass = skill.verification_status === 'verified' ? 'ok' : 'warn';
  return `<article class="skill-audit-card" data-skill-id="${esc(skill.id)}">
    <div class="skill-audit-card-head"><div><h3>${esc(hero?.name || 'Herói')} · ${esc(skill.name)}</h3><div class="sub">${esc(skill.slug)} · ordem ${Number(skill.display_order || 0)} · ${skill.enabled === false ? 'oculta' : 'publicada com o herói'}</div></div><span class="skill-audit-badge ${statusClass}">${esc(verificationLabel(skill.verification_status))}</span></div>
    <div class="skill-audit-badges"><span class="skill-audit-badge ${links.length ? 'ok' : 'warn'}">${links.length} fonte(s)</span><span class="skill-audit-badge ${officialLinks.length ? 'official' : ''}">${officialLinks.length} oficial(is)</span><span class="skill-audit-badge ${skill.needs_recheck ? 'warn' : 'ok'}">${skill.needs_recheck ? 'rechecagem pendente' : 'sem rechecagem'}</span>${skill.verified_patch ? `<span class="skill-audit-badge official">${esc(skill.verified_patch)}</span>` : ''}<span class="skill-audit-badge">${history.length} histórico(s)</span></div>
    ${skill.verification_note ? `<div class="sub" style="margin-top:8px;line-height:1.5">${esc(skill.verification_note)}</div>` : ''}
    <div class="skill-audit-card-actions"><a class="admin-button" href="./hero-editor.html?id=${encodeURIComponent(skill.hero_id)}&tab=abilities&skill=${encodeURIComponent(skill.id)}">Abrir no editor</a><button class="admin-button primary" type="button" data-add-link="${esc(skill.id)}">Vincular fonte</button></div>
    <details class="skill-audit-details"><summary>Fontes (${links.length})</summary><div class="skill-source-list">${links.length ? links.map(sourceMarkup).join('') : '<div class="skill-audit-empty">Nenhuma fonte vinculada.</div>'}</div></details>
    <details class="skill-audit-details"><summary>Histórico oficial (${history.length})</summary><div class="skill-history-list">${history.length ? history.map(historyMarkup).join('') : '<div class="skill-audit-empty">Nenhum evento histórico registrado.</div>'}</div></details>
  </article>`;
}

function render() {
  renderSummary();
  renderHeroOptions();
  renderSourceOptions();
  renderSourceCatalog();
  const rows = visibleSkills();
  list.innerHTML = rows.length ? rows.map(renderSkill).join('') : '<div class="skill-audit-empty">Nenhuma habilidade corresponde aos filtros.</div>';
  setMessage(`${rows.length} de ${state.skills.length} habilidade(s) exibida(s).`);
}

function resetSourceForm() {
  sourceForm.reset();
  sourceForm.elements.id.value = '';
  sourceForm.elements.source_type.value = 'official';
  sourceForm.elements.language.value = 'en';
}

function editSource(id) {
  const source = sourceById(id); if (!source) return;
  sourceForm.elements.id.value = source.id;
  sourceForm.elements.url.value = source.url || '';
  sourceForm.elements.source_type.value = source.source_type || 'other';
  sourceForm.elements.language.value = source.language || '';
  sourceForm.elements.title.value = source.title || '';
  sourceForm.elements.publisher.value = source.publisher || '';
  sourceForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function saveSource(event) {
  event.preventDefault();
  const id = sourceForm.elements.id.value.trim();
  const payload = {
    url: sourceForm.elements.url.value.trim(),
    source_type: sourceForm.elements.source_type.value,
    language: sourceForm.elements.language.value.trim(),
    title: sourceForm.elements.title.value.trim(),
    publisher: sourceForm.elements.publisher.value.trim() || null,
    last_checked_at: new Date().toISOString()
  };
  if (!/^https?:\/\//i.test(payload.url)) { setMessage('A fonte precisa usar uma URL pública http(s).', 'error'); return; }
  if (!payload.language || !payload.title) { setMessage('Idioma e título são obrigatórios.', 'error'); return; }
  setMessage('Salvando fonte...');
  const result = id
    ? await supabase.from('source_references').update(payload).eq('id', id).select('id').single()
    : await supabase.from('source_references').insert(payload).select('id').single();
  if (result.error) { setMessage(`Não foi possível salvar a fonte: ${result.error.message}`, 'error'); return; }
  resetSourceForm();
  await load({ announce: 'Fonte salva com sucesso.' });
}

function openLinkEditor(skillId, linkId = '') {
  const skill = skillById(skillId); if (!skill) return;
  const hero = heroById(skill.hero_id);
  linkForm.reset();
  linkForm.elements.id.value = '';
  linkForm.elements.skill_id.value = skill.id;
  linkForm.elements.coverage.value = 'corroboration';
  linkForm.elements.verification_status.value = 'corroborated';
  linkForm.elements.needs_recheck.checked = true;
  $('link-panel-title').textContent = linkId ? 'Editar vínculo de fonte' : 'Vincular fonte';
  $('link-panel-copy').textContent = `${hero?.name || 'Herói'} · ${skill.name}`;
  if (linkId) {
    const link = state.links.find(item => item.id === linkId); if (!link) return;
    linkForm.elements.id.value = link.id;
    linkForm.elements.source_id.value = link.source_id;
    linkForm.elements.coverage.value = link.coverage;
    linkForm.elements.verification_status.value = link.verification_status;
    linkForm.elements.verified_patch.value = link.verified_patch || '';
    linkForm.elements.is_primary.checked = Boolean(link.is_primary);
    linkForm.elements.needs_recheck.checked = Boolean(link.needs_recheck);
    linkForm.elements.public_note.value = link.public_note || '';
  }
  linkPanel.hidden = false;
  linkPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function closeLinkEditor() { linkPanel.hidden = true; linkForm.reset(); }

async function recomputeSkillVerification(skillId) {
  const { data, error } = await supabase.from('hero_skill_source_links').select('coverage,verification_status,needs_recheck,verified_at,verified_patch').eq('skill_id', skillId);
  if (error) throw error;
  const rows = data || [];
  const verifiedBaseline = rows.some(item => item.coverage === 'baseline_values' && item.verification_status === 'verified' && item.needs_recheck === false);
  const hasEvidence = rows.some(item => item.verification_status === 'verified' || item.verification_status === 'corroborated');
  const patchRows = rows.filter(item => item.coverage === 'patch_override' && item.verification_status === 'verified' && item.verified_patch)
    .sort((a, b) => new Date(b.verified_at || 0) - new Date(a.verified_at || 0));
  const payload = {
    verification_status: verifiedBaseline ? 'verified' : hasEvidence ? 'corroborated' : 'unverified',
    needs_recheck: !verifiedBaseline,
    verified_at: hasEvidence ? new Date().toISOString() : null,
    verified_patch: patchRows[0]?.verified_patch || null,
    verification_note: verifiedBaseline
      ? 'Valores-base vinculados a uma fonte marcada como oficialmente verificada e sem rechecagem pendente.'
      : hasEvidence
        ? 'Há fontes verificadas ou corroboradas, mas os valores-base ainda não possuem verificação oficial completa.'
        : 'Nenhuma evidência verificável está vinculada a esta habilidade.'
  };
  const update = await supabase.from('hero_skills').update(payload).eq('id', skillId);
  if (update.error) throw update.error;
}

async function saveLink(event) {
  event.preventDefault();
  const id = linkForm.elements.id.value.trim();
  const skillId = linkForm.elements.skill_id.value.trim();
  const status = linkForm.elements.verification_status.value;
  const payload = {
    skill_id: skillId,
    source_id: linkForm.elements.source_id.value,
    coverage: linkForm.elements.coverage.value,
    is_primary: linkForm.elements.is_primary.checked,
    verification_status: status,
    verified_at: status === 'unverified' ? null : new Date().toISOString(),
    verified_patch: linkForm.elements.verified_patch.value.trim() || null,
    needs_recheck: linkForm.elements.needs_recheck.checked,
    public_note: linkForm.elements.public_note.value.trim() || null
  };
  if (!payload.source_id) { setMessage('Escolha uma fonte real antes de salvar o vínculo.', 'error'); return; }
  setMessage('Salvando vínculo...');
  const result = id
    ? await supabase.from('hero_skill_source_links').update(payload).eq('id', id)
    : await supabase.from('hero_skill_source_links').insert(payload);
  if (result.error) { setMessage(`Não foi possível salvar o vínculo: ${result.error.message}`, 'error'); return; }
  try { await recomputeSkillVerification(skillId); }
  catch (error) { setMessage(`Vínculo salvo, mas a consolidação da habilidade falhou: ${error.message}`, 'error'); return; }
  closeLinkEditor();
  await load({ announce: 'Vínculo de fonte salvo e estado da habilidade recalculado.' });
}

async function unlink(linkId) {
  const link = state.links.find(item => item.id === linkId); if (!link) return;
  const source = sourceById(link.source_id);
  if (!window.confirm(`Desvincular a fonte “${source?.title || 'Fonte'}” desta habilidade?\n\nA fonte permanecerá no catálogo; somente este vínculo será removido.`)) return;
  const result = await supabase.from('hero_skill_source_links').delete().eq('id', link.id);
  if (result.error) { setMessage(`Não foi possível desvincular: ${result.error.message}`, 'error'); return; }
  try { await recomputeSkillVerification(link.skill_id); }
  catch (error) { setMessage(`Vínculo removido, mas a consolidação falhou: ${error.message}`, 'error'); return; }
  await load({ announce: 'Fonte desvinculada; nenhum registro da fonte foi apagado.' });
}

async function load({ announce = '' } = {}) {
  list.innerHTML = '<div class="skill-audit-empty">Carregando habilidades, fontes e histórico...</div>';
  if (!announce) setMessage('Sincronizando com o banco...');
  const [heroes, skills, sources, links, history, levels] = await Promise.all([
    supabase.from('heroes').select('id,name,slug,enabled,display_order').order('display_order').order('name'),
    supabase.from('hero_skills').select('id,hero_id,name,slug,skill_type,display_order,enabled,verification_status,verified_at,verified_patch,needs_recheck,verification_note').order('display_order').order('name'),
    supabase.from('source_references').select('id,url,source_type,language,title,publisher,last_checked_at,created_at,updated_at').order('source_type').order('title'),
    supabase.from('hero_skill_source_links').select('id,skill_id,source_id,coverage,is_primary,verification_status,verified_at,verified_patch,needs_recheck,public_note,created_at,updated_at'),
    supabase.from('balance_history').select('id,hero_id,skill_id,source_id,patch_version,change_type,attribute_name,old_value,new_value,description,created_at').not('skill_id', 'is', null).order('created_at', { ascending: false }),
    supabase.from('hero_skill_levels').select('id', { count: 'exact', head: true })
  ]);
  const results = [heroes, skills, sources, links, history, levels];
  const failed = results.find(item => item.error);
  if (failed) throw failed.error;
  state.heroes = heroes.data || [];
  state.skills = skills.data || [];
  state.sources = sources.data || [];
  state.links = links.data || [];
  state.history = history.data || [];
  state.levelCount = Number(levels.count || 0);
  render();
  setMessage(announce || `Auditoria carregada: ${state.skills.length} habilidades e ${state.links.length} vínculos de fonte.`, 'ok');
}

for (const element of [search, heroFilter, sourceFilter, recheckFilter]) element.addEventListener(element === search ? 'input' : 'change', render);
$('audit-refresh').addEventListener('click', () => load().catch(handleLoadError));
$('source-reset').addEventListener('click', resetSourceForm);
$('link-cancel').addEventListener('click', closeLinkEditor);
sourceForm.addEventListener('submit', saveSource);
linkForm.addEventListener('submit', saveLink);
$('source-catalog').addEventListener('click', event => { const button = event.target.closest('[data-edit-source]'); if (button) editSource(button.dataset.editSource); });
list.addEventListener('click', event => {
  const add = event.target.closest('[data-add-link]'); if (add) { openLinkEditor(add.dataset.addLink); return; }
  const edit = event.target.closest('[data-edit-link]'); if (edit) { const link = state.links.find(item => item.id === edit.dataset.editLink); if (link) openLinkEditor(link.skill_id, link.id); return; }
  const remove = event.target.closest('[data-unlink]'); if (remove) unlink(remove.dataset.unlink);
});

function handleLoadError(error) {
  console.error('[hero-skill-audit]', error);
  list.innerHTML = '<div class="skill-audit-empty">Não foi possível carregar a auditoria.</div>';
  setMessage(error.message || 'Falha ao consultar o banco.', 'error');
}

resetSourceForm();
load().catch(handleLoadError);
