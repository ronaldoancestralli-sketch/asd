import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';
import {
  EFFECT_CONDITION_OPTIONS,
  EFFECT_DURATION_OPTIONS,
  EFFECT_OPERATOR_OPTIONS,
  EFFECT_SOURCE_KIND_OPTIONS,
  EFFECT_STACKING_OPTIONS,
  EFFECT_SUPPORT_OPTIONS,
  EFFECT_TARGET_OPTIONS,
  EFFECT_TIER_OPTIONS,
  EFFECT_VERIFICATION_OPTIONS,
  buildEquipmentVariantEffectDocument,
  buildPersistentEvidence,
  centralWorkflowLabel,
  effectSemanticsFromOperator,
  inspectPersistentEvidence,
  operatorFormula,
  operatorFromStoredEffect,
  validateCentralEffectDraft
} from './equipment-effect-central-core.js?v=20260903-effect-matrix-1';
import {
  EQUIPMENT_EFFECT_SOURCE_RULES_V1,
  EQUIPMENT_EFFECT_SOURCE_RULESET_REVISION,
  findEquipmentSourceRule,
  sourceRuleCoverage
} from './equipment-effect-source-rules-v1.js?v=20260903-effect-matrix-1';

const root = document.getElementById('equipment-effect-central-root');
const mount = root?.querySelector('[data-effect-central-mount]');

const labels = {
  health_capacity: 'Vida máxima do herói',
  armor_capacity: 'Armadura máxima do herói',
  health_regeneration_rate: 'Regeneração de vida',
  armor_regeneration_rate: 'Regeneração de armadura',
  ability_heal_amount: 'Cura da habilidade',
  penetration_power: 'Poder de perfuração',
  armor_penetration: 'Penetração de armadura',
  reload_duration: 'Tempo de recarga da arma',
  aim_duration: 'Tempo para mirar',
  crate_open_duration: 'Tempo para abrir caixa',
  ability_duration: 'Duração da habilidade',
  ability_cooldown_duration: 'Recarga da habilidade',
  weapon_mode_switch_duration: 'Troca de modo da arma',
  movement_noise: 'Ruído de movimento',
  vision_range: 'Alcance de visão',
  aimed_range: 'Alcance da mira (tamanho/comprimento)',
  unaimed_fire_spread: 'Dispersão sem mirar (largura da mira)',
  weapon_recoil: 'Recuo da arma principal',
  magazine_capacity: 'Capacidade do carregador',
  movement_speed: 'Velocidade de movimento',
  aimed_movement_speed: 'Velocidade ao mirar',
  weapon_damage_to_health: 'Dano à vida',
  weapon_damage_to_armor: 'Dano à armadura',
  shots_per_second: 'Tiros por segundo',
  fire_interval: 'Intervalo entre tiros',
  supported: 'Mecânica representada pelo registro',
  pending: 'Pendente / registro ainda não instalado',
  confirmed: 'Fonte confirmada',
  partially_confirmed: 'Fonte parcialmente confirmada',
  unverified: 'Fonte ainda não conferida',
  disputed: 'Fonte contestada',
  official: 'Fonte oficial',
  game_screenshot: 'Captura do jogo',
  catalog: 'Catálogo comunitário',
  historical_audit: 'Auditoria histórica',
  admin_entry: 'Entrada administrativa',
  migration: 'Migração',
  unknown: 'Desconhecido',
  always: 'Sempre',
  ability_active: 'Habilidade ativa',
  after_event: 'Após evento',
  mode_active: 'Modo ativo',
  state_active: 'Estado ativo',
  unsupported: 'Não suportado',
  not_applicable: 'Não se aplica',
  while_condition: 'Enquanto a condição durar',
  known: 'Duração conhecida',
  independent: 'Independente',
  additive: 'Aditivo',
  multiplicative: 'Multiplicativo',
  highest: 'Maior valor',
  lowest: 'Menor valor',
  replace: 'Substitui',
  incremental: 'Incremental',
  cumulative_total: 'Total cumulativo'
};

const workflowLabels = {
  draft: 'Rascunho',
  in_review: 'Em revisão',
  reviewed: 'Aprovado — não publicado',
  changes_requested: 'Ajustes solicitados'
};

const sourceTargets = EQUIPMENT_EFFECT_SOURCE_RULES_V1
  .flatMap(rule => rule.effects.map(effect => effect.target));
const targetOptions = [...new Set([...EFFECT_TARGET_OPTIONS, ...sourceTargets])]
  .sort((left, right) => optionLabel(left).localeCompare(optionLabel(right), 'pt-BR'));
const builtinTargets = new Set(EFFECT_TARGET_OPTIONS);

const state = {
  equipmentId: new URLSearchParams(location.search).get('id'),
  equipmentName: '',
  variants: [],
  documents: [],
  effects: [],
  evidence: {},
  evidenceMetadata: {},
  conflicts: [],
  sourceRuleId: '',
  selectedReviewVariantId: null,
  dirty: false,
  busy: false
};

function optionLabel(value) {
  return labels[value] || String(value || '').replaceAll('_', ' ');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function text(value) {
  return String(value ?? '').trim();
}

function stableKey(value, fallback = 'bonus') {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function appendOptions(select, values, placeholder = null) {
  select.replaceChildren();
  if (placeholder !== null) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = placeholder;
    select.append(option);
  }
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = optionLabel(value);
    select.append(option);
  }
}

function field(container, name) {
  return container.querySelector(`[data-effect-field="${name}"]`);
}

function valueOf(container, name) {
  return field(container, name)?.value ?? '';
}

function setValue(container, name, value) {
  const control = field(container, name);
  if (control) control.value = value ?? '';
}

function selectedSourceRule() {
  return EQUIPMENT_EFFECT_SOURCE_RULES_V1.find(rule => rule.id === state.sourceRuleId) || null;
}

function documentForVariant(variantId) {
  return state.documents.find(document =>
    document.subject_kind === 'equipment_variant' && document.subject_id === variantId
  ) || null;
}

