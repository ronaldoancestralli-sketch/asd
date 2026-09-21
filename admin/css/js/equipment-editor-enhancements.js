import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';
import {
  getEquipmentBundle,
  loadEquipmentMeta
} from './equipment-api.js?v=brain-evolution-4&av2=20260828&sb=20260823-security-supabase-pin-1&eq=20260907-effects-1';

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeKey(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function displayValue(value) {
  if (value === null || value === undefined || value === '') {
    return 'Não informado';
  }

  if (typeof value === 'boolean') {
    return value ? 'Ativo' : 'Inativo';
  }

  return String(value);
}

function comparable(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function numericValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = String(value ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function toAttributes(value) {
  if (Array.isArray(value)) {
    return value.map(item => ({
      label: String(item?.label ?? item?.name ?? item?.raw ?? '').trim(),
      value: item?.value ?? ''
    })).filter(item => item.label);
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).map(([label, attributeValue]) => ({
      label,
      value: attributeValue
    }));
  }

  return [];
}

function makeDiff(group, label, before, after) {
  const beforeText = comparable(before);
  const afterText = comparable(after);
  const changed = beforeText !== afterText;
  let kind = 'equal';

  if (changed) {
    const beforeNumber = numericValue(before);
    const afterNumber = numericValue(after);

    if (beforeNumber !== null && afterNumber !== null) {
      kind = afterNumber > beforeNumber ? 'increase' : 'decrease';
    } else {
      kind = 'text';
    }
  }

  return {group, label, before, after, changed, kind};
}

function buildComparison(bundle, draft, meta) {
  const equipment = bundle.equipment;
  const selectedSet = meta.sets.find(item =>
    normalizeKey(item.name) === normalizeKey(draft.setName) ||
    normalizeKey(item.slug) === normalizeKey(draft.setName)
  );
  const oldSet = meta.sets.find(item => item.id === equipment.set_id);
  const oldSlot = meta.slots.find(item => item.id === equipment.slot_id);
  const newSlot = meta.slots.find(item =>
    item.id === (draft.slotId || draft.slot_id) ||
    normalizeKey(item.slug) === normalizeKey(draft.slotSlug) ||
    normalizeKey(item.name) === normalizeKey(draft.slotName)
  );
  const preserve = (incoming, current) =>
    incoming === null || incoming === undefined || incoming === ''
      ? current
      : incoming;

  const diffs = [
    makeDiff('Geral', 'Nome', equipment.name, preserve(draft.name, equipment.name)),
    makeDiff('Geral', 'Slug', equipment.slug, preserve(draft.slug, equipment.slug)),
    makeDiff('Geral', 'Slot', oldSlot?.name || equipment.slot_id, newSlot?.name || oldSlot?.name || equipment.slot_id),
    makeDiff('Geral', 'Conjunto', oldSet?.name || 'Sem conjunto', draft.setName ? (selectedSet?.name || draft.setName) : (oldSet?.name || 'Sem conjunto')),
    makeDiff('Geral', 'Descrição', equipment.description, preserve(draft.description, equipment.description)),
    makeDiff('Geral', 'Recomendação', equipment.recommendation, preserve(draft.recommendation, equipment.recommendation)),
    makeDiff('Geral', 'Ordem', equipment.display_order ?? 0, draft.displayOrder ?? equipment.display_order ?? 0),
    makeDiff('Geral', 'Publicação', equipment.enabled !== false, draft.enabled ?? (equipment.enabled !== false))
  ];

  const oldVariants = new Map(
    bundle.variants.map(row => [row.equipment_rarities?.slug, toAttributes(row.attributes)])
  );

  for (const rarity of meta.rarities) {
    if (!Object.prototype.hasOwnProperty.call(draft.variants || {}, rarity.slug)) continue;
    const oldAttributes = oldVariants.get(rarity.slug) || [];
    const newAttributes = toAttributes(draft.variants[rarity.slug]);
    const oldMap = new Map(oldAttributes.map(item => [normalizeKey(item.label), item]));
    const newMap = new Map(newAttributes.map(item => [normalizeKey(item.label), item]));
    const keys = new Set([...oldMap.keys(), ...newMap.keys()]);

    for (const key of keys) {
      const oldAttribute = oldMap.get(key);
      const newAttribute = newMap.get(key);
      diffs.push(makeDiff(
        `Raridade · ${rarity.name || rarity.slug}`,
        newAttribute?.label || oldAttribute?.label || key,
        oldAttribute?.value,
        newAttribute?.value
      ));
    }
  }

  const oldBonuses = new Map(bundle.bonuses.map(item => [Number(item.required_pieces), item]));
  const newBonuses = new Map((draft.bonuses || []).map(item => [Number(item.required_pieces), item]));
  const bonusKeys = new Set([...oldBonuses.keys(), ...newBonuses.keys()]);

  for (const pieces of bonusKeys) {
    const oldBonus = oldBonuses.get(pieces);
    const newBonus = newBonuses.get(pieces);
    diffs.push(makeDiff(
      'Bônus do conjunto',
      `${pieces} equipamentos`,
      oldBonus?.description,
      newBonus?.description
    ));
  }

  return diffs;
}

function renderComparison(host, diffs) {
  const changed = diffs.filter(item => item.changed);
  const counts = {
    increase: diffs.filter(item => item.kind === 'increase').length,
    decrease: diffs.filter(item => item.kind === 'decrease').length,
    text: diffs.filter(item => item.kind === 'text').length,
    equal: diffs.filter(item => item.kind === 'equal').length
  };
  const groups = [...new Set(changed.map(item => item.group))];
  const rows = groups.map(group => `
    <section class="equipment-change-group">
      <h4>${escapeHtml(group)}</h4>
      ${changed.filter(item => item.group === group).map(item => {
        const beforeNumber = numericValue(item.before);
        const afterNumber = numericValue(item.after);
        const largeChange = beforeNumber !== null && afterNumber !== null && beforeNumber !== 0 && Math.abs((afterNumber - beforeNumber) / beforeNumber) >= .8;
        return `<div class="equipment-change-row">
          <strong>${escapeHtml(item.label)}${largeChange ? ' · ⚠ alteração superior a 80%' : ''}</strong>
          <div class="equipment-change-values">
            <span class="equipment-change-before"><small>ANTES</small><br>${escapeHtml(displayValue(item.before))}</span>
            <span class="equipment-change-arrow">→</span>
            <span class="equipment-change-after"><small>AGORA</small><br>${escapeHtml(displayValue(item.after))}</span>
          </div>
        </div>`;
      }).join('')}
    </section>
  `).join('');

  host.innerHTML = `
    <div class="equipment-change-head">
      <div><h3>Comparação com o equipamento cadastrado</h3><p>Somente os campos diferentes são exibidos abaixo.</p></div>
    </div>
    <div class="equipment-change-summary">
      <div class="equipment-change-stat"><strong>${changed.length}</strong><small>alterações</small></div>
      <div class="equipment-change-stat"><strong>${counts.increase}</strong><small>aumentos</small></div>
      <div class="equipment-change-stat"><strong>${counts.decrease}</strong><small>reduções</small></div>
      <div class="equipment-change-stat"><strong>${counts.text}</strong><small>textos modificados</small></div>
      <div class="equipment-change-stat"><strong>${counts.equal}</strong><small>campos iguais</small></div>
    </div>
    ${changed.length ? rows : '<div class="equipment-change-empty"><strong>Nenhuma alteração encontrada</strong><br>Os dados importados são idênticos aos já cadastrados.</div>'}
  `;
  host.classList.add('is-visible');
}

async function initComparison(params, importedDraft) {
  const host = document.getElementById('equipment-change-review');
  const equipmentId = params.get('id');
  if (!host || !equipmentId || !importedDraft) return;

  try {
    const [bundle, meta] = await Promise.all([
      getEquipmentBundle(equipmentId),
      loadEquipmentMeta()
    ]);
    renderComparison(host, buildComparison(bundle, importedDraft, meta));
  } catch (error) {
    console.error('Erro ao comparar equipamento:', error);
    host.innerHTML = '<div class="equipment-change-empty">Não foi possível carregar a comparação. Os dados do formulário continuam disponíveis para revisão.</div>';
    host.classList.add('is-visible');
  }
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível preparar o recorte da imagem.'));
    };
    image.src = url;
  });
}

