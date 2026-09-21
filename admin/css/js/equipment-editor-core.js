import { equipmentAttributeWithSource } from './equipment-effect-text.js?eq=20260907-effects-1';
import {
  requireAdmin,
  logoutAdmin
} from './admin-auth.js?v=20260823-security-supabase-pin-1';

import {
  loadEquipmentMeta,
  getEquipmentBundle,
  saveEquipmentBundle,
  upsertSet
} from './equipment-api.js?v=brain-evolution-4&scope=20260902-phase2a&persist=20260917-scope-1&av2=20260828&sb=20260823-security-supabase-pin-1&eq=20260907-effects-1';

import {
  EQUIPMENT_SCOPE_TYPES,
  buildEquipmentScopePayload,
  inferEquipmentScope
} from './equipment-scope.js?v=1&persist=20260917-scope-1';

import {
  uploadEquipmentImage,
  publicMediaUrl
} from './equipment-media.js?v=20260823-security-supabase-pin-1';

await requireAdmin();

const logoutButton =
  document.getElementById('logout');

if (logoutButton) {
  logoutButton.onclick =
    logoutAdmin;
}

const IMPORT_KEY =
  'equipment-import-draft';

const IMPORT_BACKUP_KEY =
  'equipment-import-form-backup';

/*
 * Slots exibidos no cadastro.
 * Os nomes são fixos na interface; os slugs apontam para
 * os registros já existentes em equipment_slots.
 */
const REQUIRED_SLOT_OPTIONS = [
  { label: 'Cabeça', slugs: ['cabeca'] },
  { label: 'Peito', slugs: ['body', 'peito', 'corpo'] },
  { label: 'Mãos', slugs: ['maos', 'hands'] },
  { label: 'Perna', slugs: ['leg', 'pes', 'perna', 'pernas'] },
  { label: 'Anel', slugs: ['ring', 'anel'] },
  { label: 'Gadget', slugs: ['especial', 'gadget'] }
];

const params =
  new URLSearchParams(
    location.search
  );

let equipmentId =
  params.get('id');

const importedRaw =
  sessionStorage.getItem(
    IMPORT_KEY
  );

let draft = null;

if (importedRaw) {
  try {
    draft =
      JSON.parse(
        importedRaw
      );
  } catch (error) {
    console.warn(
      'Rascunho de importação inválido:',
      error
    );
  }
}

const form =
  document.getElementById('form');

const message =
  document.getElementById('message');

const rarityHost =
  document.getElementById('rarities');

const bonusHost =
  document.getElementById('bonuses');

const importBanner =
  document.getElementById(
    'import-banner'
  );

const importSummary =
  document.getElementById(
    'import-summary'
  );

const undoImportButton =
  document.getElementById(
    'undo-import'
  );

let meta;
let currentBundle = null;
let importBackup = null;
let importWasApplied = false;
let importAuditSource = 'admin-editor';
let isSaving = false;

const RARITY_ROW_OPERATORS = Object.freeze([
  Object.freeze({
    id: 'increase_flat',
    symbol: '+',
    label: 'Somar'
  }),
  Object.freeze({
    id: 'decrease_flat',
    symbol: '−',
    label: 'Reduzir'
  }),
  Object.freeze({
    id: 'increase_percent',
    symbol: '+%',
    label: 'Aumentar em %'
  }),
  Object.freeze({
    id: 'decrease_percent',
    symbol: '−%',
    label: 'Reduzir em %'
  })
]);

const RARITY_ROW_OPERATORS_BY_ID =
  new Map(
    RARITY_ROW_OPERATORS.map(
      option => [option.id, option]
    )
  );

let rarityRowOperators = [];
let rarityRowOperatorConflicts =
  new Set();

function scopeElements() {
  return {
    type: document.getElementById('scope-type'),
    classId: document.getElementById('scope-class-id'),
    heroId: document.getElementById('scope-hero-id'),
    classField: document.getElementById('scope-class-field'),
    heroField: document.getElementById('scope-hero-field'),
    help: document.getElementById('scope-help')
  };
}

function populateEquipmentScopes() {
  const elements = scopeElements();
  const classNames = new Map(
    (meta.classes || []).map(item => [String(item.id), item.name || item.slug || 'Classe'])
  );

  for (const item of meta.classes || []) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name || item.slug || item.id;
    elements.classId.appendChild(option);
  }

  for (const item of meta.heroes || []) {
    const option = document.createElement('option');
    const className = classNames.get(String(item.class_id || ''));
    option.value = item.id;
    option.textContent = [
      item.name || item.slug || item.id,
      className ? `(${className})` : '',
      item.enabled === false ? '— inativo' : ''
    ].filter(Boolean).join(' ');
    elements.heroId.appendChild(option);
  }
}

function syncEquipmentScopeFields() {
  const elements = scopeElements();
  const scopeType = elements.type.value;
  const isClass = scopeType === EQUIPMENT_SCOPE_TYPES.CLASS;
  const isHero = scopeType === EQUIPMENT_SCOPE_TYPES.HERO;

  elements.classField.hidden = !isClass;
  elements.heroField.hidden = !isHero;
  elements.classId.disabled = !isClass;
  elements.heroId.disabled = !isHero;
  elements.classId.required = isClass;
  elements.heroId.required = isHero;

  if (isClass) {
    elements.help.textContent = 'Somente heróis da classe selecionada poderão escolher este equipamento.';
  } else if (isHero) {
    elements.help.textContent = 'Somente o herói selecionado poderá escolher este equipamento, independentemente da classe.';
  } else if (scopeType === EQUIPMENT_SCOPE_TYPES.GENERIC) {
    elements.help.textContent = 'Itens genéricos podem ser usados por qualquer herói. O nome do item não define exclusividade.';
  } else {
    elements.help.textContent = 'Confirme quem pode usar o equipamento antes de salvar. Importações não inferem exclusividade pelo nome.';
  }
}

