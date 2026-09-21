import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import { resolveMediaUrl } from './media-storage.js?v=20260823-security-supabase-pin-1';
import { classIconSymbol } from './class-icons.js?v=1';

const $ = id => document.getElementById(id);
const explorer = $('class-explorer');
const pills = $('class-experience-pills');
const grid = $('module-grid');
const state = { classes: [], heroes: [], active: '' };

function escapeHtml(value=''){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function media(hero){return resolveMediaUrl(hero?.card_image_path||hero?.image_path||hero?.card_image_url||hero?.image_url||'');}
function colorOf(item){const value=String(item?.color||'').trim();return /^#[0-9a-f]{3,8}$/i.test(value)?value:'#9367ff';}
function heroesFor(id){return state.heroes.filter(hero=>hero.class_id===id);}
function classBySlug(slug){return state.classes.find(item=>item.slug===slug)||state.classes[0]||null;}

function renderPortraits(rows){
  const visible=rows.slice(0,4);
  if(!visible.length) return '<div class="class-hero-empty">Nenhum herói ativo vinculado</div>';
  return visible.map(hero=>{const src=media(hero);return `<a class="class-hero-portrait" href="./herois.html?heroi=${encodeURIComponent(hero.slug||'')}">${src?`<img src="${escapeHtml(src)}" alt="${escapeHtml(hero.name)}" loading="eager">`:''}<strong>${escapeHtml(hero.name)}</strong></a>`;}).join('');
}
function setFeatured(item){
  if(!item||!explorer) return;
  state.active=item.slug||'';
  const rows=heroesFor(item.id); const color=colorOf(item);
  explorer.style.setProperty('--class-color',color);
  $('class-watermark').textContent=item.name||'';
  $('class-feature-icon').textContent=classIconSymbol(item.icon||'◆');
  $('class-feature-name').textContent=item.name||'—';
  $('class-feature-slug').textContent=item.slug||'Função cadastrada';
  $('class-feature-description').textContent=rows.length?`${rows.length} ${rows.length===1?'herói ativo pertence':'heróis ativos pertencem'} a esta função no cadastro atual do projeto.`:'Nenhum herói ativo está vinculado a esta função no cadastro atual.';
  $('class-feature-count').textContent=String(rows.length);
  $('class-feature-builds').textContent=rows.reduce((sum,hero)=>sum+Number(hero.total_builds||0),0).toLocaleString('pt-BR');
  $('class-feature-views').textContent=rows.reduce((sum,hero)=>sum+Number(hero.total_views||0),0).toLocaleString('pt-BR');
  $('class-feature-proof').innerHTML=`<i></i><span>${rows.length?'Dados vinculados a heróis ativos':'Aguardando vínculo de heróis ativos'}</span>`;
  $('class-hero-stack').innerHTML=renderPortraits(rows);
  $('class-feature-link').href=`./herois.html?classe=${encodeURIComponent(item.slug||'')}`;
  pills?.querySelectorAll('[data-class-exp]').forEach(button=>button.classList.toggle('is-active',button.dataset.classExp===item.slug));
  grid?.querySelectorAll('.class-card').forEach(card=>card.classList.toggle('is-featured',card.dataset.classSlug===item.slug));
}
function renderPills(){
  if(!pills) return;
  pills.innerHTML=state.classes.map(item=>{const count=heroesFor(item.id).length;return `<button class="class-pill" type="button" data-class-exp="${escapeHtml(item.slug||'')}" style="--class-color:${escapeHtml(colorOf(item))}"><small>Função</small><strong>${escapeHtml(item.name)}</strong><span>${count} ${count===1?'herói':'heróis'} ativos</span></button>`;}).join('');
}
function syncGridInteraction(){
  if(!grid) return;
  const enhance=()=>{
    grid.querySelectorAll('.class-card').forEach(card=>{
      const slug=card.dataset.classSlug||card.querySelector('.module-card-footer span')?.textContent?.trim()||'';
      if(slug) card.dataset.classSlug=slug;
      card.tabIndex=0;
    });
  };
  enhance();
  new MutationObserver(enhance).observe(grid,{childList:true,subtree:true});
  grid.addEventListener('mouseover',event=>{const card=event.target.closest('.class-card[data-class-slug]');const item=card?classBySlug(card.dataset.classSlug):null;if(item)setFeatured(item);});
  grid.addEventListener('focusin',event=>{const card=event.target.closest('.class-card[data-class-slug]');const item=card?classBySlug(card.dataset.classSlug):null;if(item)setFeatured(item);});
}
pills?.addEventListener('click',event=>{
  const button=event.target.closest('[data-class-exp]'); if(!button)return;
  const item=classBySlug(button.dataset.classExp); if(!item)return; setFeatured(item);
  const query=document.getElementById('module-search'); if(query){query.value=item.name;query.dispatchEvent(new Event('input',{bubbles:true}));}
  document.querySelector('.module-section')?.scrollIntoView({behavior:'smooth',block:'start'});
});
$('class-reset')?.addEventListener('click',()=>{const input=$('module-search');if(input){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));}setFeatured(state.classes[0]);});

async function load(){
  try{
    const [classesResult,heroesResult]=await Promise.all([
      supabase.from('hero_classes').select('id,name,slug,color,icon').order('name'),
      supabase.from('v_heroes_complete').select('id,name,slug,class_id,enabled,card_image_path,image_path,card_image_url,image_url,total_builds,total_views').eq('enabled',true).order('display_order',{ascending:true,nullsFirst:false}).order('name')
    ]);
    if(classesResult.error)throw classesResult.error;if(heroesResult.error)throw heroesResult.error;
    state.classes=classesResult.data||[];state.heroes=heroesResult.data||[];
    $('class-total-exp').textContent=String(state.classes.length);
    $('class-hero-total-exp').textContent=String(state.heroes.length);
    renderPills();syncGridInteraction();
    const requested=new URLSearchParams(location.search).get('classe');setFeatured(classBySlug(requested));
  }catch(error){console.error('[classes-experience]',error);$('class-feature-name').textContent='Classes indisponíveis';$('class-feature-description').textContent='Não foi possível carregar a experiência de classes nesta leitura.';}
}
await load();
