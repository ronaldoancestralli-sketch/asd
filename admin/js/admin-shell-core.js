import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';
import { requireAdmin } from './admin-auth.js?v=20260823-security-mfa-1&sb=20260823-security-supabase-pin-1';
import { initAdminAuditAwareness } from './admin-audit-awareness.js?v=20260822-admin-nav-1&sb=20260823-security-supabase-pin-1';

/* Casca única do painel. Mantém autenticação, navegação, logout e os nós
   originais de cada página. Novos módulos entram aqui para não ficarem
   escondidos em URLs ou listas secundárias. */
const PAINT_GUARD_ID='admin-paint-guard';
(function hideUntilReady(){
  if(document.getElementById(PAINT_GUARD_ID))return;
  const style=document.createElement('style');
  style.id=PAINT_GUARD_ID;
  style.textContent='body{visibility:hidden !important}';
  (document.head||document.documentElement).appendChild(style);
  setTimeout(revealPage,8000);
})();
function revealPage(){ document.getElementById(PAINT_GUARD_ID)?.remove(); }

const DEFAULT_MENU=[
  {id:'status-central',label:'Central de Status',description:'Vínculos, bases e prova do cálculo',href:'./status-central.html',badge:'Brain',tone:'priority',keywords:'status efeitos graus equipamentos habilidades cálculo auditoria'},
  {id:'dashboard',label:'Dashboard',description:'Visão geral da operação',href:'./index.html',keywords:'início home métricas'},
  {id:'announcements',label:'Avisos e Manutenção',description:'Banners e bloqueio programado',href:'./site-content.html?page=global_announcement',badge:'Acesso rápido',tone:'priority',keywords:'banner comunicado promoção agradecimento offline manutenção agendamento bloquear visitantes'},
  {id:'founder-center',label:'Founder Center',description:'Equipe, permissões e auditoria',href:'./founder-center.html',badge:'Founder',tone:'priority',keywords:'founder governança equipe permissões auditoria integridade'},
  {
    id:'intelligence',label:'Inteligência',description:'Automação interna e controlada',children:[
      {id:'echo-brain',label:'Echo Brain',description:'Pipeline, treino e segurança',href:'./echo-brain.html',keywords:'shadow replay backtest drift rollback emergência'},
      {id:'echo-pulse',label:'Echo Pulse',description:'Curadoria privada e pausada',href:'./echo-pulse.html',badge:'Interno',keywords:'inbox editorial fontes privado'}
    ]
  },
  {
    id:'heroes',label:'Heróis',description:'Cadastro, revisão e publicação',children:[
      {id:'heroes-list',label:'Lista de heróis',description:'Editar e publicar roster',href:'./heroes.html'},
      {id:'hero-new',label:'Novo herói',description:'Cadastrar manualmente',href:'./hero-editor.html'},
      {id:'hero-import',label:'Validar JSON',description:'Somente leitura, sem salvar',href:'./hero-import.html',keywords:'importar revisar'},
      {id:'hero-stats',label:'Status do roster',description:'Completude e pendências',href:'./hero-stats.html'},
      {id:'hero-skill-audit',label:'Auditar habilidades',description:'Fontes, patches e confiança',href:'./hero-skill-audit.html',keywords:'skills trust proveniência'}
    ]
  },
  {
    id:'equipments',label:'Equipamentos',description:'Catálogo, importação e auditoria',children:[
      {id:'equipments-list',label:'Lista de equipamentos',description:'Editar e publicar catálogo',href:'./equipments.html'},
      {id:'equipment-new',label:'Novo equipamento',description:'Cadastrar manualmente',href:'./equipment-editor.html'},
      {id:'equipment-ocr-import',label:'Importar por print',description:'OCR com revisão obrigatória',href:'./equipment-import.html',keywords:'imagem screenshot foto'},
      {id:'equipment-ai-import',label:'Importar por JSON',description:'Criar ou atualizar após revisão',href:'./equipment-ai-import.html'},
      {id:'equipment-audit',label:'Auditar equipamentos',description:'Integridade e cálculo',href:'./equipment-audit.html'}
    ]
  },
  {id:'classes',label:'Classes',description:'Identidade e vínculos',href:'./classes.html'},
  {id:'builds',label:'Builds',description:'Publicação e comunidade',href:'./builds.html'},
  {
    id:'publishing',label:'Conteúdo e publicação',description:'Tudo que pode aparecer no site',children:[
      {id:'site-content',label:'Textos e imagens',description:'Editor visual das páginas',href:'./site-content.html',keywords:'cms mídia hero banner'},
      {id:'home-featured',label:'Destaque da home',description:'Herói e planejamento da rotação',href:'./home-featured.html',badge:'Novo',keywords:'home herói destaque rotação diária semanal fila'},
      {id:'content-modules',label:'Conteúdo editorial',description:'Notícias, ranking e composições',href:'./content-modules.html',keywords:'guias tier list'},
      {id:'promo-codes',label:'Códigos promocionais',description:'Fontes, verificação e revelação',href:'./promo-codes.html',keywords:'promo códigos cupons C.A.T.S. ZeptoLab curtir revelar'},
      {id:'releases',label:'Versões públicas',description:'Histórico sanitizado do produto',href:'./releases.html'},
      {id:'site-texts',label:'Configurações gerais',description:'Identidade, contato e regras',href:'./site-texts.html',keywords:'nome descrição seo redes sociais'}
    ]
  },
  {
    id:'quality',label:'Qualidade e auditoria',description:'Paridade e integridade',children:[
      {id:'public-experience',label:'Experiência pública',description:'Conferir Admin ↔ Site',href:'./public-experience.html',keywords:'paridade sincronização'},
      {id:'diversao-lab',label:'Laboratório Diversão',description:'Forçar eventos e auditar estabilidade',href:'./diversao-lab.html',keywords:'eventos sorteio qa animações estabilidade confronto capitão'},
      {id:'data-health',label:'Saúde dos dados',description:'Diagnóstico de todos os módulos',href:'./data-health.html'}
    ]
  },
  {
    id:'community',label:'Comunidade',description:'Atividade, pessoas e moderação',children:[
      {id:'community-hub',label:'Visão geral',description:'Atividade real da comunidade',href:'./community.html'},
      {id:'comments',label:'Comentários',description:'Fila de moderação',href:'./comments.html'},
      {id:'users',label:'Usuários',description:'Perfis e bloqueios',href:'./users.html'}
    ]
  }
];