function applyEquipmentScope(scope = {}) {
  const elements = scopeElements();
  elements.type.value = scope.scopeType || '';
  elements.classId.value = scope.classId || '';
  elements.heroId.value = scope.heroId || '';
  syncEquipmentScopeFields();
}

function collectEquipmentScopePayload() {
  const elements = scopeElements();
  const scopeType = elements.type.value;

  return buildEquipmentScopePayload({
    scopeType,
    classId: scopeType === EQUIPMENT_SCOPE_TYPES.CLASS ? elements.classId.value : null,
    heroId: scopeType === EQUIPMENT_SCOPE_TYPES.HERO ? elements.heroId.value : null
  });
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
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function setMessage(
  text = '',
  type = ''
) {
  message.textContent =
    text;

  message.className =
    `eq-message${type ? ` ${type}` : ''}`;
}

function validateRequiredEquipmentFields() {
  const requiredFields = [
    {
      element: document.getElementById('name'),
      label: 'Nome do equipamento'
    },
    {
      element: document.getElementById('slug'),
      label: 'Slug do equipamento'
    },
    {
      element: document.getElementById('slot-id'),
      label: 'Slot do equipamento'
    }
  ];

  document
    .querySelectorAll('.equipment-form-field.is-invalid')
    .forEach(field => field.classList.remove('is-invalid'));

  const missing = requiredFields.filter(
    item => !String(item.element?.value || '').trim()
  );

  missing.forEach(item => {
    item.element?.setAttribute('aria-invalid', 'true');
    item.element?.closest('.equipment-form-field')?.classList.add('is-invalid');
  });

  requiredFields
    .filter(item => !missing.includes(item))
    .forEach(item => item.element?.removeAttribute('aria-invalid'));

  if (!missing.length) {
    try {
      collectEquipmentScopePayload();
      return;
    } catch (error) {
      const elements = scopeElements();
      const target = elements.type.value === EQUIPMENT_SCOPE_TYPES.CLASS
        ? elements.classId
        : elements.type.value === EQUIPMENT_SCOPE_TYPES.HERO
          ? elements.heroId
          : elements.type;
      target?.setAttribute('aria-invalid', 'true');
      target?.closest('.equipment-form-field')?.classList.add('is-invalid');
      document.querySelector('[data-tab="general"]')?.click();
      window.setTimeout(() => target?.focus(), 80);
      error.isValidationError = true;
      throw error;
    }
  }

  document.querySelector('[data-tab="general"]')?.click();

  const firstField = missing[0].element;
  window.setTimeout(() => {
    firstField?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    firstField?.focus({ preventScroll: true });
  }, 80);

  const error = new Error(
    `Antes de salvar, preencha: ${missing.map(item => item.label).join(', ')}.`
  );
  error.isValidationError = true;
  throw error;
}

['name', 'slug', 'slot-id'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', event => {
    if (!String(event.currentTarget.value || '').trim()) return;
    event.currentTarget.removeAttribute('aria-invalid');
    event.currentTarget.closest('.equipment-form-field')?.classList.remove('is-invalid');
  });
});

document.getElementById('scope-type')?.addEventListener('change', () => {
  syncEquipmentScopeFields();
  for (const field of [scopeElements().type, scopeElements().classId, scopeElements().heroId]) {
    field?.removeAttribute('aria-invalid');
    field?.closest('.equipment-form-field')?.classList.remove('is-invalid');
  }
});

['scope-class-id', 'scope-hero-id'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', event => {
    if (!String(event.currentTarget.value || '').trim()) return;
    event.currentTarget.removeAttribute('aria-invalid');
    event.currentTarget.closest('.equipment-form-field')?.classList.remove('is-invalid');
  });
});

function populateRequiredSlots() {
  const select =
    document.getElementById('slot-id');

  select.innerHTML = `
    <option value="">
      Selecione um slot
    </option>
  `;

  for (const option of REQUIRED_SLOT_OPTIONS) {
    const match = meta.slots.find(item => {
      const slug = normalizeText(item.slug);
      const name = normalizeText(item.name);

      return option.slugs.some(candidate => {
        const normalized = normalizeText(candidate);
        return slug === normalized || name === normalized;
      });
    });

    if (!match) {
      console.warn(
        `[equipamento] Slot não encontrado para "${option.label}".`,
        option.slugs
      );
      continue;
    }

    const element = document.createElement('option');
    element.value = match.id;
    element.textContent = option.label;
    element.dataset.slug = match.slug || '';
    select.appendChild(element);
  }
}

function findMetaMatch(
  items,
  value
) {
  const wanted =
    normalizeText(value);

  if (!wanted) {
    return null;
  }

  return (
    items.find(item =>
      normalizeText(item.name) === wanted ||
      normalizeText(item.slug) === wanted
    ) ||
    items.find(item => {
      const name =
        normalizeText(item.name);

      const slug =
        normalizeText(item.slug);

      return (
        name.includes(wanted) ||
        wanted.includes(name) ||
        slug.includes(wanted) ||
        wanted.includes(slug)
      );
    }) ||
    null
  );
}

function rarityOperatorOption(
  operatorId
) {
  return RARITY_ROW_OPERATORS_BY_ID.get(
    String(operatorId || '')
  ) || null;
}

