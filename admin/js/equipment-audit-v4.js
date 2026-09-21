import { statusAttributeRows } from '../../js/status-registry-v1.js?sc=20260906-1&eq=20260907-effects-1';
import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';
import {
  buildBonusMigrationAudit,
  humanizeAttributeKey,
  normalizeAuditText,
  resolveEquipmentRule,
  targetLabel
} from '../../js/equipment-audit-rules.js?v=3';
import {
  refreshEquipmentAttributeClassifications
} from '../../js/equipment-attribute-classifications.js?v=2&sb=20260823-security-supabase-pin-1';
import { equipmentAttributeWithSource } from './equipment-effect-text.js?v=20260920-resolution-authority-1';
import {
  matchCalculationAttribute,
  publishedCalculationCoverage
} from './equipment-calculation-v2-coverage.js?v=20260920-resolution-authority-1';
import { showAdminDecisionModal } from './admin-decision-modal.js?v=1';

const $ = id => document.getElementById(id);

const state = {
  attributes: [],
  attributeGroups: [],
  bonuses: [],
  proposals: new Map(),
  loading: false,
  sessionHistory: [],
  externalClassifications: [],
  semanticInfrastructure: null
};

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function unwrapRpcData(value) {
  let result = value;
  if (typeof result === 'string') {
    try { result = JSON.parse(result); } catch { return {}; }
  }
  if (Array.isArray(result) && result.length === 1 && isRecord(result[0])) return result[0];
  return isRecord(result) ? result : {};
}

async function loadSemanticResolutionCoverage() {
  const { data, error } = await supabase.rpc('admin_get_calculation_resolution_coverage_v2');
  if (error) {
    return {
      compatible: false,
      message: 'Catálogo semântico indisponível ou incompatível neste ambiente',
      error: error.message || String(error)
    };
  }
  const payload = unwrapRpcData(data);
  const compatible = payload.contract === 'echo-calculation-resolution-coverage/v2'
    && payload.compatible === true
    && Array.isArray(payload.definitions)
    && payload.definitions.length > 0
    && Array.isArray(payload.aliases)
    && Array.isArray(payload.contexts)
    && Array.isArray(payload.operations)
    && payload.operations.length > 0
    && Array.isArray(payload.equipment);
  return compatible
    ? { ...payload, compatible: true }
    : {
      ...payload,
      compatible: false,
      message: 'Catálogo semântico indisponível ou incompatível neste ambiente'
    };
}

async function loadData() {
  const [equipments, variants, rarities, sets, bonuses, semanticCoverage] = await Promise.all([
    supabase.from('equipments').select('id,name,set_id').order('name'),
    supabase.from('equipment_variants').select('id,equipment_id,rarity_id,attributes'),
    supabase.from('equipment_rarities').select('id,name,slug,rank').order('rank'),
    supabase.from('equipment_sets').select('id,name,slug').order('name'),
    supabase.from('equipment_set_bonuses').select('*').order('set_id').order('required_pieces'),
    loadSemanticResolutionCoverage()
  ]);

  const results = { equipments, variants, rarities, sets, bonuses };
  for (const [name, result] of Object.entries(results)) {
    if (result.error) throw new Error(`${name}: ${result.error.message || result.error}`);
  }

  return {
    semanticCoverage,
    equipments: equipments.data || [],
    variants: variants.data || [],
    rarities: rarities.data || [],
    sets: sets.data || [],
    bonuses: bonuses.data || []
  };
}

