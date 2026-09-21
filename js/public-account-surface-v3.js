import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';

const STYLE_ID='echo-public-account-surface-v3-style';
const PANEL_ID='echo-global-account-panel';
const PROFILE_ID='echo-global-profile-trigger';
const FUN_ID='echo-global-fun-action';
let currentSession=null;
let scheduled=false;

function ensureStyles(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    .echo-global-fun-action,.echo-global-profile-trigger{box-sizing:border-box;height:40px;display:inline-flex;align-items:center;justify-content:center;border-radius:10px;text-decoration:none;white-space:nowrap;font:800 8px/1 Inter,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;transition:.18s}
    .echo-global-fun-action{gap:7px;padding:0 11px;border:1px solid rgba(158,103,255,.42);background:linear-gradient(145deg,rgba(147,103,255,.19),rgba(41,216,237,.045));color:#eee8ff;box-shadow:0 0 24px rgba(135,81,255,.12)}
    .echo-global-fun-action i{width:23px;height:23px;display:grid;place-items:center;border-radius:7px;background:linear-gradient(145deg,#8d5df1,#45286f);color:#fff;font-style:normal;font-size:11px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12),0 0 16px rgba(147,103,255,.24)}
    .echo-global-profile-trigger{width:40px;min-width:40px;padding:0;border:1px solid rgba(146,164,205,.16);background:rgba(13,19,32,.78);color:#eaf0ff}
    .echo-global-profile-trigger::before{content:'◉';font-size:14px;color:#b994ff;line-height:1}
    .echo-global-profile-trigger:hover,.echo-global-profile-trigger:focus-visible{border-color:rgba(147,103,255,.52);background:rgba(147,103,255,.12);outline:none}
    .echo-global-profile-trigger span{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
    .echo-global-account-panel{margin:0 0 20px;padding:14px;border:1px solid rgba(147,103,255,.24);border-radius:14px;background:linear-gradient(145deg,rgba(147,103,255,.09),rgba(41,216,237,.025))}
    .echo-global-account-panel>small{display:block;margin:0 0 10px;color:#8692aa;font:800 8px/1 Inter,system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase}
    .echo-global-account-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .echo-global-account-actions button{min-height:44px;border:1px solid rgba(146,164,205,.16);border-radius:10px;background:#0c1424;color:#eaf0ff;font:800 8px/1 Inter,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}
    .echo-global-account-actions button.primary{border-color:rgba(147,103,255,.4);background:linear-gradient(135deg,#9367ff,#6d3ce0);color:#fff}
    .echo-global-account-actions button.full{grid-column:1/-1}
    body.echo-account-surface-v3 .echo-public-actions>.echo-public-login,body.echo-account-surface-v3 .echo-public-actions>.echo-public-account{display:none!important}
    body.echo-account-surface-v3 .top-actions>.login-btn,body.echo-account-surface-v3 .top-actions>.account-btn{display:none!important}
    @media(max-width:840px){
      .echo-global-fun-action{height:38px;padding:0 8px;gap:6px}.echo-global-fun-action i{width:20px;height:20px;font-size:10px}.echo-global-fun-action b{font-size:7px}
      .echo-global-profile-trigger{width:auto;min-width:58px;height:38px;padding:0 9px;gap:6px;background:linear-gradient(135deg,#8f5cff,#6c37df);border-color:rgba(179,146,255,.38);box-shadow:0 8px 25px rgba(104,53,220,.2)}
      .echo-global-profile-trigger::before{font-size:10px;color:#fff}.echo-global-profile-trigger span{position:static;width:auto;height:auto;overflow:visible;clip:auto;white-space:nowrap;font-size:7px;color:#fff}
      .echo-public-actions,.top-actions{gap:7px!important}
    }
    @media(max-width:560px){
      .echo-global-fun-action{min-width:70px;padding-inline:7px}.echo-global-fun-action b{font-size:6.5px}.echo-global-profile-trigger{min-width:54px;padding-inline:8px}
      .echo-public-topbar,.topbar{gap:8px!important;padding-left:12px!important;padding-right:12px!important}
      .echo-public-brand,.brand{gap:8px!important}.echo-public-brand-copy strong,.brand-copy strong{font-size:18px!important}.echo-public-brand-mark,.brand-mark{width:34px!important;height:34px!important;flex-basis:34px!important}
    }
    @media(max-width:375px){.echo-global-fun-action{min-width:62px;padding-inline:6px}.echo-global-fun-action i{display:none}.echo-global-profile-trigger{min-width:49px;padding-inline:7px}.echo-public-brand-copy strong,.brand-copy strong{font-size:17px!important}}
  `;
  document.head.appendChild(style);
}

function accountButtons(){
  const account=document.querySelector('.echo-public-account,#register-btn,#echo-compare-account');
  const login=document.querySelector('.echo-public-login,#login-btn,#echo-compare-login');
  return {account,login};
}

function drawerParts(){
  const echoScroll=document.querySelector('#echo-public-drawer .echo-public-drawer-scroll');
  if(echoScroll)return {scroll:echoScroll,kind:'echo'};
  const siteScroll=document.querySelector('#site-sidebar .sidebar-scroll');
  if(siteScroll)return {scroll:siteScroll,kind:'site'};
  return null;
}

function closeDrawer(){
  document.body.classList.remove('echo-public-drawer-open','sidebar-open');
  document.getElementById('echo-public-drawer')?.setAttribute('aria-hidden','true');
  document.getElementById('echo-public-menu')?.setAttribute('aria-expanded','false');
  document.getElementById('site-sidebar')?.setAttribute('aria-hidden','true');
  document.getElementById('sidebar-open')?.setAttribute('aria-expanded','false');
}

function openDrawer(){
  const echo=document.getElementById('echo-public-drawer');
  if(echo){
    document.body.classList.add('echo-public-drawer-open');
    echo.setAttribute('aria-hidden','false');
    document.getElementById('echo-public-menu')?.setAttribute('aria-expanded','true');
    window.setTimeout(()=>document.getElementById(PANEL_ID)?.scrollIntoView({block:'start',behavior:'smooth'}),60);
    return true;
  }
  const site=document.getElementById('site-sidebar');
  if(site){
    document.body.classList.add('sidebar-open');
    site.setAttribute('aria-hidden','false');
    document.getElementById('sidebar-open')?.setAttribute('aria-expanded','true');
    window.setTimeout(()=>document.getElementById(PANEL_ID)?.scrollIntoView({block:'start',behavior:'smooth'}),60);
    return true;
  }
  return false;
}

function proxyClick(target){
  if(!target)return false;
  target.click();
  return true;
}

function ensurePanel(){
  const parts=drawerParts();
  if(!parts)return null;
  document.getElementById('echo-mobile-account-panel')?.remove();
  let panel=document.getElementById(PANEL_ID);
  if(panel&&panel.parentElement!==parts.scroll){panel.remove();panel=null;}
  if(!panel){
    panel=document.createElement('section');
    panel.id=PANEL_ID;
    panel.className='echo-global-account-panel';
    panel.innerHTML='<small>CONTA E IDENTIDADE</small><div class="echo-global-account-actions"></div>';
  }
  if(parts.scroll.firstElementChild!==panel)parts.scroll.prepend(panel);
  return panel;
}

function renderPanel(){
  const panel=ensurePanel();
  const actions=panel?.querySelector('.echo-global-account-actions');
  if(!actions)return;
  const state=currentSession?.user?'signed-in':'signed-out';
  if(panel.dataset.accountState===state&&actions.childElementCount===2)return;
  panel.dataset.accountState=state;
  actions.replaceChildren();
  const {account,login}=accountButtons();
  const make=(text,className,handler)=>{
    const button=document.createElement('button');
    button.type='button';button.textContent=text;if(className)button.className=className;
    button.addEventListener('click',()=>{closeDrawer();handler();});
    return button;
  };
  if(currentSession?.user){
    actions.append(
      make('Meu Perfil','primary full',()=>proxyClick(account)||window.location.assign('./meu-perfil.html')),
      make('Sair','full',()=>proxyClick(login)||supabase.auth.signOut())
    );
  }else{
    actions.append(
      make('Entrar','',()=>proxyClick(login)),
      make('Criar conta','primary',()=>proxyClick(account))
    );
  }
}

function ensureTopActions(){
  const actions=document.querySelector('.echo-public-actions,.top-actions');
  if(!actions)return;
  const menu=actions.querySelector('#echo-public-menu,#sidebar-open,.echo-public-menu,.menu-toggle')||actions.lastElementChild;
  let fun=actions.querySelector('.top-fun-link,#'+FUN_ID);
  if(!fun){
    fun=document.createElement('a');
    fun.id=FUN_ID;fun.className='echo-global-fun-action';fun.href='./diversao.html';fun.setAttribute('aria-label','Abrir Diversão');
    fun.innerHTML='<i aria-hidden="true">✦</i><b>Diversão</b>';
    actions.insertBefore(fun,menu);
  }

  let profile=document.getElementById(PROFILE_ID);
  if(profile&&profile.parentElement!==actions){profile.remove();profile=null;}
  if(!profile){
    profile=document.createElement('button');
    profile.id=PROFILE_ID;profile.className='echo-global-profile-trigger';profile.type='button';
    profile.innerHTML='<span>Perfil</span>';
    profile.addEventListener('click',()=>{
      const {account}=accountButtons();
      if(currentSession?.user){
        if(!proxyClick(account))window.location.assign('./meu-perfil.html');
      }else if(!openDrawer())proxyClick(account);
    });
  }
  const label=currentSession?.user?'Perfil':'Conta';
  const span=profile.querySelector('span');
  if(span&&span.textContent!==label)span.textContent=label;
  const aria=currentSession?.user?'Abrir Meu Perfil':'Abrir conta e identidade';
  if(profile.getAttribute('aria-label')!==aria)profile.setAttribute('aria-label',aria);
  if(profile.parentElement!==actions||profile.nextElementSibling!==menu)actions.insertBefore(profile,menu);
}

function sync(){
  scheduled=false;
  ensureStyles();
  document.body?.classList.add('echo-account-surface-v3');
  ensureTopActions();
  renderPanel();
}

function scheduleSync(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(sync);
}

async function boot(){
  ensureStyles();
  const {data}=await supabase.auth.getSession();
  currentSession=data.session;
  sync();
  supabase.auth.onAuthStateChange((_event,session)=>{currentSession=session;scheduleSync();});
  const observer=new MutationObserver(scheduleSync);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.setTimeout(()=>observer.disconnect(),20000);
}

if(!window.__echoPublicAccountSurfaceV3){
  window.__echoPublicAccountSurfaceV3=true;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
}