function variantSlug(variant) {
  return text(variant?.equipment_rarities?.slug || variant?.equipment_rarities?.name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
}

function variantLabel(variant) {
  return variant?.equipment_rarities?.name ||
    variant?.equipment_rarities?.slug ||
    variant?.rarity_id ||
    variant?.id ||
    'Raridade';
}

function defaultMatrixEffect(index = 0) {
  return {
    key: `bonus-${index + 1}`,
    target: '',
    sourceDirection: '',
    operator: '',
    originalText: '',
    supportStatus: 'pending',
    supportReason: 'awaiting_review',
    supportDetails: '',
    verificationStatus: 'unverified',
    verifiedAt: '',
    sourceKind: 'unknown',
    sourceReference: '',
    observedAt: '',
    gameRevision: '',
    conditionKind: 'always',
    conditionReference: '',
    conditionText: '',
    durationKind: 'not_applicable',
    durationValue: '',
    durationUnit: '',
    durationText: '',
    heroIds: '',
    classIds: '',
    abilityIds: '',
    modeIds: '',
    stackingGroup: '',
    stackingRule: 'unknown',
    tierSemantics: 'unknown',
    maxStacks: '',
    values: Object.fromEntries(state.variants.map(variant => [variant.id, ''])),
    variantInputs: {}
  };
}

function inputFromStoredEffect(effect = {}) {
  const condition = effect.condition || {};
  const duration = effect.duration || {};
  const scope = effect.scope || {};
  const stacking = effect.stacking || {};
  const provenance = effect.provenance || {};
  const source = Array.isArray(provenance.sources) ? provenance.sources[0] || {} : {};
  const conditionReference = {
    ability_active: condition.ability_id,
    after_event: condition.event_id,
    mode_active: condition.mode_id,
    state_active: condition.state_id
  }[condition.kind] || '';
  return {
    effectId: effect.effect_id || '',
    effectRevision: effect.effect_revision || 1,
    target: effect.target || '',
    operator: operatorFromStoredEffect(effect) || '',
    originalText: effect.original_text || '',
    supportStatus: effect.support?.status || 'pending',
    supportReason: effect.support?.reason_code || '',
    supportDetails: effect.support?.details || '',
    verificationStatus: provenance.verification_status || 'unverified',
    verifiedAt: typeof provenance.verified_at === 'string'
      ? provenance.verified_at.replace(/Z$/, '').slice(0, 16)
      : '',
    sourceKind: source.kind || 'unknown',
    sourceReference: source.reference || '',
    observedAt: source.observed_at || '',
    gameRevision: source.game_revision || '',
    conditionKind: condition.kind || 'always',
    conditionReference,
    conditionText: condition.raw_text || '',
    durationKind: duration.kind || 'not_applicable',
    durationValue: duration.value ?? '',
    durationUnit: duration.unit || '',
    durationText: duration.raw_text || '',
    heroIds: (scope.hero_ids || []).join(', '),
    classIds: (scope.class_ids || []).join(', '),
    abilityIds: (scope.ability_ids || []).join(', '),
    modeIds: (scope.mode_ids || []).join(', '),
    stackingGroup: stacking.group || '',
    stackingRule: stacking.rule || 'unknown',
    tierSemantics: stacking.tier_semantics || 'unknown',
    maxStacks: stacking.max_stacks ?? ''
  };
}

function matrixFromDocuments() {
  const groups = new Map();
  const conflicts = [];
  for (const variant of state.variants) {
    const effects = documentForVariant(variant.id)?.current_revision?.payload?.effects;
    const occurrences = new Map();
    if (!Array.isArray(effects)) continue;
    effects.forEach((storedEffect, index) => {
      const target = text(storedEffect?.target) || `efeito-${index + 1}`;
      const occurrence = (occurrences.get(target) || 0) + 1;
      occurrences.set(target, occurrence);
      const signature = `${target}::${occurrence}`;
      const storedInput = inputFromStoredEffect(storedEffect);
      let matrix = groups.get(signature);
      if (!matrix) {
        matrix = {
          ...defaultMatrixEffect(groups.size),
          ...storedInput,
          key: `${stableKey(target)}-${occurrence}`,
          values: Object.fromEntries(state.variants.map(item => [item.id, ''])),
          variantInputs: {}
        };
        groups.set(signature, matrix);
      } else if (matrix.operator !== storedInput.operator) {
        conflicts.push(
          `${optionLabel(target)} usa operadores diferentes entre as raridades. Escolha um único operador antes de salvar.`
        );
      }
      matrix.values[variant.id] = storedEffect.value === null ||
        storedEffect.value === undefined
        ? ''
        : String(Math.abs(Number(storedEffect.value)));
      matrix.variantInputs[variant.id] = storedInput;
    });
  }
  state.conflicts = [...new Set(conflicts)];
  return [...groups.values()];
}

function firstStoredEvidence() {
  const manifests = state.documents
    .map(document => document.current_revision?.evidence_manifest?.[0])
    .filter(Boolean);
  if (!manifests.length) return {};
  const fingerprints = new Set(manifests.map(manifest => JSON.stringify(manifest)));
  if (fingerprints.size > 1) {
    state.conflicts.push(
      'As raridades possuem fontes diferentes. A fonte exibida é a primeira; confira antes de salvar a matriz.'
    );
  }
  return structuredClone(manifests[0]);
}

function setMessage(message, kind = '') {
  const output = mount?.querySelector('[data-central-message]');
  if (!output) return;
  output.className = `effect-central-message${kind ? ` is-${kind}` : ''}`;
  output.textContent = message;
}

function friendlyError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || error || 'Falha desconhecida.');
  if (code === 'PGRST202' || code === '42883' || message.includes('Could not find the function')) {
    return 'A estrutura 2C.1 ainda não foi aplicada neste ambiente. Nenhum dado foi alterado.';
  }
  if (code === '42501') return 'A Central exige uma sessão administrativa válida.';
  return message;
}

function renderUnavailable(error) {
  if (!mount) return;
  mount.className = 'effect-central-unavailable';
  mount.replaceChildren();
  const title = document.createElement('strong');
  title.textContent = 'Central indisponível neste ambiente';
  const copy = document.createElement('span');
  copy.textContent = friendlyError(error);
  mount.append(title, copy);
}

function renderWaitingForEquipment() {
  if (!mount) return;
  mount.className = 'effect-central-empty';
  mount.innerHTML = '<strong>Salve o equipamento antes de registrar bônus</strong>' +
    '<span>A matriz precisa das variantes confirmadas pelo banco.</span>';
}

