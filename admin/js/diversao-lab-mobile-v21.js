const modules = new Set(String(document.body.dataset.adminModules || '').split(',').map(value => value.trim()).filter(Boolean));
const founder = document.body.dataset.adminFounder === 'true';
if (!founder && !modules.has('quality')) {
  const main = document.querySelector('.admin-shell-main');
  if (main) main.innerHTML = '<section class="admin-panel"><h2>Acesso restrito</h2><p>O Laboratório Diversão exige o módulo de Qualidade e auditoria.</p><a class="admin-button" href="./index.html">Voltar ao painel</a></section>';
  throw new Error('quality_scope_required');
}

const frame = document.getElementById('diversao-lab-frame');
const previewPanel = frame?.closest('.fun-lab-preview');
const statusNode = document.getElementById('diversao-lab-status');
const rosterNode = document.getElementById('diversao-lab-roster');
const classesNode = document.getElementById('diversao-lab-classes');
const overlayNode = document.getElementById('diversao-lab-overlay');
const fixtureNote = document.getElementById('diversao-lab-fixture-note');
const logNode = document.getElementById('diversao-lab-log');
const buttons = [...document.querySelectorAll('[data-lab-command]')];
const reloadButton = document.getElementById('diversao-lab-reload');
const QA_MESSAGE = 'echoarena:diversao-qa-command';
const QA_RESULT = 'echoarena:diversao-qa-result';
const ISOLATED_KEY = 'echoarena:diversao-isolated-qa-v21';
const RESULT_KEY = 'echoarena:diversao-isolated-result-v21';

function isAppleTouchWebKit() {
  const ua = navigator.userAgent || '';
  const iOS = /iPhone|iPad|iPod/i.test(ua);
  const iPadDesktopUA = navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua);
  return (iOS || iPadDesktopUA) && /AppleWebKit/i.test(ua);
}

const ISOLATED_MOBILE = isAppleTouchWebKit() && window.matchMedia('(max-width: 1100px)').matches;

function log(message) {
  const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  const line = `[${time}] ${message}`;
  if (logNode) logNode.textContent = `${line}\n${logNode.textContent}`.slice(0, 12000);
}

function setReady(ready, label = null) {
  if (statusNode) {
    statusNode.textContent = label || (ready ? 'Pronto para testes' : 'Carregando página de Diversão');
    statusNode.dataset.ready = String(ready);
  }
  buttons.forEach(button => { button.disabled = !ready; });
}

function readIsolatedResult() {
  try {
    const raw = sessionStorage.getItem(RESULT_KEY);
    if (!raw) return;
    sessionStorage.removeItem(RESULT_KEY);
    const result = JSON.parse(raw);
    if (!result || typeof result !== 'object') return;
    if (result.status === 'success') {
      log(`Execução isolada concluída: ${result.action}${result.eventId ? ` / ${result.eventId}` : ''}.`);
    } else if (result.status === 'error') {
      log(`ERRO no runner isolado: ${result.message || 'falha não identificada'}`);
    }
  } catch (error) {
    console.warn('[diversao-lab] Resultado isolado inválido:', error);
  }
}

function setupIsolatedMobile() {
  document.body.dataset.diversaoQaMode = 'isolated-mobile';
  frame?.removeAttribute('src');
  if (frame) frame.hidden = true;
  if (previewPanel) {
    previewPanel.style.minHeight = '0';
    const headerSpan = previewPanel.querySelector('header span');
    if (headerSpan) headerSpan.textContent = 'iPhone/WebKit · execução isolada sem iframe';
    if (!previewPanel.querySelector('[data-isolated-mobile-note]')) {
      const note = document.createElement('div');
      note.className = 'fun-lab-note';
      note.dataset.isolatedMobileNote = 'true';
      note.innerHTML = '<strong>Modo protegido no iPhone:</strong> o preview pesado não fica embutido no Admin. Ao escolher um evento, a própria página Diversão abre em tela cheia e pede um toque para executar o teste com todos os arquivos, áudio e animações originais.';
      previewPanel.querySelector('header')?.insertAdjacentElement('afterend', note);
    }
  }
  if (rosterNode) rosterNode.textContent = 'carregado no runner';
  if (classesNode) classesNode.textContent = 'carregadas no runner';
  if (overlayNode) overlayNode.textContent = 'Tela cheia';
  if (fixtureNote) fixtureNote.hidden = true;
  if (reloadButton) reloadButton.textContent = 'Limpar runner isolado';
  setReady(true, 'Modo isolado no iPhone');
  log('iPhone/WebKit detectado: iframe da Diversão desativado para não competir com o Admin por memória/GPU.');
  readIsolatedResult();
}

function startEmbeddedPreview() {
  if (!frame) return;
  const source = frame.dataset.src;
  if (!source) throw new Error('Preview sem data-src configurado.');
  frame.hidden = false;
  frame.src = source;
  setReady(false);
}

