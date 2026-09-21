-- Echo Brain V5 — conhecimento de passivas e Counter Engine em Shadow.
-- Esta migration NÃO publica counters e NÃO altera o score público.
-- Texto bruto nunca vira fato confirmado automaticamente.

begin;

create table if not exists public.hero_passives (
  id uuid primary key default gen_random_uuid(),
  hero_id uuid not null references public.heroes(id) on delete cascade,
  name text not null,
  slug text not null,
  description text not null,
  passive_type text not null default 'conditional'
    check (passive_type in ('always_on','active_linked','conditional','aura','team','other')),
  trigger_type text not null default 'conditional'
    check (trigger_type in ('always','on_activate','on_hit','on_kill','on_damage_taken','after_invisibility','while_invisible','low_health','target_revealed','near_enemy','team_nearby','conditional','other')),
  condition_text text,
  duration_seconds numeric check (duration_seconds is null or duration_seconds >= 0),
  cooldown_seconds numeric check (cooldown_seconds is null or cooldown_seconds >= 0),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','corroborated','verified')),
  verified_at timestamptz,
  verified_patch text,
  needs_recheck boolean not null default true,
  verification_note text,
  enabled boolean not null default true,
  display_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hero_passives_name_length check (length(trim(name)) between 1 and 160),
  constraint hero_passives_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and length(slug) <= 160),
  constraint hero_passives_description_length check (length(trim(description)) between 1 and 6000),
  constraint hero_passives_condition_length check (condition_text is null or length(condition_text) <= 1200),
  constraint hero_passives_note_length check (verification_note is null or length(verification_note) <= 1600),
  unique(hero_id, slug)
);

create table if not exists public.hero_passive_source_links (
  id uuid primary key default gen_random_uuid(),
  passive_id uuid not null references public.hero_passives(id) on delete cascade,
  source_id uuid not null references public.source_references(id) on delete restrict,
  coverage text not null default 'structure'
    check (coverage in ('structure','behavior','values','patch_override','corroboration','translation')),
  is_primary boolean not null default false,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','corroborated','verified')),
  verified_at timestamptz,
  verified_patch text,
  needs_recheck boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(passive_id, source_id, coverage)
);

create table if not exists public.hero_semantic_facts (
  id uuid primary key default gen_random_uuid(),
  hero_id uuid not null references public.heroes(id) on delete cascade,
  source_kind text not null check (source_kind in ('skill','passive','manual')),
  skill_id uuid references public.hero_skills(id) on delete cascade,
  passive_id uuid references public.hero_passives(id) on delete cascade,
  fact_role text not null check (fact_role in ('capability','dependency','vulnerability','immunity')),
  mechanic text not null check (mechanic in (
    'reveal','invisibility','silence','stun','slow','root','disarm','shield','shield_break',
    'armor','armor_penetration','heal','anti_heal','damage_reduction','damage_amp',
    'movement_speed','dash','teleport','range','close_range','wall_shot','vision','cover',
    'revive','area_damage','burst','damage_over_time','active_ability','projectile'
  )),
  strength numeric(5,4) not null default 1 check (strength >= 0 and strength <= 1),
  trigger_type text not null default 'always'
    check (trigger_type in ('always','on_activate','on_hit','on_kill','on_damage_taken','after_invisibility','while_invisible','low_health','target_revealed','near_enemy','team_nearby','conditional','other')),
  target_scope text not null default 'self'
    check (target_scope in ('self','ally','team','enemy','enemies','area','other')),
  condition_text text,
  evidence_text text not null,
  review_status text not null default 'proposed'
    check (review_status in ('proposed','confirmed','rejected')),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','corroborated','verified')),
  needs_recheck boolean not null default true,
  semantic_confidence numeric(5,4) not null default 0.5 check (semantic_confidence >= 0 and semantic_confidence <= 1),
  source_fingerprint text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hero_semantic_facts_source_shape check (
    (source_kind='skill' and skill_id is not null and passive_id is null)
    or (source_kind='passive' and passive_id is not null and skill_id is null)
    or (source_kind='manual' and skill_id is null and passive_id is null)
  ),
  constraint hero_semantic_facts_condition_length check (condition_text is null or length(condition_text) <= 1200),
  constraint hero_semantic_facts_evidence_length check (length(trim(evidence_text)) between 1 and 2000),
  constraint hero_semantic_facts_fingerprint_length check (length(source_fingerprint) between 16 and 128)
);

