import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';
import { resolveMediaUrl, uploadMedia, removeR2Media } from '../../js/media-storage.js?v=20260823-security-supabase-pin-1';
import { initAdminLocalImageImport } from './admin-ai-image-import.js?v=20260916-automatic-recognition-1&nocr=20260828-paddle-browser-v3&parser=20260901-equipment-ocr-evidence-2&sb=20260823-security-supabase-pin-1&eq=20260907-effects-1';
import {
  buildHeroReadiness,
  createDiff,
  projectUpdateState,
  summarizeDiffs
} from './hero-update-review.js?v=20260831-hero-update-review-1';
import {
  mapImportedHeroStats
} from './hero-stat-import-mapping.js?v=20260917-status-bindings-1';

const STORAGE_BUCKET = 'game-media';
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_VIDEO_FILE_SIZE = 20 * 1024 * 1024;
const IMPORT_KEY = 'hero-import-draft';
const SAVE_RECEIPT_KEY = 'hero-save-success-receipt';
const IMPORT_SCHEMA_VERSION = 2;

const params = new URLSearchParams(location.search);
const heroId = params.get('id');

const form = document.getElementById('hero-form');
const message = document.getElementById('message');
const saveButton = document.getElementById('save-hero-button');

const fields = {
  name: document.getElementById('name'),
  slug: document.getElementById('slug'),
  classId: document.getElementById('class-id'),
  rarityId: document.getElementById('rarity-id'),
  faction: document.getElementById('faction'),
  displayOrder: document.getElementById('display-order'),
  description: document.getElementById('description'),
  enabled: document.getElementById('enabled'),
  imageFile: document.getElementById('image-file'),
  cardFile: document.getElementById('card-file'),
  gifFile: document.getElementById('gif-file'),
  buildImageFile: document.getElementById('build-image-file'),
  buildCardFile: document.getElementById('build-card-file'),
  screenVideoFile: document.getElementById('screen-video-file'),
  screenVideoIntensity: document.getElementById('screen-video-intensity'),
  screenVideoIntensityValue: document.getElementById('screen-video-intensity-value'),
  screenVideoBrightness: document.getElementById('screen-video-brightness'),
  screenVideoBrightnessValue: document.getElementById('screen-video-brightness-value'),
  screenVideoContrast: document.getElementById('screen-video-contrast'),
  screenVideoContrastValue: document.getElementById('screen-video-contrast-value'),
  screenVideoSaturation: document.getElementById('screen-video-saturation'),
  screenVideoSaturationValue: document.getElementById('screen-video-saturation-value'),
  screenVideoHue: document.getElementById('screen-video-hue'),
  screenVideoHueValue: document.getElementById('screen-video-hue-value'),
  screenVideoTint: document.getElementById('screen-video-tint'),
  screenVideoTintValue: document.getElementById('screen-video-tint-value'),
  screenVideoVignette: document.getElementById('screen-video-vignette'),
  screenVideoVignetteValue: document.getElementById('screen-video-vignette-value'),
  screenVideoScale: document.getElementById('screen-video-scale'),
  screenVideoScaleValue: document.getElementById('screen-video-scale-value'),
  screenVideoOffsetX: document.getElementById('screen-video-offset-x'),
  screenVideoOffsetXValue: document.getElementById('screen-video-offset-x-value'),
  screenVideoOffsetY: document.getElementById('screen-video-offset-y'),
  screenVideoOffsetYValue: document.getElementById('screen-video-offset-y-value'),
  screenVideoRotation: document.getElementById('screen-video-rotation'),
  screenVideoRotationValue: document.getElementById('screen-video-rotation-value'),
  screenVideoRemove: document.getElementById('screen-video-remove')
};

const previewElements = {
  live: document.getElementById('hero-live-preview'),
  name: document.getElementById('preview-name'),
  slug: document.getElementById('preview-slug'),
  description: document.getElementById('preview-description'),
  enabled: document.getElementById('preview-enabled')
};


const integratedStats = {
  heroGrid: document.getElementById('hero-stats-grid'),
  weaponGrid: document.getElementById('weapon-stats-grid'),
  heroPreview: document.getElementById('hero-stats-preview'),
  weaponPreview: document.getElementById('weapon-stats-preview'),
  weaponName: document.getElementById('weapon-name'),
  applyImport: document.getElementById('apply-imported-stats'),
  undoImport: document.getElementById('undo-imported-stats')
};

const HERO_STAT_CATEGORIES = new Set([
  'hero',
  'defense',
  'utility'
]);

const WEAPON_STAT_CATEGORIES = new Set([
  'weapon',
  'offense',
  'ability'
]);

let statDefinitions = [];
let importedStatsSnapshot = null;

let currentHero = null;
let isSaving = false;
let pendingUpdate = null;
const touchedFields = new Set();
let mainEditor;
let cardEditor;
let gifEditor;
let buildImageEditor;
let buildCardEditor;
let screenVideoObjectUrl = '';

function showMessage(text = '', type = '') {
  if (!message) return;
  message.textContent = text;
  message.className = type;
}

function friendlyHeroSaveError(error) {
  const raw = String(error?.message || error || '');
  if (raw.includes('hero_publication_blocked:missing_base_stats')) {
    return 'Não foi possível publicar porque nenhum status base válido chegou ao banco. Nada foi salvo parcialmente. Revise a aba Status e tente novamente.';
  }
  if (raw.includes('hero_publication_blocked:missing_class')) {
    return 'Não foi possível publicar sem uma classe definida. Revise o campo Classe e tente novamente.';
  }
  if (raw.includes('hero_publication_blocked:missing_media')) {
    return 'Não foi possível publicar sem imagem principal ou imagem de card. Revise a aba Mídia e tente novamente.';
  }
  if (raw.includes('Acesso administrativo necessário') || raw.includes('admin_required')) {
    return 'Sua sessão não possui permissão administrativa para salvar este herói. Entre novamente com uma conta autorizada.';
  }
  return raw || 'Não foi possível salvar o herói.';
}

function showRequiredFieldAlert(text, field) {
  let alert = document.getElementById('hero-required-field-alert');

  if (!alert) {
    const style = document.createElement('style');
    style.textContent = `
      .hero-required-field-alert{position:fixed;inset:0;z-index:10020;display:grid;place-items:center;padding:20px;background:rgba(2,7,18,.88);backdrop-filter:blur(9px)}
      .hero-required-field-card{width:min(520px,100%);padding:30px;border:1px solid #fb7185;border-radius:22px;background:#0b1728;box-shadow:0 24px 80px rgba(0,0,0,.48);text-align:center}
      .hero-required-field-icon{display:grid;place-items:center;width:72px;height:72px;margin:0 auto 18px;border:2px solid #fb7185;border-radius:50%;color:#fda4af;font-size:36px;font-weight:900}
      .hero-required-field-card h2{margin:0 0 10px;color:#fff;font-size:25px}.hero-required-field-card p{margin:0 0 22px;color:#c6d0df;line-height:1.6}
      .hero-required-field-card button{min-height:50px;padding:0 22px;border:1px solid #8b5cf6;border-radius:13px;background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;font-weight:800}
      .hero-form-field.is-invalid label{color:#fda4af}.hero-form-field.is-invalid .admin-input,.hero-form-field.is-invalid .admin-select{border-color:#fb7185!important;box-shadow:0 0 0 3px rgba(251,113,133,.16)!important}
    `;
    document.head.appendChild(style);

    alert = document.createElement('div');
    alert.id = 'hero-required-field-alert';
    alert.className = 'hero-required-field-alert';
    alert.innerHTML = `<section class="hero-required-field-card" role="alertdialog" aria-modal="true"><div class="hero-required-field-icon">!</div><h2>Informação obrigatória</h2><p></p><button type="button">Preencher agora</button></section>`;
    document.body.appendChild(alert);
  }

  alert.querySelector('p').textContent = text;
  alert.hidden = false;

  alert.querySelector('button').onclick = () => {
    alert.hidden = true;
    document.querySelector('[data-tab="general"]')?.click();
    field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => field?.focus({ preventScroll: true }), 80);
  };
}

function clearSaveReceipt() {
  sessionStorage.removeItem(SAVE_RECEIPT_KEY);
}

function storeSaveReceipt(options) {
  sessionStorage.setItem(SAVE_RECEIPT_KEY, JSON.stringify({
    ...options,
    savedAt: Date.now()
  }));
}

function readSaveReceipt() {
  try {
    const receipt = JSON.parse(sessionStorage.getItem(SAVE_RECEIPT_KEY) || 'null');
    if (!receipt?.id || Date.now() - Number(receipt.savedAt || 0) > 30 * 60 * 1000) {
      clearSaveReceipt();
      return null;
    }
    return receipt;
  } catch {
    clearSaveReceipt();
    return null;
  }
}

function ensureSaveSuccessUi() {
  if (document.getElementById('hero-save-success')) return;

  const style = document.createElement('style');
  style.id = 'hero-save-success-style';
  style.textContent = `
    body.hero-success-open{overflow:hidden}
    .hero-save-success{
      position:fixed;inset:0;z-index:12000;display:none;place-items:center;
      padding:20px;background:rgba(2,7,16,.9);backdrop-filter:blur(10px)
    }
    .hero-save-success.is-open{display:grid}
    .hero-save-success-card{
      position:relative;width:min(520px,100%);overflow:hidden;text-align:center;
      padding:34px;border:1px solid rgba(74,222,128,.38);border-radius:22px;
      background:linear-gradient(160deg,#0d1c27,#08111f 65%);
      box-shadow:0 30px 100px rgba(0,0,0,.68),0 0 45px rgba(74,222,128,.1)
    }
    .hero-save-success-card::before{
      content:'';position:absolute;inset:0 0 auto;height:4px;
      background:linear-gradient(90deg,#22c55e,#86efac,#22c55e)
    }
    .hero-success-icon{
      width:82px;height:82px;margin:0 auto 18px;display:grid;place-items:center;
      border:2px solid #4ade80;border-radius:50%;background:rgba(34,197,94,.12);
      color:#86efac;font-size:42px;font-weight:900;
      box-shadow:0 0 0 10px rgba(34,197,94,.05)
    }
    .hero-success-eyebrow{
      color:#86efac;font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase
    }
    .hero-save-success h2{margin:9px 0 7px;font-size:28px;color:#fff}
    .hero-save-success p{margin:0;color:#aeb9ca;font-size:13px;line-height:1.6}
    .hero-success-name{
      margin:20px 0 0;padding:15px;border:1px solid #26384a;border-radius:12px;
      background:#08101d;color:#fff;font-size:18px;font-weight:900
    }
    .hero-success-details{
      display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px
    }
    .hero-success-details span{
      padding:10px;border:1px solid #203247;border-radius:9px;background:#0a1422;
      color:#9facc0;font-size:11px
    }
    .hero-success-actions{display:flex;justify-content:center;gap:9px;flex-wrap:wrap;margin-top:24px}
    @media(max-width:520px){
      .hero-save-success{padding:0}.hero-save-success-card{min-height:100vh;border-radius:0;display:grid;align-content:center}
      .hero-success-actions{display:grid}.hero-success-actions .admin-button{width:100%}
    }
  `;
  document.head.appendChild(style);

  const backdrop = document.createElement('div');
  backdrop.id = 'hero-save-success';
  backdrop.className = 'hero-save-success';
  backdrop.setAttribute('aria-hidden', 'true');
  backdrop.innerHTML = `
    <section class="hero-save-success-card" role="alertdialog" aria-modal="true" aria-labelledby="hero-success-title">
      <div class="hero-success-icon">✓</div>
      <div class="hero-success-eyebrow" id="hero-success-eyebrow">Operação concluída</div>
      <h2 id="hero-success-title">Herói salvo com sucesso!</h2>
      <p id="hero-success-copy">Todos os dados foram enviados e confirmados.</p>
      <div id="hero-success-name" class="hero-success-name"></div>
      <div id="hero-success-details" class="hero-success-details"></div>
      <div class="hero-success-actions">
        <button id="hero-success-continue" type="button" class="admin-button">Continuar editando</button>
        <a id="hero-success-list" class="admin-button" href="./heroes.html">Voltar à lista</a>
        <a id="hero-success-open" class="admin-button primary" href="#">Abrir herói salvo</a>
      </div>
    </section>
  `;
  document.body.appendChild(backdrop);
  document.getElementById('hero-success-continue').addEventListener('click', () => {
    clearSaveReceipt();
    backdrop.classList.remove('is-open');
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('hero-success-open');
  });
  document.getElementById('hero-success-list').addEventListener('click', clearSaveReceipt);
  document.getElementById('hero-success-open').addEventListener('click', clearSaveReceipt);
}

function showSaveSuccess({ id, name, updated = false, details = [] }) {
  ensureSaveSuccessUi();
  const backdrop = document.getElementById('hero-save-success');
  document.getElementById('hero-success-eyebrow').textContent =
    updated ? 'Atualização concluída' : 'Cadastro concluído';
  document.getElementById('hero-success-title').textContent =
    updated ? 'Herói atualizado com sucesso!' : 'Herói salvo com sucesso!';
  document.getElementById('hero-success-copy').textContent =
    updated
      ? 'As alterações foram confirmadas no banco de dados.'
      : 'O cadastro, os status e os dados da arma foram confirmados no banco de dados.';
  document.getElementById('hero-success-name').textContent = name || 'Herói';
  document.getElementById('hero-success-details').innerHTML =
    (details.length ? details : ['✓ Dados gerais salvos', '✓ Status e arma salvos'])
      .map(item => `<span>${escapeHtml(item)}</span>`).join('');
  const openLink = document.getElementById('hero-success-open');
  openLink.href = updated
    ? `./hero-editor.html?id=${encodeURIComponent(id)}&tab=stats`
    : `./hero-editor.html?id=${encodeURIComponent(id)}&tab=abilities&autoSkills=1`;
  openLink.textContent = updated ? 'Abrir herói salvo' : 'Buscar habilidades agora';
  document.getElementById('hero-success-continue').style.display = heroId ? '' : 'none';
  backdrop.classList.add('is-open');
  backdrop.setAttribute('aria-hidden', 'false');
  document.body.classList.add('hero-success-open');
  openLink.focus();
  repairDocumentEncoding(backdrop);
}

function announceSaveSuccess(options) {
  storeSaveReceipt(options);
  try {
    showSaveSuccess(options);
  } catch (error) {
    console.error('Falha ao abrir confirmação visual:', error);
    window.alert(
      `✓ ${options.updated ? 'Herói atualizado' : 'Herói salvo'} com sucesso!\n\n` +
      `${options.name || 'Herói'}\n\nOs dados foram confirmados no banco de dados.`
    );
  }
}

function restorePendingSaveSuccess() {
  const receipt = readSaveReceipt();
  if (!receipt) return false;
  showSaveSuccess(receipt);
  return true;
}

