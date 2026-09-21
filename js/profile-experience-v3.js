import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import { renderProfileDossier } from './echo-profile-dossier-v15.js?v=20260905-institutional-scout-exclusion-v15-3';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
const safeUrl=value=>{const s=String(value||'').trim();return /^https:\/\//i.test(s)?s:'';};
const fmtDate=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'});};
const number=value=>Number(value||0).toLocaleString('pt-BR');
const handlePattern=/^[a-z0-9](?:[a-z0-9._-]{1,22}[a-z0-9])$/;
const frameAllowlist=new Set([
  'authority-founder','authority-admin','authority-developer','authority-moderator','authority-partner','authority-creator',
  'scout-member','scout-echo_scout','scout-tracker','scout-cartographer','scout-analyst','scout-vanguard','scout-arena_legend'
]);
const accentAllowlist=new Set(['violet','cyan','gold','emerald','rose','steel']);
const accentLabels={violet:'Violeta',cyan:'Ciano',gold:'Dourado',emerald:'Esmeralda',rose:'Rosa',steel:'Aço'};
const badgeLabels={creator:'Creator',partner:'Partner',moderator:'Moderator',developer:'Developer'};
const contributionLabels={hero_skill_level:'Habilidade de herói',hero_passive:'Passiva de herói',hero_skill_audit:'Auditoria de habilidade',equipment_stat:'Equipamento',patch_change:'Mudança de patch',counter_evidence:'Evidência de counter',other:'Pesquisa'};

function setState(title,description){
  $('profile-card').hidden=true;
  $('profile-state').hidden=false;
  $('profile-state').innerHTML=`<span class="profile-kicker">ECHO IDENTITY</span><h1>${esc(title)}</h1><p>${esc(description)}</p>`;
}

function initials(name){
  return String(name||'EA').trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase()||'EA';
}

function renderAvatar(identity){
  const avatar=safeUrl(identity.avatar_url);
  $('profile-avatar').innerHTML=avatar?`<img src="${esc(avatar)}" alt="Avatar de ${esc(identity.display_name||identity.public_handle||'jogador')}">`:esc(initials(identity.display_name||identity.public_handle));
}

function renderAuthority(visual){
  const authority=String(visual?.authority||'member');
  if(authority==='member'){$('profile-authority').innerHTML='';return;}
  $('profile-authority').innerHTML=`<span class="profile-authority-badge">${esc(visual.authority_label||authority)}</span>`;
}

function renderBadges(identity){
  const badges=Array.isArray(identity.institutional_badges)?identity.institutional_badges:[];
  $('profile-badges').innerHTML=badges.map(value=>`<span class="profile-badge">${esc(badgeLabels[value]||value)}</span>`).join('');
}

function renderPersonalAccent(identity){
  const requested=String(identity?.profile_accent||'violet').toLowerCase();
  const accent=accentAllowlist.has(requested)?requested:'violet';
  const el=$('profile-personal-accent');
  el.className=`profile-personal-accent accent-${accent}`;
  el.textContent=`Acento pessoal · ${accentLabels[accent]}`;
}

function renderHistory(rows){
  const wrap=$('profile-history');
  if(!Array.isArray(rows)||!rows.length){wrap.innerHTML='<div class="profile-empty">Nenhuma contribuição revisada publicada neste perfil.</div>';return;}
  wrap.innerHTML=rows.map(row=>{
    const label=contributionLabels[row.contribution_type]||'Contribuição';
    const status=row.status==='verified'?'Verificada':'Corroborada';
    return `<article class="profile-history-item"><div><strong>${esc(row.subject_key||label)}</strong><p>${esc(label)}${row.game_version?` · patch ${esc(row.game_version)}`:''}${row.is_first_discovery?' · <span class="profile-history-first">primeira descoberta</span>':''}</p></div><div class="profile-history-meta"><span>${esc(fmtDate(row.submitted_at))}</span><br><i class="profile-history-status">${esc(status)}</i></div></article>`;
  }).join('');
}

function renderProfile(data){
  const identity=data?.identity||{};
  const visual=data?.visual_identity||{};
  const authority=String(visual.authority||identity.institutional_role||'member').toLowerCase();
  const institutional=authority==='founder'||authority==='admin';
  const scoutEligible=!institutional&&data?.scout_eligible!==false&&identity.scout_eligible!==false&&visual.scout_eligible!==false;
  const frame=frameAllowlist.has(String(visual.frame_key||''))?String(visual.frame_key):'scout-member';
  const frameEl=$('profile-frame');
  frameEl.className='profile-dossier-host';
  [...frameEl.classList].filter(name=>name.startsWith('frame-')).forEach(name=>frameEl.classList.remove(name));
  frameEl.classList.add(`frame-${frame}`);
  frameEl.innerHTML=renderProfileDossier(data);
  document.body.dataset.scoutParticipation=scoutEligible?'community':'institutional';
  const progress=document.querySelector('.profile-progress');
  const history=document.querySelector('.profile-history');
  if(progress)progress.hidden=!scoutEligible;
  if(history)history.hidden=!scoutEligible;
  if(scoutEligible){
    $('profile-tier').textContent=visual.community_tier_label||identity.community_tier||'Member';
    $('profile-verified').textContent=number(identity.verified_count);
    $('profile-first').textContent=number(identity.first_discoveries);
    renderHistory(data.recent_contributions);
  }else{
    $('profile-tier').textContent='';
    $('profile-verified').textContent='';
    $('profile-first').textContent='';
    $('profile-history').innerHTML='';
  }

  document.title=`${identity.display_name||identity.public_handle||'Perfil'} — Echo Arena`;
  $('profile-state').hidden=true;
  $('profile-card').hidden=false;
}

async function load(){
  const params=new URLSearchParams(location.search);
  const handle=String(params.get('u')||'').trim().toLowerCase();
  if(!handle){setState('Perfil não informado','Abra um perfil por um handle público válido quando o Echo Identity estiver disponível.');return;}
  if(!handlePattern.test(handle)){setState('Perfil inválido','O identificador informado não possui um formato de perfil válido.');return;}

  const rollout=await supabase.rpc('echo_identity_rollout_status_v1');
  if(rollout.error){setState('Echo Identity em preparação','A experiência de perfis ainda não está disponível neste backend.');return;}
  const gate=rollout.data||{};
  if(!(gate.public_identity_enabled&&gate.public_profiles_enabled&&gate.identity_cards_enabled)){
    setState('Echo Identity em preparação','Os perfis continuam em Shadow e nenhuma identidade pública está exposta.');
    return;
  }

  const result=await supabase.rpc('echo_public_profile_v1',{p_handle:handle});
  if(result.error){setState('Perfil indisponível','Não foi possível abrir este perfil agora.');return;}
  if(!result.data){setState('Perfil não encontrado','Este handle não corresponde a um perfil público disponível.');return;}
  if(result.data.profile_experience_version!=='v3-shadow'){
    setState('Perfil em atualização','A experiência de perfil deste backend ainda não está na versão esperada.');
    return;
  }
  renderProfile(result.data);
}

load().catch(()=>setState('Perfil indisponível','Não foi possível abrir este perfil agora.'));
