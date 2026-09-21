#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
base_migration = ROOT / 'supabase/migrations/20260822021736_echo_brain_emergency_mode.sql'
final_migration = ROOT / 'supabase/migrations/20260822031007_echo_brain_final_pipeline_shadow_backtest.sql'
shadow_runtime = ROOT / 'supabase/migrations/20260822031240_echo_brain_shadow_runtime.sql'
post_audit_hardening = ROOT / 'supabase/migrations/20260822154246_post_main_audit_hardening.sql'
train = ROOT / 'supabase/functions/echo-brain-train/index.ts'
evaluate = ROOT / 'supabase/functions/echo-brain-evaluate/index.ts'
shadow = ROOT / 'supabase/functions/echo-brain-shadow/index.ts'
backtest = ROOT / 'supabase/functions/echo-brain-backtest/index.ts'
core = ROOT / 'admin/js/echo-brain-core.js'
actions = ROOT / 'admin/js/echo-brain-actions.js'
emergency_ui = ROOT / 'admin/js/echo-brain-emergency-ui.js'
training_ui = ROOT / 'admin/js/echo-brain-training-ui.js'
intelligence_ui = ROOT / 'admin/js/echo-brain-intelligence-ui.js'
final_ui = ROOT / 'admin/js/echo-brain-final-ui.js'
html = ROOT / 'admin/echo-brain.html'
css = ROOT / 'admin/css/echo-brain-emergency.css'
dashboard = ROOT / 'admin/js/dashboard-brain.js'
paths = (base_migration, final_migration, shadow_runtime, post_audit_hardening, train, evaluate, shadow, backtest, core, actions, emergency_ui, training_ui, intelligence_ui, final_ui, html, css, dashboard)
failures = []

for path in paths:
    if not path.exists():
        failures.append(f'arquivo ausente: {path.relative_to(ROOT)}')

def compact(text: str) -> str:
    return ''.join(text.split())