function buildAttributeAudit(data) {
  if (!data.semanticCoverage?.compatible) return [];
  const equipmentById = new Map(data.equipments.map(item => [item.id, item]));
  const rarityById = new Map(data.rarities.map(item => [item.id, item]));
  const semanticEquipmentById = new Map(
    data.semanticCoverage.equipment.map(item => [String(item.equipmentId || item.equipment?.id), item])
  );
  const definitionById = new Map(data.semanticCoverage.definitions.map(item => [item.id, item]));
  const rows = [];

  for (const variant of data.variants) {
    const equipment = equipmentById.get(variant.equipment_id) || {};
    const rarity = rarityById.get(variant.rarity_id) || {};
    const semanticEquipment = semanticEquipmentById.get(String(variant.equipment_id)) || {};
    const coverage = publishedCalculationCoverage({
      contract: data.semanticCoverage.contract,
      revision: semanticEquipment.workspaceRevision ?? semanticEquipment.revision ?? 0,
      state: semanticEquipment.workspaceStatus || 'empty',
      effects: semanticEquipment.effects || [],
      definitions: data.semanticCoverage.definitions,
      aliases: data.semanticCoverage.aliases,
      contexts: data.semanticCoverage.contexts,
      operations: data.semanticCoverage.operations,
      published: semanticEquipment.published || semanticEquipment.publication || null
    }, { source: 'backend' });

    for (const source of statusAttributeRows(variant.attributes)) {
      const rawSource = isRecord(source.raw) ? source.raw : { raw: source.label };
      const attribute = equipmentAttributeWithSource(rawSource, {
        label: source.label,
        value: source.value,
        operator: source.operator
      });
      const match = matchCalculationAttribute(attribute, {
        coverage,
        raritySlug: rarity.slug,
        context: attribute.context || attribute.semanticContext || null
      });
      const definition = definitionById.get(match.target || match.candidateTarget);
      const problems = match.contentIssue ? [match.status] : [];
      const rule = {
        recognized: match.status === 'resolved',
        target: match.target || match.candidateTarget || null,
        label: definition?.label || match.target || match.candidateTarget || null,
        operation: match.operation || null,
        source: 'Catálogo semântico do Cálculo V2',
        confidence: match.status === 'resolved' ? 1 : 0
      };

      rows.push({
        equipmentId: variant.equipment_id,
        equipmentName: equipment.name || 'Equipamento sem nome',
        rarityId: variant.rarity_id,
        rarityName: rarity.name || rarity.slug || 'Raridade',
        rarityRank: Number(rarity.rank ?? 999),
        key: attribute.key,
        value: attribute.value,
        numericValue: match.value ?? null,
        rule,
        problems,
        match,
        signature: match.signature,
        publicationStatus: match.publicationStatus || coverage.publicationStatus,
        workspaceRevision: match.workspaceRevision ?? coverage.revision,
        publishedRevision: match.publishedRevision ?? coverage.publishedRevision,
        evidence: rawSource
      });
    }
  }

  return rows;
}

