import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import { activateOwnIdentityAuthorityV10 } from './my-profile-authority-v10.js?v=20260905-institutional-scout-exclusion-v15-3&sb=20260823-security-supabase-pin-1';

const RANK_ORDER=['none','specialist','reference','master'];
const RANK_LABELS={none:'Em construção',specialist:'Especialista',reference:'Referência',master:'Mestre'};
const SPECIALTY_EXPLAINERS={
  hero_research:{glyph:'◎',short:'Pesquisa de Heróis',description:'Dados verificados de heróis, habilidades, passivas e níveis.'},
  arsenal:{glyph:'◇',short:'Arsenal',description:'Estatísticas e mudanças verificadas de equipamentos.'},
  patch_hunter:{glyph:'↯',short:'Caçador de Patch',description:'Mudanças de patch confirmadas antes de virarem conhecimento consolidado.'},
  counter_research:{glyph:'⇄',short:'Counter Research',description:'Pesquisa de matchups: evidências verificadas de como heróis, habilidades ou equipamentos interagem, dependem uns dos outros ou funcionam como counter em condições específicas.'}
};
const PREVIEW_PLACEMENT_MEDIA=window.matchMedia('(max-width: 900px)');
const EDITOR_PREVIEW_STYLESHEET='./css/my-profile-editor-preview-v12.css?v=20260826-identity-editor-preview-v14-1';
let editorPreviewObserver=null;

function number(value){return Number(value||0).toLocaleString('pt-BR');}
function percent(value,decided){if(!Number(decided||0))return '—';const n=Number(value);return Number.isFinite(n)?`${Math.round(n*100)}%`:'—';}
function make(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}

