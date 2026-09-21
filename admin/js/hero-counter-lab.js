import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';
import { COUNTER_SCHEMA_V5,compareHeroCountersV5,counterCoverageV5,suggestSemanticFactsV5 } from '../../js/echo-brain-counter-v5.js?v=20260825-counter-v5-shadow-1';

const $=id=>document.getElementById(id);
const state={heroes:[],skills:[],passives:[],facts:[],sources:[],activePatch:'',suggestions:[],currentResult:null,userId:null,schemaReady:false};
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const message=(id,text,tone='')=>{const el=$(id);if(!el)return;el.textContent=text||'';el.className=`counter-message ${tone}`.trim();};
const slugify=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,160);
const nOrNull=value=>String(value??'').trim()===''?null:Number(value);

async function hashText(value){
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

function heroById(id){return state.heroes.find(row=>row.id===id)||null;}
function skillById(id){return state.skills.find(row=>row.id===id)||null;}
function passiveById(id){return state.passives.find(row=>row.id===id)||null;}
function heroFacts(id){return state.facts.filter(row=>row.hero_id===id);}
function heroProfile(id){const hero=heroById(id);return hero?{...hero,facts:heroFacts(id)}:null;}

function optionList(selected=''){
  return state.heroes.map(h=>`<option value="${esc(h.id)}" ${h.id===selected?'selected':''}>${esc(h.name)}</option>`).join('');
}
function renderHeroSelects(){
  for(const id of ['knowledge-hero','counter-a','counter-b']){
    const el=$(id);if(!el)continue;const current=el.value;el.innerHTML=`<option value="">Selecione</option>${optionList(current)}`;
  }
}
function renderSources(){
  const el=document.querySelector('#passive-form [name="source_id"]');if(!el)return;
  const current=el.value;el.innerHTML='<option value="">Sem vínculo</option>'+state.sources.map(s=>`<option value="${esc(s.id)}" ${s.id===current?'selected':''}>${esc(s.source_type)} · ${esc(s.title)}</option>`).join('');
}

function renderKnowledge(){
  const heroId=$('knowledge-hero').value;
  const hero=heroById(heroId);
  if(!hero){$('knowledge-summary').innerHTML='<div class="counter-card"><p>Selecione um herói para revisar habilidades e passivas.</p></div>';$('skills-list').innerHTML='';$('passives-list').innerHTML='';$('facts-list').innerHTML='';return;}
  const skills=state.skills.filter(s=>s.hero_id===heroId),passives=state.passives.filter(p=>p.hero_id===heroId),coverage=counterCoverageV5(heroProfile(heroId));
  $('knowledge-summary').innerHTML=`<article class="counter-card"><header><strong>${esc(hero.name)}</strong><small>${skills.length} habilidades · ${passives.length} passivas</small></header><div class="counter-badges"><span class="counter-badge info">${coverage.confirmed} fatos confirmados</span><span class="counter-badge ${coverage.usable?'ok':'warn'}">${coverage.usable} utilizáveis</span><span class="counter-badge">${coverage.verified} verificados</span></div></article>`;
  $('skills-list').innerHTML=skills.length?skills.map(s=>`<article class="counter-card"><header><strong>${esc(s.name)}</strong><small>${esc(s.skill_type||'habilidade')}</small></header><p>${esc(s.description||'Sem descrição')}</p><div class="counter-badges"><span class="counter-badge ${s.verification_status==='verified'&&!s.needs_recheck?'ok':'warn'}">${esc(s.verification_status||'unverified')}</span>${s.needs_recheck?'<span class="counter-badge warn">rechecagem</span>':''}</div><div class="counter-actions"><button class="admin-button" type="button" data-analyze-skill="${esc(s.id)}">Analisar habilidade</button></div></article>`).join(''):'<div class="counter-card"><p>Nenhuma habilidade disponível.</p></div>';
  $('passives-list').innerHTML=passives.length?passives.map(p=>`<article class="counter-card"><header><strong>${esc(p.name)}</strong><small>${esc(p.passive_type)} · ${esc(p.trigger_type)}</small></header><p>${esc(p.description)}</p><div class="counter-badges"><span class="counter-badge ${p.verification_status==='verified'&&!p.needs_recheck?'ok':'warn'}">${esc(p.verification_status)}</span>${p.verified_patch?`<span class="counter-badge">patch ${esc(p.verified_patch)}</span>`:''}</div><div class="counter-actions"><button class="admin-button" type="button" data-analyze-passive="${esc(p.id)}">Analisar passiva</button><button class="admin-button" type="button" data-edit-passive="${esc(p.id)}">Editar</button><button class="admin-button danger" type="button" data-delete-passive="${esc(p.id)}">Excluir</button></div></article>`).join(''):'<div class="counter-card"><p>Nenhuma passiva cadastrada.</p></div>';
  renderFacts(heroId);
}

function renderFacts(heroId){
  const rows=state.facts.filter(f=>f.hero_id===heroId);
  $('facts-list').innerHTML=rows.length?rows.map(f=>`<article class="counter-card"><header><strong>${esc(f.fact_role)} · ${esc(f.mechanic)}</strong><small>${esc(f.source_kind)}</small></header><p>${esc(f.evidence_text)}</p><div class="counter-badges"><span class="counter-badge ${f.review_status==='confirmed'?'ok':'warn'}">${esc(f.review_status)}</span><span class="counter-badge ${f.verification_status==='verified'&&!f.needs_recheck?'ok':'warn'}">${esc(f.verification_status)}</span>${f.needs_recheck?'<span class="counter-badge warn">rechecagem</span>':''}</div><div class="counter-actions"><button class="admin-button danger" type="button" data-delete-fact="${esc(f.id)}">Remover fato</button></div></article>`).join(''):'<div class="counter-card"><p>Nenhum fato semântico registrado para este herói.</p></div>';
}

function resetPassive(){const form=$('passive-form');form.reset();form.elements.id.value='';form.elements.needs_recheck.checked=true;form.elements.passive_type.value='conditional';form.elements.trigger_type.value='conditional';renderSources();message('passive-message','');}
function editPassive(id){const p=passiveById(id);if(!p)return;const f=$('passive-form').elements;for(const key of ['id','name','passive_type','trigger_type','verified_patch','description','condition_text','verification_status','verification_note'])if(f[key])f[key].value=p[key]??'';f.duration_seconds.value=p.duration_seconds??'';f.cooldown_seconds.value=p.cooldown_seconds??'';f.needs_recheck.checked=p.needs_recheck===true;window.scrollTo({top:$('passive-form').getBoundingClientRect().top+scrollY-100,behavior:'smooth'});}

async function savePassive(event){
  event.preventDefault();const heroId=$('knowledge-hero').value;if(!heroId)return message('passive-message','Selecione um herói.','error');
  const form=event.currentTarget,f=form.elements,name=f.name.value.trim(),description=f.description.value.trim();if(!name||!description)return;
  const payload={hero_id:heroId,name,slug:slugify(name),description,passive_type:f.passive_type.value,trigger_type:f.trigger_type.value,verified_patch:f.verified_patch.value.trim()||null,condition_text:f.condition_text.value.trim()||null,duration_seconds:nOrNull(f.duration_seconds.value),cooldown_seconds:nOrNull(f.cooldown_seconds.value),verification_status:f.verification_status.value,needs_recheck:f.needs_recheck.checked,verification_note:f.verification_note.value.trim()||null,verified_at:f.verification_status.value==='verified'&&!f.needs_recheck.checked?new Date().toISOString():null,updated_by:state.userId};
  let row,error;if(f.id.value){({data:row,error}=await supabase.from('hero_passives').update(payload).eq('id',f.id.value).select().single());}
  else{payload.created_by=state.userId;({data:row,error}=await supabase.from('hero_passives').insert(payload).select().single());}
  if(error)return message('passive-message',error.message,'error');
  const sourceId=f.source_id.value;if(sourceId){const link={passive_id:row.id,source_id:sourceId,coverage:'structure',is_primary:true,verification_status:payload.verification_status,verified_at:payload.verified_at,verified_patch:payload.verified_patch,needs_recheck:payload.needs_recheck};const linkResult=await supabase.from('hero_passive_source_links').upsert(link,{onConflict:'passive_id,source_id,coverage'});if(linkResult.error)return message('passive-message',`Passiva salva; vínculo de fonte falhou: ${linkResult.error.message}`,'error');}
  message('passive-message','Passiva salva. Agora analise e confirme somente os fatos sustentados pela descrição.','ok');resetPassive();await loadData(heroId);
}

function prepareAnalyzer({heroId,sourceKind,sourceId,title,text,verificationStatus,needsRecheck}){
  $('analyzer-hero-id').value=heroId;$('analyzer-source-kind').value=sourceKind;$('analyzer-source-id').value=sourceId;$('analyzer-title').value=title;$('analyzer-text').value=text||'';$('analyzer-text').dataset.verificationStatus=verificationStatus||'unverified';$('analyzer-text').dataset.needsRecheck=String(needsRecheck===true);state.suggestions=[];renderSuggestions();$('analyzer-save').disabled=true;message('analyzer-message','Texto carregado. Clique em “Analisar texto”.');
  $('analyzer-text').scrollIntoView({behavior:'smooth',block:'center'});
}
function analyzeSkill(id){const s=skillById(id);if(!s)return;prepareAnalyzer({heroId:s.hero_id,sourceKind:'skill',sourceId:s.id,title:`Habilidade · ${s.name}`,text:s.description,verificationStatus:s.verification_status,needsRecheck:s.needs_recheck});}
function analyzePassive(id){const p=passiveById(id);if(!p)return;prepareAnalyzer({heroId:p.hero_id,sourceKind:'passive',sourceId:p.id,title:`Passiva · ${p.name}`,text:p.description,verificationStatus:p.verification_status,needsRecheck:p.needs_recheck});}
function runAnalyzer(){
  const text=$('analyzer-text').value.trim(),heroId=$('analyzer-hero-id').value,sourceKind=$('analyzer-source-kind').value,sourceId=$('analyzer-source-id').value;if(!heroId||!text)return message('analyzer-message','Carregue uma habilidade/passiva ou informe uma origem válida.','error');
  state.suggestions=suggestSemanticFactsV5({heroId,sourceKind,sourceId,text,verificationStatus:$('analyzer-text').dataset.verificationStatus||'unverified',needsRecheck:$('analyzer-text').dataset.needsRecheck==='true'});renderSuggestions();$('analyzer-save').disabled=!state.suggestions.length;message('analyzer-message',state.suggestions.length?`${state.suggestions.length} sugestão(ões). Nenhuma vem selecionada: marque somente os fatos realmente sustentados pela descrição e pela fonte.`:'Nenhum mecanismo conhecido foi reconhecido. Não invente um fato; registre manualmente somente se houver evidência.');
}
function renderSuggestions(){
  $('analyzer-suggestions').innerHTML=state.suggestions.map((s,i)=>`<label class="counter-suggestion"><input type="checkbox" data-suggestion="${i}"><span><b>${esc(s.factRole)} · ${esc(s.mechanic)}</b><span>gatilho ${esc(s.triggerType)} · confiança semântica proposta ${Math.round(s.semanticConfidence*100)}%</span></span></label>`).join('');
}
async function saveSuggestions(){
  const selected=[...document.querySelectorAll('[data-suggestion]:checked')].map(el=>state.suggestions[Number(el.dataset.suggestion)]).filter(Boolean);if(!selected.length)return message('analyzer-message','Selecione pelo menos um fato.','error');
  const rows=[];for(const s of selected){const fingerprint=await hashText([s.heroId,s.sourceKind,s.sourceId,s.factRole,s.mechanic,s.triggerType,s.evidenceText].join('|'));rows.push({hero_id:s.heroId,source_kind:s.sourceKind,skill_id:s.sourceKind==='skill'?s.sourceId:null,passive_id:s.sourceKind==='passive'?s.sourceId:null,fact_role:s.factRole,mechanic:s.mechanic,strength:s.strength,trigger_type:s.triggerType,target_scope:s.targetScope,condition_text:null,evidence_text:s.evidenceText,review_status:'confirmed',verification_status:s.verificationStatus,needs_recheck:s.needsRecheck,semantic_confidence:s.semanticConfidence,source_fingerprint:fingerprint,created_by:state.userId,updated_by:state.userId});}
  const {error}=await supabase.from('hero_semantic_facts').upsert(rows,{onConflict:'source_fingerprint'});if(error)return message('analyzer-message',error.message,'error');message('analyzer-message',`${rows.length} fato(s) confirmado(s) e salvos.`,'ok');await loadData($('knowledge-hero').value);
}

async function removePassive(id){if(!confirm('Excluir esta passiva e os fatos ligados a ela?'))return;const {error}=await supabase.from('hero_passives').delete().eq('id',id);if(error)return message('passive-message',error.message,'error');await loadData($('knowledge-hero').value);}
async function removeFact(id){if(!confirm('Remover este fato semântico?'))return;const {error}=await supabase.from('hero_semantic_facts').delete().eq('id',id);if(error)return message('analyzer-message',error.message,'error');await loadData($('knowledge-hero').value);}

function renderCounter(result){
  state.currentResult=result;const a=result.heroA,b=result.heroB;
  const evidence=[...result.aToB.evidence.map(e=>({side:`${a.name} → ${b.name}`,...e})),...result.bToA.evidence.map(e=>({side:`${b.name} → ${a.name}`,...e}))];
  $('counter-result').innerHTML=`<h4>${esc(result.label)}</h4><p>Confiança ${Math.round(result.confidence*100)}% · ${result.evidenceCount} interação(ões) causal(is) confirmada(s). Não é probabilidade de vitória.</p><div class="score"><article><span>${esc(a.name)} → ${esc(b.name)}</span><strong>${result.aToB.pressure}</strong><span>pressão de counter</span></article><span>VS</span><article><span>${esc(b.name)} → ${esc(a.name)}</span><strong>${result.bToA.pressure}</strong><span>pressão de counter</span></article></div><div class="counter-evidence">${evidence.length?evidence.map(e=>`<article><strong>${esc(e.side)} · ${esc(e.rule)}</strong><span>${esc(e.reason)} · contribuição ${Math.round(e.contribution*100)}%</span></article>`).join(''):'<article><strong>Sem cadeia causal suficiente</strong><span>Adicione e confirme fatos antes de interpretar o matchup.</span></article>'}</div>`;
  const review=$('review-form').elements;review.verdict.value=result.verdict;review.patch.value=state.activePatch||'';
}
function compareSelected(){const a=heroProfile($('counter-a').value),b=heroProfile($('counter-b').value);if(!a||!b||a.id===b.id)return message('counter-schema-message','Selecione dois heróis diferentes.','error');renderCounter(compareHeroCountersV5(a,b));}
function runMatrix(){
  const rows=[];for(let i=0;i<state.heroes.length;i++)for(let j=i+1;j<state.heroes.length;j++){const result=compareHeroCountersV5(heroProfile(state.heroes[i].id),heroProfile(state.heroes[j].id));if(result.evidenceCount&&result.confidence>=.45)rows.push(result);}
  rows.sort((x,y)=>Math.abs(y.net)-Math.abs(x.net)||y.confidence-x.confidence);$('counter-matrix').innerHTML=rows.length?rows.slice(0,80).map(r=>`<article class="counter-matrix-row"><div><strong>${esc(r.heroA.name)} × ${esc(r.heroB.name)}</strong><span>${esc(r.label)} · confiança ${Math.round(r.confidence*100)}%</span></div><span>${r.net>0?'+':''}${r.net}</span></article>`).join(''):'<div class="counter-card"><p>Ainda não há pares com evidência suficiente.</p></div>';
}
async function saveReview(event){event.preventDefault();if(!state.currentResult)return message('review-message','Faça uma comparação primeiro.','error');const f=event.currentTarget.elements;const {error}=await supabase.from('hero_counter_reviews').insert({hero_a_id:state.currentResult.heroA.id,hero_b_id:state.currentResult.heroB.id,verdict:f.verdict.value,reviewer_confidence:Number(f.reviewer_confidence.value||.5),patch:f.patch.value.trim()||null,notes:f.notes.value.trim()||null,engine_schema:COUNTER_SCHEMA_V5,engine_snapshot:state.currentResult,created_by:state.userId});if(error)return message('review-message',error.message,'error');message('review-message','Revisão humana registrada como calibração Shadow.','ok');f.notes.value='';}

async function loadData(keepHero=''){
  message('counter-schema-message','Sincronizando conhecimento…');
  const [heroes,skills,passives,facts,sources,seasons]=await Promise.all([
    supabase.from('heroes').select('id,name,slug,enabled,display_order').eq('enabled',true).order('display_order').order('name'),
    supabase.from('hero_skills').select('id,hero_id,name,description,skill_type,verification_status,needs_recheck,verified_patch,enabled,display_order').eq('enabled',true).order('display_order'),
    supabase.from('hero_passives').select('*').order('display_order').order('name'),
    supabase.from('hero_semantic_facts').select('*').order('created_at'),
    supabase.from('source_references').select('id,title,source_type,language,url').order('source_type').order('title'),
    supabase.from('seasons').select('game_version,active,starts_at').eq('active',true).order('starts_at',{ascending:false}).limit(1).maybeSingle()
  ]);
  const schemaError=passives.error||facts.error;if(schemaError){state.schemaReady=false;message('counter-schema-message',`Schema V5 indisponível neste Supabase: ${schemaError.message}. A página permanece fail-closed; nenhum counter será calculado.`,'error');return;}
  for(const result of [heroes,skills,sources])if(result.error){message('counter-schema-message',result.error.message,'error');return;}
  state.schemaReady=true;state.heroes=heroes.data||[];state.skills=skills.data||[];state.passives=passives.data||[];state.facts=facts.data||[];state.sources=sources.data||[];state.activePatch=seasons.data?.game_version||'';renderHeroSelects();renderSources();if(keepHero&&heroById(keepHero))$('knowledge-hero').value=keepHero;renderKnowledge();runMatrix();message('counter-schema-message',`Shadow pronto · ${state.heroes.length} heróis · ${state.passives.length} passivas · ${state.facts.length} fatos semânticos.`,'ok');
}

function bind(){
  $('knowledge-hero').addEventListener('change',renderKnowledge);$('passive-form').addEventListener('submit',savePassive);$('passive-reset').addEventListener('click',resetPassive);$('analyzer-run').addEventListener('click',runAnalyzer);$('analyzer-save').addEventListener('click',saveSuggestions);$('counter-compare').addEventListener('click',compareSelected);$('counter-matrix-run').addEventListener('click',runMatrix);$('review-form').addEventListener('submit',saveReview);$('counter-refresh').addEventListener('click',()=>loadData($('knowledge-hero').value));
  document.addEventListener('click',event=>{const skill=event.target.closest('[data-analyze-skill]');if(skill)return analyzeSkill(skill.dataset.analyzeSkill);const passive=event.target.closest('[data-analyze-passive]');if(passive)return analyzePassive(passive.dataset.analyzePassive);const edit=event.target.closest('[data-edit-passive]');if(edit)return editPassive(edit.dataset.editPassive);const del=event.target.closest('[data-delete-passive]');if(del)return removePassive(del.dataset.deletePassive);const fact=event.target.closest('[data-delete-fact]');if(fact)return removeFact(fact.dataset.deleteFact);});
}

async function init(){const user=await supabase.auth.getUser();state.userId=user.data.user?.id||null;bind();await loadData();}
init().catch(error=>message('counter-schema-message',error.message,'error'));
