import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';
import { equipmentAttributeWithSource } from './equipment-effect-text.js?eq=20260907-effects-1';
import {
  humanizeAttributeKey
} from '../../js/equipment-audit-rules.js?v=2';
import { equipmentAttributeOperation } from '../../js/equipment-attribute-calculation.js?v=2';
import { resolveExternalDataEffect } from '../../js/equipment-data-limits.js?v=2';
import {
  refreshEquipmentAttributeClassifications,
  resolvePersistedAttributeClassification
} from '../../js/equipment-attribute-classifications.js?v=3&sb=20260823-security-supabase-pin-1';
import {
  groupCalculationResolutionOccurrences,
  matchCalculationAttribute,
  publishedCalculationCoverage
} from './equipment-calculation-v2-coverage.js?v=20260920-resolution-authority-1';
import { showAdminDecisionModal } from './admin-decision-modal.js?v=1';

const form = document.getElementById('form');
const rarityHost = document.getElementById('rarities');
let allowNextSubmit = false;
let backendCalculationV2Coverage = publishedCalculationCoverage();
let localCalculationV2Coverage = null;

function calculationV2Coverage() {
  return localCalculationV2Coverage?.compatible
    ? localCalculationV2Coverage
    : backendCalculationV2Coverage;
}

function currentEquipmentId() {
  return new URLSearchParams(location.search).get('id');
}

async function refreshPublishedCalculationV2Coverage() {
  const equipmentId = currentEquipmentId();
  if (!equipmentId) {
    backendCalculationV2Coverage = publishedCalculationCoverage();
    return calculationV2Coverage();
  }

  const { data, error } = await supabase.rpc('admin_get_equipment_calculation_v2', {
    p_equipment_id: equipmentId
  });
  if (error) {
    backendCalculationV2Coverage = publishedCalculationCoverage();
    throw new Error(error.message || 'Não foi possível conferir a publicação do Cálculo V2.');
  }
  backendCalculationV2Coverage = publishedCalculationCoverage(data, { source: 'backend' });
  return calculationV2Coverage();
}

