import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import { echoDrawerMarkup } from './public-navigation.js?v=20260822-drawer-unified-1&sb=20260823-security-supabase-pin-1&ops=20260905&sc=20260906-1&eq=20260907-effects-1';
import {
  identityProfileUrl,
  identitySignupGateEnabled,
  identitySignupMetadata,
  normalizePublicHandle
} from './identity-public-launch-v6.js?v=20260825-identity-public-v6-1';

const params = new URL(import.meta.url).searchParams;
const mode = params.get('mode') || 'site-shell';
const activeId = params.get('active') || '';

const NAV_ITEMS = [
  ['inicio', 'Início', './index.html'],
  ['herois', 'Heróis', './herois.html'],
  ['builds', 'Builds', './builds.html'],
  ['equipamentos', 'Equipamentos', './equipamentos.html'],
  ['comparar', 'Comparar', './comparar-build.html'],
  ['estatisticas', 'Estatísticas', './estatisticas.html'],
  ['composicoes', 'Composições', './composicoes.html']
];

const iconSearch = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>';
const iconMenu = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"></path></svg>';

function waitFor(selector, timeout = 8000) {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);
    const started = performance.now();
    const timer = setInterval(() => {
      const found = document.querySelector(selector);
      if (found || performance.now() - started >= timeout) {
        clearInterval(timer);
        resolve(found || null);
      }
    }, 40);
  });
}

function navMarkup() {
  return NAV_ITEMS.map(([id, label, href]) =>
    `<a class="${id === activeId ? 'on' : ''}" href="${href}">${label}</a>`
  ).join('');
}

function setDrawerOpen(open) {
  document.body.classList.toggle('echo-public-drawer-open', open);
  document.getElementById('echo-public-drawer')?.setAttribute('aria-hidden', String(!open));
  document.getElementById('echo-public-menu')?.setAttribute('aria-expanded', String(open));
  if (open) document.getElementById('echo-public-drawer-close')?.focus();
}

function bindDrawer() {
  document.getElementById('echo-public-menu')?.addEventListener('click', () => setDrawerOpen(true));
  document.getElementById('echo-public-drawer-close')?.addEventListener('click', () => setDrawerOpen(false));
  document.getElementById('echo-public-backdrop')?.addEventListener('click', () => setDrawerOpen(false));
  document.querySelectorAll('#echo-public-drawer a').forEach(link => link.addEventListener('click', () => setDrawerOpen(false)));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.body.classList.contains('echo-public-drawer-open')) setDrawerOpen(false);
  });
}

function createDrawer() {
  const backdrop = document.createElement('div');
  backdrop.className = 'echo-public-backdrop';
  backdrop.id = 'echo-public-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');

  const drawer = document.createElement('aside');
  drawer.className = 'echo-public-drawer';
  drawer.id = 'echo-public-drawer';
  drawer.setAttribute('aria-hidden', 'true');
  drawer.setAttribute('aria-label', 'Centro de navegação Echo Arena');
  drawer.innerHTML = `
    <div class="echo-public-drawer-head">
      <div class="echo-public-drawer-brand"><span class="echo-public-brand-mark" aria-hidden="true"></span><div><strong>ECHO ARENA</strong><small>Centro de navegação</small></div></div>
      <button class="echo-public-drawer-close" id="echo-public-drawer-close" type="button" aria-label="Fechar menu">×</button>
    </div>
    <div class="echo-public-drawer-scroll">${echoDrawerMarkup(activeId)}</div>
    <div class="echo-public-drawer-footer">Navegação centralizada do <strong>Echo Arena</strong>.</div>`;
  document.body.append(backdrop, drawer);
}

function createHeader({ loginButton, accountButton, searchInput, extraAction }) {
  const header = document.createElement('header');
  header.className = 'echo-public-topbar';
  header.innerHTML = `
    <a class="echo-public-brand" href="./index.html" aria-label="Echo Arena — Início"><span class="echo-public-brand-mark"></span><span class="echo-public-brand-copy"><strong>ECHO <span>ARENA</span></strong><small>Community Intelligence</small></span></a>
    <nav class="echo-public-mainnav" aria-label="Navegação principal">${navMarkup()}</nav>
    <div class="echo-public-actions"></div>`;

  const actions = header.querySelector('.echo-public-actions');
  const search = document.createElement('label');
  search.className = 'echo-public-search';
  search.setAttribute('aria-label', 'Buscar');
  search.innerHTML = iconSearch;
  if (!searchInput) {
    searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'Buscar herói, build ou jogador';
    searchInput.id = 'echo-global-search';
  }
  search.appendChild(searchInput);
  actions.appendChild(search);

  if (extraAction) {
    extraAction.className = 'echo-nav-icon-action';
    actions.appendChild(extraAction);
  }

  loginButton.classList.remove('btn-o', 'login-btn');
  loginButton.classList.add('echo-public-login');
  accountButton.classList.remove('btn-g', 'account-btn');
  accountButton.classList.add('echo-public-account');
  actions.append(loginButton, accountButton);

  const menu = document.createElement('button');
  menu.className = 'echo-public-menu';
  menu.id = 'echo-public-menu';
  menu.type = 'button';
  menu.setAttribute('aria-label', 'Abrir menu');
  menu.setAttribute('aria-expanded', 'false');
  menu.innerHTML = iconMenu;
  actions.appendChild(menu);
  return header;
}

