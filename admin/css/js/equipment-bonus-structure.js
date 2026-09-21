/* Echo Arena Admin — editor explícito de bônus de conjunto.
   Objetivo:
   - não adivinhar cálculo pela descrição de novos bônus;
   - preservar bônus legados existentes;
   - permitir efeitos calculáveis estruturados por atributo/tipo/valor;
   - permitir bônus especiais/informativos sem alterar atributos;
   - manter cada peculiaridade de equipamento sem inventar regra.

   Este arquivo NÃO altera a fórmula do game-stat-engine. */
(() => {
  'use strict';

  const MODE = {
    LEGACY: 'legacy',
    CALCULATED: 'calculated',
    INFORMATIONAL: 'informational'
  };

  const TARGETS = [
    {
      id: 'health',
      label: 'Vida',
      operations: {
        percent: { key: 'health_max_pct', label: 'Percentual' },
        flat: { key: 'health', label: 'Valor fixo' }
      }
    },
    {
      id: 'armor',
      label: 'Armadura',
      operations: {
        percent: { key: 'armor_max_pct', label: 'Percentual' },
        flat: { key: 'armor', label: 'Valor fixo' }
      }
    },
    {
      id: 'vision_range',
      label: 'Alcance de visão',
      operations: {
        flat: { key: 'vision_range', label: 'Valor fixo' }
      }
    },
    {
      id: 'aimed_range',
      label: 'Alcance com mira',
      operations: {
        flat: { key: 'weapon_range_franco', label: 'Valor fixo' }
      }
    },
    {
      id: 'magazine_size',
      label: 'Capacidade de munição',
      operations: {
        flat: { key: 'magazine_size', label: 'Valor fixo' }
      }
    },
    {
      id: 'armor_penetration',
      label: 'Penetração de armadura',
      operations: {
        points: { key: 'armor_penetration', label: 'Pontos percentuais' }
      }
    },
    {
      id: 'penetration_power',
      label: 'Poder de perfuração',
      operations: {
        flat: { key: 'penetration_power', label: 'Valor fixo' }
      }
    },
    {
      id: 'damage_to_health',
      label: 'Dano contra vida',
      operations: {
        percent: { key: 'weapon_damage_to_health_pct', label: 'Percentual' }
      }
    },
    {
      id: 'damage_to_armor',
      label: 'Dano contra armadura',
      operations: {
        percent: { key: 'weapon_damage_to_armor_pct', label: 'Percentual' }
      }
    },
    {
      id: 'movement_speed',
      label: 'Velocidade de movimento',
      operations: {
        percent: { key: 'movement_speed_pct', label: 'Percentual' }
      }
    },
    {
      id: 'aimed_movement_speed',
      label: 'Velocidade ao mirar',
      operations: {
        percent: { key: 'aimed_movement_speed_pct', label: 'Percentual' }
      }
    },
    {
      id: 'reload_time',
      label: 'Tempo de recarga',
      operations: {
        percent: { key: 'reload_time_pct', label: 'Percentual' }
      }
    },
    {
      id: 'special_ability_cooldown',
      label: 'Recarga da habilidade especial',
      operations: {
        percent: { key: 'special_ability_cooldown_pct', label: 'Percentual' }
      }
    },
    {
      id: 'crate_opening_cooldown',
      label: 'Tempo de abertura da caixa',
      operations: {
        percent: { key: 'crate_opening_cooldown_pct', label: 'Percentual' }
      }
    },
    {
      id: 'custom',
      label: 'Chave técnica personalizada',
      operations: {
        technical: { key: null, label: 'Técnico / motor existente' }
      }
    }
  ];

  const targetById = new Map(TARGETS.map(item => [item.id, item]));
  const reverseKey = new Map();

  TARGETS.forEach(target => {
    Object.entries(target.operations).forEach(([operation, definition]) => {
      if (!definition.key) return;
      reverseKey.set(definition.key, {
        target: target.id,
        operation
      });
    });
  });

  const bonusCache = new Map();
  let setupDone = false;

  const normalize = value => String(value ?? '').trim();
  const asNumber = value => {
    const parsed = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const cacheKey = (setId, pieces) => `${String(setId || '')}::${Number(pieces || 0)}`;

  function hasStats(stats) {
    return Boolean(
      stats &&
      typeof stats === 'object' &&
      !Array.isArray(stats) &&
      Object.keys(stats).length
    );
  }

  function isInformationalStats(stats) {
    return stats?.__echo_mode === 'informational';
  }

  function numericEntries(stats) {
    if (!hasStats(stats)) return [];
    return Object.entries(stats).filter(([key, value]) => {
      if (key.startsWith('__echo_')) return false;
      return Number.isFinite(Number(value));
    });
  }

  function rememberBonusRows(rows = []) {
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const key = cacheKey(row.set_id, row.required_pieces);
      bonusCache.set(key, {
        exists: true,
        id: row.id || null,
        setId: row.set_id || null,
        pieces: Number(row.required_pieces || 0),
        title: row.title || '',
        description: row.description || '',
        stats: row.stats && typeof row.stats === 'object' ? row.stats : null
      });
    }
  }

  function getSelectedSetId() {
    return document.getElementById('set-id')?.value || '';
  }

  function getRowPieces(row) {
    const input = row.querySelector('input[type="number"]') || row.querySelector('input');
    return Number(input?.value || 0);
  }

  function getCachedBonus(row) {
    const setId = getSelectedSetId();
    const pieces = getRowPieces(row);
    const exact = bonusCache.get(cacheKey(setId, pieces));
    if (exact) return exact;

    const candidates = [...bonusCache.values()].filter(item => Number(item.pieces) === Number(pieces));
    return candidates.length === 1 ? candidates[0] : null;
  }

  function modeFromCache(cached) {
    if (!cached?.exists) return MODE.INFORMATIONAL;
    if (isInformationalStats(cached.stats)) return MODE.INFORMATIONAL;
    if (numericEntries(cached.stats).length) return MODE.CALCULATED;
    return MODE.LEGACY;
  }

  function ensureStyles() {
    if (document.getElementById('equipment-bonus-explicit-style')) return;

    const style = document.createElement('style');
    style.id = 'equipment-bonus-explicit-style';
    style.textContent = `
      .set-bonus-row{align-items:start}
      .bonus-explicit-editor{grid-column:1/-1;display:grid;gap:10px;margin-top:2px;padding:12px;border:1px solid #26344d;border-radius:10px;background:#07101d}
      .bonus-explicit-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}
      .bonus-explicit-head strong{display:block;color:#eef2ff;font-size:11px;letter-spacing:.04em;text-transform:uppercase}
      .bonus-explicit-head small{display:block;margin-top:4px;color:#7f8da3;font-size:9px;line-height:1.45}
      .bonus-mode-select{min-width:230px;min-height:38px;padding:8px 10px;border:1px solid #30415e;border-radius:8px;background:#08111f;color:#e7ecf5;font-size:10px;font-weight:800}
      .bonus-mode-note{padding:9px 10px;border:1px solid #26344d;border-radius:8px;background:#0a1423;color:#91a0b5;font-size:9px;line-height:1.5}
      .bonus-mode-note.ok{border-color:rgba(74,222,128,.35);color:#86efac;background:rgba(34,197,94,.06)}
      .bonus-mode-note.warn{border-color:rgba(251,191,36,.35);color:#fde68a;background:rgba(251,191,36,.05)}
      .bonus-mode-note.info{border-color:rgba(56,189,248,.28);color:#bae6fd;background:rgba(56,189,248,.05)}
      .bonus-effects{display:grid;gap:8px}
      .bonus-effect-row{display:grid;grid-template-columns:minmax(150px,1fr) minmax(130px,.65fr) minmax(90px,.38fr) 38px;gap:7px;align-items:center}
      .bonus-effect-row select,.bonus-effect-row input{width:100%;min-height:38px;padding:8px 9px;border:1px solid #2b3a55;border-radius:8px;background:#050c18;color:#fff;font-size:10px}
      .bonus-effect-row .bonus-custom-key{grid-column:1/4}
      .bonus-effect-remove{width:38px;min-width:38px;min-height:38px;padding:0;border:1px solid rgba(248,113,113,.45);border-radius:8px;background:rgba(127,29,29,.32);color:#fecaca;font-weight:900;cursor:pointer}
      .bonus-explicit-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .bonus-add-effect{min-height:36px;padding:8px 11px;border:1px solid #5b43a4;border-radius:8px;background:rgba(124,58,237,.12);color:#d8c8ff;font-size:9px;font-weight:900;cursor:pointer}
      .bonus-effect-help{color:#64748b;font-size:8.5px;line-height:1.45}
      .bonus-explicit-error{display:none;padding:8px 9px;border:1px solid rgba(251,113,133,.42);border-radius:8px;background:rgba(127,29,29,.18);color:#fecdd3;font-size:9px;line-height:1.45}
      .bonus-explicit-editor.has-error .bonus-explicit-error{display:block}
      @media(max-width:760px){
        .bonus-mode-select{width:100%;min-width:0}
        .bonus-effect-row{grid-template-columns:1fr 1fr}
        .bonus-effect-row .bonus-value{grid-column:1/2}
        .bonus-effect-row .bonus-effect-remove{grid-column:2/3;justify-self:end}
        .bonus-effect-row .bonus-custom-key{grid-column:1/-1}
      }
      @media(max-width:520px){
        .bonus-effect-row{grid-template-columns:1fr 42px}
        .bonus-effect-row .bonus-target,.bonus-effect-row .bonus-operation,.bonus-effect-row .bonus-value,.bonus-effect-row .bonus-custom-key{grid-column:1/2}
        .bonus-effect-row .bonus-effect-remove{grid-column:2/3;grid-row:1/span 4;height:100%}
      }
    `;
    document.head.appendChild(style);
  }

  function targetOptions(selected = '') {
    return `<option value="">Selecione o atributo</option>` + TARGETS.map(target =>
      `<option value="${target.id}"${target.id === selected ? ' selected' : ''}>${target.label}</option>`
    ).join('');
  }

  function operationOptions(targetId, selected = '') {
    const target = targetById.get(targetId);
    if (!target) return '<option value="">Tipo</option>';

    return '<option value="">Tipo</option>' + Object.entries(target.operations).map(([operation, definition]) =>
      `<option value="${operation}"${operation === selected ? ' selected' : ''}>${definition.label}</option>`
    ).join('');
  }

  function addEffectRow(host, effect = {}) {
    const row = document.createElement('div');
    row.className = 'bonus-effect-row';

    const target = effect.target || '';
    const operation = effect.operation || '';
    const value = effect.value ?? '';
    const customKey = effect.customKey || '';

    row.innerHTML = `
      <select class="bonus-target" aria-label="Atributo do bônus">${targetOptions(target)}</select>
      <select class="bonus-operation" aria-label="Tipo do bônus">${operationOptions(target, operation)}</select>
      <input class="bonus-value" type="number" step="any" placeholder="Valor" value="${String(value).replaceAll('"', '&quot;')}">
      <button type="button" class="bonus-effect-remove" aria-label="Remover efeito">×</button>
      <input class="bonus-custom-key" type="text" placeholder="Chave técnica reconhecida pelo motor" value="${String(customKey).replaceAll('"', '&quot;')}" ${target === 'custom' ? '' : 'hidden'}>
    `;

    const targetSelect = row.querySelector('.bonus-target');
    const operationSelect = row.querySelector('.bonus-operation');
    const customKeyInput = row.querySelector('.bonus-custom-key');

    targetSelect.addEventListener('change', () => {
      operationSelect.innerHTML = operationOptions(targetSelect.value, '');
      customKeyInput.hidden = targetSelect.value !== 'custom';
      row.closest('.bonus-explicit-editor')?.setAttribute('data-dirty', 'true');
      refreshEditorState(row.closest('.set-bonus-row'));
    });

    row.addEventListener('input', () => {
      row.closest('.bonus-explicit-editor')?.setAttribute('data-dirty', 'true');
      refreshEditorState(row.closest('.set-bonus-row'));
    });

    row.querySelector('.bonus-effect-remove').addEventListener('click', () => {
      row.remove();
      host.closest('.bonus-explicit-editor')?.setAttribute('data-dirty', 'true');
      refreshEditorState(host.closest('.set-bonus-row'));
    });

    host.appendChild(row);
  }

  function effectsFromStats(stats) {
    const effects = [];

    for (const [key, rawValue] of numericEntries(stats)) {
      const mapped = reverseKey.get(key);
      if (mapped) {
        effects.push({
          target: mapped.target,
          operation: mapped.operation,
          value: rawValue
        });
      } else {
        effects.push({
          target: 'custom',
          operation: 'technical',
          value: rawValue,
          customKey: key
        });
      }
    }

    return effects;
  }

  function collectEditorStats(editor) {
    const mode = editor.querySelector('.bonus-mode-select')?.value || MODE.INFORMATIONAL;

    if (mode === MODE.LEGACY) {
      return {
        mode,
        stats: null,
        errors: []
      };
    }

    if (mode === MODE.INFORMATIONAL) {
      return {
        mode,
        stats: { __echo_mode: 'informational' },
        errors: []
      };
    }

    const stats = {};
    const errors = [];
    const rows = [...editor.querySelectorAll('.bonus-effect-row')];

    if (!rows.length) {
      errors.push('Adicione pelo menos um efeito de cálculo.');
    }

    rows.forEach((row, index) => {
      const targetId = row.querySelector('.bonus-target')?.value || '';
      const operation = row.querySelector('.bonus-operation')?.value || '';
      const rawValue = row.querySelector('.bonus-value')?.value || '';
      const value = asNumber(rawValue);

      if (!targetId) {
        errors.push(`Efeito ${index + 1}: escolha o atributo.`);
        return;
      }

      if (!operation) {
        errors.push(`Efeito ${index + 1}: escolha o tipo.`);
        return;
      }

      if (value === null) {
        errors.push(`Efeito ${index + 1}: informe um valor numérico.`);
        return;
      }

      if (targetId === 'custom') {
        const customKey = normalize(row.querySelector('.bonus-custom-key')?.value);
        if (!customKey) {
          errors.push(`Efeito ${index + 1}: informe a chave técnica.`);
          return;
        }
        stats[customKey] = Number(stats[customKey] || 0) + value;
        return;
      }

      const target = targetById.get(targetId);
      const definition = target?.operations?.[operation];
      if (!definition?.key) {
        errors.push(`Efeito ${index + 1}: combinação de atributo/tipo não suportada.`);
        return;
      }

      stats[definition.key] = Number(stats[definition.key] || 0) + value;
    });

    return {
      mode,
      stats,
      errors
    };
  }

  function refreshEditorState(row) {
    if (!row) return;
    const editor = row.querySelector('.bonus-explicit-editor');
    if (!editor) return;

    const mode = editor.querySelector('.bonus-mode-select')?.value || MODE.INFORMATIONAL;
    const effectsHost = editor.querySelector('.bonus-effects');
    const addButton = editor.querySelector('.bonus-add-effect');
    const note = editor.querySelector('.bonus-mode-note');
    const help = editor.querySelector('.bonus-effect-help');

    effectsHost.hidden = mode !== MODE.CALCULATED;
    addButton.hidden = mode !== MODE.CALCULATED;
    help.hidden = mode !== MODE.CALCULATED;

    note.className = 'bonus-mode-note';

    if (mode === MODE.CALCULATED) {
      const result = collectEditorStats(editor);
      if (result.errors.length) {
        note.classList.add('warn');
        note.textContent = 'Calculável: defina atributo, tipo e valor. Nada será deduzido da descrição.';
      } else {
        note.classList.add('ok');
        note.textContent = 'Cálculo estruturado: estes efeitos serão enviados ao motor exatamente como configurados.';
      }
    } else if (mode === MODE.INFORMATIONAL) {
      note.classList.add('info');
      note.textContent = 'Especial / informativo: a descrição será exibida, mas este bônus não altera atributos numéricos.';
    } else {
      note.classList.add('warn');
      note.textContent = 'Legado: mantém a compatibilidade anterior baseada na descrição. Ao editar este bônus, escolha Calculável ou Especial / informativo.';
    }

    editor.classList.remove('has-error');
    editor.querySelector('.bonus-explicit-error').textContent = '';
  }

  function renderEditor(row) {
    if (!row || row.querySelector('.bonus-explicit-editor')) return;

    const cached = getCachedBonus(row);
    const initialMode = modeFromCache(cached);
    const effects = effectsFromStats(cached?.stats);

    const editor = document.createElement('section');
    editor.className = 'bonus-explicit-editor';
    editor.dataset.initialMode = initialMode;
    editor.dataset.originalDescription = cached?.description ?? '__NEW__';
    editor.dataset.originalStats = cached?.stats ? JSON.stringify(cached.stats) : '';

    editor.innerHTML = `
      <div class="bonus-explicit-head">
        <div>
          <strong>Regra do bônus</strong>
          <small>A descrição é texto. O cálculo é definido separadamente.</small>
        </div>
        <select class="bonus-mode-select" aria-label="Modo do bônus">
          ${cached?.exists && initialMode === MODE.LEGACY ? `<option value="${MODE.LEGACY}" selected>Legado — compatibilidade atual</option>` : ''}
          <option value="${MODE.CALCULATED}"${initialMode === MODE.CALCULATED ? ' selected' : ''}>Calculável — usar atributos</option>
          <option value="${MODE.INFORMATIONAL}"${initialMode === MODE.INFORMATIONAL ? ' selected' : ''}>Especial / informativo — sem cálculo</option>
        </select>
      </div>
      <div class="bonus-mode-note"></div>
      <div class="bonus-effects"></div>
      <div class="bonus-explicit-actions">
        <button type="button" class="bonus-add-effect">+ Adicionar efeito</button>
        <span class="bonus-effect-help">“Chave técnica personalizada” só deve ser usada quando a regra já existir no motor. Assim novos efeitos não são inventados automaticamente.</span>
      </div>
      <div class="bonus-explicit-error"></div>
    `;

    const effectsHost = editor.querySelector('.bonus-effects');
    effects.forEach(effect => addEffectRow(effectsHost, effect));

    if (initialMode === MODE.CALCULATED && !effects.length) {
      addEffectRow(effectsHost);
    }

    editor.querySelector('.bonus-add-effect').addEventListener('click', () => {
      addEffectRow(effectsHost);
      editor.dataset.dirty = 'true';
      refreshEditorState(row);
    });

    editor.querySelector('.bonus-mode-select').addEventListener('change', event => {
      editor.dataset.dirty = 'true';
      if (event.target.value === MODE.CALCULATED && !effectsHost.children.length) {
        addEffectRow(effectsHost);
      }
      refreshEditorState(row);
    });

    const descriptionInput = row.querySelectorAll('input')[2];
    descriptionInput?.addEventListener('input', () => {
      if (editor.querySelector('.bonus-mode-select')?.value === MODE.LEGACY) {
        refreshEditorState(row);
      }
    });

    row.appendChild(editor);
    refreshEditorState(row);
  }

  function scanRows() {
    document.querySelectorAll('#bonuses .set-bonus-row').forEach(renderEditor);
  }

  function validateBeforeSubmit(event) {
    const rows = [...document.querySelectorAll('#bonuses .set-bonus-row')];
    let firstInvalid = null;

    for (const row of rows) {
      const editor = row.querySelector('.bonus-explicit-editor');
      if (!editor) continue;

      const result = collectEditorStats(editor);
      const description = row.querySelectorAll('input')[2]?.value || '';
      const originalDescription = editor.dataset.originalDescription;

      const errors = [...result.errors];

      if (
        result.mode === MODE.LEGACY &&
        originalDescription !== '__NEW__' &&
        description !== originalDescription
      ) {
        errors.push('Este bônus legado foi alterado. Escolha “Calculável” ou “Especial / informativo” antes de salvar.');
      }

      if (result.mode === MODE.LEGACY && originalDescription === '__NEW__') {
        errors.push('Bônus novos não podem usar o modo legado.');
      }

      if (errors.length) {
        editor.classList.add('has-error');
        editor.querySelector('.bonus-explicit-error').textContent = errors.join(' ');
        if (!firstInvalid) firstInvalid = row;
      } else {
        editor.classList.remove('has-error');
        editor.querySelector('.bonus-explicit-error').textContent = '';
      }
    }

    if (!firstInvalid) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    document.querySelector('[data-tab="bonuses"]')?.click();
    firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const message = document.getElementById('message');
    if (message) {
      message.textContent = 'Revise a regra de cálculo dos bônus antes de salvar.';
      message.className = 'eq-message error';
    }
  }

  function endpointInfo(input, init) {
    try {
      const url = typeof input === 'string' || input instanceof URL
        ? String(input)
        : input?.url;
      if (!url) return null;

      const parsed = new URL(url, location.href);
      if (!/\/rest\/v1\/equipment_set_bonuses$/.test(parsed.pathname)) return null;

      return {
        url,
        parsed,
        method: String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
      };
    } catch {
      return null;
    }
  }

  function rowForPayload(payload) {
    const pieces = Number(payload?.required_pieces || 0);
    const candidates = [...document.querySelectorAll('#bonuses .set-bonus-row')]
      .filter(row => getRowPieces(row) === pieces);
    return candidates.length === 1 ? candidates[0] : null;
  }

  function enrichPayload(body) {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return null;
    }

    const list = Array.isArray(parsed) ? parsed : [parsed];
    let changed = false;

    const enriched = list.map(payload => {
      if (!payload || typeof payload !== 'object') return payload;
      const row = rowForPayload(payload);
      const editor = row?.querySelector('.bonus-explicit-editor');
      if (!editor) return payload;

      const result = collectEditorStats(editor);
      if (result.errors.length || result.mode === MODE.LEGACY) return payload;

      changed = true;
      return {
        ...payload,
        stats: result.stats
      };
    });

    if (!changed) return null;
    return JSON.stringify(Array.isArray(parsed) ? enriched : enriched[0]);
  }

  function setupFetchBridge() {
    const originalFetch = globalThis.fetch?.bind(globalThis);
    if (!originalFetch || globalThis.__echoExplicitBonusFetch) return;

    globalThis.__echoExplicitBonusFetch = true;
    globalThis.fetch = async function echoExplicitBonusFetch(input, init) {
      const info = endpointInfo(input, init);

      if (!info) {
        return originalFetch(input, init);
      }

      if (info.method === 'GET') {
        const response = await originalFetch(input, init);
        if (response.ok) {
          try {
            const data = await response.clone().json();
            if (Array.isArray(data)) {
              rememberBonusRows(data);
              queueMicrotask(scanRows);
            }
          } catch {}
        }
        return response;
      }

      if ((info.method === 'POST' || info.method === 'PATCH') && typeof init?.body === 'string') {
        const enrichedBody = enrichPayload(init.body);
        if (enrichedBody) {
          return originalFetch(input, {
            ...init,
            body: enrichedBody
          });
        }
      }

      return originalFetch(input, init);
    };
  }

  function setup() {
    if (setupDone) return;
    setupDone = true;

    ensureStyles();
    setupFetchBridge();
    scanRows();

    const host = document.getElementById('bonuses');
    if (host) {
      new MutationObserver(scanRows).observe(host, {
        childList: true,
        subtree: true
      });
    }

    document.getElementById('set-id')?.addEventListener('change', () => {
      document.querySelectorAll('#bonuses .bonus-explicit-editor').forEach(node => node.remove());
      scanRows();
    });

    document.getElementById('form')?.addEventListener('submit', validateBeforeSubmit, true);
  }

  /* O fetch precisa ser interceptado antes do editor principal iniciar. */
  setupFetchBridge();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup, { once: true });
  } else {
    setup();
  }
})();