function groupAttributeRows(rows) {
  const groups = new Map();

  for (const row of rows) {
    const groupKey = row.signature
      || `${normalizeAuditText(row.key).replace(/\s+/g, '_') || String(row.key)}:${row.rule?.target || 'unknown'}:${row.rule?.operation || 'unknown'}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(row);
  }

  return [...groups.entries()].map(([id, occurrences]) => {
    occurrences.sort((a, b) =>
      a.equipmentName.localeCompare(b.equipmentName, 'pt-BR') || a.rarityRank - b.rarityRank
    );

    const first = occurrences[0];
    const problems = [...new Set(occurrences.flatMap(item => item.problems))];
    const equipmentIds = new Set(occurrences.map(item => item.equipmentId));
    const rarityNames = new Set(occurrences.map(item => item.rarityName));
    const publicationStatuses = [...new Set(occurrences.map(item => item.publicationStatus).filter(Boolean))];
    const resolutionStatuses = [...new Set(occurrences.map(item => item.match?.status).filter(Boolean))];

    let status = 'ok';
    if (problems.length) status = 'bad';
    else if (publicationStatuses.some(value => value !== 'published')) status = 'info';

    return {
      id,
      key: first.key,
      label: humanizeAttributeKey(first.key),
      rule: first.rule,
      match: first.match,
      problems,
      status,
      publicationStatuses,
      resolutionStatuses,
      occurrences,
      occurrenceCount: occurrences.length,
      equipmentCount: equipmentIds.size,
      rarityCount: rarityNames.size
    };
  }).sort((a, b) => {
    const weight = { bad: 0, info: 1, ok: 2 };
    return weight[a.status] - weight[b.status] || a.label.localeCompare(b.label, 'pt-BR');
  });
}

function badge(label, type) {
  return `<span class="audit-status ${type}">${escapeHtml(label)}</span>`;
}

function attributeStatus(group) {
  const problem = group.problems[0];
  const labels = {
    pending_alias: 'Nova frase sem alias',
    alias_collision: 'Colisão de aliases',
    formula_unpublished: 'Fórmula não publicada',
    unit_mismatch: 'Unidade incompatível',
    operation_mismatch: 'Operação incompatível',
    context_mismatch: 'Contexto incompatível',
    invalid_value: 'Valor inválido',
    incomplete_source: 'Fonte incompleta'
  };
  if (problem) return badge(labels[problem] || 'Decisão necessária', 'bad');
  if (group.publicationStatuses.includes('stale_publication')) {
    return badge('Reconhecido · publicação desatualizada', 'info');
  }
  if (group.publicationStatuses.includes('draft')) {
    return badge('Reconhecido · aguardando publicação', 'info');
  }
  return badge('Reconhecido e publicado', 'ok');
}

function attributeReason(group) {
  const reasons = {
    pending_alias: 'O texto foi preservado, mas ainda não existe um alias exato publicado para esta frase.',
    alias_collision: 'Mais de um vínculo do catálogo disputa a mesma assinatura semântica.',
    formula_unpublished: 'O atributo existe, porém sua fórmula ainda não possui estado publicado.',
    unit_mismatch: 'A unidade observada não pertence às unidades permitidas pelo alias e pela definição.',
    operation_mismatch: 'A operação observada não pertence às operações permitidas pelo alias e pela definição.',
    context_mismatch: 'O contexto observado não corresponde ao contexto publicado para este alias.',
    invalid_value: 'O valor observado não pode ser interpretado como número e foi preservado sem cálculo.',
    incomplete_source: 'A leitura da imagem termina de forma incompleta e precisa ser conferida na evidência original.'
  };
  const problem = group.problems[0];
  if (problem) return reasons[problem] || 'O catálogo semântico exige uma decisão explícita antes de calcular.';
  if (group.publicationStatuses.includes('stale_publication')) {
    return 'Alias, contexto, unidade, operação e fórmula foram reconhecidos. A publicação ativa pertence a uma revisão anterior do rascunho.';
  }
  if (group.publicationStatuses.includes('draft')) {
    return 'Alias, contexto, unidade, operação e fórmula foram reconhecidos. O equipamento apenas aguarda publicação; isto não é uma pendência de classificação.';
  }
  return 'O efeito foi reconhecido pelo catálogo e a publicação ativa corresponde à mesma revisão do rascunho.';
}

function attributeAction(group) {
  const problem = group.problems[0];
  if (problem === 'pending_alias') return 'No painel semântico, vincule a frase a um atributo existente ou crie uma nova definição. Publique somente após validar contexto, unidade e operação.';
  if (problem === 'formula_unpublished') return 'Revise e publique a fórmula comprovada antes de permitir o cálculo.';
  if (problem === 'invalid_value' || problem === 'incomplete_source') return 'Abra o equipamento e confira o texto ou valor na imagem original. Não complete nem estime dados por aproximação.';
  if (problem) return 'Revise a incompatibilidade específica no catálogo semântico. A Central antiga não pode sobrescrever esta classificação.';
  if (group.publicationStatuses.includes('stale_publication')) return 'Publique explicitamente a revisão atual depois de conferir a prévia. A publicação anterior continuará ativa até lá.';
  if (group.publicationStatuses.includes('draft')) return 'Nenhuma correção semântica é necessária. Publique o equipamento quando a revisão estiver pronta.';
  return 'Nenhuma ação é necessária.';
}

function occurrenceLine(row) {
  const url = new URL('./equipment-editor.html', location.href);
  url.searchParams.set('id', row.equipmentId);
  url.searchParams.set('tab', 'rarities');

  return `
    <div class="audit-occurrence">
      <div>
        <strong>${escapeHtml(row.equipmentName)}</strong>
        <small>${escapeHtml(row.rarityName)} · valor cadastrado: ${escapeHtml(row.value)} · ${escapeHtml(row.publicationStatus || 'draft')}</small>
      </div>
      <a class="admin-button" href="${escapeHtml(url.href)}">Abrir equipamento</a>
    </div>`;
}

function renderAttributeCard(group) {
  const works = !group.problems.length;
  const target = group.rule?.recognized
    ? `${group.rule.label || group.rule.target} · ${group.rule.operation === 'percent' ? 'percentual sobre a base' : 'soma absoluta'}`
    : 'Sem destino matemático definido';

  return `
    <article class="audit-item ${group.status === 'bad' ? 'bad' : 'ok'}">
      <div class="audit-item-head">
        <div>
          <div class="audit-kicker">REGRA DE ATRIBUTO</div>
          <h3>${escapeHtml(group.label)}</h3>
          <p>${group.equipmentCount} equipamento(s) · ${group.rarityCount} raridade(s) · ${group.occurrenceCount} ocorrência(s)</p>
        </div>
        ${attributeStatus(group)}
      </div>

      <div class="audit-answer-grid">
        <div class="audit-answer">
          <small>O QUE ENCONTRAMOS?</small>
          <strong>${escapeHtml(group.label)}</strong>
          <span>Esta mesma regra aparece ${group.occurrenceCount} vez(es) nos cadastros.</span>
        </div>
        <div class="audit-answer">
          <small>ESTÁ FUNCIONANDO?</small>
          <strong>${works ? 'Reconhecimento semântico concluído.' : 'Exige decisão.'}</strong>
          <span>${works ? 'O estado de publicação é acompanhado separadamente e não altera esta classificação.' : 'Somente este efeito permanece pendente; os demais continuam calculáveis.'}</span>
        </div>
        <div class="audit-answer full">
          <small>POR QUÊ?</small>
          <span>${escapeHtml(attributeReason(group))}</span>
        </div>
        <div class="audit-answer full">
          <small>O QUE PRECISO FAZER?</small>
          <span>${escapeHtml(attributeAction(group))}</span>
        </div>
      </div>

      <details class="audit-technical">
        <summary>Detalhes técnicos e onde esta regra aparece</summary>
        <div class="audit-technical-body">
          <div class="audit-tech-row"><span>Chave cadastrada</span><code>${escapeHtml(group.key)}</code></div>
          <div class="audit-tech-row"><span>Assinatura semântica</span><code>${escapeHtml(group.id)}</code></div>
          <div class="audit-tech-row"><span>Status de resolução</span><code>${escapeHtml(group.resolutionStatuses.join(' | ') || 'resolved')}</code></div>
          <div class="audit-tech-row"><span>Estado de publicação</span><code>${escapeHtml(group.publicationStatuses.join(' | ') || 'draft')}</code></div>
          <div class="audit-tech-row"><span>Destino reconhecido</span><code>${escapeHtml(target)}</code></div>
          <div class="audit-tech-row"><span>Origem da correspondência</span><code>${escapeHtml(group.rule?.source || 'sem regra')}</code></div>
          <div class="audit-occurrences">${group.occurrences.map(occurrenceLine).join('')}</div>
        </div>
      </details>
    </article>`;
}

function proposalEffects(proposal = {}) {
  return Object.entries(proposal).map(([key, rawValue]) => {
    const rule = resolveEquipmentRule(key);
    const n = Number(rawValue);
    const sign = n > 0 ? '+' : '';
    const unit = rule.operation === 'percent' ? '%' : '';
    return {
      key,
      value: rawValue,
      label: rule.target ? targetLabel(rule.target) : humanizeAttributeKey(key),
      operation: rule.operation === 'percent' ? 'percentual sequencial' : 'soma direta',
      display: `${sign}${rawValue}${unit}`
    };
  });
}

function bonusStatus(row) {
  if (row.mode === 'external-data') return badge('Aguardando dado oficial — não é erro', 'warn');
  if (row.mode === 'informational') return badge('Somente descrição — não altera números', 'info');
  if (row.mode === 'structured') {
    return row.issues.length
      ? badge('Regra cadastrada, mas com problema', 'bad')
      : badge('Funcionando corretamente', 'ok');
  }
  if (row.safe && row.externalClaims?.length) return badge('Parte calculável pronta · dado oficial pendente', 'warn');
  if (row.safe) return badge('Pode ser atualizado', 'warn');
  return badge('Precisa de decisão', 'bad');
}

function bonusExplanation(row) {
  if (row.mode === 'external-data') {
    return 'Os efeitos deste marco são reais e estão preservados, mas dependem de dados-base que o jogo não disponibiliza publicamente. Isso não é erro de cadastro e nenhum valor é estimado.';
  }
  if (row.mode === 'informational') {
    return 'Este bônus foi definido como efeito especial/informativo. Ele pode aparecer na interface, mas não altera números da build.';
  }
  if (row.mode === 'structured' && !row.issues.length) {
    return 'A descrição e a regra matemática já estão separadas. O motor recebe os dados estruturados necessários para aplicar o bônus.';
  }
  if (row.mode === 'structured' && row.issues.length) {
    return 'Existe uma regra matemática salva, mas pelo menos uma parte dela não é reconhecida pelo motor atual. Não altere sem revisar os detalhes.';
  }
  if (row.safe && row.externalClaims?.length) {
    return 'A auditoria separou os efeitos calculáveis dos efeitos que aguardam dados oficiais. Somente a parte calculável será registrada; os demais efeitos continuarão visíveis e fora do cálculo sem serem tratados como erro.';
  }
  if (row.safe) {
    return 'O bônus antigo existe como texto. A auditoria entendeu todos os efeitos numéricos novos deste marco e consegue registrar a regra matemática sem alterar a descrição.';
  }
  return 'O bônus antigo possui uma parte ambígua ou ainda não reconhecida. A auditoria não irá adivinhar o cálculo; esta situação precisa de revisão manual.';
}

function bonusAction(row) {
  if (row.mode === 'external-data') return 'Nenhuma correção é necessária. Aguarde uma fonte oficial confiável; quando ela existir, reabra a classificação e cadastre a base e a regra reais.';
  if (row.mode === 'informational' || (row.mode === 'structured' && !row.issues.length)) return 'Nenhuma ação é necessária.';
  if (row.safe && row.externalClaims?.length) return 'Revise o quadro “Hoje → Depois”. Se a parte calculável estiver correta, registre somente essa parte. Os efeitos aguardando dados oficiais serão preservados e não serão convertidos em cálculo.';
  if (row.safe) return 'Revise o quadro “Hoje → Depois”. Se o significado estiver correto, use “Registrar regra de cálculo”.';
  return 'Leia o aviso do cartão e confirme no jogo o significado do efeito. Depois ajuste o cadastro ou a regra oficial; não force uma conversão automática.';
}

function explanationFromClaims(row) {
  const claims = row.claims || [];
  if (!claims.length) return 'Nenhum efeito numérico pôde ser separado da descrição.';
  return claims.map(claim => {
    if (claim.externalData) {
      return `“${claim.phrase}” → ${claim.externalData.label || claim.phrase} (aguardando dado oficial)`;
    }
    if (claim.rule?.recognized) {
      const label = claim.rule?.target ? targetLabel(claim.rule.target) : claim.phrase;
      return `“${claim.phrase}” → ${label}${claim.percent ? ' (%)' : ''}`;
    }
    return `“${claim.phrase}” → ainda sem classificação segura`;
  }).join(' · ');
}

function renderExternalClaims(row) {
  const claims = row.externalClaims || [];
  if (!claims.length) return '';
  return `
    <div class="audit-flow-card" style="margin-top:10px;border-color:#76591c;background:rgba(120,83,8,.08)">
      <small>EFEITOS PRESERVADOS FORA DO CÁLCULO</small>
      <strong>Estes efeitos não são erro e não serão convertidos em números sem uma base oficial.</strong>
      <div class="audit-effect-list">${claims.map(claim => `
        <div class="audit-effect"><span>${escapeHtml(claim.externalData?.label || claim.phrase)}</span><b>Aguardando dado oficial</b></div>`).join('')}</div>
      ${claims.map(claim => `<span><b>O que falta:</b> ${escapeHtml(claim.externalData?.missingData || 'Valor-base oficial e regra exata de aplicação.')}</span>`).join('')}
    </div>`;
}

function renderBonusCard(row) {
  const effects = proposalEffects(row.proposal || {});
  const technicalProposal = row.proposal ? JSON.stringify(row.proposal, null, 2) : '—';
  const issueHtml = row.issues?.length
    ? `<div class="audit-answer full"><small>O QUE IMPEDE A ATUALIZAÇÃO?</small><span>${row.issues.map(escapeHtml).join(' · ')}</span></div>`
    : '';

  const beforeAfter = row.safe ? `
    <div class="audit-flow">
      <div class="audit-flow-card">
        <small>HOJE</small>
        <strong>A descrição existe, mas este marco ainda não tem toda a parte calculável registrada de forma estruturada.</strong>
        <span>${escapeHtml(row.description || 'Sem descrição.')}</span>
      </div>
      <div class="audit-flow-arrow">→</div>
      <div class="audit-flow-card">
        <small>DEPOIS DE REGISTRAR</small>
        <strong>O motor passará a receber somente os efeitos calculáveis novos deste marco.</strong>
        <div class="audit-effect-list">${effects.map(effect => `
          <div class="audit-effect"><span>${escapeHtml(effect.label)}</span><b>${escapeHtml(effect.display)}</b></div>`).join('')}</div>
        <span>${effects.map(effect => escapeHtml(`Cálculo: ${effect.operation}`)).join(' · ')}</span>
      </div>
    </div>
    <div class="audit-preserve">
      <div><small>SERÁ MANTIDO</small><span>Nome, descrição, conjunto, quantidade de peças, demais bônus e qualquer efeito marcado como “Aguardando dado oficial”.</span></div>
      <div><small>SERÁ ALTERADO</small><span>Somente a regra matemática calculável usada pelo motor para este marco.</span></div>
    </div>` : '';

  const actions = row.safe ? `
    <div class="audit-item-actions">
      <button class="admin-button audit-primary register-rule" type="button" data-id="${escapeHtml(row.id)}">${row.externalClaims?.length ? 'Registrar somente a parte calculável' : 'Registrar regra de cálculo'}</button>
    </div>` : '';

  const cardClass = row.mode === 'external-data'
    ? 'warn external-data'
    : row.mode === 'structured' && !row.issues.length
      ? 'ok'
      : row.safe
        ? 'warn'
        : row.mode === 'informational'
          ? 'ok'
          : 'bad';
  const externalCount = row.externalClaims?.length || 0;

  return `
    <article class="audit-item ${cardClass}"${externalCount ? ` data-external-data-count="${externalCount}"` : ''}>
      <div class="audit-item-head">
        <div>
          <div class="audit-kicker">${escapeHtml(row.setName)}</div>
          <h3>${escapeHtml(row.required_pieces)} peças${row.title ? ` · ${escapeHtml(row.title)}` : ''}</h3>
          <p>${escapeHtml(row.description || 'Sem descrição.')}</p>
        </div>
        ${bonusStatus(row)}
      </div>

      <div class="audit-answer-grid">
        <div class="audit-answer">
          <small>O QUE ENCONTRAMOS?</small>
          <strong>${row.mode === 'external-data' ? 'Efeito real que depende de dado oficial.' : row.mode === 'legacy' ? 'Um bônus antigo baseado principalmente em descrição.' : row.mode === 'structured' ? 'Um bônus com regra matemática cadastrada.' : 'Um efeito informativo.'}</strong>
        </div>
        <div class="audit-answer">
          <small>ESTÁ FUNCIONANDO?</small>
          <strong>${row.mode === 'external-data' ? 'Registrado, mas sem cálculo final.' : row.mode === 'structured' && !row.issues.length ? 'Sim.' : row.mode === 'informational' ? 'Sim, como informação.' : row.safe ? 'A descrição existe; falta registrar a parte calculável.' : 'Ainda não é seguro afirmar.'}</strong>
        </div>
        <div class="audit-answer full"><small>POR QUÊ?</small><span>${escapeHtml(bonusExplanation(row))}</span></div>
        <div class="audit-answer full"><small>O QUE A AUDITORIA ENTENDEU?</small><span>${escapeHtml(explanationFromClaims(row))}</span></div>
        ${issueHtml}
        <div class="audit-answer full"><small>O QUE PRECISO FAZER?</small><span>${escapeHtml(bonusAction(row))}</span></div>
      </div>

      ${renderExternalClaims(row)}
      ${beforeAfter}
      ${actions}

      <details class="audit-technical">
        <summary>Detalhes para desenvolvedores</summary>
        <div class="audit-technical-body">
          <div class="audit-tech-row"><span>ID do bônus</span><code>${escapeHtml(row.id)}</code></div>
          <div class="audit-tech-row"><span>Modo interno</span><code>${escapeHtml(row.mode)}</code></div>
          <div class="audit-tech-row"><span>Regra proposta</span><code>${escapeHtml(technicalProposal)}</code></div>
          <div class="audit-tech-row"><span>Efeitos aguardando dado oficial</span><code>${escapeHtml((row.externalClaims || []).map(claim => claim.externalData?.label || claim.phrase).join(' | ') || 'Nenhum')}</code></div>
          <div class="audit-tech-row"><span>Observações técnicas</span><code>${escapeHtml((row.issues || []).join(' | ') || 'Nenhuma')}</code></div>
        </div>
      </details>
    </article>`;
}

function renderSummary() {
  const attributeBlocked = state.attributeGroups.filter(group => group.problems.length).length;
  const attributeHealthy = state.attributeGroups.filter(group => !group.problems.length).length;
  const bonusLegacy = state.bonuses.filter(row => row.mode === 'legacy').length;
  const bonusProblem = state.bonuses.filter(row => row.mode === 'structured' && row.issues.length).length;
  const bonusExternal = state.bonuses.filter(row => row.mode === 'external-data').length;
  const needsAttention = attributeBlocked + bonusLegacy + bonusProblem;

  $('sum-working').textContent = attributeHealthy + state.bonuses.filter(row => row.mode === 'structured' && !row.issues.length).length + state.bonuses.filter(row => row.mode === 'informational').length;
  $('sum-attention').textContent = needsAttention;
  $('sum-not-calculated').textContent = attributeBlocked + bonusProblem;
  $('sum-old-bonuses').textContent = bonusLegacy;
  if ($('sum-external-data')) {
    const bonusExternalEffects = state.bonuses.reduce((sum, row) => sum + Number(row.externalClaims?.length || 0), 0);
    $('sum-external-data').dataset.bonusExternalCount = String(bonusExternalEffects || bonusExternal);
  }
}

function renderSemanticInfrastructure() {
  if (!state.semanticInfrastructure) return '';
  return `
    <article class="audit-item bad">
      <div class="audit-item-head">
        <div>
          <div class="audit-kicker">INFRAESTRUTURA DO CÁLCULO V2</div>
          <h3>Catálogo semântico indisponível ou incompatível neste ambiente</h3>
          <p>A auditoria não converteu esta falha em pendências de equipamentos.</p>
        </div>
        ${badge('Ambiente incompatível', 'bad')}
      </div>
      <div class="audit-answer-grid">
        <div class="audit-answer full">
          <small>O QUE PRECISO FAZER?</small>
          <span>Aplicar, em ordem, as migrations progressivas e RPCs do catálogo semântico. Depois, recarregar a auditoria.</span>
        </div>
        ${state.semanticInfrastructure.error ? `<div class="audit-answer full"><small>DETALHE TÉCNICO</small><code>${escapeHtml(state.semanticInfrastructure.error)}</code></div>` : ''}
      </div>
    </article>`;
}

function renderPending() {
  const host = $('pending-results');
  const attributeProblems = state.attributeGroups.filter(group => group.problems.length);
  const bonusPending = state.bonuses.filter(row =>
    row.mode === 'legacy' || row.mode === 'external-data' || (row.mode === 'structured' && row.issues.length)
  );

  const infrastructure = renderSemanticInfrastructure();
  if (!infrastructure && !attributeProblems.length && !bonusPending.length) {
    host.innerHTML = '<div class="audit-empty">Nenhuma pendência de reconhecimento encontrada. Os estados de rascunho, publicação e revisão continuam visíveis separadamente.</div>';
    return;
  }

  host.innerHTML = [
    infrastructure,
    ...attributeProblems.map(renderAttributeCard),
    ...bonusPending.map(renderBonusCard)
  ].join('');

  host.querySelectorAll('.register-rule').forEach(button => {
    button.addEventListener('click', () => openConfirm(button.dataset.id));
  });
}

function renderHealthy() {
  const host = $('healthy-results');
  const attributeHealthy = state.attributeGroups.filter(group => !group.problems.length);
  const bonusHealthy = state.bonuses.filter(row => row.mode === 'informational' || (row.mode === 'structured' && !row.issues.length));

  if (!attributeHealthy.length && !bonusHealthy.length) {
    host.innerHTML = '<div class="audit-empty">Ainda não há regras reconhecidas ou efeitos informativos nesta leitura.</div>';
    return;
  }

  host.innerHTML = [
    ...attributeHealthy.map(renderAttributeCard),
    ...bonusHealthy.map(renderBonusCard)
  ].join('');
}

function setMessage(text, type = '') {
  const node = $('audit-message');
  if (!node) return;
  node.textContent = text;
  node.className = `audit-message ${type}`.trim();
}

function setLoading(value) {
  state.loading = value;
  $('audit-page')?.classList.toggle('audit-loading', value);
  if ($('audit-reload')) $('audit-reload').disabled = value;
}

function switchView(view) {
  document.querySelectorAll('[data-audit-view]').forEach(panel => {
    panel.hidden = panel.dataset.auditView !== view;
  });
  document.querySelectorAll('[data-audit-tab]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.auditTab === view);
  });
}

function renderHistory() {
  const host = $('session-history');
  if (!host) return;
  if (!state.sessionHistory.length) {
    host.innerHTML = '<div class="audit-empty">Nenhuma regra foi alterada nesta sessão.</div>';
    return;
  }

  host.innerHTML = state.sessionHistory.map((entry, index) => `
    <div class="audit-history-entry">
      <div>
        <strong>${escapeHtml(entry.setName)} · ${escapeHtml(entry.pieces)} peças</strong>
        <small>${escapeHtml(entry.time)} · regra de cálculo registrada nesta sessão</small>
      </div>
      ${index === 0 && !entry.undone ? `<button class="admin-button undo-session-change" type="button" data-index="${index}">Desfazer esta alteração</button>` : entry.undone ? '<span class="audit-status info">Desfeita</span>' : ''}
    </div>`).join('');

  host.querySelectorAll('.undo-session-change').forEach(button => {
    button.addEventListener('click', () => undoSessionChange(Number(button.dataset.index)));
  });
}

function openConfirm(id) {
  const row = state.bonuses.find(item => String(item.id) === String(id));
  const proposal = state.proposals.get(String(id));
  if (!row || !proposal) return;
  const effects = proposalEffects(proposal);

  $('confirm-title').textContent = `${row.setName} · ${row.required_pieces} peças`;
  $('confirm-body').innerHTML = `
    <div class="audit-confirm-box"><small>O QUE SERÁ REGISTRADO</small>${effects.map(effect => `<strong>${escapeHtml(effect.label)}: ${escapeHtml(effect.display)}</strong><span>${escapeHtml(effect.operation)}</span>`).join('')}</div>
    <div class="audit-confirm-box"><small>O QUE NÃO SERÁ ALTERADO</small><span>Descrição, nome do bônus, conjunto, quantidade de peças, equipamentos, raridades e efeitos que aguardam dados oficiais.</span></div>
    ${row.externalClaims?.length ? `<div class="audit-confirm-box"><small>EFEITOS QUE CONTINUARÃO FORA DO CÁLCULO</small><span>${escapeHtml(row.externalClaims.map(claim => claim.externalData?.label || claim.phrase).join(' · '))}. Nenhuma base será criada ou estimada.</span></div>` : ''}
    <div class="audit-confirm-box"><small>POR QUE A AUDITORIA CONSIDERA SEGURO</small><span>${escapeHtml(explanationFromClaims(row))}</span></div>
    <details class="audit-technical"><summary>Ver dados técnicos que serão gravados</summary><div class="audit-technical-body"><div class="audit-tech-row"><span>stats</span><code>${escapeHtml(JSON.stringify(proposal, null, 2))}</code></div></div></details>`;

  $('confirm-apply').dataset.id = String(id);
  $('audit-confirm-modal').classList.add('is-open');
}

function closeConfirm() {
  $('audit-confirm-modal')?.classList.remove('is-open');
  if ($('confirm-apply')) delete $('confirm-apply').dataset.id;
}

async function writeProposal(row, proposal) {
  const beforeStats = row.stats ?? null;
  const { data, error } = await supabase
    .from('equipment_set_bonuses')
    .update({ stats: proposal })
    .eq('id', row.id)
    .select('id,stats')
    .single();
  if (error) throw error;
  return { data, beforeStats };
}

async function applyConfirmed() {
  const id = $('confirm-apply')?.dataset.id;
  const row = state.bonuses.find(item => String(item.id) === String(id));
  const proposal = state.proposals.get(String(id));
  if (!row || !proposal || state.loading) return;

  closeConfirm();
  try {
    setLoading(true);
    setMessage('Registrando somente a parte calculável sem alterar a descrição nem os efeitos dependentes de dados oficiais...');
    const { beforeStats } = await writeProposal(row, proposal);
    state.sessionHistory.unshift({
      id: row.id,
      setName: row.setName,
      pieces: row.required_pieces,
      beforeStats,
      afterStats: proposal,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      undone: false
    });
    await runAudit({ preserveMessage: true });
    renderHistory();
    setMessage('Regra calculável registrada. A descrição e os efeitos aguardando dados oficiais foram preservados.', 'ok');
  } catch (error) {
    setMessage(`Não foi possível registrar a regra: ${error.message || error}`, 'error');
  } finally {
    setLoading(false);
  }
}

async function undoSessionChange(index) {
  const entry = state.sessionHistory[index];
  if (!entry || entry.undone || state.loading) return;

  const confirmed = await showAdminDecisionModal({
    kicker: 'DESFAZER ALTERAÇÃO',
    title: 'Restaurar a regra anterior?',
    message: 'A última regra registrada nesta sessão será substituída pelo valor que existia antes da alteração.',
    detail: 'Descrição, conjunto, equipamentos e raridades não serão alterados.',
    confirmLabel: 'Desfazer alteração',
    cancelLabel: 'Manter como está'
  });
  if (!confirmed) return;

  try {
    setLoading(true);
    setMessage('Restaurando a regra anterior...');
    const { error } = await supabase
      .from('equipment_set_bonuses')
      .update({ stats: entry.beforeStats })
      .eq('id', entry.id);
    if (error) throw error;
    entry.undone = true;
    await runAudit({ preserveMessage: true });
    renderHistory();
    setMessage('Alteração desta sessão desfeita e regra anterior restaurada.', 'ok');
  } catch (error) {
    setMessage(`Não foi possível desfazer: ${error.message || error}`, 'error');
  } finally {
    setLoading(false);
  }
}

function normalizeClassificationRows(rows = []) {
  return rows.map(row => ({
    active: row.active,
    classification: row.classification,
    raw_label: row.rawLabel,
    display_label: row.label,
    reason: row.reason,
    missing_data: row.missingData,
    public_note: row.publicNote
  }));
}

async function runAudit({ preserveMessage = false } = {}) {
  try {
    setLoading(true);
    if (!preserveMessage) setMessage('Lendo os dados cadastrados e conferindo as regras no motor oficial...');

    const [data, classificationResult] = await Promise.all([
      loadData(),
      refreshEquipmentAttributeClassifications()
    ]);
    const setsById = new Map(data.sets.map(item => [item.id, item]));
    state.semanticInfrastructure = data.semanticCoverage?.compatible
      ? null
      : {
        message: 'Catálogo semântico indisponível ou incompatível neste ambiente',
        error: data.semanticCoverage?.error || ''
      };
    state.externalClassifications = normalizeClassificationRows(classificationResult.rows || []);
    const bonusAudit = buildBonusMigrationAudit(data.bonuses, setsById, state.externalClassifications);

    state.attributes = buildAttributeAudit(data);
    state.attributeGroups = groupAttributeRows(state.attributes);
    state.bonuses = bonusAudit.rows;
    state.proposals = bonusAudit.proposals;

    renderSummary();
    renderPending();
    renderHealthy();
    renderHistory();

    const attributeProblems = state.attributeGroups.filter(group => group.problems.length).length;
    const bonusProblems = state.bonuses.filter(row => row.mode === 'legacy' || (row.mode === 'structured' && row.issues.length)).length;
    const awaitingOfficial = state.bonuses.reduce((sum, row) => sum + Number(row.externalClaims?.length || 0), 0);

    if (!preserveMessage) {
      const parts = [];
      if (state.semanticInfrastructure) parts.push('catálogo semântico incompatível; nenhuma pendência de conteúdo foi inferida');
      if (attributeProblems) parts.push(`${attributeProblems} regra(s) de atributo exigem revisão`);
      if (bonusProblems) parts.push(`${bonusProblems} bônus pedem atenção`);
      if (awaitingOfficial) parts.push(`${awaitingOfficial} efeito(s) aguardam dados oficiais e não contam como erro`);
      setMessage(
        parts.length
          ? `Auditoria concluída: ${parts.join(' · ')}.`
          : 'Auditoria semântica concluída. Alias, contexto, unidade, operação, fórmula e publicação foram conferidos pela mesma autoridade.',
        state.semanticInfrastructure || attributeProblems || bonusProblems ? '' : 'ok'
      );
    }
  } catch (error) {
    console.error('[equipment-audit-v4]', error);
    setMessage(`Não foi possível concluir a auditoria: ${error.message || error}`, 'error');
  } finally {
    setLoading(false);
  }
}

document.querySelectorAll('[data-audit-tab]').forEach(button => {
  button.addEventListener('click', () => switchView(button.dataset.auditTab));
});

$('start-pending')?.addEventListener('click', () => {
  switchView('pending');
  $('pending-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('audit-reload')?.addEventListener('click', () => runAudit());
$('confirm-cancel')?.addEventListener('click', closeConfirm);
$('confirm-apply')?.addEventListener('click', applyConfirmed);
$('audit-confirm-modal')?.addEventListener('click', event => {
  if (event.target === $('audit-confirm-modal')) closeConfirm();
});

switchView('pending');
await runAudit();
