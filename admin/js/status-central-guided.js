import { loadStatusCentralData, centralRpc, requestBrainProof } from './status-central-api.js?sc=20260906-1&sb=20260823-security-supabase-pin-1';
import { equipmentEffectRows, compatibleTestHeroes, effectTargets, previewEquipmentEffect, applyReviewedEquipmentEffect, verifyEquipmentEffect } from './status-central-workflow.js?ux=20260908-1';
import { STATUS_UNITS, STATUS_OPERATORS, STATUS_CONDITIONS, STATUS_REASONS } from '../../js/status-registry-v1.js?sc=20260906-1&eq=20260907-effects-1';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const number = value => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) : 'Não cadastrado';
const options = rows => rows.map(row => `<option value="${escape(row.id)}">${escape(row.name)}</option>`).join('');
const scopeName = scope => scope === 'weapon' ? 'Arma' : 'Herói';
const explanation = step => ({
  missing_base: 'Este herói não tem o valor-base deste status. Confira o cadastro para conseguir testar.',
  not_applicable: 'Este efeito não atua no cenário escolhido. Ative a condição no teste para conferir a mudança.',
  condition_required: 'Informe a mira, o movimento ou a habilidade exigida por este efeito no teste.',
  source_changed: 'O texto ou valor do equipamento mudou. Revise a configuração e teste novamente.',
  unmapped: 'Este efeito ainda não tem uma regra aplicada no site.'
}[step?.status] || STATUS_REASONS[step?.status] || 'Não foi possível calcular este efeito.');

