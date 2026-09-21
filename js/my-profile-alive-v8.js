import {
  COMMUNITY_TIER_GLYPHS,
  COMMUNITY_TIER_ORDER,
  communityTierState,
  pointPreviewValues
} from './my-profile-experience-v7.js?v=20260825-identity-experience-v7-1';

export const IDENTITY_SIMULATION_LIMIT = 50;

export const IDENTITY_TIER_LABELS = Object.freeze({
  member: 'Member',
  echo_scout: 'Echo Scout',
  tracker: 'Rastreador',
  cartographer: 'Cartógrafo',
  analyst: 'Analista',
  vanguard: 'Vanguarda',
  arena_legend: 'Lenda da Arena'
});

function simulationCount(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= IDENTITY_SIMULATION_LIMIT ? parsed : null;
}

export function projectedIdentityPoints(counts, policy) {
  if (!counts || typeof counts !== 'object') return null;
  const values = pointPreviewValues(policy);
  if (!values) return null;
  const corroborated = simulationCount(counts.corroborated);
  const verified = simulationCount(counts.verified);
  const first = simulationCount(counts.first);
  if ([corroborated, verified, first].some((value) => value === null)) return null;

  const corroboratedPoints = corroborated * values.corroborated;
  const verifiedPoints = verified * values.verified;
  const firstPoints = first * values.firstTotal;
  return Object.freeze({
    corroborated,
    verified,
    first,
    corroboratedPoints,
    verifiedPoints,
    firstPoints,
    total: corroboratedPoints + verifiedPoints + firstPoints,
    weights: values
  });
}

export function showroomPreviewState(actualTier, selectedTier) {
  const actual = String(actualTier || '');
  const selected = String(selectedTier || '');
  if (!COMMUNITY_TIER_ORDER.includes(selected)) return null;
  const state = communityTierState(actual, selected);
  const status = state === 'current'
    ? 'SEU NÍVEL ATUAL'
    : state === 'reached'
      ? 'JÁ CONQUISTADA'
      : state === 'locked'
        ? 'PRÉVIA BLOQUEADA'
        : 'PRÉVIA DA COLEÇÃO';
  return Object.freeze({
    tier: selected,
    label: IDENTITY_TIER_LABELS[selected],
    glyph: COMMUNITY_TIER_GLYPHS[selected] || '•',
    state,
    status
  });
}

let simulatorPolicy = null;
let simulatorCounts = { corroborated: 1, verified: 1, first: 1 };
let actualPreview = { tier: '', label: 'SEM NÍVEL CONFIRMADO', glyph: '?', unavailable: true };
let initialized = false;
let revealObserver = null;

function element(id) { return document.getElementById(id); }
function format(value) { return Number(value || 0).toLocaleString('pt-BR'); }

function pointerTilt(target, surface, prefix) {
  if (!target || !surface || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let frame = 0;
  target.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = ((event.clientX - rect.left) / rect.width) - .5;
      const y = ((event.clientY - rect.top) / rect.height) - .5;
      surface.style.setProperty(`--${prefix}-ry`, `${(x * 7).toFixed(2)}deg`);
      surface.style.setProperty(`--${prefix}-rx`, `${(-y * 6).toFixed(2)}deg`);
    });
  });
  target.addEventListener('pointerleave', () => {
    cancelAnimationFrame(frame);
    surface.style.setProperty(`--${prefix}-ry`, '0deg');
    surface.style.setProperty(`--${prefix}-rx`, '0deg');
  });
}

export function clearIdentityGateway(container) {
  container?.classList.remove('identity-v8-state');
  container?.setAttribute('aria-live', 'polite');
}

export function renderIdentityGateway(container, onLogin) {
  const template = element('identity-v8-gateway-template');
  if (!container || !(template instanceof HTMLTemplateElement)) return false;
  container.classList.add('identity-v8-state');
  container.setAttribute('aria-live', 'off');
  container.replaceChildren(template.content.cloneNode(true));

  element('identity-v8-gateway-login')?.addEventListener('click', () => onLogin?.());
  const gateway = container.querySelector('.identity-v8-gateway');
  const card = element('identity-v8-demo-card');
  container.querySelectorAll('[data-gateway-accent]').forEach((button) => {
    button.addEventListener('click', () => {
      const accent = String(button.dataset.gatewayAccent || 'violet');
      gateway.dataset.accent = accent;
      container.querySelectorAll('[data-gateway-accent]').forEach((candidate) => {
        candidate.setAttribute('aria-pressed', String(candidate === button));
      });
    });
  });
  pointerTilt(card, card, 'gateway');
  return true;
}

function simulatorButtons() {
  return Array.from(document.querySelectorAll('[data-simulator-step]'));
}