function renderBase() {
  mount.className = 'effect-central-layout';
  mount.innerHTML = `
    <div class="effect-central-summary" aria-label="Resumo da matriz">
      <div class="effect-central-summary-item"><small>Bônus</small><strong data-summary="effects">0</strong></div>
      <div class="effect-central-summary-item"><small>Raridades</small><strong data-summary="variants">${state.variants.length}</strong></div>
      <div class="effect-central-summary-item"><small>Valores</small><strong data-summary="values">0 preenchidos</strong></div>
      <div class="effect-central-summary-item"><small>Rascunhos</small><strong data-summary="drafts">0 salvos</strong></div>
    </div>

    <section class="effect-central-section effect-central-step effect-central-source-picker">
      <div class="effect-central-section-head">
        <div>
          <span class="effect-central-step-number">1</span>
          <h3>Escolha a referência</h3>
          <p>Use uma regra conferida da wiki ou monte os bônus manualmente.</p>
        </div>
      </div>
      <div class="effect-central-source-controls">
        <div class="effect-central-field">
          <label for="effect-source-rule">Equipamento na fonte</label>
          <select id="effect-source-rule" data-source-rule></select>
        </div>
        <button type="button" class="admin-button" data-apply-source>Usar regra conferida</button>
        <a class="admin-button effect-central-source-link" data-source-link target="_blank" rel="noopener noreferrer" hidden>Abrir fonte</a>
      </div>
      <p class="effect-central-source-status" data-source-status></p>
      <div class="effect-central-catalog-exclusion" role="note">
        <strong>Os números do cadastro atual estão fora desta Central.</strong>
        <span>Somente identidade e raridades são carregadas. Nenhum valor antigo é copiado, comparado ou usado como base.</span>
      </div>
    </section>

    <section class="effect-central-section effect-central-step effect-central-primary-section">
      <div class="effect-central-section-head">
        <div>
          <span class="effect-central-step-number">2</span>
          <h3>Monte os bônus</h3>
          <p>Escolha o sinal uma vez em cada bônus; depois digite apenas os números de cada raridade.</p>
        </div>
        <button type="button" class="admin-button" data-add-effect>+ Adicionar bônus</button>
      </div>
      <div class="effect-central-conflicts" data-conflicts hidden></div>
      <div class="effect-central-effects" data-effects></div>
      <div class="effect-central-empty-list" data-effects-empty>
        <strong>Nenhum bônus montado</strong>
        <span>Adicione um bônus ou use uma regra conferida acima.</span>
      </div>
    </section>

    <details class="effect-central-section effect-central-disclosure effect-central-evidence" data-central-editor>
      <summary>
        <span>
          <span class="effect-central-step-number">3</span>
          <strong>Registre a fonte</strong>
          <small data-evidence-summary>Informe de onde vieram as regras e os valores.</small>
        </span>
      </summary>
      <div class="effect-central-disclosure-body">
        <div class="effect-central-grid">
          <div class="effect-central-field">
            <label for="effect-evidence-kind">Tipo da fonte</label>
            <select id="effect-evidence-kind" data-evidence-field="sourceKind"></select>
          </div>
          <div class="effect-central-field">
            <label for="effect-evidence-reference">Referência estável</label>
            <input id="effect-evidence-reference" data-evidence-field="sourceReference" autocomplete="off">
          </div>
          <div class="effect-central-field full">
            <label for="effect-evidence-file">Arquivo usado na conferência (opcional)</label>
            <input id="effect-evidence-file" data-evidence-file type="file">
            <span class="effect-central-file-state" data-evidence-file-state>Nenhum arquivo selecionado.</span>
          </div>
          <div class="effect-central-field full">
            <label for="effect-evidence-excerpt">Trecho conferido</label>
            <textarea id="effect-evidence-excerpt" data-evidence-field="excerpt"></textarea>
          </div>
        </div>
        <details class="effect-central-nested-details effect-central-technical">
          <summary>Detalhes técnicos da fonte</summary>
          <div class="effect-central-grid three">
            <div class="effect-central-field"><label>Endereço permanente</label><input data-evidence-field="sourceUri" type="url"></div>
            <div class="effect-central-field"><label>SHA-256</label><input data-evidence-field="fileSha256" maxlength="64"></div>
            <div class="effect-central-field"><label>Data da consulta</label><input data-evidence-field="observedAt" type="date"></div>
            <div class="effect-central-field"><label>Versão do jogo</label><input data-evidence-field="gameRevision"></div>
          </div>
        </details>
      </div>
    </details>

    <section class="effect-central-savebar" data-central-editor>
      <div>
        <strong>Uma ação salva todas as raridades</strong>
        <span>Cada coluna continua versionada separadamente e nada é publicado.</span>
      </div>
      <button type="button" class="admin-button primary" data-save-draft>Salvar todos os rascunhos</button>
    </section>

    <details class="effect-central-section effect-central-disclosure effect-central-workflow" data-review-section hidden>
      <summary>
        <span><strong>Revisão administrativa</strong><small data-review-summary></small></span>
        <span class="effect-central-status-badge" data-workflow-badge>Sem rascunho</span>
      </summary>
      <div class="effect-central-disclosure-body">
        <div class="effect-central-field effect-central-review-variant">
          <label for="effect-review-variant">Raridade a revisar</label>
          <select id="effect-review-variant" data-review-variant></select>
        </div>
        <div class="effect-central-grid three">
          <div class="effect-central-field"><label>Motivo</label><input data-review-field="reason"></div>
          <div class="effect-central-field"><label>Impacto</label><input data-review-field="impact"></div>
          <div class="effect-central-field"><label>Ação necessária</label><input data-review-field="requiredAction"></div>
          <div class="effect-central-field full"><label>Parecer</label><textarea data-review-field="reviewNote"></textarea></div>
        </div>
        <div class="effect-central-actions">
          <button type="button" class="admin-button" data-request-review disabled>Enviar para revisão</button>
          <button type="button" class="admin-button" data-approve-review disabled>Aprovar revisão</button>
          <button type="button" class="admin-button danger" data-request-changes disabled>Solicitar ajustes</button>
        </div>
        <p class="effect-central-hint" data-dirty-hint></p>
      </div>
    </details>

    <details class="effect-central-section effect-central-disclosure effect-central-diagnostics" data-diagnostics-section hidden>
      <summary><span><strong>O que precisa de atenção</strong><small data-diagnostics-summary></small></span></summary>
      <div class="effect-central-disclosure-body"><ul class="effect-central-issues" data-central-issues></ul></div>
    </details>

    <div class="effect-central-message" data-central-message role="status" aria-live="polite">
      Escolha uma referência ou adicione o primeiro bônus.
    </div>
  `;

  const sourceSelect = mount.querySelector('[data-source-rule]');
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = 'Montar manualmente';
  sourceSelect.append(empty);
  for (const rule of EQUIPMENT_EFFECT_SOURCE_RULES_V1) {
    const option = document.createElement('option');
    option.value = rule.id;
    option.textContent = rule.name;
    sourceSelect.append(option);
  }
  appendOptions(mount.querySelector('[data-evidence-field="sourceKind"]'), EFFECT_SOURCE_KIND_OPTIONS);
  bindBaseEvents();
}

function targetHelp(target) {
  return {
    aimed_range: 'É o alcance/tamanho da mira: o comprimento do cone ao mirar. Não é alcance de visão nem largura da mira.',
    unaimed_fire_spread: 'É a largura/dispersão da mira sem mirar. Não é o comprimento do cone.',
    vision_range: 'É a distância em que o herói enxerga. Não é o tamanho da mira.',
    weapon_recoil: 'É o recuo da arma principal; permanece pendente até esse alvo entrar no registro.'
  }[target] || (target && !builtinTargets.has(target)
    ? 'Este atributo ainda não existe no registro instalado e será preservado como pendência.'
    : 'Escolha exatamente a grandeza descrita na fonte.');
}

function bindTargetPicker(row, current) {
  const picker = row.querySelector('[data-effect-picker="target"]');
  const custom = field(row, 'target');
  appendOptions(picker, targetOptions, 'Escolha o atributo');
  const customOption = document.createElement('option');
  customOption.value = '__custom__';
  customOption.textContent = 'Outro atributo registrado…';
  picker.append(customOption);
  picker.value = targetOptions.includes(current) ? current : current ? '__custom__' : '';
  custom.hidden = picker.value !== '__custom__';
  custom.value = current || '';
  picker.addEventListener('change', () => {
    const isCustom = picker.value === '__custom__';
    custom.hidden = !isCustom;
    custom.value = isCustom ? '' : picker.value;
    custom.dispatchEvent(new Event('input', { bubbles: true }));
    if (isCustom) custom.focus();
  });
}

