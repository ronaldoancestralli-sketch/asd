import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
const fmt=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});};
const tierLabel=value=>({member:'Member',echo_scout:'Echo Scout',tracker:'Rastreador',cartographer:'Cartógrafo',analyst:'Analista',vanguard:'Vanguarda',arena_legend:'Lenda da Arena'})[value]||value||'Member';
const badgeLabel=value=>({creator:'Creator verificado',partner:'Echo Partner',moderator:'Moderator',developer:'Developer'})[value]||value;
const badgeDescription=value=>({creator:'Canal de conteúdo com posse verificada.',partner:'Relacionamento oficial com o EchoArena.',moderator:'Nomeação para moderação da comunidade.',developer:'Participação real no desenvolvimento do EchoArena.'})[value]||'';
const state={schemaReady:false,users:[],selectedId:null,identity:null,reputation:null,badges:[],founder:null,claims:[],research:[],confirmations:[],people:new Map()};

function message(id,text='',tone=''){const el=$(id);if(!el)return;el.textContent=text;el.className=`identity-message ${tone}`.trim();}
function safeUrl(value){const s=String(value||'').trim();return /^https:\/\//i.test(s)?s:'';}
function publicName(row){return row?.display_name||row?.username||'Jogador';}
function person(id){return state.people.get(id)||state.users.find(u=>u.id===id)||null;}
function identityName(id){return publicName(person(id));}
function isExpired(value){const d=new Date(value);return Number.isNaN(d.getTime())||d.getTime()<=Date.now();}
function researchObservation(row){const value=row?.payload?.observation;return typeof value==='string'?value.trim().slice(0,3000):'';}
function acceptanceLabel(rep){return Number(rep?.decided_count||0)>0?`${Math.round(Number(rep?.acceptance_rate||0)*100)}%`:'—';}
function researchReviewError(error){
  const raw=String(error?.message||'').toLowerCase();
  if(raw.includes('first_discovery_already_claimed')) return 'Já existe uma primeira descoberta verificada para este conhecimento/patch. Revise o registro existente antes de qualquer correção.';
  if(raw.includes('first_discovery_knowledge_missing')) return 'Este registro ainda não possui identidade canônica de conhecimento. Ele não pode receber Primeira descoberta até ser reconciliado.';
  if(raw.includes('first_discovery_requires_verified')) return 'Primeira descoberta só pode ser atribuída a uma contribuição verificada.';
  if(raw.includes('research_review_no_change')) return 'A decisão é idêntica à revisão atual. Uma nova revisão só é permitida após divergência ou mudança real de estado.';
  if(raw.includes('research_rereview_reason_required')) return 'Toda correção de revisão exige um motivo explícito para o ledger.';
  if(raw.includes('research_review_revision_limited')) return 'O limite de revisões deste registro foi atingido nesta janela. Aguarde antes de tentar novamente.';
  return error?.message||'A revisão não foi confirmada.';
}
function researchConfirmationError(error){
  const raw=String(error?.message||'').toLowerCase();
  if(raw.includes('research_reviewer_cannot_self_confirm')) return 'O revisor primário não pode confirmar a própria decisão. Peça o segundo parecer a outro Admin.';
  if(raw.includes('research_contributor_cannot_confirm')) return 'O autor da contribuição não pode confirmar a decisão sobre o próprio envio.';
  if(raw.includes('self_review_not_confirmation_eligible')) return 'Uma auto-revisão primária é inelegível e nunca pode ser confirmada para reputação.';
  if(raw.includes('research_confirmation_stale_decision')) return 'A decisão mudou enquanto esta fila estava aberta. Recarregue antes de confirmar.';
  if(raw.includes('research_decision_not_awaiting_confirmation')) return 'Esta decisão não aguarda mais confirmação.';
  if(raw.includes('research_decision_already_confirmed')) return 'Este evento já recebeu um segundo parecer imutável.';
  if(raw.includes('research_dispute_reason_required')) return 'Explique a divergência para que a nova revisão seja auditável.';
  return error?.message||'O segundo parecer não foi confirmado.';
}

async function schemaProbe(){
  const [identityProbe,creatorProbe,reputationProbe,guardrailProbe,reviewLedgerProbe]=await Promise.all([
    supabase.from('echo_public_profiles').select('user_id').limit(1),
    supabase.from('echo_creator_claims').select('id,canonical_channel_url').limit(1),
    supabase.from('echo_reputation_policy_meta').select('policy_version').limit(1),
    supabase.from('echo_research_guardrail_policy').select('policy_version,independent_confirmation_required').limit(1),
    supabase.from('echo_research_review_events').select('id,event_hash').limit(1)
  ]);
  const error=identityProbe.error||creatorProbe.error||reputationProbe.error||guardrailProbe.error||reviewLedgerProbe.error;
  if(error){state.schemaReady=false;message('identity-schema-status',`Schema Echo Identity V5 Hardening indisponível neste Supabase: ${error.message}. O laboratório está fail-closed; nenhuma ação será executada.`,'error');return false;}
  const guardrail=guardrailProbe.data?.[0];
  if(!guardrail||guardrail.independent_confirmation_required!==true){state.schemaReady=false;message('identity-schema-status','A política V5 não exige confirmação independente. O laboratório foi bloqueado sem executar ações.','error');return false;}
  state.schemaReady=true;message('identity-schema-status','Schema Echo Identity V5 Hardening disponível · decisões são imutáveis e só afetam reputação após segundo parecer independente.','ok');return true;
}

async function loadUsers(term=''){
  if(!state.schemaReady)return;
  const {data,error}=await supabase.rpc('admin_profiles_page',{p_search:term.trim()||null,p_role:null,p_status:null,p_limit:50,p_offset:0});
  if(error){message('identity-schema-status',error.message,'error');return;}
  state.users=Array.isArray(data?.users)?data.users:[];
  state.users.forEach(u=>state.people.set(u.id,u));
  renderUsers();
  if(state.selectedId&&!state.users.some(u=>u.id===state.selectedId)) state.selectedId=null;
  if(!state.selectedId&&state.users[0]) await selectUser(state.users[0].id);
}

function renderUsers(){
  const wrap=$('identity-users');
  if(!state.users.length){wrap.innerHTML='<p class="identity-empty">Nenhum usuário encontrado.</p>';return;}
  wrap.innerHTML=state.users.map(u=>`<button type="button" class="identity-user ${u.id===state.selectedId?'active':''}" data-user-id="${esc(u.id)}"><strong>${esc(publicName(u))}</strong><span>${esc(u.username?`@${u.username}`:'Sem username legado')} · criado ${esc(fmt(u.created_at))}</span><div class="identity-user-tags"><i class="identity-pill ${u.role==='admin'?'role':''}">${esc(u.role||'user')}</i>${u.is_blocked?'<i class="identity-pill warn">bloqueado</i>':'<i class="identity-pill ok">ativo</i>'}</div></button>`).join('');
  wrap.querySelectorAll('[data-user-id]').forEach(btn=>btn.addEventListener('click',()=>selectUser(btn.dataset.userId)));
}

async function selectUser(userId){
  if(!state.schemaReady)return;state.selectedId=userId;renderUsers();
  const [identity,reputation,badges]=await Promise.all([
    supabase.from('echo_public_profiles').select('user_id,public_handle,bio,profile_accent,profile_visibility,allow_messages,profile_completed_at,handle_changed_at').eq('user_id',userId).maybeSingle(),
    supabase.from('echo_community_reputation').select('user_id,scout_eligible,reputation_points,community_tier,verified_count,corroborated_count,first_discoveries,acceptance_rate,accepted_count,decided_count,policy_version,updated_at').eq('user_id',userId).maybeSingle(),
    supabase.from('echo_identity_badges').select('id,user_id,badge_type,active,reference_url,grant_reason,granted_at,revoked_at').eq('user_id',userId).order('badge_type')
  ]);
  const error=identity.error||reputation.error||badges.error;if(error){message('identity-schema-status',error.message,'error');return;}
  state.identity=identity.data||null;state.reputation=reputation.data||null;state.badges=badges.data||[];
  renderSelected();renderBadges();
}

function renderSelected(){
  const u=state.users.find(x=>x.id===state.selectedId)||person(state.selectedId);
  if(!u){$('identity-selected').innerHTML='<p class="identity-empty">Selecione um usuário.</p>';$('identity-reputation').innerHTML='';return;}
  const profile=state.identity,rep=state.reputation;
  const avatar=safeUrl(u.avatar_url);
  $('identity-selected').innerHTML=`<div class="identity-profile-head"><div class="identity-avatar">${avatar?`<img src="${esc(avatar)}" alt="">`:esc(publicName(u).slice(0,2).toUpperCase())}</div><div class="identity-profile-copy"><strong>${esc(publicName(u))}</strong><b>${profile?.profile_completed_at?`@${esc(profile.public_handle)}`:'Perfil público ainda não concluído'}</b><small>${esc(profile?.profile_visibility||'private')} · accent ${esc(profile?.profile_accent||'—')} · mensagens ${profile?.allow_messages?'aceitas':'desativadas'}</small></div></div><div class="identity-bio">${esc(profile?.bio||'Sem bio pública.')}</div>`;
  if(rep?.scout_eligible===false){
    $('identity-reputation').innerHTML=[
      ['Participação Scout','Não participa'],
      ['Contribuição','Institucional'],
      ['Dados anteriores','Preservados · fora da progressão']
    ].map(([k,v])=>`<div class="identity-stat"><small>${esc(k)}</small><strong>${esc(v)}</strong></div>`).join('');
    return;
  }
  $('identity-reputation').innerHTML=[
    ['Nível',tierLabel(rep?.community_tier)],
    ['Pontos',Number(rep?.reputation_points||0).toLocaleString('pt-BR')],
    ['Taxa',acceptanceLabel(rep)],
    ['Verificadas',Number(rep?.verified_count||0).toLocaleString('pt-BR')],
    ['Corroboradas',Number(rep?.corroborated_count||0).toLocaleString('pt-BR')],
    ['Descobertas',Number(rep?.first_discoveries||0).toLocaleString('pt-BR')],
    ['Política',rep?.policy_version||'—']
  ].map(([k,v])=>`<div class="identity-stat"><small>${esc(k)}</small><strong>${esc(v)}</strong></div>`).join('');
}

function renderBadges(){
  const wrap=$('identity-badges');if(!state.selectedId){wrap.innerHTML='<p class="identity-empty">Selecione um usuário.</p>';return;}
  const active=new Map(state.badges.map(b=>[b.badge_type,b]));
  wrap.innerHTML=['creator','partner','moderator','developer'].map(type=>{
    const row=active.get(type),enabled=row?.active===true;
    const reference=row?.reference_url?`<a href="${esc(safeUrl(row.reference_url))}" target="_blank" rel="noopener noreferrer">Referência verificada ↗</a>`:'';
    let action='';
    if(type==='creator'){
      action=enabled
        ? `<button class="admin-button danger" type="button" data-badge="creator" data-enable="false">Revogar</button>`
        : '<i class="identity-pill">claim verificado obrigatório</i>';
    }else{
      action=`<button class="admin-button ${enabled?'danger':'primary'}" type="button" data-badge="${type}" data-enable="${enabled?'false':'true'}">${enabled?'Revogar':'Conceder'}</button>`;
    }
    return `<div class="identity-badge"><div><strong>${esc(badgeLabel(type))}</strong><span>${esc(badgeDescription(type))}</span>${reference}</div><div class="identity-badge-row"><i class="identity-pill ${enabled?'ok':''}">${enabled?'ativo':'inativo'}</i>${action}</div></div>`;
  }).join('');
  wrap.querySelectorAll('[data-badge]').forEach(btn=>btn.addEventListener('click',()=>setBadge(btn.dataset.badge,btn.dataset.enable==='true')));
}

async function setBadge(type,enabled){
  if(!state.selectedId||!state.schemaReady)return;
  if(type==='creator'&&enabled)return message('identity-badge-message','Creator só pode ser concedido pela revisão de um claim válido.','error');
  const reason=window.prompt(`${enabled?'Conceder':'Revogar'} ${badgeLabel(type)}. Informe o motivo para auditoria:`,'');
  if(reason===null)return;if(!reason.trim())return message('identity-badge-message','Motivo obrigatório para auditoria.','error');
  let reference=null;if(enabled&&type==='partner'){reference=window.prompt('URL HTTPS de referência (opcional):','')||null;if(reference&&!safeUrl(reference))return message('identity-badge-message','A referência precisa usar HTTPS.','error');}
  if(!window.confirm(`${enabled?'Conceder':'Revogar'} ${badgeLabel(type)} para ${identityName(state.selectedId)}?`))return;
  const {error}=await supabase.rpc('admin_set_identity_badge_v1',{p_user_id:state.selectedId,p_badge_type:type,p_active:enabled,p_reason:reason.trim(),p_reference_url:reference});
  if(error)return message('identity-badge-message',error.message,'error');message('identity-badge-message','Reconhecimento institucional atualizado e auditado.','ok');await selectUser(state.selectedId);
}

async function loadFounder(){
  if(!state.schemaReady)return;
  const {data,error}=await supabase.rpc('admin_identity_founder_status_v1');
  if(error){$('identity-founder').innerHTML=`<p class="identity-empty">${esc(error.message)}</p>`;return;}
  state.founder=data||null;const id=data?.user_id||null;
  if(id&&!person(id)){
    const {data:rows}=await supabase.from('profiles').select('id,username,display_name,avatar_url').eq('id',id).limit(1);(rows||[]).forEach(row=>state.people.set(row.id,row));
  }
  $('identity-founder').innerHTML=id?`<div class="identity-founder-card"><strong>✦ ${esc(identityName(id))} · FOUNDER</strong><span>Autoridade singleton configurada · edição indisponível neste painel</span></div>`:'<div class="identity-founder-card"><strong>Founder ainda não configurado neste backend</strong><span>A configuração deverá ocorrer por operação server-side deliberada no projeto correto.</span></div>';
}

async function loadQueues(){
  if(!state.schemaReady)return;
  const [claims,pendingQueue,confirmationQueue]=await Promise.all([
    supabase.from('echo_creator_claims').select('id,user_id,platform,channel_url,canonical_channel_url,proof_code,status,requested_at,expires_at').eq('status','pending').order('requested_at').limit(60),
    supabase.rpc('admin_research_review_queue_v5',{p_queue:'pending',p_limit:80}),
    supabase.rpc('admin_research_review_queue_v5',{p_queue:'confirmation',p_limit:80})
  ]);
  const error=claims.error||pendingQueue.error||confirmationQueue.error;if(error){message('identity-schema-status',error.message,'error');return;}
  state.claims=claims.data||[];
  state.research=Array.isArray(pendingQueue.data)?pendingQueue.data:[];
  state.confirmations=Array.isArray(confirmationQueue.data)?confirmationQueue.data:[];
  const ids=[...new Set([...state.claims.map(x=>x.user_id),...state.research.map(x=>x.contributor_id),...state.confirmations.flatMap(x=>[x.contributor_id,x.reviewed_by])].filter(Boolean))];
  if(ids.length){const {data}=await supabase.from('profiles').select('id,username,display_name,avatar_url').in('id',ids);(data||[]).forEach(row=>state.people.set(row.id,row));}
  renderClaims();renderResearch();renderConfirmations();
}

function renderClaims(){
  $('identity-creator-count').textContent=String(state.claims.length);const wrap=$('identity-creator-claims');
  if(!state.claims.length){wrap.innerHTML='<p class="identity-empty">Nenhum pedido pendente.</p>';return;}
  wrap.innerHTML=state.claims.map(c=>{
    const original=safeUrl(c.channel_url),canonical=safeUrl(c.canonical_channel_url),expired=isExpired(c.expires_at);
    const canVerify=Boolean(canonical&&!expired);
    const canonicalLine=canonical&&canonical!==original?`<p><b>Canônica:</b> ${esc(canonical)}</p>`:'';
    const openLink=canonical?`<a class="admin-button" href="${esc(canonical)}" target="_blank" rel="noopener noreferrer">Abrir canal canônico ↗</a>`:'';
    const verify=canVerify?`<button class="admin-button primary" type="button" data-claim="${esc(c.id)}" data-decision="verified">Verificar</button>`:'<i class="identity-pill warn">reemitir antes de verificar</i>';
    return `<article class="identity-queue-item"><header><strong>${esc(identityName(c.user_id))} · ${esc(c.platform)}</strong><span>${esc(fmt(c.requested_at))}</span></header><p><b>Enviada:</b> ${esc(c.channel_url)}</p>${canonicalLine}<code class="identity-proof">${esc(c.proof_code)}</code><p>Expira: ${esc(fmt(c.expires_at))}</p><div class="identity-actions-row">${openLink}${verify}<button class="admin-button danger" type="button" data-claim="${esc(c.id)}" data-decision="rejected">Rejeitar</button></div></article>`;
  }).join('');
  wrap.querySelectorAll('[data-claim]').forEach(btn=>btn.addEventListener('click',()=>reviewClaim(btn.dataset.claim,btn.dataset.decision)));
}
async function reviewClaim(id,decision){
  const row=state.claims.find(x=>x.id===id);if(!row)return;
  if(decision==='verified'&&(!safeUrl(row.canonical_channel_url)||isExpired(row.expires_at)))return message('identity-schema-status','Este claim precisa ser reemitido ou ainda não possui URL canônica válida.','error');
  const note=window.prompt(`Observação da revisão de ${identityName(row.user_id)}:`,decision==='verified'?'Código confirmado no canal canônico informado.':'');if(note===null)return;
  if(!window.confirm(`${decision==='verified'?'VERIFICAR':'REJEITAR'} este pedido de Creator?`))return;
  const {error}=await supabase.rpc('admin_review_creator_claim_v1',{p_claim_id:id,p_decision:decision,p_note:note.trim()||null});if(error)return message('identity-schema-status',error.message,'error');message('identity-schema-status',decision==='verified'?'Creator verificado pelo claim; badge institucional concedido e auditado.':'Pedido de Creator rejeitado.','ok');await Promise.all([loadQueues(),state.selectedId?selectUser(state.selectedId):Promise.resolve()]);
}

function renderResearch(){
  $('identity-research-count').textContent=String(state.research.length);const wrap=$('identity-research-queue');
  if(!state.research.length){wrap.innerHTML='<p class="identity-empty">Nenhuma evidência pendente.</p>';return;}
  wrap.innerHTML=state.research.map(c=>{
    const url=safeUrl(c.evidence_reference),observation=researchObservation(c);
    const observationLine=observation?`<p><b>Observação:</b> ${esc(observation)}</p>`:'<p><b>Observação:</b> não informada.</p>';
    return `<article class="identity-queue-item"><header><strong>${esc(identityName(c.contributor_id))} · ${esc(c.contribution_type)}</strong><span>${esc(fmt(c.submitted_at))}</span></header><p><b>${esc(c.subject_key)}</b>${c.game_version?` · patch ${esc(c.game_version)}`:''}</p>${observationLine}<p>Evidência: ${esc(c.evidence_kind)}${c.evidence_reference?` · ${esc(c.evidence_reference)}`:''}</p><div class="identity-actions-row">${url?`<a class="admin-button" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Abrir evidência ↗</a>`:''}<button class="admin-button" type="button" data-research="${esc(c.id)}" data-status="corroborated">Corroborar</button><button class="admin-button primary" type="button" data-research="${esc(c.id)}" data-status="verified">Verificar</button><button class="admin-button danger" type="button" data-research="${esc(c.id)}" data-status="rejected">Rejeitar</button><button class="admin-button" type="button" data-research="${esc(c.id)}" data-status="contested">Contestar</button></div></article>`;
  }).join('');
  wrap.querySelectorAll('[data-research]').forEach(btn=>btn.addEventListener('click',()=>reviewResearch(btn.dataset.research,btn.dataset.status)));
}
async function reviewResearch(id,status){
  const row=state.research.find(x=>x.id===id);if(!row)return;let first=false;if(status==='verified')first=window.confirm('Esta é a primeira descoberta válida deste dado/patch?\nOK = marcar como primeira descoberta; Cancelar = verificar normalmente.');
  const note=window.prompt('Nota da revisão (opcional):','');if(note===null)return;if(!window.confirm(`Salvar revisão como ${status}${first?' + PRIMEIRA DESCOBERTA':''}?`))return;
  const {error}=await supabase.rpc('admin_review_research_contribution_v1',{p_contribution_id:id,p_status:status,p_note:note.trim()||null,p_first_discovery:first});
  if(error)return message('identity-schema-status',researchReviewError(error),'error');
  message('identity-schema-status','Decisão primária registrada no ledger. Ela não pontua até outro Admin emitir o segundo parecer.','ok');await Promise.all([loadQueues(),state.selectedId?selectUser(state.selectedId):Promise.resolve()]);
}

function renderConfirmations(){
  $('identity-confirmation-count').textContent=String(state.confirmations.length);const wrap=$('identity-review-confirmations');
  if(!state.confirmations.length){wrap.innerHTML='<p class="identity-empty">Nenhuma decisão aguardando segundo parecer.</p>';return;}
  wrap.innerHTML=state.confirmations.map(c=>{
    const url=safeUrl(c.evidence_reference),observation=researchObservation(c);
    const first=c.is_first_discovery?' · candidata a PRIMEIRA DESCOBERTA':'';
    return `<article class="identity-queue-item awaiting-confirmation"><header><strong>${esc(identityName(c.contributor_id))} · ${esc(c.contribution_type)}</strong><span>decisão ${esc(fmt(c.reviewed_at))}</span></header><p><b>${esc(c.subject_key)}</b>${c.game_version?` · patch ${esc(c.game_version)}`:''}</p><p><b>Observação:</b> ${esc(observation||'não informada')}</p><p>Evidência: ${esc(c.evidence_kind)}${c.evidence_reference?` · ${esc(c.evidence_reference)}`:''}</p><div class="identity-confirmation-meta"><i class="identity-pill primary-review">${esc(c.status)}${esc(first)}</i><i class="identity-pill">revisão ${esc(c.review_revision)}</i><i class="identity-pill">1º parecer: ${esc(identityName(c.reviewed_by))}</i></div><div class="identity-actions-row">${url?`<a class="admin-button" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Abrir evidência ↗</a>`:''}<button class="admin-button primary" type="button" data-confirm-research="${esc(c.id)}" data-event="${esc(c.current_review_event_id)}" data-outcome="confirmed">Confirmar decisão</button><button class="admin-button danger" type="button" data-confirm-research="${esc(c.id)}" data-event="${esc(c.current_review_event_id)}" data-outcome="disputed">Registrar divergência</button></div></article>`;
  }).join('');
  wrap.querySelectorAll('[data-confirm-research]').forEach(btn=>btn.addEventListener('click',()=>confirmResearch(btn.dataset.confirmResearch,btn.dataset.event,btn.dataset.outcome)));
}

async function confirmResearch(contributionId,eventId,outcome){
  const row=state.confirmations.find(x=>x.id===contributionId&&String(x.current_review_event_id)===String(eventId));if(!row)return;
  const promptText=outcome==='disputed'?'Explique a divergência (obrigatório):':'Observação do segundo parecer (opcional):';
  const note=window.prompt(promptText,'');if(note===null)return;
  if(outcome==='disputed'&&!note.trim())return message('identity-schema-status','A divergência exige um motivo auditável.','error');
  const action=outcome==='confirmed'?'CONFIRMAR':'DIVERGIR DE';
  if(!window.confirm(`${action} a decisão ${row.status} registrada por ${identityName(row.reviewed_by)}?`))return;
  const {error}=await supabase.rpc('admin_confirm_research_review_v1',{p_contribution_id:contributionId,p_decision_event_id:eventId,p_outcome:outcome,p_note:note.trim()||null});
  if(error)return message('identity-schema-status',researchConfirmationError(error),'error');
  message('identity-schema-status',outcome==='confirmed'?'Segundo parecer confirmado. O efeito atual foi recalculado pelo servidor a partir deste evento imutável.':'Divergência registrada. O evento não pontua e exige nova decisão primária auditada.','ok');
  await Promise.all([loadQueues(),state.selectedId?selectUser(state.selectedId):Promise.resolve()]);
}

let searchTimer=0;function bind(){
  $('identity-refresh').addEventListener('click',loadAll);$('identity-user-search').addEventListener('input',event=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadUsers(event.target.value),250);});
}
async function loadAll(){
  if(!await schemaProbe())return;await Promise.all([loadUsers($('identity-user-search').value||''),loadFounder(),loadQueues()]);
}
bind();loadAll().catch(error=>message('identity-schema-status',error.message,'error'));
