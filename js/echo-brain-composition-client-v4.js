import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import {
  PUBLIC_COMPOSITION_SCORE_SCHEMA_V4,
  validateCompositionScoreResponseV4,
  validateCompositionRecommendationResponseV4
} from './echo-brain-public-response-v4.js?v=20260824-brain-response-2';

function validTeam(ids) {
  return Array.isArray(ids) && ids.length === 3 && new Set(ids.map(String)).size === 3;
}

function validSelection(ids) {
  return Array.isArray(ids) && ids.length <= 3 && new Set(ids.map(String)).size === ids.length;
}

export async function scoreCompositionTeamsV4(teams = [], options = {}) {
  const normalized = teams
    .map((team, index) => ({ requestId: String(team.requestId ?? index), heroIds: (team.heroIds || []).map(String) }))
    .filter(team => validTeam(team.heroIds))
    .slice(0, 24);
  if (!normalized.length) return { ok: false, error: 'teams_required', results: [] };
  const compareTo = validTeam(options.compareTo?.heroIds) ? { heroIds: options.compareTo.heroIds.map(String) } : null;
  const auditRequested = options.recordAudit === true;

  const { data, error } = await supabase.functions.invoke('echo-brain-score', {
    body: {
      teams: normalized,
      compareTo,
      recordExposure: false,
      recordAudit: auditRequested,
      auditContext: options.auditContext || null,
      surface: options.surface || 'composition_lab'
    }
  });
  if (error) {
    console.warn('[echo-brain-composition-client-v4] scorer indisponível; baseline funcional permanece visível.', error?.message || error);
    return { ok: false, error: error?.message || 'score_unavailable', results: [] };
  }
  const value = validateCompositionScoreResponseV4(data, normalized);
  if (!value.ok) {
    console.warn('[echo-brain-composition-client-v4] resposta incompatível rejeitada; nenhuma nota local será usada.', value.detail || value.error);
  }
  return value;
}

export async function recommendCompositionTeamsV4(selectionHeroIds = [], options = {}) {
  const selection = selectionHeroIds.map(String).filter(Boolean);
  if (!validSelection(selection)) return { ok: false, error: 'invalid_recommendation_selection', results: [] };
  const limit = 4;
  const { data, error } = await supabase.functions.invoke('echo-brain-score', {
    body: {
      action: 'recommendations',
      selectionHeroIds: selection,
      limit,
      recordExposure: false,
      recordAudit: false,
      surface: options.surface || 'composition_lab'
    }
  });
  if (error) {
    console.warn('[echo-brain-composition-client-v4] recomendações do servidor indisponíveis; nenhum rank local será usado.', error?.message || error);
    return { ok: false, error: error?.message || 'recommendations_unavailable', results: [] };
  }
  const value = validateCompositionRecommendationResponseV4(data, selection, limit);
  if (!value.ok) {
    console.warn('[echo-brain-composition-client-v4] resposta de recomendação incompatível rejeitada.', value.detail || value.error);
  }
  return value;
}

export async function registerCompositionExposureV4(result, contextHash = null) {
  if (!result?.key) return null;
  const { data, error } = await supabase.rpc('echo_brain_register_recommendation_exposure', {
    p_surface: 'composition_lab',
    p_entity_key: result.key,
    p_semantic_schema: result.semanticSchema || null,
    p_model_id: result.model?.id || null,
    p_model_version: result.model?.version || null,
    p_brain_influence: Number(result.influence || 0),
    p_context_hash: contextHash ? String(contextHash).slice(0, 160) : null
  });
  if (error) {
    console.warn('[echo-brain-composition-client-v4] não foi possível registrar proveniência da recomendação.', error?.message || error);
    return null;
  }
  return data || null;
}

export function clearCompositionScoreCacheV4() {
  // Mantido por compatibilidade com eventos legados. Decisões públicas v4 não
  // usam cache no cliente: cada nota confirma a versão corrente no servidor.
}

if (typeof window !== 'undefined') {
  for (const eventName of [
    'echo-brain:equipment-memory-changed',
    'echo-brain:knowledge-changed',
    'echo-brain:model-changed'
  ]) {
    window.addEventListener(eventName, clearCompositionScoreCacheV4);
  }
}