function slugify(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeFilename(filename = '') {
  const extension = filename.includes('.')
    ? filename.split('.').pop().toLowerCase()
    : '';

  const basename = filename
    .replace(/\.[^/.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return extension ? `${basename}.${extension}` : basename;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  let normalized = value;
  if (typeof value === 'string') {
    const cleaned = value.replace(',', '.').trim();
    const match = cleaned.match(/[+-]?(?:\d+(?:\.\d+)?|\.\d+)/);
    normalized = match ? match[0] : cleaned;
  }
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function repairMojibake(value = '') {
  const text = String(value);
  if (!/[ÃÂâ]/.test(text)) return text;
  try {
    const windows1252 = new Map([
      ['€',0x80],['‚',0x82],['ƒ',0x83],['„',0x84],['…',0x85],['†',0x86],
      ['‡',0x87],['ˆ',0x88],['‰',0x89],['Š',0x8a],['‹',0x8b],['Œ',0x8c],
      ['Ž',0x8e],['‘',0x91],['’',0x92],['“',0x93],['”',0x94],['•',0x95],
      ['–',0x96],['—',0x97],['˜',0x98],['™',0x99],['š',0x9a],['›',0x9b],
      ['œ',0x9c],['ž',0x9e],['Ÿ',0x9f]
    ]);
    const bytes = Uint8Array.from(text, character =>
      windows1252.get(character) ?? (character.charCodeAt(0) & 255)
    );
    const repaired = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return repaired.includes('\uFFFD') ? text : repaired;
  } catch {
    return text;
  }
}

function repairDocumentEncoding(root = document) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => {
    const repaired = repairMojibake(node.nodeValue);
    if (repaired !== node.nodeValue) node.nodeValue = repaired;
  });
  root.querySelectorAll?.('[placeholder],[title],[aria-label]').forEach(element => {
    for (const attribute of ['placeholder', 'title', 'aria-label']) {
      if (!element.hasAttribute(attribute)) continue;
      const current = element.getAttribute(attribute);
      const repaired = repairMojibake(current);
      if (repaired !== current) element.setAttribute(attribute, repaired);
    }
  });
}

function bindEncodingRepairObserver() {
  const observer = new MutationObserver(records => {
    for (const record of records) {
      record.addedNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          const repaired = repairMojibake(node.nodeValue);
          if (repaired !== node.nodeValue) node.nodeValue = repaired;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          repairDocumentEncoding(node);
        }
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function createUniqueId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getPublicUrl(path) {
  return resolveMediaUrl(path);
}

function validateFile(file, allowedTypes, maximumSize = MAX_FILE_SIZE) {
  if (!file) return;
  if (!allowedTypes.includes(file.type)) {
    throw new Error(`Formato não permitido para "${file.name}".`);
  }
  if (file.size > maximumSize) {
    throw new Error(`"${file.name}" ultrapassa o limite de ${Math.round(maximumSize / 1024 / 1024)} MB.`);
  }
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setFieldValue(field, value, eventName = 'input') {
  if (!field || value === null || value === undefined) return;

  if (field.type === 'checkbox') {
    field.checked = Boolean(value);
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  field.value = String(value);
  field.dispatchEvent(new Event(eventName, { bubbles: true }));

  if (eventName !== 'change') {
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

/* =========================================================
   EDITOR DE MÍDIA
========================================================= */

function createMediaEditor({
  name,
  input,
  canvas,
  image,
  zoom,
  zoomValue,
  centerButton,
  resetButton,
  allowedTypes,
  objectFit = 'cover',
  onChange
}) {
  const state = {
    source: '',
    objectUrl: '',
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    dragging: false,
    pointerId: null,
    pointerStartX: 0,
    pointerStartY: 0,
    originalOffsetX: 0,
    originalOffsetY: 0
  };

  function notifyChange() {
    if (typeof onChange === 'function') onChange(api);
  }

  function revokeObjectUrl() {
    if (!state.objectUrl) return;
    URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = '';
  }

  function applyBaseLayout() {
    if (!image) return;
    image.style.width = '100%';
    image.style.height = '100%';
    image.style.objectFit = objectFit;
    image.style.objectPosition = '50% 50%';
  }

  function updateTransform() {
    if (!image) return;

    state.scale = clamp(toNumber(state.scale, 1), 0.5, 3);
    state.offsetX = clamp(toNumber(state.offsetX, 0), -100, 100);
    state.offsetY = clamp(toNumber(state.offsetY, 0), -100, 100);

    image.style.transform =
      `translate(${-50 + state.offsetX}%, ${-50 + state.offsetY}%) scale(${state.scale})`;

    if (zoom) zoom.value = String(state.scale);
    if (zoomValue) zoomValue.textContent = `${Math.round(state.scale * 100)}%`;

    notifyChange();
  }

  function setSource(
    source,
    { scale = 1, offsetX = 0, offsetY = 0, isObjectUrl = false } = {}
  ) {
    if (!source) {
      clear();
      return;
    }

    if (!isObjectUrl) revokeObjectUrl();

    state.source = source;
    state.scale = clamp(toNumber(scale, 1), 0.5, 3);
    state.offsetX = clamp(toNumber(offsetX, 0), -100, 100);
    state.offsetY = clamp(toNumber(offsetY, 0), -100, 100);

    image.onload = () => {
      applyBaseLayout();
      canvas.classList.add('has-image');
      updateTransform();
    };

    image.onerror = () => {
      console.warn(`Não foi possível carregar a mídia "${name}".`);
      canvas.classList.remove('has-image');
    };

    image.src = source;
  }

  function setFile(file) {
    if (!file) return;
    validateFile(file, allowedTypes);
    revokeObjectUrl();
    state.objectUrl = URL.createObjectURL(file);
    setSource(state.objectUrl, {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      isObjectUrl: true
    });
  }

  function center() {
    state.offsetX = 0;
    state.offsetY = 0;
    updateTransform();
  }

  function reset() {
    state.scale = 1;
    state.offsetX = 0;
    state.offsetY = 0;
    updateTransform();
  }

  function clear() {
    revokeObjectUrl();

    state.source = '';
    state.scale = 1;
    state.offsetX = 0;
    state.offsetY = 0;
    state.dragging = false;
    state.pointerId = null;

    canvas?.classList.remove('has-image', 'is-dragging');
    image?.removeAttribute('src');

    if (zoom) zoom.value = '1';
    if (zoomValue) zoomValue.textContent = '100%';

    notifyChange();
  }

  function getState() {
    return {
      source: state.source,
      scale: Number(state.scale.toFixed(3)),
      offsetX: Math.round(state.offsetX),
      offsetY: Math.round(state.offsetY),
      objectFit
    };
  }

  function getSource() {
    return state.source;
  }

  function resize() {
    if (!state.source) return;
    applyBaseLayout();
    updateTransform();
  }

  function bind() {
    if (!canvas || !image || !input) {
      console.warn(`Editor de mídia incompleto: ${name}`);
      return;
    }

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;

      try {
        setFile(file);
      } catch (error) {
        input.value = '';
        showMessage(error.message, 'error');
      }
    });

    zoom?.addEventListener('input', event => {
      state.scale = toNumber(event.target.value, 1);
      updateTransform();
    });

    centerButton?.addEventListener('click', center);
    resetButton?.addEventListener('click', reset);

    canvas.addEventListener('pointerdown', event => {
      if (!state.source) return;

      state.dragging = true;
      state.pointerId = event.pointerId;
      state.pointerStartX = event.clientX;
      state.pointerStartY = event.clientY;
      state.originalOffsetX = state.offsetX;
      state.originalOffsetY = state.offsetY;

      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add('is-dragging');
    });

    canvas.addEventListener('pointermove', event => {
      if (!state.dragging || event.pointerId !== state.pointerId) return;

      const width = canvas.clientWidth || 1;
      const height = canvas.clientHeight || 1;

      state.offsetX =
        state.originalOffsetX +
        ((event.clientX - state.pointerStartX) / width) * 100;

      state.offsetY =
        state.originalOffsetY +
        ((event.clientY - state.pointerStartY) / height) * 100;

      updateTransform();
    });

    function stopDragging(event) {
      if (event.pointerId !== state.pointerId) return;

      state.dragging = false;
      state.pointerId = null;
      canvas.classList.remove('is-dragging');

      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    }

    canvas.addEventListener('pointerup', stopDragging);
    canvas.addEventListener('pointercancel', stopDragging);
  }

  const api = {
    bind,
    setSource,
    setFile,
    center,
    reset,
    clear,
    resize,
    getState,
    getSource
  };

  bind();
  return api;
}

function createAllMediaEditors() {
  const sharedImageTypes = [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif'
  ];

  mainEditor = createMediaEditor({
    name: 'imagem principal',
    input: fields.imageFile,
    canvas: document.getElementById('main-image-canvas'),
    image: document.getElementById('main-image-element'),
    zoom: document.getElementById('main-image-zoom'),
    zoomValue: document.getElementById('main-image-zoom-value'),
    centerButton: document.getElementById('main-image-center'),
    resetButton: document.getElementById('main-image-reset'),
    allowedTypes: sharedImageTypes,
    objectFit: 'contain',
    onChange: updateLivePreview
  });

  cardEditor = createMediaEditor({
    name: 'imagem do card',
    input: fields.cardFile,
    canvas: document.getElementById('card-image-canvas'),
    image: document.getElementById('card-image-element'),
    zoom: document.getElementById('card-image-zoom'),
    zoomValue: document.getElementById('card-image-zoom-value'),
    centerButton: document.getElementById('card-image-center'),
    resetButton: document.getElementById('card-image-reset'),
    allowedTypes: sharedImageTypes,
    objectFit: 'cover'
  });

  gifEditor = createMediaEditor({
    name: 'GIF animado',
    input: fields.gifFile,
    canvas: document.getElementById('gif-image-canvas'),
    image: document.getElementById('gif-image-element'),
    zoom: document.getElementById('gif-image-zoom'),
    zoomValue: document.getElementById('gif-image-zoom-value'),
    centerButton: document.getElementById('gif-image-center'),
    resetButton: document.getElementById('gif-image-reset'),
    allowedTypes: ['image/gif'],
    objectFit: 'cover'
  });

  /* Imagem exclusiva da Mesa de Sinergias (criar-build.html) — personagem
     central, mesmo enquadramento "contain" da imagem principal. */
  buildImageEditor = createMediaEditor({
    name: 'imagem da mesa de builds',
    input: fields.buildImageFile,
    canvas: document.getElementById('build-image-canvas'),
    image: document.getElementById('build-image-element'),
    zoom: document.getElementById('build-image-zoom'),
    zoomValue: document.getElementById('build-image-zoom-value'),
    centerButton: document.getElementById('build-image-center'),
    resetButton: document.getElementById('build-image-reset'),
    allowedTypes: sharedImageTypes,
    objectFit: 'contain'
  });

  /* Imagem exclusiva do painel lateral da build — mesmo enquadramento
     "cover" da imagem do card. */
  buildCardEditor = createMediaEditor({
    name: 'imagem do card da build',
    input: fields.buildCardFile,
    canvas: document.getElementById('build-card-canvas'),
    image: document.getElementById('build-card-element'),
    zoom: document.getElementById('build-card-zoom'),
    zoomValue: document.getElementById('build-card-zoom-value'),
    centerButton: document.getElementById('build-card-center'),
    resetButton: document.getElementById('build-card-reset'),
    allowedTypes: sharedImageTypes,
    objectFit: 'cover'
  });
}

/* =========================================================
   VÍDEO DO TELÃO (Mesa de Sinergias / página principal)
   Não usa createMediaEditor: é reprodução de vídeo, não recorte
   estático — visibilidade, cor e enquadramento são só variáveis
   CSS aplicadas ao mesmo elemento que a página principal usa.
========================================================= */

function revokeScreenVideoObjectUrl() {
  if (!screenVideoObjectUrl) return;
  URL.revokeObjectURL(screenVideoObjectUrl);
  screenVideoObjectUrl = '';
}

function collectScreenVideoSettings() {
  return {
    intensity: clamp(toNumber(fields.screenVideoIntensity?.value, .42), .18, .9),
    brightness: clamp(toNumber(fields.screenVideoBrightness?.value, .5), .25, 1.25),
    contrast: clamp(toNumber(fields.screenVideoContrast?.value, 1.2), .7, 1.7),
    saturation: clamp(toNumber(fields.screenVideoSaturation?.value, .64), 0, 1.8),
    hue: clamp(toNumber(fields.screenVideoHue?.value, 8), -60, 60),
    tint: clamp(toNumber(fields.screenVideoTint?.value, .36), 0, .85),
    vignette: clamp(toNumber(fields.screenVideoVignette?.value, .42), 0, .9),
    scale: clamp(toNumber(fields.screenVideoScale?.value, 1.08), 1, 1.8),
    offsetX: clamp(toNumber(fields.screenVideoOffsetX?.value, 0), -35, 35),
    offsetY: clamp(toNumber(fields.screenVideoOffsetY?.value, 0), -35, 35),
    rotation: clamp(toNumber(fields.screenVideoRotation?.value, 0), -10, 10)
  };
}

function updateScreenVideoAppearance() {
  const settings = collectScreenVideoSettings();
  const frame = document.getElementById('screen-video-preview-frame');

  const controls = [
    [fields.screenVideoIntensity, fields.screenVideoIntensityValue, settings.intensity, '%'],
    [fields.screenVideoBrightness, fields.screenVideoBrightnessValue, settings.brightness, '%'],
    [fields.screenVideoContrast, fields.screenVideoContrastValue, settings.contrast, '%'],
    [fields.screenVideoSaturation, fields.screenVideoSaturationValue, settings.saturation, '%'],
    [fields.screenVideoHue, fields.screenVideoHueValue, settings.hue, '°'],
    [fields.screenVideoTint, fields.screenVideoTintValue, settings.tint, '%'],
    [fields.screenVideoVignette, fields.screenVideoVignetteValue, settings.vignette, '%'],
    [fields.screenVideoScale, fields.screenVideoScaleValue, settings.scale, '%'],
    [fields.screenVideoOffsetX, fields.screenVideoOffsetXValue, settings.offsetX, 'position'],
    [fields.screenVideoOffsetY, fields.screenVideoOffsetYValue, settings.offsetY, 'position'],
    [fields.screenVideoRotation, fields.screenVideoRotationValue, settings.rotation, '°']
  ];

  controls.forEach(([input, output, value, unit]) => {
    if (input) input.value = String(value);
    if (output) {
      if (unit === '°') output.textContent = `${Number(value).toFixed(value % 1 ? 1 : 0)}°`;
      else if (unit === 'position') output.textContent = `${Math.round(value)}%`;
      else output.textContent = `${Math.round(value * 100)}%`;
    }
  });

  if (!frame) return;
  frame.style.setProperty('--screen-intensity', settings.intensity);
  frame.style.setProperty('--screen-brightness', settings.brightness);
  frame.style.setProperty('--screen-contrast', settings.contrast);
  frame.style.setProperty('--screen-saturation', settings.saturation);
  frame.style.setProperty('--screen-hue', `${settings.hue}deg`);
  frame.style.setProperty('--screen-tint', settings.tint);
  frame.style.setProperty('--screen-vignette', settings.vignette);
  frame.style.setProperty('--screen-scale', settings.scale);
  frame.style.setProperty('--screen-x', `${settings.offsetX}%`);
  frame.style.setProperty('--screen-y', `${settings.offsetY}%`);
  frame.style.setProperty('--screen-rotate', `${settings.rotation}deg`);
}

function setScreenVideoPreview(source, { objectUrl = false } = {}) {
  const canvas = document.getElementById('screen-video-canvas');
  const video = document.getElementById('screen-video-element');
  if (!canvas || !video) return;

  if (!objectUrl) revokeScreenVideoObjectUrl();

  if (!source) {
    video.pause();
    video.removeAttribute('src');
    video.load();
    canvas.classList.remove('has-image');
    return;
  }

  video.src = source;
  video.load();
  canvas.classList.add('has-image');
  updateScreenVideoAppearance();
  video.play().catch(() => {});
}

function bindScreenVideoEditor() {
  fields.screenVideoFile?.addEventListener('change', () => {
    const file = fields.screenVideoFile.files?.[0];
    if (!file) return;

    try {
      validateFile(file, ['video/mp4', 'video/webm'], MAX_VIDEO_FILE_SIZE);
      revokeScreenVideoObjectUrl();
      screenVideoObjectUrl = URL.createObjectURL(file);
      if (fields.screenVideoRemove) fields.screenVideoRemove.checked = false;
      setScreenVideoPreview(screenVideoObjectUrl, { objectUrl: true });
    } catch (error) {
      fields.screenVideoFile.value = '';
      showMessage(error.message, 'error');
    }
  });

  [
    fields.screenVideoIntensity,
    fields.screenVideoBrightness,
    fields.screenVideoContrast,
    fields.screenVideoSaturation,
    fields.screenVideoHue,
    fields.screenVideoTint,
    fields.screenVideoVignette,
    fields.screenVideoScale,
    fields.screenVideoOffsetX,
    fields.screenVideoOffsetY,
    fields.screenVideoRotation
  ].forEach(input => input?.addEventListener('input', updateScreenVideoAppearance));

  const presets = {
    bright: { intensity:.68, brightness:.88, contrast:1.08, saturation:.82, hue:4, tint:.20, vignette:.20 },
    arena: { intensity:.58, brightness:.72, contrast:1.18, saturation:.78, hue:8, tint:.32, vignette:.32 },
    natural: { intensity:.64, brightness:.82, contrast:1.06, saturation:1, hue:0, tint:.10, vignette:.18 },
    cinema: { intensity:.42, brightness:.50, contrast:1.20, saturation:.64, hue:8, tint:.36, vignette:.42 }
  };

  document.querySelectorAll('[data-screen-video-preset]').forEach(button => {
    button.addEventListener('click', () => {
      const preset = presets[button.dataset.screenVideoPreset];
      if (!preset) return;
      fields.screenVideoIntensity.value = preset.intensity;
      fields.screenVideoBrightness.value = preset.brightness;
      fields.screenVideoContrast.value = preset.contrast;
      fields.screenVideoSaturation.value = preset.saturation;
      fields.screenVideoHue.value = preset.hue;
      fields.screenVideoTint.value = preset.tint;
      fields.screenVideoVignette.value = preset.vignette;
      updateScreenVideoAppearance();
    });
  });

  document.getElementById('screen-video-center')?.addEventListener('click', () => {
    fields.screenVideoScale.value = '1.08';
    fields.screenVideoOffsetX.value = '0';
    fields.screenVideoOffsetY.value = '0';
    fields.screenVideoRotation.value = '0';
    updateScreenVideoAppearance();
  });

  fields.screenVideoRemove?.addEventListener('change', () => {
    const frame = document.getElementById('screen-video-preview-frame');
    if (frame) frame.style.opacity = fields.screenVideoRemove.checked ? '.12' : '1';
  });
}

/* =========================================================
   PRÉVIA E EVENTOS
========================================================= */

function updateInformationPreview() {
  if (previewElements.name) {
    previewElements.name.textContent =
      fields.name?.value.trim() || 'Novo herói';
  }

  if (previewElements.slug) {
    previewElements.slug.textContent =
      fields.slug?.value.trim() || '—';
  }

  if (previewElements.description) {
    previewElements.description.textContent =
      fields.description?.value.trim() || 'Nenhuma descrição cadastrada.';
  }

  if (previewElements.enabled) {
    previewElements.enabled.textContent =
      fields.enabled?.checked ? 'Ativo' : 'Inativo';
  }
}

function updateLivePreview() {
  const container = previewElements.live;
  if (!container || !mainEditor) return;

  const source = mainEditor.getSource();
  const state = mainEditor.getState();

  if (!source) {
    container.textContent = 'Sem mídia selecionada';
    return;
  }

  container.innerHTML = `
    <div style="position:relative;width:100%;height:100%;overflow:hidden">
      <img
        src="${source}"
        alt=""
        style="
          position:absolute;
          left:50%;
          top:50%;
          width:100%;
          height:100%;
          object-fit:${state.objectFit};
          object-position:50% 50%;
          pointer-events:none;
          transform:
            translate(${-50 + state.offsetX}%, ${-50 + state.offsetY}%)
            scale(${state.scale});
          transform-origin:center center;
        "
      >
    </div>
  `;
}

function updateAllPreviews() {
  updateInformationPreview();
  updateLivePreview();
}

function bindAutomaticSlug() {
  fields.name?.addEventListener('input', () => {
    fields.slug.value = slugify(fields.name.value);
    updateInformationPreview();
  });
}

function bindGeneralPreview() {
  fields.description?.addEventListener('input', updateInformationPreview);
  fields.enabled?.addEventListener('change', updateInformationPreview);
}

/* =========================================================
   CLASSES E ORDEM
========================================================= */

async function loadHeroClasses() {
  let result = await supabase
    .from('hero_classes')
    .select('id,name,slug')
    .order('name');

  if (result.error) {
    result = await supabase
      .from('classes')
      .select('id,name,slug')
      .order('name');
  }

  if (result.error) {
    console.warn('Não foi possível carregar as classes:', result.error);
    return;
  }

  const classes = result.data ?? [];

  fields.classId.innerHTML = `
    <option value="">Sem classe</option>
    ${classes.map(heroClass => `
      <option
        value="${heroClass.id}"
        data-slug="${heroClass.slug || ''}"
      >${heroClass.name}</option>
    `).join('')}
  `;
}

async function loadHeroRarities() {
  if (!fields.rarityId) return;

  const { data, error } = await supabase
    .from('hero_rarities')
    .select('id,name,slug')
    .order('rank');

  if (error) {
    console.warn('Não foi possível carregar as raridades:', error);
    return;
  }

  fields.rarityId.innerHTML = `
    <option value="">Não informada</option>
    ${(data || []).map(rarity => `
      <option value="${rarity.id}" data-slug="${rarity.slug || ''}">${rarity.name}</option>
    `).join('')}
  `;
}

async function loadNextDisplayOrder() {
  if (heroId) return;

  const { data, error } = await supabase
    .from('heroes')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1);

  if (error) {
    console.warn('Não foi possível calcular a ordem:', error);
    fields.displayOrder.value = '0';
    return;
  }

  const highestOrder = toNumber(data?.[0]?.display_order, -1);
  fields.displayOrder.value = String(highestOrder + 1);
}


/* =========================================================
   STATUS E ARMA INTEGRADOS
========================================================= */

function getStatInputStep(definition) {
  const decimals = Math.max(0, toNumber(definition.decimals, 0));
  return decimals === 0
    ? '1'
    : String(1 / Math.pow(10, decimals));
}

function formatIntegratedStatValue(value, definition = {}) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '—';
  }

  const decimals = Math.max(0, toNumber(definition.decimals, 0));

  const formatted = number.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });

  if (!definition.unit) return formatted;
  if (definition.unit === 'x') return `x${formatted}`;
  return `${formatted}${definition.unit}`;
}

function getIntegratedDefinitions(group) {
  const categories =
    group === 'hero'
      ? HERO_STAT_CATEGORIES
      : WEAPON_STAT_CATEGORIES;

  return statDefinitions.filter(definition =>
    categories.has(definition.category)
  );
}

function createIntegratedStatField(definition, group, currentValue = '') {
  const wrapper = document.createElement('div');
  wrapper.className = 'integrated-stat-field stat-field';
  wrapper.dataset.statKey = definition.key;
  wrapper.dataset.group = group;

  const label = document.createElement('label');
  const labelText = document.createElement('span');
  labelText.textContent = definition.name || definition.key;
  label.appendChild(labelText);

  if (definition.unit) {
    const unit = document.createElement('span');
    unit.className = 'unit';
    unit.textContent = definition.unit;
    label.appendChild(unit);
  }

  const description = document.createElement('small');
  description.textContent = definition.description || '';

  const input = document.createElement('input');
  input.type = 'number';
  input.step =
    definition.value_type === 'integer'
      ? '1'
      : getStatInputStep(definition);

  input.value =
    currentValue === null || currentValue === undefined
      ? ''
      : String(currentValue);

  input.placeholder = '0';
  input.addEventListener('input', renderIntegratedStatsPreview);

  wrapper.append(label, description, input);
  return wrapper;
}

function renderIntegratedStatsFields(heroValues = {}, weaponValues = {}) {
  const heroDefinitions = getIntegratedDefinitions('hero');
  const weaponDefinitions = getIntegratedDefinitions('weapon');

  if (integratedStats.heroGrid) {
    integratedStats.heroGrid.innerHTML = '';

    if (!heroDefinitions.length) {
      integratedStats.heroGrid.innerHTML = `
        <div class="integrated-stats-empty">
          Nenhuma definição de status do herói foi encontrada.
        </div>
      `;
    } else {
      heroDefinitions.forEach(definition => {
        integratedStats.heroGrid.appendChild(
          createIntegratedStatField(
            definition,
            'hero',
            heroValues[definition.key] ?? ''
          )
        );
      });
    }
  }

  if (integratedStats.weaponGrid) {
    integratedStats.weaponGrid.innerHTML = '';

    if (!weaponDefinitions.length) {
      integratedStats.weaponGrid.innerHTML = `
        <div class="integrated-stats-empty">
          Nenhuma definição de status da arma foi encontrada.
        </div>
      `;
    } else {
      weaponDefinitions.forEach(definition => {
        integratedStats.weaponGrid.appendChild(
          createIntegratedStatField(
            definition,
            'weapon',
            weaponValues[definition.key] ?? ''
          )
        );
      });
    }
  }

  renderIntegratedStatsPreview();
}

function collectIntegratedStatFields(group) {
  return [
    ...document.querySelectorAll(
      `.stat-field[data-group="${group}"]`
    )
  ]
    .map(field => {
      const input = field.querySelector('input');
      const rawValue = input?.value.trim() ?? '';

      return {
        stat_key: field.dataset.statKey,
        rawValue
      };
    })
    .filter(item => item.stat_key && item.rawValue !== '')
    .map(item => {
      const value = Number(item.rawValue);

      if (!Number.isFinite(value)) {
        throw new Error(`Valor inválido em "${item.stat_key}".`);
      }

      return {
        stat_key: item.stat_key,
        value
      };
    });
}

function renderIntegratedPreviewGroup(group, container) {
  if (!container) return;

  const fields = [
    ...document.querySelectorAll(
      `.stat-field[data-group="${group}"]`
    )
  ].filter(field => {
    const input = field.querySelector('input');
    return input && input.value.trim() !== '';
  });

  if (!fields.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = fields
    .map(field => {
      const statKey = field.dataset.statKey;
      const definition = statDefinitions.find(item => item.key === statKey);
      const value = field.querySelector('input').value;

      return `
        <div class="integrated-preview-stat">
          <span>${escapeHtml(definition?.name || statKey)}</span>
          <strong>${escapeHtml(
            formatIntegratedStatValue(value, definition || {})
          )}</strong>
        </div>
      `;
    })
    .join('');
}

function renderIntegratedStatsPreview() {
  renderIntegratedPreviewGroup(
    'hero',
    integratedStats.heroPreview
  );

  renderIntegratedPreviewGroup(
    'weapon',
    integratedStats.weaponPreview
  );
}

async function loadStatDefinitions() {
  const { data, error } = await supabase
    .from('stat_definitions')
    .select(`
      key,
      name,
      category,
      unit,
      value_type,
      decimals,
      higher_is_better,
      description,
      display_order
    `)
    .eq('enabled', true)
    .order('display_order', {
      ascending: true
    });

  if (error) throw error;

  statDefinitions = data || [];
  renderIntegratedStatsFields();
}

async function loadIntegratedStats(targetHeroId) {
  if (!targetHeroId) {
    renderIntegratedStatsFields();
    if (integratedStats.weaponName) {
      integratedStats.weaponName.value = '';
    }
    return;
  }

  const [
    heroStatsResult,
    weaponStatsResult
  ] = await Promise.all([
    supabase
      .from('hero_base_stats')
      .select('stat_key,value')
      .eq('hero_id', targetHeroId),

    supabase
      .from('hero_weapon_stats')
      .select('stat_key,value,weapon_name')
      .eq('hero_id', targetHeroId)
  ]);

  if (heroStatsResult.error) throw heroStatsResult.error;
  if (weaponStatsResult.error) throw weaponStatsResult.error;

  const heroValues = Object.fromEntries(
    (heroStatsResult.data || []).map(row => [
      row.stat_key,
      row.value
    ])
  );

  const weaponValues = Object.fromEntries(
    (weaponStatsResult.data || []).map(row => [
      row.stat_key,
      row.value
    ])
  );

  renderIntegratedStatsFields(
    heroValues,
    weaponValues
  );

  if (integratedStats.weaponName) {
    integratedStats.weaponName.value =
      weaponStatsResult.data?.[0]?.weapon_name || '';
  }
}

async function getExistingIntegratedStatKeys(table, targetHeroId) {
  const { data, error } = await supabase
    .from(table)
    .select('stat_key')
    .eq('hero_id', targetHeroId);

  if (error) throw error;

  return (data || []).map(row => row.stat_key);
}

async function syncIntegratedStats(
  table,
  targetHeroId,
  rows,
  extra = {}
) {
  const existingKeys =
    await getExistingIntegratedStatKeys(
      table,
      targetHeroId
    );

  const incomingKeys =
    rows.map(row => row.stat_key);

  if (rows.length) {
    const payload = rows.map(row => ({
      hero_id: targetHeroId,
      stat_key: row.stat_key,
      value: row.value,
      ...extra
    }));

    const { error: upsertError } = await supabase
      .from(table)
      .upsert(payload, {
        onConflict: 'hero_id,stat_key'
      });

    if (upsertError) throw upsertError;
  }

  const removedKeys = existingKeys.filter(
    key => !incomingKeys.includes(key)
  );

  if (removedKeys.length) {
    const { error: deleteError } = await supabase
      .from(table)
      .delete()
      .eq('hero_id', targetHeroId)
      .in('stat_key', removedKeys);

    if (deleteError) throw deleteError;
  }
}

async function saveIntegratedStats(targetHeroId) {
  const heroRows =
    collectIntegratedStatFields('hero');

  const weaponRows =
    collectIntegratedStatFields('weapon');

  const weaponName =
    integratedStats.weaponName?.value.trim() ||
    null;

  await syncIntegratedStats(
    'hero_base_stats',
    targetHeroId,
    heroRows
  );

  await syncIntegratedStats(
    'hero_weapon_stats',
    targetHeroId,
    weaponRows,
    {
      weapon_name: weaponName
    }
  );

  importedStatsSnapshot = null;
  updateIntegratedUndoButton();
}

function findIntegratedDefinition(group, statKey) {
  const categories =
    group === 'hero'
      ? HERO_STAT_CATEGORIES
      : WEAPON_STAT_CATEGORIES;

  return statDefinitions.find(definition =>
    categories.has(definition.category) &&
    definition.key === statKey
  ) || null;
}

function getIntegratedInput(group, definition) {
  if (!definition) return null;

  return document.querySelector(
    `.stat-field[data-group="${group}"][data-stat-key="${CSS.escape(definition.key)}"] input`
  );
}

function captureIntegratedStatsSnapshot() {
  const values = {};

  document
    .querySelectorAll('.stat-field')
    .forEach(field => {
      const input = field.querySelector('input');
      if (!input) return;

      values[
        `${field.dataset.group}:${field.dataset.statKey}`
      ] = input.value;
    });

  return {
    weaponName:
      integratedStats.weaponName?.value || '',
    values
  };
}

function restoreIntegratedStatsSnapshot(snapshot) {
  if (!snapshot) return;

  if (integratedStats.weaponName) {
    integratedStats.weaponName.value =
      snapshot.weaponName || '';
  }

  document
    .querySelectorAll('.stat-field')
    .forEach(field => {
      const input = field.querySelector('input');
      if (!input) return;

      const key =
        `${field.dataset.group}:${field.dataset.statKey}`;

      input.value =
        snapshot.values[key] ?? '';
    });

  renderIntegratedStatsPreview();
}

function updateIntegratedUndoButton() {
  if (integratedStats.undoImport) {
    integratedStats.undoImport.disabled =
      !importedStatsSnapshot;
  }
}

function hasImportedStatsData(data) {
  return Boolean(
    data?.status ||
    data?.weaponSummary ||
    data?.weaponDetails
  );
}

function applyImportedStatsData(data, {
  announce = false
} = {}) {
  if (!hasImportedStatsData(data)) {
    return {
      applied: 0,
      missing: []
    };
  }

  if (!importedStatsSnapshot) {
    importedStatsSnapshot =
      captureIntegratedStatsSnapshot();
    updateIntegratedUndoButton();
  }

  const mapped = mapImportedHeroStats(data);

  let applied = 0;
  const missing = [];

  for (const [statKey, value] of Object.entries(mapped.heroStats)) {
    const definition =
      findIntegratedDefinition('hero', statKey);

    const input =
      getIntegratedInput('hero', definition);

    if (!definition || !input) {
      missing.push(
        `Herói: ${mapped.sources.hero[statKey] || statKey} → ${statKey}`
      );
      continue;
    }

    input.value = String(value);
    applied += 1;
  }

  for (const [statKey, value] of Object.entries(mapped.weaponStats)) {
    const definition =
      findIntegratedDefinition('weapon', statKey);

    const input =
      getIntegratedInput('weapon', definition);

    if (!definition || !input) {
      missing.push(
        `Arma: ${mapped.sources.weapon[statKey] || statKey} → ${statKey}`
      );
      continue;
    }

    input.value = String(value);
    applied += 1;
  }

  const weaponName = mapped.weaponName;

  if (weaponName && integratedStats.weaponName) {
    integratedStats.weaponName.value =
      String(weaponName);
    applied += 1;
  }

  renderIntegratedStatsPreview();

  if (announce) {
    let text =
      `${applied} campo(s) de status e arma preenchido(s).`;

    if (missing.length) {
      text +=
        ` ${missing.length} campo(s) não possuem definição correspondente.`;
    }

    showMessage(
      text,
      applied ? 'ok' : 'error'
    );
  }

  return {
    applied,
    missing
  };
}

function bindIntegratedStatsControls() {
  integratedStats.applyImport?.addEventListener(
    'click',
    () => {
      const stored = loadImportDraft();
      applyImportedStatsData(
        stored?.data,
        {
          announce: true
        }
      );
    }
  );

  integratedStats.undoImport?.addEventListener(
    'click',
    () => {
      if (!importedStatsSnapshot) {
        showMessage(
          'Não há preenchimento para desfazer.',
          'error'
        );
        return;
      }

      restoreIntegratedStatsSnapshot(
        importedStatsSnapshot
      );

      importedStatsSnapshot = null;
      updateIntegratedUndoButton();

      showMessage(
        'Os valores anteriores foram restaurados. Nada foi salvo.',
        'ok'
      );
    }
  );

  integratedStats.weaponName?.addEventListener(
    'input',
    renderIntegratedStatsPreview
  );
}

function refreshImportedStatsButton() {
  const stored = loadImportDraft();

  if (integratedStats.applyImport) {
    integratedStats.applyImport.hidden =
      !hasImportedStatsData(
        stored?.data
      );
  }
}


/* =========================================================
   IMPORTAÇÃO ASSISTIDA
========================================================= */

function getImportPrompt() {
  return `Analise os prints enviados de um herói do jogo Bullet Echo.

Extraia apenas os dados claramente visíveis. Não estime, não invente e não calcule valores ausentes. Quando um campo não estiver visível ou não puder ser confirmado, use null.

Responda SOMENTE com JSON válido, sem explicações antes ou depois:

{
  "schemaVersion": 2,
  "hero": {
    "name": null,
    "class": null,
    "description": null,
    "displayOrder": null,
    "active": null
  },
  "status": {
    "power": null,
    "health": null,
    "damage": null,
    "armor": null,
    "visionRange": null,
    "movementNoiseRadius": null,
    "maxMovementSpeed": null,
    "aimedMovementSpeed": null,
    "penetrationResistance": null,
    "armorValue": null,
    "armorResistance": null
  },
  "weaponSummary": {
    "name": null,
    "firepower": null,
    "armorBreak": null,
    "fireRate": null,
    "magazineCapacity": null,
    "effectiveRange": null,
    "aimingStability": null
  },
  "weaponDetails": {
    "damagePerShot": null,
    "healthDamageMultiplier": null,
    "armorPenetration": null,
    "penetrationPower": null,
    "armorDroneMultiplier": null,
    "shotsPerSecond": null,
    "reloadTime": null,
    "magazineSize": null,
    "hipFireRange": null,
    "aimedRange": null,
    "dispersion": null,
    "movingDispersion": null,
    "aimedDispersion": null,
    "aimTime": null,
    "dispersionFactor": null
  },
  "meta": {
    "rarity": null,
    "faction": null
  }
}

Regras:
- Preserve números decimais.
- Remova símbolos de unidade do valor numérico.
- Preserve movementNoiseRadius, maxMovementSpeed, aimedMovementSpeed, armorValue e armorResistance como campos distintos.
- weaponSummary contém índices visuais; weaponDetails contém valores mecânicos. Nunca copie valores entre essas duas seções.
- Em "class", use o nome mostrado no jogo.
- Em "description", transcreva somente a descrição do herói.
- Nunca coloque texto fora do JSON.`;
}

function extractJsonText(value = '') {
  const text = String(value).trim();

  if (!text) {
    throw new Error('Cole o JSON retornado pelo ChatGPT.');
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');

  if (firstBrace < 0 || lastBrace < firstBrace) {
    throw new Error('Não foi encontrado um objeto JSON válido.');
  }

  return candidate.slice(firstBrace, lastBrace + 1);
}

function normalizeImportedData(source = {}) {
  const hero = source.hero && typeof source.hero === 'object'
    ? source.hero
    : source;

  const status = source.status && typeof source.status === 'object'
    ? source.status
    : (source.heroParameters || source.parametros_do_heroi || {});

  const overview = source.resumo && typeof source.resumo === 'object'
    ? source.resumo
    : {};

  const armaPt = source.arma && typeof source.arma === 'object'
    ? source.arma
    : {};

  const summary = source.weaponSummary && typeof source.weaponSummary === 'object'
    ? source.weaponSummary
    : (armaPt.resumo || {});

  const weapon = source.weaponDetails && typeof source.weaponDetails === 'object'
    ? source.weaponDetails
    : (source.weapon || armaPt || {});

  const detalhesPt = armaPt.detalhes && typeof armaPt.detalhes === 'object'
    ? armaPt.detalhes
    : {};

  const firepowerPt = detalhesPt.poder_de_fogo || {};
  const armorBreakPt = detalhesPt.quebra_de_armadura || {};
  const fireRatePt = detalhesPt.cadencia_de_tiro || {};
  const magazinePt = detalhesPt.capacidade_de_municao || {};
  const rangePt = detalhesPt.alcance_efetivo || {};
  const stabilityPt = detalhesPt.estabilidade_de_mira || {};

  const meta = source.meta && typeof source.meta === 'object'
    ? source.meta
    : {};

  return {
    schemaVersion: Number(source.schemaVersion) || IMPORT_SCHEMA_VERSION,

    hero: {
      name: hero.name ?? source.name ?? null,
      class: hero.class ?? hero.classe ?? hero.heroClass ?? source.heroClass ?? source.class ?? source.classe ?? null,
      description: hero.description ?? hero.descricao ?? source.description ?? source.descricao ?? null,
      displayOrder: nullableNumber(
        hero.displayOrder ?? hero.display_order ??
        source.displayOrder ?? source.display_order
      ),
      active: hero.active ?? hero.enabled ?? source.active ?? source.enabled ?? null
    },

    status: {
      power: nullableNumber(status.power ?? status.poder ?? overview.poder ?? source.power ?? source.poder),
      health: nullableNumber(status.health ?? status.life ?? status.vida ?? overview.vida ?? source.health ?? source.vida),
      damage: nullableNumber(status.damage ?? status.dano ?? overview.dano ?? source.damage ?? source.dano),
      armor: nullableNumber(status.armor ?? status.armadura ?? overview.armadura ?? source.armor ?? source.armadura),
      visionRange: nullableNumber(status.visionRange ?? status.vision_range ?? status.alcance_de_visao_do_heroi),
      movementNoiseRadius: nullableNumber(
        status.movementNoiseRadius ?? status.movement_noise_radius ??
        status.raio_maximo_do_barulho_de_movimentacao_do_heroi
      ),
      maxMovementSpeed: nullableNumber(
        status.maxMovementSpeed ?? status.max_movement_speed ??
        status.velocidade_maxima_de_movimentacao_do_heroi
      ),
      aimedMovementSpeed: nullableNumber(
        status.aimedMovementSpeed ?? status.aimed_movement_speed ??
        status.velocidade_maxima_de_movimentacao_do_heroi_ao_mirar
      ),
      penetrationResistance: nullableNumber(
        status.penetrationResistance ?? status.penetration_resistance ??
        status.resistencia_a_perfuracao_do_heroi
      ),
      armorValue: nullableNumber(status.armorValue ?? status.armor_value ?? status.valor_de_armadura),
      armorResistance: nullableNumber(
        status.armorResistance ?? status.armor_resistance ?? status.resistencia_de_armadura
      )
    },

    weaponSummary: {
      name: summary.name ?? summary.nome ?? weapon.name ?? weapon.nome ?? armaPt.nome ?? null,
      firepower: nullableNumber(summary.firepower ?? summary.poder_de_fogo ?? weapon.firepower),
      armorBreak: nullableNumber(
        summary.armorBreak ?? summary.armor_break ?? summary.quebra_de_armadura ?? weapon.armorBreak
      ),
      fireRate: nullableNumber(
        summary.fireRate ?? summary.fire_rate ?? summary.cadencia_de_tiro ?? weapon.fireRate
      ),
      magazineCapacity: nullableNumber(
        summary.magazineCapacity ??
        summary.magazine_capacity ??
        summary.capacidade_de_municao ??
        weapon.magazineCapacity
      ),
      effectiveRange: nullableNumber(
        summary.effectiveRange ?? summary.effective_range ?? summary.alcance_efetivo ?? weapon.effectiveRange
      ),
      aimingStability: nullableNumber(
        summary.aimingStability ??
        summary.aiming_stability ??
        summary.estabilidade_de_mira ??
        weapon.aimingStability
      )
    },

    weaponDetails: {
      damagePerShot: nullableNumber(
        weapon.damagePerShot ?? weapon.damage_per_shot ?? firepowerPt.dano_da_arma_por_tiro
      ),
      healthDamageMultiplier: nullableNumber(
        weapon.healthDamageMultiplier ?? weapon.health_damage_multiplier ?? firepowerPt.modificador_de_dano_a_vida
      ),
      armorPenetration: nullableNumber(
        weapon.armorPenetration ?? weapon.armor_penetration ?? firepowerPt.perfuracao_de_armadura_da_arma
      ),
      penetrationPower: nullableNumber(
        weapon.penetrationPower ?? weapon.penetration_power ?? armorBreakPt.poder_de_perfuracao_da_arma
      ),
      armorDroneMultiplier: nullableNumber(
        weapon.armorDroneMultiplier ?? weapon.armor_drone_multiplier ??
        armorBreakPt.modificador_de_dano_por_armas_a_armaduras_e_drones
      ),
      shotsPerSecond: nullableNumber(
        weapon.shotsPerSecond ?? weapon.shots_per_second ?? fireRatePt.cadencia_de_tiro_por_segundo
      ),
      reloadTime: nullableNumber(
        weapon.reloadTime ?? weapon.reload_time ?? fireRatePt.tempo_de_recarga_da_arma
      ),
      magazineSize: nullableNumber(
        weapon.magazineSize ?? weapon.magazine_size ?? magazinePt.tamanho_do_pente
      ),
      hipFireRange: nullableNumber(
        weapon.hipFireRange ?? weapon.hip_fire_range ?? rangePt.alcance_do_tiro_da_arma
      ),
      aimedRange: nullableNumber(
        weapon.aimedRange ?? weapon.aimed_range ?? rangePt.alcance_do_tiro_da_arma_ao_mirar
      ),
      dispersion: nullableNumber(weapon.dispersion ?? stabilityPt.dispersao_de_tiro_da_arma),
      movingDispersion: nullableNumber(
        weapon.movingDispersion ?? weapon.moving_dispersion ??
        stabilityPt.dispersao_de_tiro_da_arma_ao_se_movimentar
      ),
      aimedDispersion: nullableNumber(
        weapon.aimedDispersion ?? weapon.aimed_dispersion ??
        stabilityPt.dispersao_de_tiro_da_arma_ao_mirar
      ),
      aimTime: nullableNumber(
        weapon.aimTime ?? weapon.aim_time ?? stabilityPt.tempo_de_mira_da_arma
      ),
      dispersionFactor: nullableNumber(
        weapon.dispersionFactor ?? weapon.dispersion_factor ?? stabilityPt.fator_de_dispersao_da_arma
      )
    },

    meta: {
      level: meta.level ?? meta.nivel ?? hero.level ?? hero.nivel ?? source.level ?? source.nivel ?? null,
      rarity: meta.rarity ?? meta.raridade ?? hero.rarity ?? hero.raridade ?? source.rarity ?? source.raridade ?? null,
      faction: meta.faction ?? source.faction ?? null
    }
  };
}

function countValues(object) {
  return Object.values(object || {}).filter(
    value => value !== null && value !== undefined && value !== ''
  ).length;
}

function findClassOption(className) {
  if (!fields.classId || !className) return null;

  const wanted = normalizeText(className);
  const options = [...fields.classId.options];

  return options.find(option => {
    if (!option.value) return false;
    return (
      normalizeText(option.textContent) === wanted ||
      normalizeText(option.dataset.slug) === wanted
    );
  }) || options.find(option => {
    if (!option.value) return false;

    const text = normalizeText(option.textContent);
    const slug = normalizeText(option.dataset.slug);

    return (
      text.includes(wanted) ||
      wanted.includes(text) ||
      slug.includes(wanted) ||
      wanted.includes(slug)
    );
  }) || null;
}

function findRarityOption(rarityName) {
  if (!fields.rarityId || !rarityName) return null;
  const wanted = normalizeText(rarityName);
  return [...fields.rarityId.options].find(option => {
    if (!option.value) return false;
    return (
      normalizeText(option.textContent) === wanted ||
      normalizeText(option.dataset.slug) === wanted
    );
  }) || null;
}

function saveImportDraft(data) {
  sessionStorage.setItem(
    IMPORT_KEY,
    JSON.stringify({
      schemaVersion: IMPORT_SCHEMA_VERSION,
      importedAt: new Date().toISOString(),
      heroId: heroId || currentHero?.id || null,
      heroSlug: fields.slug?.value.trim() || null,
      data
    })
  );
}

function loadImportDraft() {
  try {
    const raw = sessionStorage.getItem(IMPORT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.data ? parsed : null;
  } catch (error) {
    console.warn('Rascunho de importação inválido:', error);
    return null;
  }
}

function updateImportDraftAfterSave(savedHero, slug) {
  const stored = loadImportDraft();
  if (!stored) return;

  stored.heroId = savedHero?.id || heroId || null;
  stored.heroSlug = slug || savedHero?.slug || null;
  stored.heroName = savedHero?.name || fields.name?.value.trim() || null;
  stored.savedAt = new Date().toISOString();

  sessionStorage.setItem(IMPORT_KEY, JSON.stringify(stored));
}

function applyImportedData(data) {
  const applied = [];
  const warnings = [];
  const hero = data.hero || {};

  if (hero.name) {
    setFieldValue(fields.name, hero.name, 'input');
    applied.push('nome');
  }

  if (hero.class) {
    const option = findClassOption(hero.class);

    if (option) {
      fields.classId.value = option.value;
      fields.classId.dispatchEvent(new Event('change', { bubbles: true }));
      applied.push('classe');
    } else {
      warnings.push(`Classe "${hero.class}" não encontrada.`);
    }
  }

  const importedMeta = data.meta || {};

  if (importedMeta.rarity) {
    const rarityOption = findRarityOption(importedMeta.rarity);
    if (rarityOption) {
      fields.rarityId.value = rarityOption.value;
      fields.rarityId.dispatchEvent(new Event('change', { bubbles: true }));
      applied.push('raridade');
    } else {
      warnings.push(`Raridade "${importedMeta.rarity}" não encontrada no catálogo.`);
    }
  }

  if (importedMeta.faction !== null && importedMeta.faction !== undefined) {
    setFieldValue(fields.faction, importedMeta.faction, 'input');
    applied.push('facção');
  }

  if (importedMeta.level !== null && importedMeta.level !== undefined) {
    warnings.push('Nível foi reconhecido, mas ainda não possui campo canônico de destino no cadastro do herói.');
  }

  if (hero.description) {
    setFieldValue(fields.description, hero.description, 'input');
    applied.push('descrição');
  }

  if (hero.displayOrder !== null) {
    setFieldValue(fields.displayOrder, hero.displayOrder);
    applied.push('ordem');
  }

  if (hero.active !== null) {
    setFieldValue(fields.enabled, hero.active);
    applied.push('publicação');
  }

  const statsOutcome =
    applyImportedStatsData(
      data,
      {
        announce: false
      }
    );

  if (statsOutcome.applied) {
    applied.push(
      `${statsOutcome.applied} campo(s) de status/arma`
    );
  }

  if (statsOutcome.missing.length) {
    warnings.push(
      `${statsOutcome.missing.length} campo(s) de status/arma sem correspondência.`
    );
  }

  updateAllPreviews();
  saveImportDraft(data);
  refreshImportedStatsButton();

  return { applied, warnings };
}

function injectImportUi() {
  if (document.getElementById('hero-import-open')) return;

  const style = document.createElement('style');
  style.id = 'hero-import-style';

  style.textContent = `
    .hero-import-backdrop{
      position:fixed;inset:0;z-index:10000;display:none;
      align-items:center;justify-content:center;padding:18px;
      background:rgba(2,6,15,.84);backdrop-filter:blur(8px)
    }
    .hero-import-backdrop.is-open{display:flex}
    .hero-import-modal{
      width:min(920px,100%);max-height:calc(100vh - 36px);
      overflow:auto;border:1px solid var(--admin-line);
      border-radius:16px;background:#0b1324;
      box-shadow:0 24px 80px rgba(0,0,0,.52)
    }
    .hero-import-head{
      position:sticky;top:0;z-index:2;display:flex;
      justify-content:space-between;gap:16px;padding:18px 20px;
      border-bottom:1px solid var(--admin-line);background:#0b1324
    }
    .hero-import-head h2{margin:0;font-size:20px}
    .hero-import-head p{margin:6px 0 0;color:var(--admin-muted);font-size:12px}
    .hero-import-body{display:grid;gap:16px;padding:20px}
    .hero-import-card{
      padding:15px;border:1px solid var(--admin-line);
      border-radius:12px;background:#08101e
    }
    .hero-import-card h3{margin:0 0 7px;font-size:14px}
    .hero-import-card p{margin:0;color:var(--admin-muted);font-size:11px}
    .hero-import-textarea{
      width:100%;min-height:220px;margin-top:12px;resize:vertical;
      font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace
    }
    #hero-import-prompt{min-height:170px}
    .hero-import-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:12px}
    .hero-import-result{display:grid;gap:8px;margin-top:12px}
    .hero-import-summary{
      display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px
    }
    .hero-import-summary div{
      padding:10px;border:1px solid var(--admin-line);
      border-radius:9px;background:#0c1729
    }
    .hero-import-summary small{
      display:block;color:var(--admin-muted);font-size:9px;
      font-weight:800;text-transform:uppercase
    }
    .hero-import-summary strong{display:block;margin-top:4px;font-size:15px}
    .hero-import-note{
      padding:9px 11px;border:1px solid var(--admin-line);
      border-radius:8px;background:#0c1729;color:#c8cfdd;
      font-size:11px;line-height:1.5
    }
    .hero-import-note.ok{border-color:#28583a;color:#8fd3a6}
    .hero-import-note.warn{border-color:#6f5618;color:#ffd76d}
    .hero-import-note.error{border-color:#75353d;color:#ff9da5}
    @media(max-width:700px){
      .hero-import-summary{grid-template-columns:repeat(2,minmax(0,1fr))}
    }
  `;

  document.head.appendChild(style);

  const actions = document.querySelector('.hero-editor-toolbar-actions');
  if (!actions) return;

  const openButton = document.createElement('button');
  openButton.id = 'hero-import-open';
  openButton.type = 'button';
  openButton.className = 'admin-button';
  openButton.textContent = 'Importar dados';
  actions.insertBefore(openButton, actions.firstChild);

  const backdrop = document.createElement('div');
  backdrop.id = 'hero-import-backdrop';
  backdrop.className = 'hero-import-backdrop';

  backdrop.innerHTML = `
    <section class="hero-import-modal" role="dialog" aria-modal="true">
      <header class="hero-import-head">
        <div>
          <h2>Importar dados do herói</h2>
          <p>Cole o JSON produzido pelo ChatGPT. Nada será salvo automaticamente.</p>
        </div>
        <button id="hero-import-close" type="button" class="admin-button">✕</button>
      </header>

      <div class="hero-import-body">
        <section class="hero-import-card">
          <h3>1. Prompt para o ChatGPT</h3>
          <p>Envie os prints do herói e cole este prompt.</p>
          <textarea
            id="hero-import-prompt"
            class="admin-textarea hero-import-textarea"
            readonly
          ></textarea>
          <div class="hero-import-actions">
            <button id="hero-import-copy" type="button" class="admin-button">
              Copiar prompt
            </button>
          </div>
        </section>

        <section class="hero-import-card">
          <h3>2. JSON retornado</h3>
          <p>É aceito JSON puro ou dentro de um bloco de código.</p>
          <textarea
            id="hero-import-json"
            class="admin-textarea hero-import-textarea"
            placeholder="Cole aqui o JSON..."
          ></textarea>

          <div class="hero-import-actions">
            <button id="hero-import-validate" type="button" class="admin-button">
              Validar dados
            </button>
            <button
              id="hero-import-apply"
              type="button"
              class="admin-button primary"
              disabled
            >
              Preencher formulário
            </button>
            <button id="hero-import-clear" type="button" class="admin-button">
              Limpar
            </button>
          </div>

          <div id="hero-import-result" class="hero-import-result"></div>
        </section>

        <div class="hero-import-note">
          Informações gerais, status e arma são preenchidos nesta mesma tela.
          Mídias e habilidades continuam manuais.
        </div>
      </div>
    </section>
  `;

  document.body.appendChild(backdrop);

  const promptArea = document.getElementById('hero-import-prompt');
  const jsonArea = document.getElementById('hero-import-json');
  const resultArea = document.getElementById('hero-import-result');
  const applyButton = document.getElementById('hero-import-apply');

  let validatedData = null;

  promptArea.value = getImportPrompt();

  function closeModal() {
    backdrop.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  function openModal() {
    backdrop.classList.add('is-open');
    document.body.style.overflow = 'hidden';

    const stored = loadImportDraft();
    if (stored?.data && !jsonArea.value.trim()) {
      jsonArea.value = JSON.stringify(stored.data, null, 2);
    }

    jsonArea.focus();
  }

  function clearValidation() {
    validatedData = null;
    applyButton.disabled = true;
    resultArea.innerHTML = '';
  }

  function validateJson() {
    try {
      const parsed = JSON.parse(extractJsonText(jsonArea.value));
      validatedData = normalizeImportedData(parsed);

      const classOption = validatedData.hero.class
        ? findClassOption(validatedData.hero.class)
        : null;

      resultArea.innerHTML = `
        <div class="hero-import-summary">
          <div><small>Informações</small><strong>${countValues(validatedData.hero)}</strong></div>
          <div><small>Status</small><strong>${countValues(validatedData.status)}</strong></div>
          <div><small>Arma resumida</small><strong>${countValues(validatedData.weaponSummary)}</strong></div>
          <div><small>Arma detalhada</small><strong>${countValues(validatedData.weaponDetails)}</strong></div>
          <div><small>Metadados</small><strong>${countValues(validatedData.meta)}</strong></div>
        </div>

        <div class="hero-import-note ${validatedData.hero.name ? 'ok' : 'warn'}">
          ${validatedData.hero.name
            ? `Nome reconhecido: ${escapeHtml(validatedData.hero.name)}.`
            : 'Nome não informado.'}
        </div>

        <div class="hero-import-note ${classOption ? 'ok' : 'warn'}">
          ${validatedData.hero.class
            ? (
                classOption
                  ? `Classe encontrada: ${escapeHtml(classOption.textContent.trim())}.`
                  : `Classe não encontrada: ${escapeHtml(validatedData.hero.class)}.`
              )
            : 'Classe não informada.'}
        </div>

        ${countValues(validatedData.meta) ? `
          <div class="hero-import-note warn">
            Nível e raridade foram reconhecidos, mas o editor atual ainda não possui campos de destino para salvá-los.
          </div>
        ` : ''}
      `;

      applyButton.disabled = false;
      showMessage('JSON validado. Revise antes de preencher.', 'ok');
      return validatedData;
    } catch (error) {
      clearValidation();
      resultArea.innerHTML = `
        <div class="hero-import-note error">
          ${escapeHtml(error.message || 'JSON inválido.')}
        </div>
      `;
      showMessage(error.message || 'JSON inválido.', 'error');
      return null;
    }
  }

  openButton.addEventListener('click', openModal);
  document.getElementById('hero-import-close').addEventListener('click', closeModal);

  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) closeModal();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && backdrop.classList.contains('is-open')) {
      closeModal();
    }
  });

  document.getElementById('hero-import-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(getImportPrompt());
    } catch {
      promptArea.select();
      document.execCommand('copy');
    }
    showMessage('Prompt copiado.', 'ok');
  });

  document.getElementById('hero-import-validate').addEventListener('click', validateJson);

  document.getElementById('hero-import-apply').addEventListener('click', () => {
    const data = validatedData || validateJson();
    if (!data) return;

    const outcome = applyImportedData(data);
    let text = outcome.applied.length
      ? `${outcome.applied.length} campo(s) preenchido(s): ${outcome.applied.join(', ')}.`
      : 'Nenhum campo geral pôde ser preenchido.';

    if (outcome.warnings.length) {
      text += ` ${outcome.warnings.join(' ')}`;
    }

    showMessage(text, outcome.applied.length ? 'ok' : 'error');
    closeModal();
  });

  document.getElementById('hero-import-clear').addEventListener('click', () => {
    jsonArea.value = '';
    clearValidation();
    jsonArea.focus();
  });

  jsonArea.addEventListener('input', clearValidation);
}

