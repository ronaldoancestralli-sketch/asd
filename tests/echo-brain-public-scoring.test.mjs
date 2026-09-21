import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const client = read('js/echo-brain-composition-client-v4.js');
const orchestrator = read('js/compositions-semantic-v4.js');
const publicExperience = read('js/compositions-experience-v3.js');
const scorer = read('supabase/functions/echo-brain-score/index.ts');
const policy = read('supabase/functions/_shared/echo-brain-public-policy-v4.ts');
const adminInvestigation = read('admin/js/echo-brain-investigation-ui.js');
const train = read('supabase/functions/echo-brain-train/index.ts');
const evaluate = read('supabase/functions/echo-brain-evaluate/index.ts');
const shadow = read('supabase/functions/echo-brain-shadow/index.ts');
const backtest = read('supabase/functions/echo-brain-backtest/index.ts');
const buildAnalysis = read('js/build-analise.js');
const buildCreator = read('js/criar-build.js');
const buildComparison = read('js/comparar-build.js');
const buildAuditBridge = read('js/build-analise-audit.js');
const buildCounterfactualAdmin = read('admin/js/echo-brain-build-counterfactual-ui.js');
const itemFitClient = fs.existsSync(path.join(ROOT, 'js/echo-brain-item-fit-client-v4.js'))
  ? read('js/echo-brain-item-fit-client-v4.js')
  : '';
const itemFitServer = fs.existsSync(path.join(ROOT, 'supabase/functions/echo-brain-item-fit/index.ts'))
  ? read('supabase/functions/echo-brain-item-fit/index.ts')
  : '';
const migrations = fs.readdirSync(path.join(ROOT, 'supabase/migrations'))
  .filter(name => name.endsWith('.sql'))
  .sort()
  .map(name => read(`supabase/migrations/${name}`))
  .join('\n');

function publicReturnZone(source) {
  const marker = 'return json({\n    ok: true';
  const at = source.lastIndexOf(marker);
  assert.ok(at >= 0, 'resposta pública final do scorer não encontrada');
  return source.slice(at);
}

function functionZone(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert.ok(start >= 0 && end > start, `zona ${name} não encontrada`);
  return source.slice(start, end);
}

