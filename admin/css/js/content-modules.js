import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';

const $ = id => document.getElementById(id);
const state = { guides:[], news:[], tiers:[], heroes:[], media:[], compositions:[], activeTier:null, session:null };
const EDITORIAL_STATE_EVENT = 'echo:editorial-state-change';

function esc(value='') { return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function slugify(value='') { return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
function formatDate(value){ if(!value)return ''; const d=new Date(value); return Number.isNaN(d.getTime())?'':d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}); }
function hubMessage(text='',type=''){ const el=$('content-hub-message'); if(!el)return; el.textContent=text; el.className=`content-hub-message${text?' show':''}${type?` ${type}`:''}`; }
function formStatus(form,text='',type=''){ const el=form?.querySelector('[data-editor-status]'); if(!el)return; el.textContent=text; el.className=`content-editor-status${type?` ${type}`:''}`; }
function empty(text){ return `<div class="content-empty">${esc(text)}</div>`; }

function activateTab(key){
  document.querySelectorAll('[data-hub-tab]').forEach(button=>button.classList.toggle('active',button.dataset.hubTab===key));
  document.querySelectorAll('[data-hub-view]').forEach(view=>view.classList.toggle('active',view.dataset.hubView===key));
}
document.querySelectorAll('[data-hub-tab]').forEach(button=>button.addEventListener('click',()=>activateTab(button.dataset.hubTab)));

async function loadReferenceData(){
  const [{ data:{ session } }, heroesResult, mediaResult] = await Promise.all([
    supabase.auth.getSession(),
    supabase.from('heroes').select('id,name,slug,enabled').order('name',{ascending:true}),
    supabase.from('media').select('id,name,file_name,public_url,enabled,entity_hint').eq('enabled',true).order('created_at',{ascending:false}).limit(250)
  ]);
  state.session=session||null;
  if(heroesResult.error) throw heroesResult.error;
  state.heroes=heroesResult.data||[];
  state.media=mediaResult.error?[]:(mediaResult.data||[]);
  const heroOptions=state.heroes.map(hero=>`<option value="${esc(hero.id)}">${esc(hero.name)}${hero.enabled===false?' (inativo)':''}</option>`).join('');
  const mediaOptions=state.media.map(item=>`<option value="${esc(item.id)}">${esc(item.name||item.file_name||item.entity_hint||'Mídia')}</option>`).join('');
  document.querySelectorAll('[data-hero-select]').forEach(select=>select.insertAdjacentHTML('beforeend',heroOptions));
  document.querySelectorAll('[data-media-select]').forEach(select=>select.insertAdjacentHTML('beforeend',mediaOptions));
  $('tier-add-hero').innerHTML=`<option value="">Escolha um herói</option>${heroOptions}`;
}

function editorialTable(type){ return type==='guides'?'guides':'news'; }
function editorialListElement(type){ return $(type==='guides'?'guides-list':'news-list'); }
function editorialForm(type){ return $(type==='guides'?'guides-form':'news-form'); }
function editorialTitle(type){ return $(type==='guides'?'guides-editor-title':'news-editor-title'); }
function notifyEditorialState(form){ form.dispatchEvent(new CustomEvent(EDITORIAL_STATE_EVENT)); }