function createNonce() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const bytes = new Uint32Array(4);
  globalThis.crypto?.getRandomValues?.(bytes);
  return [...bytes].map(value => value.toString(16).padStart(8, '0')).join('') || `${Date.now()}-${Math.random()}`;
}

function launchIsolated(action, detail = {}) {
  if (action === 'reset') {
    sessionStorage.removeItem(ISOLATED_KEY);
    if (overlayNode) overlayNode.textContent = 'Tela cheia';
    log('Runner isolado limpo; nenhum iframe permanece ativo no laboratório.');
    return;
  }

  const allowed = new Set(['event', 'golden', 'random']);
  if (!allowed.has(action)) {
    log(`Comando isolado recusado: ${action || 'vazio'}.`);
    return;
  }

  const nonce = createNonce();
  const payload = {
    version: 1,
    action,
    eventId: detail.eventId || null,
    issuedAt: Date.now(),
    nonce,
    returnHref: location.href
  };
  sessionStorage.setItem(ISOLATED_KEY, JSON.stringify(payload));

  const url = new URL('../diversao.html', location.href);
  url.searchParams.set('qa', 'isolated-v21');
  url.searchParams.set('qaRun', '1');
  url.searchParams.set('qaNonce', nonce);
  if (detail.eventId) url.searchParams.set('qaEvent', detail.eventId);

  log(`Abrindo runner isolado: ${action}${detail.eventId ? ` / ${detail.eventId}` : ''}.`);
  location.assign(url.href);
}

function send(action, detail = {}) {
  if (ISOLATED_MOBILE) {
    launchIsolated(action, detail);
    return;
  }
  if (!frame?.contentWindow) return;
  frame.contentWindow.postMessage({ type: QA_MESSAGE, action, ...detail }, location.origin);
  log(`Comando: ${action}${detail.eventId ? ` / ${detail.eventId}` : ''}`);
}

buttons.forEach(button => button.addEventListener('click', () => {
  const action = button.dataset.labCommand;
  if (action === 'event') send('event', { eventId: button.dataset.eventId || 'standard' });
  else send(action);
}));

reloadButton?.addEventListener('click', () => {
  if (ISOLATED_MOBILE) {
    sessionStorage.removeItem(ISOLATED_KEY);
    sessionStorage.removeItem(RESULT_KEY);
    log('Estado do runner isolado descartado. A próxima execução começará limpa.');
    return;
  }
  if (!frame?.dataset.src) return;
  setReady(false);
  const url = new URL(frame.dataset.src, location.href);
  url.searchParams.set('_qaReload', String(Date.now()));
  frame.src = url.href;
  log('Preview recarregado com cache-bust novo.');
});

window.addEventListener('message', event => {
  if (ISOLATED_MOBILE) return;
  if (event.origin !== location.origin || event.source !== frame?.contentWindow || event.data?.type !== QA_RESULT) return;
  const { event: type, detail = {} } = event.data;

  if (type === 'ready') {
    setReady(true);
    if (rosterNode) rosterNode.textContent = String(detail.roster ?? '—');
    if (classesNode) classesNode.textContent = Array.isArray(detail.classes) ? `${detail.classes.length} classes` : '—';
    if (fixtureNote) fixtureNote.hidden = detail.perfectChaosUsesFixture !== true;
    log(`QA conectado · ${detail.roster} heróis · ${detail.classes?.length || 0} classes.`);
    return;
  }

  if (type === 'scenario') {
    log(`${detail.eventId}: ${detail.fixture ? 'fixture visual controlada' : 'roster real'} · ${detail.allies?.join(', ')} VS ${detail.enemies?.join(', ')}`);
    return;
  }

  if (type === 'overlay-opened') {
    if (overlayNode) overlayNode.textContent = `Aberto · ${detail.eventId || 'standard'}`;
    log(`Overlay abriu: ${detail.eventId || 'standard'}.`);
    return;
  }

  if (type === 'overlay-closed') {
    if (overlayNode) overlayNode.textContent = `Fechado · ${detail.durationMs ?? 0} ms`;
    log(`Overlay fechou (${detail.reason || 'normal'}) em ${detail.durationMs ?? 0} ms.`);
    return;
  }

  if (type === 'golden') {
    const state = detail.state || 'atualizado';
    log(`Câmara Dourada · ${state}${Number.isInteger(detail.index) ? ` · pulso ${detail.index + 1}` : ''}.`);
    return;
  }

  if (type === 'runtime-error' || type === 'error') {
    if (overlayNode) overlayNode.textContent = 'Erro protegido';
    log(`ERRO: ${detail.message || 'falha não identificada'}`);
    return;
  }

  if (type === 'reset') log('Estados transitórios limpos.');
});

frame?.addEventListener('load', () => {
  if (ISOLATED_MOBILE) return;
  setReady(false);
  log('Página carregada; aguardando ponte QA.');
});

if (ISOLATED_MOBILE) setupIsolatedMobile();
else startEmbeddedPreview();