function inferRarityAttributeOperator(attribute) {
  const explicit = rarityOperatorOption(attribute?.operator);
  if (explicit) return explicit.id;
  const raw = String(attribute?.raw || '').trim();
  const valueText = String(attribute?.value ?? '').trim();
  const label = normalizeText(attribute?.label || attribute?.name || '');
  const percent = String(attribute?.unit || '').includes('%') || raw.includes('%') || valueText.includes('%');
  const negative = /^\s*(?:[•·*›»]\s*)?[−–-]/.test(raw)
    || /^\s*[−–-]/.test(valueText)
    || /\b(reduz|reducao|diminui|diminuicao|menos)\b/.test(label);
  const numericText = valueText.replace(',', '.').replace(/[^0-9.+-]/g, '');
  if (!numericText || !/\d/.test(numericText)) return '';
  const numeric = Number(numericText);
  if (!Number.isFinite(numeric)) return '';
  return `${negative || numeric < 0 ? 'decrease' : 'increase'}_${percent ? 'percent' : 'flat'}`;
}

function deriveRarityRowOperators(
  values,
  rowCount
) {
  rarityRowOperatorConflicts =
    new Set();

  return Array.from(
    { length: rowCount },
    (_, rowIndex) => {
      const stored =
        new Set();

      let hasInvalidStoredValue =
        false;

      for (
        const rarity
        of meta.rarities
      ) {
        const attribute = values[rarity.slug]?.[rowIndex];
        const operator = inferRarityAttributeOperator(attribute);

        if (!operator) {
          continue;
        }

        if (
          rarityOperatorOption(
            operator
          )
        ) {
          stored.add(operator);
        } else {
          hasInvalidStoredValue =
            true;
        }
      }

      if (
        stored.size === 1 &&
        !hasInvalidStoredValue
      ) {
        return [...stored][0];
      }

      if (
        stored.size > 1 ||
        hasInvalidStoredValue
      ) {
        rarityRowOperatorConflicts.add(
          rowIndex
        );
      }

      return '';
    }
  );
}

function rarityRowCount() {
  return Math.max(
    1,
    ...[
      ...rarityHost.querySelectorAll(
        '.rarity-card'
      )
    ].map(
      card =>
        card.querySelectorAll(
          '.attr-row'
        ).length
    )
  );
}

function refreshRarityRowAnnotations() {
  rarityHost
    .querySelectorAll(
      '.attr-row'
    )
    .forEach(row => {
      const rowIndex =
        Number(
          row.dataset.rowIndex
        );

      const option =
        rarityOperatorOption(
          rarityRowOperators[
            rowIndex
          ]
        );

      row.dataset.attributeOperator = option?.id || '';

      const indicator =
        row.querySelector(
          '.rarity-value-operator'
        );

      if (!indicator) {
        return;
      }

      indicator.textContent =
        option?.symbol || '?';

      indicator.title =
        option
          ? `Linha ${rowIndex + 1}: ${option.label}`
          : `Linha ${rowIndex + 1}: selecione o operador`;

      indicator.classList.toggle(
        'is-unset',
        !option
      );
    });

  rarityHost.dispatchEvent(new CustomEvent('equipment:operators-changed'));
}

function setRarityRowOperator(
  rowIndex,
  operatorId
) {
  if (
    !rarityOperatorOption(
      operatorId
    )
  ) {
    return;
  }

  rarityRowOperators[
    rowIndex
  ] = operatorId;

  rarityRowOperatorConflicts.delete(
    rowIndex
  );

  renderRarityOperatorRows();
  refreshRarityRowAnnotations();
}

function removeRarityLine(
  rowIndex
) {
  const count =
    rarityRowCount();

  if (count <= 1) {
    rarityHost
      .querySelectorAll(
        '.attr-row input, .attr-row textarea'
      )
      .forEach(
        input => {
          input.value = '';
          input.closest('.attr-row')._equipmentAttributeSource = {};
        }
      );

    rarityRowOperators[0] = '';
    rarityRowOperatorConflicts.clear();
    renderRarityOperatorRows();
    refreshRarityRowAnnotations();
    return;
  }

  rarityHost
    .querySelectorAll(
      '.rarity-card'
    )
    .forEach(card => {
      const rows = [
        ...card.querySelectorAll(
          '.attr-row'
        )
      ];

      rows[rowIndex]?.remove();

      [
        ...card.querySelectorAll(
          '.attr-row'
        )
      ].forEach(
        (row, nextIndex) => {
          row.dataset.rowIndex =
            String(nextIndex);
        }
      );
    });

  rarityRowOperators.splice(
    rowIndex,
    1
  );

  rarityRowOperatorConflicts =
    new Set(
      [...rarityRowOperatorConflicts]
        .filter(index => index !== rowIndex)
        .map(
          index =>
            index > rowIndex
              ? index - 1
              : index
        )
    );

  renderRarityOperatorRows();
  refreshRarityRowAnnotations();
}

function addAttrRow(
  host,
  value = {
    label: '',
    value: '',
    unit: ''
  },
  rowIndex = 0
) {
  const row =
    document.createElement('div');

  row.className =
    'attr-row';

  row.dataset.rowIndex =
    String(rowIndex);

  row._equipmentAttributeSource = equipmentAttributeWithSource(value);
  row.innerHTML = `
    <textarea class="attribute-label" rows="3" aria-label="Texto completo do efeito" placeholder="Texto completo do efeito">${escapeHtml(value.label || value.raw || '')}</textarea>

    <label class="rarity-value-field">
      <span
        class="rarity-value-operator is-unset"
        aria-hidden="true"
      >?</span>

      <input
        class="attribute-value"
        placeholder="Valor"
        value="${escapeHtml(
          value.value ?? ''
        )}"
      >
    </label>
  `;

  host.appendChild(row);
  const text = row.querySelector('textarea');
  const resize = () => { text.style.height = 'auto'; text.style.height = Math.max(76, text.scrollHeight) + 'px'; };
  text.addEventListener('input', resize);
  if (typeof ResizeObserver !== 'undefined') {
    let width = 0;
    const observer = new ResizeObserver(entries => {
      if (!row.isConnected) { observer.disconnect(); return; }
      const next = entries[0].contentRect.width;
      if (next !== width) { width = next; resize(); }
    });
    observer.observe(text);
  }
  requestAnimationFrame(resize);
  if (value.raw) {
    const source = document.createElement('details');
    source.className = 'attribute-source';
    source.innerHTML = '<summary>Texto original da leitura</summary><p></p>';
    source.querySelector('p').textContent = value.raw;
    row.appendChild(source);
  }
}