export function mountStatusCentralGuided({ getData, action, onCentral, openAdvanced, openBase }) {
  const $ = id => document.getElementById(`scg-${id}`);
  const local = { rows: [], rowKey: null, bindingId: '', review: null };
  const selectedRow = () => local.rows.find(row => row.key === local.rowKey);
  function feedback(text, kind = '') {
    $('feedback').textContent = text;
    $('feedback').className = `scg-feedback${kind ? ` is-${kind}` : ''}`;
  }
  function clearTest(text = 'A seleção mudou. Teste este efeito para conferir o resultado atualizado.') {
    local.review = null;
    $('result').replaceChildren();
    $('apply-area').hidden = true;
    $('apply').disabled = true;
    $('test-state').textContent = 'Ainda não testado';
    $('test-state').className = 'sc-badge';
    feedback(text);
  }
  function conditions() {
    const result = {};
    for (const key of ['moving', 'aiming']) if ($(key).value) result[key] = $(key).value === 'true';
    if ($('condition').value === 'ability_active' && $('active').value) result.activeAbilities = $('active').value === 'true' ? [$('ability').value] : [];
    return result;
  }
  function input() {
    return { equipmentId: $('equipment').value, variantId: $('variant').value, heroId: $('hero').value,
      rowKey: local.rowKey, bindingId: local.bindingId, scope: $('scope').value, sourceKey: $('target').value,
      name: $('target-name').value, unit: $('unit').value, operator: $('operator').value,
      condition: $('condition').value, abilityId: $('ability').value, conditions: conditions() };
  }
  function fillEquipments() {
    const current = $('equipment').value;
    const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
    const query = normalize($('search').value.trim());
    const rows = getData().equipments.filter(e => e.enabled && (e.id === current || normalize(e.name).includes(query)));
    $('equipment').innerHTML = '<option value="">Escolha um equipamento</option>' + options(rows);
    $('equipment').value = current;
    if (!rows.length) $('selection-help').textContent = 'Nenhum equipamento corresponde à busca.';
  }
  function fillAbilities() {
    const old = $('ability').value;
    $('ability').innerHTML = '<option value="">Escolha a habilidade</option>' + options(getData().skills.filter(s => s.hero_id === $('hero').value && s.enabled));
    $('ability').value = old;
  }
  function equipmentChanged(preferredVariant = '') {
    clearTest();
    const data = getData(), item = data.equipments.find(e => e.id === $('equipment').value);
    $('item-name').textContent = item?.name || '';
    $('edit-equipment').href = item ? `./equipment-editor.html?id=${encodeURIComponent(item.id)}` : './equipments.html';
    $('edit-equipment').textContent = item ? 'Corrigir texto ou valor ↗' : 'Abrir equipamentos ↗';
    const variants = data.variants.filter(v => v.equipment_id === item?.id).map(v => ({ ...v,
      name: data.rarities.find(r => r.id === v.rarity_id)?.name || 'Raridade indisponível',
      rank: data.rarities.find(r => r.id === v.rarity_id)?.rank || 0 })).sort((a, b) => a.rank - b.rank);
    $('variant').innerHTML = '<option value="">Escolha a raridade</option>' + options(variants);
    if (variants.some(v => v.id === preferredVariant)) $('variant').value = preferredVariant;
    const previousHero = $('hero').value, heroes = compatibleTestHeroes(data, item?.id);
    $('hero').innerHTML = '<option value="">Escolha um herói</option>' + options(heroes);
    if (heroes.some(hero => hero.id === previousHero)) $('hero').value = previousHero;
    else if (heroes.length === 1) $('hero').value = heroes[0].id;
    $('selection-help').textContent = !item ? 'O teste usa os valores cadastrados do herói e desta raridade.'
      : !variants.length ? 'Este equipamento ainda não tem raridades cadastradas. Abra o editor para adicioná-las.'
      : !heroes.length ? 'Não há heróis compatíveis com dados-base para testar este equipamento. Confira o vínculo no editor.'
      : 'A lista mostra apenas heróis compatíveis com este equipamento. Escolha uma raridade para continuar.';
    fillAbilities();
    variantChanged();
  }
  function variantChanged(preferredKey = null) {
    clearTest();
    local.rows = equipmentEffectRows(getData(), $('equipment').value, $('variant').value);
    local.rowKey = local.rows.some(r => r.key === preferredKey) ? preferredKey : local.rows[0]?.key ?? null;
    $('workspace').hidden = !$('variant').value;
    renderEffects();
    chooseEffect(local.rowKey);
  }
  function renderEffects() {
    $('effects').innerHTML = local.rows.map(row => {
      const label = row.raw?.textReview ? 'Texto incompleto' : row.status === 'bound' ? 'Regra no site' : row.status === 'changed' ? 'Texto ou valor mudou' : 'Falta configurar';
      return `<button type="button" class="scg-effect" data-effect-key="${escape(row.key)}" aria-pressed="${row.key === local.rowKey}"><span>${escape(row.raw?.raw || row.label)}</span><strong>${escape(row.value)}</strong><small>${label}</small></button>`;
    }).join('') || '<p class="sc-empty">Esta raridade não tem efeitos cadastrados. Abra o equipamento para corrigir.</p>';
  }
  function chooseEffect(key) {
    clearTest();
    local.rowKey = key;
    local.bindingId = crypto.randomUUID();
    renderEffects();
    const row = selectedRow();
    const binding = getData().central.draft.bindings.find(b => b.source_kind === 'equipment_variant' && b.source_id === row?.source_id && b.attribute_key === key);
    const definition = getData().central.draft.definitions.find(d => d.id === binding?.target);
    $('source-text').textContent = row ? row.raw?.raw || `${row.value ?? 'Sem valor'} · ${row.label}` : 'Selecione um efeito cadastrado.';
    $('source-note').textContent = row?.raw?.textReview ? 'Leitura incompleta: use “Corrigir texto ou valor” antes de configurar.'
      : row && !row.raw?.raw ? 'Este cadastro não guarda o texto original da imagem. Confira se a descrição inclui toda a condição do efeito.' : '';
    $('scope').value = ['hero', 'weapon'].includes(definition?.scope) ? definition.scope : '';
    fillTargets(definition?.source_key || '');
    $('operator').value = binding?.operator || row?.operator || '';
    $('condition').value = binding?.condition || '';
    $('ability').value = binding?.ability_id || '';
    // A different row must not inherit an active test scenario or a target.
    $('moving').value = '';
    $('aiming').value = '';
    $('active').value = '';
    $('test').disabled = !row || Boolean(row.raw?.textReview);
    $('verify').disabled = !row;
    ruleSentence();
  }
  function fillTargets(preferredKey = '') {
    const fields = effectTargets(getData(), $('scope').value, $('hero').value);
    const names = new Map();
    fields.forEach(f => names.set(f.name, (names.get(f.name) || 0) + 1));
    $('target').innerHTML = '<option value="">Escolha o status</option>' + options(fields.map(f => ({ id: f.source_key,
      name: `${f.name}${names.get(f.name) > 1 ? ` (${f.source_key})` : ''}${f.base === null && $('hero').value ? ' · sem valor neste herói' : ''}` })));
    $('target').value = preferredKey;
    targetChanged();
  }
  function targetChanged() {
    const field = effectTargets(getData(), $('scope').value, $('hero').value).find(f => f.source_key === $('target').value);
    const needsUnit = Boolean(field && (!field.definition || field.definition.unit === 'unknown'));
    $('new-target').hidden = !needsUnit;
    $('unit').required = needsUnit;
    $('target-name').required = needsUnit;
    $('target-name').value = field?.name || '';
    $('unit').value = needsUnit ? '' : field?.definition?.unit || '';
    $('target-help').textContent = field ? `Campo cadastrado: ${field.source_key}. ${field.base === null ? 'Sem valor-base para o herói selecionado.' : `Valor-base: ${number(field.base)}${STATUS_UNITS[field.definition?.unit]?.symbol || ''}.`}` : '';
    ruleSentence();
  }
  function ruleSentence() {
    const value = input(), field = effectTargets(getData(), value.scope, value.heroId).find(f => f.source_key === value.sourceKey);
    const ability = value.condition === 'ability_active';
    $('ability-label').hidden = !ability;
    $('active-label').hidden = !ability;
    $('ability').required = ability;
    $('rule-sentence').textContent = field && value.operator && value.condition
      ? `${scopeName(value.scope)} · ${field.name}: ${STATUS_OPERATORS[value.operator].label.toLocaleLowerCase('pt-BR')} · ${STATUS_CONDITIONS[value.condition].toLocaleLowerCase('pt-BR')}.`
      : 'Escolha o destino, a operação e a condição.';
    $('test-caption').textContent = $('hero').selectedOptions[0]?.value ? `O teste usa ${$('hero').selectedOptions[0].textContent} com este equipamento na raridade ${$('variant').selectedOptions[0]?.textContent}.` : 'Escolha um herói acima para usar seus valores reais no teste.';
  }
  function guard(task) {
    return action(async () => {
      try { await task(); }
      catch (error) { feedback(error.message, 'error'); throw error; }
    });
  }
  function resultMarkup(review) {
    const { step, definition, proof, others, publishedStep } = review, unit = STATUS_UNITS[definition.unit]?.symbol || '';
    let html = `<div class="scg-result-heading"><strong>${escape(scopeName(definition.scope))} · ${escape(definition.name)}</strong><span>${escape(STATUS_CONDITIONS[review.input.condition])}</span></div>`;
    if (step?.status === 'applied') {
      html += `<div class="scg-comparison"><div><span>Antes deste efeito</span><strong>${number(step.before)}${escape(unit)}</strong></div><span class="scg-arrow" aria-hidden="true">→</span><div><span>Depois deste efeito</span><strong>${number(step.after)}${escape(unit)}</strong></div></div><p class="sc-note">Base cadastrada: ${number(proof.calculation.base[definition.id])}${escape(unit)}. Resultado com todos os efeitos calculáveis do equipamento: ${number(proof.calculation.final[definition.id])}${escape(unit)}.</p>`;
    } else {
      html += `<p class="sc-formula">${escape(explanation(step))}</p>`;
      if (step?.status === 'missing_base') html += '<button class="admin-button" type="button" data-guided-base>Conferir o valor-base</button>';
    }
    html += `<p class="scg-live-status"><strong>No site agora:</strong> ${publishedStep?.status === 'applied' ? `${escape(review.published.calculation.definitions[publishedStep.target]?.nome || publishedStep.target)} · ${number(publishedStep.before)} → ${number(publishedStep.after)}${escape(STATUS_UNITS[publishedStep.unit]?.symbol || '')}` : escape(explanation(publishedStep))}</p>`;
    if (others.length) html += `<details class="scg-pending"><summary>${others.length} outro(s) efeito(s) ainda precisam de atenção</summary><ul>${others.map(t => `<li><strong>${escape(t.sourceKey)}</strong>: ${escape(explanation(t))}</li>`).join('')}</ul></details>`;
    if (review.unrelated.length) html += `<div class="scg-pending"><p>Há ${review.unrelated.length} outro(s) ajuste(s) no rascunho da Central. Revise-os antes de publicar para evitar ativar mudanças que não participaram deste teste.</p><button type="button" class="admin-button" data-guided-advanced>Revisar outros ajustes</button></div>`;
    html += `<details class="scg-calculation-detail"><summary>Como chegou a este resultado?</summary><p>Fonte: ${escape(review.row.name)} · ${escape(review.row.rarity)}. Destino: ${escape(definition.source_key)} (${escape(STATUS_UNITS[definition.unit]?.label)}).</p>${step?.status === 'applied' ? `<p>${number(step.before)} ${step.operation === 'percent' ? `× (1 ${step.value < 0 ? '−' : '+'} ${number(Math.abs(step.value))} ÷ 100)` : `${step.value < 0 ? '−' : '+'} ${number(Math.abs(step.value))}`} = ${number(step.after)}${escape(unit)}</p>` : ''}<button type="button" class="admin-button" data-guided-full-proof>Ver teste com vários equipamentos</button></details>`;
    return html;
  }
  function showReview(review) {
    local.review = review;
    $('result').innerHTML = resultMarkup(review);
    const active = review.step?.status === 'applied';
    $('test-state').textContent = active ? 'Efeito testado na prévia' : 'Teste com pendência';
    $('test-state').className = `sc-badge ${active ? '' : 'warn'}`;
    feedback(active ? `O motor calculou este efeito.${review.others.length ? ' O equipamento ainda tem outras pendências.' : ''} Confira os valores antes de aplicar.` : explanation(review.step));
    $('apply-area').hidden = false;
    $('apply-title').textContent = review.alreadyPublished ? 'Esta configuração já está no site' : 'Aplicar apenas este efeito e esta raridade';
    $('apply-help').textContent = review.alreadyPublished ? 'Use “Verificar no site” para conferir a resposta do Brain.' : 'Ao confirmar, a Central salva, publica e consulta o Brain para verificar o resultado.';
    const permissions = getData().central.permissions;
    $('apply').disabled = !review.canApply || review.alreadyPublished || !permissions.edit || !permissions.publish;
    if (!permissions.edit || !permissions.publish) $('apply-help').textContent = 'Sua conta pode testar. Para aplicar, são necessárias as permissões de editar e publicar equipamentos.';
  }
  async function verify(data = null, selection = input()) {
    feedback('Consultando a regra publicada e conferindo com o Brain…');
    $('test-state').textContent = 'Conferindo o site…';
    $('test-state').className = 'sc-badge';
    const fresh = data || await loadStatusCentralData();
    const result = await verifyEquipmentEffect(fresh, selection, requestBrainProof);
    // The badge describes exactly this source row, never the entire item.
    $('test-state').textContent = result.confirmed ? 'Este efeito foi confirmado no site' : 'Confirmação pendente';
    $('test-state').className = `sc-badge ${result.confirmed ? 'good' : 'warn'}`;
    const pending = result.proof.calculation.unknown.length;
    const definition = fresh.central.published.payload.definitions.find(d => d.id === result.step?.target);
    if (definition) $('result').innerHTML = resultMarkup({ step: result.step, definition, proof: result.proof,
      published: result.proof, publishedStep: result.step, row: equipmentEffectRows(fresh, selection.equipmentId, selection.variantId).find(r => r.key === selection.rowKey) || { name: fresh.equipments.find(item => item.id === selection.equipmentId)?.name || 'Equipamento', rarity: result.proof.sources[0]?.rarity || '' },
      input: { ...selection, condition: result.step.condition }, unrelated: [],
      others: result.proof.calculation.trace.filter(t => t !== result.step && !['applied', 'not_applicable'].includes(t.status)) });
    feedback(result.confirmed ? `No site, este efeito atua em ${scopeName(definition.scope)} · ${definition.name}: ${number(result.step.before)} → ${number(result.step.after)}${STATUS_UNITS[result.step.unit]?.symbol || ''}. O Brain confirmou.${pending ? ` O equipamento ainda tem ${pending} pendência(s).` : ''}` : result.reason, result.confirmed ? 'ok' : 'error');
    return result;
  }
  $('search').addEventListener('input', fillEquipments);
  $('equipment').addEventListener('change', () => equipmentChanged());
  $('variant').addEventListener('change', () => variantChanged());
  $('effects').addEventListener('click', event => { const button = event.target.closest('[data-effect-key]'); if (button) chooseEffect(button.dataset.effectKey); });
  $('hero').addEventListener('change', () => { clearTest(); fillAbilities(); fillTargets($('target').value); $('active').value = ''; ruleSentence(); });
  $('scope').addEventListener('change', () => { clearTest(); fillTargets(); });
  $('target').addEventListener('change', () => { clearTest(); targetChanged(); });
  for (const id of ['unit', 'target-name', 'operator', 'condition', 'ability', 'moving', 'aiming', 'active']) $(id).addEventListener('input', () => { clearTest(); ruleSentence(); });
  $('form').addEventListener('submit', event => { event.preventDefault(); guard(async () => { clearTest('Calculando este efeito…'); showReview(previewEquipmentEffect(getData(), input())); }); });
  $('verify').addEventListener('click', () => guard(async () => { clearTest('Verificando o que está aplicado no site…'); await verify(); }));
  $('apply').addEventListener('click', () => {
    if (!local.review?.canApply) return;
    const review = local.review;
    $('publish-summary').innerHTML = `<p><strong>${escape(review.row.name)}</strong><br>${escape(review.row.rarity)} · ${escape(review.row.label)}</p><p>${escape(scopeName(review.definition.scope))} · ${escape(review.definition.name)}<br>${escape(STATUS_OPERATORS[review.input.operator].label)} · ${escape(STATUS_CONDITIONS[review.input.condition])}</p><p>Teste com ${escape(review.proof.hero.name)}: <strong>${number(review.step.before)} → ${number(review.step.after)}${escape(STATUS_UNITS[review.definition.unit]?.symbol || '')}</strong></p>${review.others.length ? `<p>Este efeito foi testado. Outros ${review.others.length} efeito(s) continuam pendentes.</p>` : ''}`;
    $('publish-dialog').showModal();
  });
  $('confirm').addEventListener('click', () => {
    const review = local.review;
    $('publish-dialog').close();
    guard(async () => {
      if (!review?.canApply) throw new Error('Faça um novo teste antes de aplicar.');
      clearTest('Conferindo o efeito testado…');
      const data = await applyReviewedEquipmentEffect(review, { loadData: loadStatusCentralData, rpc: centralRpc, onCentral, onProgress: feedback });
      feedback('Efeito publicado e relido. Conferindo o cálculo no Brain…');
      showReview(previewEquipmentEffect(data, review.input));
      try { await verify(data, review.input); }
      catch (error) { $('test-state').textContent = 'Publicado · confirmação pendente'; feedback(`O efeito foi publicado, mas o Brain ainda não confirmou: ${error.message} Use “Verificar no site” para tentar novamente.`, 'error'); }
    });
  });
  $('result').addEventListener('click', event => {
    if (event.target.closest('[data-guided-advanced]')) openAdvanced('bindings');
    if (event.target.closest('[data-guided-full-proof]')) openAdvanced('proof', input());
    if (event.target.closest('[data-guided-base]')) openBase(input());
  });
  $('operator').innerHTML = '<option value="">Escolha a operação</option>' + options(Object.entries(STATUS_OPERATORS).map(([id, op]) => ({ id, name: op.label })));
  $('condition').innerHTML = '<option value="">Escolha a condição</option>' + options(Object.entries(STATUS_CONDITIONS).map(([id, name]) => ({ id, name })));
  $('unit').innerHTML = '<option value="">Confirme a unidade</option>' + options(Object.entries(STATUS_UNITS).filter(([id]) => id !== 'unknown').map(([id, unit]) => ({ id, name: unit.label })));
  return {
    refresh(equipmentId = null) {
      const current = $('equipment').value, variant = $('variant').value;
      fillEquipments();
      $('equipment').value = equipmentId ?? current;
      equipmentChanged(variant);
    },
    invalidate: clearTest
  };
}