async function loadEditorial(type){
  const table=editorialTable(type);
  const { data,error }=await supabase.from(table).select('*').order('updated_at',{ascending:false});
  if(error) throw error;
  state[type]=data||[];
  renderEditorialList(type);
}
function renderEditorialList(type){
  const rows=state[type]||[]; const list=editorialListElement(type);
  if(!rows.length){ list.innerHTML=empty(type==='guides'?'Nenhum guia cadastrado.':'Nenhuma notícia cadastrada.'); return; }
  list.innerHTML=rows.map(row=>`<button type="button" class="content-list-item" data-edit-editorial="${type}" data-id="${esc(row.id)}"><span class="content-list-copy"><strong>${esc(row.title)}</strong><span>${esc(row.slug)} · ${esc(formatDate(row.updated_at||row.created_at))}</span></span><span class="content-state ${row.published?'published':''}">${row.published?'Publicado':'Rascunho'}</span></button>`).join('');
}
function resetEditorial(type){
  const form=editorialForm(type); form.reset(); form.elements.id.value=''; form.querySelector('[data-delete-editorial]').hidden=true; formStatus(form,'');
  editorialTitle(type).textContent=type==='guides'?'Novo guia':'Nova notícia';
  editorialListElement(type)?.querySelectorAll('.content-list-item').forEach(item=>item.classList.remove('active'));
  notifyEditorialState(form);
}
function fillEditorial(type,id){
  const row=(state[type]||[]).find(item=>String(item.id)===String(id)); if(!row)return;
  const form=editorialForm(type); resetEditorial(type);
  for(const [key,value] of Object.entries(row)){
    const field=form.elements.namedItem(key); if(!field)continue;
    if(field.type==='checkbox') field.checked=Boolean(value); else field.value=value??'';
  }
  form.querySelector('[data-delete-editorial]').hidden=false;
  editorialTitle(type).textContent=row.title;
  editorialListElement(type)?.querySelector(`[data-id="${CSS.escape(String(id))}"]`)?.classList.add('active');
  notifyEditorialState(form);
}
function editorialPayload(type,form){
  const data=new FormData(form);
  const payload={
    title:String(data.get('title')||'').trim(),
    slug:slugify(data.get('slug')||data.get('title')||''),
    summary:String(data.get('summary')||'').trim()||null,
    content:String(data.get('content')||'').trim()||null,
    cover_media_id:String(data.get('cover_media_id')||'').trim()||null,
    published:form.elements.published.checked,
    meta_title:String(data.get('meta_title')||'').trim()||null,
    meta_description:String(data.get('meta_description')||'').trim()||null,
    updated_at:new Date().toISOString()
  };
  if(type==='guides') payload.hero_id=String(data.get('hero_id')||'').trim()||null;
  return payload;
}
async function saveEditorial(type,form){
  const id=String(form.elements.id.value||'').trim(); const payload=editorialPayload(type,form); const table=editorialTable(type);
  if(!payload.title||!payload.slug){ formStatus(form,'Título e slug são obrigatórios.','error'); return; }
  formStatus(form,'Salvando…');
  try{
    let result;
    if(id) result=await supabase.from(table).update(payload).eq('id',id).select('*').single();
    else result=await supabase.from(table).insert({ ...payload, author_id:state.session?.user?.id||null }).select('*').single();
    if(result.error) throw result.error;
    await loadEditorial(type); fillEditorial(type,result.data.id); formStatus(form,'Salvo com sucesso.','ok');
  }catch(error){ console.error(`[${type}]`,error); formStatus(form,`Falha ao salvar: ${error.message}`,'error'); }
}
async function deleteEditorial(type){
  const form=editorialForm(type); const id=String(form.elements.id.value||'').trim(); if(!id)return;
  const row=(state[type]||[]).find(item=>String(item.id)===id); if(!confirm(`Excluir ${type==='guides'?'o guia':'a notícia'} “${row?.title||''}”? Esta ação remove o registro do banco.`))return;
  formStatus(form,'Excluindo…');
  const { error }=await supabase.from(editorialTable(type)).delete().eq('id',id);
  if(error){ formStatus(form,`Falha ao excluir: ${error.message}`,'error'); return; }
  await loadEditorial(type); resetEditorial(type); formStatus(form,'Registro excluído.','ok');
}

