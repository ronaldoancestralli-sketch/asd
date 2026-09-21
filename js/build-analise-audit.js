import { equipmentEligibility } from './equipment-eligibility.js?v=1';
import * as audit from './build-analise-audit-core.js?v=5&sb=20260823-security-supabase-pin-1&sc=20260906-1&eq=20260907-effects-1';

export * from './build-analise-audit-core.js?v=5&sb=20260823-security-supabase-pin-1&sc=20260906-1&eq=20260907-effects-1';

const BRIDGE_SCHEMA_VERSION = 'build-workbench-counterfactual-bridge-v1';
let liveContext = null;
let liveResult = null;
let publicUiPromise = null;

function cloneLevel(level = {}) {
  return {
    ...level,
    stats: level?.stats && typeof level.stats === 'object'
      ? { ...level.stats }
      : {}
  };
}

function cloneItem(item) {
  if (!item) return null;
  return {
    ...item,
    media: item.media ? { ...item.media } : null,
    levels: (item.levels || []).map(cloneLevel),
    set: item.set ? {
      ...item.set,
      bonus: (item.set.bonus || []).map(bonus => ({ ...bonus }))
    } : null
  };
}

function cloneEquipped(equipados = {}) {
  return Object.fromEntries(
    Object.entries(equipados).map(([slotKey, item]) => [slotKey, cloneItem(item)])
  );
}

function publicContextSnapshot(context = {}) {
  return {
    heroi: context.heroi ? { ...context.heroi } : null,
    slots: (context.slots || []).map(slot => ({ ...slot })),
    equipados: cloneEquipped(context.equipados || {})
  };
}

function itemIdentity(item) {
  if (!item) return 'empty';
  return `${String(item.databaseId || item.id || '')}:${String(item.raridade || '')}`;
}

function changedSlots(before = {}, after = {}) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter(key => itemIdentity(before[key]) !== itemIdentity(after[key]));
}

function compatibleWithLiveHero(item, slotKey) {
  if (!item || !liveContext?.heroi?.databaseId) return false;
  if (item.slot && String(item.slot) !== String(slotKey)) return false;
  return equipmentEligibility(item, liveContext.heroi).eligible;
}

async function evaluateOneChange(context = {}) {
  if (!liveContext?.heroi?.databaseId) throw new Error('build_workbench_context_unavailable');

  const candidateEquipped = cloneEquipped(context.equipados || {});
  const changed = changedSlots(liveContext.equipados || {}, candidateEquipped);
  if (changed.length > 1) throw new Error('build_counterfactual_multiple_slots_not_allowed');

  for (const slotKey of changed) {
    const item = candidateEquipped[slotKey];
    if (item && !compatibleWithLiveHero(item, slotKey)) {
      throw new Error('build_counterfactual_incompatible_equipment');
    }
  }

  return audit.analisarBuildComAutoridadeV4({
    heroi: liveContext.heroi,
    slots: liveContext.slots,
    equipados: candidateEquipped,
    dados: liveContext.dados,
    calculationConditions: liveContext.calculationConditions
  }, 'comparison');
}

const bridge = {
  schemaVersion: BRIDGE_SCHEMA_VERSION,
  getSnapshot() {
    if (!liveContext) return null;
    return {
      schemaVersion: BRIDGE_SCHEMA_VERSION,
      context: publicContextSnapshot(liveContext),
      result: liveResult
    };
  },
  evaluateOneChange
};

function announceWorkbenchChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('echo:build-workbench-change', {
    detail: { schemaVersion: BRIDGE_SCHEMA_VERSION }
  }));
}

function ensurePublicCounterfactualUi() {
  if (typeof document === 'undefined' || document.body?.dataset?.cmsPage !== 'build_creator') return;
  if (!publicUiPromise) {
    publicUiPromise = import('./criar-build-counterfactual.js?v=4&sb=20260823-security-supabase-pin-1&sc=20260906-1&eq=20260907-effects-1')
      .then(module => module.initBuildCounterfactual?.(bridge))
      .catch(error => {
        publicUiPromise = null;
        console.warn('[build-counterfactual] UI pública indisponível:', error);
      });
  }
}

export function analisarBuild(contexto = {}) {
  const resultado = audit.analisarBuild(contexto);

  if (contexto?.heroi?.databaseId) {
    liveContext = contexto;
    liveResult = resultado;

    if (typeof queueMicrotask === 'function') {
      queueMicrotask(() => {
        announceWorkbenchChange();
        ensurePublicCounterfactualUi();
      });
    } else {
      Promise.resolve().then(() => {
        announceWorkbenchChange();
        ensurePublicCounterfactualUi();
      });
    }
  }

  return resultado;
}

function trackPublicResult(contexto, resultado) {
  if (contexto?.heroi?.databaseId) {
    liveContext = contexto;
    liveResult = resultado;
    if (typeof queueMicrotask === 'function') queueMicrotask(() => {
      announceWorkbenchChange();
      ensurePublicCounterfactualUi();
    });
    else Promise.resolve().then(() => {
      announceWorkbenchChange();
      ensurePublicCounterfactualUi();
    });
  }
  return resultado;
}

export function prepararAnalisePublicaV4(contexto = {}) {
  return trackPublicResult(contexto, audit.prepararAnalisePublicaV4(contexto));
}

export async function analisarBuildComAutoridadeV4(contexto = {}, surface = 'build_lab') {
  return trackPublicResult(contexto, await audit.analisarBuildComAutoridadeV4(contexto, surface));
}