create table if not exists public.hero_counter_reviews (
  id uuid primary key default gen_random_uuid(),
  hero_a_id uuid not null references public.heroes(id) on delete cascade,
  hero_b_id uuid not null references public.heroes(id) on delete cascade,
  verdict text not null check (verdict in ('a_strong_counter','a_counter','a_slight','no_direct_counter','b_slight','b_counter','b_strong_counter','uncertain')),
  reviewer_confidence numeric(5,4) not null default 0.5 check (reviewer_confidence >= 0 and reviewer_confidence <= 1),
  patch text,
  notes text,
  engine_schema text not null default 'echo-brain-counter-knowledge-v5-shadow',
  engine_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint hero_counter_reviews_distinct check (hero_a_id <> hero_b_id),
  constraint hero_counter_reviews_notes_length check (notes is null or length(notes) <= 2400),
  constraint hero_counter_reviews_snapshot_size check (octet_length(engine_snapshot::text) <= 32768)
);

create table if not exists public.hero_knowledge_change_history (
  id bigint generated by default as identity primary key,
  hero_id uuid references public.heroes(id) on delete set null,
  entity_kind text not null check (entity_kind in ('passive','semantic_fact')),
  entity_id uuid not null,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE')),
  before_snapshot jsonb,
  after_snapshot jsonb,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists hero_passives_hero_idx on public.hero_passives(hero_id, enabled, display_order);
create index if not exists hero_passive_source_links_passive_idx on public.hero_passive_source_links(passive_id, verification_status, needs_recheck);
create index if not exists hero_semantic_facts_hero_idx on public.hero_semantic_facts(hero_id, review_status, verification_status, needs_recheck);
create index if not exists hero_semantic_facts_skill_idx on public.hero_semantic_facts(skill_id) where skill_id is not null;
create index if not exists hero_semantic_facts_passive_idx on public.hero_semantic_facts(passive_id) where passive_id is not null;
create index if not exists hero_counter_reviews_pair_idx on public.hero_counter_reviews(hero_a_id, hero_b_id, created_at desc);
create index if not exists hero_knowledge_change_history_hero_idx on public.hero_knowledge_change_history(hero_id, changed_at desc);

-- updated_at usa a função padrão já existente.
drop trigger if exists trg_hero_passives_updated_at on public.hero_passives;
create trigger trg_hero_passives_updated_at before update on public.hero_passives
for each row execute function public.set_updated_at();

drop trigger if exists trg_hero_passive_source_links_updated_at on public.hero_passive_source_links;
create trigger trg_hero_passive_source_links_updated_at before update on public.hero_passive_source_links
for each row execute function public.set_updated_at();

drop trigger if exists trg_hero_semantic_facts_updated_at on public.hero_semantic_facts;
create trigger trg_hero_semantic_facts_updated_at before update on public.hero_semantic_facts
for each row execute function public.set_updated_at();

create or replace function public.echo_brain_audit_hero_counter_knowledge()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_hero_id uuid;
  v_entity_id uuid;
  v_kind text;
begin
  v_kind := case when tg_table_name='hero_passives' then 'passive' else 'semantic_fact' end;
  v_hero_id := case when tg_op='DELETE' then old.hero_id else new.hero_id end;
  v_entity_id := case when tg_op='DELETE' then old.id else new.id end;
  insert into public.hero_knowledge_change_history(hero_id,entity_kind,entity_id,operation,before_snapshot,after_snapshot,changed_by)
  values(
    v_hero_id,v_kind,v_entity_id,tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end,
    auth.uid()
  );
  return null;
end;
$$;
revoke all on function public.echo_brain_audit_hero_counter_knowledge() from public, anon, authenticated, service_role;

drop trigger if exists trg_hero_passives_history on public.hero_passives;
create trigger trg_hero_passives_history after insert or update or delete on public.hero_passives
for each row execute function public.echo_brain_audit_hero_counter_knowledge();

drop trigger if exists trg_hero_semantic_facts_history on public.hero_semantic_facts;
create trigger trg_hero_semantic_facts_history after insert or update or delete on public.hero_semantic_facts
for each row execute function public.echo_brain_audit_hero_counter_knowledge();

alter table public.hero_passives enable row level security;
alter table public.hero_passive_source_links enable row level security;
alter table public.hero_semantic_facts enable row level security;
alter table public.hero_counter_reviews enable row level security;
alter table public.hero_knowledge_change_history enable row level security;

revoke all on table public.hero_passives from public, anon, authenticated;
revoke all on table public.hero_passive_source_links from public, anon, authenticated;
revoke all on table public.hero_semantic_facts from public, anon, authenticated;
revoke all on table public.hero_counter_reviews from public, anon, authenticated;
revoke all on table public.hero_knowledge_change_history from public, anon, authenticated;

grant select,insert,update,delete on table public.hero_passives to authenticated;
grant select,insert,update,delete on table public.hero_passive_source_links to authenticated;
grant select,insert,update,delete on table public.hero_semantic_facts to authenticated;
grant select,insert on table public.hero_counter_reviews to authenticated;
grant select on table public.hero_knowledge_change_history to authenticated;

drop policy if exists hero_passives_admin on public.hero_passives;
create policy hero_passives_admin on public.hero_passives for all to authenticated
using ((select public.echo_is_admin())) with check ((select public.echo_is_admin()));

drop policy if exists hero_passive_source_links_admin on public.hero_passive_source_links;
create policy hero_passive_source_links_admin on public.hero_passive_source_links for all to authenticated
using ((select public.echo_is_admin())) with check ((select public.echo_is_admin()));

drop policy if exists hero_semantic_facts_admin on public.hero_semantic_facts;
create policy hero_semantic_facts_admin on public.hero_semantic_facts for all to authenticated
using ((select public.echo_is_admin())) with check ((select public.echo_is_admin()));

drop policy if exists hero_counter_reviews_admin_select on public.hero_counter_reviews;
create policy hero_counter_reviews_admin_select on public.hero_counter_reviews for select to authenticated
using ((select public.echo_is_admin()));
drop policy if exists hero_counter_reviews_admin_insert on public.hero_counter_reviews;
create policy hero_counter_reviews_admin_insert on public.hero_counter_reviews for insert to authenticated
with check ((select public.echo_is_admin()) and created_by=(select auth.uid()));

drop policy if exists hero_knowledge_change_history_admin_select on public.hero_knowledge_change_history;
create policy hero_knowledge_change_history_admin_select on public.hero_knowledge_change_history for select to authenticated
using ((select public.echo_is_admin()));

-- O estágio V5 é deliberadamente privado/Shadow. Nenhum grant para anon.
comment on table public.hero_passives is 'Passivas explícitas do herói. Shadow até validação do Counter Engine V5.';
comment on table public.hero_semantic_facts is 'Fatos semânticos revisáveis. Somente review_status=confirmed pode participar do Counter Engine.';
comment on table public.hero_counter_reviews is 'Revisões humanas de comparações Shadow usadas para calibrar regras, não como resultado de partida.';
comment on table public.hero_knowledge_change_history is 'Histórico imutável de alterações de passivas e fatos semânticos.';

commit;