function bindLocalImageImportResult() {
  window.addEventListener('echoarena:image-import-result', event => {
    if (event.detail?.entityType !== 'hero' || !event.detail?.data) return;
    const data = event.detail.data;

    if (!heroId && !currentHero) {
      fields.enabled.checked = false;
      data.hero = { ...(data.hero || {}), active: false };
      data.ocr = data.ocr || {};
      data.ocr.warnings = [
        'Novo herói mantido inativo por segurança até a revisão final.',
        ...(data.ocr.warnings || [])
      ];
    }

    const outcome = applyImportedData(data);
    const warnings = [...(data.ocr?.warnings || []), ...(outcome.warnings || [])];
    const message = [
      `${outcome.applied.length} item(ns) aplicado(s) ao editor para revisão.`,
      warnings.length ? `${warnings.length} alerta(s) exigem conferência.` : ''
    ].filter(Boolean).join(' ');

    showMessage(message, outcome.applied.length ? 'ok' : 'error');
  });
}

/* =========================================================
   CARREGAMENTO DO HERÓI
========================================================= */

function populateHero(hero) {
  currentHero = hero;

  fields.name.value = hero.name ?? '';
  fields.slug.value = hero.slug ?? '';
  fields.classId.value = hero.class_id ?? '';
  if (fields.rarityId) fields.rarityId.value = hero.rarity_id ?? '';
  if (fields.faction) fields.faction.value = hero.faction ?? '';
  fields.displayOrder.value = String(hero.display_order ?? 0);
  fields.description.value = hero.description ?? '';
  fields.enabled.checked = hero.enabled !== false;

  mainEditor.setSource(getPublicUrl(hero.image_path), {
    scale: hero.image_scale ?? 1,
    offsetX: hero.image_offset_x ?? 0,
    offsetY: hero.image_offset_y ?? 0
  });

  cardEditor.setSource(getPublicUrl(hero.card_image_path), {
    scale: hero.card_image_scale ?? 1,
    offsetX: hero.card_image_offset_x ?? 0,
    offsetY: hero.card_image_offset_y ?? 0
  });

  gifEditor.setSource(getPublicUrl(hero.gif_path), {
    scale: hero.gif_scale ?? 1,
    offsetX: hero.gif_offset_x ?? 0,
    offsetY: hero.gif_offset_y ?? 0
  });

  buildImageEditor.setSource(getPublicUrl(hero.build_image_path), {
    scale: hero.build_image_scale ?? 1,
    offsetX: hero.build_image_offset_x ?? 0,
    offsetY: hero.build_image_offset_y ?? 0
  });

  buildCardEditor.setSource(getPublicUrl(hero.build_card_image_path), {
    scale: hero.build_card_image_scale ?? 1,
    offsetX: hero.build_card_image_offset_x ?? 0,
    offsetY: hero.build_card_image_offset_y ?? 0
  });

  const screenSettings = {
    screenVideoIntensity: hero.screen_video_intensity ?? .42,
    screenVideoBrightness: hero.screen_video_brightness ?? .5,
    screenVideoContrast: hero.screen_video_contrast ?? 1.2,
    screenVideoSaturation: hero.screen_video_saturation ?? .64,
    screenVideoHue: hero.screen_video_hue ?? 8,
    screenVideoTint: hero.screen_video_tint ?? .36,
    screenVideoVignette: hero.screen_video_vignette ?? .42,
    screenVideoScale: hero.screen_video_scale ?? 1.08,
    screenVideoOffsetX: hero.screen_video_offset_x ?? 0,
    screenVideoOffsetY: hero.screen_video_offset_y ?? 0,
    screenVideoRotation: hero.screen_video_rotation ?? 0
  };
  Object.entries(screenSettings).forEach(([key, value]) => {
    if (fields[key]) fields[key].value = String(value);
  });
  if (fields.screenVideoRemove) fields.screenVideoRemove.checked = false;
  setScreenVideoPreview(getPublicUrl(hero.screen_video_path));
  updateScreenVideoAppearance();

  const editorTitle = document.getElementById('editor-title');
  if (editorTitle) editorTitle.textContent = `Editar ${hero.name}`;
  if (saveButton) saveButton.textContent = 'Atualizar herói';

  updateAllPreviews();
}

