-- EchoArena — rastreabilidade de fontes e histórico por habilidade.
-- Nenhum dado de jogo é criado por esta migration. Ela apenas adiciona
-- metadados de proveniência/verificação e relacionamentos auditáveis.

alter table public.hero_skills
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists verified_at timestamptz,
  add column if not exists verified_patch text,
  add column if not exists needs_recheck boolean not null default true,
  add column if not exists verification_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.hero_skills'::regclass
      and conname = 'hero_skills_verification_status_check'
  ) then
    alter table public.hero_skills
      add constraint hero_skills_verification_status_check
      check (verification_status in ('unverified','corroborated','verified'));
  end if;
end $$;

create table if not exists public.source_references (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  source_type text not null,
  language text not null,
  title text not null,
  publisher text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_references_type_check
    check (source_type in ('official','wiki','forum','community','other')),
  constraint source_references_url_check
    check (url ~* '^https?://')
);

create table if not exists public.hero_skill_source_links (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.hero_skills(id) on delete cascade,
  source_id uuid not null references public.source_references(id) on delete cascade,
  coverage text not null,
  is_primary boolean not null default false,
  verification_status text not null default 'unverified',
  verified_at timestamptz,
  verified_patch text,
  needs_recheck boolean not null default true,
  public_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hero_skill_source_links_coverage_check
    check (coverage in ('baseline_values','structure','patch_override','corroboration','translation')),
  constraint hero_skill_source_links_status_check
    check (verification_status in ('unverified','corroborated','verified')),
  constraint hero_skill_source_links_unique unique (skill_id, source_id, coverage)
);

create index if not exists hero_skill_source_links_skill_idx
  on public.hero_skill_source_links(skill_id, verification_status, needs_recheck);
create index if not exists hero_skill_source_links_source_idx
  on public.hero_skill_source_links(source_id);

alter table public.balance_history
  add column if not exists skill_id uuid references public.hero_skills(id) on delete set null,
  add column if not exists source_id uuid references public.source_references(id) on delete set null;

create index if not exists balance_history_skill_created_idx
  on public.balance_history(skill_id, created_at desc)
  where skill_id is not null;

-- Reutiliza o trigger padrão já existente no projeto para updated_at.
drop trigger if exists trg_source_references_updated_at on public.source_references;
create trigger trg_source_references_updated_at
before update on public.source_references
for each row execute function public.set_updated_at();

drop trigger if exists trg_hero_skill_source_links_updated_at on public.hero_skill_source_links;
create trigger trg_hero_skill_source_links_updated_at
before update on public.hero_skill_source_links
for each row execute function public.set_updated_at();

alter table public.source_references enable row level security;
alter table public.hero_skill_source_links enable row level security;

-- Fontes são públicas somente quando vinculadas a uma habilidade publicada
-- de um herói publicado. Administradores veem também fontes ainda sem vínculo.
drop policy if exists source_references_anon_read on public.source_references;
create policy source_references_anon_read
on public.source_references for select to anon
using (
  exists (
    select 1
    from public.hero_skill_source_links l
    join public.hero_skills s on s.id = l.skill_id
    join public.heroes h on h.id = s.hero_id
    where l.source_id = source_references.id
      and s.enabled = true
      and h.enabled = true
  )
);

drop policy if exists source_references_authenticated_read on public.source_references;
create policy source_references_authenticated_read
on public.source_references for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.hero_skill_source_links l
    join public.hero_skills s on s.id = l.skill_id
    join public.heroes h on h.id = s.hero_id
    where l.source_id = source_references.id
      and s.enabled = true
      and h.enabled = true
  )
);

drop policy if exists source_references_admin_insert on public.source_references;
create policy source_references_admin_insert
on public.source_references for insert to authenticated
with check ((select public.is_admin()));

drop policy if exists source_references_admin_update on public.source_references;
create policy source_references_admin_update
on public.source_references for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists source_references_admin_delete on public.source_references;
create policy source_references_admin_delete
on public.source_references for delete to authenticated
using ((select public.is_admin()));

-- Vínculos seguem a visibilidade do herói/habilidade pai.
drop policy if exists hero_skill_source_links_anon_read on public.hero_skill_source_links;
create policy hero_skill_source_links_anon_read
on public.hero_skill_source_links for select to anon
using (
  exists (
    select 1
    from public.hero_skills s
    join public.heroes h on h.id = s.hero_id
    where s.id = hero_skill_source_links.skill_id
      and s.enabled = true
      and h.enabled = true
  )
);

drop policy if exists hero_skill_source_links_authenticated_read on public.hero_skill_source_links;
create policy hero_skill_source_links_authenticated_read
on public.hero_skill_source_links for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.hero_skills s
    join public.heroes h on h.id = s.hero_id
    where s.id = hero_skill_source_links.skill_id
      and s.enabled = true
      and h.enabled = true
  )
);

drop policy if exists hero_skill_source_links_admin_insert on public.hero_skill_source_links;
create policy hero_skill_source_links_admin_insert
on public.hero_skill_source_links for insert to authenticated
with check ((select public.is_admin()));

drop policy if exists hero_skill_source_links_admin_update on public.hero_skill_source_links;
create policy hero_skill_source_links_admin_update
on public.hero_skill_source_links for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists hero_skill_source_links_admin_delete on public.hero_skill_source_links;
create policy hero_skill_source_links_admin_delete
on public.hero_skill_source_links for delete to authenticated
using ((select public.is_admin()));

-- Data API: privilégios explícitos e mínimos. RLS continua sendo a fronteira
-- de autorização por linha; nenhum TRUNCATE/TRIGGER/REFERENCES é concedido.
revoke all on table public.source_references from public, anon, authenticated;
revoke all on table public.hero_skill_source_links from public, anon, authenticated;
grant select on table public.source_references to anon;
grant select on table public.hero_skill_source_links to anon;
grant select, insert, update, delete on table public.source_references to authenticated;
grant select, insert, update, delete on table public.hero_skill_source_links to authenticated;

comment on table public.source_references is
  'Catálogo público de fontes usadas para rastrear dados do EchoArena.';
comment on table public.hero_skill_source_links is
  'Vínculos entre habilidades e fontes, com escopo e estado de verificação.';
comment on column public.hero_skills.needs_recheck is
  'True quando a habilidade ainda depende de nova conferência, mesmo que possua fonte comunitária.';