test('cliente público usa somente o endpoint seguro do Echo Brain para scoring', () => {
  assert.match(client, /supabase\.functions\.invoke\('echo-brain-score'/);
  for (const forbidden of [
    "from('composition_model_versions')",
    "from('echo_brain_settings')",
    'weights',
    'coefficients',
    'intercept'
  ]) {
    assert.equal(client.includes(forbidden), false, `cliente público não pode acessar ${forbidden}`);
  }
});

test('cliente público não conserva decisão entre validações remotas de conhecimento', () => {
  assert.equal(client.includes('CACHE_TTL'), false);
  assert.equal(client.includes('cache.set('), false);
  assert.match(client, /echo-brain:equipment-memory-changed/);
  assert.match(client, /echo-brain:knowledge-changed/);
  assert.match(client, /echo-brain:model-changed/);
});

test('cliente rejeita resposta V4 incompatível antes de renderizar ou armazenar em cache', async () => {
  const { validateCompositionScoreResponseV4 } = await import('../js/echo-brain-public-response-v4.js');
  const teams = [{
    requestId: 'r1',
    heroIds: [
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002'
    ]
  }];
  const result = {
    requestId: 'r1',
    key: [...teams[0].heroIds].sort().join('|'),
    heroIds: teams[0].heroIds,
    heroDisplay: teams[0].heroIds.map((id, index) => ({ id, name: `Hero ${index + 1}` })),
    semanticSchema: 'composition-semantic-context-v4',
    equipmentContextSchema: 'composition-equipment-context-v1',
    finalScore: 72,
    functionalSynergy: 70,
    heroSkillSemanticSynergy: 71,
    semanticSynergy: 72,
    equipmentAdjustment: 1,
    equipmentContext: {
      schemaVersion: 'composition-equipment-context-v1',
      sourceAvailable: true,
      complete: true,
      applied: true,
      adjustment: 1,
      confidence: .9,
      supportAffinity: .8
    },
    observedPerformance: null,
    mechanicalDemand: 2,
    confidence: {
      rules: .9,
      verification: 1,
      knowledgeFreshness: 1,
      equipmentContext: .9,
      model: 0,
      observedEvidence: 0,
      overall: .95
    },
    influence: 0,
    knowledge: {
      fresh: true,
      pending: 0,
      unknown: false,
      equipmentContextAvailable: true,
      seasonId: '00000000-0000-4000-8000-000000000099',
      gameVersion: '4.0.0',
      heroes: teams[0].heroIds.map((id, index) => ({ id, version: index + 1, fingerprint: 'a'.repeat(64) })),
      equipmentCatalogueFingerprint: 'b'.repeat(64)
    },
    strengths: [],
    risks: [],
    model: null
  };
  const valid = {
    ok: true,
    mode: 'score',
    authority: 'server',
    fallback: 'none',
    localInfluence: 0,
    schemaVersion: 'composition-semantic-context-v4',
    equipmentContextSchemaVersion: 'composition-equipment-context-v1',
    learning: { influence: 0, maxInfluence: 0, debt: { fresh: true, pending: 0, unknown: false } },
    results: [result]
  };

  assert.equal(validateCompositionScoreResponseV4(valid, teams).ok, true);
  assert.equal(validateCompositionScoreResponseV4({ ...valid, schemaVersion: 'composition-semantic-context-v3' }, teams).ok, false);
  assert.equal(validateCompositionScoreResponseV4({ ...valid, results: [{ ...result, key: 'wrong' }] }, teams).ok, false);
  assert.equal(validateCompositionScoreResponseV4({ ...valid, results: [] }, teams).ok, false);
  assert.equal(validateCompositionScoreResponseV4({ ...valid, results: [{ ...result, finalScore: Number.NaN }] }, teams).ok, false);
  assert.equal(validateCompositionScoreResponseV4({
    ...valid,
    results: [{ ...result, equipmentContext: { ...result.equipmentContext, adjustment: 5 } }]
  }, teams).ok, false);
  assert.match(client, /validateCompositionScoreResponseV4\(data, normalized\)/);
  assert.equal(client.includes('cache.set('), false, 'resposta validada ainda precisa ser reconfirmada na próxima decisão');
});

test('treino, avaliação, shadow e replay isolam observações orgânicas permanentemente', () => {
  for (const [name, source] of Object.entries({ train, evaluate, shadow, backtest })) {
    assert.equal(source.includes('organic_training_only !== false'), false, `${name} não pode tornar o isolamento configurável`);
    assert.equal(source.includes("'all_verified'"), false, `${name} não pode aceitar proveniência mista`);
    assert.match(source, /recommended_by_brain/);
    assert.match(source, /observation_provenance/);
    assert.match(source, /organic/);
  }
  assert.match(train, /row\.recommended_by_brain !== true && row\.observation_provenance === 'organic'/);
  for (const source of [evaluate, shadow]) {
    assert.match(source, /\.eq\('recommended_by_brain', false\)\.eq\('observation_provenance', 'organic'\)/);
  }
  assert.match(backtest, /row\.recommended_by_brain !== true && row\.observation_provenance === 'organic'/);
  assert.equal(evaluate.includes('Number(v) || 0'), false, 'avaliação não pode mascarar coeficiente inválido');
  assert.equal(shadow.includes('Number(v) || 0'), false, 'shadow não pode mascarar coeficiente inválido');
  assert.equal(backtest.includes('Number(v) || 0'), false, 'replay não pode mascarar coeficiente inválido');
});

test('rebuild Admin do grafo rejeita payload vazio/inválido e resolve somente entidades cobertas', () => {
  for (const token of [
    'semantic_edges_cannot_be_empty',
    'semantic_edge_type_invalid',
    'semantic_edge_relation_invalid',
    'semantic_edge_fingerprint_invalid',
    'resolvedEntityIds',
    'source_id=i.entity_id'
  ]) {
    assert.ok(migrations.includes(token), `migration de proteção do grafo ausente: ${token}`);
  }
  assert.match(migrations, /jsonb_array_length\(p_edges\)\s*=\s*0/);
  assert.match(migrations, /scope in \('build_recommendations','composition_recommendations'\)/);
});

test('Item Fit permanece servidor e as builds públicas usam somente o Calculation V2', () => {
  assert.match(itemFitClient, /functions\.invoke\('echo-brain-item-fit'/);
  assert.match(itemFitClient, /validatePublicItemFitResponseV4/);
  assert.match(itemFitClient, /localInfluence\s*!==\s*0/);
  assert.match(itemFitServer, /echo-brain-item-fit-public-v4/);
  assert.match(itemFitServer, /from\('hero_complete_base_stats'\)/);
  assert.match(itemFitServer, /from\('hero_skills'\)/);
  assert.match(itemFitServer, /verification_status', 'verified'/);
  assert.match(itemFitServer, /needs_recheck', false/);
  assert.match(itemFitServer, /from\('equipment_brain_versions'\)/);
  assert.match(itemFitServer, /knowledge_not_current/);
  assert.match(itemFitServer, /evaluateAppliedModifiersForHeroV4/);
  assert.match(itemFitServer, /applyEquipmentStats/);
  assert.match(itemFitServer, /echo_brain_register_recommendation_exposure/);

  for (const [name, source] of Object.entries({ buildAuditBridge, buildCounterfactualAdmin })) {
    assert.match(source, /analisarBuildComAutoridadeV4/, `${name} precisa aguardar a autoridade Item Fit do servidor`);
  }
  assert.match(buildAnalysis, /prepararAnalisePublicaV4/);
  assert.match(buildAnalysis, /echoBrain:\s*null/);
  assert.match(buildAnalysis, /fallback:\s*'none'/);

  for (const [name, source] of Object.entries({ buildCreator, buildComparison })) {
    assert.match(source, /analyzeBuildV2/,
      `${name} precisa usar o Calculation V2`);
    assert.match(source, /loadCalculationDataV2/,
      `${name} precisa carregar o catálogo público v2`);
    assert.doesNotMatch(source, /analisarBuildComAutoridadeV4|prepararAnalisePublicaV4/,
      `${name} não pode voltar ao motor de análise legado`);
  }
  assert.doesNotMatch(buildCounterfactualAdmin, /\banalisarBuild\s*\(/);
});

test('recomendação pública de composições nasce e é ranqueada no Semantic v4 servidor', () => {
  const analysisSurface = functionZone(publicExperience, 'renderAnalysis', 'approximateTeamScore');
  const recommendationSurface = functionZone(publicExperience, 'renderRecommendations', 'renderAll');
  const partialSurface = functionZone(publicExperience, 'renderPartialAnalysis', 'renderStrengthCard');
  const pickerSurface = functionZone(publicExperience, 'renderPicker', 'fillSelectOptions');
  const statusSurface = functionZone(publicExperience, 'statusCopy', 'renderSlot');

  assert.doesNotMatch(analysisSurface, /baseEvaluationFor|adaptiveEvaluationFor|learnedInsight/);
  assert.doesNotMatch(recommendationSurface, /recommendationCandidates|rankAdaptiveCandidates|approximateTeamScore/);
  assert.doesNotMatch(partialSurface, /profileFor|learningStatusCopy/);
  assert.doesNotMatch(pickerSurface, /heroCapabilities/);
  assert.doesNotMatch(statusSurface, /learningShortStatus/);
  assert.match(orchestrator, /recommendCompositionTeamsV4/);
  assert.match(client, /action:\s*'recommendations'/);
  assert.match(scorer, /normalizePublicRecommendationPayload/);
  assert.match(scorer, /recommendationCandidatesFromCatalog/);
  assert.match(scorer, /b\.finalScore\s*-\s*a\.finalScore/);
  assert.match(scorer, /authority:\s*'server'/);
  assert.match(scorer, /fallback:\s*'none'/);
  assert.match(scorer, /localInfluence:\s*0/);
});

test('Composições não aceitam cache temporal nem conhecimento público sem versão exata', () => {
  assert.equal(client.includes('CACHE_TTL'), false, 'decisão pública não pode sobreviver por TTL a uma troca remota de versão');
  assert.equal(client.includes('cache.set('), false, 'resposta pública não pode ser armazenada sem nova validação no servidor');
  assert.match(scorer, /from\('echo_brain_knowledge_versions'\)/);
  assert.match(scorer, /from\('equipment_brain_versions'\)/);
  assert.match(scorer, /from\('seasons'\)/);
  assert.match(scorer, /knowledge_not_current/);
  assert.match(scorer, /semantic_fingerprint/);
  assert.match(client, /validateCompositionRecommendationResponseV4/);
});

test('Composições só tornam a decisão pública após registrar proveniência orgânica', () => {
  const selectedFlow = functionZone(orchestrator, 'scoreSelected', 'recommendationSignature');
  const recommendationFlow = functionZone(orchestrator, 'rescoreRecommendations', 'scheduleRecommendations');
  assert.match(selectedFlow, /ensureCompositionExposure/);
  assert.ok(selectedFlow.indexOf('ensureCompositionExposure') < selectedFlow.indexOf('renderSemanticStrip(result)'));
  assert.match(recommendationFlow, /Promise\.all\(response\.results\.map/);
  assert.ok(recommendationFlow.indexOf('Promise.all(response.results.map') < recommendationFlow.indexOf("host.innerHTML = response.results.map(recommendationCard)"));
  assert.match(orchestrator, /proveniência indisponível/);
});

test('validação pública de lote, UUID, requestId e compareTo possui uma única fonte canônica', () => {
  assert.match(policy, /maxTeams: 24/);
  assert.match(policy, /PUBLIC_HERO_UUID_RE/);
  assert.match(policy, /normalizePublicScoringPayload/);
  assert.match(policy, /duplicate_request_id/);
  assert.match(policy, /each_team_requires_three_unique_uuid_heroes/);
  assert.match(policy, /compare_team_requires_three_unique_uuid_heroes/);
  assert.match(scorer, /const payload = normalizePublicScoringPayload\(body\)/);
  assert.match(scorer, /const MAX_TEAMS = PUBLIC_SCORING_LIMITS\.maxTeams/);
  assert.equal(scorer.includes('const UUID_RE ='), false, 'scorer não deve manter segunda regex de UUID');
  assert.equal(scorer.includes('function normalizeTeam('), false, 'scorer não deve manter segundo normalizador de time');
  assert.equal(scorer.includes('function validTeamIds('), false, 'scorer não deve manter segundo validador de trio');
  assert.equal(scorer.includes('body.teams.slice(0, 24)'), false, 'batch excessivo não pode ser truncado silenciosamente');
  const validateAt = scorer.indexOf('const payload = normalizePublicScoringPayload(body)');
  const authAt = scorer.indexOf('const auditAllowed = auditRequested ? await adminAuditAllowed(req) : false');
  const domainQueryAt = scorer.indexOf("service.from('echo_brain_settings')");
  assert.ok(validateAt >= 0 && authAt > validateAt && domainQueryAt > validateAt, 'validação estrutural deve ocorrer antes de auth/queries');
});

test('corpo HTTP tem teto real por bytes antes de virar payload do scorer', () => {
  assert.match(scorer, /readJsonBodyLimited/);
  const bodyReadAt = scorer.indexOf('const parsedBody = await readJsonBodyLimited(req)');
  const payloadAt = scorer.indexOf('const payload = normalizePublicScoringPayload(body)');
  const domainQueryAt = scorer.indexOf("service.from('echo_brain_settings')");
  assert.ok(bodyReadAt >= 0 && payloadAt > bodyReadAt && domainQueryAt > payloadAt, 'bytes e payload devem ser validados antes de consultas de domínio');
  assert.match(policy, /maxBodyBytes: 32 \* 1024/);
  assert.match(policy, /payload_too_large/);
  assert.match(policy, /reader\.cancel\('payload_too_large'\)/);
});

test('scorer mantém pesos internos fora da resposta pública', () => {
  const response = publicReturnZone(scorer);
  assert.equal(/\bweights\b/.test(response), false, 'resposta pública não pode serializar weights');
  assert.equal(/\bcoefficients\b/.test(response), false, 'resposta pública não pode serializar coefficients');
  assert.equal(/\bintercept\b/.test(response), false, 'resposta pública não pode serializar intercept');
  assert.match(response, /schemaVersion: SEMANTIC_CONTEXT_V4_FEATURE_SCHEMA_VERSION/);
  assert.match(response, /results: responseResults/);
});

test('aprendizado público delega gates fail-closed para policy executável', () => {
  assert.match(scorer, /learningPreflightV4/);
  assert.match(scorer, /resolveLearningInfluenceV4/);
  assert.match(scorer, /validateModelSpecV4/);
  assert.match(scorer, /const preflight = learningPreflightV4\(settings, debt\)/);
  assert.match(scorer, /const policyResolution = resolveLearningInfluenceV4/);
  assert.match(scorer, /policyResolution\.reason === null/);
  for (const reason of [
    'settings_unavailable',
    'emergency',
    'knowledge_or_patch_debt',
    'learning_disabled',
    'active_model_not_configured',
    'invalid_influence_config',
    'learning_influence_zero',
    'active_model_unavailable',
    'active_model_mismatch',
    'semantic_v4_active_model_required'
  ]) {
    assert.ok(policy.includes(`'${reason}'`), `policy precisa preservar razão fail-closed ${reason}`);
  }
});

test('weights e influência inválidos são validados na policy sem coerção silenciosa', () => {
  assert.match(policy, /validateModelSpecV4/);
  assert.match(policy, /numericCoefficients\.some\(\(value: number \| null\) => value === null\)/);
  assert.equal(policy.includes('Number(value) || 0'), false, 'coeficiente inválido não pode ser convertido silenciosamente em zero');
  assert.match(policy, /const modelWeight = finitePolicyNumber\(model\.influence_weight\)/);
  assert.match(policy, /clampPolicy\(Math\.min\(preflight\.maxInfluence, modelWeight\), 0, \.55\)/);
  assert.match(scorer, /return validateModelSpecV4\(model, schema, featureNamesForSchemaV4\(schema\)\)/);
});

test('modelo e weights só são lidos quando o runtime permite aprendizado e pelo ID exato configurado', () => {
  assert.match(scorer, /const shouldLoadModel = Boolean\(preflight\.loadModel && debt\.fresh\)/);
  const gateAt = scorer.indexOf('if (shouldLoadModel) {');
  const modelReadAt = scorer.indexOf("service.from('composition_model_versions')");
  assert.ok(gateAt >= 0 && modelReadAt > gateAt, 'leitura do modelo deve ficar dentro do gate shouldLoadModel');
  assert.match(scorer, /\.eq\('id', configuredActiveModelId\)/);
  const modelReadZone = scorer.slice(modelReadAt, scorer.indexOf('const spec = modelSpec', modelReadAt));
  assert.equal(modelReadZone.includes(".order('version'"), false, 'modelo ativo não pode ser escolhido por ordenação');
  assert.match(policy, /active_model_not_configured/);
  assert.match(policy, /active_model_unavailable/);
});

test('influência aprendida é reduzida pela cobertura verificada específica do trio', () => {
  assert.match(scorer, /effectiveTeamInfluenceV4/);
  assert.match(scorer, /const teamInfluence = effectiveTeamInfluenceV4\(influence, assessment\?\.components\?\.verifiedSkillCoverage\)/);
  assert.match(scorer, /const effectiveInfluence = teamInfluence\.influence/);
  assert.match(policy, /teamVerificationInfluenceFactorV4/);
  assert.match(policy, /return clampPolicy\(\(coverage - \.50\) \/ \.50, 0, 1\)/);
  assert.match(scorer, /influenceEvidence/);
  assert.match(scorer, /insufficient_team_verification/);
});

test('scorer não grava exposição pública com service role e auditoria detalhada exige admin', () => {
  assert.equal(scorer.includes('body?.recordExposure === true'), false, 'scorer não deve aceitar gravação pública de exposição');
  assert.match(scorer, /Recommendation exposures are never written with service-role/);
  assert.match(scorer, /service\.auth\.getUser\(token\)/);
  assert.match(scorer, /profile\.role === 'admin' \|\| profile\.is_admin === true/);
  assert.match(scorer, /profile\.is_blocked !== true/);
  assert.match(scorer, /const auditRequested = body\?\.recordAudit === true/);
  assert.match(scorer, /const auditAllowed = auditRequested \? await adminAuditAllowed\(req\) : false/);
  assert.match(scorer, /if \(auditAllowed && responseResults\.length\)/);
  assert.match(client, /rpc\('echo_brain_register_recommendation_exposure'/);
});

test('página pública não pede auditoria detalhada; painel Admin pede explicitamente', () => {
  assert.equal(orchestrator.includes('recordAudit: true'), false, 'Composições pública não deve acionar auditoria administrativa detalhada');
  assert.equal(orchestrator.includes('auditContext:'), false, 'Composições pública não deve enviar contexto de auditoria administrativa');
  assert.match(adminInvestigation, /recordAudit: true/);
  assert.match(adminInvestigation, /auditContext: `admin-investigation:/);
});

test('Semantic v4 é o árbitro final dos cards sem double-learning no orquestrador', () => {
  assert.match(orchestrator, /scoreCompositionTeamsV4/);
  assert.match(orchestrator, /recommendCompositionTeamsV4/);
  assert.match(orchestrator, /response\.results\.map\(recommendationCard\)/);
  assert.equal(orchestrator.includes('response.results.sort('), false, 'orquestrador público não deve ranquear a resposta do servidor');
  assert.equal(orchestrator.includes('composition-adaptive-learning'), false, 'orquestrador final não deve importar learner legado');
  assert.equal(orchestrator.includes('rankAdaptiveCandidates'), false, 'orquestrador final não deve reaplicar learner legado');
});

test('falha do scorer é explícita e não inventa score ou rank local', () => {
  assert.match(client, /nenhuma nota local será usada/);
  assert.match(client, /return \{ ok: false, error:/);
  assert.match(orchestrator, /nenhum rank local foi usado/);
});

test('pedido de auditoria do cliente não contorna autorização do servidor', () => {
  assert.match(client, /const auditRequested = options\.recordAudit === true/);
  assert.match(client, /recordAudit: auditRequested/);
  assert.match(scorer, /const auditRequested = body\?\.recordAudit === true/);
  assert.match(scorer, /const auditAllowed = auditRequested \? await adminAuditAllowed\(req\) : false/);
  assert.match(scorer, /audit: \{ requested: auditRequested, recorded: auditAllowed \}/);
});

test('ranking público descarta respostas assíncronas antigas e reexecuta atualização pendente', () => {
  assert.match(orchestrator, /let recommendationRequestToken = 0/);
  assert.match(orchestrator, /const token = \+\+recommendationRequestToken/);
  assert.match(orchestrator, /token !== recommendationRequestToken/);
  assert.match(orchestrator, /sourceSignature !== recommendationSignature\(selectedIds\)/);
  assert.match(orchestrator, /lastRecommendationSignature = sourceSignature/);
  assert.match(orchestrator, /recommendationRefreshPending = true/);
  assert.match(orchestrator, /if \(recommendationRefreshPending\) scheduleRecommendations\(\)/);
  assert.match(orchestrator, /invalidateRecommendationRequest\(\)/);
  assert.match(orchestrator, /requestToken \+= 1/);
});

test('troca de trio remove imediatamente a apresentação v4 antiga antes do novo score', () => {
  assert.match(orchestrator, /function clearSelectedSemanticPresentation\(\)/);
  assert.match(orchestrator, /Nenhuma nota local é exibida/);
  assert.match(orchestrator, /requestToken \+= 1;\n    clearSelectedSemanticPresentation\(\);\n    invalidateRecommendationRequest\(\)/);
});