function escapeHtml(value=''){
  return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}
function normalizePath(pathname){ return pathname.replace(/\/+/g,'/').replace(/\/$/,'').toLowerCase(); }
function currentFile(){ return normalizePath(location.pathname).split('/').pop()||'index.html'; }
function isActiveItem(item,activeId){
  if(activeId){
    if(item.id===activeId)return true;
    return item.children?.some(child=>isActiveItem(child,activeId))??false;
  }
  if(item.href){ const target=item.href.split(/[?#]/,1)[0].split('/').pop()?.toLowerCase(); return target===currentFile(); }
  return item.children?.some(child=>isActiveItem(child,activeId))??false;
}
function itemSearchText(item){
  return [item.label,item.description,item.keywords,item.badge].filter(Boolean).join(' ');
}
function renderItemCopy(item){
  const description=item.description?`<small>${escapeHtml(item.description)}</small>`:'';
  const badge=item.badge?`<em>${escapeHtml(item.badge)}</em>`:'';
  return `<span class="admin-shell-item-copy"><strong>${escapeHtml(item.label)}</strong>${description}</span>${badge}`;
}
function renderMenu(items,activeId){
  return items.map(item=>{
    const active=isActiveItem(item,activeId);
    if(item.children?.length){
      const children=item.children.map(child=>{
        const childActive=isActiveItem(child,activeId);
        return `<a class="admin-shell-subitem ${childActive?'is-active':''}" href="${escapeHtml(child.href)}" data-menu-id="${escapeHtml(child.id)}" data-search-text="${escapeHtml(itemSearchText(child))}" ${childActive?'aria-current="page"':''}>${renderItemCopy(child)}</a>`;
      }).join('');
      return `<div class="admin-shell-group ${active?'is-open':''}" data-default-open="${active?'true':'false'}" data-search-text="${escapeHtml(itemSearchText(item))}"><button type="button" class="admin-shell-group-trigger ${active?'is-active':''}" aria-expanded="${active?'true':'false'}">${renderItemCopy(item)}<span class="admin-shell-chevron" aria-hidden="true">⌄</span></button><div class="admin-shell-submenu">${children}</div></div>`;
    }
    return `<a class="admin-shell-item ${active?'is-active':''} ${item.tone==='priority'?'is-priority':''}" href="${escapeHtml(item.href)}" data-menu-id="${escapeHtml(item.id)}" data-search-text="${escapeHtml(itemSearchText(item))}" ${active?'aria-current="page"':''}>${renderItemCopy(item)}</a>`;
  }).join('');
}

async function getCurrentAdmin(){
  const {session,profile}=await requireAdmin();
  return {session,profile,email:session.user.email??'',displayName:profile?.display_name||profile?.username||session.user.email||'Administrador'};
}
function setPageTitle(title,subtitle){
  const titleElement=document.querySelector('[data-admin-page-title]');
  const subtitleElement=document.querySelector('[data-admin-page-subtitle]');
  if(titleElement&&title)titleElement.textContent=title;
  if(subtitleElement)subtitleElement.textContent=subtitle??'';
}
function bindNavigation(){
  document.querySelectorAll('.admin-shell-group-trigger').forEach(button=>button.addEventListener('click',()=>{
    const group=button.closest('.admin-shell-group'); const opened=group.classList.toggle('is-open'); button.setAttribute('aria-expanded',String(opened));
  }));
  const mobileButton=document.getElementById('admin-shell-mobile-toggle');
  const sidebar=document.getElementById('admin-shell-sidebar');
  const backdrop=document.getElementById('admin-shell-backdrop');
  const closeMobile=()=>{sidebar?.classList.remove('is-mobile-open');backdrop?.classList.remove('is-visible');document.body.classList.remove('admin-shell-lock');};
  mobileButton?.addEventListener('click',()=>{sidebar?.classList.toggle('is-mobile-open');backdrop?.classList.toggle('is-visible');document.body.classList.toggle('admin-shell-lock');});
  backdrop?.addEventListener('click',closeMobile);
  document.querySelectorAll('.admin-shell-nav a').forEach(link=>link.addEventListener('click',closeMobile));
  window.addEventListener('resize',()=>{if(innerWidth>900)closeMobile();});
  bindMenuSearch();
}

function normalizeSearch(value=''){
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}
function bindMenuSearch(){
  const input=document.getElementById('admin-shell-search-input');
  const clear=document.getElementById('admin-shell-search-clear');
  const nav=document.getElementById('admin-shell-nav');
  const empty=document.getElementById('admin-shell-search-empty');
  if(!input||!nav)return;
  const apply=()=>{
    const query=normalizeSearch(input.value);
    let visible=0;
    nav.querySelectorAll(':scope > .admin-shell-item').forEach(item=>{
      const match=!query||normalizeSearch(item.dataset.searchText).includes(query);
      item.hidden=!match;
      if(match)visible+=1;
    });
    nav.querySelectorAll(':scope > .admin-shell-group').forEach(group=>{
      const groupMatch=query&&normalizeSearch(group.dataset.searchText).includes(query);
      let childMatches=0;
      group.querySelectorAll('.admin-shell-subitem').forEach(child=>{
        const match=!query||groupMatch||normalizeSearch(child.dataset.searchText).includes(query);
        child.hidden=!match;
        if(match)childMatches+=1;
      });
      group.hidden=Boolean(query)&&!groupMatch&&!childMatches;
      if(!group.hidden)visible+=1;
      const shouldOpen=query?(!group.hidden):group.dataset.defaultOpen==='true';
      group.classList.toggle('is-open',shouldOpen);
      group.querySelector('.admin-shell-group-trigger')?.setAttribute('aria-expanded',String(shouldOpen));
    });
    clear.hidden=!query;
    if(empty)empty.hidden=visible>0;
  };
  const reset=()=>{input.value='';apply();input.focus();};
  input.addEventListener('input',apply);
  input.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();reset();}});
  clear?.addEventListener('click',reset);
  document.addEventListener('keydown',event=>{
    const tag=event.target?.tagName?.toLowerCase();
    const typing=['input','textarea','select'].includes(tag)||event.target?.isContentEditable;
    if((event.key==='/'&&!typing)||((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k')){
      event.preventDefault();input.focus();input.select();
    }
  });
  apply();
}

function scheduledMaintenanceActive(row){
  const content=row?.content&&typeof row.content==='object'?row.content:{};
  const starts=content.starts_at?new Date(content.starts_at):null;
  const ends=content.ends_at?new Date(content.ends_at):null;
  const now=new Date();
  if(row?.published!==true||content.enabled!==true||content.variant!=='maintenance'||content.access_mode!=='maintenance_lock'||!String(content.message||'').trim()||!ends||Number.isNaN(ends.getTime()))return false;
  if(starts&&(Number.isNaN(starts.getTime())||starts>=ends||now<starts))return false;
  return now<ends;
}

async function confirmAdminLogout(){
  let maintenance=false;
  try{
    const [statusResult,announcementResult]=await Promise.all([
      supabase.rpc('site_status'),
      supabase.from('site_pages').select('content,published').eq('page_key','global_announcement').maybeSingle()
    ]);
    const status=Array.isArray(statusResult.data)?statusResult.data[0]:statusResult.data;
    maintenance=status?.maintenance_mode===true||scheduledMaintenanceActive(announcementResult.data);
  }
  catch(error){ console.warn('[logout] estado do site indisponível:',error.message); }
  return new Promise(resolve=>{
    const overlay=document.createElement('div'); overlay.id='admin-logout-modal';
    const extra=maintenance?'<div class="al-alert">O site está <strong>em manutenção</strong>. Sem sessão de administrador, o painel e o site público exigirão novo login.</div>':'';
    overlay.innerHTML=`<div class="al-backdrop"></div><div class="al-card" role="dialog" aria-modal="true"><div class="al-icon">&#9888;</div><h2>Encerrar sessão administrativa?</h2><p>Alterações não salvas serão perdidas e você precisará entrar novamente para voltar ao painel.</p>${extra}<div class="al-actions"><button type="button" id="al-cancel">Permanecer no painel</button><button type="button" id="al-confirm" class="danger">Sair</button></div></div>`;
    const style=document.createElement('style'); style.textContent=`#admin-logout-modal{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:20px;font-family:Inter,system-ui,sans-serif}#admin-logout-modal .al-backdrop{position:absolute;inset:0;background:rgba(3,7,15,.82);backdrop-filter:blur(5px)}#admin-logout-modal .al-card{position:relative;width:min(440px,100%);padding:26px;border:1px solid #71303b;border-radius:18px;background:#12101f;box-shadow:0 30px 80px rgba(0,0,0,.6);text-align:center}#admin-logout-modal .al-icon{font-size:32px;color:#ffb4bd}#admin-logout-modal h2{margin:12px 0 10px;color:#eef2f8}#admin-logout-modal p{margin:0;color:#9aa4bb;font-size:12.5px;line-height:1.65}#admin-logout-modal .al-alert{margin-top:14px;padding:12px;border:1px solid #71303b;border-radius:11px;background:#2a1016;color:#ffb4bd;font-size:12px}#admin-logout-modal .al-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:20px}#admin-logout-modal button{padding:12px;border:1px solid #31245c;border-radius:10px;background:#161331;color:#eef2f8;font:inherit;font-weight:700;cursor:pointer}#admin-logout-modal button.danger{border-color:#71303b;background:#2a1016;color:#ff9aaa}@media(max-width:420px){#admin-logout-modal .al-actions{grid-template-columns:1fr}}`;
    overlay.appendChild(style); document.body.appendChild(overlay);
    const close=result=>{document.removeEventListener('keydown',onKey);overlay.remove();resolve(result);};
    const onKey=event=>{if(event.key==='Escape')close(false);};
    overlay.querySelector('#al-confirm').addEventListener('click',()=>close(true));
    overlay.querySelector('#al-cancel').addEventListener('click',()=>close(false));
    overlay.querySelector('.al-backdrop').addEventListener('click',()=>close(false));
    document.addEventListener('keydown',onKey); setTimeout(()=>overlay.querySelector('#al-cancel')?.focus(),30);
  });
}

function renderShell({admin,activeId,menuItems,pageTitle,pageSubtitle}){
  document.body.classList.add('admin-shell-body');
  const preserved=document.createDocumentFragment(); while(document.body.firstChild)preserved.appendChild(document.body.firstChild);
  document.body.innerHTML=`<div class="admin-shell-app"><div id="admin-shell-backdrop" class="admin-shell-backdrop"></div><aside id="admin-shell-sidebar" class="admin-shell-sidebar"><a class="admin-shell-brand" href="./index.html"><span>ECHO</span><strong>ADMIN</strong><small>Centro de controle</small></a><div class="admin-shell-search"><label for="admin-shell-search-input">Buscar ferramenta</label><div><input id="admin-shell-search-input" type="search" inputmode="search" autocomplete="off" placeholder="Ex.: avisos, heróis, auditoria" aria-controls="admin-shell-nav"><button id="admin-shell-search-clear" type="button" aria-label="Limpar busca" hidden>×</button><kbd>/</kbd></div></div><nav id="admin-shell-nav" class="admin-shell-nav" aria-label="Navegação administrativa">${renderMenu(menuItems,activeId)}</nav><p id="admin-shell-search-empty" class="admin-shell-search-empty" role="status" hidden>Nenhuma ferramenta encontrada.</p><div class="admin-shell-sidebar-footer"><a class="admin-shell-site-link" href="../index.html">Ver site público ↗</a></div></aside><section class="admin-shell-workspace"><header class="admin-shell-topbar"><button id="admin-shell-mobile-toggle" class="admin-shell-mobile-toggle" type="button" aria-label="Abrir menu administrativo">☰</button><div class="admin-shell-heading"><span data-admin-page-subtitle>${escapeHtml(pageSubtitle??'')}</span><h1 data-admin-page-title>${escapeHtml(pageTitle??'Painel administrativo')}</h1></div><div class="admin-shell-user"><div class="admin-shell-user-copy"><strong>${escapeHtml(admin.displayName)}</strong><span>${escapeHtml(admin.email)}</span></div><button id="admin-shell-logout" class="admin-shell-logout" type="button">Sair</button></div></header><main class="admin-shell-main"><div id="admin-shell-content" data-admin-content class="admin-shell-content"></div></main></section></div>`;
  document.getElementById('admin-shell-content').appendChild(preserved); bindNavigation(); revealPage();
  document.getElementById('admin-shell-logout')?.addEventListener('click',async()=>{if(!(await confirmAdminLogout()))return;await supabase.auth.signOut({scope:'local'});sessionStorage.removeItem('echoarena_admin_hops');location.href='./login.html';});
}

async function initContextModules(){
  if(currentFile()!=='hero-editor.html')return;
  try{
    const module=await import('./hero-skills-panel.js?v=20260830-skills-community-audit-1');
    await module.initHeroSkillsPanel({supabase});
  }catch(error){
    console.error('[admin-shell] falha ao iniciar habilidades do herói:',error);
    const target=document.querySelector('[data-panel="abilities"] .hero-placeholder');
    if(target){
      target.innerHTML='<h3>Habilidades indisponíveis</h3><p>O módulo não pôde ser carregado. Nenhum dado foi alterado.</p>';
    }
  }
}

export async function initAdminShell({activeId='',pageTitle='Painel administrativo',pageSubtitle='',menuItems=DEFAULT_MENU,redirectTo='./login.html'}={}){
  try{
    const admin=await getCurrentAdmin(); if(!admin)throw new Error('Não foi possível identificar a sessão administrativa.');
    renderShell({admin,activeId,menuItems,pageTitle,pageSubtitle});
    await initAdminAuditAwareness();
    await initContextModules();
    sessionStorage.removeItem('echoarena_admin_hops');
    return {admin,setPageTitle,supabase};
  }catch(error){
    console.error('Falha ao iniciar o painel:',error);
    const hops=parseInt(sessionStorage.getItem('echoarena_admin_hops')||'0',10);
    if(hops<3){sessionStorage.setItem('echoarena_admin_hops',String(hops+1));location.replace(redirectTo);}
    else{sessionStorage.removeItem('echoarena_admin_hops');document.body.innerHTML=`<pre style="padding:2rem;font:14px/1.6 monospace;color:#ffb4bd;background:#0b1221">Loop de autenticacao interrompido.\n\nMotivo: ${escapeHtml(error?.message||String(error))}\n\nAbra o Console (F12) para ver os detalhes.</pre>`;revealPage();}
    return null;
  }
}