function createEffectRow(input, index, { open = false } = {}) {
  const row = document.createElement('details');
  row.className = 'effect-central-effect';
  row.dataset.effectKey = input.key;
  row.dataset.sourceDirection = input.sourceDirection || '';
  row.open = open;
  const operatorName = `effect-operator-${stableKey(input.key)}-${index}`;
  const rarityMarkup = state.variants.map(variant => `
    <label class="effect-central-rarity-value">
      <span>${escapeHtml(variantLabel(variant))}</span>
      <span class="effect-central-rarity-control">
        <b data-operator-prefix aria-hidden="true"></b>
        <input
          data-rarity-value="${escapeHtml(variant.id)}"
          value="${escapeHtml(input.values?.[variant.id] ?? '')}"
          inputmode="decimal"
          min="0"
          placeholder="—"
          aria-label="Valor de ${escapeHtml(variantLabel(variant))}"
          autocomplete="off"
        >
        <b data-operator-suffix aria-hidden="true"></b>
      </span>
    </label>
  `).join('');
  const operatorMarkup = EFFECT_OPERATOR_OPTIONS.map(option => `
    <label class="effect-central-operator-option">
      <input type="radio" name="${escapeHtml(operatorName)}" value="${option.id}" data-effect-operator>
      <span><b>${option.symbol}</b><small>${option.label}</small></span>
    </label>
  `).join('');

  row.innerHTML = `
    <summary class="effect-central-effect-summary">
      <span class="effect-central-effect-copy">
        <strong>Bônus ${index + 1}</strong>
        <small data-effect-summary>Escolha o atributo e o sinal.</small>
      </span>
      <span class="effect-central-effect-completion" data-effect-completion>Em preenchimento</span>
    </summary>
    <div class="effect-central-effect-body">
      <div class="effect-central-grid effect-central-primary-fields">
        <div class="effect-central-field full">
          <label>O que este bônus altera?</label>
          <select data-effect-picker="target" aria-label="Atributo afetado"></select>
          <input data-effect-field="target" placeholder="Identificador do atributo" autocomplete="off" hidden>
          <small class="effect-central-target-help" data-target-help></small>
        </div>
      </div>

      <fieldset class="effect-central-operator">
        <legend>Como o bônus será calculado?</legend>
        <p data-operator-guidance>Esta escolha vale para todas as raridades deste bônus.</p>
        <div class="effect-central-operator-options">${operatorMarkup}</div>
        <output data-operator-formula></output>
      </fieldset>

      <section class="effect-central-rarity-matrix">
        <h4>Valores por raridade</h4>
        <p>Digite somente a magnitude. O sinal e o percentual são aplicados automaticamente.</p>
        <div class="effect-central-rarity-grid">${rarityMarkup}</div>
      </section>

      <div class="effect-central-field full">
        <label>Texto exatamente como aparece na fonte</label>
        <textarea data-effect-field="originalText"></textarea>
      </div>

      <details class="effect-central-nested-details">
        <summary>Quando e para quem se aplica</summary>
        <div class="effect-central-grid three">
          <div class="effect-central-field"><label>Quando acontece?</label><select data-effect-field="conditionKind"></select></div>
          <div class="effect-central-field"><label>Referência da condição</label><input data-effect-field="conditionReference"></div>
          <div class="effect-central-field"><label>Texto da condição</label><input data-effect-field="conditionText"></div>
          <div class="effect-central-field"><label>Duração</label><select data-effect-field="durationKind"></select></div>
          <div class="effect-central-field"><label>Valor da duração</label><input data-effect-field="durationValue" inputmode="decimal"></div>
          <div class="effect-central-field"><label>Unidade da duração</label><input data-effect-field="durationUnit"></div>
          <div class="effect-central-field full"><label>Texto da duração</label><input data-effect-field="durationText"></div>
          <div class="effect-central-field"><label>Heróis</label><input data-effect-field="heroIds" placeholder="IDs separados por vírgula"></div>
          <div class="effect-central-field"><label>Classes</label><input data-effect-field="classIds" placeholder="IDs separados por vírgula"></div>
          <div class="effect-central-field"><label>Habilidades</label><input data-effect-field="abilityIds" placeholder="IDs separados por vírgula"></div>
          <div class="effect-central-field"><label>Modos</label><input data-effect-field="modeIds" placeholder="IDs separados por vírgula"></div>
          <div class="effect-central-field"><label>Grupo de acúmulo</label><input data-effect-field="stackingGroup"></div>
          <div class="effect-central-field"><label>Como acumula?</label><select data-effect-field="stackingRule"></select></div>
          <div class="effect-central-field"><label>Progressão por raridade</label><select data-effect-field="tierSemantics"></select></div>
          <div class="effect-central-field"><label>Máximo de acúmulos</label><input data-effect-field="maxStacks" type="number" min="1"></div>
        </div>
      </details>

      <details class="effect-central-nested-details">
        <summary>Fonte e conferência deste bônus</summary>
        <div class="effect-central-grid three">
          <div class="effect-central-field"><label>Conferência</label><select data-effect-field="verificationStatus"></select></div>
          <div class="effect-central-field"><label>Conferido em</label><input data-effect-field="verifiedAt" type="datetime-local"></div>
          <div class="effect-central-field"><label>Tipo da fonte</label><select data-effect-field="sourceKind"></select></div>
          <div class="effect-central-field full"><label>Referência da fonte</label><input data-effect-field="sourceReference"></div>
          <div class="effect-central-field"><label>Data da consulta</label><input data-effect-field="observedAt" type="date"></div>
          <div class="effect-central-field"><label>Versão do jogo</label><input data-effect-field="gameRevision"></div>
        </div>
      </details>

      <details class="effect-central-nested-details effect-central-technical">
        <summary>Detalhes técnicos deste bônus</summary>
        <div class="effect-central-grid three">
          <div class="effect-central-field"><label>Chave do bônus</label><input data-effect-field="key" readonly></div>
          <div class="effect-central-field"><label>Suporte da mecânica</label><select data-effect-field="supportStatus"></select></div>
          <div class="effect-central-field"><label>Código da pendência</label><input data-effect-field="supportReason"></div>
          <div class="effect-central-field full"><label>Detalhes do suporte</label><input data-effect-field="supportDetails"></div>
        </div>
      </details>

      <button type="button" class="admin-button danger effect-central-remove" data-remove-effect>Excluir este bônus</button>
    </div>
  `;

  bindTargetPicker(row, input.target);
  appendOptions(field(row, 'supportStatus'), EFFECT_SUPPORT_OPTIONS);
  appendOptions(field(row, 'verificationStatus'), EFFECT_VERIFICATION_OPTIONS);
  appendOptions(field(row, 'sourceKind'), EFFECT_SOURCE_KIND_OPTIONS);
  appendOptions(field(row, 'conditionKind'), EFFECT_CONDITION_OPTIONS);
  appendOptions(field(row, 'durationKind'), EFFECT_DURATION_OPTIONS);
  appendOptions(field(row, 'stackingRule'), EFFECT_STACKING_OPTIONS);
  appendOptions(field(row, 'tierSemantics'), EFFECT_TIER_OPTIONS);
  for (const [key, value] of Object.entries(input)) {
    if (!['values', 'variantInputs', 'target', 'operator'].includes(key)) setValue(row, key, value);
  }
  const operator = row.querySelector(`[data-effect-operator][value="${input.operator}"]`);
  if (operator) operator.checked = true;
  updateEffectRow(row);
  row.addEventListener('input', () => updateEffectRow(row));
  row.addEventListener('change', () => updateEffectRow(row));
  row.querySelector('[data-remove-effect]').addEventListener('click', event => {
    event.preventDefault();
    row.remove();
    renumberEffectRows();
    markDirty();
  });
  return row;
}

