import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import { echoDrawerMarkup } from './public-navigation.js?v=20260822-drawer-unified-1&sb=20260823-security-supabase-pin-1&ops=20260905&sc=20260906-1&eq=20260907-effects-1';
import {
  identityProfileUrl,
  identitySignupGateEnabled,
  identitySignupMetadata,
  normalizePublicHandle
} from './identity-public-launch-v6.js?v=20260825-identity-public-v6-1';

const params = new URL(import.meta.url).searchParams;
const activeId = params.get('active') || document.body?.dataset.publicModule || '';

const NAV_ITEMS = [
  ['inicio','Início','./index.html'],
  ['herois','Heróis','./herois.html'],
  ['builds','Builds','./builds.html'],
  ['equipamentos','Equipamentos','./equipamentos.html'],
  ['comparar','Comparar','./comparar-build.html'],
  ['estatisticas','Estatísticas','./estatisticas.html'],
  ['composicoes','Composições','./composicoes.html']
];
const searchIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>';
const menuIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"></path></svg>';

function navMarkup(){
  return NAV_ITEMS.map(([id,label,href]) => `<a class="${id===activeId?'on':''}" href="${href}">${label}</a>`).join('');
}
function setDrawer(open){
  document.body.classList.toggle('echo-public-drawer-open',open);
  document.getElementById('echo-public-drawer')?.setAttribute('aria-hidden',String(!open));
  document.getElementById('echo-public-menu')?.setAttribute('aria-expanded',String(open));
}
function mountDrawer(){
  if(document.getElementById('echo-public-drawer')) return;
  const backdrop=document.createElement('div');
  backdrop.id='echo-public-backdrop'; backdrop.className='echo-public-backdrop'; backdrop.setAttribute('aria-hidden','true');
  const drawer=document.createElement('aside');
  drawer.id='echo-public-drawer'; drawer.className='echo-public-drawer'; drawer.setAttribute('aria-hidden','true'); drawer.setAttribute('aria-label','Centro de navegação Echo Arena');
  drawer.innerHTML=`<div class="echo-public-drawer-head"><div class="echo-public-drawer-brand"><span class="echo-public-brand-mark"></span><div><strong>ECHO ARENA</strong><small>Centro de navegação</small></div></div><button class="echo-public-drawer-close" id="echo-public-drawer-close" type="button" aria-label="Fechar menu">×</button></div><div class="echo-public-drawer-scroll">${echoDrawerMarkup(activeId)}</div><div class="echo-public-drawer-footer">Navegação centralizada do <strong>Echo Arena</strong>.</div>`;
  document.body.append(backdrop,drawer);
  document.getElementById('echo-public-menu')?.addEventListener('click',()=>setDrawer(true));
  drawer.querySelector('#echo-public-drawer-close')?.addEventListener('click',()=>setDrawer(false));
  backdrop.addEventListener('click',()=>setDrawer(false));
  drawer.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>setDrawer(false)));
  document.addEventListener('keydown',event=>{if(event.key==='Escape') setDrawer(false);});
}
function ensureAuthModal(){
  if(document.getElementById('echo-public-auth')) return;
  const modal=document.createElement('div');
  modal.id='echo-public-auth'; modal.className='echo-public-auth'; modal.setAttribute('aria-hidden','true');
  modal.innerHTML=`<section class="echo-public-auth-card" role="dialog" aria-modal="true" aria-labelledby="echo-module-auth-title"><div class="echo-public-auth-head"><h2 id="echo-module-auth-title">Entrar</h2><button class="echo-public-auth-close" type="button" aria-label="Fechar">×</button></div><form class="echo-public-auth-form" id="echo-module-auth-form"><label id="echo-module-name-field" hidden>Nome de exibição<input id="echo-module-name" type="text" minlength="2" maxlength="40" autocomplete="name"></label><label id="echo-module-handle-field" hidden>Apelido público<input id="echo-module-handle" type="text" minlength="3" maxlength="24" pattern="[a-z0-9][a-z0-9._-]{1,22}[a-z0-9]" autocomplete="nickname" autocapitalize="none" spellcheck="false" placeholder="seu-apelido"></label><label>E-mail<input id="echo-module-email" type="email" required autocomplete="email"></label><label>Senha<input id="echo-module-password" type="password" required minlength="8" autocomplete="current-password"></label><button class="echo-public-auth-submit" type="submit" id="echo-module-submit">Entrar</button><div class="echo-public-auth-message" id="echo-module-message"></div><div class="echo-public-auth-switch"><span id="echo-module-switch-text">Ainda não tem conta?</span> <button type="button" id="echo-module-switch">Registrar</button></div></form></section>`;
  document.body.appendChild(modal);
}
function bindAuth(login,account){
  ensureAuthModal();
  const modal=document.getElementById('echo-public-auth');
  const form=document.getElementById('echo-module-auth-form');
  const title=document.getElementById('echo-module-auth-title');
  const nameField=document.getElementById('echo-module-name-field');
  const nameInput=document.getElementById('echo-module-name');
  const handleField=document.getElementById('echo-module-handle-field');
  const handleInput=document.getElementById('echo-module-handle');
  const submit=document.getElementById('echo-module-submit');
  const message=document.getElementById('echo-module-message');
  const switchText=document.getElementById('echo-module-switch-text');
  const switchButton=document.getElementById('echo-module-switch');
  let mode='login';
  let signupHandleEnabled=false;
  const syncSignupFields=()=>{const register=mode==='register';nameField.hidden=!register;nameInput.required=register;handleField.hidden=!(register&&signupHandleEnabled);handleInput.required=register&&signupHandleEnabled;};
  const signupHandleGatePromise=identitySignupGateEnabled(supabase).then(enabled=>{signupHandleEnabled=enabled;syncSignupFields();return enabled;});
  const setMode=next=>{mode=next;const register=mode==='register';title.textContent=register?'Criar conta':'Entrar';submit.textContent=register?'Registrar':'Entrar';syncSignupFields();switchText.textContent=register?'Já tem uma conta?':'Ainda não tem conta?';switchButton.textContent=register?'Entrar':'Registrar';message.textContent='';};
  const open=next=>{setMode(next);modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.getElementById('echo-module-email')?.focus();};
  const close=()=>{modal.classList.remove('open');modal.setAttribute('aria-hidden','true');form?.reset();message.textContent='';};
  modal.querySelector('.echo-public-auth-close')?.addEventListener('click',close);
  modal.addEventListener('click',event=>{if(event.target===modal) close();});
  switchButton?.addEventListener('click',()=>setMode(mode==='login'?'register':'login'));
  handleInput?.addEventListener('input',()=>{handleInput.value=normalizePublicHandle(handleInput.value);});
  form?.addEventListener('submit',async event=>{
    event.preventDefault(); message.textContent='Processando...';
    const email=document.getElementById('echo-module-email').value.trim(); const password=document.getElementById('echo-module-password').value;
    if(mode==='register'){
      const displayName=document.getElementById('echo-module-name').value.trim();
      await signupHandleGatePromise;
      let metadata;
      try{metadata=identitySignupMetadata(displayName,handleInput?.value,signupHandleEnabled);}
      catch{message.textContent='Escolha um apelido de 3–24 caracteres com letras, números, ponto, hífen ou underline.';message.className='echo-public-auth-message error';return;}
      const {data,error}=await supabase.auth.signUp({email,password,options:{data: metadata,emailRedirectTo:identityProfileUrl(window.location.href)}});
      if(error){message.textContent=error.message;message.className='echo-public-auth-message error';return;}
      if(data?.session){window.location.assign(identityProfileUrl(window.location.href));return;}
      message.textContent='Conta criada. Confirme seu e-mail para concluir sua identidade em Meu Perfil.';message.className='echo-public-auth-message success';return;
    }
    const {error}=await supabase.auth.signInWithPassword({email,password});
    if(error){message.textContent=error.message;message.className='echo-public-auth-message error';return;} close();
  });
  const update=session=>{
    if(session?.user){login.textContent='Sair';login.onclick=()=>supabase.auth.signOut();account.textContent='Meu Perfil';account.disabled=false;account.onclick=()=>window.location.assign(identityProfileUrl(window.location.href));}
    else{login.textContent='Entrar';login.onclick=()=>open('login');account.textContent='Registrar';account.disabled=false;account.onclick=()=>open('register');}
  };
  supabase.auth.getSession().then(({data})=>update(data.session));
  supabase.auth.onAuthStateChange((_event,session)=>update(session));
}
function mount(){
  const old=document.querySelector('.module-topbar');
  if(!old) return;
  const header=document.createElement('header'); header.className='echo-public-topbar';
  header.innerHTML=`<a class="echo-public-brand" href="./index.html"><span class="echo-public-brand-mark"></span><span class="echo-public-brand-copy"><strong>ECHO <span>ARENA</span></strong><small>Community Intelligence</small></span></a><nav class="echo-public-mainnav" aria-label="Navegação principal">${navMarkup()}</nav><div class="echo-public-actions"><label class="echo-public-search">${searchIcon}<input id="echo-module-global-search" type="search" placeholder="Buscar nesta página"></label><button class="echo-public-login" id="echo-module-login" type="button">Entrar</button><button class="echo-public-account" id="echo-module-account" type="button">Registrar</button><button class="echo-public-menu" id="echo-public-menu" type="button" aria-label="Abrir menu" aria-expanded="false">${menuIcon}</button></div>`;
  old.replaceWith(header);
  document.querySelector('.module-sidebar')?.remove();
  document.querySelector('.module-sidebar-backdrop')?.remove();
  document.body.classList.add('echo-public-nav-enabled','echo-nav-module');
  const pageSearch=document.getElementById('module-search');
  const globalSearch=document.getElementById('echo-module-global-search');
  if(pageSearch&&globalSearch){globalSearch.addEventListener('input',()=>{pageSearch.value=globalSearch.value;pageSearch.dispatchEvent(new Event('input',{bubbles:true}));});}
  bindAuth(document.getElementById('echo-module-login'),document.getElementById('echo-module-account'));
  mountDrawer();
}

try{mount();}catch(error){console.error('[module-public-shell] falha ao montar cabeçalho:',error);}
