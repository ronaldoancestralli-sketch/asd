import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';

const list = document.getElementById('classes-list');
const message = document.getElementById('message');
const refreshButton = document.getElementById('refresh');

let classes = [];
let heroes = [];
let savingId = null;

const CLASS_PALETTE = [
  '#F4D77A', '#8FE9FF', '#B794FF', '#4ADE80',
  '#F87171', '#FBBF24', '#67E8F9', '#F0A6D0'
];

function setMessage(text = '', type = '') {
  if (!message) return;
  message.textContent = text;
  message.className = `classes-message${type ? ` ${type}` : ''}`;
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function isHex(value = '') {
  return /^#[0-9a-f]{6}$/i.test(String(value).trim());
}

function fallbackColor(item) {
  const key = String(item.slug || item.name || '');
  let sum = 0;
  for (let i = 0; i < key.length; i += 1) sum = (sum + key.charCodeAt(i)) % 997;
  return CLASS_PALETTE[sum % CLASS_PALETTE.length];
}

function colorOf(item) {
  return isHex(item.color) ? item.color.toUpperCase() : fallbackColor(item);
}

function heroesOf(classId) {
  return heroes.filter(hero => String(hero.class_id || '') === String(classId));
}

function ensureSupportStyles() {
  if (document.getElementById('classes-operational-style')) return;
  const style = document.createElement('style');
  style.id = 'classes-operational-style';
  style.textContent = `
    .classes-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .classes-summary article{padding:12px;border:1px solid var(--admin-line);border-radius:11px;background:#09111f}
    .classes-summary small{display:block;color:var(--admin-muted);font-size:8px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
    .classes-summary strong{display:block;margin-top:5px;font-size:22px}.classes-summary span{display:block;margin-top:4px;color:#78869b;font-size:8px}
    .class-identity-meta{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.class-chip{padding:3px 6px;border:1px solid #2e3d57;border-radius:999px;color:#8e9bb0;font-size:7px;font-weight:800;text-transform:uppercase}.class-chip.attention{border-color:#6f5618;color:#efd37a;background:#251d08}
    .class-icon-input{width:100%;min-width:70px;text-align:center}.class-preview-icon{display:grid;place-items:center;width:24px;height:24px;border:1px solid color-mix(in srgb,var(--class-color) 45%,#31415b);border-radius:7px;color:var(--class-color);font-size:13px;font-weight:900}
    @media(max-width:800px){.classes-summary{grid-template-columns:1fr}.class-row{grid-template-columns:1fr!important}}
  `;
  document.head.appendChild(style);
}

function ensureSummary() {
  let target = document.getElementById('classes-summary');
  if (target) return target;
  target = document.createElement('section');
  target.id = 'classes-summary';
  target.className = 'classes-summary';
  message?.insertAdjacentElement('afterend', target);
  return target;
}

function renderSummary() {
  const target = ensureSummary();
  if (!target) return;
  const usedClasses = classes.filter(item => heroesOf(item.id).some(hero => hero.enabled)).length;
  const activeHeroes = heroes.filter(hero => hero.enabled).length;
  const withoutClass = heroes.filter(hero => hero.enabled && !hero.class_id).length;
  target.innerHTML = `
    <article><small>Classes cadastradas</small><strong>${classes.length}</strong><span>${usedClasses} em uso por heróis ativos</span></article>
    <article><small>Heróis ativos</small><strong>${activeHeroes}</strong><span>Vínculo por class_id, sem associação por nome</span></article>
    <article><small>Heróis sem classe</small><strong>${withoutClass}</strong><span>${withoutClass ? 'Revisão necessária no cadastro de heróis' : 'Nenhuma pendência de classificação'}</span></article>`;
}

function renderRow(item) {
  const color = colorOf(item);
  const isCustom = isHex(item.color);
  const isBusy = savingId === item.id;
  const classHeroes = heroesOf(item.id);
  const active = classHeroes.filter(hero => hero.enabled).length;
  const inactive = classHeroes.length - active;
  const icon = String(item.icon || '').trim();

  return `
    <article class="class-row" data-class-id="${escapeHtml(item.id)}" style="--class-color:${escapeHtml(color)}">
      <div class="class-identity">
        <strong>${escapeHtml(item.name || 'Sem nome')}</strong>
        <span>${escapeHtml(item.slug || 'sem identificador')}${isCustom ? '' : ' · cor automática'}</span>
        <div class="class-identity-meta">
          <span class="class-chip ${active ? '' : 'attention'}">${active} herói(s) ativo(s)</span>
          ${inactive ? `<span class="class-chip">${inactive} inativo(s)</span>` : ''}
          ${!active ? '<span class="class-chip attention">classe sem uso atual</span>' : ''}
        </div>
      </div>

      <div class="class-field">
        <label for="color-${escapeHtml(item.id)}">Cor</label>
        <div class="class-color-controls">
          <input id="color-${escapeHtml(item.id)}" type="color" value="${escapeHtml(color)}" data-color-picker="${escapeHtml(item.id)}">
          <input class="admin-input" type="text" maxlength="7" value="${escapeHtml(color)}" data-color-text="${escapeHtml(item.id)}" placeholder="#RRGGBB">
        </div>
      </div>

      <div class="class-field">
        <label for="icon-${escapeHtml(item.id)}">Ícone</label>
        <input id="icon-${escapeHtml(item.id)}" class="admin-input class-icon-input" type="text" maxlength="12" value="${escapeHtml(icon)}" data-icon-text="${escapeHtml(item.id)}" placeholder="Ex.: ◈">
      </div>

      <div class="class-preview">
        <div class="class-preview-thumb"></div>
        <span class="class-preview-icon" data-preview-icon="${escapeHtml(item.id)}">${escapeHtml(icon || '◇')}</span>
        <div class="class-preview-copy"><strong>Nome do herói</strong><span>${escapeHtml(item.name || '')}</span></div>
      </div>

      <div class="class-actions">
        <button class="admin-button primary" type="button" data-save="${escapeHtml(item.id)}" ${isBusy ? 'disabled' : ''}>${isBusy ? 'Salvando...' : 'Salvar aparência'}</button>
        <button class="admin-button" type="button" data-reset="${escapeHtml(item.id)}" ${isBusy ? 'disabled' : ''} title="Volta somente a cor para o modo automático">Cor automática</button>
        <a class="admin-button" href="./heroes.html">Gerenciar heróis</a>
      </div>
    </article>`;
}

function render() {
  renderSummary();
  if (!classes.length) {
    list.innerHTML = '<div class="classes-empty">Nenhuma classe cadastrada. O sistema não cria classes automaticamente.</div>';
    return;
  }
  list.innerHTML = classes.map(renderRow).join('');
}

function previewColor(id, color) {
  const row = list.querySelector(`[data-class-id="${CSS.escape(id)}"]`);
  if (row) row.style.setProperty('--class-color', color);
}

async function saveAppearance(id, color, icon) {
  const item = classes.find(entry => String(entry.id) === String(id));
  if (!item) return;
  if (color !== null && !isHex(color)) {
    setMessage('Use o formato #RRGGBB para a cor.', 'error');
    return;
  }

  savingId = item.id;
  render();
  setMessage('Salvando aparência da classe...');

  try {
    const payload = { color, icon: String(icon || '').trim() || null };
    const { error } = await supabase.from('hero_classes').update(payload).eq('id', item.id);
    if (error) throw error;
    item.color = color;
    item.icon = payload.icon;
    setMessage(`Aparência de “${item.name}” atualizada. O site público lerá estes dados diretamente do banco.`, 'ok');
  } catch (error) {
    console.error('Erro ao salvar classe:', error);
    setMessage(error.message || 'Não foi possível salvar a classe.', 'error');
  } finally {
    savingId = null;
    render();
  }
}

list?.addEventListener('input', event => {
  const picker = event.target.closest('[data-color-picker]');
  if (picker) {
    const id = picker.dataset.colorPicker;
    const text = list.querySelector(`[data-color-text="${CSS.escape(id)}"]`);
    if (text) text.value = picker.value.toUpperCase();
    previewColor(id, picker.value);
    return;
  }

  const text = event.target.closest('[data-color-text]');
  if (text && isHex(text.value)) {
    const id = text.dataset.colorText;
    const picker = list.querySelector(`[data-color-picker="${CSS.escape(id)}"]`);
    if (picker) picker.value = text.value;
    previewColor(id, text.value);
    return;
  }

  const icon = event.target.closest('[data-icon-text]');
  if (icon) {
    const preview = list.querySelector(`[data-preview-icon="${CSS.escape(icon.dataset.iconText)}"]`);
    if (preview) preview.textContent = icon.value.trim() || '◇';
  }
});

list?.addEventListener('click', event => {
  const saveButton = event.target.closest('[data-save]');
  if (saveButton) {
    const id = saveButton.dataset.save;
    const color = list.querySelector(`[data-color-text="${CSS.escape(id)}"]`)?.value?.trim().toUpperCase() ?? null;
    const icon = list.querySelector(`[data-icon-text="${CSS.escape(id)}"]`)?.value ?? '';
    saveAppearance(id, color, icon);
    return;
  }

  const resetButton = event.target.closest('[data-reset]');
  if (resetButton) {
    const id = resetButton.dataset.reset;
    const icon = list.querySelector(`[data-icon-text="${CSS.escape(id)}"]`)?.value ?? '';
    saveAppearance(id, null, icon);
  }
});

refreshButton?.addEventListener('click', () => load());

async function load() {
  list.innerHTML = '<div class="classes-empty">Carregando classes e vínculos com heróis...</div>';
  setMessage('Sincronizando com o banco...');

  try {
    const [classesResult, heroesResult] = await Promise.all([
      supabase.from('hero_classes').select('id,name,slug,color,icon').order('name'),
      supabase.from('heroes').select('id,name,class_id,enabled').order('name')
    ]);
    if (classesResult.error) throw classesResult.error;
    if (heroesResult.error) throw heroesResult.error;
    classes = classesResult.data ?? [];
    heroes = heroesResult.data ?? [];
    setMessage('');
    render();
  } catch (error) {
    console.error('Erro ao carregar classes:', error);
    list.innerHTML = '<div class="classes-empty">Não foi possível carregar as classes.</div>';
    setMessage(error.message || 'Não foi possível carregar as classes.', 'error');
  }
}

ensureSupportStyles();
await load();