function updateEffectRow(row) {
  const target = valueOf(row, 'target');
  const operator = row.querySelector('[data-effect-operator]:checked')?.value || '';
  const option = EFFECT_OPERATOR_OPTIONS.find(item => item.id === operator);
  const sourceDirection = row.dataset.sourceDirection;
  const filledValues = [...row.querySelectorAll('[data-rarity-value]')]
    .filter(input => text(input.value) !== '').length;
  row.querySelector('[data-target-help]').textContent = targetHelp(target);
  row.querySelector('[data-operator-formula]').textContent = operatorFormula(operator);
  row.querySelector('[data-operator-guidance]').textContent = sourceDirection === 'increase'
    ? 'A fonte indica aumento. Confirme + ou +% com a tabela específica; esta escolha valerá para todas as raridades.'
    : sourceDirection === 'decrease'
      ? 'A fonte indica redução. Confirme − ou −% com a tabela específica; esta escolha valerá para todas as raridades.'
      : 'Esta escolha vale para todas as raridades deste bônus.';
  const isPercent = option?.operation === 'relative_percent';
  for (const prefix of row.querySelectorAll('[data-operator-prefix]')) {
    prefix.textContent = option ? (option.direction < 0 ? '−' : '+') : '·';
  }
  for (const suffix of row.querySelectorAll('[data-operator-suffix]')) {
    suffix.textContent = isPercent ? '%' : '';
    suffix.hidden = !isPercent;
  }
  const summary = [target ? optionLabel(target) : '', option?.symbol || '']
    .filter(Boolean).join(' · ');
  row.querySelector('[data-effect-summary]').textContent =
    summary || 'Escolha o atributo e o sinal.';
  const completion = row.querySelector('[data-effect-completion]');
  completion.textContent = target && operator
    ? filledValues
      ? `${filledValues} valor${filledValues === 1 ? '' : 'es'}`
      : 'Valores pendentes'
    : 'Em preenchimento';
  completion.classList.toggle('is-filled', Boolean(target && operator && filledValues));
  updateSummary();
}

function renumberEffectRows() {
  const rows = [...mount.querySelectorAll('.effect-central-effect')];
  rows.forEach((row, index) => {
    row.querySelector('.effect-central-effect-copy strong').textContent = `Bônus ${index + 1}`;
  });
  mount.querySelector('[data-effects-empty]').hidden = rows.length > 0;
  updateSummary();
}

function renderEffects({ openFirst = false } = {}) {
  const container = mount.querySelector('[data-effects]');
  container.replaceChildren();
  state.effects.forEach((effect, index) => {
    container.append(createEffectRow(effect, index, { open: openFirst && index === 0 }));
  });
  renumberEffectRows();
  renderConflicts();
}

function renderConflicts() {
  const container = mount.querySelector('[data-conflicts]');
  container.replaceChildren();
  container.hidden = state.conflicts.length === 0;
  for (const conflict of state.conflicts) {
    const paragraph = document.createElement('p');
    paragraph.textContent = conflict;
    container.append(paragraph);
  }
}

function updateSummary() {
  if (!mount?.querySelector('[data-summary="effects"]')) return;
  const rows = [...mount.querySelectorAll('.effect-central-effect')];
  const valueCount = rows.reduce((sum, row) => sum +
    [...row.querySelectorAll('[data-rarity-value]')].filter(input => text(input.value) !== '').length, 0);
  mount.querySelector('[data-summary="effects"]').textContent = String(rows.length);
  mount.querySelector('[data-summary="variants"]').textContent = String(state.variants.length);
  mount.querySelector('[data-summary="values"]').textContent = `${valueCount} preenchido${valueCount === 1 ? '' : 's'}`;
  const saved = state.documents.filter(document => document.current_revision).length;
  mount.querySelector('[data-summary="drafts"]').textContent = `${saved} de ${state.variants.length}`;
}

function collectEffectsFromDom() {
  const previousByKey = new Map(state.effects.map(effect => [effect.key, effect]));
  state.effects = [...mount.querySelectorAll('.effect-central-effect')].map((row, index) => {
    const key = row.dataset.effectKey || `bonus-${index + 1}`;
    const previous = previousByKey.get(key) || defaultMatrixEffect(index);
    const input = {
      ...previous,
      key,
      target: valueOf(row, 'target'),
      operator: row.querySelector('[data-effect-operator]:checked')?.value || '',
      values: Object.fromEntries(state.variants.map(variant => [
        variant.id,
        row.querySelector(`[data-rarity-value="${variant.id}"]`)?.value ?? ''
      ]))
    };
    for (const name of [
      'originalText', 'supportStatus', 'supportReason', 'supportDetails',
      'verificationStatus', 'verifiedAt', 'sourceKind', 'sourceReference',
      'observedAt', 'gameRevision', 'conditionKind', 'conditionReference',
      'conditionText', 'durationKind', 'durationValue', 'durationUnit',
      'durationText', 'heroIds', 'classIds', 'abilityIds', 'modeIds',
      'stackingGroup', 'stackingRule', 'tierSemantics', 'maxStacks'
    ]) input[name] = valueOf(row, name);
    return input;
  });
}

function mergeSourceRule(rule) {
  for (const sourceEffect of rule.effects) {
    let effect = state.effects.find(item => item.target === sourceEffect.target);
    if (!effect) {
      effect = {
        ...defaultMatrixEffect(state.effects.length),
        key: sourceEffect.key,
        target: sourceEffect.target
      };
      state.effects.push(effect);
    }
    effect.sourceDirection = sourceEffect.direction || effect.sourceDirection;
    if (sourceEffect.operator) {
      if (!effect.operator) effect.operator = sourceEffect.operator;
      if (effect.operator !== sourceEffect.operator) {
        state.conflicts.push(
          `${optionLabel(sourceEffect.target)} já usa outro operador; a escolha atual foi preservada.`
        );
      }
    }
    if (!effect.originalText) effect.originalText = sourceEffect.originalText;
    effect.sourceKind = rule.evidence.sourceKind;
    effect.sourceReference = rule.evidence.sourceReference;
    effect.observedAt = rule.evidence.observedAt;
    effect.verificationStatus = rule.coverage === 'verified_values'
      ? 'confirmed'
      : 'partially_confirmed';
    effect.supportStatus = 'pending';
    effect.supportReason = builtinTargets.has(sourceEffect.target)
      ? 'awaiting_review'
      : 'registry_extension_requires_review';
    for (const variant of state.variants) {
      const sourceValue = sourceEffect.values[variantSlug(variant)];
      if (sourceValue !== null && sourceValue !== undefined && text(effect.values[variant.id]) === '') {
        effect.values[variant.id] = String(Math.abs(Number(sourceValue)));
      }
    }
  }
  state.sourceRuleId = rule.id;
  state.evidence = {
    ...structuredClone(rule.evidence),
    metadata: {
      ...(rule.evidence.metadata || {}),
      source_ruleset_revision: EQUIPMENT_EFFECT_SOURCE_RULESET_REVISION
    }
  };
  state.evidenceMetadata = structuredClone(state.evidence.metadata);
}