for(const type of ['guides','news']){
  const form=editorialForm(type);
  form.addEventListener('submit',event=>{ event.preventDefault(); saveEditorial(type,form); });
  form.elements.title.addEventListener('input',()=>{ if(!form.elements.slug.value.trim()) form.elements.slug.value=slugify(form.elements.title.value); });
  document.querySelector(`[data-new-editorial="${type}"]`)?.addEventListener('click',()=>resetEditorial(type));
  document.querySelector(`[data-reset-editorial="${type}"]`)?.addEventListener('click',()=>resetEditorial(type));
  document.querySelector(`[data-delete-editorial="${type}"]`)?.addEventListener('click',()=>deleteEditorial(type));
  editorialListElement(type)?.addEventListener('click',event=>{ const item=event.target.closest(`[data-edit-editorial="${type}"]`); if(item)fillEditorial(type,item.dataset.id); });
}

async function loadTiers(){
  const { data,error }=await supabase.from('tier_lists').select('*').order('updated_at',{ascending:false});
  if(error) throw error; state.tiers=data||[]; renderTierList();
}
function renderTierList(){
  const list=$('tier-list-admin');
  if(!state.tiers.length){ list.innerHTML=empty('Nenhuma Tier List cadastrada.'); return; }
  list.innerHTML=state.tiers.map(row=>`<button type="button" class="content-list-item ${row.id===state.activeTier?'active':''}" data-tier-id="${esc(row.id)}"><span class="content-list-copy"><strong>${esc(row.title)}</strong><span>${esc(row.slug)} · ${esc(formatDate(row.updated_at||row.created_at))}</span></span><span class="content-state ${row.published?'published':''}">${row.published?'Publicada':'Rascunho'}</span></button>`).join('');
}
function resetTier(){
  state.activeTier=null; const form=$('tier-form'); form.reset(); form.elements.id.value=''; $('tier-delete').hidden=true; $('tier-entries-wrap').hidden=true; $('tier-editor-title').textContent='Nova Tier List'; $('tier-status').textContent=''; renderTierList();
}
async function selectTier(id){
  const row=state.tiers.find(item=>String(item.id)===String(id)); if(!row)return;
  state.activeTier=row.id; const form=$('tier-form');
  form.elements.id.value=row.id; form.elements.title.value=row.title||''; form.elements.slug.value=row.slug||''; form.elements.description.value=row.description||''; form.elements.published.checked=Boolean(row.published);
  $('tier-editor-title').textContent=row.title; $('tier-delete').hidden=false; $('tier-entries-wrap').hidden=false; renderTierList(); await loadTierEntries(row.id);
}
async function saveTier(event){
  event.preventDefault(); const form=$('tier-form'); const id=String(form.elements.id.value||'').trim(); const payload={ title:form.elements.title.value.trim(),slug:slugify(form.elements.slug.value||form.elements.title.value),description:form.elements.description.value.trim()||null,published:form.elements.published.checked,updated_at:new Date().toISOString() };
  if(!payload.title||!payload.slug){ $('tier-status').className='content-editor-status error'; $('tier-status').textContent='Título e slug são obrigatórios.'; return; }
  $('tier-status').className='content-editor-status'; $('tier-status').textContent='Salvando…';
  try{
    let result;
    if(id) result=await supabase.from('tier_lists').update(payload).eq('id',id).select('*').single();
    else result=await supabase.from('tier_lists').insert({ ...payload,created_by:state.session?.user?.id||null }).select('*').single();
    if(result.error)throw result.error;
    await loadTiers(); await selectTier(result.data.id); $('tier-status').className='content-editor-status ok'; $('tier-status').textContent='Lista salva.';
  }catch(error){ $('tier-status').className='content-editor-status error'; $('tier-status').textContent=`Falha ao salvar: ${error.message}`; }
}
async function deleteTier(){
  if(!state.activeTier)return; const row=state.tiers.find(item=>item.id===state.activeTier); if(!confirm(`Excluir a Tier List “${row?.title||''}” e suas entradas?`))return;
  try{
    const entries=await supabase.from('tier_list_entries').delete().eq('tier_list_id',state.activeTier); if(entries.error)throw entries.error;
    const result=await supabase.from('tier_lists').delete().eq('id',state.activeTier); if(result.error)throw result.error;
    await loadTiers(); resetTier(); hubMessage('Tier List excluída.','ok');
  }catch(error){ hubMessage(`Falha ao excluir a Tier List: ${error.message}`,'error'); }
}
async function loadTierEntries(tierListId){
  const { data,error }=await supabase.from('tier_list_entries').select('*').eq('tier_list_id',tierListId).order('display_order',{ascending:true}); if(error)throw error;
  renderTierEntries(data||[]);
}
function heroName(id){ return state.heroes.find(hero=>hero.id===id)?.name||'Herói'; }
function heroOptions(selected=''){ return state.heroes.map(hero=>`<option value="${esc(hero.id)}" ${hero.id===selected?'selected':''}>${esc(hero.name)}</option>`).join(''); }
function renderTierEntries(entries){
  const list=$('tier-entry-list');
  if(!entries.length){ list.innerHTML=empty('Nenhum herói adicionado a esta lista.'); return; }
  list.innerHTML=entries.map(entry=>`<div class="tier-entry" data-tier-entry="${esc(entry.id)}"><select data-entry-field="hero_id">${heroOptions(entry.hero_id)}</select><input data-entry-field="tier" maxlength="8" value="${esc(entry.tier||'')}"><input data-entry-field="score" inputmode="decimal" value="${esc(entry.score??'')}" placeholder="Score"><input class="tier-notes" data-entry-field="notes" maxlength="180" value="${esc(entry.notes||'')}" placeholder="Observação"><div style="display:flex;gap:5px"><button type="button" data-save-tier-entry title="Salvar" style="border-color:#28613c;background:#0c2918;color:#8bf0aa">✓</button><button type="button" data-delete-tier-entry title="Remover">×</button></div></div>`).join('');
}
async function addTierEntry(){
  if(!state.activeTier){ hubMessage('Salve a Tier List antes de adicionar heróis.','error'); return; }
  const hero_id=$('tier-add-hero').value; const tier=$('tier-add-tier').value.trim().toUpperCase(); const scoreText=$('tier-add-score').value.trim().replace(',','.'); const notes=$('tier-add-notes').value.trim();
  if(!hero_id||!tier){ hubMessage('Escolha um herói e informe o tier.','error'); return; }
  const score=scoreText===''?null:Number(scoreText); if(scoreText!==''&&!Number.isFinite(score)){ hubMessage('Score inválido.','error'); return; }
  const { count }=await supabase.from('tier_list_entries').select('id',{count:'exact',head:true}).eq('tier_list_id',state.activeTier);
  const { error }=await supabase.from('tier_list_entries').insert({tier_list_id:state.activeTier,hero_id,tier,score,notes:notes||null,display_order:Number(count||0)});
  if(error){ hubMessage(`Não foi possível adicionar: ${error.message}`,'error'); return; }
  $('tier-add-hero').value=''; $('tier-add-tier').value=''; $('tier-add-score').value=''; $('tier-add-notes').value=''; await loadTierEntries(state.activeTier); hubMessage('Herói adicionado à Tier List.','ok');
}
async function saveTierEntry(node){
  const id=node.dataset.tierEntry; const values={}; node.querySelectorAll('[data-entry-field]').forEach(field=>values[field.dataset.entryField]=field.value);
  const scoreText=String(values.score||'').trim().replace(',','.'); const score=scoreText===''?null:Number(scoreText); if(scoreText!==''&&!Number.isFinite(score)){ hubMessage('Score inválido.','error'); return; }
  const { error }=await supabase.from('tier_list_entries').update({hero_id:values.hero_id,tier:String(values.tier||'').trim().toUpperCase(),score,notes:String(values.notes||'').trim()||null}).eq('id',id);
  if(error){ hubMessage(`Falha ao salvar entrada: ${error.message}`,'error'); return; } hubMessage(`Entrada de ${heroName(values.hero_id)} atualizada.`,'ok');
}
async function deleteTierEntry(node){
  const id=node.dataset.tierEntry; if(!confirm('Remover este herói da Tier List?'))return; const { error }=await supabase.from('tier_list_entries').delete().eq('id',id); if(error){ hubMessage(`Falha ao remover: ${error.message}`,'error'); return; } await loadTierEntries(state.activeTier);
}
$('tier-form').addEventListener('submit',saveTier); $('tier-form').elements.title.addEventListener('input',()=>{ if(!$('tier-form').elements.slug.value.trim()) $('tier-form').elements.slug.value=slugify($('tier-form').elements.title.value); });
$('tier-new').addEventListener('click',resetTier); $('tier-reset').addEventListener('click',resetTier); $('tier-delete').addEventListener('click',deleteTier); $('tier-add-button').addEventListener('click',addTierEntry);
$('tier-list-admin').addEventListener('click',event=>{ const item=event.target.closest('[data-tier-id]'); if(item)selectTier(item.dataset.tierId); });
$('tier-entry-list').addEventListener('click',event=>{ const node=event.target.closest('[data-tier-entry]'); if(!node)return; if(event.target.closest('[data-save-tier-entry]'))saveTierEntry(node); if(event.target.closest('[data-delete-tier-entry]'))deleteTierEntry(node); });

