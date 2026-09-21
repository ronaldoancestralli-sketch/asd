import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import { missionProgress } from './my-profile-experience-v7.js?v=20260825-identity-experience-v7-1';

const $ = (id) => document.getElementById(id);
const ICONS = { signal:'◎',verified:'◆',notebook:'▤',compass:'✦',discovery:'◇',map:'⌁' };

function element(tag,className,text) {
  const node=document.createElement(tag);
  if(className) node.className=className;
  if(text!==undefined) node.textContent=String(text);
  return node;
}

function integer(value) {
  const parsed=Number(value);
  return Number.isInteger(parsed)&&parsed>=0?parsed:null;
}

function unavailable(text) {
  const state=$('research-v5-state');
  const content=$('research-v5-content');
  if(!state||!content) return;
  state.hidden=false;
  state.className='research-v5-state is-error';
  state.textContent=text;
  content.hidden=true;
}

function guardrailCard(label,value,detail,attention=false) {
  const card=element('article',`research-v5-guardrail${attention?' attention':''}`);
  card.append(element('small','',label),element('strong','',value),element('span','',detail));
  return card;
}

function renderGuardrails(policy) {
  const maxWindow=integer(policy.max_submissions_per_window);
  const usedWindow=integer(policy.submissions_in_window);
  const remainingWindow=integer(policy.submissions_remaining);
  const maxPending=integer(policy.max_pending_per_member);
  const pending=integer(policy.pending_total);
  const pendingRemaining=integer(policy.pending_capacity_remaining);
  const awaiting=integer(policy.awaiting_independent_confirmation);
  const windowMinutes=integer(policy.submission_window_minutes);
  if([maxWindow,usedWindow,remainingWindow,maxPending,pending,pendingRemaining,awaiting,windowMinutes].some((value)=>value===null)||windowMinutes<1) {
    throw new Error('invalid_guardrail_contract');
  }
  const windowHours=Math.max(1,Math.round(windowMinutes/60));
  const root=$('research-v5-guardrails'); root.replaceChildren();
  root.append(
    guardrailCard('JANELA DE ENVIO',`${remainingWindow} de ${maxWindow}`,`${usedWindow} usados nas últimas ${windowHours}h`,remainingWindow===0),
    guardrailCard('CAPACIDADE DA FILA',`${pendingRemaining} de ${maxPending}`,`${pending} contribuições ainda pendentes`,pendingRemaining===0),
    guardrailCard('SEGUNDA CONFIRMAÇÃO',String(awaiting),awaiting===1?'decisão aguardando outro Admin':'decisões aguardando outro Admin',awaiting>0)
  );
}

function renderMissions(rows) {
  const root=$('research-v5-missions'); root.replaceChildren();
  if(!Array.isArray(rows)||!rows.length) throw new Error('empty_mission_contract');
  for(const mission of rows) {
    const current=integer(mission.current_value);
    const target=integer(mission.target_value);
    if(current===null||target===null||target<1||mission.awards_reputation!==false) throw new Error('invalid_mission_contract');
    const progressState=missionProgress(current,target,mission.completed===true);
    if(!progressState) throw new Error('invalid_mission_progress');
    const complete=progressState.isComplete;
    const card=element('article',`research-v5-mission${complete?' is-complete':''}`);
    card.dataset.state=progressState.state;
    const icon=element('span','research-v5-mission-icon',complete?'✓':(ICONS[mission.icon_key]||'·'));
    icon.setAttribute('aria-hidden','true');
    const copy=element('div','research-v5-mission-copy');
    const title=element('div','research-v5-mission-title');
    title.append(element('strong','',mission.title||'Missão'),element('small','',complete?'CONCLUÍDA':`${progressState.value}/${progressState.target}`));
    const description=element('p','',mission.description||'Progresso calculado pelo servidor.');
    const progress=element('progress');
    progress.max=progressState.target; progress.value=progressState.value;
    progress.setAttribute('aria-label',`${mission.title||'Missão'}: ${progressState.value} de ${progressState.target}`);
    const meta=element('div','identity-v7-mission-meta');
    meta.append(element('span','',complete?'Progresso confirmado':`${progressState.percent}% do objetivo`),element('span','','0 pontos próprios'));
    copy.append(title,description,progress,meta); card.append(icon,copy); root.appendChild(card);
  }
}

async function loadProgress() {
  if(!$('my-research-v5')) return;
  const auth=await supabase.auth.getUser();
  if(auth.error||!auth.data?.user) return unavailable('Entre na sua conta para consultar missões e limites pessoais. Nenhum progresso foi presumido.');
  const [guardrailsResult,missionsResult]=await Promise.all([
    supabase.rpc('echo_my_research_guardrails_v5'),
    supabase.rpc('echo_my_research_missions_v5')
  ]);
  if(guardrailsResult.error||missionsResult.error) {
    return unavailable('Echo Field Ops V5 ainda não está disponível neste backend. Nenhum limite ou progresso provisório foi inventado.');
  }
  const policy=guardrailsResult.data;
  const missions=missionsResult.data;
  if(!policy||typeof policy!=='object'||policy.independent_confirmation_required!==true||policy.missions_award_reputation!==false) {
    return unavailable('O contrato de segurança V5 não pôde ser confirmado. As missões permanecerão ocultas até a política correta estar ativa.');
  }
  try {
    renderGuardrails(policy); renderMissions(missions);
  } catch {
    return unavailable('O servidor retornou um progresso incompleto. Nenhum valor inconsistente será exibido.');
  }
  $('research-v5-policy').textContent=`POLÍTICA ${String(policy.policy_version||'V5').toUpperCase()}`;
  $('research-v5-state').hidden=true;
  $('research-v5-content').hidden=false;
}

loadProgress().catch(()=>unavailable('Não foi possível confirmar o progresso agora. Tente novamente mais tarde; nenhum valor foi alterado.'));