function renderRarityOperatorRows() {
  const host =
    document.getElementById(
      'rarity-row-operators'
    );

  if (!host) {
    return;
  }

  const conflictMessage =
    rarityRowOperatorConflicts.size
      ? `
        <div
          class="rarity-operator-warning"
          role="alert"
        >
          Há operadores divergentes salvos na mesma posição. Escolha novamente para corrigir sem adivinhação.
        </div>
      `
      : '';

  host.innerHTML =
    conflictMessage +
    rarityRowOperators.map(
      (operatorId, rowIndex) => {
        const selected =
          rarityOperatorOption(
            operatorId
          );

        return `
          <div
            class="rarity-operator-row${rarityRowOperatorConflicts.has(rowIndex) ? ' has-conflict' : ''}"
            data-operator-row-index="${rowIndex}"
          >
            <strong>Linha ${rowIndex + 1}</strong>

            <div
              class="rarity-operator-choices"
              role="group"
              aria-label="Operador da linha ${rowIndex + 1}"
            >
              ${RARITY_ROW_OPERATORS.map(
                option => `
                  <button
                    type="button"
                    class="rarity-operator-choice${option.id === operatorId ? ' is-selected' : ''}"
                    data-rarity-row-operator="${option.id}"
                    aria-pressed="${option.id === operatorId}"
                    title="${escapeHtml(option.label)}"
                  >
                    ${escapeHtml(option.symbol)}
                  </button>
                `
              ).join('')}
            </div>

            <span class="rarity-operator-status">
              ${selected
                ? escapeHtml(selected.label)
                : 'Escolha obrigatória'}
            </span>

            <button
              type="button"
              class="rarity-line-remove"
              data-remove-rarity-line="${rowIndex}"
              aria-label="Excluir linha ${rowIndex + 1} de todas as raridades"
              title="Excluir esta linha de todas as raridades"
            >
              ×
            </button>
          </div>
        `;
      }
    ).join('');

  host
    .querySelectorAll(
      '[data-rarity-row-operator]'
    )
    .forEach(button => {
      button.addEventListener(
        'click',
        () => {
          const row =
            button.closest(
              '[data-operator-row-index]'
            );

          setRarityRowOperator(
            Number(
              row?.dataset
                .operatorRowIndex
            ),
            button.dataset
              .rarityRowOperator
          );
        }
      );
    });

  host
    .querySelectorAll(
      '[data-remove-rarity-line]'
    )
    .forEach(button => {
      button.addEventListener(
        'click',
        () =>
          removeRarityLine(
            Number(
              button.dataset
                .removeRarityLine
            )
          )
      );
    });
}

function addRarityLine() {
  const rowIndex =
    rarityRowCount();

  rarityHost
    .querySelectorAll(
      '.rarity-card .attrs'
    )
    .forEach(
      attrs =>
        addAttrRow(
          attrs,
          undefined,
          rowIndex
        )
    );

  rarityRowOperators.push('');
  renderRarityOperatorRows();
  refreshRarityRowAnnotations();
}

function validateRarityRowOperators() {
  const missing =
    new Set();

  rarityHost
    .querySelectorAll(
      '.attr-row'
    )
    .forEach(row => {
      const attribute = readRarityAttributeRow(row, true);
      const hasContent = Boolean(attribute.label || attribute.value);

      const rowIndex =
        Number(
          row.dataset.rowIndex
        );

      if (
        hasContent &&
        !rarityOperatorOption(
          rarityRowOperators[
            rowIndex
          ]
        )
      ) {
        missing.add(
          rowIndex + 1
        );
      }
    });

  if (missing.size) {
    throw new Error(
      `Selecione +, −, +% ou −% para a${missing.size > 1 ? 's' : ''} linha${missing.size > 1 ? 's' : ''} ${[...missing].join(', ')} em Raridades.`
    );
  }
}

function renderRarities(
  values = {}
) {
  const rowCount =
    Math.max(
      1,
      ...meta.rarities.map(
        rarity =>
          Array.isArray(
            values[rarity.slug]
          )
            ? values[rarity.slug].length
            : 0
      )
    );

  rarityRowOperators =
    deriveRarityRowOperators(
      values,
      rowCount
    );

  rarityHost.innerHTML = `
    <section class="rarity-lines-controller">
      <div class="rarity-lines-controller-head">
        <div>
          <strong>Operador por posição da linha</strong>
          <span>Uma escolha vale para esta linha em todas as raridades e será salva junto de cada atributo.</span>
        </div>

        <button
          id="add-rarity-line"
          type="button"
          class="eq-btn"
        >
          Adicionar linha
        </button>
      </div>

      <div id="rarity-row-operators"></div>
    </section>

    <div class="rarity-card-list"></div>
  `;

  const cardsHost =
    rarityHost.querySelector(
      '.rarity-card-list'
    );

  for (
    const rarity
    of meta.rarities
  ) {
    const card =
      document.createElement(
        'article'
      );

    card.className =
      'rarity-card';

    card.dataset.rarityId =
      rarity.id;

    card.dataset.raritySlug =
      rarity.slug;

    card.dataset.variantId = currentBundle?.variants?.find(variant => variant.equipment_rarities?.slug === rarity.slug)?.id || '';

    card.innerHTML = `
      <div class="rarity-head">
        <span
          class="rarity-title"
          style="color:${rarity.color}"
        >
          ${escapeHtml(rarity.name)}
        </span>
      </div>

      <div class="attrs"></div>
    `;

    const attrs =
      card.querySelector(
        '.attrs'
      );

    const current =
      Array.isArray(
        values[rarity.slug]
      )
        ? values[rarity.slug]
        : [];

    for (
      let rowIndex = 0;
      rowIndex < rowCount;
      rowIndex += 1
    ) {
      addAttrRow(
        attrs,
        current[rowIndex],
        rowIndex
      );
    }

    cardsHost.appendChild(card);
  }

  document
    .getElementById(
      'add-rarity-line'
    )
    .addEventListener(
      'click',
      addRarityLine
    );

  renderRarityOperatorRows();
  refreshRarityRowAnnotations();
}