async function loadHero() {
  if (!heroId) return;

  showMessage('Carregando herói...');

  const { data, error } = await supabase
    .from('heroes')
    .select(`
      id, name, slug, description, class_id, rarity_id, faction, enabled, display_order,
      image_path, image_scale, image_offset_x, image_offset_y,
      card_image_path, card_image_scale, card_image_offset_x, card_image_offset_y,
      gif_path, gif_scale, gif_offset_x, gif_offset_y,
      build_image_path, build_image_scale, build_image_offset_x, build_image_offset_y,
      build_card_image_path, build_card_image_scale, build_card_image_offset_x, build_card_image_offset_y,
      screen_video_path, screen_video_intensity,
      screen_video_brightness, screen_video_contrast,
      screen_video_saturation, screen_video_hue,
      screen_video_tint, screen_video_vignette,
      screen_video_scale, screen_video_offset_x,
      screen_video_offset_y, screen_video_rotation
    `)
    .eq('id', heroId)
    .single();

  if (error) throw error;

  populateHero(data);
  await loadIntegratedStats(data.id);
  refreshImportedStatsButton();
  showMessage('');
}

/* =========================================================
   VALIDAÇÃO, UPLOAD E SALVAMENTO
========================================================= */

function validateForm() {
  const name = fields.name.value.trim();

  fields.name.closest('.hero-form-field')?.classList.toggle('is-invalid', !name);
  fields.name.toggleAttribute('aria-invalid', !name);

  if (!name) {
    const error = new Error('Informe o nome do herói antes de salvar.');
    error.validationField = fields.name;
    throw error;
  }

  const slug = slugify(name);

  if (!slug) throw new Error('Não foi possível gerar o identificador.');

  fields.slug.value = slug;
  return slug;
}