function renderSourceState() {
  const select = mount.querySelector('[data-source-rule]');
  select.value = state.sourceRuleId;
  const rule = selectedSourceRule();
  const status = mount.querySelector('[data-source-status]');
  const link = mount.querySelector('[data-source-link]');
  mount.querySelector('[data-apply-source]').disabled = !rule || state.busy;
  if (!rule) {
    status.textContent = 'Nenhuma regra automática selecionada. Os campos continuam disponíveis para transcrição manual.';
    link.hidden = true;
    return;
  }
  const coverage = sourceRuleCoverage(rule);
  status.textContent = rule.coverage === 'verified_values'
    ? `${coverage.valueCount} valores confirmados na captura; classificações não visíveis continuam vazias.`
    : rule.coverage === 'target_requires_registry'
      ? 'A direção do efeito está documentada, mas a grandeza ainda exige extensão do registro.'
      : 'A grandeza e a direção estão documentadas; os valores por raridade ainda precisam de fonte específica.';
  link.href = rule.sourceUrl;
  link.hidden = false;
}

function writeEvidence(evidence = {}) {
  state.evidence = structuredClone(evidence || {});
  state.evidenceMetadata = state.evidence.metadata && typeof state.evidence.metadata === 'object'
    ? structuredClone(state.evidence.metadata)
    : {};
  for (const key of [
    'sourceKind', 'sourceReference', 'sourceUri', 'fileSha256',
    'observedAt', 'gameRevision', 'excerpt'
  ]) {
    const snake = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    const control = mount.querySelector(`[data-evidence-field="${key}"]`);
    if (control) control.value = state.evidence[key] ?? state.evidence[snake] ?? '';
  }
  const hasHash = Boolean(state.evidence.fileSha256 || state.evidence.file_sha256);
  mount.querySelector('[data-evidence-file-state]').textContent = hasHash
    ? 'Hash restaurado; o arquivo não é enviado por este formulário.'
    : 'Nenhum arquivo selecionado.';
  updateEvidenceSummary();
}

function readEvidenceFromDom() {
  const evidence = {};
  for (const key of [
    'sourceKind', 'sourceReference', 'sourceUri', 'fileSha256',
    'observedAt', 'gameRevision', 'excerpt'
  ]) evidence[key] = mount.querySelector(`[data-evidence-field="${key}"]`)?.value || '';
  evidence.metadata = structuredClone(state.evidenceMetadata || {});
  state.evidence = evidence;
  return evidence;
}

function updateEvidenceSummary() {
  const summary = mount?.querySelector('[data-evidence-summary]');
  if (!summary) return;
  const reference = text(mount.querySelector('[data-evidence-field="sourceReference"]')?.value);
  const hash = text(mount.querySelector('[data-evidence-field="fileSha256"]')?.value);
  summary.textContent = hash
    ? 'Fonte e hash registrados.'
    : reference
      ? 'Fonte informada; arquivo ainda não conferido.'
      : 'Informe de onde vieram as regras e os valores.';
}

function collectEvidence() {
  const input = readEvidenceFromDom();
  const hasAny = Object.entries(input).some(([key, value]) =>
    key !== 'metadata' && text(value) !== ''
  ) || Object.keys(input.metadata).length > 0;
  return hasAny ? [buildPersistentEvidence(input)] : [];
}

function effectInputForVariant(effect, variant) {
  if (!text(effect.target)) throw new TypeError('Escolha o atributo de todos os bônus.');
  if (!text(effect.operator)) throw new TypeError(
    `Escolha +, −, +% ou −% para ${optionLabel(effect.target)}.`
  );
  const rawMagnitude = text(effect.values[variant.id]);
  const semantics = effectSemanticsFromOperator({
    target: effect.target,
    operator: effect.operator,
    magnitude: rawMagnitude === '' ? 0 : rawMagnitude
  });
  const previous = effect.variantInputs?.[variant.id] || {};
  const registered = builtinTargets.has(effect.target);
  const supportStatus = rawMagnitude === '' || !registered
    ? 'pending'
    : effect.supportStatus || 'pending';
  const supportReason = supportStatus === 'pending'
    ? rawMagnitude === ''
      ? 'numeric_value_requires_review'
      : !registered
        ? 'registry_extension_requires_review'
        : effect.supportReason || 'awaiting_review'
    : '';
  const slug = variantSlug(variant) || stableKey(variant.id);
  return {
    ...previous,
    effectId: previous.effectId ||
      `effect:${state.equipmentId}:${stableKey(effect.key)}:${slug}`,
    effectRevision: previous.effectRevision || 1,
    target: effect.target,
    operation: semantics.operation,
    value: rawMagnitude === '' ? '' : semantics.value,
    unit: semantics.unit,
    originalText: effect.originalText,
    supportStatus,
    supportReason,
    supportDetails: effect.supportDetails,
    verificationStatus: effect.verificationStatus,
    verifiedAt: effect.verifiedAt,
    sourceKind: effect.sourceKind && effect.sourceKind !== 'unknown'
      ? effect.sourceKind
      : state.evidence.sourceKind || state.evidence.source_kind || effect.sourceKind || 'unknown',
    sourceReference: effect.sourceReference ||
      state.evidence.sourceReference ||
      state.evidence.source_reference ||
      '',
    observedAt: effect.observedAt || state.evidence.observedAt || state.evidence.observed_at || '',
    gameRevision: effect.gameRevision || state.evidence.gameRevision || state.evidence.game_revision || '',
    conditionKind: effect.conditionKind,
    conditionReference: effect.conditionReference,
    conditionText: effect.conditionText,
    durationKind: effect.durationKind,
    durationValue: effect.durationValue,
    durationUnit: effect.durationUnit,
    durationText: effect.durationText,
    heroIds: effect.heroIds,
    classIds: effect.classIds,
    abilityIds: effect.abilityIds,
    modeIds: effect.modeIds,
    stackingGroup: effect.stackingGroup,
    stackingRule: effect.stackingRule,
    tierSemantics: effect.tierSemantics,
    maxStacks: effect.maxStacks
  };
}

function buildVariantDraft(variant) {
  const stored = documentForVariant(variant.id);
  const payload = stored?.current_revision?.payload || {};
  return buildEquipmentVariantEffectDocument({
    equipmentId: state.equipmentId,
    variantId: variant.id,
    documentId: payload.document_id,
    registryRevision: payload.registry_revision,
    dataRevision: payload.data_revision || `matrix:${variant.id}`,
    rulesetRevision: selectedSourceRule()
      ? EQUIPMENT_EFFECT_SOURCE_RULESET_REVISION
      : payload.ruleset_revision,
    expectedEffectCount: state.effects.length,
    effects: state.effects.map(effect => effectInputForVariant(effect, variant))
  });
}