function renderSimulator(animate = false) {
  const root = element('identity-v8-simulator');
  if (!root) return;
  element('identity-v8-simulator-corroborated-value').textContent = format(simulatorCounts.corroborated);
  element('identity-v8-simulator-verified-value').textContent = format(simulatorCounts.verified);
  element('identity-v8-simulator-first-value').textContent = format(simulatorCounts.first);
  const projection = projectedIdentityPoints(simulatorCounts, simulatorPolicy);
  root.dataset.policyReady = String(Boolean(projection));

  for (const button of simulatorButtons()) {
    const article = button.closest('[data-simulator-kind]');
    const kind = article?.dataset.simulatorKind;
    const value = simulationCount(simulatorCounts[kind]);
    const step = button.dataset.simulatorStep;
    button.disabled = !projection || value === null || (step === 'decrease' ? value <= 0 : value >= IDENTITY_SIMULATION_LIMIT);
  }

  const total = element('identity-v8-simulator-total');
  const breakdown = element('identity-v8-simulator-breakdown');
  if (!projection) {
    total.textContent = '—';
    breakdown.textContent = 'Política indisponível. Nenhum peso foi presumido pelo simulador.';
    return;
  }

  total.textContent = format(projection.total);
  breakdown.textContent = `${projection.corroborated}×${format(projection.weights.corroborated)} + ${projection.verified}×${format(projection.weights.verified)} + ${projection.first}×${format(projection.weights.firstTotal)}. A primeira descoberta já inclui verificação e bônus.`;
  if (animate) {
    root.classList.remove('is-calculating');
    requestAnimationFrame(() => root.classList.add('is-calculating'));
    window.setTimeout(() => root.classList.remove('is-calculating'), 220);
  }
}

export function syncIdentityAlivePolicy(policy) {
  simulatorPolicy = policy && pointPreviewValues(policy) ? policy : null;
  renderSimulator();
}

function resetShowroom() {
  const preview = element('identity-v7-preview');
  const showroom = element('identity-v8-showroom');
  if (!preview || !showroom) return;
  preview.classList.remove('is-showroom');
  preview.dataset.tier = actualPreview.unavailable ? 'unavailable' : actualPreview.tier;
  element('preview-tier-glyph').textContent = actualPreview.glyph;
  element('preview-tier').textContent = actualPreview.label;
  showroom.hidden = true;
  document.querySelectorAll('#my-scout-track .my-scout-step').forEach((button) => button.setAttribute('aria-pressed', 'false'));
}

function exploreTier(button) {
  const previewState = showroomPreviewState(actualPreview.tier, button?.dataset.tier);
  const preview = element('identity-v7-preview');
  const showroom = element('identity-v8-showroom');
  if (!previewState || !preview || !showroom) return;
  preview.classList.add('is-showroom');
  preview.dataset.tier = previewState.tier;
  element('preview-tier-glyph').textContent = previewState.glyph;
  element('preview-tier').textContent = previewState.label.toUpperCase();
  element('identity-v8-showroom-label').textContent = `${previewState.status} · SIMULAÇÃO VISUAL`;
  showroom.hidden = false;
  document.querySelectorAll('#my-scout-track .my-scout-step').forEach((candidate) => candidate.setAttribute('aria-pressed', String(candidate === button)));
}

export function syncIdentityAliveJourney({ tier = '', label = '', glyph = '?', unavailable = false } = {}) {
  const knownTier = COMMUNITY_TIER_ORDER.includes(String(tier));
  actualPreview = {
    tier: knownTier ? String(tier) : '',
    label: String(label || (knownTier ? IDENTITY_TIER_LABELS[tier] : 'SEM NÍVEL CONFIRMADO')).toUpperCase(),
    glyph: knownTier ? String(glyph || COMMUNITY_TIER_GLYPHS[tier] || '•') : '?',
    unavailable: Boolean(unavailable || !knownTier)
  };
  resetShowroom();
}

function bindSimulator() {
  const root = element('identity-v8-simulator');
  if (!root) return;
  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-simulator-step]');
    if (!button || button.disabled) return;
    const kind = button.closest('[data-simulator-kind]')?.dataset.simulatorKind;
    if (!Object.hasOwn(simulatorCounts, kind)) return;
    const delta = button.dataset.simulatorStep === 'increase' ? 1 : -1;
    simulatorCounts = { ...simulatorCounts, [kind]: Math.max(0, Math.min(IDENTITY_SIMULATION_LIMIT, simulatorCounts[kind] + delta)) };
    renderSimulator(true);
  });
  element('identity-v8-simulator-reset')?.addEventListener('click', () => {
    simulatorCounts = { corroborated: 1, verified: 1, first: 1 };
    renderSimulator(true);
  });
  renderSimulator();
}

function bindShowroom() {
  element('my-scout-track')?.addEventListener('click', (event) => {
    const button = event.target.closest('.my-scout-step');
    if (button) exploreTier(button);
  });
  element('identity-v8-showroom-reset')?.addEventListener('click', resetShowroom);
}

function bindCardTilt() {
  const preview = element('identity-v7-preview');
  const frame = preview?.querySelector('.identity-v7-preview-frame');
  pointerTilt(preview, frame, 'identity-v8');
}

export function initializeIdentityAliveV8() {
  if (initialized || typeof document === 'undefined') return;
  initialized = true;
  bindSimulator();
  bindShowroom();
  bindCardTilt();
}

export function activateIdentityAliveV8() {
  initializeIdentityAliveV8();
  const targets = document.querySelectorAll('.identity-v7-launch, #identity-v7-builder, #identity-v7-points, .identity-v7-journey, #my-research-v5');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    targets.forEach((target) => target.classList.add('is-visible'));
    return;
  }
  revealObserver?.disconnect();
  revealObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  }, { threshold: .08, rootMargin: '0px 0px -7% 0px' });
  targets.forEach((target) => {
    target.setAttribute('data-identity-v8-reveal', '');
    revealObserver.observe(target);
  });
}

export function celebrateIdentitySave() {
  const preview = element('identity-v7-preview');
  if (!preview) return;
  preview.classList.remove('identity-v8-saved');
  requestAnimationFrame(() => preview.classList.add('identity-v8-saved'));
  window.setTimeout(() => preview.classList.remove('identity-v8-saved'), 820);
}