async function validateSlugAvailability(slug) {
  let query = supabase
    .from('heroes')
    .select('id,name,slug')
    .eq('slug', slug)
    .limit(1);

  if (heroId) query = query.neq('id', heroId);

  const { data, error } = await query;

  if (error) throw error;

  return data?.[0] || null;
}

/* =========================================================
   ASSISTENTE DE ATUALIZAÇÃO INTELIGENTE
========================================================= */



function displayDiffValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Ativo' : 'Inativo';
  return String(value);
}

async function loadExistingHeroBundle(targetId) {
  const [heroResult, heroStatsResult, weaponStatsResult] = await Promise.all([
    supabase.from('heroes').select(`
      id, name, slug, description, class_id, rarity_id, faction, enabled, display_order,
      image_url, card_image_url,
      image_path, image_scale, image_offset_x, image_offset_y,
      card_image_path, card_image_scale, card_image_offset_x, card_image_offset_y,
      gif_path, gif_scale, gif_offset_x, gif_offset_y,
      build_image_path, build_image_scale, build_image_offset_x, build_image_offset_y,
      build_card_image_path, build_card_image_scale, build_card_image_offset_x, build_card_image_offset_y,
      screen_video_path, screen_video_intensity,
      screen_video_brightness, screen_video_contrast,
      screen_video_saturation, screen_video_hue,
      screen_video_tint, screen_video_vignette,
      screen_video_scale, screen_video_offset_x,
      screen_video_offset_y, screen_video_rotation
    `).eq('id', targetId).single(),
    supabase.from('hero_base_stats').select('stat_key,value').eq('hero_id', targetId),
    supabase.from('hero_weapon_stats').select('stat_key,value,weapon_name').eq('hero_id', targetId)
  ]);
  if (heroResult.error) throw heroResult.error;
  if (heroStatsResult.error) throw heroStatsResult.error;
  if (weaponStatsResult.error) throw weaponStatsResult.error;
  return {
    hero: heroResult.data,
    heroStats: Object.fromEntries((heroStatsResult.data || []).map(row => [row.stat_key, row.value])),
    weaponStats: Object.fromEntries((weaponStatsResult.data || []).map(row => [row.stat_key, row.value])),
    weaponName: weaponStatsResult.data?.[0]?.weapon_name || null
  };
}