function renderIssues(issues = []) {
  const section = mount.querySelector('[data-diagnostics-section]');
  const summary = mount.querySelector('[data-diagnostics-summary]');
  const list = mount.querySelector('[data-central-issues]');
  const grouped = new Map();
  for (const issue of issues) {
    const key = [issue.path, issue.code, issue.message].filter(Boolean).join('::');
    const current = grouped.get(key) || { ...issue, rarities: new Set() };
    if (issue.rarity) current.rarities.add(issue.rarity);
    grouped.set(key, current);
  }
  const compactIssues = [...grouped.values()];
  list.replaceChildren();
  section.hidden = compactIssues.length === 0;
  section.open = compactIssues.length > 0;
  if (!compactIssues.length) return;
  summary.textContent = `${compactIssues.length} ${compactIssues.length === 1 ? 'item precisa' : 'itens precisam'} de atenção.`;
  for (const issue of compactIssues) {
    const item = document.createElement('li');
    const rarities = [...issue.rarities];
    const rarityLabel = rarities.length === state.variants.length
      ? 'Todas as raridades'
      : rarities.join(', ');
    item.textContent = [rarityLabel, issue.message || issue.code].filter(Boolean).join(' · ');
    list.append(item);
  }
}

function validateMatrix() {
  collectEffectsFromDom();
  const evidenceInput = collectEvidence();
  const issues = [];
  const drafts = state.variants.map(variant => {
    const document = buildVariantDraft(variant);
    const validation = validateCentralEffectDraft(document);
    for (const issue of [...(validation.errors || []), ...(validation.warnings || [])]) {
      issues.push({ ...issue, rarity: variantLabel(variant) });
    }
    return { variant, document, validation };
  });
  const evidence = evidenceInput.length
    ? inspectPersistentEvidence(evidenceInput[0])
    : { valid: false, issues: ['persistent_evidence_required'] };
  for (const code of evidence.issues || []) {
    issues.push({
      code,
      message: {
        persistent_evidence_required: 'Adicione uma fonte persistente.',
        source_reference_required: 'Informe a referência estável da fonte.',
        evidence_sha256_required: 'Informe ou gere o SHA-256 da evidência.'
      }[code] || 'A evidência ainda não atende ao gate de revisão.'
    });
  }
  renderIssues(issues);
  return { drafts, evidenceInput, issues };
}

function selectedReviewDocument() {
  return documentForVariant(state.selectedReviewVariantId);
}

function renderReviewPanel() {
  const saved = state.variants.filter(variant => documentForVariant(variant.id)?.current_revision);
  const section = mount.querySelector('[data-review-section]');
  section.hidden = saved.length === 0;
  if (!saved.length) return;
  if (!saved.some(variant => variant.id === state.selectedReviewVariantId)) {
    state.selectedReviewVariantId = saved[0].id;
  }
  const select = mount.querySelector('[data-review-variant]');
  select.replaceChildren();
  for (const variant of saved) {
    const option = document.createElement('option');
    option.value = variant.id;
    option.textContent = variantLabel(variant);
    select.append(option);
  }
  select.value = state.selectedReviewVariantId;
  const document = selectedReviewDocument();
  const review = document?.review || {};
  const workflow = document?.workflow_status;
  mount.querySelector('[data-workflow-badge]').textContent = centralWorkflowLabel(workflow);
  mount.querySelector('[data-review-summary]').textContent =
    `${variantLabel(saved.find(variant => variant.id === state.selectedReviewVariantId))} · ` +
    (workflowLabels[workflow] || 'Rascunho');
  mount.querySelector('[data-review-field="reason"]').value = review.reason || '';
  mount.querySelector('[data-review-field="impact"]').value = review.impact || '';
  mount.querySelector('[data-review-field="requiredAction"]').value = review.required_action || '';
  mount.querySelector('[data-review-field="reviewNote"]').value = review.review_note || '';
  updateActionState();
}

function markDirty() {
  state.dirty = true;
  updateSummary();
  updateActionState();
}

function updateActionState() {
  if (!mount?.querySelector('[data-save-draft]')) return;
  mount.querySelector('[data-save-draft]').disabled = state.busy || !state.variants.length;
  const sourceButton = mount.querySelector('[data-apply-source]');
  if (sourceButton) sourceButton.disabled = state.busy || !selectedSourceRule();
  const document = selectedReviewDocument();
  const revision = document?.current_revision;
  const workflow = document?.workflow_status;
  const reviewStatus = document?.review?.status;
  const reviewable = revision?.validation_state === 'valid' &&
    revision?.evidence_state === 'complete' && !state.dirty && !state.busy;
  mount.querySelector('[data-request-review]').disabled =
    !reviewable || !['draft', 'changes_requested'].includes(workflow);
  const canDecide = revision?.id && workflow === 'in_review' &&
    ['pending', 'in_review'].includes(reviewStatus) && !state.dirty && !state.busy;
  mount.querySelector('[data-approve-review]').disabled = !canDecide;
  mount.querySelector('[data-request-changes]').disabled = !canDecide;
  mount.querySelector('[data-dirty-hint]').textContent = state.dirty
    ? 'Há alterações na matriz. Salve todos os rascunhos antes de revisar uma raridade.'
    : 'A aprovação registra o parecer. O documento continua não publicado.';
}

async function withBusy(action) {
  if (state.busy) return;
  state.busy = true;
  updateActionState();
  try {
    await action();
  } catch (error) {
    setMessage(friendlyError(error), 'error');
  } finally {
    state.busy = false;
    updateActionState();
  }
}

async function saveAllDrafts() {
  await withBusy(async () => {
    let collected;
    try {
      collected = validateMatrix();
    } catch (error) {
      setMessage(error.message, 'error');
      return;
    }
    let savedCount = 0;
    let createdCount = 0;
    for (const { variant, document } of collected.drafts) {
      setMessage(`Salvando ${savedCount + 1} de ${collected.drafts.length}: ${variantLabel(variant)}…`);
      const stored = documentForVariant(variant.id);
      const { data, error } = await supabase.rpc('admin_save_equipment_effect_draft_v1', {
        p_subject_kind: 'equipment_variant',
        p_subject_id: variant.id,
        p_payload: document,
        p_evidence: collected.evidenceInput,
        p_document_id: stored?.document_id || null,
        p_source: 'admin-effect-central-matrix-v1'
      });
      if (error) {
        throw new Error(
          `A gravação parou em ${variantLabel(variant)} após ${savedCount} de ${collected.drafts.length}. ` +
          `${friendlyError(error)} Os campos locais foram preservados; tente novamente.`
        );
      }
      savedCount += 1;
      if (data?.created_revision) createdCount += 1;
    }
    state.dirty = false;
    await reloadDocuments();
    setMessage(
      `${savedCount} raridades conferidas; ${createdCount} nova${createdCount === 1 ? '' : 's'} revisão` +
      `${createdCount === 1 ? '' : 'ões'} criada${createdCount === 1 ? '' : 's'}. Nada foi publicado ou aplicado ao jogo.`,
      collected.issues.length ? 'warning' : 'ok'
    );
  });
}

function reviewTrace() {
  return {
    reason: text(mount.querySelector('[data-review-field="reason"]').value),
    impact: text(mount.querySelector('[data-review-field="impact"]').value),
    requiredAction: text(mount.querySelector('[data-review-field="requiredAction"]').value),
    reviewNote: text(mount.querySelector('[data-review-field="reviewNote"]').value)
  };
}