function addBonusRow(
  value = {
    required_pieces: 2,
    title: '',
    description: ''
  }
) {
  const row =
    document.createElement('div');

  row.className =
    'set-bonus-row';

  row.dataset.stats = JSON.stringify(
    value.stats && typeof value.stats === 'object'
      ? value.stats
      : {}
  );

  row.innerHTML = `
    <input
      type="number"
      min="1"
      value="${escapeHtml(
        value.required_pieces || 2
      )}"
    >

    <input
      placeholder="Título"
      value="${escapeHtml(
        value.title || ''
      )}"
    >

    <input
      placeholder="Descrição"
      value="${escapeHtml(
        value.description || ''
      )}"
    >

    <button
      type="button"
      class="eq-btn danger"
    >
      ×
    </button>
  `;

  row
    .querySelector('button')
    .onclick =
      () => row.remove();

  bonusHost.appendChild(row);
}

function readRarityAttributeRow(row, trim = false) {
  const rowIndex = Number(row.dataset.rowIndex);
  const label = row.querySelector('.attribute-label')?.value || '';
  const value = row.querySelector('.attribute-value')?.value || '';
  return equipmentAttributeWithSource(row._equipmentAttributeSource, {
    label: trim ? label.trim() : label,
    value: trim ? value.trim() : value,
    operator: rarityRowOperators[rowIndex] || ''
  });
}

function collectRarityVariants() {
  return [...rarityHost.querySelectorAll('.rarity-card')].map(card => ({
    rarity_id: card.dataset.rarityId,
    attributes: [...card.querySelectorAll('.attr-row')]
      .map(row => readRarityAttributeRow(row, true))
      .filter(attribute => attribute.label)
  }));
}

function collectCurrentFormState() {
  const variants = {};

  rarityHost
    .querySelectorAll(
      '.rarity-card'
    )
    .forEach(card => {
      const slug =
        card.dataset.raritySlug;

      if (!slug) {
        return;
      }

      variants[slug] = [
        ...card.querySelectorAll(
          '.attr-row'
        )
      ].map(row => readRarityAttributeRow(row));
    });

  const bonuses = [
    ...bonusHost.querySelectorAll(
      '.set-bonus-row'
    )
  ].map(row => {
    const inputs =
      row.querySelectorAll(
        'input'
      );

    return {
      required_pieces:
        Number(
          inputs[0]?.value || 2
        ),

      title:
        inputs[1]?.value || '',

      description:
        inputs[2]?.value || '',

      stats: (() => {
        try {
          return JSON.parse(row.dataset.stats || '{}');
        } catch {
          return {};
        }
      })()
    };
  });

  return {
    name:
      document
        .getElementById('name')
        .value,

    slug:
      document
        .getElementById('slug')
        .value,

    slotId:
      document
        .getElementById('slot-id')
        .value,

    setId:
      document
        .getElementById('set-id')
        .value,

    scopeType:
      document
        .getElementById('scope-type')
        .value,

    scopeClassId:
      document
        .getElementById('scope-class-id')
        .value,

    scopeHeroId:
      document
        .getElementById('scope-hero-id')
        .value,

    newSetName:
      document
        .getElementById(
          'new-set-name'
        )
        .value,

    displayOrder:
      document
        .getElementById(
          'display-order'
        )
        .value,

    description:
      document
        .getElementById(
          'description'
        )
        .value,

    recommendation:
      document
        .getElementById(
          'recommendation'
        )
        .value,

    enabled:
      document
        .getElementById(
          'enabled'
        )
        .checked,

    previewHtml:
      document
        .getElementById(
          'preview-image'
        )
        .innerHTML,

    variants,
    bonuses
  };
}

function restoreFormState(
  state
) {
  if (!state) {
    return;
  }

  document
    .getElementById('name')
    .value =
      state.name || '';

  document
    .getElementById('slug')
    .value =
      state.slug || '';

  document
    .getElementById('slot-id')
    .value =
      state.slotId || '';

  document
    .getElementById('set-id')
    .value =
      state.setId || '';

  if (Object.prototype.hasOwnProperty.call(state, 'scopeType')) {
    applyEquipmentScope({
      scopeType: state.scopeType,
      classId: state.scopeClassId || null,
      heroId: state.scopeHeroId || null
    });
  }

  document
    .getElementById(
      'new-set-name'
    )
    .value =
      state.newSetName || '';

  document
    .getElementById(
      'display-order'
    )
    .value =
      state.displayOrder || 0;

  document
    .getElementById(
      'description'
    )
    .value =
      state.description || '';

  document
    .getElementById(
      'recommendation'
    )
    .value =
      state.recommendation || '';

  document
    .getElementById(
      'enabled'
    )
    .checked =
      state.enabled !== false;

  document
    .getElementById(
      'preview-image'
    )
    .innerHTML =
      state.previewHtml ||
      'Prévia da imagem';

  renderRarities(
    state.variants || {}
  );

  bonusHost.innerHTML = '';

  (
    state.bonuses || []
  ).forEach(
    addBonusRow
  );

  if (
    !state.bonuses?.length
  ) {
    addBonusRow();
  }
}