function canvasBlob(canvas, type) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Falha ao gerar a imagem enquadrada.')), type, .92);
  });
}

async function initImageCrop() {
  const fileInput = document.getElementById('image-file');
  const cardPreview = document.getElementById('preview-image');
  const fullPreview = document.getElementById('preview-full-image');
  const zoom = document.getElementById('equipment-crop-zoom');
  const positionX = document.getElementById('equipment-crop-x');
  const positionY = document.getElementById('equipment-crop-y');
  const zoomValue = document.getElementById('equipment-crop-zoom-value');
  const xValue = document.getElementById('equipment-crop-x-value');
  const yValue = document.getElementById('equipment-crop-y-value');
  const reset = document.getElementById('equipment-crop-reset');
  const status = document.getElementById('equipment-crop-status');
  if (!fileInput || !cardPreview || !fullPreview) return;

  const params = new URLSearchParams(location.search);
  const equipmentId = params.get('id');

  if (equipmentId) {
    try {
      const bundle = await getEquipmentBundle(equipmentId);
      const item = bundle?.equipment || {};
      if (zoom) zoom.value = String(Math.round(Number(item.image_scale ?? 1) * 100));
      if (positionX) positionX.value = String(Number(item.image_offset_x ?? 0));
      if (positionY) positionY.value = String(Number(item.image_offset_y ?? 0));
    } catch (error) {
      console.warn('Não foi possível carregar o enquadramento salvo:', error);
    }
  }

  const syncFullPreview = () => {
    const sourceImage = cardPreview.querySelector('img');
    if (!sourceImage?.src) return;
    const current = fullPreview.querySelector('img');
    if (current?.src === sourceImage.src) return;
    const image = document.createElement('img');
    image.src = sourceImage.src;
    image.alt = 'Imagem completa do equipamento';
    fullPreview.replaceChildren(image);
  };

  const applyPreviewTransform = () => {
    const image = cardPreview.querySelector('img');
    const zoomNumber = Number(zoom?.value || 100);
    const xNumber = Number(positionX?.value || 0);
    const yNumber = Number(positionY?.value || 0);
    if (image) image.style.transform = `translate(${xNumber}%, ${yNumber}%) scale(${zoomNumber / 100})`;
    if (zoomValue) zoomValue.value = `${zoomNumber}%`;
    if (xValue) xValue.value = String(xNumber);
    if (yValue) yValue.value = String(yNumber);
    if (status) status.textContent = fileInput.files?.[0]
      ? 'O arquivo original será salvo; este enquadramento será guardado separadamente.'
      : 'O enquadramento é salvo sem recortar a imagem original.';
  };

  new MutationObserver(() => {
    syncFullPreview();
    applyPreviewTransform();
  }).observe(cardPreview, {childList: true, subtree: true, attributes: true, attributeFilter: ['src']});

  [zoom, positionX, positionY].forEach(control => control?.addEventListener('input', applyPreviewTransform));
  fileInput.addEventListener('change', () => window.setTimeout(applyPreviewTransform, 0));
  reset?.addEventListener('click', () => {
    if (zoom) zoom.value = '100';
    if (positionX) positionX.value = '0';
    if (positionY) positionY.value = '0';
    applyPreviewTransform();
  });

  window.prepareEquipmentImageForSave = async file => file || null;
  window.getEquipmentImageTransform = () => ({
    fit: 'contain',
    position: '50% 50%',
    scale: Number(zoom?.value || 100) / 100,
    offsetX: Number(positionX?.value || 0),
    offsetY: Number(positionY?.value || 0)
  });

  syncFullPreview();
  applyPreviewTransform();
}

