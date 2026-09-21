import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';
import {
  canonicalKey,
  resolverChavePT,
  STAT_DEFINITIONS
} from '../../js/game-stat-engine.js?v=15&sc=20260906-1&eq=20260907-effects-1';

/*
 * Auditoria administrativa de integridade.
 *
 * - lê os dados reais do Supabase usando a sessão administrativa atual;
 * - confere cada atributo contra o mesmo motor usado pela build;
 * - NÃO inventa base, alvo ou fórmula para chaves desconhecidas;
 * - bônus legados só recebem proposta de migração quando todos os efeitos
 *   numéricos incrementais forem reconhecidos;
 * - nenhuma escrita acontece sem confirmação explícita do administrador.
 */

const PERCENT_TARGETS = {
  weapon_damage_to_armor_pct: 'armor_drone_multiplier',
  weapon_damage_to_health_pct: 'health_damage_multiplier',
  armor_max_pct: 'armor',
  armor_maximum_pct: 'armor',
  health_max_pct: 'health',
  max_health_pct: 'health',
  movement_speed_pct: 'max_movement_speed',
  aimed_movement_speed_pct: 'aimed_movement_speed',
  reload_time_pct: 'reload_time'
};

const FLAT_TARGETS = {
  weapon_range_franco: 'aimed_range',
  alcance_de_tiro_com_mira_do_heroi: 'aimed_range'
};