function saveImportBackup() {
  importBackup =
    collectCurrentFormState();

  sessionStorage.setItem(
    IMPORT_BACKUP_KEY,
    JSON.stringify(
      importBackup
    )
  );
}

function loadImportBackup() {
  try {
    const raw =
      sessionStorage.getItem(
        IMPORT_BACKUP_KEY
      );

    return raw
      ? JSON.parse(raw)
      : null;
  } catch {
    return null;
  }
}

function clearImportBackup() {
  importBackup = null;

  sessionStorage.removeItem(
    IMPORT_BACKUP_KEY
  );
}

function showImportSummary(
  data,
  {
    slotMatched = false,
    setMatched = false,
    warnings = []
  } = {}
) {
  const rarityCount =
    Object.values(
      data.variants || {}
    ).filter(
      list =>
        Array.isArray(list) &&
        list.length
    ).length;

  const attributeCount =
    Object.values(
      data.variants || {}
    ).reduce(
      (
        total,
        list
      ) =>
        total +
        (
          Array.isArray(list)
            ? list.length
            : 0
        ),
      0
    );

  document
    .getElementById(
      'import-rarity-count'
    )
    .textContent =
      String(rarityCount);

  document
    .getElementById(
      'import-attribute-count'
    )
    .textContent =
      String(attributeCount);

  document
    .getElementById(
      'import-bonus-count'
    )
    .textContent =
      String(
        data.bonuses?.length || 0
      );

  document
    .getElementById(
      'import-match-count'
    )
    .textContent =
      `${Number(slotMatched) + Number(setMatched)} / 2`;

  const warningHost =
    document.getElementById(
      'import-warnings'
    );

  warningHost.innerHTML =
    warnings.map(
      warning => `
        <div class="eq-import-warning">
          ${escapeHtml(warning)}
        </div>
      `
    ).join('');

  importSummary.classList.add(
    'is-visible'
  );

  importBanner.classList.add(
    'is-visible'
  );

  document
    .getElementById(
      'import-banner-text'
    )
    .textContent =
      `${rarityCount} raridade(s), ` +
      `${attributeCount} atributo(s) e ` +
      `${data.bonuses?.length || 0} bônus aplicados.`;
}

function fillFromDraft(
  data
) {
  if (!data) {
    return;
  }

  saveImportBackup();

  const warnings = [...(data.ocr?.warnings || data.ai?.warnings || [])];

  document
    .getElementById('name')
    .value =
      data.name || '';

  document
    .getElementById('slug')
    .value =
      data.slug ||
      slugify(
        data.name || ''
      );

  document
    .getElementById(
      'description'
    )
    .value =
      data.description || '';

  document
    .getElementById(
      'recommendation'
    )
    .value =
      data.recommendation || '';

  document
    .getElementById(
      'display-order'
    )
    .value =
      Number.isFinite(
        Number(
          data.displayOrder
        )
      )
        ? String(
            Number(
              data.displayOrder
            )
          )
        : '0';

  const enabledField =
    document.getElementById(
      'enabled'
    );

  if (typeof data.enabled === 'boolean') {
    enabledField.checked =
      data.enabled;
  } else if (!equipmentId) {
    enabledField.checked =
      false;
  }

  let slotMatched = false;

  if (data.slot) {
    const slot =
      findMetaMatch(
        meta.slots,
        data.slot
      );

    if (slot) {
      document
        .getElementById(
          'slot-id'
        )
        .value =
          slot.id;

      slotMatched = true;
    } else {
      warnings.push(
        `Slot não encontrado: ${data.slot}.`
      );
    }
  }

  let setMatched = false;

  if (data.setName) {
    const set =
      findMetaMatch(
        meta.sets,
        data.setName
      );

    if (set) {
      document
        .getElementById(
          'set-id'
        )
        .value =
          set.id;

      document
        .getElementById(
          'new-set-name'
        )
        .value =
          '';

      setMatched = true;
    } else {
      document
        .getElementById(
          'new-set-name'
        )
        .value =
          '';

      warnings.push(
        `Conjunto não encontrado: ${data.setName}. Se for realmente um conjunto novo, crie ou selecione manualmente antes de salvar.`
      );
    }
  }

  renderRarities(
    data.variants || {}
  );

  bonusHost.innerHTML = '';

  (
    data.bonuses || []
  ).forEach(
    addBonusRow
  );

  if (
    !data.bonuses?.length
  ) {
    addBonusRow();
  }

  importWasApplied = true;
  importAuditSource = data.importSource === 'equipment-images-local-ocr' || data.ocr?.evidence?.kind === 'game_capture'
    ? 'game-capture'
    : data.importSource === 'equipment-json'
      ? 'json-import'
      : 'admin-editor';

  showImportSummary(
    data,
    {
      slotMatched,
      setMatched,
      warnings
    }
  );

  setMessage(
    'Importação aplicada. Revise os campos antes de salvar.',
    'ok'
  );
}

