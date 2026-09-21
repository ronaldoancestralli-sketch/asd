#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
constraints=ROOT/'supabase/migrations/20260822034800_echo_brain_seasons_constraints.sql'
rpcs=ROOT/'supabase/migrations/20260822034905_echo_brain_seasons_invoker_rpcs.sql'
cleanup=ROOT/'supabase/migrations/20260822034923_echo_brain_seasons_action_constraint_cleanup.sql'
actions=ROOT/'admin/js/echo-brain-actions.js'
ui=ROOT/'admin/js/echo-brain-seasons-ui.js'
css=ROOT/'admin/css/echo-brain-seasons.css'
html=ROOT/'admin/echo-brain.html'
failures=[]
for path in (constraints,rpcs,cleanup,actions,ui,css,html):
    if not path.exists(): failures.append(f'arquivo ausente: {path.relative_to(ROOT)}')

if not failures:
    constraints_sql=constraints.read_text(encoding='utf-8').lower()
    rpcs_sql=rpcs.read_text(encoding='utf-8').lower()
    cleanup_sql=cleanup.read_text(encoding='utf-8').lower()
    actions_code=actions.read_text(encoding='utf-8')
    ui_code=ui.read_text(encoding='utf-8')
    css_code=css.read_text(encoding='utf-8')
    html_code=html.read_text(encoding='utf-8')

    for token in (
        'seasons_name_valid',
        'seasons_slug_valid',
        'seasons_game_version_valid',
        'seasons_date_order',
        'create unique index if not exists seasons_one_active',
        'where active is true',
    ):
        if token not in constraints_sql: failures.append(f'constraints de temporadas sem contrato: {token}')

    for token in (
        'create or replace function public.admin_echo_brain_upsert_season',
        'create or replace function public.admin_echo_brain_set_active_season',
        'security invoker',
        "if not public.is_admin()",
        "active=false where active is true and id<>p_season_id",
        "set active=true where id=p_season_id",
        "raise exception 'season_not_active'",
        'grant execute on function public.admin_echo_brain_upsert_season',
        'grant execute on function public.admin_echo_brain_set_active_season',
    ):
        if token not in rpcs_sql: failures.append(f'RPCs de temporadas sem contrato: {token}')

    if 'echo_brain_actions_action_type_check' not in cleanup_sql:
        failures.append('cleanup de constraint de ações de temporadas ausente')

    combined=constraints_sql+'\n'+rpcs_sql+'\n'+cleanup_sql
    for token in ('security definer','insert into public.seasons(name,slug,game_version,starts_at,ends_at,active,notes)\n    values(v_name,v_slug,v_version,p_starts_at,p_ends_at,true','delete from public.seasons'):
        if token in combined: failures.append(f'migrations de temporadas contêm comportamento proibido: {token}')

    for token in ("supabase.rpc('admin_echo_brain_upsert_season'","supabase.rpc('admin_echo_brain_set_active_season'",'upsertBrainSeason({','setBrainActiveSeason(seasonId,active)'):
        if token not in actions_code: failures.append(f'ações de temporada sem RPC: {token}')

    for token in ('brain-seasons-section','Temporadas e versão do jogo','ativação é uma ação separada','data-season-edit','data-season-active','upsertBrainSeason({','setBrainActiveSeason(id,enabling)','window.confirm(','emergency_enabled===true','prefers-reduced-motion'):
        if token not in ui_code: failures.append(f'UI de temporadas sem proteção: {token}')
    for token in ('deleteSeason','data-season-delete','.delete('):
        if token in ui_code: failures.append(f'UI de temporadas contém exclusão não prevista: {token}')

    for token in ('.brain-seasons-summary{','.brain-seasons-grid{','.brain-season-row{','.brain-season-fields{','@media(max-width:1050px)','@media(max-width:700px)','@media(pointer:coarse)','@media(prefers-reduced-motion:reduce)'):
        if token not in css_code: failures.append(f'CSS de temporadas sem responsividade: {token}')

    for token in ('./css/echo-brain-seasons.css?v=20260822-brain-seasons-1','./js/echo-brain-seasons-ui.js?v=20260822-brain-seasons-1'):
        if token not in html_code: failures.append(f'HTML sem cache/integracao de temporadas: {token}')

if failures:
    print(f'Gate de temporadas do Echo Brain falhou com {len(failures)} problema(s):',file=sys.stderr)
    for failure in failures: print(f'- {failure}',file=sys.stderr)
    raise SystemExit(1)
print('Echo Brain seasons: migrations reais reconciliadas, RLS invoker, temporada única ativa, edição explícita, sem dados fictícios/exclusão e responsividade validados.')