function classNameForId(id) {
  const option = [...(fields.classId?.options || [])].find(item => item.value === String(id || ''));
  return option?.textContent.trim() || 'Sem classe';
}

function rarityNameForId(id) {
  const option = [...(fields.rarityId?.options || [])].find(item => item.value === String(id || ''));
  return option?.textContent.trim() || 'Sem raridade';
}

function heroDiffValue(key, value) {
  if (key === 'class_id') return classNameForId(value);
  if (key === 'rarity_id') return rarityNameForId(value);
  return displayDiffValue(value);
}

function buildUpdateDiffs(bundle) {
  const hero = bundle.hero;
  const importedRoot = loadImportDraft()?.data || {};
  const imported = importedRoot.hero || {};
  const importedMeta = importedRoot.meta || {};
  const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const proposedValue = ({ importObject = imported, importKey, fieldKey, formValue, currentValue }) => {
    if (heroId || touchedFields.has(fieldKey) || (hasOwn(importObject, importKey) && importObject[importKey] !== null && importObject[importKey] !== undefined)) {
      return formValue;
    }
    return currentValue;
  };
  const diffs = [
    createDiff({ key:'name', label:'Nome', group:'Geral', before:hero.name, after:fields.name.value.trim(), apply:{ type:'hero', column:'name' } }),
    createDiff({ key:'slug', label:'Identificador', group:'Geral', before:hero.slug, after:fields.slug.value.trim(), apply:{ type:'hero', column:'slug' } }),
    createDiff({ key:'class_id', label:'Classe', group:'Geral', before:hero.class_id, after:proposedValue({ importKey:'class', fieldKey:'classId', formValue:fields.classId.value || null, currentValue:hero.class_id }), apply:{ type:'hero', column:'class_id' } }),
    createDiff({ key:'rarity_id', label:'Raridade', group:'Geral', before:hero.rarity_id, after:proposedValue({ importObject:importedMeta, importKey:'rarity', fieldKey:'rarityId', formValue:fields.rarityId?.value || null, currentValue:hero.rarity_id }), apply:{ type:'hero', column:'rarity_id' } }),
    createDiff({ key:'faction', label:'Facção', group:'Geral', before:hero.faction, after:proposedValue({ importObject:importedMeta, importKey:'faction', fieldKey:'faction', formValue:fields.faction?.value.trim() || null, currentValue:hero.faction }), apply:{ type:'hero', column:'faction' } }),
    createDiff({ key:'description', label:'Descrição', group:'Geral', before:hero.description, after:proposedValue({ importKey:'description', fieldKey:'description', formValue:fields.description.value.trim() || null, currentValue:hero.description }), apply:{ type:'hero', column:'description' } }),
    createDiff({ key:'enabled', label:'Publicação', group:'Geral', before:hero.enabled, after:proposedValue({ importKey:'active', fieldKey:'enabled', formValue:fields.enabled.checked, currentValue:hero.enabled }), apply:{ type:'hero', column:'enabled' } }),
    createDiff({ key:'display_order', label:'Ordem de exibição', group:'Geral', before:hero.display_order, after:proposedValue({ importKey:'displayOrder', fieldKey:'displayOrder', formValue:toNumber(fields.displayOrder.value,0), currentValue:hero.display_order }), kind:'number', apply:{ type:'hero', column:'display_order' } })
  ];

  for (const group of ['hero', 'weapon']) {
    const existing = group === 'hero' ? bundle.heroStats : bundle.weaponStats;
    for (const row of collectIntegratedStatFields(group)) {
      const definition = statDefinitions.find(item => item.key === row.stat_key) || {};
      diffs.push(createDiff({
        key:`${group}.${row.stat_key}`, label:definition.name || row.stat_key,
        group:group === 'hero' ? 'Status' : 'Arma', before:existing[row.stat_key], after:row.value,
        kind:'number', apply:{ type:'stat', table:group === 'hero' ? 'hero_base_stats' : 'hero_weapon_stats', statKey:row.stat_key, weaponName:integratedStats.weaponName?.value.trim() || bundle.weaponName || null }
      }));
    }
  }

  const proposedWeaponName = integratedStats.weaponName?.value.trim() || null;
  if (heroId || proposedWeaponName || touchedFields.has('weaponName')) {
    diffs.push(createDiff({
      key:'weapon.name', label:'Nome da arma', group:'Arma', before:bundle.weaponName,
      after:proposedWeaponName, apply:{ type:'weapon-name' }
    }));
  }

  const media = [
    ['image','Imagem principal',fields.imageFile.files?.[0],hero.image_path],
    ['card','Imagem do card',fields.cardFile.files?.[0],hero.card_image_path],
    ['gif','GIF',fields.gifFile.files?.[0],hero.gif_path],
    ['buildImage','Imagem da mesa de builds',fields.buildImageFile.files?.[0],hero.build_image_path],
    ['buildCard','Imagem do card da build',fields.buildCardFile.files?.[0],hero.build_card_image_path],
    ['screenVideo','Vídeo do telão',fields.screenVideoFile.files?.[0],hero.screen_video_path]
  ];
  for (const [key,label,file,before] of media) {
    if (!file) continue;
    diffs.push(createDiff({ key:`media.${key}`, label, group:'Mídia', before:before ? 'Cadastrada' : 'Não cadastrada', after:file.name, apply:{ type:'media', media:key }, selected:true }));
  }

  if (fields.screenVideoRemove?.checked && hero.screen_video_path) {
    diffs.push(createDiff({
      key:'media.screenVideo.remove', label:'Vídeo do telão', group:'Mídia', before:'Cadastrado', after:'Remover',
      apply:{ type:'media', media:'screenVideo', action:'remove' }
    }));
  }

  const transformGroups = [
    { key:'image', label:'Imagem principal', editor:mainEditor, file:fields.imageFile.files?.[0], columns:['image_scale','image_offset_x','image_offset_y'] },
    { key:'card', label:'Imagem do card', editor:cardEditor, file:fields.cardFile.files?.[0], columns:['card_image_scale','card_image_offset_x','card_image_offset_y'] },
    { key:'gif', label:'GIF', editor:gifEditor, file:fields.gifFile.files?.[0], columns:['gif_scale','gif_offset_x','gif_offset_y'] },
    { key:'buildImage', label:'Imagem da mesa de builds', editor:buildImageEditor, file:fields.buildImageFile.files?.[0], columns:['build_image_scale','build_image_offset_x','build_image_offset_y'] },
    { key:'buildCard', label:'Card da build', editor:buildCardEditor, file:fields.buildCardFile.files?.[0], columns:['build_card_image_scale','build_card_image_offset_x','build_card_image_offset_y'] }
  ];
  for (const item of transformGroups) {
    if (!heroId && !item.file) continue;
    const state = item.editor.getState();
    const values = [state.scale, state.offsetX, state.offsetY];
    const labels = ['Escala', 'Posição horizontal', 'Posição vertical'];
    item.columns.forEach((column, index) => diffs.push(createDiff({
      key:`media.${item.key}.${column}`, label:`${item.label} · ${labels[index]}`, group:'Ajustes de mídia',
      before:hero[column], after:values[index], kind:'number', apply:{ type:'hero', column }
    })));
  }

  if (heroId || fields.screenVideoFile.files?.[0] || fields.screenVideoRemove?.checked) {
    const screen = collectScreenVideoSettings();
    const screenSettings = [
      ['screen_video_intensity','Vídeo · intensidade',screen.intensity],
      ['screen_video_brightness','Vídeo · brilho',screen.brightness],
      ['screen_video_contrast','Vídeo · contraste',screen.contrast],
      ['screen_video_saturation','Vídeo · saturação',screen.saturation],
      ['screen_video_hue','Vídeo · matiz',screen.hue],
      ['screen_video_tint','Vídeo · tonalidade',screen.tint],
      ['screen_video_vignette','Vídeo · vinheta',screen.vignette],
      ['screen_video_scale','Vídeo · escala',screen.scale],
      ['screen_video_offset_x','Vídeo · posição horizontal',screen.offsetX],
      ['screen_video_offset_y','Vídeo · posição vertical',screen.offsetY],
      ['screen_video_rotation','Vídeo · rotação',screen.rotation]
    ];
    for (const [column,label,after] of screenSettings) {
      diffs.push(createDiff({
        key:`media.screenVideo.${column}`, label, group:'Ajustes de mídia', before:hero[column], after,
        kind:'number', apply:{ type:'hero', column }
      }));
    }
  }

  return diffs;
}

