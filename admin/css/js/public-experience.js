import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';

const $ = id => document.getElementById(id);
const state = {
  heroes: [], heroView: [], skills: [],
  builds: { total:null, public:null },
  equipments: { total:null, active:null },
  compositions: { total:null, public:null },
  cms: { pages:null, fields:null },
  editorial: { guides:null, guidesPublished:null, news:null, newsPublished:null, tiers:null, tiersPublished:null },
  errors: []
};

function esc(value=''){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function fmt(value){return value===null||value===undefined?'—':new Intl.NumberFormat('pt-BR').format(Number(value));}
function setText(id,value){const node=$(id);if(node)node.textContent=value;}
function mediaById(){return new Map(state.heroView.map(row=>[String(row.id),row]));}
function skillsByHero(){const map=new Map();for(const row of state.skills){if(row.enabled===false)continue;const id=String(row.hero_id||'');map.set(id,(map.get(id)||0)+1);}return map;}

async function count(table, apply=null, column='id'){
  try{
    let query=supabase.from(table).select(column,{count:'exact',head:true});
    if(apply)query=apply(query);
    const {count,error}=await query;
    if(error)throw error;
    return count??0;
  }catch(error){
    state.errors.push(`${table}: ${error.message}`);
    return null;
  }
}

function metric(id,value,tone=''){
  const node=$(id);if(!node)return;
  node.textContent=fmt(value);
  const card=node.closest('.ax-metric');
  if(card){card.classList.remove('good','warn','bad');if(tone)card.classList.add(tone);}
}

function moduleState(id,{label,tone='warn',copy=''}){
  const root=$(id);if(!root)return;
  const chip=root.querySelector('[data-module-state]');
  const text=root.querySelector('[data-module-copy]');
  if(chip){chip.textContent=label;chip.className=`ax-chip ${tone}`.trim();}
  if(text)text.textContent=copy;
}

function renderMetrics(){
  const active=state.heroes.filter(hero=>hero.enabled!==false);
  const viewMap=mediaById();
  const withMedia=active.filter(hero=>{const media=viewMap.get(String(hero.id));return Boolean(media?.card_source&&media?.main_source);}).length;
  const skillCount=state.skills.filter(row=>row.enabled!==false).length;
  metric('ax-active-heroes',active.length,'good');
  metric('ax-media-ready',withMedia,withMedia===active.length?'good':'warn');
  metric('ax-skills',skillCount,skillCount===active.length*4?'good':'warn');
  metric('ax-public-builds',state.builds.public,state.builds.public===null?'warn':'good');
  metric('ax-active-equipments',state.equipments.active,state.equipments.active===null?'warn':'good');
  metric('ax-public-compositions',state.compositions.public,state.compositions.public===null?'warn':(state.compositions.public>0?'good':'warn'));

  const editorialPublished=[state.editorial.guidesPublished,state.editorial.newsPublished,state.editorial.tiersPublished].filter(Number.isFinite).reduce((a,b)=>a+b,0);
  moduleState('ax-module-heroes',{
    label:withMedia===active.length&&skillCount===active.length*4?'Em linha':'Revisar',
    tone:withMedia===active.length&&skillCount===active.length*4?'good':'warn',
    copy:`${active.length} ativos · ${withMedia}/${active.length} com mídia principal + card · ${skillCount} habilidades ativas.`
  });
  moduleState('ax-module-builds',{
    label:state.builds.public===null?'Indisponível':'Sincronizado',tone:state.builds.public===null?'bad':'good',
    copy:`${fmt(state.builds.public)} públicas de ${fmt(state.builds.total)} builds cadastradas.`
  });
  moduleState('ax-module-equipments',{
    label:state.equipments.active===null?'Indisponível':'Sincronizado',tone:state.equipments.active===null?'bad':'good',
    copy:`${fmt(state.equipments.active)} ativos de ${fmt(state.equipments.total)} equipamentos cadastrados.`
  });
  moduleState('ax-module-compositions',{
    label:state.compositions.public>0?'Publicado':'Sem conteúdo público',tone:state.compositions.public>0?'good':'warn',
    copy:`${fmt(state.compositions.public)} públicas de ${fmt(state.compositions.total)} composições. Nenhum trio é inventado para preencher a página.`
  });
  const cmsUnavailable=state.cms.pages===null||state.cms.fields===null;
  moduleState('ax-module-cms',{
    label:cmsUnavailable?'Indisponível':'CMS conectado',tone:cmsUnavailable?'bad':'good',
    copy:`${fmt(state.cms.pages)} páginas registradas · ${fmt(state.cms.fields)} campos editoriais/SEO. Dados dinâmicos continuam nos módulos próprios.`
  });
  moduleState('ax-module-editorial',{
    label:editorialPublished>0?'Há publicações':'Sem publicação',tone:editorialPublished>0?'good':'warn',
    copy:`Guias ${fmt(state.editorial.guidesPublished)}/${fmt(state.editorial.guides)} · Notícias ${fmt(state.editorial.newsPublished)}/${fmt(state.editorial.news)} · Tier Lists ${fmt(state.editorial.tiersPublished)}/${fmt(state.editorial.tiers)}.`
  });
  moduleState('ax-module-compare',{
    label:'Motor preservado',tone:'good',
    copy:'Comparar continua lendo builds reais e o motor existente; o Admin controla os registros de origem, não resultados fabricados.'
  });
}

function renderHeroParity(){
  const host=$('ax-hero-list');if(!host)return;
  const viewMap=mediaById();const skillMap=skillsByHero();
  const rows=state.heroes.slice().sort((a,b)=>Number(a.display_order??999)-Number(b.display_order??999)||String(a.name).localeCompare(String(b.name),'pt-BR'));
  if(!rows.length){host.innerHTML='<div class="ax-note">Nenhum herói cadastrado.</div>';return;}
  host.innerHTML=rows.map(hero=>{
    const media=viewMap.get(String(hero.id));const skillCount=skillMap.get(String(hero.id))||0;
    const mainOk=Boolean(media?.main_source);const cardOk=Boolean(media?.card_source);const enabled=hero.enabled!==false;
    const image=media?.card_source||media?.main_source||'';
    return `<article class="ax-hero-row" data-hero-id="${esc(hero.id)}">
      <div class="ax-hero-media ${image?'':'empty'}">${image?`<img src="${esc(image)}" alt="${esc(hero.name||'')}" loading="lazy">`:''}</div>
      <div class="ax-hero-row-body">
        <h4>${esc(hero.name||'Sem nome')}</h4><p>${esc(media?.class_name||hero.slug||'')}</p>
        <div class="ax-hero-flags">
          <span class="${enabled?'ok':'warn'}">${enabled?'Ativo':'Inativo'}</span>
          <span class="${mainOk?'ok':'warn'}">Main ${mainOk?'✓':'—'}</span>
          <span class="${cardOk?'ok':'warn'}">Card ${cardOk?'✓':'—'}</span>
          <span class="${skillCount===4?'ok':'warn'}">${skillCount} habilidades</span>
        </div>
        <div class="ax-hero-row-actions"><a href="./hero-editor.html?id=${encodeURIComponent(hero.id)}">Editar</a><a href="../herois.html?heroi=${encodeURIComponent(hero.slug||'')}" target="_blank" rel="noopener">Ver público</a></div>
      </div>
    </article>`;
  }).join('');
}

function renderIssues(){
  const host=$('ax-issues');if(!host)return;
  const viewMap=mediaById();const skillMap=skillsByHero();
  const issues=[];
  for(const hero of state.heroes.filter(h=>h.enabled!==false)){
    const media=viewMap.get(String(hero.id));const skills=skillMap.get(String(hero.id))||0;
    if(!media?.main_source)issues.push(`${hero.name}: sem mídia principal pública.`);
    if(!media?.card_source)issues.push(`${hero.name}: sem mídia de card pública.`);
    if(skills!==4)issues.push(`${hero.name}: ${skills} habilidades ativas; o contrato público atual espera 4.`);
  }
  if(state.errors.length)issues.push(...state.errors.map(error=>`Fonte indisponível: ${error}`));
  host.innerHTML=issues.length
    ? issues.map(item=>`<div class="ax-note ax-error">${esc(item)}</div>`).join('')
    : '<div class="ax-note"><strong>Paridade pública sem bloqueios detectados nesta leitura.</strong> Mídia e estrutura principal dos heróis ativos estão completas.</div>';
}

async function load(){
  const [heroesResult,viewResult,skillsResult,
    buildsTotal,buildsPublic,equipmentsTotal,equipmentsActive,compositionsTotal,compositionsPublic,
    cmsPages,cmsFields,guides,guidesPublished,news,newsPublished,tiers,tiersPublished]=await Promise.all([
      supabase.from('heroes').select('id,name,slug,enabled,display_order').order('display_order',{ascending:true,nullsFirst:false}).order('name'),
      supabase.from('v_heroes_complete').select('id,name,slug,enabled,class_name,main_source,card_source').order('display_order',{ascending:true,nullsFirst:false}).order('name'),
      supabase.from('hero_skills').select('id,hero_id,enabled'),
      count('builds'),
      count('builds',q=>q.eq('is_public',true).eq('visibility','public').eq('status','published').is('deleted_at',null)),
      count('equipments'),count('equipments',q=>q.eq('enabled',true)),
      count('team_compositions'),count('team_compositions',q=>q.eq('is_public',true)),
      count('site_pages',null,'page_key'),count('site_content',null,'key'),
      count('guides'),count('guides',q=>q.eq('published',true)),
      count('news'),count('news',q=>q.eq('published',true)),
      count('tier_lists'),count('tier_lists',q=>q.eq('published',true))
    ]);

  if(heroesResult.error)state.errors.push(`heroes: ${heroesResult.error.message}`);else state.heroes=heroesResult.data||[];
  if(viewResult.error)state.errors.push(`v_heroes_complete: ${viewResult.error.message}`);else state.heroView=viewResult.data||[];
  if(skillsResult.error)state.errors.push(`hero_skills: ${skillsResult.error.message}`);else state.skills=skillsResult.data||[];
  Object.assign(state.builds,{total:buildsTotal,public:buildsPublic});
  Object.assign(state.equipments,{total:equipmentsTotal,active:equipmentsActive});
  Object.assign(state.compositions,{total:compositionsTotal,public:compositionsPublic});
  Object.assign(state.cms,{pages:cmsPages,fields:cmsFields});
  Object.assign(state.editorial,{guides,guidesPublished,news,newsPublished,tiers,tiersPublished});
  renderMetrics();renderHeroParity();renderIssues();
  const summary=$('ax-sync-summary');
  if(summary)summary.textContent=state.errors.length?`${state.errors.length} fonte(s) exigem atenção nesta leitura`:'Supabase e superfícies públicas sincronizados nesta leitura';
}

load().catch(error=>{
  console.error('[admin-public-experience]',error);
  state.errors.push(error.message||String(error));
  renderMetrics();renderIssues();
});