function fillExisting(bundle) {
  const equipment =
    bundle.equipment;

  document
    .getElementById(
      'page-title'
    )
    .textContent =
      'Editar equipamento';

  document
    .getElementById('name')
    .value =
      equipment.name || '';

  document
    .getElementById('slug')
    .value =
      equipment.slug || '';

  document
    .getElementById('slot-id')
    .value =
      equipment.slot_id || '';

  document
    .getElementById('set-id')
    .value =
      equipment.set_id || '';

  applyEquipmentScope(
    inferEquipmentScope(equipment)
  );

  document
    .getElementById(
      'display-order'
    )
    .value =
      equipment.display_order || 0;

  document
    .getElementById(
      'description'
    )
    .value =
      equipment.description || '';

  document
    .getElementById(
      'recommendation'
    )
    .value =
      equipment.recommendation || '';

  document
    .getElementById(
      'enabled'
    )
    .checked =
      equipment.enabled !== false;

  if (equipment.image_path) {
    document
      .getElementById(
        'preview-image'
      )
      .innerHTML = `
        <img
          src="${publicMediaUrl(
            equipment.image_path
          )}"
          alt=""
        >
      `;
  }

  const variantMap = {};

  for (
    const variant
    of bundle.variants
  ) {
    variantMap[
      variant.equipment_rarities.slug
    ] =
      variant.attributes || [];
  }

  renderRarities(
    variantMap
  );

  bonusHost.innerHTML = '';

  bundle.bonuses.forEach(
    addBonusRow
  );

  if (!bundle.bonuses.length) {
    addBonusRow();
  }
}

document
  .getElementById('name')
  .oninput =
    event => {
      if (!equipmentId) {
        document
          .getElementById('slug')
          .value =
            slugify(
              event.target.value
            );
      }
    };

document
  .getElementById(
    'image-file'
  )
  .onchange =
    event => {
      const file =
        event.target.files?.[0];

      if (file) {
        document
          .getElementById(
            'preview-image'
          )
          .innerHTML = `
            <img
              src="${URL.createObjectURL(file)}"
              alt=""
            >
          `;
      }
    };

document
  .getElementById(
    'add-bonus'
  )
  .onclick =
    () => addBonusRow();

undoImportButton.addEventListener(
  'click',
  () => {
    const backup =
      importBackup ||
      loadImportBackup();

    if (!backup) {
      setMessage(
        'Nenhum backup de formulário foi encontrado.',
        'error'
      );

      return;
    }

    restoreFormState(
      backup
    );

    importWasApplied = false;
    importAuditSource = 'admin-editor';

    importBanner.classList.remove(
      'is-visible'
    );

    importSummary.classList.remove(
      'is-visible'
    );

    clearImportBackup();

    sessionStorage.removeItem(
      IMPORT_KEY
    );

    setMessage(
      'O preenchimento importado foi desfeito.',
      'ok'
    );
  }
);

form.onsubmit =
  async event => {
    event.preventDefault();

    if (isSaving) {
      return;
    }

    isSaving = true;

    setMessage(
      'Salvando...'
    );

    try {
      validateRequiredEquipmentFields();

      const equipmentScope =
        collectEquipmentScopePayload();

      validateRarityRowOperators();

      const selectedSlotId =
        document
          .getElementById('slot-id')
          .value;

      let setId =
        document
          .getElementById(
            'set-id'
          )
          .value ||
        null;

      const newSetName =
        document
          .getElementById(
            'new-set-name'
          )
          .value
          .trim();

      if (newSetName) {
        const set =
          await upsertSet({
            name:
              newSetName,

            slug:
              slugify(
                newSetName
              ),

            description:
              ''
          });

        setId =
          set.id;
      }

      const selectedImageFile =
        document
          .getElementById(
            'image-file'
          )
          .files?.[0];

      const imageFile =
        selectedImageFile &&
        typeof window.prepareEquipmentImageForSave === 'function'
          ? await window.prepareEquipmentImageForSave(
              selectedImageFile
            )
          : selectedImageFile;

      const imagePath =
        imageFile
          ? await uploadEquipmentImage(
              imageFile
            )
          : currentBundle
              ?.equipment
              .image_path ||
            null;

      const variants = collectRarityVariants();

      const bonuses = [
        ...bonusHost.querySelectorAll(
          '.set-bonus-row'
        )
      ].map(
        (
          row,
          index
        ) => {
          const inputs =
            row.querySelectorAll(
              'input'
            );

          return {
            required_pieces:
              Number(
                inputs[0]
                  .value
              ),

            title:
              inputs[1]
                .value
                .trim(),

            description:
              inputs[2]
                .value
                .trim(),

            stats: (() => {
              try {
                return JSON.parse(row.dataset.stats || '{}');
              } catch {
                return {};
              }
            })(),

            display_order:
              index + 1
          };
        }
      ).filter(
        item =>
          item.title &&
          item.description
      );

      const imageTransform =
        typeof window.getEquipmentImageTransform === 'function'
          ? window.getEquipmentImageTransform()
          : null;

      const savedEquipment =
        await saveEquipmentBundle({
          equipmentId,

          equipment: {
            ...equipmentScope,

            name:
              document
                .getElementById(
                  'name'
                )
                .value
                .trim(),

            slug:
              document
                .getElementById(
                  'slug'
                )
                .value
                .trim(),

            slot_id:
              selectedSlotId,

            set_id:
              setId,

            description:
              document
                .getElementById(
                  'description'
                )
                .value
                .trim(),

            recommendation:
              document
                .getElementById(
                  'recommendation'
                )
                .value
                .trim(),

            image_path:
              imagePath,

            image_fit:
              imageTransform?.fit ||
              currentBundle?.equipment?.image_fit ||
              'contain',

            image_position:
              imageTransform?.position ||
              currentBundle?.equipment?.image_position ||
              '50% 50%',

            image_scale:
              imageTransform?.scale ??
              currentBundle?.equipment?.image_scale ??
              1,

            image_offset_x:
              imageTransform?.offsetX ??
              currentBundle?.equipment?.image_offset_x ??
              0,

            image_offset_y:
              imageTransform?.offsetY ??
              currentBundle?.equipment?.image_offset_y ??
              0,

            enabled:
              document
                .getElementById(
                  'enabled'
                )
                .checked,

            display_order:
              Number(
                document
                  .getElementById(
                    'display-order'
                  )
                  .value ||
                0
              )
          },

          variants,
          bonuses,
          replaceVariants: true,
          replaceBonuses: true,
          auditSource: importWasApplied ? importAuditSource : 'admin-editor'
        });

      sessionStorage.removeItem(
        IMPORT_KEY
      );

      clearImportBackup();

      const wasUpdated =
        savedEquipment?.operation ===
        'updated' ||
        Boolean(equipmentId);

      window.__lastEquipmentSaveOperation =
        savedEquipment?.operation ||
        (
          wasUpdated
            ? 'updated'
            : 'created'
        );

      const attributesConfirmed = savedEquipment?.attributeVerification?.status === 'confirmed';
      const scopeConfirmed = savedEquipment?.scopeVerification?.status === 'confirmed';
      const saveConfirmed = attributesConfirmed && scopeConfirmed;
      const saveText = !scopeConfirmed
        ? 'Equipamento salvo, mas o banco não confirmou para quem ele está disponível. Não confie no escopo até reabrir o cadastro.'
        : attributesConfirmed
          ? 'Equipamento salvo. Escopo, valores e operadores confirmados por releitura no banco.'
          : 'Equipamento salvo com o escopo confirmado, mas não foi possível confirmar os atributos por releitura. Reabra o equipamento e confira antes de usar os cálculos.';
      setMessage(saveText, saveConfirmed ? 'ok' : 'error');

      currentBundle = {
        equipment:
          savedEquipment,
        variants,
        bonuses
      };

      if (savedEquipment?.id) {
        equipmentId = savedEquipment.id;
        const savedUrl =
          new URL(
            location.href
          );

        savedUrl.searchParams.set(
          'id',
          savedEquipment.id
        );

        history.replaceState(
          {},
          '',
          savedUrl
        );
      }

      window.dispatchEvent(
        new CustomEvent(
          'equipment:save-success',
          {
            detail: {
              operation:
                wasUpdated
                  ? 'updated'
                  : 'created',
              savedId:
                savedEquipment?.id ||
                equipmentId ||
                null,
              name:
                savedEquipment?.name ||
                document
                  .getElementById('name')
                  .value
                  .trim(),
              text: saveText,
              attributesConfirmed,
              stats: {
                rarityCount:
                  variants.length,
                attributeCount:
                  variants.reduce(
                    (total, variant) =>
                      total + variant.attributes.length,
                    0
                  ),
                bonusCount:
                  bonuses.length
              }
            }
          }
        )
      );
    } catch (error) {
      setMessage(
        error.message ||
        'Não foi possível salvar o equipamento.',
        'error'
      );

      window.dispatchEvent(
        new CustomEvent(
          'equipment:save-error',
          {
            detail: {
              text:
                error.message ||
                'Não foi possível salvar o equipamento.'
            }
          }
        )
      );
    } finally {
      isSaving = false;
    }
  };

