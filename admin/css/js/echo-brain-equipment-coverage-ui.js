import { listEquipments, getEquipmentBundle } from './equipment-api.js?v=brain-evolution-4&sb=20260823-security-supabase-pin-1&eq=20260907-effects-1';
import { auditEquipmentBundlesCoverageV1 } from '../../js/echo-brain-equipment-coverage-v1.js?v=1&sc=20260906-1&eq=20260907-effects-1';
import { loadStatusRegistry } from '../../js/status-registry-client.js?sc=20260906-1&sb=20260823-security-supabase-pin-1&eq=20260907-effects-1';

const $ = id => document.getElementById(id);
let busy = false;

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
}

function n(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function ensureSurface() {
  const actions = document.querySelector('#brain-investigation-panel .brain-investigation-actions');
  if (!actions) return false;
  if (!$('brain-audit-live-equipment-coverage')) {
    actions.insertAdjacentHTML('beforeend', '<button id="brain-audit-live-equipment-coverage" class="admin-button" type="button">Auditar catálogo vivo</button>');
  }
  return true;
}

function message(text = '', tone = '') {
  const host = $('brain-investigation-message');
  if (!host) return;
  host.textContent = text;
  host.dataset.tone = tone;
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

function blockerHtml(blocker) {
  if (blocker.type === 'bundle_read_error') {
    return `<article class="invest-card"><h4>Falha de leitura · ${esc(blocker.title || blocker.key)}</h4><p>${esc(blocker.text || 'Bundle não pôde ser lido.')}</p></article>`;
  }
  if (blocker.type === 'set_bonus_text') {
    return `<article class="invest-card"><h4>Bônus de conjunto sem mapeamento · ${esc(blocker.title || blocker.key)}</h4><p>${esc(blocker.text || 'Texto sem efeito reconhecido.')}</p></article>`;
  }
  if (['status_source_missing', 'status_source_changed'].includes(blocker.reason)) {
    return `<article class="invest-card"><h4>Vínculo com fonte ${blocker.reason === 'status_source_missing' ? 'ausente' : 'alterada'} · ${esc(blocker.key)}</h4><p>A linha atual não corresponde ao vínculo publicado. Revise a origem na <a href="./status-central.html">Central de Status</a>; este vínculo não comprova aplicação.</p></article>`;
  }
  const refs = (blocker.references || []).slice(0, 6)
    .map(ref => `${ref.equipmentName} · ${ref.rarity}`)
    .join(' · ');
  return `<article class="invest-card"><h4>Atributo sem mapeamento · ${esc(blocker.key)}</h4><p>Canônico: <code>${esc(blocker.canonicalKey || '—')}</code></p><p>${esc(refs || 'Sem referência de item disponível.')}</p></article>`;
}

function semanticOnlyHtml(row) {
  const refs = (row.references || []).slice(0, 4).map(ref => `${ref.equipmentName} · ${ref.rarity}`).join(' · ');
  return `<p><b>${esc(row.rawKey)}</b> → ${esc(row.semanticKind || 'efeito conhecido')} · sem fórmula/base segura${refs ? ` · ${esc(refs)}` : ''}</p>`;
}

function renderAudit(audit) {
  const host = $('brain-investigation-result');
  if (!host) return;
  const blockers = audit.blockers || [];
  const semanticOnly = (audit.attributes || []).filter(row => row.classification === 'semantic_only');
  host.innerHTML = `
    <div class="invest-card">
      <h4>Auditoria viva do catálogo · ${audit.complete ? 'SEM BLOQUEADORES' : 'BLOQUEADORES ENCONTRADOS'}</h4>
      <p>Leitura do catálogo e do registro publicado. O diagnóstico usa <code>applyEquipmentStats()</code> para verificar reconhecimento estrutural; não comprova uma base real nem a aplicação ao herói. Confira as contas na <a href="./status-central.html">Central de Status</a>.</p>
      <div class="invest-grid">
        <div><span>Equipamentos</span><b>${n(audit.bundlesScanned)}/${n(audit.equipmentsExpected)}</b><small>bundles lidos</small></div>
        <div><span>Mapeamentos numéricos</span><b>${n(audit.numericMappings)}</b><small>exigem prova da base e das condições</small></div>
        <div><span>Semântico-only</span><b>${n(audit.semanticOnlyMappings)}</b><small>efeito conhecido</small></div>
        <div><span>Não mapeados</span><b>${n(audit.unmappedMappings)}</b><small>atributos bloqueadores</small></div>
        <div><span>Textos de set não mapeados</span><b>${n(audit.unmappedSetBonusTexts)}</b><small>revisão necessária</small></div>
      </div>
    </div>
    <div class="invest-card"><h4>Efeitos conhecidos sem cálculo seguro</h4>${semanticOnly.length ? semanticOnly.map(semanticOnlyHtml).join('') : '<p>Nenhum efeito semantic-only encontrado neste catálogo.</p>'}</div>
    ${blockers.length ? blockers.map(blockerHtml).join('') : '<div class="invest-card"><h4>Cobertura estrutural completa</h4><p>Nenhum atributo ou texto mecânico de conjunto ficou silenciosamente sem mapeamento nesta leitura. Isso não substitui Shadow/Replay nem valida o futuro simulador.</p></div>'}`;
}

async function auditLiveCatalog() {
  if (busy) return;
  busy = true;
  const button = $('brain-audit-live-equipment-coverage');
  if (button) button.disabled = true;
  message('Lendo todos os equipamentos, raridades e bônus de conjunto do catálogo atual…');
  try {
    const [equipments,registry] = await Promise.all([listEquipments(),loadStatusRegistry()]);
    const readErrors = [];
    let completed = 0;
    const bundles = await mapLimit(equipments, 6, async equipment => {
      try {
        return await getEquipmentBundle(equipment.id);
      } catch (error) {
        readErrors.push({
          equipmentId: equipment.id,
          equipmentName: equipment.name || equipment.slug || equipment.id,
          error: error?.message || String(error)
        });
        return null;
      } finally {
        completed += 1;
        if (completed % 10 === 0 || completed === equipments.length) {
          message(`Auditando catálogo vivo: ${completed}/${equipments.length} equipamentos processados…`);
        }
      }
    });
    const audit = auditEquipmentBundlesCoverageV1(bundles.filter(Boolean),registry,{completeCatalogue:readErrors.length===0});
    audit.equipmentsExpected = equipments.length;
    audit.readErrors = readErrors;
    audit.complete = audit.complete && readErrors.length === 0 && audit.bundlesScanned === equipments.length;
    if (readErrors.length) {
      audit.blockers.push(...readErrors.map(row => ({
        type: 'bundle_read_error',
        key: row.equipmentId,
        title: row.equipmentName,
        text: row.error
      })));
    }
    renderAudit(audit);
    message(
      audit.complete
        ? `Catálogo vivo auditado: ${audit.bundlesScanned} equipamento(s), sem efeito silenciosamente não mapeado.`
        : `Auditoria encontrou ${audit.blockers.length} bloqueador(es). O Brain deve permanecer conservador até revisão.`,
      audit.complete ? 'success' : 'warning'
    );
    window.dispatchEvent(new CustomEvent('echo-brain:equipment-coverage-audited', { detail: audit }));
  } catch (error) {
    message(`Falha ao auditar catálogo vivo: ${error?.message || error}`, 'danger');
  } finally {
    busy = false;
    if (button) button.disabled = false;
  }
}

if (ensureSurface()) {
  $('brain-audit-live-equipment-coverage')?.addEventListener('click', auditLiveCatalog);
}
