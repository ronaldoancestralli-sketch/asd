#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
paths={
 'html':ROOT/'admin/echo-brain.html','core':ROOT/'admin/js/echo-brain-core.js','ui':ROOT/'admin/js/echo-brain.js',
 'training_ui':ROOT/'admin/js/echo-brain-training-ui.js','intelligence_ui':ROOT/'admin/js/echo-brain-intelligence-ui.js','emergency_ui':ROOT/'admin/js/echo-brain-emergency-ui.js','final_ui':ROOT/'admin/js/echo-brain-final-ui.js','actions':ROOT/'admin/js/echo-brain-actions.js',
 'dashboard':ROOT/'admin/index.html','dashboard_ui':ROOT/'admin/js/dashboard-brain.js','css':ROOT/'admin/css/echo-brain.css','runtime_css':ROOT/'admin/css/echo-brain-runtime.css','intelligence_css':ROOT/'admin/css/echo-brain-intelligence.css','emergency_css':ROOT/'admin/css/echo-brain-emergency.css','final_css':ROOT/'admin/css/echo-brain-final.css'
}
failures=[]
for path in paths.values():
    if not path.exists(): failures.append(f'arquivo ausente: {path.relative_to(ROOT)}')
if not failures:
    text={name:path.read_text(encoding='utf-8') for name,path in paths.items()}
    for token in ('Echo <em>Brain</em>','MODO DE EMERGÊNCIA','MEMÓRIA OBSERVACIONAL','PRONTIDÃO DE TREINO','MEMÓRIA DE MODELOS','CONTROLE OPERACIONAL','SAÚDE PÓS-ATIVAÇÃO','EXPLICABILIDADE','HISTÓRICO OPERACIONAL','CICLO DE VIDA','./css/echo-brain-final.css?v=20260822-brain-final-1','./js/echo-brain.js?v=20260822-brain-final-1','./js/echo-brain-training-ui.js?v=20260822-brain-final-1','./js/echo-brain-intelligence-ui.js?v=20260822-brain-final-1','./js/echo-brain-emergency-ui.js?v=20260822-brain-final-1','./js/echo-brain-final-ui.js?v=20260822-brain-final-1'):
        if token.lower() not in text['html'].lower(): failures.append(f'Página Echo Brain sem contrato: {token}')
    for token in ("minTrios:12","minMatches:120","minValidationRows:3","table:'hero_synergies'","table:'hero_metrics'","table:'hero_matchups'","table:'seasons'","fetchPaged('hero_skills'","supabase.rpc('admin_echo_brain_registry_snapshot')","supabase.rpc('admin_echo_brain_set_runtime'","pipeline:{","shadow:{","backtests:{rows:","label:'COLD START'","label:'OBSERVANDO'","label:'ATIVO'","label:'SUSPENSO'","key:'emergency'","label:'EMERGÊNCIA'","key:'drift'","organicVerifiedObservations","distinctOrganicTrios","influence:0"):
        if token not in text['core']: failures.append(f'Núcleo Echo Brain sem salvaguarda: {token}')
    for token in ('.insert(','.update(','.upsert(','.delete(','Math.random',"from './game-stat-engine.js'"):
        if token in text['core'] or token in text['ui'] or token in text['dashboard_ui']: failures.append(f'Echo Brain contém escrita/dependência proibida no snapshot/UI base: {token}')
    for token in ('loadBrainSnapshot()','brainStatusCopy(snapshot)','setBrainRuntime({','renderRuntime(snapshot)','renderRegistries(snapshot)','document.body.dataset.brainEmergency'):
        if token not in text['ui']: failures.append(f'UI base Echo Brain sem integração: {token}')
    for token in ("supabase.functions.invoke('echo-brain-train'","supabase.functions.invoke('echo-brain-evaluate'","supabase.functions.invoke('echo-brain-shadow'","supabase.functions.invoke('echo-brain-backtest'","supabase.rpc('admin_echo_brain_promote_model'","supabase.rpc('admin_echo_brain_rollback_model'","supabase.rpc('admin_echo_brain_set_emergency'","supabase.rpc('admin_echo_brain_set_shadow_mode'","supabase.rpc('admin_echo_brain_ingest_observations'"):
        if token not in text['actions']: failures.append(f'Ações Brain sem contrato: {token}')
    for token in ('trainBrainCandidate()','promoteBrainModel(modelId)','rollbackBrainModel(modelId,reason)','data-promote-model','data-rollback-model','window.prompt(','emergency_enabled','Replay/Backtest e Shadow'):
        if token not in text['training_ui']: failures.append(f'UI de modelos sem governança final: {token}')
    for token in ('evaluateActiveBrainModel()','renderHealth(snapshot)','renderExplainability(snapshot)','renderHistory(snapshot)','brainInfluencedMatches','emergency_enabled'):
        if token not in text['intelligence_ui']: failures.append(f'UI de inteligência sem contrato: {token}')
    for token in ('setBrainEmergency(enabling,reason)','brain-emergency-toggle','window.prompt(','window.confirm(','memória preservada','Shadow'):
        if token.lower() not in text['emergency_ui'].lower(): failures.append(f'UI de emergência sem contrato: {token}')
    for token in ('ingestBrainObservations','runBrainBacktest','runBrainShadow','setBrainShadowMode','brain-final-section','PIPELINE','SHADOW MODE','REPLAY / BACKTEST','recommendedByBrain'):
        if token not in text['final_ui']: failures.append(f'UI final do Brain sem contrato: {token}')
    for token in ('id="dashboard-brain-card"','./js/dashboard-brain.js?v=20260822-brain-final-1'):
        if token not in text['dashboard']: failures.append(f'Dashboard sem integração final do Echo Brain: {token}')
    for token in ("./echo-brain-core.js?v=20260822-brain-final-1",'snapshot.pipeline',"state.key==='emergency'",'loadBrainSnapshot()'):
        if token not in text['dashboard_ui']: failures.append(f'Card do Dashboard sem pipeline/saúde real: {token}')
    for token in ('.brain-core{','.dashboard-brain-card{','@media(max-width:900px)','@media(max-width:620px)','@media(pointer:coarse)','@media(prefers-reduced-motion:reduce)'):
        if token not in text['css']: failures.append(f'CSS Echo Brain sem responsividade base: {token}')
    for token in ('.brain-runtime-grid{','.brain-registry-actions{','@media(max-width:1050px)','@media(pointer:coarse)'):
        if token not in text['runtime_css']: failures.append(f'CSS runtime sem contrato: {token}')
    for token in ('.brain-health-grid{','.brain-learning-grid{','.brain-history-list{','.brain-rollback-button{','@media(max-width:1050px)','@media(max-width:700px)','@media(pointer:coarse)','@media(prefers-reduced-motion:reduce)'):
        if token not in text['intelligence_css']: failures.append(f'CSS inteligência sem contrato: {token}')
    for token in ('.brain-emergency-panel{','.brain-emergency-control{','body[data-brain-emergency="true"]','@media(max-width:900px)','@media(max-width:620px)','@media(pointer:coarse)','@media(prefers-reduced-motion:reduce)'):
        if token not in text['emergency_css']: failures.append(f'CSS emergência sem contrato: {token}')
    for token in ('.brain-final-pipeline{','.brain-final-grid{','.brain-import-form{','body[data-brain-emergency="true"]','@media(max-width:1050px)','@media(max-width:700px)','@media(pointer:coarse)','@media(prefers-reduced-motion:reduce)'):
        if token not in text['final_css']: failures.append(f'CSS final sem responsividade: {token}')
if failures:
    print(f'Gate Echo Brain falhou com {len(failures)} problema(s):',file=sys.stderr)
    for failure in failures: print(f'- {failure}',file=sys.stderr)
    raise SystemExit(1)
print('Echo Brain: fundação, pipeline, Shadow, Replay, runtime, drift, rollback, emergência, Dashboard e responsividade validados.')
