import { createPromoGiftView } from './promo-gift-view.mjs?v=20260831-promo-source-1';

const PROMO_GAME = 'Bullet Echo';
const PREVIEW_CODE = 'PREVIA-NAO-REAL';
const OPEN_INTENT_KEY = 'echo-promo-open-intent';
const INTENT_TTL = 5 * 60 * 1000;

export function isExpired(promo, now = Date.now()) {
  if (!promo?.expires_at) return false;
  const timestamp = new Date(promo.expires_at).getTime();
  return !Number.isFinite(timestamp) || timestamp <= now;
}

export function revealedRow(data, id) {
  const row = Array.isArray(data) ? data[0] : data;
  return row?.promo_id === id && typeof row.code === 'string' && row.code.trim().length > 0 && row.code.length <= 160 ? row : null;
}

export function createPromoCodeController({client, viewFactory = createPromoGiftView, win = window, doc = document, now = () => Date.now()} = {}) {
  let promo = null;
  let view = null;
  let userId = null;
  let authEpoch = 0;
  let loadEpoch = 0;
  let operation = 0;
  let busy = false;
  let unlocked = false;
  let disposed = false;
  let expiryTimer = 0;
  let loginTimer = 0;
  let subscription = null;
  const deferred = new Set();
  const storage = {
    get(key) { try { return win.sessionStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { win.sessionStorage.setItem(key, value); } catch { /* no storage is also supported */ } },
    remove(key) { try { win.sessionStorage.removeItem(key); } catch { /* noop */ } }
  };
  const minimizedKey = id => `echo-promo-minimized:${id}`;
  const url = () => { try { return new URL(win.location.href); } catch { return null; } };
  const previewRequested = () => url()?.searchParams.get('promo_preview') === '1';
  function removeParams(...keys) {
    const next = url();
    if (!next) return;
    keys.forEach(key => next.searchParams.delete(key));
    try { win.history.replaceState(win.history.state, '', next.pathname + next.search + next.hash); } catch { /* noop */ }
  }
  function defer(fn, delay = 0) {
    const timer = win.setTimeout(() => { deferred.delete(timer); if (!disposed) void fn(); }, delay);
    deferred.add(timer);
    return timer;
  }
  async function bounded(promise) {
    let timer;
    try {
      return await Promise.race([promise, new Promise((_, reject) => { timer = win.setTimeout(() => reject(new Error('promo_request_timeout')), 12000); })]);
    } finally { win.clearTimeout(timer); }
  }
  function stillCurrent(targetView, targetId, identity, epoch, request) {
    return !disposed && view === targetView && promo?.id === targetId && userId === identity && authEpoch === epoch && operation === request && !isExpired(promo, now());
  }
  function invalidate() { operation += 1; busy = false; unlocked = false; }
  function removeView() {
    invalidate();
    win.clearTimeout(expiryTimer);
    view?.destroy();
    view = null;
    promo = null;
  }
  function clearIntent() { storage.remove(OPEN_INTENT_KEY); }
  function hasOpenIntent(id) {
    try {
      const intent = JSON.parse(storage.get(OPEN_INTENT_KEY) || 'null');
      return intent?.id === id && Number.isFinite(intent.at) && now() >= intent.at && now() - intent.at <= INTENT_TTL;
    } catch { return false; }
  }
  function scheduleExpiry() {
    win.clearTimeout(expiryTimer);
    if (!promo?.expires_at) return;
    const delay = new Date(promo.expires_at).getTime() - now();
    if (!Number.isFinite(delay) || delay <= 0) { invalidate(); view?.expire(); return; }
    expiryTimer = win.setTimeout(() => {
      if (isExpired(promo, now())) { invalidate(); view?.expire(); clearIntent(); }
      else scheduleExpiry();
    }, Math.min(delay + 10, 2147483000));
  }
  async function canUseAdminPreview() {
    if (!userId || !client.auth.mfa?.getAuthenticatorAssuranceLevel) return false;
    const {data:aal, error:aalError} = await bounded(client.auth.mfa.getAuthenticatorAssuranceLevel());
    if (aalError || aal?.currentLevel !== 'aal2') return false;
    const {data, error} = await bounded(client.rpc('echo_is_admin'));
    return !error && data === true;
  }
  function previewPromo() {
    return {id:'admin-preview',game:PROMO_GAME,title:'Uma surpresa especial para a comunidade',reward:'',banner_label:'CÓDIGO PROMOCIONAL',banner_message:'Teste a abertura e a revelação do presente.',source_name:'Prévia administrativa do Echo Arena',source_url:'',expires_at:null,__preview:true};
  }
  async function syncLiked() {
    if (!view || !promo || disposed || busy) return;
    if (isExpired(promo, now())) { invalidate(); view.expire(); return; }
    if (promo.__preview || !userId) { view.lock({authenticated:Boolean(userId)}); return; }
    const targetView = view;
    const targetId = promo.id;
    const identity = userId;
    const epoch = authEpoch;
    const request = ++operation;
    view.lock({authenticated:true,checking:true});
    try {
      const {data, error} = await bounded(client.rpc('promo_reveal_if_liked', {p_promo_id:targetId}));
      if (!stillCurrent(targetView, targetId, identity, epoch, request)) return;
      if (error) throw error;
      const row = revealedRow(data, targetId);
      if (row) { unlocked = true; view.reveal(row.code, {celebrate:false}); }
      else view.lock({authenticated:true});
    } catch (error) {
      if (!stillCurrent(targetView, targetId, identity, epoch, request)) return;
      view.error(error.message === 'promo_user_blocked' ? 'Sua conta não pode abrir este presente agora.' : 'Não foi possível consultar sua curtida. Tente abrir novamente.', {blocked:error.message === 'promo_user_blocked'});
    }
  }
  function requestLogin() {
    if (!promo || !view) return;
    storage.set(OPEN_INTENT_KEY, JSON.stringify({id:promo.id,at:now()}));
    // Intent only reopens the gift after login. It never writes a like.
    view.minimize({remember:false,focus:false});
    if (!/\/(?:index\.html)?$/i.test(win.location.pathname)) {
      const destination = new URL('./index.html', win.location.href);
      destination.searchParams.set('promo', promo.id);
      win.location.assign(destination.href);
      return;
    }
    win.clearTimeout(loginTimer);
    let attempts = 0;
    const tryOpen = () => {
      if (disposed || userId || !promo) return;
      const login = doc.getElementById('login-btn');
      if (login && /^entr/i.test(login.textContent.trim())) { login.click(); return; }
      attempts += 1;
      if (attempts < 20) loginTimer = win.setTimeout(tryOpen, 100);
      else { view?.open(); view?.message('A entrada na conta ainda não está disponível. Tente novamente.', true); }
    };
    tryOpen();
  }
  async function activate() {
    if (disposed || !view || !promo || busy || unlocked) return false;
    if (isExpired(promo, now())) { invalidate(); view.expire(); return false; }
    if (!promo.__preview && !userId) { requestLogin(); return false; }
    const targetView = view;
    const targetId = promo.id;
    const identity = userId;
    const epoch = authEpoch;
    const request = ++operation;
    busy = true;
    targetView.waiting();
    try {
      if (promo.__preview) {
        // Revalidate preview authorization on each action; never call the write RPC.
        if (!await canUseAdminPreview()) throw new Error('promo_preview_denied');
        if (!stillCurrent(targetView, targetId, identity, epoch, request)) return false;
        unlocked = true;
        targetView.reveal(PREVIEW_CODE, {celebrate:true});
        return true;
      }
      const {data, error} = await bounded(client.rpc('promo_like_and_reveal', {p_promo_id:targetId}));
      if (!stillCurrent(targetView, targetId, identity, epoch, request)) return false;
      if (error) throw error;
      const row = revealedRow(data, targetId);
      if (!row) throw new Error('promo_code_unavailable');
      unlocked = true;
      targetView.reveal(row.code, {celebrate:true});
      clearIntent();
      removeParams('promo');
      return true;
    } catch (error) {
      if (!stillCurrent(targetView, targetId, identity, epoch, request)) return false;
      if (error.message === 'promo_not_available') { targetView.expire(); return false; }
      const blocked = ['promo_user_blocked','promo_preview_denied'].includes(error.message);
      targetView.error(blocked ? 'Sua conta não pode abrir este presente agora.' : 'Não foi possível confirmar a abertura. Tente novamente; sua curtida não será duplicada.', {blocked,authenticated:Boolean(userId)});
      return false;
    } finally {
      if (operation === request) busy = false;
    }
  }
  function mount(next) {
    const same = promo?.id === next.id;
    const reopen = same ? view?.isOpen() : storage.get(minimizedKey(next.id)) !== '1' || url()?.searchParams.get('promo') === next.id;
    removeView();
    promo = next;
    view = viewFactory(next, {onAction:activate,onMinimize:() => storage.set(minimizedKey(next.id), '1'),win,doc});
    view.lock({authenticated:Boolean(userId),checking:Boolean(userId) && !next.__preview});
    if (reopen || next.__preview) view.open({automatic:true});
    scheduleExpiry();
  }
  async function load() {
    if (disposed) return null;
    const request = ++loadEpoch;
    const epoch = authEpoch;
    invalidate();
    // A refresh revokes the previous code before any network wait.
    view?.lock({authenticated:Boolean(userId),checking:true});
    try {
      const {data:sessionData, error:sessionError} = await bounded(client.auth.getSession());
      if (disposed || request !== loadEpoch || epoch !== authEpoch) return null;
      if (sessionError) throw sessionError;
      userId = sessionData?.session?.user?.id || null;
      let next;
      if (previewRequested()) {
        const allowed = await canUseAdminPreview();
        if (disposed || request !== loadEpoch || epoch !== authEpoch) return null;
        if (allowed) next = previewPromo();
        else removeParams('promo_preview','preview_v');
      }
      if (!next) {
        const timestamp = new Date(now()).toISOString();
        const {data, error} = await bounded(client.from('promo_campaigns')
          .select('id,game,title,reward,banner_label,banner_message,source_name,source_url,discovered_at,expires_at')
          .eq('game',PROMO_GAME)
          .eq('published',true)
          .eq('verification_status','verified')
          .eq('status','active')
          .or(`starts_at.is.null,starts_at.lte.${timestamp}`)
          .or(`expires_at.is.null,expires_at.gt.${timestamp}`)
          .order('discovered_at',{ascending:false})
          .limit(1)
          .maybeSingle());
        if (error) throw error;
        next = data;
      }
      if (disposed || request !== loadEpoch || epoch !== authEpoch) return null;
      if (!next || isExpired(next, now())) { removeView(); return null; }
      mount(next);
      await syncLiked();
      return view;
    } catch {
      if (!disposed && request === loadEpoch && epoch === authEpoch) {
        // No cached code or invented campaign is displayed on failure.
        view?.error('Não foi possível atualizar este presente. Recarregue a página para tentar novamente.', {blocked:true,authenticated:Boolean(userId)});
      }
      return null;
    }
  }
  function onAuth(event, session) {
    if (disposed || event === 'INITIAL_SESSION') return;
    const nextUserId = session?.user?.id || null;
    if (nextUserId === userId && event !== 'SIGNED_OUT' && !(promo?.__preview && ['TOKEN_REFRESHED','MFA_CHALLENGE_VERIFIED'].includes(event))) return;
    userId = nextUserId;
    authEpoch += 1;
    loadEpoch += 1;
    invalidate();
    win.clearTimeout(loginTimer);
    const epoch = authEpoch;
    const shouldReopen = Boolean(userId && promo && hasOpenIntent(promo.id));
    if (!userId) clearIntent();
    if (promo?.__preview) { removeView(); if (!userId) removeParams('promo_preview','preview_v'); }
    else view?.lock({authenticated:Boolean(userId),checking:Boolean(userId),notice:userId ? '' : 'Entre na sua conta para consultar seu presente.'});
    // Keep all Supabase calls outside the synchronous auth callback (auth lock).
    defer(async () => {
      if (epoch !== authEpoch) return;
      if (!view) await load();
      else await syncLiked();
      if (epoch === authEpoch && shouldReopen) { clearIntent(); view?.open(); }
    });
  }
  function onVisibility() {
    if (doc.visibilityState === 'hidden') { view?.suspend(); return; }
    if (isExpired(promo, now())) { invalidate(); view?.expire(); }
    if (!busy) void load();
  }
  function onPageShow(event) { if (event.persisted) void load(); }
  return {
    load, activate, onAuth,
    async start() {
      storage.remove('echo-promo-pending');
      subscription = client.auth.onAuthStateChange(onAuth)?.data?.subscription;
      doc.addEventListener('visibilitychange', onVisibility);
      win.addEventListener('pageshow', onPageShow);
      return load();
    },
    destroy() {
      if (disposed) return;
      removeView();
      disposed = true;
      loadEpoch += 1;
      authEpoch += 1;
      deferred.forEach(timer => win.clearTimeout(timer));
      deferred.clear();
      win.clearTimeout(loginTimer);
      subscription?.unsubscribe();
      doc.removeEventListener('visibilitychange', onVisibility);
      win.removeEventListener('pageshow', onPageShow);
    }
  };
}