function ensureSaveFeedbackUi() {
  let overlay = document.getElementById('equipment-save-feedback');
  if (overlay) return overlay;

  const style = document.createElement('style');
  style.id = 'equipment-save-feedback-style';
  style.textContent = `
    .equipment-save-feedback{position:fixed;inset:0;z-index:20000;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(1,7,17,.95);backdrop-filter:blur(9px);color:#f8fafc}
    .equipment-save-feedback.is-visible{display:flex}
    .equipment-save-feedback-card{width:min(680px,100%);overflow:hidden;border:1px solid #2a405d;border-radius:24px;background:#081525;box-shadow:0 35px 100px rgba(0,0,0,.65);text-align:center}
    .equipment-save-feedback-line{height:4px;background:linear-gradient(90deg,#6d28d9,#a855f7)}
    .equipment-save-feedback.is-success .equipment-save-feedback-card{border-color:#19875c}.equipment-save-feedback.is-success .equipment-save-feedback-line{background:#35df8d}
    .equipment-form-field.is-invalid label{color:#fda4af}.equipment-form-field.is-invalid .admin-input,.equipment-form-field.is-invalid .admin-select{border-color:#fb7185!important;box-shadow:0 0 0 3px rgba(251,113,133,.16)!important}
    .equipment-save-feedback.is-error .equipment-save-feedback-card{border-color:#b83f52}.equipment-save-feedback.is-error .equipment-save-feedback-line{background:#fb7185}
    .equipment-save-feedback-body{padding:34px 36px 30px}
    .equipment-save-feedback-icon{width:96px;height:96px;margin:0 auto 20px;display:grid;place-items:center;border:2px solid #9b5cf6;border-radius:50%;color:#c4a1ff;font-size:48px;box-shadow:0 0 0 12px rgba(139,92,246,.06)}
    .equipment-save-feedback.is-success .equipment-save-feedback-icon{border-color:#35df8d;color:#70efae}.equipment-save-feedback.is-error .equipment-save-feedback-icon{border-color:#fb7185;color:#fda4af}
    .equipment-save-spinner{width:38px;height:38px;border:4px solid rgba(255,255,255,.13);border-top-color:#b384ff;border-radius:50%;animation:equipment-save-spin .8s linear infinite}
    @keyframes equipment-save-spin{to{transform:rotate(360deg)}}
    .equipment-save-feedback-kicker{color:#b994f5;font-size:11px;font-weight:900;letter-spacing:.15em}.equipment-save-feedback.is-success .equipment-save-feedback-kicker{color:#79edae}.equipment-save-feedback.is-error .equipment-save-feedback-kicker{color:#fda4af}
    .equipment-save-feedback h2{margin:9px 0;font-size:30px;line-height:1.2}.equipment-save-feedback-copy{color:#aab6c8;font-size:13px;line-height:1.6}
    .equipment-save-feedback-name{margin:22px 0;padding:17px;border:1px solid #283a55;border-radius:13px;background:#07101d;color:#fff;font-size:21px;font-weight:900}
    .equipment-save-feedback-details{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:14px}.equipment-save-feedback-details div{padding:12px;border:1px solid #283a55;border-radius:10px;color:#b9c4d5;font-size:11px}
    .equipment-save-feedback-actions{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:25px}.equipment-save-feedback-button{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 17px;border:1px solid #344763;border-radius:11px;background:#101d31;color:#fff;text-decoration:none;font-size:12px;font-weight:800;cursor:pointer}.equipment-save-feedback-button.primary{border:0;background:linear-gradient(135deg,#9857f7,#6d28d9);box-shadow:0 9px 26px rgba(124,58,237,.28)}
    @media(max-width:600px){.equipment-save-feedback{padding:10px}.equipment-save-feedback-body{padding:26px 18px}.equipment-save-feedback h2{font-size:24px}.equipment-save-feedback-details{grid-template-columns:1fr}.equipment-save-feedback-button{flex:1}}
  `;
  document.head.appendChild(style);
  overlay = document.createElement('div');
  overlay.id = 'equipment-save-feedback';
  overlay.className = 'equipment-save-feedback';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-live', 'assertive');
  document.body.appendChild(overlay);
  return overlay;
}

