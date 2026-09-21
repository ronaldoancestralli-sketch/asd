import { loadEquipmentBrainHealth, equipmentBrainHealthCopy } from './echo-brain-equipment-health.js?v=1&sb=20260823-security-supabase-pin-1';
import {
  bootstrapEquipmentBrainKnowledge,
  reconcileEquipmentBrainQueue
} from './echo-brain-equipment-reconcile.js?v=1&sb=20260823-security-supabase-pin-1&ops=20260905&eq=20260907-effects-1';

const $ = id => document.getElementById(id);
let busy = false;

function n(value) {
  return value === null || value === undefined ? '—' : Number(value || 0).toLocaleString('pt-BR');
}

function setBusy(value) {
  busy = value;
  for (const id of ['brain-equipment-bootstrap', 'brain-equipment-reconcile']) {
    const button = $(id);
    if (button) button.disabled = value;
  }
}

function message(text = '', tone = '') {
  const host = $('brain-equipment-message');
  if (!host) return;
  host.textContent = text;
  host.dataset.tone = tone;
}

async function render() {
  const health = await loadEquipmentBrainHealth();
  const state = $('brain-equipment-state');
  if (state) {
    state.textContent = health.available ? (health.stale ? 'RECONCILIAÇÃO NECESSÁRIA' : 'ATUALIZADO') : 'INDISPONÍVEL';
    state.dataset.tone = !health.available ? 'danger' : health.requiresRetraining ? 'danger' : health.stale ? 'warning' : 'active';
  }
  if ($('brain-equipment-versions')) $('brain-equipment-versions').textContent = n(health.versions);
  if ($('brain-equipment-dirty')) $('brain-equipment-dirty').textContent = n(health.pendingItems);
  if ($('brain-equipment-invalidations')) $('brain-equipment-invalidations').textContent = n(health.pendingInvalidations);
  if ($('brain-equipment-training')) $('brain-equipment-training').textContent = n(health.pendingTraining);
  if ($('brain-equipment-copy')) $('brain-equipment-copy').textContent = equipmentBrainHealthCopy(health);
  return health;
}

async function bootstrap() {
  if (busy) return;
  const ok = window.confirm('Criar a versão-base dos equipamentos que ainda não possuem memória no Echo Brain? Isso não altera os equipamentos nem libera influência pública.');
  if (!ok) return;
  setBusy(true);
  message('Criando baseline dos equipamentos atuais…');
  try {
    const result = await bootstrapEquipmentBrainKnowledge();
    message(`Baseline concluída: ${result.bootstrapped} criado(s), ${result.alreadyVersioned} já versionado(s), ${result.failed} falha(s).`, result.failed ? 'warning' : 'success');
    await render();
    window.dispatchEvent(new CustomEvent('echo-brain:equipment-memory-changed', { detail: result }));
  } catch (error) {
    message(`Falha ao criar baseline: ${error?.message || error}`, 'danger');
  } finally {
    setBusy(false);
  }
}

async function reconcile() {
  if (busy) return;
  const ok = window.confirm('Reconciliar agora todos os equipamentos marcados como alterados? O Brain comparará o estado atual com a última versão registrada e criará invalidações quando necessário.');
  if (!ok) return;
  setBusy(true);
  message('Comparando itens alterados com a última versão conhecida…');
  try {
    const result = await reconcileEquipmentBrainQueue();
    message(`Reconciliação: ${result.reconciled}/${result.processed} item(ns) processado(s); ${result.requiresRetraining} exigem novo treino; ${result.failed} falha(s).`, result.failed ? 'warning' : 'success');
    await render();
    window.dispatchEvent(new CustomEvent('echo-brain:equipment-memory-changed', { detail: result }));
  } catch (error) {
    message(`Falha na reconciliação: ${error?.message || error}`, 'danger');
  } finally {
    setBusy(false);
  }
}

$('brain-equipment-bootstrap')?.addEventListener('click', bootstrap);
$('brain-equipment-reconcile')?.addEventListener('click', reconcile);

try {
  await render();
} catch (error) {
  console.warn('[echo-brain-equipment-ui] saúde de equipamentos indisponível:', error);
  message('A memória versionada de equipamentos ainda não está disponível neste ambiente.', 'warning');
}

try {
  await import('./echo-brain-investigation-ui.js?v=20260824-brain-investigation-2&sb=20260823-security-supabase-pin-1&ops=20260905&eq=20260907-effects-1');
  await import('./echo-brain-build-counterfactual-ui.js?v=20260905-operator-consistency-1&sb=20260823-security-supabase-pin-1&sc=20260906-1&eq=20260907-effects-1');
  await import('./echo-brain-equipment-coverage-ui.js?v=20260823-brain-coverage-1&sb=20260823-security-supabase-pin-1&ops=20260905&sc=20260906-1&eq=20260907-effects-1');
} catch (error) {
  console.warn('[echo-brain-equipment-ui] investigação/contrafactual/cobertura indisponível:', error);
}
