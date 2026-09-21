import * as core from './admin-shell-core.js?v=20260906-home-featured-phase-e-1&sb=20260823-security-supabase-pin-1&sc=20260906-1';
import { initAdminAnnouncementAwareness } from './admin-announcement-awareness.js?v=20260822-maintenance-2&sb=20260823-security-supabase-pin-1';
import { applyAdminAccess } from './admin-access.js?v=20260906-home-featured-phase-e-1&sc=20260906-1';

function ensureDiversaoLabLink(){
  if(document.querySelector('[data-menu-id="diversao-lab"]'))return;
  const anchor=document.querySelector('[data-menu-id="public-experience"]');
  const submenu=anchor?.closest('.admin-shell-submenu');
  if(!submenu)return;
  const link=document.createElement('a');
  link.className=`admin-shell-subitem ${location.pathname.endsWith('/diversao-lab.html')?'is-active':''}`;
  link.href='./diversao-lab.html';
  link.dataset.menuId='diversao-lab';
  link.dataset.searchText='Laboratório Diversão eventos estabilidade QA sorteio animações';
  if(location.pathname.endsWith('/diversao-lab.html'))link.setAttribute('aria-current','page');
  link.innerHTML='<span class="admin-shell-item-copy"><strong>Laboratório Diversão</strong><small>Eventos e estabilidade visual</small></span>';
  submenu.appendChild(link);
}

export async function initAdminShell(options={}){
  const shell=await core.initAdminShell(options);
  if(shell){
    ensureDiversaoLabLink();
    try{shell.access=await applyAdminAccess({supabase:shell.supabase});}
    catch(error){console.error('[admin-shell] falha ao aplicar escopo administrativo:',error);const main=document.querySelector('.admin-shell-main');if(main)main.innerHTML='<pre>Acesso administrativo bloqueado: não foi possível validar o escopo desta sessão.</pre>';}
    try{await initAdminAnnouncementAwareness({client:shell.supabase});}
    catch(error){console.warn('[admin-shell] status de avisos indisponível:',error.message);}
  }
  return shell;
}