const $ = id => document.getElementById(id);
const state = {
  attributes: [],
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
  const normalized = String(value ?? '').trim().replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function normalize(value = '') {
  return String(value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9%+\-.,\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function isPercentKey(key = '') {
  return /_pct$|percentual|porcentagem/.test(normalize(key));
}

function resolveAttributeKey(rawKey) {
  const key = canonicalKey(rawKey);

  if (PERCENT_TARGETS[key]) {
    return {
      recognized: true,
      target: PERCENT_TARGETS[key],
      operation: 'percent',
      source: 'estrutura oficial'
    };
  }

  if (FLAT_TARGETS[key]) {
    return {
      recognized: true,
      target: FLAT_TARGETS[key],
      operation: 'add',
      source: 'estrutura oficial'
    };
  }

  if (STAT_DEFINITIONS[key]) {
    return {
      recognized: true,
      target: key,
      operation: 'add',
      source: 'atributo oficial'
    };
  }

  const pt = resolverChavePT(rawKey);
  if (pt) {
    return {
      recognized: true,
      target: pt.alvo,
      operation: pt.modo === 'percent' ? 'percent' : 'add',
      source: 'regra textual existente'
    };
  }

  return {
    recognized: false,
    target: null,
    operation: null,
    source: 'sem regra no motor'
  };
}

function normalizeVariantAttributes(attributes) {
  if (Array.isArray(attributes)) {
    return attributes
      .filter(item => String(item?.label || '').trim())
      .map(item => ({
        key: String(item.label).trim(),
        value: item.value
      }));
  }

  if (attributes && typeof attributes === 'object') {
    return Object.entries(attributes).map(([key, value]) => ({ key, value }));
  }

  return [];
}

function numericStats(stats) {
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return [];
  return Object.entries(stats).filter(([key, value]) =>
    !String(key).startsWith('__echo_') && Number.isFinite(Number(value))
  );
}

function canonicalLegacyKey(phrase, percent) {
  const p = normalize(phrase)
    .replace(/^ao\s+|^a\s+|^de\s+|^do\s+|^da\s+/, '')
    .replace(/\s+do heroi$/g, '')
    .replace(/\s+do inimigo$/g, '')
    .trim();
  const c = p.replace(/\s+/g, '');

  if (/dano.*(armadura|drone)/.test(p) || /dano.*(armadura|drone)/.test(c)) {
    return percent ? 'weapon_damage_to_armor_pct' : 'dano da arma a armadura do inimigo';
  }
  if (/dano.*vida/.test(p) || /dano.*vida/.test(c)) {
    return percent ? 'weapon_damage_to_health_pct' : 'dano da arma a vida do inimigo';
  }
  if (/(alcance|distancia).*visao/.test(p) || /(alcance|distancia).*visao/.test(c)) return 'alcance de visao do heroi';
  if (/alcance.*(tiro|arma).*mira|alcance.*com mira/.test(p) || /alcance.*mira/.test(c)) return 'weapon_range_franco';
  if (/(recarregamento|recarga)/.test(p)) return percent ? 'reload_time_pct' : 'tempo de recarga';
  if (/velocidade.*mira/.test(p) || /velocidade.*mira/.test(c)) return percent ? 'aimed_movement_speed_pct' : 'velocidade ao mirar';
  if (/velocidade.*(movimento|maxima|corrida)/.test(p) || /velocidade.*(movimento|maxima|corrida)/.test(c)) {
    return percent ? 'movement_speed_pct' : 'velocidade maxima';
  }
  if (/(vida|saude)/.test(p)) return percent ? 'health_max_pct' : 'vida';
  if (/armadura/.test(p)) return percent ? 'armor_max_pct' : 'armadura';
  if (/poder.*perfuracao/.test(p) || /poderperfuracao/.test(c)) return 'poder de perfuracao da arma';
  if (/(penetracao|perfuracao)/.test(p)) return 'perfuracao de armadura';
  if (/dispersao.*mira/.test(p) || /dispersao.*mira/.test(c)) return percent ? 'dispersao de tiro com mira da arma percentual' : 'dispersao de tiro com mira da arma';
  if (/dispersao/.test(p)) return percent ? 'dispersao de tiro da arma percentual' : 'dispersao de tiro da arma';
  if (/(municao|pente|carregador)/.test(p)) return 'capacidade de municao';

  return `${p}${percent ? ' percentual' : ''}`.trim();
}

function parseBonusDescription(description = '') {
  const text = String(description || '').replace(/−/g, '-').replace(/\u00a0/g, ' ');
  const regex = /([+-])\s*(\d+(?:[.,]\d+)?)\s*(%)?\s*(?:ao|à|a|de|do|da)?\s*([^+\-;\n.]+)/gi;
  const claims = [];
  let match;

  while ((match = regex.exec(text))) {
    const phrase = String(match[4] || '').trim();
    if (!phrase || /^bonus\s+de\s+\d+\s+pecas?/i.test(normalize(phrase))) continue;

    const rawNumber = numberFrom(match[2]);
    if (rawNumber === null) continue;

    const percent = Boolean(match[3]);
    const key = canonicalLegacyKey(phrase, percent);
    const value = (match[1] === '-' ? -1 : 1) * rawNumber;
    const rule = resolveAttributeKey(key);

    claims.push({ key, value, phrase, percent, rule });
  }

  return claims;
}

function cleanedNumericDescription(description = '') {
  return String(description || '')
    .replace(/[+-]\s*b[oô]nus\s+de\s+\d+\s+pe[cç]as?/gi, ' ');
}

function numericClaimCount(description = '') {
  const matches = cleanedNumericDescription(description)
    .match(/[+-]\s*\d+(?:[.,]\d+)?\s*%?/g);
  return matches?.length || 0;
}

function signatureFor(key, value) {
  const canonical = canonicalLegacyKey(key, isPercentKey(key));
  return `${normalize(canonical)}::${Number(value)}`;
}

function buildBonusAudit(rows, setsById) {
  const groups = new Map();
  for (const row of rows) {
    const setId = String(row.set_id || '__sem_set__');
    if (!groups.has(setId)) groups.set(setId, []);
    groups.get(setId).push(row);
  }

  const output = [];
  const proposals = new Map();

  for (const group of groups.values()) {
    group.sort((a, b) => Number(a.required_pieces || 0) - Number(b.required_pieces || 0));
    const inherited = new Set();

    for (const row of group) {
      const entries = numericStats(row.stats);
      const informational = row.stats?.__echo_mode === 'informational';
      const setName = setsById.get(row.set_id)?.name || 'Sem conjunto';
      const base = {
        ...row,
        setName,
        entries,
        mode: 'legacy',
        issues: [],
        proposal: null,
        safe: false
      };

      if (informational) {
        base.mode = 'informational';
        output.push(base);
        continue;
      }

      if (entries.length) {
        base.mode = 'structured';
        for (const [key, value] of entries) {
          inherited.add(signatureFor(key, value));
          const rule = resolveAttributeKey(key);
          if (!rule.recognized) base.issues.push(`Chave estruturada sem regra no motor: ${key}`);
        }
        output.push(base);
        continue;
      }

      const claims = parseBonusDescription(row.description || '');
      const expectedClaims = numericClaimCount(row.description || '');
      const incremental = {};
      let allRecognized = true;

      if (expectedClaims !== claims.length) {
        allRecognized = false;
        base.issues.push(`A descrição possui ${expectedClaims} efeito(s) numérico(s), mas somente ${claims.length} foi(ram) interpretado(s).`);
      }

      for (const claim of claims) {
        if (!claim.rule.recognized) {
          allRecognized = false;
          base.issues.push(`Efeito não reconhecido: ${claim.phrase}`);
          continue;
        }

        const signature = signatureFor(claim.key, claim.value);
        if (inherited.has(signature)) continue;
        inherited.add(signature);
        incremental[claim.key] = Number(incremental[claim.key] || 0) + claim.value;
      }

      const hasNumeric = expectedClaims > 0;

      if (allRecognized && Object.keys(incremental).length) {
        base.proposal = incremental;
        base.safe = true;
        proposals.set(String(row.id), incremental);
      } else if (!hasNumeric && !base.issues.length) {
        base.issues.push('Sem efeito numérico estruturado. Revise se é um bônus especial/informativo.');
      } else if (hasNumeric && !base.issues.length) {
        base.issues.push('Os efeitos numéricos deste marco já aparecem em um marco anterior; revise manualmente antes de estruturar.');
      }

      output.push(base);
    }
  }

  return { rows: output, proposals };
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
      const rule = resolveAttributeKey(attribute.key);
      const issues = [];

      if (numericValue === null) issues.push('Valor não numérico');
      if (!rule.recognized) issues.push('Chave sem regra no motor');

      rows.push({
        equipmentId: variant.equipment_id,
        equipmentName: equipment.name || 'Equipamento sem nome',
        rarityName: rarity.name || rarity.slug || 'Raridade',
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

function statusBadge(label, type) {
  return `<span class="audit-status ${type}">${escapeHtml(label)}</span>`;
}

function renderAttributes() {
  const filter = $('attribute-filter')?.value || 'issues';
  const rows = filter === 'all' ? state.attributes : state.attributes.filter(row => row.issues.length);
  const host = $('attribute-results');

  if (!rows.length) {
    host.innerHTML = `<div class="audit-empty">${filter === 'issues' ? 'Nenhum atributo com problema foi encontrado.' : 'Nenhum atributo cadastrado foi encontrado.'}</div>`;
    return;
  }

  host.innerHTML = `<table class="audit-table"><thead><tr><th>Equipamento</th><th>Raridade</th><th>Atributo cadastrado</th><th>Valor</th><th>Destino no motor</th><th>Status</th><th>Ação</th></tr></thead><tbody>${rows.map(row => {
    const status = row.issues.length
      ? statusBadge(row.issues.join(' · '), 'bad')
      : statusBadge('Reconhecido', 'ok');
    const destination = row.rule.recognized
      ? `${row.rule.target} · ${row.rule.operation === 'percent' ? 'percentual sequencial' : 'soma direta'}`
      : '—';
    return `<tr>
      <td><b>${escapeHtml(row.equipmentName)}</b></td>
      <td>${escapeHtml(row.rarityName)}</td>
      <td><code>${escapeHtml(row.key)}</code></td>
      <td>${escapeHtml(row.value)}</td>
      <td class="audit-detail">${escapeHtml(destination)}<br><small>${escapeHtml(row.rule.source)}</small></td>
      <td>${status}</td>
      <td><a class="admin-button" href="./equipment-editor.html?id=${encodeURIComponent(row.equipmentId)}&tab=rarities">Revisar</a></td>
    </tr>`;
  }).join('')}</tbody></table>`;
}

function statsSummary(entries) {
  if (!entries.length) return '—';
  return entries.map(([key, value]) => `${value > 0 ? '+' : ''}${value} ${key}`).join('\n');
}

function bonusModeStatus(row) {
  if (row.mode === 'informational') return statusBadge('Informativo', 'info');
  if (row.mode === 'structured') {
    return row.issues.length
      ? statusBadge('Estruturado com problema', 'bad')
      : statusBadge('Estruturado', 'ok');
  }
  if (row.safe) return statusBadge('Legado · proposta disponível', 'warn');
  return statusBadge('Legado · revisão manual', 'bad');
}

function renderBonuses() {
  const host = $('bonus-results');
  if (!state.bonuses.length) {
    host.innerHTML = '<div class="audit-empty">Nenhum bônus de conjunto cadastrado.</div>';
    return;
  }

  host.innerHTML = `<table class="audit-table"><thead><tr><th>Selecionar</th><th>Conjunto</th><th>Marco</th><th>Descrição</th><th>Dados atuais</th><th>Proposta incremental</th><th>Status</th><th>Ação</th></tr></thead><tbody>${state.bonuses.map(row => {
    const current = row.mode === 'informational'
      ? '{ __echo_mode: informational }'
      : statsSummary(row.entries);
    const proposal = row.proposal ? JSON.stringify(row.proposal, null, 2) : '';
    const issues = row.issues.length ? `<div class="audit-detail">${row.issues.map(issue => `• ${escapeHtml(issue)}`).join('<br>')}</div>` : '';
    return `<tr>
      <td>${row.safe ? `<input type="checkbox" class="migration-check" data-id="${escapeHtml(row.id)}" aria-label="Selecionar bônus de ${escapeHtml(row.required_pieces)} peças">` : '—'}</td>
      <td><b>${escapeHtml(row.setName)}</b></td>
      <td>${escapeHtml(row.required_pieces)} peças<br><small>${escapeHtml(row.title || '')}</small></td>
      <td class="audit-detail">${escapeHtml(row.description || '—')}</td>
      <td><code>${escapeHtml(current)}</code></td>
      <td>${proposal ? `<div class="audit-proposal"><code>${escapeHtml(proposal)}</code><small>Somente efeitos novos deste marco.</small></div>` : '—'}</td>
      <td>${bonusModeStatus(row)}${issues}</td>
      <td><div class="audit-row-actions">${row.safe ? `<button class="admin-button migrate-one" type="button" data-id="${escapeHtml(row.id)}">Migrar</button>` : ''}</div></td>
    </tr>`;
  }).join('')}</tbody></table>`;

  host.querySelectorAll('.migrate-one').forEach(button => {
    button.addEventListener('click', () => migrateOne(button.dataset.id));
  });
  host.querySelectorAll('.migration-check').forEach(input => {
    input.addEventListener('change', refreshBulkButton);
  });
  refreshBulkButton();
}

function renderSummary() {
  const recognized = state.attributes.filter(row => !row.issues.length).length;
  const unknown = state.attributes.length - recognized;
  const structured = state.bonuses.filter(row => row.mode === 'structured').length;
  const legacy = state.bonuses.filter(row => row.mode === 'legacy').length;
  const info = state.bonuses.filter(row => row.mode === 'informational').length;

  $('sum-attributes').textContent = state.attributes.length;
  $('sum-recognized').textContent = recognized;
  $('sum-unknown').textContent = unknown;
  $('sum-structured').textContent = structured;
  $('sum-legacy').textContent = legacy;
  $('sum-info').textContent = info;
}

function selectedMigrationIds() {
  return [...document.querySelectorAll('.migration-check:checked')].map(input => input.dataset.id);
}

function refreshBulkButton() {
  const button = $('migrate-safe-all');
  if (!button) return;
  const selected = selectedMigrationIds();
  button.disabled = !selected.length || state.loading;
  button.textContent = selected.length ? `Migrar ${selected.length} selecionado(s)` : 'Migrar candidatos revisados';
}

function setMessage(text, type = '') {
  const node = $('audit-message');
  if (!node) return;
  node.textContent = text;
  node.className = `audit-message ${type}`.trim();
}

async function writeProposal(id) {
  const proposal = state.proposals.get(String(id));
  if (!proposal || !Object.keys(proposal).length) throw new Error('Não há proposta segura para este bônus.');

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
    `A descrição será preservada. Apenas stats será gravado como:\n${JSON.stringify(proposal, null, 2)}`
  );
  if (!confirmed) return;

  try {
    setLoading(true);
    setMessage('Gravando stats estruturados no bônus selecionado...');
    await writeProposal(id);
    setMessage('Bônus migrado. Recarregando a auditoria...', 'ok');
    await runAudit();
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
    'Somente as propostas mostradas na tabela serão gravadas. As descrições não serão alteradas.'
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
    setMessage(`${completed} bônus migrado(s) com stats estruturados.`, 'ok');
    await runAudit();
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
    setMessage('Lendo equipamentos, raridades, conjuntos e bônus diretamente do Supabase...');
    const data = await loadData();
    const setsById = new Map(data.sets.map(item => [item.id, item]));
    const bonusAudit = buildBonusAudit(data.bonuses, setsById);

    state.attributes = buildAttributeAudit(data);
    state.bonuses = bonusAudit.rows;
    state.proposals = bonusAudit.proposals;

    renderSummary();
    renderAttributes();
    renderBonuses();

    const attributeProblems = state.attributes.filter(row => row.issues.length).length;
    const bonusProblems = state.bonuses.filter(row => row.mode === 'legacy' || row.issues.length).length;
    setMessage(
      `Auditoria concluída: ${state.attributes.length} atributo(s), ${attributeProblems} problema(s) de atributo e ${bonusProblems} bônus que ainda pedem revisão.`,
      attributeProblems || bonusProblems ? '' : 'ok'
    );
  } catch (error) {
    console.error('[equipment-audit]', error);
    setMessage(`Não foi possível concluir a auditoria: ${error.message || error}`, 'error');
  } finally {
    setLoading(false);
  }
}

$('audit-reload')?.addEventListener('click', runAudit);
$('attribute-filter')?.addEventListener('change', renderAttributes);
$('migrate-safe-all')?.addEventListener('click', migrateSelected);

await runAudit();
