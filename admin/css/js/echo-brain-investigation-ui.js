import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';
import {
  buildEchoBrainSemanticGraph,
  semanticGraphFingerprint
} from '../../js/echo-brain-semantic-graph-v1.js?v=1';
import { scoreCompositionTeamsV4 } from '../../js/echo-brain-composition-client-v4.js?v=20260824-brain-client-4&sb=20260823-security-supabase-pin-1';
import { listEquipments, getEquipmentBundle } from './equipment-api.js?v=brain-evolution-4&sb=20260823-security-supabase-pin-1&eq=20260907-effects-1';

const $ = id => document.getElementById(id);
let heroes = [];
let equipments = [];
let skillsByHero = new Map();
let busy = false;

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}

function n(value) {
  return value === null || value === undefined ? '—' : Number(value || 0).toLocaleString('pt-BR');
}

async function sha256Hex(value = '') {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function ensureCss() {
  if (document.querySelector('link[data-brain-investigation-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './css/echo-brain-investigation.css?v=20260823-brain-investigation-1';
  link.dataset.brainInvestigationCss = '1';
  document.head.appendChild(link);
}

function ensureSurface() {
  let panel = $('brain-investigation-panel');
  if (panel) return panel;
  panel = document.createElement('section');
  panel.id = 'brain-investigation-panel';
  panel.className = 'brain-section brain-investigation';
  panel.innerHTML = `
    <div class="brain-investigation-head">
      <div><span class="brain-kicker">MODO INVESTIGAÇÃO · FONTE DE VERDADE</span><h3>Veja por que o Brain chegou à decisão</h3><p>Versões, habilidades, efeitos, gatilhos, atributos, itens, confiança, dívida de patch e proveniência ficam auditáveis sem expor pesos internos ao site público.</p></div>
      <span id="brain-investigation-state" class="brain-investigation-state" data-tone="warning">SINCRONIZANDO</span>
    </div>
    <div class="brain-investigation-metrics">
      <article><span>Perfis versionados</span><strong id="brain-investigation-hero-versions">—</strong><small>herói + arma + habilidades</small></article>
      <article><span>Versões de item</span><strong id="brain-investigation-equipment-versions">—</strong><small>memória de patch</small></article>
      <article><span>Arestas semânticas</span><strong id="brain-investigation-edges">—</strong><small>grafo ativo</small></article>
      <article><span>Pendências</span><strong id="brain-investigation-pending">—</strong><small>fonte de verdade</small></article>
      <article><span>Simulador</span><strong id="brain-investigation-simulator">BLOQUEADO</strong><small id="brain-investigation-simulator-copy">validando regras</small></article>
    </div>
    <div class="brain-investigation-controls">
      <label>Herói A<select id="brain-investigation-hero-a"></select></label>
      <label>Herói B<select id="brain-investigation-hero-b"></select></label>
      <label>Herói C<select id="brain-investigation-hero-c"></select></label>
      <label>Equipamento<select id="brain-investigation-equipment"></select></label>
    </div>
    <div class="brain-investigation-actions">
      <button id="brain-knowledge-reconcile" class="admin-button" type="button">Reconciliar conhecimento</button>
      <button id="brain-graph-rebuild" class="admin-button" type="button">Reconstruir grafo</button>
      <button id="brain-investigate-trio" class="admin-button" type="button">Investigar trio</button>
      <button id="brain-investigate-item" class="admin-button" type="button">Investigar herói × item</button>
    </div>
    <span id="brain-investigation-message" class="brain-investigation-message" role="status" aria-live="polite"></span>
    <div id="brain-investigation-result" class="brain-investigation-result"><div class="dashboard-empty">Escolha um trio ou um herói + equipamento para abrir a linha de raciocínio.</div></div>`;
  $('brain-equipment-panel')?.insertAdjacentElement('afterend', panel);
  return panel;
}

function setMessage(text = '', tone = '') {
  const host = $('brain-investigation-message');
  if (!host) return;
  host.textContent = text;
  host.dataset.tone = tone;
}

function setBusy(value) {
  busy = value;
  for (const id of ['brain-knowledge-reconcile', 'brain-graph-rebuild', 'brain-investigate-trio', 'brain-investigate-item']) {
    const button = $(id);
    if (button) button.disabled = value;
  }
}

async function loadSources() {
  const [heroesResult, skillsResult, equipmentRows] = await Promise.all([
    supabase.from('heroes').select('id,name,slug,class_id,enabled,display_order').eq('enabled', true).order('display_order').order('name'),
    supabase.from('hero_skills').select('id,hero_id,name,description,skill_type,cooldown,duration,enabled,verification_status,needs_recheck,display_order')
      .eq('enabled', true).eq('verification_status', 'verified').eq('needs_recheck', false).order('display_order'),
    listEquipments()
  ]);
  if (heroesResult.error) throw heroesResult.error;
  if (skillsResult.error) throw skillsResult.error;
  heroes = heroesResult.data || [];
  equipments = equipmentRows || [];
  skillsByHero = new Map();
  for (const skill of skillsResult.data || []) {
    if (!skillsByHero.has(skill.hero_id)) skillsByHero.set(skill.hero_id, []);
    skillsByHero.get(skill.hero_id).push(skill);
  }
  heroes = heroes.map(hero => ({ ...hero, skills: skillsByHero.get(hero.id) || [] }));
}

function fillSelectors() {
  const heroOptions = heroes.map(hero => `<option value="${esc(hero.id)}">${esc(hero.name)}</option>`).join('');
  for (const id of ['brain-investigation-hero-a', 'brain-investigation-hero-b', 'brain-investigation-hero-c']) {
    const select = $(id);
    if (select) select.innerHTML = `<option value="">Selecione</option>${heroOptions}`;
  }
  const equipment = $('brain-investigation-equipment');
  if (equipment) equipment.innerHTML = `<option value="">Selecione</option>${equipments.map(item => `<option value="${esc(item.id)}">${esc(item.name || item.slug || item.id)}</option>`).join('')}`;
}

async function loadHealth() {
  const [knowledge, simulation] = await Promise.all([
    supabase.rpc('admin_echo_brain_knowledge_snapshot'),
    supabase.rpc('admin_echo_brain_simulation_readiness')
  ]);
  if (knowledge.error) throw knowledge.error;
  const data = Array.isArray(knowledge.data) ? knowledge.data[0] : knowledge.data || {};
  const sim = simulation.error ? null : (Array.isArray(simulation.data) ? simulation.data[0] : simulation.data);
  if ($('brain-investigation-hero-versions')) $('brain-investigation-hero-versions').textContent = n(data.heroVersions);
  if ($('brain-investigation-equipment-versions')) $('brain-investigation-equipment-versions').textContent = n(data.equipmentVersions);
  if ($('brain-investigation-edges')) $('brain-investigation-edges').textContent = n(data.semanticEdges);
  if ($('brain-investigation-pending')) $('brain-investigation-pending').textContent = n(Number(data.pendingKnowledge || 0) + Number(data.pendingInvalidations || 0));
  const simulator = $('brain-investigation-simulator');
  const simulatorCopy = $('brain-investigation-simulator-copy');
  if (simulator) simulator.textContent = sim?.ready ? 'PRONTO P/ FUTURO' : 'BLOQUEADO';
  if (simulatorCopy) simulatorCopy.textContent = sim ? `${n(sim.knowledgePending)} conhecimento · ${n(sim.equipmentPending)} item · ${n(sim.simulationInvalidations)} invalidação` : 'readiness indisponível';
  const state = $('brain-investigation-state');
  if (state) {
    const pending = Number(data.pendingKnowledge || 0) + Number(data.pendingInvalidations || 0);
    state.textContent = pending ? 'CONHECIMENTO PENDENTE' : 'AUDITÁVEL';
    state.dataset.tone = pending ? 'warning' : 'active';
  }
  return { data, sim };
}

async function mapLimit(items, limit, mapper) {
  const result = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      result[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, worker));
  return result;
}

async function reconcileKnowledge() {
  if (busy) return;
  const ok = window.confirm('Reconciliar perfis completos de herói agora? Isso cria versões imutáveis quando status, arma ou habilidades mudaram.');
  if (!ok) return;
  setBusy(true);
  setMessage('Reconciliando perfis completos…');
  try {
    const { data, error } = await supabase.rpc('admin_echo_brain_reconcile_knowledge', { p_limit: 500 });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data || {};
    setMessage(`Conhecimento reconciliado: ${n(result.versioned)} versão(ões), ${n(result.unchanged)} sem mudança.`, 'success');
    await loadHealth();
  } catch (error) {
    setMessage(`Falha na reconciliação: ${error?.message || error}`, 'danger');
  } finally { setBusy(false); }
}

async function rebuildGraph() {
  if (busy) return;
  const ok = window.confirm('Reconstruir o grafo semântico usando todos os heróis/habilidades e equipamentos atuais? A troca do grafo ativo é feita somente depois de a nova versão ser montada.');
  if (!ok) return;
  setBusy(true);
  setMessage('Montando grafo semântico a partir da fonte atual…');
  try {
    const bundles = await mapLimit(equipments, 6, item => getEquipmentBundle(item.id));
    const graphEquipments = bundles.filter(Boolean).map(bundle => ({ ...(bundle.equipment || {}), variants: bundle.variants || [] }));
    const bonusMap = new Map();
    for (const bundle of bundles.filter(Boolean)) {
      for (const bonus of bundle.bonuses || []) if (bonus?.id && !bonusMap.has(bonus.id)) bonusMap.set(bonus.id, bonus);
    }
    const graph = buildEchoBrainSemanticGraph({ heroes, equipments: graphEquipments, setBonuses: [...bonusMap.values()] });
    const fingerprintSource = semanticGraphFingerprint(graph);
    const fingerprint = await sha256Hex(fingerprintSource);
    const payload = graph.edges.map(edge => ({
      ...edge,
      sourceFingerprint: `${fingerprint}:${edge.sourceType}:${edge.sourceId}`
    }));
    const { data, error } = await supabase.rpc('admin_echo_brain_replace_semantic_edges', { p_edges: payload });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data || {};
    setMessage(`Grafo ativo: ${n(result.activeEdges ?? result.inserted)} relação(ões); ${n(result.reactivated)} reaproveitada(s) sem duplicação.`, 'success');
    await loadHealth();
  } catch (error) {
    setMessage(`Falha ao reconstruir grafo: ${error?.message || error}`, 'danger');
  } finally { setBusy(false); }
}

function heroById(id) { return heroes.find(hero => String(hero.id) === String(id)) || null; }

function relationSets(graph, heroId, equipmentId) {
  const heroSkills = new Set(graph.edges.filter(edge => edge.sourceType === 'hero' && edge.sourceId === heroId && edge.relation === 'has_skill').map(edge => edge.targetId));
  const heroStats = new Set(graph.edges.filter(edge => edge.sourceType === 'hero' && edge.sourceId === heroId && edge.relation === 'values_stat').map(edge => edge.targetId));
  const itemStats = new Set(graph.edges.filter(edge => edge.sourceType === 'equipment' && edge.sourceId === equipmentId && edge.relation === 'modifies_stat').map(edge => edge.targetId));
  const heroTriggers = new Set(graph.edges.filter(edge => heroSkills.has(edge.sourceId) && edge.relation === 'uses_trigger').map(edge => edge.targetId));
  const heroEffects = new Set(graph.edges.filter(edge => heroSkills.has(edge.sourceId) && edge.relation === 'produces_effect').map(edge => edge.targetId));
  const itemTriggers = new Set(graph.edges.filter(edge => edge.sourceType === 'equipment' && edge.sourceId === equipmentId && edge.relation === 'uses_trigger').map(edge => edge.targetId));
  const itemEffects = new Set(graph.edges.filter(edge => edge.sourceType === 'equipment' && edge.sourceId === equipmentId && edge.relation === 'produces_effect').map(edge => edge.targetId));
  return {
    sharedStats: [...heroStats].filter(id => itemStats.has(id)),
    sharedTriggers: [...heroTriggers].filter(id => itemTriggers.has(id)),
    sharedEffects: [...heroEffects].filter(id => itemEffects.has(id)),
    heroStats: [...heroStats], itemStats: [...itemStats]
  };
}

async function investigationSnapshot(heroIds = [], equipmentIds = []) {
  const { data, error } = await supabase.rpc('admin_echo_brain_investigation_snapshot', {
    p_hero_ids: heroIds.map(String),
    p_equipment_ids: equipmentIds.map(String)
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data || {};
}

async function investigateItem() {
  if (busy) return;
  const heroId = $('brain-investigation-hero-a')?.value || '';
  const equipmentId = $('brain-investigation-equipment')?.value || '';
  if (!heroId || !equipmentId) { setMessage('Selecione Herói A e um equipamento.', 'warning'); return; }
  setBusy(true);
  setMessage('Abrindo relações herói × item…');
  try {
    const hero = heroById(heroId);
    const bundle = await getEquipmentBundle(equipmentId);
    const graph = buildEchoBrainSemanticGraph({ heroes: [hero], equipments: [{ ...(bundle.equipment || {}), variants: bundle.variants || [] }], setBonuses: bundle.bonuses || [] });
    const relations = relationSets(graph, heroId, equipmentId);
    const snapshot = await investigationSnapshot([heroId], [equipmentId]);
    const item = bundle.equipment || {};
    const tags = [...relations.sharedStats.map(x => `atributo: ${x}`), ...relations.sharedTriggers.map(x => `gatilho: ${x}`), ...relations.sharedEffects.map(x => `efeito: ${x}`)];
    const versionsHero = snapshot.knowledgeVersions || [];
    const versionsItem = snapshot.equipmentVersions || [];
    const invalid = (snapshot.invalidations || []).filter(row => row.status === 'pending');
    $('brain-investigation-result').innerHTML = `
      <div class="invest-card"><h4>${esc(hero?.name || heroId)} × ${esc(item.name || equipmentId)}</h4><p>${tags.length ? 'Há relações semânticas diretas entre o kit e o item.' : 'Não foi encontrada uma relação direta verificável; isso não é convertido automaticamente em incompatibilidade.'}</p><div class="invest-tags">${tags.map(tag => `<span>${esc(tag)}</span>`).join('') || '<span>sem relação direta</span>'}</div></div>
      <div class="invest-card"><h4>Versão e frescor</h4><p>Herói: ${esc(versionsHero[0]?.game_version || 'sem versão')} · v${esc(versionsHero[0]?.version || '—')} · Item: ${esc(versionsItem[0]?.game_version || 'sem versão')} · v${esc(versionsItem[0]?.version || '—')}.</p><p>${invalid.length ? `${invalid.length} invalidação(ões) pendente(s) reduzem a confiança.` : 'Nenhuma invalidação pendente para esta seleção.'}</p></div>
      <div class="invest-card"><h4>Cobertura</h4><p>O herói valoriza ${relations.heroStats.length} atributo(s) derivados das habilidades; o item modifica ${relations.itemStats.length} atributo(s) reconhecido(s). O Brain preserva efeitos sem relação calculável como incerteza, em vez de pontuá-los como zero.</p></div>`;
    setMessage('Investigação herói × item concluída.', 'success');
  } catch (error) {
    setMessage(`Falha na investigação: ${error?.message || error}`, 'danger');
  } finally { setBusy(false); }
}

async function investigateTrio() {
  if (busy) return;
  const ids = ['brain-investigation-hero-a', 'brain-investigation-hero-b', 'brain-investigation-hero-c'].map(id => $(id)?.value || '');
  if (ids.some(id => !id) || new Set(ids).size !== 3) { setMessage('Selecione três heróis diferentes.', 'warning'); return; }
  setBusy(true);
  setMessage('Executando scorer Semantic v4…');
  try {
    const response = await scoreCompositionTeamsV4(
      [{ requestId: 'admin-investigation', heroIds: ids }],
      {
        force: true,
        surface: 'other',
        recordAudit: true,
        auditContext: `admin-investigation:${[...ids].sort().join('|')}`
      }
    );
    if (!response?.ok || !response.results?.[0]) throw new Error(response?.error || 'score_unavailable');
    const result = response.results[0];
    const snapshot = await investigationSnapshot(ids, []);
    const confidence = result.confidence || {};
    const pending = (snapshot.invalidations || []).filter(row => row.status === 'pending');
    const auditState = response.audit?.recorded === true ? 'auditoria gravada' : 'score calculado; auditoria não autorizada';
    $('brain-investigation-result').innerHTML = `
      <div class="invest-card"><h4>Decisão Semantic v4 · ${esc(result.finalScore)}/100</h4><div class="invest-grid"><div><span>Funcional</span><b>${esc(Math.round(result.functionalSynergy))}</b><small>regras do kit</small></div><div><span>Semântica</span><b>${esc(Math.round(result.semanticSynergy))}</b><small>interações</small></div><div><span>Performance</span><b>${result.observedPerformance == null ? '—' : esc(Math.round(result.observedPerformance))}</b><small>se validada</small></div><div><span>Exigência</span><b>${esc(result.mechanicalDemand)}</b><small>não é qualidade</small></div><div><span>Confiança</span><b>${esc(Math.round(Number(confidence.overall || 0) * 100))}%</b><small>componentizada</small></div></div><p>${esc(auditState)}</p></div>
      <div class="invest-card"><h4>Por que</h4>${(result.strengths || []).map(text => `<p>+ ${esc(text)}</p>`).join('') || '<p>Sem força dominante.</p>'}${(result.risks || []).map(text => `<p>– ${esc(text)}</p>`).join('')}</div>
      <div class="invest-card"><h4>Confiança por fonte</h4><div class="invest-tags"><span>regras ${Math.round(Number(confidence.rules || 0) * 100)}%</span><span>verificação ${Math.round(Number(confidence.verification || 0) * 100)}%</span><span>frescor ${Math.round(Number(confidence.knowledgeFreshness || 0) * 100)}%</span><span>modelo ${Math.round(Number(confidence.model || 0) * 100)}%</span><span>evidência ${Math.round(Number(confidence.observedEvidence || 0) * 100)}%</span></div><p>${pending.length ? `${pending.length} invalidação(ões) pendente(s) nesta seleção.` : 'Sem invalidações pendentes na fonte versionada selecionada.'}</p></div>
      <div class="invest-card"><h4>Proveniência</h4><p>${n(snapshot.provenance?.recommendationExposures)} exposição(ões) de recomendação registradas globalmente; ${n(snapshot.provenance?.brainExposedObservations)} observação(ões) identificadas como influenciadas pelo Brain e excluídas do treino orgânico.</p></div>`;
    setMessage('Investigação do trio concluída.', 'success');
  } catch (error) {
    setMessage(`Falha na investigação do trio: ${error?.message || error}`, 'danger');
  } finally { setBusy(false); }
}

ensureCss();
ensureSurface();
try {
  await loadSources();
  fillSelectors();
  await loadHealth();
} catch (error) {
  console.warn('[echo-brain-investigation-ui] fontes indisponíveis:', error);
  setMessage('O modo investigação não conseguiu carregar todas as fontes neste ambiente.', 'warning');
}

$('brain-knowledge-reconcile')?.addEventListener('click', reconcileKnowledge);
$('brain-graph-rebuild')?.addEventListener('click', rebuildGraph);
$('brain-investigate-trio')?.addEventListener('click', investigateTrio);
$('brain-investigate-item')?.addEventListener('click', investigateItem);