function renderVersionHistory() {
  const history = pendingUpdate?.history || [];
  if (!history.length) return '';
  return `<details class="update-history"><summary>Histórico recente <span>${history.length} snapshot(s)</span></summary>${history.map(item => `
    <div class="update-diff"><span></span><div class="update-diff-label"><strong>v${item.version}</strong><small>${escapeHtml(new Date(item.created_at).toLocaleString('pt-BR'))}</small></div><div class="update-value">${escapeHtml(item.source || 'backup automático')}</div><span></span><button type="button" class="admin-button" data-restore-version-id="${item.id}">Restaurar versão</button></div>
  `).join('')}</details>`;
}

function renderUpdateReadiness(readiness) {
  const requiredMissing = readiness.publicationPending;
  const qualityMissing = readiness.qualityPending;
  const blocked = readiness.blockers.length > 0;
  const stateClass = blocked ? 'is-blocked' : requiredMissing.length ? 'is-draft' : 'is-ready';
  const title = blocked
    ? `Faltam ${requiredMissing.length} dado(s) obrigatório(s)`
    : requiredMissing.length
      ? 'Pode salvar como rascunho'
      : 'Pronto para salvar';
  const description = blocked
    ? 'Este herói está marcado para publicação. Complete os itens abaixo antes de atualizar.'
    : requiredMissing.length
      ? 'A atualização pode ser salva, mas estes dados serão exigidos antes de publicar.'
      : qualityMissing.length
        ? 'Os requisitos técnicos estão completos. Restam apenas dados recomendados de qualidade.'
        : 'Cadastro completo para esta atualização.';
  const pendingItems = [
    ...requiredMissing.map(item => ({ ...item, kind:'Obrigatório para publicar' })),
    ...qualityMissing.map(item => ({ ...item, kind:'Recomendado' }))
  ];
  const validation = pendingUpdate?.validationMessage
    ? `<p class="update-requirements-error">${escapeHtml(pendingUpdate.validationMessage)}</p>`
    : '';

  return `<section class="update-requirements ${stateClass}" id="update-requirements">
    <div class="update-requirements-copy"><span class="update-readiness-icon">${blocked ? '!' : requiredMissing.length ? '•' : '✓'}</span><div><strong>${title}</strong><p>${description}</p>${validation}</div></div>
    ${pendingItems.length ? `<div class="update-requirements-list">${pendingItems.map(item => `<button type="button" data-required-tab="${escapeHtml(item.tab)}"><span>${escapeHtml(item.label)}</span><small>${item.kind}</small></button>`).join('')}</div>` : ''}
  </section>`;
}

function renderUpdateAssistant() {
  if (!pendingUpdate) return;
  const { bundle, diffs } = pendingUpdate;
  const summary = summarizeDiffs(diffs);
  const selectedState = projectUpdateState(bundle, diffs);
  const allState = projectUpdateState(bundle, diffs, { selectAll:true });
  const readiness = buildHeroReadiness(selectedState);
  const allReadiness = buildHeroReadiness(allState);
  const summaryElement = document.getElementById('update-assistant-summary');
  const body = document.getElementById('update-assistant-body');
  const selectedCount = summary.selected;
  const preservedCount = summary.changed - selectedCount;
  summaryElement.innerHTML = [
    [summary.changed,'dados alterados'],[selectedCount,'selecionados'],[readiness.publicationPending.length,'pendências para publicar']
  ].map(([value,label]) => `<div class="update-summary-item"><strong>${value}</strong><span>${label}</span></div>`).join('');

  document.getElementById('update-assistant-eyebrow').textContent = pendingUpdate.mode === 'edit'
    ? 'Revisão antes de salvar'
    : 'Herói já cadastrado';
  document.getElementById('update-assistant-title').textContent = pendingUpdate.mode === 'edit'
    ? `Atualizar ${bundle.hero.name}`
    : `${bundle.hero.name} já existe`;
  document.getElementById('update-assistant-subtitle').textContent = summary.changed
    ? 'Confira somente o que mudou. Campos não selecionados serão preservados.'
    : 'Os dados informados são iguais aos que já estão salvos.';

  const identity = `<article class="update-identity-card update-identity-compact">${bundle.hero.image_path ? `<img src="${escapeHtml(getPublicUrl(bundle.hero.image_path))}" alt="">` : '<div class="update-avatar-placeholder">◇</div>'}<div><small>REGISTRO EXISTENTE · ${bundle.hero.enabled ? 'PUBLICADO' : 'RASCUNHO'}</small><h3>${escapeHtml(bundle.hero.name)}</h3><p>${escapeHtml(classNameForId(bundle.hero.class_id))} · alterações auditadas com responsável e horário</p></div></article>`;

  const groups = ['Geral','Status','Arma','Mídia','Ajustes de mídia'];
  const groupHtml = groups.map(group => {
    const items = diffs.filter(item => item.group === group && item.changed);
    if (!items.length) return '';
    return `<section class="update-group"><div class="update-group-head">${group.toUpperCase()} <span>${items.length} alteração(ões)</span></div>${items.map(item => `
      <div class="update-diff ${item.change}">
        <input type="checkbox" data-diff-key="${escapeHtml(item.key)}" ${item.selected ? 'checked' : ''} aria-label="Atualizar ${escapeHtml(item.label)}">
        <div class="update-diff-label"><strong>${escapeHtml(item.label)}</strong><small>${item.change === 'increase' ? '▲ Aumento' : item.change === 'decrease' ? '▼ Redução' : 'Modificado'}</small></div>
        <div class="update-value">${escapeHtml(heroDiffValue(item.key, item.before))}</div><div class="update-arrow">→</div>
        <div class="update-value">${escapeHtml(heroDiffValue(item.key, item.after))}</div>
        ${item.risky ? '<div class="update-risk">⚠ Alteração muito grande — diferença superior a 80%. Confirme com atenção; pode ser um erro de OCR.</div>' : ''}
      </div>`).join('')}</section>`;
  }).join('');
  body.innerHTML = identity + renderUpdateReadiness(readiness) + (summary.changed ? groupHtml : '<div class="update-empty"><strong>Nenhuma alteração encontrada</strong><br>O herói existente não será gravado novamente sem necessidade.</div>') + renderVersionHistory();
  document.getElementById('update-final-stats').innerHTML = `<strong>${selectedCount} alteração(ões) serão salvas</strong><br>${preservedCount} alteração(ões) desmarcadas serão preservadas · snapshot e auditoria automáticos`;
  const selectedButton = document.getElementById('update-selected');
  selectedButton.disabled = selectedCount === 0 || readiness.blockers.length > 0;
  selectedButton.title = readiness.blockers.length ? 'Complete os dados obrigatórios antes de salvar um herói publicado.' : '';
  const allButton = document.getElementById('update-all');
  allButton.disabled = summary.changed === 0 || allReadiness.blockers.length > 0;
  const discardButton = document.getElementById('update-discard');
  discardButton.hidden = !pendingUpdate.hasImportDraft;

  body.querySelectorAll('[data-diff-key]').forEach(input => input.addEventListener('change', () => {
    const diff = diffs.find(item => item.key === input.dataset.diffKey);
    if (diff) {
      diff.selected = input.checked;
      pendingUpdate.validationMessage = '';
    }
    renderUpdateAssistant();
  }));
  body.querySelectorAll('[data-required-tab]').forEach(button => button.addEventListener('click', () => {
    const tab = button.dataset.requiredTab;
    closeUpdateAssistant();
    document.querySelector(`[data-tab="${tab}"]`)?.click();
  }));
  body.querySelectorAll('[data-restore-version-id]').forEach(button => button.addEventListener('click', () => restoreHeroVersion(button.dataset.restoreVersionId)));
}

function closeUpdateAssistant({ discard = false } = {}) {
  const backdrop = document.getElementById('update-assistant-backdrop');
  backdrop?.classList.remove('is-open');
  backdrop?.setAttribute('aria-hidden','true');
  document.body.classList.remove('update-assistant-open');
  if (discard) sessionStorage.removeItem(IMPORT_KEY);
  pendingUpdate = null;
}

async function openUpdateAssistant(existing, { mode = heroId ? 'edit' : 'duplicate' } = {}) {
  const bundle = await loadExistingHeroBundle(existing.id);
  const historyResult = await supabase
    .from('admin_content_versions')
    .select('id,version,created_at,source')
    .eq('entity_type', 'hero')
    .eq('entity_id', existing.id)
    .order('version', { ascending: false })
    .limit(8);
  if (historyResult.error) console.warn('[hero-editor] histórico indisponível; revisão mantida:', historyResult.error);
  pendingUpdate = {
    bundle,
    history: historyResult.error ? [] : (historyResult.data || []),
    diffs: buildUpdateDiffs(bundle),
    mode,
    hasImportDraft:Boolean(loadImportDraft()),
    validationMessage:''
  };
  renderUpdateAssistant();
  document.getElementById('update-assistant-backdrop').classList.add('is-open');
  document.getElementById('update-assistant-backdrop').setAttribute('aria-hidden','false');
  document.body.classList.add('update-assistant-open');
}

async function applySelectedUpdate(selectAll = false) {
  if (!pendingUpdate || isSaving) return;
  const chosen = pendingUpdate.diffs.filter(item => item.changed && (selectAll || item.selected));
  if (!chosen.length) return;
  const readiness = buildHeroReadiness(projectUpdateState(pendingUpdate.bundle, pendingUpdate.diffs, { selectAll }));
  if (readiness.blockers.length) {
    pendingUpdate.validationMessage = `Preencha: ${readiness.blockers.map(item => item.label).join(', ')}.`;
    renderUpdateAssistant();
    document.getElementById('update-requirements')?.scrollIntoView({ behavior:'smooth', block:'nearest' });
    return;
  }
  const risky = chosen.filter(item => item.risky);
  if (risky.length && !confirm(`${risky.length} alteração(ões) variam mais de 80%. Deseja continuar?`)) return;

  isSaving = true;
  let upload = {
    imagePath: null,
    cardImagePath: null,
    gifPath: null,
    buildImagePath: null,
    buildCardImagePath: null,
    screenVideoPath: null
  };

  try {
    const { bundle } = pendingUpdate;
    const slugChange = chosen.find(item => item.apply.type === 'hero' && item.apply.column === 'slug');
    const uploadSlug = slugChange?.after || bundle.hero.slug;
    const mediaChosen = new Set(
      chosen.filter(item => item.apply.type === 'media' && item.apply.action !== 'remove').map(item => item.apply.media)
    );
    upload = await uploadSelectedMediaSelective(uploadSlug, mediaChosen);

    const heroPatch = {};
    for (const item of chosen.filter(item => item.apply.type === 'hero')) {
      heroPatch[item.apply.column] = item.after;
    }

    if (upload.imagePath) heroPatch.image_path = upload.imagePath;
    if (upload.cardImagePath) heroPatch.card_image_path = upload.cardImagePath;
    if (upload.gifPath) heroPatch.gif_path = upload.gifPath;
    if (upload.buildImagePath) heroPatch.build_image_path = upload.buildImagePath;
    if (upload.buildCardImagePath) heroPatch.build_card_image_path = upload.buildCardImagePath;
    if (chosen.some(item => item.apply.type === 'media' && item.apply.media === 'screenVideo' && item.apply.action === 'remove')) {
      heroPatch.screen_video_path = null;
    }

    if (upload.screenVideoPath) {
      const screen = collectScreenVideoSettings();
      heroPatch.screen_video_path = upload.screenVideoPath;
      heroPatch.screen_video_intensity = screen.intensity;
      heroPatch.screen_video_brightness = screen.brightness;
      heroPatch.screen_video_contrast = screen.contrast;
      heroPatch.screen_video_saturation = screen.saturation;
      heroPatch.screen_video_hue = screen.hue;
      heroPatch.screen_video_tint = screen.tint;
      heroPatch.screen_video_vignette = screen.vignette;
      heroPatch.screen_video_scale = screen.scale;
      heroPatch.screen_video_offset_x = screen.offsetX;
      heroPatch.screen_video_offset_y = screen.offsetY;
      heroPatch.screen_video_rotation = screen.rotation;
    }

    const weaponNameChange = chosen.find(item => item.apply.type === 'weapon-name');
    const baseStats = {};
    const weaponStats = weaponNameChange ? { ...bundle.weaponStats } : {};
    let weaponName = bundle.weaponName || null;
    if (weaponNameChange) weaponName = weaponNameChange.after || null;

    for (const item of chosen.filter(item => item.apply.type === 'stat')) {
      if (item.apply.table === 'hero_base_stats') {
        baseStats[item.apply.statKey] = item.after;
      } else if (item.apply.table === 'hero_weapon_stats') {
        weaponStats[item.apply.statKey] = item.after;
        weaponName = item.apply.weaponName || weaponName;
      }
    }

    await saveHeroBundleV2({
      targetHeroId: bundle.hero.id,
      heroPatch,
      baseStats,
      weaponName,
      weaponStats,
      replaceBaseStats: false,
      replaceWeaponStats: false,
      source: pendingUpdate.mode === 'edit' ? 'hero-editor-reviewed-update' : 'hero-duplicate-reviewed-update'
    });

    const modified = chosen.length;
    const preserved = pendingUpdate.diffs.filter(item => item.changed).length - modified;
    const savedName = heroPatch.name || bundle.hero.name;
    closeUpdateAssistant();
    showMessage(
      `Atualização concluída: ${modified} campos modificados, ${preserved} preservados, 0 apagados e snapshot persistente criado no banco.`,
      'ok'
    );
    announceSaveSuccess({
      id: bundle.hero.id,
      name: savedName,
      updated: true,
      details: [
        `✓ ${modified} campos modificados`,
        `✓ ${preserved} campos preservados`,
        '✓ Nenhum dado apagado implicitamente',
        '✓ Snapshot persistente criado no banco'
      ]
    });
  } catch (error) {
    const uploaded = Object.values(upload).filter(Boolean);
    await Promise.allSettled(uploaded.map(value => removeR2Media(value)));
    console.error('Erro na atualização inteligente:', error);
    showMessage(error.message || 'Não foi possível atualizar o herói.', 'error');
  } finally {
    isSaving = false;
  }
}

async function uploadSelectedMediaSelective(slug, selected) {
  const imageTypes = ['image/png','image/jpeg','image/webp','image/gif'];
  const [imagePath, cardImagePath, gifPath, buildImagePath, buildCardImagePath, screenVideoPath] = await Promise.all([
    selected.has('image') ? uploadFile({file:fields.imageFile.files?.[0],heroSlug:slug,mediaType:'Main',allowedTypes:imageTypes}) : null,
    selected.has('card') ? uploadFile({file:fields.cardFile.files?.[0],heroSlug:slug,mediaType:'Card',allowedTypes:imageTypes}) : null,
    selected.has('gif') ? uploadFile({file:fields.gifFile.files?.[0],heroSlug:slug,mediaType:'GIF',allowedTypes:['image/gif']}) : null,
    selected.has('buildImage') ? uploadFile({file:fields.buildImageFile.files?.[0],heroSlug:slug,mediaType:'BuildMain',allowedTypes:imageTypes}) : null,
    selected.has('buildCard') ? uploadFile({file:fields.buildCardFile.files?.[0],heroSlug:slug,mediaType:'BuildCard',allowedTypes:imageTypes}) : null,
    selected.has('screenVideo') ? uploadFile({file:fields.screenVideoFile.files?.[0],heroSlug:slug,mediaType:'ScreenVideo',allowedTypes:['video/mp4','video/webm'],maximumSize:MAX_VIDEO_FILE_SIZE}) : null
  ]);
  return { imagePath, cardImagePath, gifPath, buildImagePath, buildCardImagePath, screenVideoPath };
}