async function requestReview() {
  await withBusy(async () => {
    const revisionId = selectedReviewDocument()?.current_revision?.id;
    const trace = reviewTrace();
    if (!revisionId || !trace.reason || !trace.impact || !trace.requiredAction) {
      setMessage('Preencha motivo, impacto e ação necessária antes de enviar.', 'warning');
      return;
    }
    const { error } = await supabase.rpc('admin_request_equipment_effect_review_v1', {
      p_revision_id: revisionId,
      p_reason: trace.reason,
      p_impact: trace.impact,
      p_required_action: trace.requiredAction
    });
    if (error) throw error;
    await reloadDocuments();
    setMessage('A raridade selecionada foi enviada para revisão.', 'ok');
  });
}

async function decideReview(decision) {
  await withBusy(async () => {
    const revisionId = selectedReviewDocument()?.current_revision?.id;
    const note = reviewTrace().reviewNote;
    if (!revisionId || !note) {
      setMessage('Escreva o parecer antes de registrar a decisão.', 'warning');
      return;
    }
    const { data, error } = await supabase.rpc('admin_review_equipment_effect_revision_v1', {
      p_revision_id: revisionId,
      p_decision: decision,
      p_review_note: note
    });
    if (error) throw error;
    await reloadDocuments();
    setMessage(
      data?.workflow_status === 'reviewed'
        ? 'Revisão aprovada e registrada. O documento continua não publicado.'
        : 'Ajustes solicitados e registrados para esta raridade.',
      data?.workflow_status === 'reviewed' ? 'ok' : 'warning'
    );
  });
}

async function hashEvidenceFile(file) {
  if (!file) return;
  const label = mount.querySelector('[data-evidence-file-state]');
  if (!globalThis.crypto?.subtle) {
    label.textContent = 'Este contexto não oferece SHA-256 no navegador.';
    return;
  }
  label.textContent = 'Calculando SHA-256 localmente…';
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const hash = [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
  mount.querySelector('[data-evidence-field="fileSha256"]').value = hash;
  state.evidenceMetadata = {
    file_name: file.name,
    media_type: file.type || null,
    size_bytes: file.size,
    last_modified: file.lastModified ? new Date(file.lastModified).toISOString() : null,
    storage: 'reference_only_file_not_uploaded'
  };
  label.textContent = `${file.name} · ${file.size} bytes · arquivo não enviado`;
  updateEvidenceSummary();
  markDirty();
}

function bindBaseEvents() {
  mount.querySelector('[data-source-rule]').addEventListener('change', event => {
    state.sourceRuleId = event.target.value;
    renderSourceState();
  });
  mount.querySelector('[data-apply-source]').addEventListener('click', () => {
    collectEffectsFromDom();
    const rule = selectedSourceRule();
    if (!rule) return;
    mergeSourceRule(rule);
    renderEffects({ openFirst: true });
    writeEvidence(state.evidence);
    renderSourceState();
    markDirty();
    setMessage('A regra conferida preencheu somente campos vazios. Revise os bônus antes de salvar.', 'ok');
  });
  mount.querySelector('[data-add-effect]').addEventListener('click', () => {
    collectEffectsFromDom();
    state.effects.push(defaultMatrixEffect(state.effects.length));
    renderEffects();
    const row = mount.querySelector('.effect-central-effect:last-child');
    if (row) {
      row.open = true;
      row.querySelector('[data-effect-picker="target"]')?.focus();
    }
    markDirty();
  });
  mount.querySelector('[data-save-draft]').addEventListener('click', saveAllDrafts);
  mount.querySelector('[data-review-variant]').addEventListener('change', event => {
    state.selectedReviewVariantId = event.target.value;
    renderReviewPanel();
  });
  mount.querySelector('[data-request-review]').addEventListener('click', requestReview);
  mount.querySelector('[data-approve-review]').addEventListener('click', () => decideReview('approved'));
  mount.querySelector('[data-request-changes]').addEventListener('click', () => decideReview('changes_requested'));
  mount.querySelector('[data-evidence-file]').addEventListener('change', event => {
    hashEvidenceFile(event.target.files?.[0]).catch(error => setMessage(friendlyError(error), 'error'));
  });
  mount.addEventListener('input', event => {
    if (event.target.closest('.effect-central-effect')) markDirty();
    if (event.target.closest('.effect-central-evidence')) {
      updateEvidenceSummary();
      markDirty();
    }
  });
  mount.addEventListener('change', event => {
    if (event.target.closest('.effect-central-effect')) markDirty();
    if (event.target.closest('.effect-central-evidence')) {
      updateEvidenceSummary();
      markDirty();
    }
  });
}

async function loadEquipmentAndVariants() {
  const [equipmentResult, variantsResult] = await Promise.all([
    supabase.from('equipments').select('id,name').eq('id', state.equipmentId).single(),
    supabase
      .from('equipment_variants')
      .select('id,rarity_id,equipment_rarities(id,name,slug,rank)')
      .eq('equipment_id', state.equipmentId)
  ]);
  if (equipmentResult.error) throw equipmentResult.error;
  if (variantsResult.error) throw variantsResult.error;
  state.equipmentName = equipmentResult.data?.name || '';
  state.variants = (variantsResult.data || []).sort((left, right) =>
    Number(left.equipment_rarities?.rank || 0) - Number(right.equipment_rarities?.rank || 0)
  );
}

async function reloadDocuments() {
  const { data, error } = await supabase.rpc('admin_list_equipment_effect_drafts_v1', {
    p_equipment_id: state.equipmentId
  });
  if (error) throw error;
  state.documents = Array.isArray(data?.documents) ? data.documents : [];
  state.effects = matrixFromDocuments();
  const storedEvidence = firstStoredEvidence();
  const matchedRule = findEquipmentSourceRule(state.equipmentName);
  if (!state.sourceRuleId && matchedRule) state.sourceRuleId = matchedRule.id;
  if (!state.effects.length && matchedRule) {
    mergeSourceRule(matchedRule);
    state.dirty = true;
  } else {
    state.evidence = storedEvidence;
    state.evidenceMetadata = storedEvidence.metadata || {};
    state.dirty = false;
  }
  renderEffects({ openFirst: state.effects.length === 1 });
  writeEvidence(state.evidence);
  renderSourceState();
  renderReviewPanel();
  updateSummary();
  updateActionState();
}

async function loadCentral() {
  if (!mount) return;
  if (!state.equipmentId) {
    renderWaitingForEquipment();
    return;
  }
  mount.className = 'effect-central-loading';
  mount.textContent = 'Carregando raridades e revisões…';
  try {
    await loadEquipmentAndVariants();
    if (!state.variants.length) {
      mount.className = 'effect-central-empty';
      mount.innerHTML = '<strong>Nenhuma raridade disponível</strong>' +
        '<span>Salve ao menos uma variante antes de registrar bônus.</span>';
      return;
    }
    renderBase();
    await reloadDocuments();
    setMessage(
      state.dirty
        ? 'A referência correspondente foi preparada. Confira os sinais e valores antes de salvar.'
        : 'Matriz carregada. Um sinal controla todas as raridades de cada bônus.'
    );
  } catch (error) {
    renderUnavailable(error);
  }
}

if (root && mount) {
  loadCentral();
  window.addEventListener('equipment:save-success', event => {
    const savedId = event.detail?.savedId;
    if (!savedId) return;
    state.equipmentId = savedId;
    loadCentral();
  });
}
