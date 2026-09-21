const modules = new Set(String(document.body.dataset.adminModules || '').split(',').map(value => value.trim()).filter(Boolean));
const founder = document.body.dataset.adminFounder === 'true';
if (!founder && !modules.has('quality')) {
  const main = document.querySelector('.admin-shell-main');
  if (main) main.innerHTML = '<section class="admin-panel"><h2>Acesso restrito</h2><p>O Laboratório Diversão exige o módulo de Qualidade e auditoria.</p><a class="admin-button" href="./index.html">Voltar ao painel</a></section>';
  throw new Error('quality_scope_required');
}

const frame = document.getElementById('diversao-lab-frame');
const statusNode = document.getElementById('diversao-lab-status');
const rosterNode = document.getElementById('diversao-lab-roster');
const classesNode = document.getElementById('diversao-lab-classes');
const overlayNode = document.getElementById('diversao-lab-overlay');
const fixtureNote = document.getElementById('diversao-lab-fixture-note');
const logNode = document.getElementById('diversao-lab-log');
const buttons = [...document.querySelectorAll('[data-lab-command]')];
const QA_MESSAGE = 'echoarena:diversao-qa-command';
const QA_RESULT = 'echoarena:diversao-qa-result';

function log(message) {
  const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  const line = `[${time}] ${message}`;
  logNode.textContent = `${line}\n${logNode.textContent}`.slice(0, 12000);
}

function setReady(ready) {
  statusNode.textContent = ready ? 'Pronto para testes' : 'Carregando página de Diversão';
  statusNode.dataset.ready = String(ready);
  buttons.forEach(button => { button.disabled = !ready; });
}

function send(action, detail = {}) {
  if (!frame?.contentWindow) return;
  frame.contentWindow.postMessage({ type: QA_MESSAGE, action, ...detail }, location.origin);
  log(`Comando: ${action}${detail.eventId ? ` / ${detail.eventId}` : ''}`);
}

buttons.forEach(button => button.addEventListener('click', () => {
  const action = button.dataset.labCommand;
  if (action === 'event') send('event', { eventId: button.dataset.eventId || 'standard' });
  else send(action);
}));

document.getElementById('diversao-lab-reload')?.addEventListener('click', () => {
  setReady(false);
  frame.src = `../diversao.html?qa=${Date.now()}`;
  log('Preview recarregado com cache-bust novo.');
});

window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== frame?.contentWindow || event.data?.type !== QA_RESULT) return;
  const { event: type, detail = {} } = event.data;

  if (type === 'ready') {
    setReady(true);
    rosterNode.textContent = String(detail.roster ?? '—');
    classesNode.textContent = Array.isArray(detail.classes) ? `${detail.classes.length} classes` : '—';
    fixtureNote.hidden = detail.perfectChaosUsesFixture !== true;
    log(`QA conectado · ${detail.roster} heróis · ${detail.classes?.length || 0} classes.`);
    return;
  }

  if (type === 'scenario') {
    log(`${detail.eventId}: ${detail.fixture ? 'fixture visual controlada' : 'roster real'} · ${detail.allies?.join(', ')} VS ${detail.enemies?.join(', ')}`);
    return;
  }

  if (type === 'overlay-opened') {
    overlayNode.textContent = `Aberto · ${detail.eventId || 'standard'}`;
    log(`Overlay abriu: ${detail.eventId || 'standard'}.`);
    return;
  }

  if (type === 'overlay-closed') {
    overlayNode.textContent = `Fechado · ${detail.durationMs ?? 0} ms`;
    log(`Overlay fechou (${detail.reason || 'normal'}) em ${detail.durationMs ?? 0} ms.`);
    return;
  }

  if (type === 'golden') {
    log('Câmara Dourada forçada visualmente para QA.');
    return;
  }

  if (type === 'runtime-error' || type === 'error') {
    overlayNode.textContent = 'Erro protegido';
    log(`ERRO: ${detail.message || 'falha não identificada'}`);
    return;
  }

  if (type === 'reset') log('Estados transitórios limpos.');
});

frame?.addEventListener('load', () => {
  setReady(false);
  log('Página carregada; aguardando ponte QA.');
});

setReady(false);
