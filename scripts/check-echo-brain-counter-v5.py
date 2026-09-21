#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
paths={
  'migration':ROOT/'supabase/migrations/20260825043000_echo_brain_counter_knowledge_v5.sql',
  'engine':ROOT/'js/echo-brain-counter-v5.js',
  'page':ROOT/'admin/hero-counter-lab.html',
  'ui':ROOT/'admin/js/hero-counter-lab.js',
  'docs':ROOT/'docs/ECHO_BRAIN_COUNTER_KNOWLEDGE_V5.md',
  'test':ROOT/'tests/echo-brain-counter-v5.test.mjs',
}
fail=[]
for key,path in paths.items():
  if not path.exists(): fail.append(f'{key} ausente: {path.relative_to(ROOT)}')
if fail:
  print('\n'.join(fail),file=sys.stderr);raise SystemExit(1)
text={k:p.read_text(encoding='utf-8') for k,p in paths.items()}
for token in ('create table if not exists public.hero_passives','create table if not exists public.hero_semantic_facts','create table if not exists public.hero_counter_reviews','review_status in (\'proposed\',\'confirmed\',\'rejected\')','revoke all on table public.hero_semantic_facts from public, anon, authenticated','using ((select public.echo_is_admin()))','hero_knowledge_change_history'):
  if token not in text['migration']: fail.append(f'migration sem contrato: {token}')
for forbidden in ('grant select on table public.hero_passives to anon','grant select on table public.hero_semantic_facts to anon','create policy hero_passives_anon'):
  if forbidden in text['migration'].lower(): fail.append(f'superfície Shadow aberta ao anon: {forbidden}')
for token in ('COUNTER_SCHEMA_V5','suggestSemanticFactsV5','compareHeroCountersV5','directionalCounterPressureV5','review_status','verification_status','needs_recheck','Revelação reduz ou neutraliza'):
  if token not in text['engine']: fail.append(f'engine sem contrato: {token}')
for token in ('SHADOW · NÃO PÚBLICO','hero-counter-lab.js?v=20260825-counter-v5-shadow-2','Confirmar fatos selecionados','Gerar matriz Shadow','deixa todos desmarcados por padrão'):
  if token not in text['page']: fail.append(f'página sem contrato: {token}')
for token in ("from('hero_passives')","from('hero_semantic_facts')","from('hero_counter_reviews')",'compareHeroCountersV5','source_fingerprint','review_status:\'confirmed\'', 'Nenhuma vem selecionada'):
  if token not in text['ui']: fail.append(f'UI sem contrato: {token}')
if 'data-suggestion="${i}" checked' in text['ui']:
  fail.append('sugestões semânticas continuam pré-selecionadas; confirmação deve ser opt-in')
for forbidden in ('../counters.html','href="../counters','public_version'):
  if forbidden in text['page'] or forbidden in text['ui']: fail.append(f'Counter Shadow vazou superfície pública: {forbidden}')
if fail:
  print(f'Counter Knowledge V5 falhou com {len(fail)} problema(s):',file=sys.stderr)
  for item in fail: print(f'- {item}',file=sys.stderr)
  raise SystemExit(1)
print('Counter Knowledge V5: schema Admin-only, seleção semântica opt-in, engine causal bidirecional e laboratório Shadow presentes.')
