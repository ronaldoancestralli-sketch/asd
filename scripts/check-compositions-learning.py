#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
paths = {
    'html': ROOT / 'composicoes.html',
    'ui': ROOT / 'js' / 'compositions-experience-v3.js',
    'bridge': ROOT / 'js' / 'composition-adaptive-learning-public-bridge.js',
    'learning': ROOT / 'js' / 'composition-adaptive-learning.js',
    'engine': ROOT / 'js' / 'composition-synergy-engine-v2.js',
    'css': ROOT / 'css' / 'compositions-learning.css',
}
failures = []
for name, path in paths.items():
    if not path.exists():
        failures.append(f'arquivo ausente: {path.relative_to(ROOT)}')

if not failures:
    html = paths['html'].read_text(encoding='utf-8')
    ui = paths['ui'].read_text(encoding='utf-8')
    bridge = paths['bridge'].read_text(encoding='utf-8')
    learning = paths['learning'].read_text(encoding='utf-8')
    engine = paths['engine'].read_text(encoding='utf-8')
    css = paths['css'].read_text(encoding='utf-8')

    for token in (
        './css/compositions-learning.css?v=20260821-learning-1',
        './js/compositions-experience-v3.js?v=20260827-brain-runtime-1',
        './js/compositions-semantic-v4.js?v=20260827-brain-runtime-1',
        '"./js/composition-adaptive-learning.js?v=20260822-null-safe-1":"./js/composition-adaptive-learning-public-bridge.js?v=20260823-server-authority-2"',
        'Compatibilidade adaptativa',
        'histórico real só entra após validação',
        'nunca é tratado como uma build equipada',
        'Ser salva ou popular não transforma uma composição em dado de desempenho',
    ):
        if token not in html:
            failures.append(f'HTML sem contrato adaptativo: {token}')

    for token in (
        "from './composition-adaptive-learning-public-bridge.js?v=20260823-server-authority-2'",
        "supabase.from('team_synergies')",
        "supabase.from('hero_synergies')",
        "supabase.from('hero_metrics')",
        "supabase.from('seasons')",
        'trainAdaptiveCompositionModel({',
        'evaluateAdaptiveComposition({',
        'rankAdaptiveCandidates(baseCandidates',
        'learningStatusCopy(adaptive)',
        'state.learningError',
        'pairs.slice(0, 72)',
        '.slice(0, selected.length === 2 ? 60 : 48)',
        'A nota e as razões só aparecem depois que a autoridade pública confirma conhecimento, versão e proveniência.',
    ):
        if token not in ui:
            failures.append(f'UI adaptativa sem integração esperada: {token}')

    if "from './composition-adaptive-learning.js" in ui:
        failures.append('UI pública ainda importa diretamente o learner local legado')

    for token in (
        "import * as legacy from './composition-adaptive-learning.js?core=20260823-server-authority-2'",
        "PUBLIC_COMPOSITION_LEARNING_AUTHORITY = 'echo-brain-score'",
        'LOCAL_ADAPTIVE_PUBLIC_INFLUENCE = 0',
        'try {\n    model = legacy.trainAdaptiveCompositionModel(options);',
        'try {\n    diagnostic = legacy.evaluateAdaptiveComposition(options);',
        'adaptiveScore: baselineScore',
        'influence: LOCAL_ADAPTIVE_PUBLIC_INFLUENCE',
        'adjustment: 0',
        'confidence: 0',
        'export function learnedInsight()',
        'return null;',
        'rankingScore: Number(candidate?.score || 0)',
        '...context,\n      heroes: candidate?.heroes || [],\n      baseEvaluation: candidate',
    ):
        if token not in bridge:
            failures.append(f'bridge público sem fail-closed obrigatório: {token}')

    for forbidden in (
        'rankingScore: adaptive',
        'rankingScore: diagnostic',
        'return legacy.learnedInsight',
    ):
        if forbidden in bridge:
            failures.append(f'bridge público permite autoridade local proibida: {forbidden}')

    for token in (
        'const MIN_TRAIN_TRIOS = 12',
        'const MIN_TOTAL_MATCHES = 120',
        'const MIN_VALIDATION_ROWS = 3',
        'const MAX_MODEL_INFLUENCE = 0.35',
        'const MAX_TOTAL_INFLUENCE = 0.55',
        'function trainLogistic',
        'function brierScore',
        'const validationCount = total >= 6',
        "mode: 'cold-start'",
        "mode: 'observing'",
        "mode: 'rejected'",
        "mode: 'trained'",
        "modelBrier > baselineBrier * 1.02",
        'function shrinkRate',
        'export function trainAdaptiveCompositionModel',
        'export function evaluateAdaptiveComposition',
        'export function rankAdaptiveCandidates',
        'analytics_events e team_compositions NÃO são labels de performance',
    ):
        if token not in learning:
            failures.append(f'camada adaptativa sem salvaguarda esperada: {token}')

    for token in ('Math.random', "from './game-stat-engine.js'", "supabase.from('"):
        if token in learning:
            failures.append(f'camada adaptativa contém dependência proibida: {token}')

    for token in (
        'direct?.adjustedRate != null',
        'pair?.adjustedRate != null',
        'hero?.adjustedRate != null',
    ):
        if token not in learning:
            failures.append(f'camada adaptativa perdeu proteção contra histórico ausente: {token}')

    for hero_name in ('Slayer', 'Freddie', 'Stalker', 'Mirage', 'Bastion'):
        if hero_name in learning:
            failures.append(f'camada adaptativa contém regra hardcoded de herói: {hero_name}')

    if "skillConfidence(skill)" not in engine or 'confidence:skillConfidence(skill)' not in engine:
        failures.append('motor-base perdeu confiança de evidência usada pelas features adaptativas')

    for token in (
        '.analysis-learning-strip{',
        '.analysis-learning-strip.active{',
        '.analysis-learning-strip.warn{',
        '.learning-delta.positive{',
        '.learning-delta.negative{',
        '.partial-learning-status{',
        '.analysis-model-audit{',
        '@media(max-width:700px)',
        '@media(pointer:coarse)',
        '@media(prefers-reduced-motion:reduce)',
    ):
        if token not in css:
            failures.append(f'CSS adaptativo sem leitura/responsividade: {token}')

    if "supabase.from('analytics_events')" in ui:
        failures.append('UI adaptativa passou a usar analytics como sinal de desempenho')
    if 'team_compositions' in learning:
        for forbidden in ("from('team_compositions')", 'teamCompositions', 'compositionPopularity'):
            if forbidden in learning:
                failures.append(f'camada adaptativa usa composição salva como label: {forbidden}')

if failures:
    print(f'Gate de aprendizado adaptativo falhou com {len(failures)} problema(s):', file=sys.stderr)
    for failure in failures:
        print(f'- {failure}', file=sys.stderr)
    raise SystemExit(1)

print('Composições adaptativas: cold start, regressão logística validada, limites de influência, fontes observadas, transparência do contexto de catálogo e escalabilidade protegidos.')