function mirrorHeroesSearch(searchInput) {
  if (activeId !== 'herois') return;
  const pageSearch = document.getElementById('search');
  if (!pageSearch) return;
  searchInput.addEventListener('input', () => {
    pageSearch.value = searchInput.value;
    pageSearch.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function createCompareAuthButtons() {
  const login = document.createElement('button');
  login.id = 'echo-compare-login';
  login.type = 'button';
  login.textContent = 'Entrar';
  const account = document.createElement('button');
  account.id = 'echo-compare-account';
  account.type = 'button';
  account.textContent = 'Registrar';
  return { login, account };
}

function ensureCompareAuthModal() {
  if (document.getElementById('echo-public-auth')) return;
  const modal = document.createElement('div');
  modal.id = 'echo-public-auth';
  modal.className = 'echo-public-auth';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <section class="echo-public-auth-card" role="dialog" aria-modal="true" aria-labelledby="echo-auth-title">
      <div class="echo-public-auth-head"><h2 id="echo-auth-title">Entrar</h2><button class="echo-public-auth-close" type="button" aria-label="Fechar">×</button></div>
      <form class="echo-public-auth-form" id="echo-public-auth-form">
        <label id="echo-auth-name-field" hidden>Nome de exibição<input id="echo-auth-name" type="text" minlength="2" maxlength="40" autocomplete="name"></label>
        <label id="echo-auth-handle-field" hidden>Apelido público<input id="echo-auth-handle" type="text" minlength="3" maxlength="24" pattern="[a-z0-9][a-z0-9._-]{1,22}[a-z0-9]" autocomplete="nickname" autocapitalize="none" spellcheck="false" placeholder="seu-apelido"></label>
        <label>E-mail<input id="echo-auth-email" type="email" required autocomplete="email"></label>
        <label>Senha<input id="echo-auth-password" type="password" required minlength="8" autocomplete="current-password"></label>
        <button class="echo-public-auth-submit" type="submit" id="echo-auth-submit">Entrar</button>
        <div class="echo-public-auth-message" id="echo-auth-message"></div>
        <div class="echo-public-auth-switch"><span id="echo-auth-switch-text">Ainda não tem conta?</span> <button type="button" id="echo-auth-switch">Registrar</button></div>
      </form>
    </section>`;
  document.body.appendChild(modal);
}

function compareAuthController(loginButton, accountButton) {
  ensureCompareAuthModal();
  let authMode = 'login';
  const modal = document.getElementById('echo-public-auth');
  const title = document.getElementById('echo-auth-title');
  const submit = document.getElementById('echo-auth-submit');
  const nameField = document.getElementById('echo-auth-name-field');
  const nameInput = document.getElementById('echo-auth-name');
  const handleField = document.getElementById('echo-auth-handle-field');
  const handleInput = document.getElementById('echo-auth-handle');
  const password = document.getElementById('echo-auth-password');
  const message = document.getElementById('echo-auth-message');
  const switchText = document.getElementById('echo-auth-switch-text');
  const switchButton = document.getElementById('echo-auth-switch');
  let signupHandleEnabled = false;

  const syncSignupFields = () => {
    const register = authMode === 'register';
    nameField.hidden = !register;
    nameInput.required = register;
    handleField.hidden = !(register && signupHandleEnabled);
    handleInput.required = register && signupHandleEnabled;
  };
  const signupHandleGatePromise = identitySignupGateEnabled(supabase).then(enabled => {
    signupHandleEnabled = enabled;
    syncSignupFields();
    return enabled;
  });

  const setMode = next => {
    authMode = next;
    const register = next === 'register';
    title.textContent = register ? 'Criar conta' : 'Entrar';
    submit.textContent = register ? 'Registrar' : 'Entrar';
    syncSignupFields();
    password.autocomplete = register ? 'new-password' : 'current-password';
    switchText.textContent = register ? 'Já tem uma conta?' : 'Ainda não tem conta?';
    switchButton.textContent = register ? 'Entrar' : 'Registrar';
    message.textContent = '';
    message.className = 'echo-public-auth-message';
  };
  const open = next => { setMode(next); modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); document.getElementById('echo-auth-email')?.focus(); };
  const close = () => { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); document.getElementById('echo-public-auth-form')?.reset(); };
  const show = (text, type = '') => { message.textContent = text; message.className = `echo-public-auth-message ${type}`.trim(); };

  document.querySelector('.echo-public-auth-close')?.addEventListener('click', close);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  switchButton.addEventListener('click', () => setMode(authMode === 'login' ? 'register' : 'login'));
  handleInput.addEventListener('input', () => { handleInput.value = normalizePublicHandle(handleInput.value); });
  document.getElementById('echo-public-auth-form').addEventListener('submit', async event => {
    event.preventDefault();
    show('Processando...');
    const email = document.getElementById('echo-auth-email').value.trim();
    const pass = document.getElementById('echo-auth-password').value;
    if (authMode === 'register') {
      const displayName = document.getElementById('echo-auth-name').value.trim();
      await signupHandleGatePromise;
      let metadata;
      try {
        metadata = identitySignupMetadata(displayName, handleInput.value, signupHandleEnabled);
      } catch {
        show('Escolha um apelido de 3–24 caracteres com letras, números, ponto, hífen ou underline.', 'error');
        return;
      }
      const { data, error } = await supabase.auth.signUp({ email, password: pass, options: { data: metadata, emailRedirectTo: identityProfileUrl(window.location.href) } });
      if (error) return show(error.message, 'error');
      if (data?.session) {
        window.location.assign(identityProfileUrl(window.location.href));
        return;
      }
      show('Conta criada. Confirme seu e-mail para concluir sua identidade em Meu Perfil.', 'success');
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) return show(error.message, 'error');
    close();
  });

  const update = async session => {
    if (session?.user) {
      loginButton.textContent = 'Sair';
      loginButton.onclick = () => supabase.auth.signOut();
      accountButton.textContent = 'Meu Perfil';
      accountButton.disabled = false;
      accountButton.onclick = () => window.location.assign(identityProfileUrl(window.location.href));
    } else {
      loginButton.textContent = 'Entrar';
      loginButton.onclick = () => open('login');
      accountButton.textContent = 'Registrar';
      accountButton.disabled = false;
      accountButton.onclick = () => open('register');
    }
  };

  supabase.auth.getSession().then(({ data }) => update(data.session));
  supabase.auth.onAuthStateChange((_event, session) => update(session));
}

async function mountSiteShellHeader() {
  const oldTopbar = await waitFor('.topbar');
  const shell = await waitFor('.shell');
  if (!oldTopbar || !shell) return;

  const loginButton = oldTopbar.querySelector('#login-btn') || document.getElementById('login-btn');
  const accountButton = oldTopbar.querySelector('#register-btn') || document.getElementById('register-btn');
  if (!loginButton || !accountButton) return;

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.id = 'echo-global-search';
  searchInput.placeholder = 'Buscar herói, build ou jogador';
  mirrorHeroesSearch(searchInput);

  const header = createHeader({ loginButton, accountButton, searchInput });
  document.querySelector('.side')?.remove();
  oldTopbar.replaceWith(header);
  document.body.classList.add('echo-public-nav-enabled', 'echo-nav-site-shell');
  createDrawer();
  bindDrawer();
}

async function mountCompareHeader() {
  const oldTopbar = await waitFor('.page-frame > .topbar');
  const pageFrame = await waitFor('.page-frame');
  if (!oldTopbar || !pageFrame) return;

  const searchInput = oldTopbar.querySelector('#build-search') || document.getElementById('build-search');
  const extraAction = oldTopbar.querySelector('#share-comparison') || document.getElementById('share-comparison');
  const { login, account } = createCompareAuthButtons();
  const header = createHeader({ loginButton: login, accountButton: account, searchInput, extraAction });

  document.querySelector('.side-rail')?.remove();
  oldTopbar.remove();
  document.body.insertBefore(header, document.body.firstChild);
  document.body.classList.add('echo-public-nav-enabled', 'echo-nav-compare');
  createDrawer();
  bindDrawer();
  compareAuthController(login, account);
}

try {
  if (mode === 'compare') await mountCompareHeader();
  else await mountSiteShellHeader();
} catch (error) {
  console.error('[public-header-sync] falha ao unificar cabeçalho:', error);
}
