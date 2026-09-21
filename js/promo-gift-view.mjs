const STYLE_ID = 'echo-promo-code-style';
const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';

export function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
}

export function safeHttps(value = '') {
  try {
    const url = new URL(String(value).trim());
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function expiryLabel(value) {
  if (!value) return 'Validade não informada';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Validade indisponível';
  return `Até ${new Intl.DateTimeFormat('pt-BR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(date)} · horário local`;
}

function giftMarkup() {
  return '<span class="echo-promo-gift-shadow"></span><span class="echo-promo-gift-light"></span><span class="echo-promo-gift-body"><span class="echo-promo-gift-ribbon"></span><span class="echo-promo-gift-seal">✦</span></span><span class="echo-promo-gift-lid"><span class="echo-promo-gift-bow bow-left"></span><span class="echo-promo-gift-bow bow-right"></span><span class="echo-promo-gift-knot"></span></span>';
}

export function giftMarkupFor(promo) {
  const source = safeHttps(promo.source_url);
  const sourceName = escapeHtml(promo.source_name || (source ? 'Fonte da promoção' : 'Publicado pelo Echo Arena'));
  const redemption = source
    ? 'Copiar não resgata automaticamente. Confira as instruções da fonte informada para usar o código no jogo.'
    : 'Copiar não resgata automaticamente. Confira o resgate diretamente no jogo.';
  const detailsLabel = source ? 'Detalhes e fonte da promoção' : 'Detalhes da promoção';
  return `<dialog class="echo-promo-dialog" aria-labelledby="echo-promo-title" aria-describedby="echo-promo-description">
    <article class="echo-promo-sheet">
      <header class="echo-promo-top"><span class="echo-promo-brand">ECHO<span>ARENA</span></span><div class="echo-promo-controls"><button class="echo-promo-motion" type="button" aria-label="Pausar animações" aria-pressed="false" title="Pausar animações"><span aria-hidden="true">Ⅱ</span></button><button class="echo-promo-minimize" type="button" aria-label="Minimizar presente">−</button></div></header>
      <div class="echo-promo-intro"><span class="echo-promo-event">✦ ${promo.__preview ? 'PRÉVIA ADMIN · NÃO PUBLICADO' : 'DROP ESPECIAL · BULLET ECHO'}</span><h2 id="echo-promo-title" tabindex="-1">Tem presente<br><em>na arena.</em></h2><p id="echo-promo-description" class="echo-promo-description">Curta para abrir o presente e revelar o código promocional.</p></div>
      <div class="echo-promo-stage"><span class="echo-promo-orbit orbit-one" aria-hidden="true"></span><span class="echo-promo-orbit orbit-two" aria-hidden="true"></span><span class="echo-promo-burst" aria-hidden="true"></span><span class="echo-promo-spark spark-one" aria-hidden="true">✦</span><span class="echo-promo-spark spark-two" aria-hidden="true">✦</span><span class="echo-promo-spark spark-three" aria-hidden="true">✧</span><span class="echo-promo-spark spark-four" aria-hidden="true">✧</span><span class="echo-promo-spark spark-five" aria-hidden="true">✦</span><span class="echo-promo-spark spark-six" aria-hidden="true">✧</span><button type="button" class="echo-promo-gift" aria-label="Curtir e abrir presente" disabled><span aria-hidden="true">${giftMarkup()}</span></button></div>
      <div class="echo-promo-campaign"><strong>${escapeHtml(promo.title)}</strong></div>
      <div class="echo-promo-reward" hidden><span class="echo-promo-unlocked">${HEART} SEU CÓDIGO PROMOCIONAL</span><div class="echo-promo-code-box" tabindex="0" aria-label="Código promocional revelado"></div><button class="echo-promo-copy-button" type="button">Copiar código</button><p class="echo-promo-redemption">${redemption}</p></div>
      <div class="echo-promo-action-area"><button class="echo-promo-button" type="button" disabled>${HEART}<span>Preparando seu presente…</span><span class="echo-promo-arrow" aria-hidden="true">↗</span></button><p class="echo-promo-action-note">Uma curtida no Echo Arena para revelar. Sem sorteio.</p></div>
      <p class="echo-promo-status" role="status" aria-live="polite" aria-atomic="true"></p>
      <footer class="echo-promo-footer"><details class="echo-promo-details"><summary>${detailsLabel}</summary><div class="echo-promo-details-content"><span class="echo-promo-label">${escapeHtml(promo.banner_label || 'CÓDIGO PROMOCIONAL')}</span><strong>${escapeHtml(promo.title)}</strong><p>${escapeHtml(promo.reward || promo.banner_message || 'Curta para revelar o código promocional.')}</p><div class="echo-promo-source-line">${source ? `<a class="echo-promo-source" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">${sourceName} ↗</a>` : `<span>${sourceName}</span>`}</div></div></details><span class="echo-promo-expiry">${escapeHtml(promo.__preview ? 'Prévia visual · nenhum resgate real' : expiryLabel(promo.expires_at))}</span></footer>
    </article>
  </dialog><button class="echo-promo-launcher" type="button" aria-haspopup="dialog" aria-controls="echo-promo-dialog" aria-expanded="false"><span class="echo-promo-launcher-icon" aria-hidden="true">${giftMarkup()}</span><span><strong>Tem presente na arena</strong><small>Toque para abrir</small></span><span aria-hidden="true">↗</span></button>`;
}

export function createPromoGiftView(promo, {onAction, onMinimize = () => {}, win = window, doc = document} = {}) {
  if (!doc.getElementById(STYLE_ID)) {
    const link = doc.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = new URL('../css/public-promo-code.css?v=20260831-promo-source-1', import.meta.url).href;
    doc.head.appendChild(link);
  }
  const root = doc.createElement('aside');
  root.id = 'echo-promo-code';
  root.className = 'echo-promo-code';
  root.dataset.state = 'checking';
  root.dataset.motion = 'paused';
  root.innerHTML = giftMarkupFor(promo);
  doc.body.appendChild(root);
  const find = selector => root.querySelector(selector);
  const dialog = find('.echo-promo-dialog');
  dialog.id = 'echo-promo-dialog';
  const launcher = find('.echo-promo-launcher');
  const button = find('.echo-promo-button');
  const gift = find('.echo-promo-gift');
  const codeBox = find('.echo-promo-code-box');
  const reward = find('.echo-promo-reward');
  const status = find('.echo-promo-status');
  const title = find('#echo-promo-title');
  const actionArea = find('.echo-promo-action-area');
  const copy = find('.echo-promo-copy-button');
  const motionButton = find('.echo-promo-motion');
  const hasSource = Boolean(safeHttps(promo.source_url));
  const timers = new Set();
  let code = '';
  let disposed = false;
  let returnFocus = null;
  let scrollLock = null;
  let canAct = false;
  let motionPaused = false;
  let celebrationTimer = null;
  const motionQuery = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reduced = () => motionQuery?.matches === true;
  const canAnimate = () => !disposed && !motionPaused && !reduced() && dialog.open && doc.visibilityState !== 'hidden';
  const later = (fn, ms) => {
    const timer = win.setTimeout(() => { timers.delete(timer); if (!disposed) fn(); }, ms);
    timers.add(timer);
    return timer;
  };
  function finishCelebration() {
    celebrationTimer = null;
    dialog.querySelector('.echo-promo-confetti-layer')?.remove();
    delete root.dataset.celebrating;
  }
  function scheduleCelebrationEnd(ms) {
    if (celebrationTimer !== null) {
      win.clearTimeout(celebrationTimer);
      timers.delete(celebrationTimer);
    }
    celebrationTimer = later(finishCelebration, ms);
  }
  function cleanEffects() {
    timers.forEach(timer => win.clearTimeout(timer));
    timers.clear();
    finishCelebration();
  }
  function syncMotion() {
    root.dataset.motion = canAnimate() ? 'active' : 'paused';
    motionButton.disabled = reduced();
    motionButton.setAttribute('aria-pressed', String(motionPaused || reduced()));
    motionButton.title = reduced() ? 'Movimento reduzido pelo sistema' : motionPaused ? 'Retomar animações' : 'Pausar animações';
    motionButton.querySelector('span').textContent = motionPaused || reduced() ? '▶' : 'Ⅱ';
    if (root.dataset.motion === 'paused') {
      if (root.dataset.state === 'opening') completeReveal();
      cleanEffects();
    }
  }
  function message(text, error = false) {
    status.textContent = text;
    status.classList.toggle('echo-promo-error', error);
  }
  function setAction(text, enabled) {
    canAct = enabled;
    button.disabled = !enabled;
    gift.disabled = !enabled;
    button.querySelector('span').textContent = text;
    gift.setAttribute('aria-label', text);
  }
  function lockPageScroll() {
    if (scrollLock) return;
    const page = doc.documentElement;
    const body = doc.body;
    const computed = win.getComputedStyle?.(body);
    const width = computed?.width || '100%';
    const fixed = computed?.position !== 'fixed';
    scrollLock = {
      overflow:page.style.overflow,
      x:win.scrollX || 0, y:win.scrollY || 0, fixed,
      body:Object.fromEntries(['position', 'top', 'left', 'width'].map(key => [key, body.style[key]]))
    };
    page.style.overflow = 'hidden';
    // A fixed body also locks the background in touch browsers. Keep its used
    // width and exact scroll position so opening/closing cannot shift the page.
    if (fixed) {
      body.style.position = 'fixed';
      body.style.top = `${-scrollLock.y}px`;
      body.style.left = `${-scrollLock.x}px`;
      body.style.width = width;
    }
  }
  function unlockPageScroll() {
    if (!scrollLock) return;
    const saved = scrollLock;
    scrollLock = null;
    doc.documentElement.style.overflow = saved.overflow;
    if (saved.fixed) {
      Object.assign(doc.body.style, saved.body);
      const behavior = doc.documentElement.style.scrollBehavior;
      doc.documentElement.style.scrollBehavior = 'auto';
      win.scrollTo?.(saved.x, saved.y);
      doc.documentElement.style.scrollBehavior = behavior;
    }
  }
  function onViewportChange() {
    if (disposed || !dialog.open) return;
    // Rotation, split view or browser chrome can invalidate particle positions.
    // Settle only an already confirmed result, without issuing another request.
    if (root.dataset.state === 'opening') {
      completeReveal();
      cleanEffects();
    } else if (root.dataset.celebrating === 'true') {
      if (celebrationTimer !== null) {
        win.clearTimeout(celebrationTimer);
        timers.delete(celebrationTimer);
      }
      finishCelebration();
    }
  }
  function open({automatic = false} = {}) {
    if (disposed || root.dataset.state === 'expired' || dialog.open) return false;
    const otherDialog = doc.querySelector('dialog[open], .auth-modal.open, [role="dialog"][aria-modal="true"][aria-hidden="false"]');
    if (otherDialog && otherDialog !== dialog) return false;
    if (automatic && doc.visibilityState === 'hidden') return false;
    returnFocus = doc.activeElement;
    if (typeof dialog.showModal !== 'function') return false;
    dialog.showModal();
    lockPageScroll();
    launcher.hidden = true;
    launcher.setAttribute('aria-expanded', 'true');
    syncMotion();
    title.focus({preventScroll:true});
    return true;
  }
  function completeReveal() {
    if (!code || disposed) return;
    root.dataset.state = 'revealed';
    reward.hidden = false;
    actionArea.hidden = true;
    codeBox.textContent = code;
    codeBox.classList.add('revealed');
    title.textContent = 'Presente aberto!';
    find('#echo-promo-description').textContent = hasSource
      ? 'Seu código está pronto. Copie e confira o resgate na fonte informada.'
      : 'Seu código está pronto. Copie e confira o resgate diretamente no jogo.';
    find('.echo-promo-launcher strong').textContent = 'Seu código está pronto';
    find('.echo-promo-launcher small').textContent = 'Toque para consultar';
    message(promo.__preview ? 'Prévia concluída — nada foi gravado no banco.' : 'Curtida confirmada. Código liberado para copiar.');
    if (promo.__preview) {
      find('.echo-promo-unlocked').textContent = 'PRÉVIA · SEM CURTIDA REAL';
      find('.echo-promo-redemption').textContent = 'Código demonstrativo, sem valor de resgate. Nenhuma curtida foi gravada.';
      copy.textContent = 'Copiar prévia';
    }
    if (dialog.open && (doc.activeElement === button || doc.activeElement === gift)) copy.focus({preventScroll:true});
    // End the celebration promptly so the code remains the focus, without cancelling copy feedback.
    if (root.dataset.celebrating === 'true') scheduleCelebrationEnd(900);
  }
  function minimize({remember = true, focus = true} = {}) {
    if (disposed) return;
    if (root.dataset.state === 'opening') completeReveal();
    cleanEffects();
    if (dialog.open) dialog.close();
    syncMotion();
    unlockPageScroll();
    launcher.hidden = root.dataset.state === 'expired';
    launcher.setAttribute('aria-expanded', 'false');
    if (remember) onMinimize();
    if (focus) (returnFocus?.isConnected && returnFocus !== doc.body ? returnFocus : launcher).focus?.({preventScroll:true});
  }
  function launchConfetti() {
    if (!canAnimate()) return;
    const rect = gift.getBoundingClientRect();
    const layer = doc.createElement('div');
    layer.className = 'echo-promo-confetti-layer';
    layer.setAttribute('aria-hidden', 'true');
    const colors = ['#ffda7b', '#c6a0ff', '#7bf1d5', '#fff4cf', '#ff94cf', '#9edcff'];
    const compactViewport = Math.min(win.innerWidth, win.innerHeight || win.innerWidth) < 600;
    const count = compactViewport ? 72 : 108;
    const perWave = count / 3;
    for (let i = 0; i < count; i += 1) {
      const piece = doc.createElement('i');
      const shape = i % 11 === 0 ? 'heart' : i % 7 === 0 ? 'star' : i % 5 === 0 ? 'circle' : 'ribbon';
      piece.className = `echo-promo-confetti is-${shape}`;
      if (shape === 'heart') piece.textContent = '♥';
      const wave = Math.floor(i / perWave);
      const angle = Math.PI + ((i % perWave) / (perWave - 1)) * Math.PI;
      const distance = Math.min(win.innerWidth * .7, 440) * (.6 + Math.random() * .4);
      const burstX = Math.cos(angle) * distance;
      const burstY = Math.sin(angle) * Math.min(distance, 300) - 55;
      const spin = (i % 2 ? 1 : -1) * (300 + (i % 9) * 85);
      const fall = Math.min((win.innerHeight || 850) * .75, 580) * (.55 + Math.random() * .45);
      // Three staggered waves share one layer; the layer fades once the code is revealed.
      piece.style.cssText = `--burst-x:${burstX}px;--burst-y:${burstY}px;--drift-x:${burstX * 1.2}px;--fall-y:${fall}px;--turn:${spin * .35}deg;--spin:${spin}deg;--duration:${2200 + (i % 4) * 180}ms;--delay:${wave * 160 + (i % 5) * 20}ms;--color:${colors[i % colors.length]};left:${rect.left + rect.width / 2 + (wave - 1) * 14}px;top:${rect.top + rect.height * .4}px`;
      layer.appendChild(piece);
    }
    dialog.appendChild(layer);
    scheduleCelebrationEnd(3500);
  }
  function lock({authenticated = false, checking = false, notice = ''} = {}) {
    const moveFocus = reward.contains(doc.activeElement);
    cleanEffects();
    code = '';
    codeBox.textContent = '';
    codeBox.classList.remove('revealed');
    reward.hidden = true;
    copy.disabled = false;
    actionArea.hidden = false;
    root.dataset.state = checking ? 'checking' : 'locked';
    root.removeAttribute('aria-busy');
    title.innerHTML = 'Tem presente<br><em>na arena.</em>';
    find('#echo-promo-description').textContent = 'Curta para abrir o presente e revelar o código promocional.';
    find('.echo-promo-launcher strong').textContent = 'Tem presente na arena';
    find('.echo-promo-launcher small').textContent = 'Toque para abrir';
    setAction(checking ? 'Preparando seu presente…' : promo.__preview ? 'Testar abertura do presente' : authenticated ? 'Curtir e abrir presente' : 'Entrar para curtir', !checking);
    find('.echo-promo-action-note').textContent = promo.__preview ? 'Prévia sem curtidas ou resgates reais.' : authenticated ? 'Sem sorteio. Resgate no jogo.' : 'Entre na conta e depois curta para abrir.';
    message(notice);
    if (dialog.open && moveFocus) (checking ? title : button).focus({preventScroll:true});
  }
  function expire() {
    lock();
    root.dataset.state = 'expired';
    setAction('Promoção encerrada', false);
    title.textContent = 'Esse presente se encerrou.';
    find('#echo-promo-description').textContent = 'O código não está mais disponível nesta campanha.';
    launcher.hidden = true;
    message(hasSource ? 'Consulte a fonte informada para mais detalhes.' : 'Confira no jogo se o código continua válido.');
  }
  button.addEventListener('click', () => { if (canAct) onAction?.(); });
  gift.addEventListener('click', () => { if (canAct) onAction?.(); });
  motionButton.addEventListener('click', () => { motionPaused = !motionPaused; syncMotion(); });
  doc.addEventListener('visibilitychange', syncMotion);
  motionQuery?.addEventListener?.('change', syncMotion);
  win.addEventListener?.('resize', onViewportChange, {passive:true});
  win.visualViewport?.addEventListener?.('resize', onViewportChange, {passive:true});
  launcher.addEventListener('click', () => open());
  find('.echo-promo-minimize').addEventListener('click', () => minimize());
  dialog.addEventListener('cancel', event => { event.preventDefault(); minimize(); });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const candidates = [...dialog.querySelectorAll('button:not(:disabled), a[href], summary, [tabindex="0"]')].filter(el => !el.closest('[hidden]') && (!el.closest('details:not([open])') || el.matches('summary')));
    const first = candidates[0];
    const last = candidates[candidates.length - 1];
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (doc.activeElement === first || doc.activeElement === title)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  copy.addEventListener('click', async () => {
    if (root.dataset.state !== 'revealed' || !code) return;
    if (promo.expires_at && new Date(promo.expires_at).getTime() <= Date.now()) { expire(); return; }
    const copying = code;
    try {
      await win.navigator.clipboard.writeText(copying);
      if (disposed || code !== copying) return;
      copy.textContent = 'Copiado!';
      message(promo.__preview
        ? 'Prévia copiada — sem valor de resgate.'
        : hasSource
          ? 'Código copiado. Confira a fonte informada para resgatar no jogo.'
          : 'Código copiado. Confira o resgate diretamente no jogo.');
      later(() => { copy.textContent = promo.__preview ? 'Copiar prévia' : 'Copiar código'; }, 1800);
    } catch {
      if (disposed || code !== copying) return;
      codeBox.focus();
      const range = doc.createRange();
      range.selectNodeContents(codeBox);
      const selection = win.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      message('Não foi possível copiar automaticamente. O código foi selecionado para você copiar.', true);
    }
  });
  return {
    root, open, minimize, lock, expire, message,
    isOpen: () => dialog.open,
    waiting() { root.dataset.state = 'waiting'; root.setAttribute('aria-busy', 'true'); setAction(promo.__preview ? 'Preparando a prévia…' : 'Confirmando sua curtida…', false); message(promo.__preview ? 'Simulação visual, sem gravação.' : 'Aguarde a confirmação para abrir.'); },
    error(text, {blocked = false, authenticated = true} = {}) { lock({authenticated}); if (blocked) setAction('Ação indisponível', false); message(text, true); },
    reveal(value, {celebrate = false} = {}) {
      cleanEffects();
      code = value;
      root.removeAttribute('aria-busy');
      setAction('Presente aberto', false);
      if (!celebrate || !canAnimate()) { completeReveal(); return; }
      root.dataset.state = 'opening';
      root.dataset.celebrating = 'true';
      message(promo.__preview ? 'Prévia: abrindo seu presente…' : 'Curtida confirmada. Abrindo seu presente…');
      later(launchConfetti, 650);
      later(completeReveal, 1400);
    },
    suspend() { root.dataset.motion = 'paused'; if (root.dataset.state === 'opening') completeReveal(); cleanEffects(); },
    destroy() { if (disposed) return; minimize({remember:false,focus:false}); code = ''; codeBox.textContent = ''; disposed = true; doc.removeEventListener('visibilitychange', syncMotion); motionQuery?.removeEventListener?.('change', syncMotion); win.removeEventListener?.('resize', onViewportChange); win.visualViewport?.removeEventListener?.('resize', onViewportChange); root.remove(); }
  };
}