function equipmentFormStats() {
  const rarityCount = document.querySelectorAll('[data-rarity], .rarity-card, .rarity-block').length || Number(document.getElementById('import-rarity-count')?.textContent) || 0;
  const attributeCount = document.querySelectorAll('.attr-row').length || Number(document.getElementById('import-attribute-count')?.textContent) || 0;
  const bonusCount = document.querySelectorAll('.bonus-row').length || Number(document.getElementById('import-bonus-count')?.textContent) || 0;
  return {rarityCount, attributeCount, bonusCount};
}

function initSaveFeedback(params) {
  const form = document.getElementById('form');
  const message = document.getElementById('message');
  if (!form || !message) return;

  const overlay = ensureSaveFeedbackUi();
  const wasEditing = Boolean(params.get('id'));
  const receiptKey = 'equipment-save-success-receipt';
  let savePending = false;
  let timeoutId = null;

  const equipmentName = () =>
    document.getElementById('name')?.value?.trim() || 'Equipamento';

  const openOverlay = state => {
    overlay.className = `equipment-save-feedback is-visible ${state ? `is-${state}` : ''}`;
    document.documentElement.style.overflow = 'hidden';
  };

  const closeOverlay = () => {
    sessionStorage.removeItem(receiptKey);
    overlay.className = 'equipment-save-feedback';
    overlay.innerHTML = '';
    document.documentElement.style.overflow = '';
    document.querySelectorAll('#form button[type="submit"]').forEach(button => { button.disabled = false; });
  };

  const showSaving = () => {
    openOverlay('saving');
    overlay.innerHTML = `<div class="equipment-save-feedback-card"><div class="equipment-save-feedback-line"></div><div class="equipment-save-feedback-body">
      <div class="equipment-save-feedback-icon"><span class="equipment-save-spinner"></span></div>
      <div class="equipment-save-feedback-kicker">GRAVANDO NO BANCO DE DADOS</div>
      <h2>Salvando equipamento...</h2>
      <div class="equipment-save-feedback-copy">Aguarde a confirmação. Não feche esta página.</div>
      <div class="equipment-save-feedback-name">${escapeHtml(equipmentName())}</div>
    </div></div>`;
  };

  const showSuccess = (text, restoredReceipt = null) => {
    savePending = false;
    window.clearTimeout(timeoutId);
    const currentParams = new URLSearchParams(location.search);
    const saveOperation = window.__lastEquipmentSaveOperation;
    const editingNow = restoredReceipt?.editing ?? (
      saveOperation === 'updated' ||
      (
        saveOperation !== 'created' &&
        (wasEditing || Boolean(currentParams.get('id')))
      )
    );
    const stats = restoredReceipt?.stats || equipmentFormStats();
    const savedId = restoredReceipt?.savedId || currentParams.get('id');
    const savedName = restoredReceipt?.name || equipmentName();
    const confirmedText = restoredReceipt?.text || text || 'Os dados foram confirmados no banco de dados.';

    if (!restoredReceipt) {
      sessionStorage.setItem(receiptKey, JSON.stringify({
        editing: editingNow,
        stats,
        savedId: savedId || null,
        name: savedName,
        text: confirmedText,
        createdAt: Date.now()
      }));
    }

    openOverlay('success');
    overlay.innerHTML = `<div class="equipment-save-feedback-card"><div class="equipment-save-feedback-line"></div><div class="equipment-save-feedback-body">
      <div class="equipment-save-feedback-icon">✓</div>
      <div class="equipment-save-feedback-kicker">${editingNow ? 'ATUALIZAÇÃO CONCLUÍDA' : 'CADASTRO CONCLUÍDO'}</div>
      <h2>Equipamento ${editingNow ? 'atualizado' : 'salvo'} com sucesso!</h2>
      <div class="equipment-save-feedback-copy">${escapeHtml(confirmedText)}</div>
      <div class="equipment-save-feedback-name">${escapeHtml(savedName)}</div>
      <div class="equipment-save-feedback-details"><div>✓ Informações gerais confirmadas</div><div>✓ ${stats.rarityCount} raridades processadas</div><div>✓ ${stats.attributeCount} atributos confirmados</div><div>✓ ${stats.bonusCount} bônus processados</div></div>
      <div class="equipment-save-feedback-actions"><button type="button" class="equipment-save-feedback-button" data-save-action="continue">Continuar editando</button><a class="equipment-save-feedback-button" href="./equipments.html">Voltar à lista</a><a class="equipment-save-feedback-button primary" href="${savedId ? `./equipment-editor.html?id=${encodeURIComponent(savedId)}` : './equipments.html'}">${savedId ? 'Abrir equipamento salvo' : 'Ver equipamentos'}</a></div>
    </div></div>`;
    overlay.querySelector('[data-save-action="continue"]')?.addEventListener('click', closeOverlay);
    overlay.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => sessionStorage.removeItem(receiptKey));
    });
  };

  const showError = (text, saved = false) => {
    savePending = false;
    window.clearTimeout(timeoutId);
    openOverlay('error');
    overlay.innerHTML = `<div class="equipment-save-feedback-card"><div class="equipment-save-feedback-line"></div><div class="equipment-save-feedback-body">
      <div class="equipment-save-feedback-icon">!</div><div class="equipment-save-feedback-kicker">${saved ? 'RELEITURA PENDENTE' : 'FALHA NO SALVAMENTO'}</div><h2>${saved ? 'Equipamento salvo; confira os atributos' : 'O equipamento não foi salvo'}</h2>
      <div class="equipment-save-feedback-copy">${escapeHtml(text || 'Revise os dados e tente novamente.')}</div>
      <div class="equipment-save-feedback-actions"><button type="button" class="equipment-save-feedback-button primary" data-save-action="close">Voltar ao editor</button></div>
    </div></div>`;
    overlay.querySelector('[data-save-action="close"]')?.addEventListener('click', closeOverlay);
  };

  const inspectMessage = () => {
    if (!savePending) return;
    const text = message.textContent?.trim() || '';
    if (!text) return;
    if (message.classList.contains('error')) {
      showError(text, /^Equipamento salvo, mas/.test(text));
    } else if (/sucesso|\bsalv[oa]\b|\batualizad[oa]\b|conclu[ií]d/i.test(text)) {
      showSuccess(text);
    } else if (/erro|falha|n[aã]o foi poss[ií]vel|inv[aá]lid|obrigat[oó]ri/i.test(text)) {
      showError(text);
    }
  };

  new MutationObserver(inspectMessage).observe(message, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true
  });

  window.addEventListener('equipment:save-success', event => {
    const detail = event.detail || {};

    if (detail.attributesConfirmed === false) {
      sessionStorage.removeItem(receiptKey);
      showError(detail.text, true);
      return;
    }

    window.__lastEquipmentSaveOperation = detail.operation || 'created';

    showSuccess(
      detail.text || 'Os dados foram confirmados no banco de dados.',
      {
        editing: detail.operation === 'updated',
        stats: detail.stats || equipmentFormStats(),
        savedId: detail.savedId || null,
        name: detail.name || equipmentName(),
        text: detail.text || 'Os dados foram confirmados no banco de dados.',
        createdAt: Date.now()
      }
    );
  });

  window.addEventListener('equipment:save-error', event => {
    showError(
      event.detail?.text || 'Não foi possível salvar o equipamento.'
    );
  });

  form.addEventListener('submit', () => {
    if (!form.checkValidity()) return;
    savePending = true;
    document.querySelectorAll('#form button[type="submit"]').forEach(button => { button.disabled = true; });
    showSaving();
    timeoutId = window.setTimeout(() => {
      if (savePending) showError('O banco de dados não confirmou o salvamento dentro do tempo esperado. Confira sua conexão e tente novamente.');
    }, 45000);
    window.setTimeout(inspectMessage, 0);
  }, true);

  try {
    const receipt = JSON.parse(sessionStorage.getItem(receiptKey) || 'null');
    const currentId = new URLSearchParams(location.search).get('id');
    const currentName = equipmentName();
    const fresh = receipt?.createdAt && Date.now() - receipt.createdAt < 10 * 60 * 1000;
    const sameEquipment =
      (receipt?.savedId && currentId && receipt.savedId === currentId) ||
      (receipt?.name && currentName && normalizeKey(receipt.name) === normalizeKey(currentName));

    if (receipt && fresh && sameEquipment) {
      window.setTimeout(() => showSuccess(receipt.text, receipt), 0);
    } else if (receipt) {
      sessionStorage.removeItem(receiptKey);
    }
  } catch {
    sessionStorage.removeItem(receiptKey);
  }
}


