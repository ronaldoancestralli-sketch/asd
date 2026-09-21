import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';
import {
  buildBonusMigrationAudit,
  humanizeAttributeKey,
  normalizeAuditText,
  resolveEquipmentRule,
  targetLabel
} from '../../js/equipment-audit-rules.js?v=2';

const $ = id => document.getElementById(id);

const state = {
  attributes: [],
  attributeGroups: [],
  bonuses: [],
  proposals: new Map(),
  loading: false,
  sessionHistory: []
};

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function numberFrom(value) {
  const n = Number(String(value ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function normalizeVariantAttributes(attributes) {
  if (Array.isArray(attributes)) {
    return attributes
      .filter(item => String(item?.label || item?.raw || '').trim())
      .map(item => ({ key: String(item.label || item.raw).trim(), value: item.value }));
  }
  if (attributes && typeof attributes === 'object') {
    return Object.entries(attributes).map(([key, value]) => ({ key, value }));
  }
  return [];
}

async function loadData() {
  const [equipments, variants, rarities, sets, bonuses] = await Promise.all([
    supabase.from('equipments').select('id,name,set_id').order('name'),
    supabase.from('equipment_variants').select('equipment_id,rarity_id,attributes'),
    supabase.from('equipment_rarities').select('id,name,slug,rank').order('rank'),
    supabase.from('equipment_sets').select('id,name,slug').order('name'),
    supabase.from('equipment_set_bonuses').select('*').order('set_id').order('required_pieces')
  ]);

  const results = { equipments, variants, rarities, sets, bonuses };
  for (const [name, result] of Object.entries(results)) {
    if (result.error) throw new Error(`${name}: ${result.error.message || result.error}`);
  }

  return {
    equipments: equipments.data || [],
    variants: variants.data || [],
    rarities: rarities.data || [],
    sets: sets.data || [],
    bonuses: bonuses.data || []
  };
}

function buildAttributeAudit(data) {
  const equipmentById = new Map(data.equipments.map(item => [item.id, item]));
  const rarityById = new Map(data.rarities.map(item => [item.id, item]));
  const rows = [];

  for (const variant of data.variants) {
    const equipment = equipmentById.get(variant.equipment_id) || {};
    const rarity = rarityById.get(variant.rarity_id) || {};

    for (const attribute of normalizeVariantAttributes(variant.attributes)) {
      const numericValue = numberFrom(attribute.value);
      const rule = resolveEquipmentRule(attribute.key);
      const problems = [];

      if (numericValue === null) problems.push('invalid-value');
      if (!rule.recognized) problems.push('unknown-rule');

      rows.push({
        equipmentId: variant.equipment_id,
        equipmentName: equipment.name || 'Equipamento sem nome',
        rarityId: variant.rarity_id,
        rarityName: rarity.name || rarity.slug || 'Raridade',
        rarityRank: Number(rarity.rank ?? 999),
        key: attribute.key,
        value: attribute.value,
        numericValue,
        rule,
        problems
      });
    }
  }

  return rows;
}

function groupAttributeRows(rows) {
  const groups = new Map();

  for (const row of rows) {
    const groupKey = normalizeAuditText(row.key).replace(/\s+/g, '_') || String(row.key);
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
    const approximate = occurrences.some(item => /aproximada/i.test(item.rule?.source || ''));

    let status = 'ok';
    if (problems.length) status = 'bad';
    else if (approximate) status = 'info';

    return {
      id,
      key: first.key,
      label: humanizeAttributeKey(first.key),
      rule: first.rule,
      problems,
      status,
      approximate,
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
  if (group.problems.includes('unknown-rule')) return badge('Não está sendo calculado', 'bad');
  if (group.problems.includes('invalid-value')) return badge('Valor inválido', 'bad');
  if (group.approximate) return badge('Reconhecido automaticamente', 'info');
  return badge('Funcionando corretamente', 'ok');
}

function attributeReason(group) {
  if (group.problems.includes('unknown-rule')) {
    return 'O nome existe no cadastro, mas ainda não há uma regra oficial dizendo qual valor do herói ou da arma deve ser alterado.';
  }
  if (group.problems.includes('invalid-value')) {
    return 'O atributo possui um valor que não pode ser lido como número. Por segurança, ele não deve participar do cálculo.';
  }
  if (group.rule?.recognized) {
    const operation = group.rule.operation === 'percent'
      ? 'percentual sequencial sobre o valor atual'
      : 'soma direta';
    const source = group.approximate
      ? 'A escrita não é idêntica ao nome oficial, mas o catálogo encontrou uma correspondência segura.'
      : 'A regra foi encontrada no catálogo oficial.';
    return `${source} O efeito é aplicado em ${targetLabel(group.rule.target)} por ${operation}.`;
  }
  return 'A auditoria não conseguiu determinar o comportamento desta regra.';
}

function attributeAction(group) {
  if (group.problems.includes('unknown-rule')) {
    return 'Abra o equipamento e confirme o significado. Se for apenas outra escrita de uma regra existente, padronize o nome. Se for uma mecânica realmente nova, ela precisa de uma regra própria. Se não houver cálculo real, mantenha como efeito especial/informativo.';
  }
  if (group.problems.includes('invalid-value')) {
    return 'Abra o equipamento e corrija o valor somente se houver um número real no jogo. Não transforme texto em número por aproximação.';
  }
  if (group.approximate) {
    return 'Nenhuma correção é obrigatória. O cálculo já funciona; padronizar a escrita no cadastro é opcional e serve apenas para organização.';
  }
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
        <small>${escapeHtml(row.rarityName)} · valor cadastrado: ${escapeHtml(row.value)}</small>
      </div>
      <a class="admin-button" href="${escapeHtml(url.href)}">Abrir equipamento</a>
    </div>`;
}

function renderAttributeCard(group) {
  const works = !group.problems.length;
  const target = group.rule?.recognized
    ? `${targetLabel(group.rule.target)} · ${group.rule.operation === 'percent' ? 'percentual sequencial' : 'soma direta'}`
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
          <strong>${works ? 'Sim.' : 'Não completamente.'}</strong>
          <span>${works ? 'O motor consegue aplicar este efeito.' : 'Esta regra precisa de revisão antes de ser considerada confiável no cálculo.'}</span>
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
          <div class="audit-tech-row"><span>Destino reconhecido</span><code>${escapeHtml(target)}</code></div>
          <div class="audit-tech-row"><span>Origem da correspondência</span><code>${escapeHtml(group.rule?.source || 'sem regra')}</code></div>
          <div class="audit-tech-row"><span>Confiança</span><code>${escapeHtml(Math.round(Number(group.rule?.confidence || 0) * 100))}%</code></div>
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
  if (row.mode === 'informational') return badge('Somente descrição — não altera números', 'info');
  if (row.mode === 'structured') {
    return row.issues.length
      ? badge('Regra cadastrada, mas com problema', 'bad')
      : badge('Funcionando corretamente', 'ok');
  }
  if (row.safe) return badge('Pode ser atualizado', 'warn');
  return badge('Precisa de decisão', 'bad');
}

function bonusExplanation(row) {
  if (row.mode === 'informational') {
    return 'Este bônus foi definido como efeito especial/informativo. Ele pode aparecer na interface, mas não altera números da build.';
  }
  if (row.mode === 'structured' && !row.issues.length) {
    return 'A descrição e a regra matemática já estão separadas. O motor recebe os dados estruturados necessários para aplicar o bônus.';
  }
  if (row.mode === 'structured' && row.issues.length) {
    return 'Existe uma regra matemática salva, mas pelo menos uma parte dela não é reconhecida pelo motor atual. Não altere sem revisar os detalhes.';
  }
  if (row.safe) {
    return 'O bônus antigo existe como texto. A auditoria entendeu todos os efeitos numéricos novos deste marco e consegue registrar a regra matemática sem alterar a descrição.';
  }
  return 'O bônus antigo possui uma parte ambígua ou ainda não reconhecida. A auditoria não irá adivinhar o cálculo; esta situação precisa de revisão manual.';
}

function bonusAction(row) {
  if (row.mode === 'informational' || (row.mode === 'structured' && !row.issues.length)) return 'Nenhuma ação é necessária.';
  if (row.safe) return 'Revise o quadro “Hoje → Depois”. Se o significado estiver correto, use “Registrar regra de cálculo”.';
  return 'Leia o aviso do cartão e confirme no jogo o significado do efeito. Depois ajuste o cadastro ou a regra oficial; não force uma conversão automática.';
}

function explanationFromClaims(row) {
  const claims = row.claims || [];
  if (!claims.length) return 'Nenhum efeito numérico pôde ser separado da descrição.';
  const understood = claims.filter(claim => claim.rule?.recognized);
  if (!understood.length) return 'Os efeitos numéricos foram encontrados, mas nenhum possui correspondência segura no catálogo.';
  return understood.map(claim => {
    const label = claim.rule?.target ? targetLabel(claim.rule.target) : claim.phrase;
    return `“${claim.phrase}” → ${label}${claim.percent ? ' (%)' : ''}`;
  }).join(' · ');
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
        <strong>A descrição existe, mas este marco ainda não tem uma regra matemática própria registrada.</strong>
        <span>${escapeHtml(row.description || 'Sem descrição.')}</span>
      </div>
      <div class="audit-flow-arrow">→</div>
      <div class="audit-flow-card">
        <small>DEPOIS DE REGISTRAR</small>
        <strong>O motor passará a receber apenas os efeitos novos deste marco.</strong>
        <div class="audit-effect-list">${effects.map(effect => `
          <div class="audit-effect"><span>${escapeHtml(effect.label)}</span><b>${escapeHtml(effect.display)}</b></div>`).join('')}</div>
        <span>${effects.map(effect => escapeHtml(`Cálculo: ${effect.operation}`)).join(' · ')}</span>
      </div>
    </div>
    <div class="audit-preserve">
      <div><small>SERÁ MANTIDO</small><span>Nome, descrição, conjunto, quantidade de peças e demais bônus.</span></div>
      <div><small>SERÁ ALTERADO</small><span>Somente a regra matemática usada pelo motor para este marco.</span></div>
    </div>` : '';

  const actions = row.safe ? `
    <div class="audit-item-actions">
      <button class="admin-button audit-primary register-rule" type="button" data-id="${escapeHtml(row.id)}">Registrar regra de cálculo</button>
    </div>` : '';

  const cardClass = row.mode === 'structured' && !row.issues.length ? 'ok' : (row.safe ? 'warn' : (row.mode === 'informational' ? 'ok' : 'bad'));

  return `
    <article class="audit-item ${cardClass}">
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
          <strong>${row.mode === 'legacy' ? 'Um bônus antigo baseado principalmente em descrição.' : row.mode === 'structured' ? 'Um bônus com regra matemática cadastrada.' : 'Um efeito informativo.'}</strong>
        </div>
        <div class="audit-answer">
          <small>ESTÁ FUNCIONANDO?</small>
          <strong>${row.mode === 'structured' && !row.issues.length ? 'Sim.' : row.mode === 'informational' ? 'Sim, como informação.' : row.safe ? 'A descrição existe; falta registrar a regra matemática.' : 'Ainda não é seguro afirmar.'}</strong>
        </div>
        <div class="audit-answer full"><small>POR QUÊ?</small><span>${escapeHtml(bonusExplanation(row))}</span></div>
        <div class="audit-answer full"><small>O QUE A AUDITORIA ENTENDEU?</small><span>${escapeHtml(explanationFromClaims(row))}</span></div>
        ${issueHtml}
        <div class="audit-answer full"><small>O QUE PRECISO FAZER?</small><span>${escapeHtml(bonusAction(row))}</span></div>
      </div>

      ${beforeAfter}
      ${actions}

      <details class="audit-technical">
        <summary>Detalhes para desenvolvedores</summary>
        <div class="audit-technical-body">
          <div class="audit-tech-row"><span>ID do bônus</span><code>${escapeHtml(row.id)}</code></div>
          <div class="audit-tech-row"><span>Modo interno</span><code>${escapeHtml(row.mode)}</code></div>
          <div class="audit-tech-row"><span>Regra proposta</span><code>${escapeHtml(technicalProposal)}</code></div>
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
  const needsAttention = attributeBlocked + bonusLegacy + bonusProblem;

  $('sum-working').textContent = attributeHealthy + state.bonuses.filter(row => row.mode === 'structured' && !row.issues.length).length + state.bonuses.filter(row => row.mode === 'informational').length;
  $('sum-attention').textContent = needsAttention;
  $('sum-not-calculated').textContent = attributeBlocked + bonusProblem;
  $('sum-old-bonuses').textContent = bonusLegacy;
}

function renderPending() {
  const host = $('pending-results');
  const attributeProblems = state.attributeGroups.filter(group => group.problems.length);
  const bonusProblems = state.bonuses.filter(row => row.mode === 'legacy' || (row.mode === 'structured' && row.issues.length));

  if (!attributeProblems.length && !bonusProblems.length) {
    host.innerHTML = '<div class="audit-empty">Nenhuma pendência encontrada. Os dados auditados estão utilizáveis pelo motor.</div>';
    return;
  }

  host.innerHTML = [
    ...attributeProblems.map(renderAttributeCard),
    ...bonusProblems.map(renderBonusCard)
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
    host.innerHTML = '<div class="audit-empty">Ainda não há itens classificados como funcionando corretamente.</div>';
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
    <div class="audit-confirm-box"><small>O QUE NÃO SERÁ ALTERADO</small><span>Descrição, nome do bônus, conjunto, quantidade de peças, equipamentos e raridades.</span></div>
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
    setMessage('Registrando a regra matemática sem alterar a descrição...');
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
    setMessage('Regra registrada. A descrição foi preservada e a auditoria foi atualizada.', 'ok');
  } catch (error) {
    setMessage(`Não foi possível registrar a regra: ${error.message || error}`, 'error');
  } finally {
    setLoading(false);
  }
}

async function undoSessionChange(index) {
  const entry = state.sessionHistory[index];
  if (!entry || entry.undone || state.loading) return;
  const confirmed = window.confirm('Desfazer a última alteração feita nesta sessão e restaurar a regra anterior?');
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

async function runAudit({ preserveMessage = false } = {}) {
  try {
    setLoading(true);
    if (!preserveMessage) setMessage('Lendo os dados cadastrados e conferindo as regras no motor oficial...');

    const data = await loadData();
    const setsById = new Map(data.sets.map(item => [item.id, item]));
    const bonusAudit = buildBonusMigrationAudit(data.bonuses, setsById);

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

    if (!preserveMessage) {
      setMessage(
        attributeProblems || bonusProblems
          ? `Auditoria concluída: ${attributeProblems} regra(s) de atributo e ${bonusProblems} bônus pedem atenção. Comece pela aba Pendências.`
          : 'Auditoria concluída: nenhum problema de cálculo foi encontrado.',
        attributeProblems || bonusProblems ? '' : 'ok'
      );
    }
  } catch (error) {
    console.error('[equipment-audit-v3]', error);
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
