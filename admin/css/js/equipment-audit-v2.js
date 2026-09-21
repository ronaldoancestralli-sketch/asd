import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';
import {
  buildBonusMigrationAudit,
  humanizeAttributeKey,
  normalizeAuditText,
  resolveEquipmentRule,
  targetLabel
} from '../../js/equipment-audit-rules.js?v=1';

/*
 * Auditoria administrativa v2.
 * - agrupa problemas por REGRA, não por ocorrência/raridade;
 * - explica impacto e recomendação em linguagem legível;
 * - mantém detalhes técnicos recolhidos;
 * - usa o próprio game-stat-engine para decidir se uma chave é reconhecida;
 * - bloqueia migração de bônus cumulativos ambíguos.
 */

const $ = id => document.getElementById(id);

const state = {
  attributes: [],
  attributeGroups: [],
  bonuses: [],
  proposals: new Map(),
  loading: false
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
      .map(item => ({
        key: String(item.label || item.raw).trim(),
        value: item.value
      }));
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
      const issues = [];

      if (numericValue === null) issues.push('Valor não numérico');
      if (!rule.recognized) issues.push('Chave sem regra no motor');

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
        issues
      });
    }
  }

  return rows;
}

function severityForRows(rows) {
  if (rows.some(row => row.issues.includes('Chave sem regra no motor'))) return 'blocker';
  if (rows.some(row => row.issues.includes('Valor não numérico'))) return 'blocker';
  if (rows.some(row => row.issues.length)) return 'attention';
  return 'ok';
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
      a.equipmentName.localeCompare(b.equipmentName, 'pt-BR') ||
      a.rarityRank - b.rarityRank
    );

    const first = occurrences[0];
    const issues = [...new Set(occurrences.flatMap(item => item.issues))];
    const equipmentIds = new Set(occurrences.map(item => item.equipmentId));
    const rarityNames = new Set(occurrences.map(item => item.rarityName));
    const severity = severityForRows(occurrences);

    return {
      id,
      key: first.key,
      label: humanizeAttributeKey(first.key),
      rule: first.rule,
      issues,
      severity,
      occurrences,
      occurrenceCount: occurrences.length,
      equipmentCount: equipmentIds.size,
      rarityCount: rarityNames.size
    };
  }).sort((a, b) => {
    const weight = { blocker: 0, attention: 1, ok: 2 };
    return weight[a.severity] - weight[b.severity] || a.label.localeCompare(b.label, 'pt-BR');
  });
}

function badge(label, type) {
  return `<span class="audit-status ${type}">${escapeHtml(label)}</span>`;
}

function severityBadge(group) {
  if (group.severity === 'blocker') return badge('Bloqueador de cálculo', 'bad');
  if (group.severity === 'attention') return badge('Atenção', 'warn');
  return badge('OK', 'ok');
}

function impactText(group) {
  if (group.issues.includes('Chave sem regra no motor')) {
    return 'O valor existe no banco, mas hoje não altera nenhum atributo numérico da build porque o motor não possui um destino definido para esta regra.';
  }

  if (group.issues.includes('Valor não numérico')) {
    return 'O valor cadastrado não pode ser convertido com segurança para número e, por isso, não deve participar do cálculo.';
  }

  if (group.rule.recognized) {
    const operation = group.rule.operation === 'percent'
      ? 'percentual sequencial sobre o valor atual'
      : 'soma direta';
    return `O motor direciona esta regra para ${targetLabel(group.rule.target)}, usando ${operation}.`;
  }

  return 'Revisão necessária antes de usar esta regra em cálculos.';
}