if not failures:
    sql = base_migration.read_text(encoding='utf-8').lower()
    final_sql = final_migration.read_text(encoding='utf-8').lower()
    runtime_sql = compact(shadow_runtime.read_text(encoding='utf-8').lower())
    hardening_sql = post_audit_hardening.read_text(encoding='utf-8').lower()
    codes = {
        'treino': compact(train.read_text(encoding='utf-8')),
        'avaliação': compact(evaluate.read_text(encoding='utf-8')),
        'shadow': compact(shadow.read_text(encoding='utf-8')),
        'backtest': compact(backtest.read_text(encoding='utf-8')),
    }
    core_code = core.read_text(encoding='utf-8')
    actions_code = actions.read_text(encoding='utf-8')
    emergency_code = emergency_ui.read_text(encoding='utf-8')
    training_code = training_ui.read_text(encoding='utf-8')
    intelligence_code = intelligence_ui.read_text(encoding='utf-8')
    final_code = final_ui.read_text(encoding='utf-8')
    html_code = html.read_text(encoding='utf-8')
    css_code = css.read_text(encoding='utf-8')
    dashboard_code = dashboard.read_text(encoding='utf-8')

    required_sql = (
        'emergency_enabled boolean not null default false', 'emergency_reason text',
        'emergency_activated_at timestamptz', 'emergency_cleared_at timestamptz',
        "'emergency_on','emergency_off'", 'create or replace function public.echo_brain_guard_emergency_runtime()',
        'create or replace function public.echo_brain_guard_emergency_training()',
        'create or replace function public.echo_brain_guard_emergency_model_transition()',
        'create or replace function public.echo_brain_guard_emergency_evaluation()',
        'create or replace function public.echo_brain_guard_emergency_activation()',
        "new.status in ('queued','running','succeeded')", "new.status in ('candidate','active')",
        "set status='cancelled'", 'learning_enabled=false', 'auto_training_enabled=false',
        'auto_promotion_enabled=false', 'create or replace function public.admin_echo_brain_set_emergency(',
        'emergency_reason_required', "values ('emergency_on'", "values ('emergency_off'",
        "'memory_preserved',true", "'requires_manual_reactivation',true",
    )
    for token in required_sql:
        if token not in sql:
            failures.append(f'migration de emergência sem salvaguarda: {token}')

    for token in ('echo_brain_emergency_shadow_guard', 'echo_brain_emergency_backtest_guard', 'echo_brain_emergency_backtest_result_guard', 'brain_emergency_active'):
        if token not in final_sql:
            failures.append(f'pipeline final sem guard de emergência: {token}')
    for token in ('shadow_mode_enabled=false', 'auto_training_enabled=false', 'auto_promotion_enabled=false', 'learning_enabled=false', 'createorreplacefunctionpublic.admin_echo_brain_set_shadow_mode'):
        if token not in runtime_sql:
            failures.append(f'runtime Shadow sem recuperação segura: {token}')
    for function in ('echo_brain_guard_emergency_activation', 'echo_brain_guard_emergency_evaluation', 'echo_brain_guard_emergency_model_transition', 'echo_brain_guard_emergency_runtime', 'echo_brain_guard_emergency_training', 'echo_brain_guard_processing_during_emergency'):
        if f'revoke all on function public.{function}()' not in hardening_sql:
            failures.append(f'hardening não remove função interna do Data API: {function}')
    for token in ('learning_enabled=true', 'learning_enabled = true', 'auto_training_enabled=true', 'auto_promotion_enabled=true', 'shadow_mode_enabled=true'):
        if token in sql:
            failures.append(f'migration base de emergência contém ativação proibida: {token}')

    for name, code in codes.items():
        for token in ('settings?.emergency_enabled===true', "error:'brain_emergency_active'", '423'):
            if token not in code:
                failures.append(f'{name} não bloqueia emergência: {token}')

    for token in ("key:'emergency'", "label:'EMERGÊNCIA'", 'influence:0', 'emergency_enabled===true'):
        if token not in core_code:
            failures.append(f'núcleo não representa emergência: {token}')
    for token in ("supabase.rpc('admin_echo_brain_set_emergency'", 'setBrainEmergency(enabled,reason)', 'emergency_reason_required'):
        if token not in actions_code:
            failures.append(f'ação de emergência sem contrato: {token}')
    for token in ('setBrainEmergency(enabling,reason)', 'brain-emergency-toggle', 'window.prompt(', 'window.confirm(', 'memória preservada', 'Shadow', 'Backtest'):
        if token.lower() not in emergency_code.lower():
            failures.append(f'UI de emergência sem proteção: {token}')
    for token in ('emergency_enabled', 'Treinamento bloqueado pela emergência'):
        if token not in training_code:
            failures.append(f'UI de treino não respeita emergência: {token}')
    for token in ('emergency_enabled', 'Avaliação bloqueada pela emergência', 'emergency_on', 'emergency_off'):
        if token not in intelligence_code:
            failures.append(f'UI de avaliação/histórico não respeita emergência: {token}')
    for token in ('emergency_enabled', 'brain-shadow-toggle', 'brain-backtest-run'):
        if token not in final_code:
            failures.append(f'UI final não respeita emergência: {token}')
    for token in ('id="brain-emergency-panel"', 'id="brain-emergency-toggle"', 'data-step="emergency"', './css/echo-brain-emergency.css?v=20260821-brain-1', './js/echo-brain-emergency-ui.js?v=20260822-brain-final-1'):
        if token not in html_code:
            failures.append(f'HTML sem modo de emergência final: {token}')
    for token in ('.brain-emergency-panel{', 'body[data-brain-emergency="true"]', '@media(max-width:900px)', '@media(max-width:620px)', '@media(pointer:coarse)'):
        if token not in css_code:
            failures.append(f'CSS de emergência sem contrato: {token}')
    for token in ("state.key==='emergency'", 'treino/Shadow/Backtest bloqueados'):
        if token not in dashboard_code:
            failures.append(f'Dashboard não prioriza emergência final: {token}')

if failures:
    print(f'Gate de emergência do Echo Brain falhou com {len(failures)} problema(s):', file=sys.stderr)
    for failure in failures:
        print(f'- {failure}', file=sys.stderr)
    raise SystemExit(1)

print('Echo Brain emergency: treino, avaliação, Shadow e Backtest permanecem isolados; memória é preservada e reativação continua manual.')
