const DIAGNOSTIC_KEY = 'echoarena:diversao-golden-diagnostic-v26';
const VERSION = 26;
const stage = document.getElementById('duel-stage');
const revolver = document.getElementById('revolver');
const shotNodes = [...document.querySelectorAll('[data-shot]')];
const teamRoots = [document.getElementById('your-team'), document.getElementById('enemy-team')].filter(Boolean);

let record = readRecord();
let stageGolden = stage?.classList.contains('golden-shot') === true;
let revolverFire = revolver?.classList.contains('fire') === true;
const seenRevealed = new WeakSet();
const seenGolden = new WeakSet();

function safeString(value, max = 180) {
  return String(value ?? '').slice(0, max);
}

function readRecord() {
  try {
    const raw = localStorage.getItem(DIAGNOSTIC_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.version === VERSION ? parsed : null;
  } catch {
    return null;
  }
}

function persist() {
  if (!record) return;
  try { localStorage.setItem(DIAGNOSTIC_KEY, JSON.stringify(record)); } catch {}
  renderDiagnosticStatus();
}

function normalizeDetail(detail = {}) {
  const normalized = {};
  Object.entries(detail).slice(0, 12).forEach(([key, value]) => {
    if (value === null || typeof value === 'number' || typeof value === 'boolean') normalized[key] = value;
    else normalized[key] = safeString(value);
  });
  return normalized;
}

function startRun(detail = {}) {
  record = {
    version: VERSION,
    runId: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    startedAt: Date.now(),
    completed: false,
    events: [],
    environment: {
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      ua: safeString(navigator.userAgent, 220)
    }
  };
  checkpoint('golden:armed', detail);
}

function checkpoint(step, detail = {}) {
  if (!record) {
    record = {
      version: VERSION,
      runId: `${Date.now()}-diagnostic`,
      startedAt: Date.now(),
      completed: false,
      events: []
    };
  }
  record.events = Array.isArray(record.events) ? record.events : [];
  record.events.push({ step, at: Date.now(), detail: normalizeDetail(detail) });
  if (record.events.length > 40) record.events = record.events.slice(-40);
  record.lastStep = step;
  record.lastAt = Date.now();
  persist();
}

function mediaInfo(card) {
  const image = card?.querySelector('img');
  if (image) {
    return {
      kind: 'img',
      hero: card.getAttribute('aria-label') || '',
      complete: image.complete,
      naturalWidth: image.naturalWidth || 0,
      naturalHeight: image.naturalHeight || 0
    };
  }
  const video = card?.querySelector('video');
  if (video) {
    return {
      kind: 'video',
      hero: card.getAttribute('aria-label') || '',
      readyState: video.readyState,
      videoWidth: video.videoWidth || 0,
      videoHeight: video.videoHeight || 0
    };
  }
  return { kind: 'none', hero: card?.getAttribute('aria-label') || '' };
}

function afterPaint(step, detail) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => checkpoint(step, detail));
  });
}

function ensureStatusNode() {
  const panel = document.getElementById('diversao-isolated-qa-runner');
  if (!panel) return null;
  let node = panel.querySelector('[data-golden-diagnostic-v26]');
  if (node) return node;
  node = document.createElement('div');
  node.dataset.goldenDiagnosticV26 = 'true';
  Object.assign(node.style, {
    marginTop: '8px',
    padding: '7px 8px',
    border: '1px solid rgba(215,184,90,.28)',
    borderRadius: '8px',
    background: 'rgba(20,15,5,.62)',
    color: '#d8c98f',
    font: '700 9px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace',
    overflowWrap: 'anywhere'
  });
  panel.appendChild(node);
  return node;
}

function renderDiagnosticStatus() {
  const node = ensureStatusNode();
  if (!node) return;
  if (!record?.lastStep) {
    node.textContent = 'DIAG V26 · aguardando execução';
    return;
  }
  const recovered = record.completed !== true && Date.now() - Number(record.lastAt || 0) > 1200;
  node.textContent = `DIAG V26 · ${recovered ? 'RECUPERADO · ' : ''}${record.lastStep}`;
}

function observeCard(card) {
  if (!(card instanceof HTMLElement) || !card.classList.contains('hero-draw-card')) return;
  if (card.classList.contains('revealed') && !seenRevealed.has(card)) {
    seenRevealed.add(card);
    const detail = mediaInfo(card);
    checkpoint('card:revealed', detail);
    afterPaint('card:revealed:paint-frame', detail);
  }
  if (card.classList.contains('golden-reveal') && !seenGolden.has(card)) {
    seenGolden.add(card);
    const detail = mediaInfo(card);
    checkpoint('card:golden-reveal', detail);
    afterPaint('card:golden-reveal:paint-frame', detail);
  }
}

document.addEventListener('echoarena:diversao-golden', event => {
  const detail = event.detail || {};
  if (detail.state === 'armed') startRun(detail);
  else checkpoint(`golden:${safeString(detail.state || 'event', 40)}`, detail);
});

document.addEventListener('echoarena:diversao-round-complete', event => {
  checkpoint('round:complete', { round: event.detail?.round, mode: event.detail?.mode });
  if (record) {
    record.completed = true;
    record.completedAt = Date.now();
    persist();
  }
});

if (stage) {
  const observer = new MutationObserver(() => {
    const next = stage.classList.contains('golden-shot');
    if (next !== stageGolden) {
      stageGolden = next;
      checkpoint(next ? 'stage:golden-shot:on' : 'stage:golden-shot:off');
    }
  });
  observer.observe(stage, { attributes: true, attributeFilter: ['class'] });
}

if (revolver) {
  const observer = new MutationObserver(() => {
    const next = revolver.classList.contains('fire');
    if (next !== revolverFire) {
      revolverFire = next;
      checkpoint(next ? 'revolver:fire:on' : 'revolver:fire:off');
    }
  });
  observer.observe(revolver, { attributes: true, attributeFilter: ['class'] });
}

shotNodes.forEach((node, index) => {
  let active = node.classList.contains('active');
  let goldenActive = node.classList.contains('golden-active');
  const observer = new MutationObserver(() => {
    const nextActive = node.classList.contains('active');
    const nextGolden = node.classList.contains('golden-active');
    if (nextActive !== active) {
      active = nextActive;
      checkpoint(`shot:${index}:active:${nextActive ? 'on' : 'off'}`);
    }
    if (nextGolden !== goldenActive) {
      goldenActive = nextGolden;
      checkpoint(`shot:${index}:golden-active:${nextGolden ? 'on' : 'off'}`);
    }
  });
  observer.observe(node, { attributes: true, attributeFilter: ['class'] });
});

teamRoots.forEach(root => {
  root.querySelectorAll('.hero-draw-card').forEach(observeCard);
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.type === 'attributes') observeCard(mutation.target);
      mutation.addedNodes.forEach(node => {
        if (!(node instanceof HTMLElement)) return;
        observeCard(node);
        node.querySelectorAll?.('.hero-draw-card').forEach(observeCard);
      });
    });
  });
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
});

window.addEventListener('pagehide', () => {
  if (record && record.completed !== true) checkpoint('pagehide');
});

Object.defineProperty(window, 'echoArenaDiversaoDiagnosticV26', {
  configurable: true,
  enumerable: false,
  value: Object.freeze({ read: () => readRecord(), checkpoint })
});

renderDiagnosticStatus();