function ensureEditorPreviewStyles(){
  if(document.querySelector('link[data-identity-editor-preview-v12]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href=EDITOR_PREVIEW_STYLESHEET;
  link.dataset.identityEditorPreviewV12='true';
  document.head.appendChild(link);
}

function syncCollectionPreviewPlacement(){
  const preview=document.getElementById('identity-v7-preview');
  const journey=document.querySelector('.identity-v7-journey');
  const track=document.getElementById('my-scout-track');
  const layout=document.getElementById('my-profile-editor');
  if(!preview||!journey||!track||!layout)return;
  if(preview.dataset.sharedProfileReady==='true'){
    if(layout.firstElementChild!==preview)layout.prepend(preview);
    return;
  }

  if(PREVIEW_PLACEMENT_MEDIA.matches){
    if(preview.parentElement!==journey||preview.nextElementSibling!==track)journey.insertBefore(preview,track);
    return;
  }

  if(preview.parentElement!==layout)layout.appendChild(preview);
}

function sanitizeEditorPreviewMirror(mirror){
  mirror.removeAttribute('id');
  mirror.dataset.previewMirror='editor';
  mirror.classList.add('identity-v7-editor-preview');
  mirror.setAttribute('aria-hidden','true');
  mirror.querySelectorAll('[id]').forEach((node)=>{
    node.dataset.previewMirrorId=node.id;
    node.removeAttribute('id');
  });
  mirror.querySelector('[data-preview-mirror-id="identity-v8-showroom"]')?.remove();
  mirror.querySelectorAll('a,button,input,select,textarea').forEach((node)=>{
    node.setAttribute('tabindex','-1');
    node.setAttribute('aria-hidden','true');
    if(node.tagName==='A')node.removeAttribute('href');
    if('disabled' in node)node.disabled=true;
  });
  const note=mirror.querySelector('.identity-v7-preview-note');
  if(note)note.textContent='Esta prévia acompanha o que você digita. Apelido e nome ficam sempre acima dela no celular, sem sobreposição.';
  return mirror;
}

function refreshEditorPreviewMirror(){
  const existing=document.querySelector('[data-preview-mirror="editor"]');
  if(document.getElementById('identity-v7-preview')?.dataset.sharedProfileReady==='true'){existing?.remove();return;}
  if(!PREVIEW_PLACEMENT_MEDIA.matches){existing?.remove();return;}
  const source=document.getElementById('identity-v7-preview');
  const form=document.getElementById('my-profile-form');
  const identityFields=form?.querySelector('.my-profile-grid');
  if(!source||!form||!identityFields)return;
  const mirror=sanitizeEditorPreviewMirror(source.cloneNode(true));
  if(existing)existing.replaceWith(mirror);
  identityFields.after(mirror);
}

function syncPreviewExperience(){
  syncCollectionPreviewPlacement();
  refreshEditorPreviewMirror();
}

function initPreviewExperience(){
  ensureEditorPreviewStyles();
  syncPreviewExperience();
  const source=document.getElementById('identity-v7-preview');
  if(source){
    editorPreviewObserver?.disconnect();
    editorPreviewObserver=new MutationObserver(refreshEditorPreviewMirror);
    editorPreviewObserver.observe(source,{subtree:true,childList:true,characterData:true,attributes:true});
  }
  const onBreakpointChange=()=>syncPreviewExperience();
  if(typeof PREVIEW_PLACEMENT_MEDIA.addEventListener==='function'){
    PREVIEW_PLACEMENT_MEDIA.addEventListener('change',onBreakpointChange);
  }else if(typeof PREVIEW_PLACEMENT_MEDIA.addListener==='function'){
    PREVIEW_PLACEMENT_MEDIA.addListener(onBreakpointChange);
  }
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initPreviewExperience,{once:true});
else initPreviewExperience();

function makeGuide(){
  const guide=make('section','my-specialties-guide');
  guide.setAttribute('aria-label','Como funcionam as especialidades');
  const head=make('div','my-specialties-guide-head');
  const title=make('div');title.append(make('small','','ANTES DOS NÚMEROS'),make('strong','','O que significa cada área?'));
  head.append(title,make('p','','Você sobe de rank dentro de uma área quando conhecimento daquela categoria é revisado e confirmado. Enviar por si só não vale pontos.'));
  const grid=make('div','my-specialties-guide-grid');
  for(const key of ['hero_research','arsenal','patch_hunter','counter_research']){
    const info=SPECIALTY_EXPLAINERS[key];
    const item=make('article',`my-specialties-guide-item${key==='counter_research'?' is-counter':''}`);
    item.append(make('b','',`${info.glyph} ${info.short}`),make('span','',info.description));grid.appendChild(item);
  }
  const legend=make('div','my-specialties-legend');
  legend.append(
    make('span','','Verificada = evidência confirmada por revisão independente'),
    make('span','','Corroborada = evidência aceita como plausível e confirmada'),
    make('span','','Aceitação = proporção das decisões aceitas'),
    make('span','','Rank = Especialista → Referência → Mestre')
  );
  guide.append(head,grid,legend);return guide;
}

function ensureSection(){
  const scout=document.querySelector('.my-profile-section[aria-labelledby="scout-title"]');
  if(!scout)return null;
  let root=document.getElementById('my-specialties');
  if(root)return root;
  root=make('div','my-specialties');root.id='my-specialties';
  root.setAttribute('data-rank-order','server-policy');
  root.setAttribute('data-specialty-policy','specialty-v1-shadow');
  const head=make('div','my-specialties-head');
  const copy=make('div');
  copy.append(make('span','my-profile-kicker','ESPECIALIDADES CONQUISTADAS'),make('h3','','Domínio por área'));
  head.append(copy,make('p','','Especialidade vem de conhecimento revisado naquela área. Ela não altera cargos, permissões ou autoridade institucional.'));
  const grid=make('div','my-specialties-grid');grid.id='my-specialties-grid';
  root.append(head,makeGuide(),grid);
  scout.appendChild(root);
  return root;
}

function renderUnavailable(){
  const root=ensureSection();if(!root)return;
  root.hidden=false;
  const grid=document.getElementById('my-specialties-grid');grid.replaceChildren();
  const state=make('div','my-profile-locked');
  state.append(make('strong','','Especialidades indisponíveis agora.'),make('span','','A consulta ao servidor falhou; nenhuma ausência, rank ou progresso foi presumido.'));
  grid.appendChild(state);
}

function nextRuleFor(specialtyKey,currentRank,rules){
  const currentIndex=RANK_ORDER.indexOf(currentRank);
  const nextKey=RANK_ORDER[currentIndex+1];
  if(!nextKey)return null;
  return rules.find((r)=>r.specialty_key===specialtyKey&&r.rank_key===nextKey)||null;
}

function progressToRule(stat,rule){
  if(!rule)return 100;
  const ratios=[];
  const minPoints=Number(rule.min_points||0);const minVerified=Number(rule.min_verified||0);const minRate=Number(rule.min_acceptance_rate||0);
  if(minPoints>0)ratios.push(Number(stat?.specialty_points||0)/minPoints);
  if(minVerified>0)ratios.push(Number(stat?.verified_count||0)/minVerified);
  if(minRate>0)ratios.push(Number(stat?.acceptance_rate||0)/minRate);
  if(!ratios.length)return 100;
  return Math.max(0,Math.min(100,Math.round(Math.min(...ratios)*100)));
}

function render(catalog,stats,rules){
  const root=ensureSection();if(!root)return;
  const grid=document.getElementById('my-specialties-grid');grid.replaceChildren();
  const statsMap=new Map((stats||[]).map((row)=>[row.specialty_key,row]));
  const ordered=(catalog||[]).slice().sort((a,b)=>String(a.label||'').localeCompare(String(b.label||''),'pt-BR'));
  if(!ordered.length){root.hidden=true;return;}root.hidden=false;

  for(const item of ordered){
    const stat=statsMap.get(item.specialty_key)||null;
    const rank=stat?.earned_rank||'none';
    const info=SPECIALTY_EXPLAINERS[item.specialty_key]||{glyph:'•',description:item.description||''};
    const card=make('article',`my-specialty-card rank-${rank}`);card.dataset.specialty=item.specialty_key;
    const top=make('div','my-specialty-top');
    const title=make('div','my-specialty-title');
    title.append(make('span','my-specialty-icon',info.glyph||'•'));
    const titleCopy=make('div','my-specialty-title-copy');titleCopy.append(make('small','',String(item.icon_key||'').toUpperCase()),make('strong','',item.label||item.specialty_key));title.appendChild(titleCopy);
    const pill=make('span','my-specialty-rank',RANK_LABELS[rank]||rank);
    top.append(title,pill);
    card.append(top,make('p','my-specialty-description',info.description||item.description||''));

    const rule=nextRuleFor(item.specialty_key,rank,rules||[]);
    const progress=make('div','my-specialty-progress');
    const progressCopy=make('div','my-specialty-progress-copy');
    const progressValue=rank==='master'?100:progressToRule(stat,rule);
    progressCopy.append(make('span','',rank==='master'?'DOMÍNIO MÁXIMO':'PROGRESSO PARA O PRÓXIMO RANK'),make('strong','',`${progressValue}%`));
    const track=make('div','my-specialty-progress-track');const fill=make('i');fill.style.width=`${progressValue}%`;track.appendChild(fill);progress.append(progressCopy,track);card.appendChild(progress);

    const metrics=make('div','my-specialty-metrics');
    const values=[['PONTOS',stat?number(stat.specialty_points):'0'],['VERIFICADAS',stat?number(stat.verified_count):'0'],['CORROBORADAS',stat?number(stat.corroborated_count):'0'],['ACEITAÇÃO',stat?percent(stat.acceptance_rate,stat.decided_count):'—']];
    for(const [label,value] of values){const box=make('div');box.append(make('small','',label),make('strong','',value));metrics.appendChild(box);}card.appendChild(metrics);

    const next=make('div','my-specialty-next');
    if(!rule){
      next.textContent=rank==='master'?'Você alcançou o reconhecimento máximo desta especialidade.':'A próxima regra ainda não está disponível no servidor.';
    }else{
      const missing=[];
      const points=Math.max(0,Number(rule.min_points||0)-Number(stat?.specialty_points||0));
      const verified=Math.max(0,Number(rule.min_verified||0)-Number(stat?.verified_count||0));
      const minRate=Number(rule.min_acceptance_rate||0);const currentRate=Number(stat?.acceptance_rate||0);
      if(points)missing.push(`${number(points)} pontos`);
      if(verified)missing.push(`${number(verified)} verificadas`);
      if(minRate>0&&currentRate<minRate)missing.push(`aceitação ${Math.round(minRate*100)}%`);
      next.textContent=`Próximo: ${rule.rank_label||RANK_LABELS[rule.rank_key]||rule.rank_key}${missing.length?` · falta ${missing.join(' · ')}`:' · requisitos atuais atendidos'}.`;
    }
    card.appendChild(next);grid.appendChild(card);
  }
}

async function load(){
  const {data:userData,error:userError}=await supabase.auth.getUser();
  if(userError||!userData?.user)return;
  const userId=userData.user.id;
  const [catalogResult,statsResult,rulesResult]=await Promise.all([
    supabase.from('echo_community_specialty_catalog').select('specialty_key,label,description,icon_key,active').eq('active',true),
    supabase.from('echo_community_specialty_stats').select('specialty_key,specialty_points,verified_count,corroborated_count,first_discoveries,accepted_count,decided_count,acceptance_rate,earned_rank,policy_version').eq('user_id',userId),
    supabase.from('echo_community_specialty_rules').select('specialty_key,rank_key,rank_label,ordinal,min_points,min_verified,min_acceptance_rate,policy_version').eq('policy_version','specialty-v1-shadow').order('ordinal',{ascending:true})
  ]);
  if(catalogResult.error||statsResult.error||rulesResult.error){renderUnavailable();return;}
  render(catalogResult.data||[],statsResult.data||[],rulesResult.data||[]);
}

void activateOwnIdentityAuthorityV10().catch(()=>{});
load().catch(renderUnavailable);