await refreshEquipmentAttributeClassifications();
try {
  await refreshPublishedCalculationV2Coverage();
} catch (error) {
  console.warn('[equipment-attribute-assistant] Cálculo V2 indisponível para cobertura segura.', error);
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function persistedFor(rawKey = '') {
  return resolvePersistedAttributeClassification(rawKey);
}

function resolveAnyExternal(rawKey = '') {
  const persisted = persistedFor(rawKey);
  if (persisted?.classification === 'external_data_required') {
    return {
      label: persisted.label,
      reason: persisted.reason,
      missingData: persisted.missingData,
      publicNote: persisted.publicNote,
      persisted: true
    };
  }
  return resolveExternalDataEffect(rawKey);
}

function ensureStyles() {
  if (document.getElementById('equipment-attribute-assistant-style')) return;
  const style = document.createElement('style');
  style.id = 'equipment-attribute-assistant-style';
  style.textContent = `
    .attribute-assistant-guide{margin:0 0 14px;padding:12px 13px;border:1px solid #33445f;border-radius:11px;background:#081321;color:#9eabc0;font-size:10px;line-height:1.5}
    .attribute-assistant-guide strong{display:block;color:#eef3fa;font-size:11px}.attribute-assistant-guide span{display:block;margin-top:4px}
    .attribute-assistant-summary{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}.attribute-assistant-pill{padding:4px 7px;border-radius:999px;border:1px solid #31425d;font-size:8px;font-weight:900}.attribute-assistant-pill.ok{color:#86efac;border-color:#225d49}.attribute-assistant-pill.warn{color:#fde68a;border-color:#76591c}.attribute-assistant-pill.bad{color:#fecdd3;border-color:#7f1d1d}.attribute-assistant-pill.infrastructure{color:#fda4af;border-color:#9f1239;background:rgba(159,18,57,.1)}.attribute-assistant-pill.external{color:#fde68a;border-color:#76591c;background:rgba(120,83,8,.08)}.attribute-assistant-pill.informational{color:#bfdbfe;border-color:#315a8b;background:rgba(30,64,175,.08)}
    .attr-row .attribute-assistant{grid-column:1/-1;margin-top:2px;padding:8px 9px;border:1px solid #26344d;border-radius:8px;background:#07101d;font-size:9px;line-height:1.45}.attribute-assistant strong{display:block;font-size:9px}.attribute-assistant span{display:block;margin-top:3px;color:#8f9db1}.attribute-assistant.ok{border-color:rgba(74,222,128,.28)}.attribute-assistant.ok strong{color:#86efac}.attribute-assistant.info{border-color:rgba(125,211,252,.28)}.attribute-assistant.info strong{color:#bae6fd}.attribute-assistant.warn{border-color:rgba(251,191,36,.3)}.attribute-assistant.warn strong{color:#fde68a}.attribute-assistant.bad{border-color:rgba(251,113,133,.35)}.attribute-assistant.bad strong{color:#fecdd3}.attribute-assistant.external{border-color:rgba(251,191,36,.34);background:rgba(120,83,8,.08)}.attribute-assistant.external strong{color:#fde68a}.attribute-assistant.external span{color:#c6b77b}.attribute-assistant.informational{border-color:rgba(96,165,250,.34);background:rgba(30,64,175,.08)}.attribute-assistant.informational strong{color:#bfdbfe}.attribute-assistant.informational span{color:#9fb8d8}
    .attr-row.attribute-invalid input{border-color:#7f1d1d!important}.attr-row.attribute-unrecognized textarea{border-color:#76591c!important}.attr-row.attribute-external textarea{border-color:#76591c!important}.attr-row.attribute-informational textarea{border-color:#315a8b!important}
    .attribute-audit-after-save{padding:13px 14px;border:1px solid #7f1d1d;border-radius:12px;background:rgba(127,29,29,.13);color:#fecdd3;font-size:10px;line-height:1.55}.attribute-audit-after-save strong{display:block;color:#fff;font-size:12px}.attribute-audit-after-save a{display:inline-flex;margin-top:9px;color:#fff}.attribute-audit-after-save.setup,.attribute-audit-after-save.external{border-color:#76591c;background:rgba(120,83,8,.12);color:#fde68a}
  `;
  document.head.appendChild(style);
}

function ensureGuide() {
  if (!rarityHost || document.getElementById('attribute-assistant-guide')) return;
  const guide = document.createElement('div');
  guide.id = 'attribute-assistant-guide';
  guide.className = 'attribute-assistant-guide';
  guide.innerHTML = `
    <strong>Validação dos atributos</strong>
    <span>O catálogo semântico resolve texto, contexto, unidade, operação e fórmula. A publicação do equipamento é acompanhada separadamente e não define se o atributo é conhecido.</span>
    <div class="attribute-assistant-summary">
      <span class="attribute-assistant-pill ok" id="attribute-v2-count">0 efeitos reconhecidos</span>
      <span class="attribute-assistant-pill ok" id="attribute-ok-count">0 vínculos legados</span>
      <span class="attribute-assistant-pill external" id="attribute-external-count">0 aguardando dados oficiais</span>
      <span class="attribute-assistant-pill informational" id="attribute-informational-count">0 informativos</span>
      <span class="attribute-assistant-pill warn" id="attribute-review-count">0 para revisar</span>
      <span class="attribute-assistant-pill bad" id="attribute-invalid-count">0 valores inválidos</span>
      <span class="attribute-assistant-pill infrastructure" id="attribute-infrastructure-state" hidden></span>
    </div>`;
  rarityHost.parentElement?.insertBefore(guide, rarityHost);
}

function rowInputs(row) {
  const inputs = row.querySelectorAll('textarea, input');
  return { label: inputs[0] || null, value: inputs[1] || null };
}

function ensureAssistant(row) {
  let node = row.querySelector('.attribute-assistant');
  if (!node) {
    node = document.createElement('div');
    node.className = 'attribute-assistant';
    row.appendChild(node);
  }
  return node;
}

function resolutionReason(status) {
  return ({
    pending_alias: 'Nova frase sem alias publicado.',
    alias_collision: 'O alias publicado colide com mais de um destino.',
    formula_unpublished: 'O atributo existe, mas a fórmula ainda não foi publicada.',
    unit_mismatch: 'A unidade observada não é compatível com o atributo.',
    operation_mismatch: 'A operação observada não é compatível com a regra publicada.',
    context_mismatch: 'O contexto observado não corresponde ao contexto publicado.',
    invalid_value: 'O valor observado não é numérico.',
    incomplete_source: 'O texto reconhecido na imagem está incompleto.'
  })[status] || 'O efeito ainda exige uma decisão da equipe.';
}

function analyzeRow(row) {
  const { label, value } = rowInputs(row);
  const assistant = ensureAssistant(row);
  const rawKey = String(label?.value || '').trim();
  const rawValue = String(value?.value || '').trim();

  row.classList.remove('attribute-invalid', 'attribute-unrecognized', 'attribute-external', 'attribute-informational');
  row.dataset.attributeState = 'empty';
  delete row.dataset.resolutionStatus;
  delete row.dataset.semanticSignature;
  delete row.dataset.publicationStatus;
  delete row.dataset.semanticTarget;

  if (!rawKey) {
    assistant.className = 'attribute-assistant';
    assistant.innerHTML = '<strong>Digite o nome do atributo.</strong><span>A validação aparecerá aqui antes de você salvar.</span>';
    refreshSummary();
    return;
  }

  const attribute = equipmentAttributeWithSource(row._equipmentAttributeSource, {
    label: rawKey, value: rawValue, operator: row.dataset.attributeOperator
  });
  const explicitOperation = equipmentAttributeOperation(attribute.operator);
  const raritySlug = row.closest('.rarity-card')?.dataset.raritySlug || '';
  const semanticMatch = matchCalculationAttribute(attribute, {
    coverage: calculationV2Coverage(),
    raritySlug
  });
  row.dataset.resolutionStatus = semanticMatch.status;
  row.dataset.semanticSignature = semanticMatch.signature || '';
  row.dataset.publicationStatus = semanticMatch.publicationStatus || '';
  row.dataset.semanticTarget = semanticMatch.target || semanticMatch.candidateTarget || '';

  if (semanticMatch.infrastructureIssue) {
    row.dataset.attributeState = 'catalog_incompatible';
    assistant.className = 'attribute-assistant bad';
    assistant.innerHTML = `
      <strong>Catálogo semântico indisponível ou incompatível neste ambiente.</strong>
      <span>Esta é uma falha de infraestrutura. A linha foi preservada e não será registrada como pendência de conteúdo.</span>`;
    refreshSummary();
    return;
  }

  if (semanticMatch.status === 'resolved') {
    row.dataset.attributeState = 'calculation_v2';
    assistant.className = 'attribute-assistant ok';
    const stateCopy = semanticMatch.publicationStatus === 'published'
      ? '<strong>Reconhecido pelo catálogo e publicado.</strong>'
      : semanticMatch.publicationStatus === 'stale_publication'
        ? '<strong>Reconhecido pelo catálogo — publicação desatualizada.</strong>'
        : '<strong>Reconhecido pelo catálogo — aguardando publicação do equipamento.</strong>';
    const revisionCopy = semanticMatch.publicationStatus === 'stale_publication'
      ? ` O rascunho está na revisão ${escapeHtml(semanticMatch.workspaceRevision)} e a publicação ativa na revisão ${escapeHtml(semanticMatch.publishedRevision)}.`
      : '';
    assistant.innerHTML = `
      ${stateCopy}
      <span>${escapeHtml(semanticMatch.effect?.description || rawKey)} → ${escapeHtml(semanticMatch.target)}. Alias, contexto, unidade, operação e fórmula foram validados.${revisionCopy}</span>`;
    refreshSummary();
    return;
  }

  if (semanticMatch.status === 'invalid_value') {
    row.dataset.attributeState = 'invalid';
    row.classList.add('attribute-invalid');
    assistant.className = 'attribute-assistant bad';
    assistant.innerHTML = `<strong>Valor inválido para cálculo.</strong><span>“${escapeHtml(rawValue)}” não é um número. A ocorrência foi preservada, mas exige correção.</span>`;
    refreshSummary();
    return;
  }

  if (semanticMatch.status === 'incomplete_source') {
    row.dataset.attributeState = 'source_incomplete';
    row.classList.add('attribute-unrecognized');
    assistant.className = 'attribute-assistant bad';
    assistant.innerHTML = '<strong>Leitura incompleta: confira o texto na imagem.</strong><span>Corrija a descrição integral, incluindo o contexto do efeito.</span>';
    refreshSummary();
    return;
  }

  const persisted = persistedFor(rawKey);
  if (persisted?.classification === 'informational') {
    row.dataset.attributeState = 'informational';
    row.classList.add('attribute-informational');
    assistant.className = 'attribute-assistant informational';
    assistant.innerHTML = `
      <strong>🔵 Efeito informativo — sem cálculo.</strong>
      <span><b>${escapeHtml(persisted.label)}</b> é uma mecânica real preservada para exibição, mas não representa um atributo matemático da build.</span>
      <span>${escapeHtml(persisted.publicNote || persisted.reason || 'Classificação registrada pela equipe na Auditoria.')}</span>`;
    refreshSummary();
    return;
  }

  const externalEffect = resolveAnyExternal(rawKey);
  if (externalEffect) {
    row.dataset.attributeState = 'external';
    row.classList.add('attribute-external');
    assistant.className = 'attribute-assistant external';
    assistant.innerHTML = `
      <strong>🟡 Aguardando dado oficial — não é erro de cadastro.</strong>
      <span><b>${escapeHtml(externalEffect.label)}</b> é um efeito conhecido do equipamento, mas o jogo não disponibiliza publicamente a base necessária para um resultado final confiável. O valor será preservado e exibido, porém ficará fora do cálculo.</span>
      <span><b>O que falta:</b> ${escapeHtml(externalEffect.missingData || 'Valor-base oficial e regra exata de aplicação.')}${externalEffect.persisted ? ' Esta classificação foi registrada pela Auditoria.' : ''}</span>`;
    refreshSummary();
    return;
  }

  if (semanticMatch.status === 'operation_mismatch' && !explicitOperation) {
    row.dataset.attributeState = 'operator_required';
    assistant.className = 'attribute-assistant warn';
    assistant.innerHTML = '<strong>Selecione o operador desta linha.</strong><span>Escolha +, −, +% ou −% acima para conferir como o valor será aplicado.</span>';
    refreshSummary();
    return;
  }

  row.dataset.attributeState = 'unknown';
  row.classList.add('attribute-unrecognized');
  assistant.className = 'attribute-assistant warn';
  assistant.innerHTML = `
    <strong>${escapeHtml(resolutionReason(semanticMatch.status))}</strong>
    <span>O texto e a evidência foram preservados. O catálogo semântico não fará aproximação e a Central antiga não substituirá esta decisão.</span>`;
  refreshSummary();
}

function rowOccurrence(row) {
  const { label } = rowInputs(row);
  const fallbackSignature = [
    row.dataset.attributeState || 'unknown',
    String(label?.value || '').trim().toLocaleLowerCase('pt-BR')
  ].join('\u0000');
  return {
    row,
    match: {
      status: row.dataset.resolutionStatus || 'pending_alias',
      signature: row.dataset.semanticSignature || fallbackSignature,
      target: row.dataset.semanticTarget || null,
      publicationStatus: row.dataset.publicationStatus || null
    },
    raritySlug: row.closest('.rarity-card')?.dataset.raritySlug || ''
  };
}

function groupedRows(rows) {
  return groupCalculationResolutionOccurrences(rows.map(rowOccurrence));
}

let summaryFrame = 0;
function refreshSummary() {
  cancelAnimationFrame(summaryFrame);
  summaryFrame = requestAnimationFrame(() => {
    const rows = [...document.querySelectorAll('#rarities .attr-row')];
    const ok = groupedRows(rows.filter(row => ['ok', 'approximate'].includes(row.dataset.attributeState))).length;
    const calculationRows = rows.filter(row => row.dataset.attributeState === 'calculation_v2');
    const calculationV2 = groupedRows(calculationRows).length;
    const external = groupedRows(rows.filter(row => row.dataset.attributeState === 'external')).length;
    const informational = groupedRows(rows.filter(row => row.dataset.attributeState === 'informational')).length;
    const review = groupedRows(rows.filter(row => [
      'unknown', 'operator_required', 'source_incomplete'
    ].includes(row.dataset.attributeState))).length;
    const invalid = groupedRows(rows.filter(row => row.dataset.attributeState === 'invalid')).length;
    const infrastructure = rows.some(row => row.dataset.attributeState === 'catalog_incompatible')
      || !calculationV2Coverage().compatible;
    const okNode = document.getElementById('attribute-ok-count');
    const calculationV2Node = document.getElementById('attribute-v2-count');
    const externalNode = document.getElementById('attribute-external-count');
    const informationalNode = document.getElementById('attribute-informational-count');
    const reviewNode = document.getElementById('attribute-review-count');
    const invalidNode = document.getElementById('attribute-invalid-count');
    const infrastructureNode = document.getElementById('attribute-infrastructure-state');
    if (calculationV2Node) {
      const publicationStates = new Set(calculationRows.map(row => row.dataset.publicationStatus));
      const suffix = publicationStates.has('stale_publication')
        ? ' · publicação desatualizada'
        : publicationStates.has('draft')
          ? ' · aguardando publicação'
          : calculationV2 ? ' e publicados' : '';
      calculationV2Node.textContent = `${calculationV2} efeito${calculationV2 === 1 ? '' : 's'} reconhecido${calculationV2 === 1 ? '' : 's'}${suffix}`;
    }
    if (okNode) okNode.textContent = `${ok} vínculo${ok === 1 ? '' : 's'} legado${ok === 1 ? '' : 's'}`;
    if (externalNode) externalNode.textContent = external === 1 ? '1 aguardando dado oficial' : `${external} aguardando dados oficiais`;
    if (informationalNode) informationalNode.textContent = `${informational} informativo${informational === 1 ? '' : 's'}`;
    if (reviewNode) reviewNode.textContent = `${review} para revisar`;
    if (invalidNode) invalidNode.textContent = `${invalid} valor${invalid === 1 ? '' : 'es'} inválido${invalid === 1 ? '' : 's'}`;
    if (infrastructureNode) {
      infrastructureNode.hidden = !infrastructure;
      infrastructureNode.textContent = infrastructure
        ? 'Catálogo semântico incompatível neste ambiente'
        : '';
    }
  });
}

function bindRow(row) {
  if (row.dataset.attributeAssistantBound === '1') return false;
  row.dataset.attributeAssistantBound = '1';
  const { label, value } = rowInputs(row);
  const update = () => analyzeRow(row);
  label?.addEventListener('input', update);
  label?.addEventListener('change', update);
  value?.addEventListener('input', update);
  value?.addEventListener('change', update);
  analyzeRow(row);
  return true;
}

function scanRows({ reanalyze = false } = {}) {
  document.querySelectorAll('#rarities .attr-row').forEach(row => {
    const newlyBound = bindRow(row);
    if (reanalyze && !newlyBound) analyzeRow(row);
  });
  refreshSummary();
}

function rowsInside(node) {
  if (node?.nodeType !== Node.ELEMENT_NODE) return [];
  if (node.matches('.attr-row')) return [node];
  return [...node.querySelectorAll('.attr-row')];
}

function handleRarityMutations(records) {
  let summaryChanged = false;

  for (const record of records) {
    for (const node of record.addedNodes) {
      for (const row of rowsInside(node)) {
        summaryChanged = bindRow(row) || summaryChanged;
      }
    }

    for (const node of record.removedNodes) {
      if (rowsInside(node).length) summaryChanged = true;
    }
  }

  if (summaryChanged) refreshSummary();
}

function focusProblem(row) {
  if (!row) return;
  document.querySelector('[data-tab="rarities"]')?.click();
  window.setTimeout(() => {
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.querySelector('textarea, input')?.focus({ preventScroll: true });
  }, 80);
}

function describeProblemGroup(group, problem) {
  const row = group.occurrences[0]?.row;
  if (!row) return 'Efeito sem evidência disponível';
  const rarity = String(
    row.closest('.rarity-card')?.querySelector('.rarity-title')?.textContent
      || row.closest('.rarity-card')?.dataset.raritySlug
      || 'Raridade'
  ).trim();
  const { label, value } = rowInputs(row);
  const attribute = String(label?.value || '').trim() || 'atributo sem nome';
  const rawValue = String(value?.value || '').trim();

  if (problem === 'invalid') {
    return `“${attribute}” tem o valor inválido “${rawValue || 'vazio'}” em ${group.rarityCount || 1} raridade(s)`;
  }
  return `“${attribute}” — ${resolutionReason(group.status)} Ocorrência em ${group.rarityCount || 1} raridade(s); primeira: ${rarity}`;
}

async function guardSubmit(event) {
  if (allowNextSubmit) {
    allowNextSubmit = false;
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();

  try {
    await refreshPublishedCalculationV2Coverage();
  } catch (error) {
    console.warn('[equipment-attribute-assistant] Falha ao reler a publicação V2 antes de salvar.', error);
  }
  scanRows({ reanalyze: true });

  const activeCoverage = calculationV2Coverage();
  if (!activeCoverage.compatible) {
    const confirmed = await showAdminDecisionModal({
      kicker: 'AMBIENTE INCOMPATÍVEL',
      title: 'Catálogo semântico indisponível',
      message: 'Catálogo semântico indisponível ou incompatível neste ambiente.',
      detail: 'Esta falha de infraestrutura não será convertida em pendências de conteúdo. O cadastro básico pode ser preservado, mas o cálculo não será confirmado enquanto as migrations e RPCs compatíveis não estiverem disponíveis.',
      confirmLabel: 'Salvar somente o cadastro',
      cancelLabel: 'Voltar'
    });
    if (!confirmed) return;
    allowNextSubmit = true;
    form?.requestSubmit();
    return;
  }

  const invalidRows = [...document.querySelectorAll('#rarities .attr-row[data-attribute-state="invalid"]')]
    .filter(row => String(row.querySelector('input')?.value || '').trim());
  const unknownRows = [...document.querySelectorAll([
    '#rarities .attr-row[data-attribute-state="unknown"]',
    '#rarities .attr-row[data-attribute-state="operator_required"]',
    '#rarities .attr-row[data-attribute-state="source_incomplete"]'
  ].join(','))]
    .filter(row => String(row.querySelector('input')?.value || '').trim());

  const invalidGroups = groupedRows(invalidRows);
  const unknownGroups = groupedRows(unknownRows);

  if (!invalidGroups.length && !unknownGroups.length) {
    allowNextSubmit = true;
    form?.requestSubmit();
    return;
  }

  const parts = [];
  if (unknownGroups.length) {
    const rarityCount = new Set(unknownGroups.flatMap(group => group.rarities)).size;
    parts.push(`${unknownGroups.length} efeito(s) pendente(s) encontrado(s) em ${rarityCount} raridade(s)`);
  }
  if (invalidGroups.length) parts.push(`${invalidGroups.length} efeito(s) com valor inválido`);
  const problemDetails = [
    ...unknownGroups.map(group => describeProblemGroup(group, 'unknown')),
    ...invalidGroups.map(group => describeProblemGroup(group, 'invalid'))
  ];
  const visibleProblems = problemDetails.slice(0, 3).join('; ');
  const remainingProblems = Math.max(0, problemDetails.length - 3);

  const confirmed = await showAdminDecisionModal({
    kicker: 'PENDÊNCIAS ENCONTRADAS',
    title: 'Salvar e enviar para a Auditoria?',
    message: `${parts.join(' e ')}. O equipamento pode ser cadastrado mesmo assim.`,
    detail: [
      visibleProblems ? `Motivo: ${visibleProblems}${remainingProblems ? `; e mais ${remainingProblems}` : ''}.` : '',
      'Somente pendências que exigem decisão da equipe entram nesta contagem. “Aguardando dado oficial” e “Efeito informativo” não são erros do cadastro.'
    ].filter(Boolean).join(' '),
    confirmLabel: 'Salvar e registrar pendências',
    cancelLabel: 'Voltar e corrigir agora'
  });

  if (!confirmed) {
    focusProblem(invalidGroups[0]?.occurrences[0]?.row || unknownGroups[0]?.occurrences[0]?.row);
    return;
  }

  allowNextSubmit = true;
  form?.requestSubmit();
}

function showAuditAfterSave(detail = {}) {
  document.getElementById('attribute-audit-after-save')?.remove();
  const issues = Array.isArray(detail.issues) ? detail.issues : [];
  if (detail.installed && !issues.length) return;

  const corrections = issues.filter(issue => issue.issue_type !== 'external_data_required');
  const external = issues.filter(issue => issue.issue_type === 'external_data_required');
  const node = document.createElement('div');
  node.id = 'attribute-audit-after-save';
  node.className = `attribute-audit-after-save${detail.installed ? (corrections.length ? '' : ' external') : ' setup'}`;

  if (!detail.installed) {
    node.innerHTML = '<strong>Equipamento salvo, mas a fila persistente da Auditoria ainda não está ativa no banco.</strong><span>A auditoria dinâmica continua disponível, porém o destaque entre sessões depende da tabela <code>equipment_audit_queue</code>.</span>';
  } else if (corrections.length) {
    node.innerHTML = `<strong>Equipamento salvo com ${corrections.length} correção(ões) necessária(s).</strong><span>O cadastro foi preservado e estas pendências já foram registradas na Auditoria.${external.length ? ` Há também ${external.length} efeito(s) aguardando dados oficiais, separados dos erros.` : ''}</span><a class="admin-button" href="./equipment-audit.html">Abrir Auditoria agora</a>`;
  } else {
    node.innerHTML = `<strong>Equipamento salvo sem erro de cadastro.</strong><span>${external.length} efeito(s) foi(ram) registrado(s) como “Aguardando dados oficiais”. Eles permanecem visíveis, mas não entram no cálculo enquanto o jogo não fornecer uma base pública confiável.</span><a class="admin-button" href="./equipment-audit.html">Ver na Auditoria</a>`;
  }

  form?.prepend(node);
  node.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

ensureStyles();
ensureGuide();
scanRows();

if (rarityHost) {
  rarityHost.addEventListener('equipment:operators-changed', () => scanRows({ reanalyze: true }));
  // Observa somente a entrada/saída de linhas. A análise escreve o conteúdo do
  // assistente dentro da própria raridade; reanalisar qualquer mutação daqui
  // criaria um ciclo infinito e bloquearia o submit e a thread principal.
  new MutationObserver(handleRarityMutations).observe(rarityHost, {
    childList: true,
    subtree: true
  });
}

form?.addEventListener('submit', guardSubmit, true);
window.addEventListener('equipment:audit-sync', event => showAuditAfterSave(event.detail));
window.addEventListener('equipment:calculation-v2-coverage-changed', event => {
  if (event.detail?.equipmentId && event.detail.equipmentId !== currentEquipmentId()) return;
  localCalculationV2Coverage = publishedCalculationCoverage(
    event.detail?.workspace,
    { source: 'local' }
  );
  scanRows({ reanalyze: true });
});
window.addEventListener('equipment:calculation-v2-published', async event => {
  if (event.detail?.equipmentId && event.detail.equipmentId !== currentEquipmentId()) return;
  localCalculationV2Coverage = null;
  try {
    await refreshPublishedCalculationV2Coverage();
  } catch (error) {
    console.warn('[equipment-attribute-assistant] Falha ao atualizar cobertura após publicação.', error);
  }
  scanRows({ reanalyze: true });
});