async function loadCompositions(){
  const { data,error }=await supabase.from('team_compositions').select('*').order('updated_at',{ascending:false}); if(error)throw error; state.compositions=data||[];
  const ids=state.compositions.map(item=>item.id); let members=[];
  if(ids.length){ const result=await supabase.from('team_composition_members').select('*').in('composition_id',ids).order('position',{ascending:true}); if(result.error)throw result.error; members=result.data||[]; }
  const list=$('composition-admin-list'); if(!state.compositions.length){ list.innerHTML=empty('Nenhuma composição cadastrada.'); return; }
  const byComposition=new Map(); members.forEach(member=>{ if(!byComposition.has(member.composition_id))byComposition.set(member.composition_id,[]); byComposition.get(member.composition_id).push(member); });
  list.innerHTML=state.compositions.map(row=>{ const team=byComposition.get(row.id)||[]; return `<div class="composition-admin-card" data-composition-id="${esc(row.id)}"><div class="composition-admin-head"><div><strong>${esc(row.title)}</strong><span>${esc(row.description||'Sem descrição')}</span></div><span class="content-state ${row.is_public?'published':'private'}">${row.is_public?'Pública':'Privada'}</span></div><div class="composition-admin-members">${team.length?team.map(member=>`<span class="composition-admin-member">${member.position}. ${esc(heroName(member.hero_id))}</span>`).join(''):'<span class="composition-admin-member">Sem membros</span>'}</div><div class="composition-admin-actions"><label><input type="checkbox" data-composition-public ${row.is_public?'checked':''}> Visível publicamente</label><button class="admin-button" type="button" data-composition-save>Salvar visibilidade</button></div></div>`; }).join('');
}
$('composition-admin-list').addEventListener('click',async event=>{
  const card=event.target.closest('[data-composition-id]'); if(!card||!event.target.closest('[data-composition-save]'))return;
  const is_public=Boolean(card.querySelector('[data-composition-public]')?.checked); const { error }=await supabase.from('team_compositions').update({is_public,updated_at:new Date().toISOString()}).eq('id',card.dataset.compositionId);
  if(error){ hubMessage(`Falha ao atualizar composição: ${error.message}`,'error'); return; } await loadCompositions(); hubMessage('Visibilidade da composição atualizada.','ok');
});

async function init(){
  hubMessage('Carregando módulos do banco…');
  try{
    await loadReferenceData();
    await Promise.all([loadEditorial('guides'),loadEditorial('news'),loadTiers(),loadCompositions()]);
    resetEditorial('guides'); resetEditorial('news'); resetTier(); hubMessage('Conteúdo sincronizado com o banco.','ok');
  }catch(error){ console.error('[content-modules]',error); hubMessage(`Falha ao carregar a central: ${error.message}`,'error'); }
}

init();