async function restoreHeroVersion(versionId) {
  if (!versionId || !confirm('Restaurar este snapshot? O estado atual será salvo automaticamente antes da restauração.')) return;
  try {
    const { error } = await supabase.rpc('admin_restore_content_version_v2', {
      p_version_id: versionId
    });
    if (error) throw error;
    closeUpdateAssistant();
    showMessage('Snapshot restaurado com sucesso. O estado anterior também ficou preservado no banco.', 'ok');
    window.setTimeout(() => location.reload(), 700);
  } catch (error) {
    showMessage(error.message || 'Não foi possível restaurar o snapshot.', 'error');
  }
}

function bindUpdateAssistant() {
  document.getElementById('update-cancel')?.addEventListener('click',()=>closeUpdateAssistant());
  document.getElementById('update-discard')?.addEventListener('click',()=>{ closeUpdateAssistant({discard:true}); showMessage('Importação descartada.',''); });
  document.getElementById('update-selected')?.addEventListener('click',()=>applySelectedUpdate(false));
  document.getElementById('update-all')?.addEventListener('click',()=>applySelectedUpdate(true));
  document.getElementById('update-assistant-backdrop')?.addEventListener('click', event => {
    if (event.target === event.currentTarget) closeUpdateAssistant();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && pendingUpdate) closeUpdateAssistant();
  });
}

function bindUpdateTracking() {
  const tracked = [
    ['name', fields.name],
    ['classId', fields.classId],
    ['rarityId', fields.rarityId],
    ['faction', fields.faction],
    ['description', fields.description],
    ['enabled', fields.enabled],
    ['displayOrder', fields.displayOrder],
    ['weaponName', integratedStats.weaponName]
  ];
  for (const [key, field] of tracked) {
    field?.addEventListener('input', () => touchedFields.add(key));
    field?.addEventListener('change', () => touchedFields.add(key));
  }
}

async function uploadFile({ file, heroSlug, mediaType, allowedTypes, maximumSize = MAX_FILE_SIZE }) {
  if (!file) return null;

  validateFile(file, allowedTypes, maximumSize);

  return uploadMedia(file, `Heros/${heroSlug}/${mediaType}`);
}

async function uploadSelectedMedia(slug) {
  const imageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

  const [imagePath, cardImagePath, gifPath, buildImagePath, buildCardImagePath, screenVideoPath] = await Promise.all([
    uploadFile({
      file: fields.imageFile.files?.[0],
      heroSlug: slug,
      mediaType: 'Main',
      allowedTypes: imageTypes
    }),
    uploadFile({
      file: fields.cardFile.files?.[0],
      heroSlug: slug,
      mediaType: 'Card',
      allowedTypes: imageTypes
    }),
    uploadFile({
      file: fields.gifFile.files?.[0],
      heroSlug: slug,
      mediaType: 'GIF',
      allowedTypes: ['image/gif']
    }),
    uploadFile({
      file: fields.buildImageFile.files?.[0],
      heroSlug: slug,
      mediaType: 'BuildMain',
      allowedTypes: imageTypes
    }),
    uploadFile({
      file: fields.buildCardFile.files?.[0],
      heroSlug: slug,
      mediaType: 'BuildCard',
      allowedTypes: imageTypes
    }),
    uploadFile({
      file: fields.screenVideoFile.files?.[0],
      heroSlug: slug,
      mediaType: 'ScreenVideo',
      allowedTypes: ['video/mp4', 'video/webm'],
      maximumSize: MAX_VIDEO_FILE_SIZE
    })
  ]);

  return { imagePath, cardImagePath, gifPath, buildImagePath, buildCardImagePath, screenVideoPath };
}

function collectPayload(slug, uploadedMedia) {
  const mainState = mainEditor.getState();
  const cardState = cardEditor.getState();
  const gifState = gifEditor.getState();
  const buildImageState = buildImageEditor.getState();
  const buildCardState = buildCardEditor.getState();
  const screenState = collectScreenVideoSettings();

  return {
    name: fields.name.value.trim(),
    slug,
    description: fields.description.value.trim() || null,
    class_id: fields.classId.value || null,
    rarity_id: fields.rarityId?.value || null,
    faction: fields.faction?.value.trim() || null,
    enabled: fields.enabled.checked,
    display_order: toNumber(fields.displayOrder.value, 0),

    image_path: uploadedMedia.imagePath || currentHero?.image_path || null,
    image_fit: 'contain',
    image_position: '50% 50%',
    image_scale: mainState.scale,
    image_offset_x: mainState.offsetX,
    image_offset_y: mainState.offsetY,

    card_image_path:
      uploadedMedia.cardImagePath || currentHero?.card_image_path || null,
    card_image_scale: cardState.scale,
    card_image_offset_x: cardState.offsetX,
    card_image_offset_y: cardState.offsetY,

    gif_path: uploadedMedia.gifPath || currentHero?.gif_path || null,
    gif_scale: gifState.scale,
    gif_offset_x: gifState.offsetX,
    gif_offset_y: gifState.offsetY,

    build_image_path:
      uploadedMedia.buildImagePath || currentHero?.build_image_path || null,
    build_image_scale: buildImageState.scale,
    build_image_offset_x: buildImageState.offsetX,
    build_image_offset_y: buildImageState.offsetY,

    build_card_image_path:
      uploadedMedia.buildCardImagePath || currentHero?.build_card_image_path || null,
    build_card_image_scale: buildCardState.scale,
    build_card_image_offset_x: buildCardState.offsetX,
    build_card_image_offset_y: buildCardState.offsetY,

    screen_video_path: fields.screenVideoRemove?.checked
      ? null
      : (uploadedMedia.screenVideoPath || currentHero?.screen_video_path || null),
    screen_video_intensity: screenState.intensity,
    screen_video_brightness: screenState.brightness,
    screen_video_contrast: screenState.contrast,
    screen_video_saturation: screenState.saturation,
    screen_video_hue: screenState.hue,
    screen_video_tint: screenState.tint,
    screen_video_vignette: screenState.vignette,
    screen_video_scale: screenState.scale,
    screen_video_offset_x: screenState.offsetX,
    screen_video_offset_y: screenState.offsetY,
    screen_video_rotation: screenState.rotation
  };
}

function statsRowsToObject(rows) {
  return Object.fromEntries((rows || []).map(row => [row.stat_key, row.value]));
}

async function saveHeroBundleV2({
  targetHeroId = null,
  heroPatch = {},
  baseStats = {},
  weaponName = null,
  weaponStats = {},
  replaceBaseStats = false,
  replaceWeaponStats = false,
  source = 'hero-editor'
}) {
  const { data, error } = await supabase.rpc('admin_save_hero_bundle_v2', {
    p_hero_id: targetHeroId || null,
    p_hero: heroPatch || {},
    p_base_stats: baseStats || {},
    p_weapon_name: weaponName || null,
    p_weapon_stats: weaponStats || {},
    p_replace_base_stats: Boolean(replaceBaseStats),
    p_replace_weapon_stats: Boolean(replaceWeaponStats),
    p_source: source
  });
  if (error) throw error;

  const hero = data?.hero;
  if (!hero?.id) throw new Error('O banco não confirmou o herói salvo.');

  return {
    ...hero,
    operation: data?.operation || (targetHeroId ? 'updated' : 'created'),
    versionBackupCreated: Boolean(data?.version_backup_created)
  };
}

async function createHero(payload) {
  const { data, error } = await supabase
    .from('heroes')
    .insert(payload)
    .select('id,name,slug')
    .single();

  if (error) throw error;
  return data;
}

async function updateHero(payload) {
  const { data, error } = await supabase
    .from('heroes')
    .update(payload)
    .eq('id', heroId)
    .select('id,name,slug')
    .single();

  if (error) throw error;
  return data;
}

async function saveHero(event) {
  event.preventDefault();

  if (isSaving) return;
  isSaving = true;

  const originalButtonText = saveButton?.textContent || 'Salvar herói';

  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = 'Salvando...';
  }

  let uploadedMedia = {
    imagePath: null,
    cardImagePath: null,
    gifPath: null,
    buildImagePath: null,
    buildCardImagePath: null,
    screenVideoPath: null
  };

  try {
    const slug = validateForm();

    const existingHero = await validateSlugAvailability(slug);

    if (heroId) {
      if (existingHero) {
        const error = new Error(`O identificador ${slug} já pertence a ${existingHero.name || 'outro herói'}. Use um nome diferente; nenhum registro foi alterado.`);
        error.validationField = fields.name;
        throw error;
      }
      await openUpdateAssistant(currentHero || { id:heroId }, { mode:'edit' });
      showMessage('Revise as alterações antes de atualizar o herói.');
      return;
    }

    if (existingHero) {
      await openUpdateAssistant(existingHero, { mode:'duplicate' });
      showMessage(`${existingHero.name || 'Este herói'} já está cadastrado. Revise somente o que mudou.`);
      return;
    }

    showMessage('Enviando mídias...');
    uploadedMedia = await uploadSelectedMedia(slug);

    showMessage(heroId ? 'Atualizando herói...' : 'Criando herói...');
    const payload = collectPayload(slug, uploadedMedia);
    const heroRows = collectIntegratedStatFields('hero');
    const weaponRows = collectIntegratedStatFields('weapon');

    const savedHero = await saveHeroBundleV2({
      targetHeroId: heroId || null,
      heroPatch: payload,
      baseStats: statsRowsToObject(heroRows),
      weaponName: integratedStats.weaponName?.value.trim() || null,
      weaponStats: statsRowsToObject(weaponRows),
      replaceBaseStats: true,
      replaceWeaponStats: true,
      source: loadImportDraft() ? 'hero-import-review' : 'hero-editor'
    });

    updateImportDraftAfterSave(savedHero, slug);

    let catalogResult = null;
    if (!heroId) {
      try {
        const { data, error } = await supabase.rpc('admin_apply_hero_skill_catalog', {
          p_hero_id: savedHero.id
        });
        if (error) throw error;
        catalogResult = data;
      } catch (catalogError) {
        console.warn('[hero-editor] catálogo de habilidades pendente:', catalogError);
        catalogResult = { applied: false, reason: 'catalog_unavailable' };
      }
    }

    showMessage(
      heroId
        ? 'Herói, status e arma atualizados com sucesso.'
        : savedHero.enabled === false
          ? 'Herói salvo como rascunho. Complete os dados reais antes de publicar.'
          : 'Herói, status e arma criados com sucesso.',
      'ok'
    );

    announceSaveSuccess({
      id: savedHero.id,
      name: savedHero.name || fields.name.value.trim(),
      updated: Boolean(heroId),
      details: [
        '✓ Informações gerais salvas',
        savedHero.enabled === false
          ? '• Rascunho salvo; status base podem ser completados agora'
          : '✓ Status confirmados',
        '✓ Dados da arma confirmados',
        catalogResult?.applied && Number(catalogResult.applied_count) === 4
          ? '✓ Catálogo padrão: 4 habilidades aplicadas automaticamente'
          : !heroId
            ? '• Catálogo de habilidades pendente; nenhuma quota foi consumida'
            : null,
        '✓ Operação concluída'
      ].filter(Boolean)
    });

    if (!heroId) {
      return;
    }

    currentHero = { ...currentHero, ...payload, id: savedHero.id };

    fields.imageFile.value = '';
    fields.cardFile.value = '';
    fields.gifFile.value = '';
    fields.buildImageFile.value = '';
    fields.buildCardFile.value = '';
    fields.screenVideoFile.value = '';
    if (fields.screenVideoRemove) fields.screenVideoRemove.checked = false;

    updateAllPreviews();
  } catch (error) {
    const uploaded = Object.values(uploadedMedia).filter(Boolean);
    await Promise.allSettled(uploaded.map(value => removeR2Media(value)));
    console.error('Erro ao salvar herói:', error);
    showMessage(friendlyHeroSaveError(error), 'error');
    if (error.validationField) {
      showRequiredFieldAlert(error.message, error.validationField);
    }
  } finally {
    isSaving = false;

    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = heroId ? 'Atualizar herói' : originalButtonText;
    }
  }
}

/* =========================================================
   INICIALIZAÇÃO
========================================================= */

async function initialize() {
  try {
    showMessage('Preparando editor...');

    createAllMediaEditors();
    bindScreenVideoEditor();
    bindAutomaticSlug();
    bindGeneralPreview();
    bindIntegratedStatsControls();
    bindUpdateAssistant();
    bindUpdateTracking();
    bindLocalImageImportResult();
    ensureSaveSuccessUi();

    fields.name?.addEventListener('input', () => {
      if (!fields.name.value.trim()) return;
      fields.name.removeAttribute('aria-invalid');
      fields.name.closest('.hero-form-field')?.classList.remove('is-invalid');
    });

    form?.addEventListener('submit', saveHero);

    await Promise.all([
      loadHeroClasses(),
      loadHeroRarities(),
      loadStatDefinitions()
    ]);

    if (heroId) {
      await loadHero();
    } else {
      await loadNextDisplayOrder();
      fields.enabled.checked = false;

      mainEditor.reset();
      cardEditor.reset();
      gifEditor.reset();
      buildImageEditor.reset();
      buildCardEditor.reset();
      fields.screenVideoIntensity.value = '.42';
      fields.screenVideoBrightness.value = '.5';
      fields.screenVideoContrast.value = '1.2';
      fields.screenVideoSaturation.value = '.64';
      fields.screenVideoHue.value = '8';
      fields.screenVideoTint.value = '.36';
      fields.screenVideoVignette.value = '.42';
      fields.screenVideoScale.value = '1.08';
      fields.screenVideoOffsetX.value = '0';
      fields.screenVideoOffsetY.value = '0';
      fields.screenVideoRotation.value = '0';
      if (fields.screenVideoRemove) fields.screenVideoRemove.checked = false;
      setScreenVideoPreview('');
      updateScreenVideoAppearance();
      renderIntegratedStatsFields();

      showMessage('');
    }

    injectImportUi();
    await initAdminLocalImageImport({ entityType: 'hero' });
    refreshImportedStatsButton();
    updateAllPreviews();
    repairDocumentEncoding();
    bindEncodingRepairObserver();
    restorePendingSaveSuccess();

    window.addEventListener('resize', () => {
      mainEditor.resize();
      cardEditor.resize();
      gifEditor.resize();
      buildImageEditor.resize();
      buildCardEditor.resize();
    });
  } catch (error) {
    console.error('Erro ao iniciar editor:', error);
    showMessage(error.message || 'Não foi possível carregar o editor.', 'error');
  }
}

await initialize();
