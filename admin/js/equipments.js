import {
  listEquipments,
  deleteEquipment
} from './equipment-api.js?v=brain-evolution-4&sb=20260823-security-supabase-pin-1&eq=20260907-effects-1';
import { publicMediaUrl } from './equipment-media.js?v=20260823-security-supabase-pin-1';
import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';

const $ = id => document.getElementById(id);

const list = $('equipment-list');
const search = $('search');
const setFilter = $('set-filter');
const slotFilter = $('slot-filter');
const statusFilter = $('status-filter');
const message = $('message');
const parityStatus = $('equipment-parity-status');

let equipments = [];
let isLoading = false;
let activeActionId = null;
let rarityLevelCounts = new Map();
let rarityLevelsAvailable = true;
let rarityLevelsError = null;

function setMessage(text = '', type = '') {
  if (!message) return;
  message.textContent = text;
  message.className = `equipment-message${type ? ` ${type}` : ''}`;
}

function setMetric(id, value) {
  const node = $(id);
  if (node) node.textContent = value === null || value === undefined ? '—' : String(value);
}

function setParityStatus(text, type = '') {
  if (!parityStatus) return;
  parityStatus.textContent = text;
  parityStatus.classList.toggle('error', type === 'error');
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getEquipmentSetName(item) {
  return (
    item.equipment_sets?.name ||
    item.equipment_set?.name ||
    item.set_name ||
    'Sem conjunto'
  );
}

function getEquipmentSlotName(item) {
  return (
    item.equipment_slots?.name ||
    item.equipment_slot?.name ||
    item.slot_name ||
    item.slot ||
    'Sem slot'
  );
}

function getEquipmentSlug(item) {
  return item.slug || item.code || '';
}

function getEquipmentMediaSource(item) {
  return item.image_path || item.image_url || '';
}

function isPublicEquipment(item) {
  return item.enabled === true;
}

function rarityLevelCount(item) {
  return rarityLevelCounts.get(String(item?.id || '')) || 0;
}

function populateFilters() {
  const sets = [...new Set(
    equipments.map(getEquipmentSetName).filter(Boolean)
  )].sort((first, second) => first.localeCompare(second, 'pt-BR'));

  const slots = [...new Set(
    equipments
      .map(getEquipmentSlotName)
      .filter(Boolean)
      .filter(slotName => {
        const normalizedSlot = normalizeText(slotName).replace(/[^a-z0-9]/g, '');
        return normalizedSlot !== 'eye';
      })
  )].sort((first, second) => first.localeCompare(second, 'pt-BR'));

  if (setFilter) {
    const current = setFilter.value || 'all';
    setFilter.innerHTML = `
      <option value="all">Todos os conjuntos</option>
      ${sets.map(setName => `<option value="${escapeHtml(setName)}">${escapeHtml(setName)}</option>`).join('')}
    `;
    if ([...setFilter.options].some(option => option.value === current)) setFilter.value = current;
  }

  if (slotFilter) {
    const current = slotFilter.value || 'all';
    slotFilter.innerHTML = `
      <option value="all">Todos os slots</option>
      ${slots.map(slotName => `<option value="${escapeHtml(slotName)}">${escapeHtml(slotName)}</option>`).join('')}
    `;
    if ([...slotFilter.options].some(option => option.value === current)) slotFilter.value = current;
  }
}

function updatePublicMetrics() {
  const active = equipments.filter(isPublicEquipment);
  const mediaReady = active.filter(item => Boolean(getEquipmentMediaSource(item))).length;
  const withLevels = rarityLevelsAvailable
    ? active.filter(item => rarityLevelCount(item) > 0).length
    : null;

  setMetric('equipment-admin-total', equipments.length);
  setMetric('equipment-admin-active', active.length);
  setMetric('equipment-admin-media', mediaReady);
  setMetric('equipment-admin-levels', withLevels);

  if (!rarityLevelsAvailable) {
    setParityStatus(
      `Catálogo público carregado, mas os níveis de raridade estão indisponíveis nesta leitura: ${rarityLevelsError?.message || 'consulta indisponível'}.`,
      'error'
    );
    return;
  }

  const missingMedia = active.length - mediaReady;
  const missingLevels = active.length - withLevels;
  setParityStatus(
    `${active.length} ativo(s) no catálogo público · ${mediaReady}/${active.length} com mídia · ${withLevels}/${active.length} com níveis de raridade. ${missingMedia ? `${missingMedia} ativo(s) sem mídia. ` : ''}${missingLevels ? `${missingLevels} ativo(s) usam a raridade-base sem progressão detalhada.` : 'Todos os ativos possuem progressão de raridade.'}`
  );
}

function getFilteredEquipments() {
  const query = normalizeText(search?.value);
  const selectedSet = setFilter?.value || 'all';
  const selectedSlot = slotFilter?.value || 'all';
  const selectedStatus = statusFilter?.value || 'all';

  return equipments
    .filter(item => {
      const setName = getEquipmentSetName(item);
      const slotName = getEquipmentSlotName(item);
      const publicItem = isPublicEquipment(item);

      const matchesQuery =
        !query ||
        normalizeText(item.name).includes(query) ||
        normalizeText(item.slug).includes(query) ||
        normalizeText(setName).includes(query) ||
        normalizeText(slotName).includes(query);

      const matchesSet = selectedSet === 'all' || setName === selectedSet;
      const matchesSlot = selectedSlot === 'all' || slotName === selectedSlot;
      const matchesStatus =
        selectedStatus === 'all' ||
        (selectedStatus === 'active' && publicItem) ||
        (selectedStatus === 'inactive' && !publicItem);

      return matchesQuery && matchesSet && matchesSlot && matchesStatus;
    })
    .sort((first, second) =>
      String(first.name || '').localeCompare(String(second.name || ''), 'pt-BR')
    );
}

function publicParityMarkup(item) {
  const mediaReady = Boolean(getEquipmentMediaSource(item));
  const levels = rarityLevelCount(item);
  const slotReady = Boolean(item.slot_id);
  const setReady = Boolean(item.set_id);

  return `<div class="equipment-public-parity">
    <span class="${mediaReady ? 'ok' : 'warn'}">Mídia ${mediaReady ? '✓' : '—'}</span>
    <span class="${slotReady ? 'ok' : 'warn'}">Slot ${slotReady ? '✓' : '—'}</span>
    <span class="${setReady ? 'ok' : 'warn'}">Set ${setReady ? '✓' : '—'}</span>
    <span class="${rarityLevelsAvailable && levels > 0 ? 'ok' : 'warn'}">${rarityLevelsAvailable ? `${levels} nível${levels === 1 ? '' : 'is'}` : 'Níveis —'}</span>
  </div>`;
}

function renderEquipmentCard(item) {
  const mediaSource = getEquipmentMediaSource(item);
  const imageUrl = mediaSource ? publicMediaUrl(mediaSource) : '';
  const setName = getEquipmentSetName(item);
  const slotName = getEquipmentSlotName(item);
  const slug = getEquipmentSlug(item);
  const isBusy = activeActionId === item.id;
  const publicItem = isPublicEquipment(item);

  return `
    <article class="equipment-card ${publicItem ? '' : 'is-inactive'}" data-equipment-id="${escapeHtml(item.id)}">
      <div class="equipment-card-media" data-public-media="${imageUrl ? 'ready' : 'missing'}">
        ${imageUrl
          ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.name || '')}" loading="lazy">`
          : '<span class="equipment-card-media-empty">Sem imagem</span>'}
        <span class="equipment-card-status ${publicItem ? '' : 'is-inactive'}">${publicItem ? 'Ativo no público' : 'Inativo'}</span>
      </div>

      <div class="equipment-card-body">
        <div class="equipment-card-heading">
          <h2>${escapeHtml(item.name || 'Equipamento sem nome')}</h2>
          <p>${escapeHtml(slug || 'sem-identificador')}</p>
          ${publicParityMarkup(item)}
        </div>

        <div class="equipment-card-meta">
          <div class="equipment-meta-item"><span>Conjunto</span><strong>${escapeHtml(setName)}</strong></div>
          <div class="equipment-meta-item"><span>Slot</span><strong>${escapeHtml(slotName)}</strong></div>
          <div class="equipment-meta-item"><span>Raridade-base</span><strong>${escapeHtml(item.rarity || 'Não informada')}</strong></div>
          <div class="equipment-meta-item"><span>Nível máximo</span><strong>${escapeHtml(item.max_level ?? '—')}</strong></div>
        </div>

        <div class="equipment-card-actions">
          <a class="admin-button" href="./equipment-editor.html?id=${encodeURIComponent(item.id)}">Editar</a>
          <a class="admin-button public-preview" data-public-preview href="../equipamentos.html" target="_blank" rel="noopener">Ver público</a>
          <button class="admin-button danger" type="button" data-delete="${escapeHtml(item.id)}" ${isBusy ? 'disabled' : ''}>
            ${isBusy ? 'Excluindo...' : 'Excluir'}
          </button>
        </div>
      </div>
    </article>
  `;
}

function render() {
  const rows = getFilteredEquipments();

  if (!rows.length) {
    list.innerHTML = '<div class="equipment-empty">Nenhum equipamento encontrado.</div>';
    return;
  }

  list.innerHTML = rows.map(renderEquipmentCard).join('');
  bindCardActions();
}

async function removeEquipment(equipmentId) {
  const item = equipments.find(equipment => String(equipment.id) === String(equipmentId));
  if (!item) return;

  const confirmed = window.confirm(
    `Excluir "${item.name}" permanentemente?\n\n` +
    'Os dados e estatísticas deste equipamento serão removidos.'
  );
  if (!confirmed) return;

  activeActionId = item.id;
  render();
  setMessage(`Excluindo ${item.name}...`);

  try {
    await deleteEquipment(item.id);
    equipments = equipments.filter(equipment => equipment.id !== item.id);
    rarityLevelCounts.delete(String(item.id));
    populateFilters();
    updatePublicMetrics();
    render();
    setMessage(`${item.name} foi excluído.`, 'ok');
  } catch (error) {
    console.error('Erro ao excluir equipamento:', error);
    setMessage(error.message || 'Não foi possível excluir o equipamento.', 'error');
  } finally {
    activeActionId = null;
    render();
  }
}

function bindCardActions() {
  list?.querySelectorAll('[data-delete]').forEach(button => {
    button.addEventListener('click', () => removeEquipment(button.dataset.delete));
  });
}

async function loadRarityLevels() {
  const { data, error } = await supabase
    .from('equipment_rarity_levels')
    .select('equipment_id');

  if (error) throw error;

  const counts = new Map();
  for (const row of data || []) {
    const id = String(row.equipment_id || '');
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

async function load() {
  if (isLoading) return;
  isLoading = true;

  list.innerHTML = '<div class="equipment-empty">Carregando equipamentos...</div>';
  setMessage('Carregando catálogo e paridade pública...');

  try {
    const [equipmentRows, rarityResult] = await Promise.all([
      listEquipments(),
      loadRarityLevels()
        .then(data => ({ data, error: null }))
        .catch(error => ({ data: null, error }))
    ]);

    equipments = equipmentRows;
    rarityLevelsAvailable = Boolean(rarityResult.data);
    rarityLevelsError = rarityResult.error || null;
    rarityLevelCounts = rarityResult.data || new Map();

    populateFilters();
    updatePublicMetrics();
    render();
    setMessage('');
  } catch (error) {
    console.error('Erro ao carregar equipamentos:', error);
    list.innerHTML = '<div class="equipment-empty">Não foi possível carregar os equipamentos.</div>';
    setMetric('equipment-admin-total', null);
    setMetric('equipment-admin-active', null);
    setMetric('equipment-admin-media', null);
    setMetric('equipment-admin-levels', null);
    setParityStatus(`Paridade pública indisponível: ${error.message}`, 'error');
    setMessage(error.message || 'Não foi possível carregar os equipamentos.', 'error');
  } finally {
    isLoading = false;
  }
}

search?.addEventListener('input', render);
setFilter?.addEventListener('change', render);
slotFilter?.addEventListener('change', render);
statusFilter?.addEventListener('change', render);

await load();
