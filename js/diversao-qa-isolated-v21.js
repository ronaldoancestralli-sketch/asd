await import('./diversao-qa.js?v=20260827-diversao-golden-v20-1&sb=20260823-security-supabase-pin-1&ops=20260905&sc=20260906-1&eq=20260907-effects-1');

const ISOLATED_KEY = 'echoarena:diversao-isolated-qa-v21';
const RESULT_KEY = 'echoarena:diversao-isolated-result-v21';
const params = new URLSearchParams(location.search);

function safeReturnHref(value) {
  const fallback = new URL('./admin/diversao-lab.html', location.href);
  try {
    const candidate = new URL(value || fallback.href, location.href);
    if (candidate.origin === location.origin && candidate.pathname.endsWith('/admin/diversao-lab.html')) return candidate.href;
  } catch {}
  return fallback.href;
}

function consumeCommand() {
  if (params.get('qa') !== 'isolated-v21' || params.get('qaRun') !== '1') return null;
  let raw = null;
  try {
    raw = sessionStorage.getItem(ISOLATED_KEY);
    sessionStorage.removeItem(ISOLATED_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const payload = JSON.parse(raw);
    const issuedAt = Number(payload?.issuedAt);
    const nonce = String(payload?.nonce || '');
    const requestedNonce = String(params.get('qaNonce') || '');
    const action = String(payload?.action || '');
    const allowedActions = new Set(['event', 'golden', 'random']);
    const allowedEvents = new Set(['complete', 'mirror', 'triple', 'perfect-chaos', 'standard']);
    if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > 60000 || issuedAt - Date.now() > 5000) return null;
    if (!nonce || nonce !== requestedNonce || !allowedActions.has(action)) return null;
    const eventId = payload?.eventId ? String(payload.eventId) : null;
    if (action === 'event' && !allowedEvents.has(eventId)) return null;
    return {
      action,
      eventId,
      returnHref: safeReturnHref(payload.returnHref)
    };
  } catch {
    return null;
  }
}

function storeResult(command, status, message = '') {
  try {
    sessionStorage.setItem(RESULT_KEY, JSON.stringify({
      action: command.action,
      eventId: command.eventId || null,
      status,
      message,
      completedAt: Date.now()
    }));
  } catch {}
}

function waitUntil(check, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const tick = () => {
      let ready = false;
      try { ready = Boolean(check()); } catch {}
      if (ready) {
        resolve();
        return;
      }
      if (performance.now() - startedAt >= timeoutMs) {
        reject(new Error('O runtime da Diversão não ficou pronto dentro do tempo esperado.'));
        return;
      }
      window.setTimeout(tick, 80);
    };
    tick();
  });
}

function labelFor(command) {
  if (command.action === 'golden') return 'Câmara Dourada';
  if (command.action === 'random') return 'Rodada aleatória real';
  return ({
    complete: 'Formação Completa',
    mirror: 'Confronto Espelho',
    triple: 'Trinca Selada',
    'perfect-chaos': 'Caos Perfeito',
    standard: 'Confronto padrão'
  })[command.eventId] || 'Evento QA';
}

function mountRunner(command) {
  document.documentElement.dataset.diversaoQaIsolated = 'v21';

  const panel = document.createElement('aside');
  panel.id = 'diversao-isolated-qa-runner';
  panel.setAttribute('aria-label', 'Runner isolado do Laboratório Diversão');
  Object.assign(panel.style, {
    position: 'fixed',
    zIndex: '2147483000',
    top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
    left: '12px',
    right: '12px',
    maxWidth: '420px',
    margin: '0 auto',
    padding: '12px',
    border: '1px solid rgba(255,211,100,.48)',
    borderRadius: '14px',
    background: '#0a0d16',
    color: '#eef3ff',
    boxShadow: '0 14px 34px rgba(0,0,0,.42)',
    fontFamily: 'Inter, system-ui, sans-serif'
  });

  const kicker = document.createElement('div');
  kicker.textContent = 'QA ISOLADO · IPHONE/WEBKIT';
  Object.assign(kicker.style, { fontSize: '9px', fontWeight: '900', letterSpacing: '.12em', color: '#d7b85a' });

  const title = document.createElement('strong');
  title.textContent = labelFor(command);
  Object.assign(title.style, { display: 'block', marginTop: '5px', fontSize: '17px' });

  const status = document.createElement('p');
  status.textContent = 'Preparando a página real sem iframe…';
  Object.assign(status.style, { margin: '6px 0 10px', color: '#9eabc0', fontSize: '11px', lineHeight: '1.45' });

  const actions = document.createElement('div');
  Object.assign(actions.style, { display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px' });

  const execute = document.createElement('button');
  execute.type = 'button';
  execute.textContent = 'Preparando…';
  execute.disabled = true;
  Object.assign(execute.style, {
    minHeight: '42px',
    border: '1px solid #9b7a2f',
    borderRadius: '10px',
    background: '#34280b',
    color: '#ffe59b',
    fontWeight: '900',
    fontSize: '11px'
  });

  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Voltar';
  Object.assign(back.style, {
    minHeight: '42px',
    padding: '0 14px',
    border: '1px solid #35445c',
    borderRadius: '10px',
    background: '#101827',
    color: '#dce7f6',
    fontWeight: '800',
    fontSize: '11px'
  });

  actions.append(execute, back);
  panel.append(kicker, title, status, actions);
  document.body.appendChild(panel);

  let ready = false;
  const prepare = async () => {
    try {
      await waitUntil(() => {
        const qa = window.echoArenaDiversaoQA;
        const runner = window.echoArenaDiversao;
        const baseReady = qa?.getRoster?.().length >= 6 && typeof runner?.run === 'function';
        const goldenReady = command.action !== 'golden' || typeof window.echoArenaDiversaoGolden?.armForced === 'function';
        return baseReady && goldenReady;
      });
      ready = true;
      execute.disabled = false;
      execute.textContent = 'Executar teste';
      status.textContent = 'Pronto. O toque abaixo inicia o runtime real e preserva a ativação de áudio do iPhone.';
    } catch (error) {
      storeResult(command, 'error', error?.message || String(error));
      status.textContent = error?.message || 'Falha ao preparar o runner.';
      execute.textContent = 'Indisponível';
    }
  };

  execute.addEventListener('click', () => {
    if (!ready) return;
    execute.disabled = true;
    execute.textContent = 'Executando…';
    status.textContent = 'Evento em andamento. Todos os arquivos e animações originais estão ativos.';

    let task;
    try {
      const qa = window.echoArenaDiversaoQA;
      const runner = window.echoArenaDiversao;
      if (command.action === 'golden') task = qa.forceGolden();
      else if (command.action === 'event') task = qa.renderScenario(command.eventId);
      else task = runner.run('full');
    } catch (error) {
      task = Promise.reject(error);
    }

    Promise.resolve(task).then(() => {
      storeResult(command, 'success');
      status.textContent = 'Teste concluído. Você pode repetir ou voltar ao Laboratório.';
      execute.disabled = false;
      execute.textContent = 'Executar novamente';
    }).catch(error => {
      storeResult(command, 'error', error?.message || String(error));
      status.textContent = `Falha protegida: ${error?.message || String(error)}`;
      execute.disabled = false;
      execute.textContent = 'Tentar novamente';
    });
  });

  back.addEventListener('click', () => {
    location.assign(command.returnHref);
  });

  prepare();
}

const command = consumeCommand();
if (command) mountRunner(command);