meta =
  await loadEquipmentMeta();

populateRequiredSlots();
populateEquipmentScopes();
applyEquipmentScope();

document
  .getElementById(
    'set-id'
  )
  .innerHTML +=
    meta.sets.map(
      item => `
        <option value="${item.id}">
          ${escapeHtml(item.name)}
        </option>
      `
    ).join('');

renderRarities();
addBonusRow();

if (equipmentId) {
  currentBundle =
    await getEquipmentBundle(
      equipmentId
    );

  fillExisting(
    currentBundle
  );
}

if (draft) {
  fillFromDraft(
    draft
  );
}


window.addEventListener('echoarena:image-import-result', event => {
  if (event.detail?.entityType !== 'equipment' || !event.detail?.data) return;

  const incoming = event.detail.data;
  const current = collectCurrentFormState();
  const currentSlot = meta.slots.find(item => item.id === current.slotId);
  const currentSet = meta.sets.find(item => item.id === current.setId);
  const requestedSet = incoming.setName ? findMetaMatch(meta.sets, incoming.setName) : null;

  const variants = { ...(current.variants || {}) };
  for (const [slug, rows] of Object.entries(incoming.variants || {})) {
    if (Array.isArray(rows) && rows.length) variants[slug] = rows;
  }

  const bonusMap = new Map(
    (current.bonuses || []).map(item => [Number(item.required_pieces), item])
  );
  for (const bonus of incoming.bonuses || []) {
    bonusMap.set(Number(bonus.required_pieces), bonus);
  }

  const ocrWarnings = [...(incoming.ocr?.warnings || incoming.ai?.warnings || [])];
  if (incoming.setName && !requestedSet) {
    ocrWarnings.unshift(
      `O conjunto "${incoming.setName}" não existe no catálogo e não será criado automaticamente.`
    );
  }
  if (!equipmentId) {
    ocrWarnings.unshift('Novo equipamento mantido inativo até a revisão final.');
  }

  fillFromDraft({
    name: incoming.name || current.name,
    slug: incoming.slug || current.slug || slugify(incoming.name || current.name),
    slot: incoming.slot || currentSlot?.slug || currentSlot?.name || '',
    setName: requestedSet?.name || currentSet?.name || '',
    description: incoming.description ?? current.description,
    recommendation: incoming.recommendation ?? current.recommendation,
    displayOrder: incoming.displayOrder ?? Number(current.displayOrder || 0),
    enabled: equipmentId
      ? (typeof incoming.enabled === 'boolean' ? incoming.enabled : current.enabled)
      : false,
    variants,
    bonuses: [...bonusMap.values()].sort(
      (a, b) => Number(a.required_pieces || 0) - Number(b.required_pieces || 0)
    ),
    ocr: {
      confidence: incoming.ocr?.confidence ?? null,
      warnings: ocrWarnings,
      readings: incoming.ocr?.readings || [],
      evidence: incoming.ocr?.evidence || null
    },
    importedAt: new Date().toISOString(),
    importSource: 'equipment-images-local-ocr'
  });
});