function ensureVersionHistoryUi() {
  let modal = document.getElementById('equipment-version-history-modal');
  if (modal) return modal;

  const style = document.createElement('style');
  style.id = 'equipment-version-history-style';
  style.textContent = `
    .equipment-version-history-modal{position:fixed;inset:0;z-index:21000;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(1,7,17,.94);backdrop-filter:blur(8px)}
    .equipment-version-history-modal.is-visible{display:flex}.equipment-version-history-card{width:min(820px,100%);max-height:min(780px,90vh);overflow:auto;border:1px solid #29415f;border-radius:22px;background:#081525;color:#edf4ff;box-shadow:0 30px 90px rgba(0,0,0,.6)}
    .equipment-version-history-head{position:sticky;top:0;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:22px 24px;border-bottom:1px solid #243956;background:rgba(8,21,37,.98)}
    .equipment-version-history-head h2{margin:0 0 5px;font-size:22px}.equipment-version-history-head p{margin:0;color:#9eb0c8;font-size:12px;line-height:1.5}.equipment-version-history-close{border:1px solid #38506e;border-radius:10px;background:#101f33;color:#fff;padding:9px 12px;cursor:pointer}
    .equipment-version-history-list{display:grid;gap:10px;padding:18px 24px 24px}.equipment-version-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;padding:15px;border:1px solid #253c59;border-radius:14px;background:#0b192b}
    .equipment-version-row strong{display:block;font-size:14px}.equipment-version-row small{display:block;margin-top:5px;color:#91a3bb;line-height:1.45}.equipment-version-restore{border:1px solid #6f4bb6;border-radius:10px;background:#311b57;color:#f4eaff;padding:10px 13px;font-weight:800;cursor:pointer}.equipment-version-restore:disabled{opacity:.55;cursor:wait}
    .equipment-version-empty{padding:22px;border:1px dashed #334b68;border-radius:14px;color:#9eb0c8;text-align:center}.equipment-version-error{color:#fda4af}
    @media(max-width:620px){.equipment-version-history-modal{padding:8px}.equipment-version-row{grid-template-columns:1fr}.equipment-version-restore{width:100%}}
  `;
  document.head.appendChild(style);

  modal = document.createElement('div');
  modal.id = 'equipment-version-history-modal';
  modal.className = 'equipment-version-history-modal';
  modal.innerHTML = `<div class="equipment-version-history-card">
    <div class="equipment-version-history-head"><div><h2>Histórico persistente</h2><p>Snapshots criados no Supabase antes de cada atualização. Restaurar uma versão também preserva o estado atual.</p></div><button type="button" class="equipment-version-history-close" data-version-close>Fechar</button></div>
    <div class="equipment-version-history-list" data-version-list></div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('[data-version-close]').addEventListener('click', () => modal.classList.remove('is-visible'));
  modal.addEventListener('click', event => { if (event.target === modal) modal.classList.remove('is-visible'); });
  return modal;
}

async function initVersionHistory(params) {
  const equipmentId = params.get('id');
  if (!equipmentId) return;
  const actions = document.querySelector('.equipment-editor-toolbar-actions');
  if (!actions || actions.querySelector('[data-equipment-version-history]')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'admin-button secondary';
  button.dataset.equipmentVersionHistory = '1';
  button.textContent = 'Histórico';
  actions.insertBefore(button, actions.firstChild);

  button.addEventListener('click', async () => {
    const modal = ensureVersionHistoryUi();
    const list = modal.querySelector('[data-version-list]');
    modal.classList.add('is-visible');
    list.innerHTML = '<div class="equipment-version-empty">Carregando histórico...</div>';
    try {
      const { data, error } = await supabase
        .from('admin_content_versions')
        .select('id,version,source,created_at,snapshot')
        .eq('entity_type', 'equipment')
        .eq('entity_id', equipmentId)
        .order('version', { ascending: false })
        .limit(12);
      if (error) throw error;
      if (!data?.length) {
        list.innerHTML = '<div class="equipment-version-empty">Ainda não há versões anteriores. O primeiro snapshot será criado antes da próxima atualização.</div>';
        return;
      }

      list.innerHTML = data.map(row => {
        const item = row.snapshot?.equipment || {};
        const when = row.created_at ? new Date(row.created_at).toLocaleString('pt-BR') : 'data indisponível';
        return `<div class="equipment-version-row"><div><strong>Versão ${escapeHtml(row.version)} · ${escapeHtml(item.name || 'Equipamento')}</strong><small>${escapeHtml(when)} · origem: ${escapeHtml(row.source || 'admin-ui')}<br>${item.enabled === false ? 'Inativo' : 'Ativo'} · ${escapeHtml(row.snapshot?.variants?.length ?? 0)} variantes · ${escapeHtml(row.snapshot?.bonuses?.length ?? 0)} bônus</small></div><button type="button" class="equipment-version-restore" data-restore-version="${escapeHtml(row.id)}">Restaurar</button></div>`;
      }).join('');

      list.querySelectorAll('[data-restore-version]').forEach(restoreButton => {
        restoreButton.addEventListener('click', async () => {
          if (!window.confirm('Restaurar esta versão? O estado atual será salvo antes da restauração.')) return;
          restoreButton.disabled = true;
          try {
            const { error: restoreError } = await supabase.rpc('admin_restore_content_version_v2', {
              p_version_id: restoreButton.dataset.restoreVersion
            });
            if (restoreError) throw restoreError;
            sessionStorage.removeItem('equipment-import-draft');
            location.reload();
          } catch (error) {
            restoreButton.disabled = false;
            window.alert(`Não foi possível restaurar a versão: ${error?.message || error}`);
          }
        });
      });
    } catch (error) {
      list.innerHTML = `<div class="equipment-version-empty equipment-version-error">Não foi possível carregar o histórico: ${escapeHtml(error?.message || error)}</div>`;
    }
  });
}

export async function initEquipmentEditorEnhancements({params, importedDraft}) {
  await initComparison(params, importedDraft);
  await initImageCrop();
  initSaveFeedback(params);
  await initVersionHistory(params);
}