function recommendationText(group) {
  if (group.issues.includes('Chave sem regra no motor')) {
    return 'Preserve a peculiaridade do equipamento. Crie uma regra própria somente quando houver correspondência real com um dado-base do jogo; não associe automaticamente a outro atributo apenas pelo nome.';
  }

  if (group.issues.includes('Valor não numérico')) {
    return 'Corrija o valor no cadastro somente se o jogo fornecer um número real. Se for texto/efeito especial, mantenha-o fora do cálculo numérico.';
  }

  return 'Nenhuma correção matemática é necessária para esta regra.';
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

function renderAttributeGroups() {
  const filter = $('attribute-filter')?.value || 'issues';
  const groups = filter === 'all'
    ? state.attributeGroups
    : state.attributeGroups.filter(group => group.severity !== 'ok');

  const host = $('attribute-results');
  if (!groups.length) {
    host.innerHTML = `<div class="audit-empty">${
      filter === 'issues'
        ? 'Nenhuma regra de atributo precisa de revisão.'
        : 'Nenhuma regra de atributo foi encontrada.'
    }</div>`;
    return;
  }

  host.innerHTML = groups.map(group => {
    const target = group.rule.recognized
      ? `${targetLabel(group.rule.target)} · ${group.rule.operation === 'percent' ? 'percentual sequencial' : 'soma direta'}`
      : 'Sem destino matemático definido';

    return `
      <article class="audit-rule-card ${group.severity}">
        <div class="audit-rule-head">
          <div>
            <div class="audit-rule-kicker">REGRA ÚNICA</div>
            <h3>${escapeHtml(group.label)}</h3>
            <p>${group.equipmentCount} equipamento(s) · ${group.rarityCount} raridade(s) · ${group.occurrenceCount} ocorrência(s)</p>
          </div>
          ${severityBadge(group)}
        </div>

        <div class="audit-rule-grid">
          <div class="audit-explain">
            <small>SITUAÇÃO</small>
            <strong>${escapeHtml(group.issues.length ? group.issues.join(' · ') : 'Regra reconhecida pelo motor')}</strong>
          </div>
          <div class="audit-explain">
            <small>IMPACTO ATUAL</small>
            <span>${escapeHtml(impactText(group))}</span>
          </div>
          <div class="audit-explain recommendation">
            <small>AÇÃO RECOMENDADA</small>
            <span>${escapeHtml(recommendationText(group))}</span>
          </div>
        </div>

        <details class="audit-technical">
          <summary>Detalhes técnicos e ocorrências</summary>
          <div class="audit-technical-body">
            <div class="audit-tech-row"><span>Chave cadastrada</span><code>${escapeHtml(group.key)}</code></div>
            <div class="audit-tech-row"><span>Destino no motor</span><code>${escapeHtml(target)}</code></div>
            <div class="audit-occurrences">${group.occurrences.map(occurrenceLine).join('')}</div>
          </div>
        </details>
      </article>`;
  }).join('');
}

function statsSummary(entries) {
  if (!entries?.length) return '—';
  return entries
    .map(([key, value]) => `${Number(value) > 0 ? '+' : ''}${value} ${humanizeAttributeKey(key)}`)
    .join(' · ');
}

function bonusStatus(row) {
  if (row.mode === 'informational') return badge('Informativo', 'info');
  if (row.mode === 'structured') {
    return row.issues.length
      ? badge('Estruturado · bloqueado', 'bad')
      : badge('Estruturado · OK', 'ok');
  }
  if (row.safe) return badge('Legado · candidato seguro', 'warn');
  return badge('Legado · revisão manual', 'bad');
}

function renderBonuses() {
  const host = $('bonus-results');
  if (!state.bonuses.length) {
    host.innerHTML = '<div class="audit-empty">Nenhum bônus de conjunto cadastrado.</div>';
    return;
  }

  host.innerHTML = state.bonuses.map(row => {
    const proposal = row.proposal ? JSON.stringify(row.proposal, null, 2) : '';
    const current = row.mode === 'informational'
      ? 'Especial / informativo — sem alteração numérica'
      : statsSummary(row.entries);

    const issues = row.issues.length
      ? `<div class="audit-bonus-warning">${row.issues.map(issue => `• ${escapeHtml(issue)}`).join('<br>')}</div>`
      : '';

    return `
      <article class="audit-bonus-card ${row.severity || ''}">
        <div class="audit-bonus-head">
          <div>
            <small>${escapeHtml(row.setName)}</small>
            <h3>${escapeHtml(row.required_pieces)} peças${row.title ? ` · ${escapeHtml(row.title)}` : ''}</h3>
          </div>
          ${bonusStatus(row)}
        </div>

        <p class="audit-bonus-description">${escapeHtml(row.description || 'Sem descrição.')}</p>

        <div class="audit-bonus-data">
          <div><small>DADOS ATUAIS</small><span>${escapeHtml(current)}</span></div>
          <div><small>PROPOSTA SEGURA</small>${proposal
            ? `<code>${escapeHtml(proposal)}</code><span>Somente efeitos novos e não ambíguos deste marco.</span>`
            : '<span>—</span>'}
          </div>
        </div>

        ${issues}

        ${row.safe ? `
          <div class="audit-bonus-actions">
            <label><input type="checkbox" class="migration-check" data-id="${escapeHtml(row.id)}"> selecionar para migração</label>
            <button class="admin-button migrate-one" type="button" data-id="${escapeHtml(row.id)}">Revisar e migrar este bônus</button>
          </div>` : ''}
      </article>`;
  }).join('');

  host.querySelectorAll('.migrate-one').forEach(button => {
    button.addEventListener('click', () => migrateOne(button.dataset.id));
  });

  host.querySelectorAll('.migration-check').forEach(input => {
    input.addEventListener('change', refreshBulkButton);
  });

  refreshBulkButton();
}

function renderSummary() {
  const recognizedOccurrences = state.attributes.filter(row => !row.issues.length).length;
  const issueGroups = state.attributeGroups.filter(group => group.severity !== 'ok');
  const affectedOccurrences = issueGroups.reduce((sum, group) => sum + group.occurrenceCount, 0);
  const structured = state.bonuses.filter(row => row.mode === 'structured').length;
  const legacy = state.bonuses.filter(row => row.mode === 'legacy').length;
  const informational = state.bonuses.filter(row => row.mode === 'informational').length;

  $('sum-attributes').textContent = state.attributes.length;
  $('sum-recognized').textContent = recognizedOccurrences;
  $('sum-unique-problems').textContent = issueGroups.length;
  $('sum-affected').textContent = affectedOccurrences;
  $('sum-structured').textContent = structured;
  $('sum-legacy').textContent = legacy;
  $('bonus-summary-inline').textContent =
    `${structured} estruturado(s) · ${legacy} legado(s) · ${informational} informativo(s)`;
}

function selectedMigrationIds() {
  return [...document.querySelectorAll('.migration-check:checked')]
    .map(input => input.dataset.id);
}

function refreshBulkButton() {
  const button = $('migrate-safe-all');
  if (!button) return;

  const selected = selectedMigrationIds();
  button.disabled = !selected.length || state.loading;
  button.textContent = selected.length
    ? `Migrar ${selected.length} revisado(s)`
    : 'Migrar candidatos selecionados';
}

function setMessage(text, type = '') {
  const node = $('audit-message');
  if (!node) return;
  node.textContent = text;
  node.className = `audit-message ${type}`.trim();
}

async function writeProposal(id) {
  const proposal = state.proposals.get(String(id));
  if (!proposal || !Object.keys(proposal).length) {
    throw new Error('Não há proposta segura para este bônus.');
  }

  const { data, error } = await supabase
    .from('equipment_set_bonuses')
    .update({ stats: proposal })
    .eq('id', id)
    .select('id,stats')
    .single();

  if (error) throw error;
  return data;
}

async function migrateOne(id) {
  const row = state.bonuses.find(item => String(item.id) === String(id));
  const proposal = state.proposals.get(String(id));
  if (!row || !proposal) return;

  const confirmed = window.confirm(
    `Migrar o bônus de ${row.required_pieces} peças do conjunto ${row.setName}?\n\n` +
    'A descrição será preservada. Somente os stats abaixo serão gravados:\n\n' +
    JSON.stringify(proposal, null, 2)
  );

  if (!confirmed) return;

  try {
    setLoading(true);
    setMessage('Gravando stats estruturados no bônus revisado...');
    await writeProposal(id);
    await runAudit();
    setMessage('Bônus migrado e auditoria atualizada.', 'ok');
  } catch (error) {
    setMessage(`Falha ao migrar: ${error.message || error}`, 'error');
  } finally {
    setLoading(false);
  }
}

async function migrateSelected() {
  const ids = selectedMigrationIds();
  if (!ids.length) return;

  const confirmed = window.confirm(
    `Migrar ${ids.length} bônus selecionado(s)?\n\n` +
    'Somente propostas marcadas como seguras serão gravadas. Descrições não serão alteradas.'
  );
  if (!confirmed) return;

  try {
    setLoading(true);
    let completed = 0;

    for (const id of ids) {
      setMessage(`Migrando bônus ${completed + 1} de ${ids.length}...`);
      await writeProposal(id);
      completed += 1;
    }

    await runAudit();
    setMessage(`${completed} bônus migrado(s) com stats estruturados.`, 'ok');
  } catch (error) {
    setMessage(`Migração interrompida: ${error.message || error}`, 'error');
  } finally {
    setLoading(false);
  }
}

function setLoading(value) {
  state.loading = value;
  $('audit-page')?.classList.toggle('audit-loading', value);
  if ($('audit-reload')) $('audit-reload').disabled = value;
  refreshBulkButton();
}

async function runAudit() {
  try {
    setLoading(true);
    setMessage('Lendo os dados cadastrados e conferindo cada regra no motor oficial...');

    const data = await loadData();
    const setsById = new Map(data.sets.map(item => [item.id, item]));
    const bonusAudit = buildBonusMigrationAudit(data.bonuses, setsById);

    state.attributes = buildAttributeAudit(data);
    state.attributeGroups = groupAttributeRows(state.attributes);
    state.bonuses = bonusAudit.rows;
    state.proposals = bonusAudit.proposals;

    renderSummary();
    renderAttributeGroups();
    renderBonuses();

    const problemGroups = state.attributeGroups.filter(group => group.severity !== 'ok');
    const affected = problemGroups.reduce((sum, group) => sum + group.occurrenceCount, 0);
    const bonusProblems = state.bonuses.filter(row => row.mode === 'legacy' || row.issues.length).length;

    setMessage(
      problemGroups.length || bonusProblems
        ? `Auditoria concluída: ${problemGroups.length} regra(s) única(s) precisam de revisão, afetando ${affected} ocorrência(s). ${bonusProblems} bônus ainda pedem revisão.`
        : 'Auditoria concluída sem bloqueadores de cálculo.',
      problemGroups.length || bonusProblems ? '' : 'ok'
    );
  } catch (error) {
    console.error('[equipment-audit-v2]', error);
    setMessage(`Não foi possível concluir a auditoria: ${error.message || error}`, 'error');
  } finally {
    setLoading(false);
  }
}

$('audit-reload')?.addEventListener('click', runAudit);
$('attribute-filter')?.addEventListener('change', renderAttributeGroups);
$('migrate-safe-all')?.addEventListener('click', migrateSelected);

await runAudit();
