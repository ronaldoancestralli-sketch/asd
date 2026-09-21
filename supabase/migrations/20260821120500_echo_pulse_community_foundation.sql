-- EchoArena — Echo Pulse + comunidade contextual.
-- Fundação aditiva: nada é publicado automaticamente.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create table if not exists public.pulse_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  name text not null,
  source_type text not null check (source_type in ('official','community','creator','editorial','gaming')),
  platform text not null,
  adapter text not null default 'manual',
  base_url text not null,
  feed_url text,
  trust_level text not null default 'community'
    check (trust_level in ('official','high','editorial','community','experimental')),
  enabled boolean not null default true,
  auto_collect boolean not null default false,
  auto_publish boolean not null default false,
  poll_interval_minutes integer not null default 60 check (poll_interval_minutes between 15 and 10080),
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pulse_sources_no_automatic_publication check (auto_publish = false)
);

create table if not exists public.pulse_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.pulse_sources(id) on delete restrict,
  external_id text,
  canonical_url text not null unique,
  title text not null,
  summary text,
  source_excerpt text,
  image_url text,
  category text not null default 'update'
    check (category in ('update','patch','community','meta','creator','gaming','event','other')),
  status text not null default 'inbox'
    check (status in ('inbox','review','approved','published','ignored')),
  trust_level text not null default 'community'
    check (trust_level in ('official','high','editorial','community','experimental')),
  relevance_score numeric(5,2) not null default 0
    check (relevance_score between 0 and 100),
  source_published_at timestamptz,
  collected_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  published_at timestamptz,
  is_featured boolean not null default false,
  discussion_enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pulse_items_source_external_unique
  on public.pulse_items(source_id, external_id)
  where external_id is not null;

create index if not exists pulse_items_status_published_idx
  on public.pulse_items(status, published_at desc nulls last, source_published_at desc nulls last);
create index if not exists pulse_items_category_idx
  on public.pulse_items(category, relevance_score desc);
create index if not exists pulse_items_source_idx
  on public.pulse_items(source_id, collected_at desc);

create table if not exists public.pulse_item_heroes (
  pulse_item_id uuid not null references public.pulse_items(id) on delete cascade,
  hero_id uuid not null references public.heroes(id) on delete cascade,
  relation_type text not null default 'mentioned'
    check (relation_type in ('mentioned','affected','featured')),
  created_at timestamptz not null default now(),
  primary key (pulse_item_id, hero_id)
);

create index if not exists pulse_item_heroes_hero_idx
  on public.pulse_item_heroes(hero_id, pulse_item_id);

create table if not exists public.pulse_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null default 'manual'
    check (trigger_type in ('manual','cron')),
  started_by uuid references public.profiles(id) on delete set null,
  status text not null default 'running'
    check (status in ('running','success','partial','error')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  sources_checked integer not null default 0,
  items_seen integer not null default 0,
  items_created integer not null default 0,
  items_updated integer not null default 0,
  error_count integer not null default 0,
  details jsonb not null default '{}'::jsonb
);

create index if not exists pulse_ingestion_runs_started_idx
  on public.pulse_ingestion_runs(started_at desc);

-- A chave do cron é validada pela Edge Function via service role.
-- Esta tabela não é exposta aos clientes.
create table if not exists public.pulse_runtime_secrets (
  secret_key text primary key,
  secret_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  pulse_item_id uuid references public.pulse_items(id) on delete set null,
  hero_id uuid references public.heroes(id) on delete set null,
  build_id uuid references public.builds(id) on delete set null,
  kind text not null default 'discussion'
    check (kind in ('discussion','question','tip','showcase')),
  title text,
  body text not null,
  status text not null default 'active'
    check (status in ('active','hidden','deleted')),
  is_pinned boolean not null default false,
  reaction_count integer not null default 0 check (reaction_count >= 0),
  reply_count integer not null default 0 check (reply_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_posts_body_length check (char_length(btrim(body)) between 1 and 4000),
  constraint community_posts_title_length check (title is null or char_length(title) <= 140)
);

create index if not exists community_posts_feed_idx
  on public.community_posts(status, is_pinned desc, created_at desc);
create index if not exists community_posts_pulse_idx
  on public.community_posts(pulse_item_id, created_at desc)
  where pulse_item_id is not null;
create index if not exists community_posts_hero_idx
  on public.community_posts(hero_id, created_at desc)
  where hero_id is not null;
create index if not exists community_posts_author_idx
  on public.community_posts(author_id, created_at desc);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_comment_id uuid references public.community_comments(id) on delete cascade,
  body text not null,
  status text not null default 'active'
    check (status in ('active','hidden','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_comments_body_length check (char_length(btrim(body)) between 1 and 2000)
);

create index if not exists community_comments_post_idx
  on public.community_comments(post_id, status, created_at asc);
create index if not exists community_comments_author_idx
  on public.community_comments(author_id, created_at desc);

create table if not exists public.community_post_reactions (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('like','useful','agree')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists community_post_reactions_post_idx
  on public.community_post_reactions(post_id, reaction);

-- updated_at compartilhado
drop trigger if exists pulse_sources_set_updated_at on public.pulse_sources;
create trigger pulse_sources_set_updated_at
before update on public.pulse_sources
for each row execute function public.set_updated_at();

drop trigger if exists pulse_items_set_updated_at on public.pulse_items;
create trigger pulse_items_set_updated_at
before update on public.pulse_items
for each row execute function public.set_updated_at();

drop trigger if exists community_posts_set_updated_at on public.community_posts;
create trigger community_posts_set_updated_at
before update on public.community_posts
for each row execute function public.set_updated_at();

drop trigger if exists community_comments_set_updated_at on public.community_comments;
create trigger community_comments_set_updated_at
before update on public.community_comments
for each row execute function public.set_updated_at();

-- Evita que autores alterem campos de moderação/contadores por update direto.
create or replace function public.guard_community_post_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if not public.is_admin() then
    new.author_id := old.author_id;
    new.pulse_item_id := old.pulse_item_id;
    new.hero_id := old.hero_id;
    new.build_id := old.build_id;
    new.status := old.status;
    new.is_pinned := old.is_pinned;
    new.reaction_count := old.reaction_count;
    new.reply_count := old.reply_count;
  end if;
  return new;
end;
$$;

drop trigger if exists community_posts_guard_update on public.community_posts;
create trigger community_posts_guard_update
before update on public.community_posts
for each row execute function public.guard_community_post_update();

create or replace function public.guard_community_comment_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if not public.is_admin() then
    new.post_id := old.post_id;
    new.author_id := old.author_id;
    new.parent_comment_id := old.parent_comment_id;
    new.status := old.status;
  end if;
  return new;
end;
$$;

drop trigger if exists community_comments_guard_update on public.community_comments;
create trigger community_comments_guard_update
before update on public.community_comments
for each row execute function public.guard_community_comment_update();

-- Contadores públicos sem lógica duplicada no cliente.
create or replace function public.sync_community_post_reaction_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_post uuid;
begin
  if tg_op = 'DELETE' then
    v_post := old.post_id;
  else
    v_post := new.post_id;
  end if;

  update public.community_posts
  set reaction_count = (
    select count(*)::integer
    from public.community_post_reactions r
    where r.post_id = v_post
  )
  where id = v_post;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.sync_community_post_reaction_count() from public, anon, authenticated;

drop trigger if exists community_reactions_sync_count on public.community_post_reactions;
create trigger community_reactions_sync_count
after insert or update or delete on public.community_post_reactions
for each row execute function public.sync_community_post_reaction_count();

create or replace function public.sync_community_post_reply_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_post uuid;
begin
  if tg_op = 'DELETE' then
    v_post := old.post_id;
  else
    v_post := new.post_id;
  end if;

  update public.community_posts
  set reply_count = (
    select count(*)::integer
    from public.community_comments c
    where c.post_id = v_post
      and c.status = 'active'
  )
  where id = v_post;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.sync_community_post_reply_count() from public, anon, authenticated;

drop trigger if exists community_comments_sync_count on public.community_comments;
create trigger community_comments_sync_count
after insert or update of status or delete on public.community_comments
for each row execute function public.sync_community_post_reply_count();

create or replace function public.validate_community_comment_parent()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.parent_comment_id is null then return new; end if;

  if not exists (
    select 1
    from public.community_comments parent
    where parent.id = new.parent_comment_id
      and parent.post_id = new.post_id
      and parent.status = 'active'
  ) then
    raise exception 'invalid_parent_comment' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_community_comment_parent() from public, anon, authenticated;

drop trigger if exists community_comments_validate_parent on public.community_comments;
create trigger community_comments_validate_parent
before insert on public.community_comments
for each row execute function public.validate_community_comment_parent();

create or replace function public.normalize_pulse_item_state()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'published' then
    new.published_at := coalesce(new.published_at, now());
    new.reviewed_at := coalesce(new.reviewed_at, now());
    new.reviewed_by := coalesce(new.reviewed_by, auth.uid());
  elsif new.status in ('review','approved') then
    new.reviewed_at := coalesce(new.reviewed_at, now());
    new.reviewed_by := coalesce(new.reviewed_by, auth.uid());
    new.published_at := null;
  else
    new.published_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists pulse_items_normalize_state on public.pulse_items;
create trigger pulse_items_normalize_state
before insert or update of status, published_at on public.pulse_items
for each row execute function public.normalize_pulse_item_state();

-- RLS
alter table public.pulse_sources enable row level security;
alter table public.pulse_items enable row level security;
alter table public.pulse_item_heroes enable row level security;
alter table public.pulse_ingestion_runs enable row level security;
alter table public.pulse_runtime_secrets enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_post_reactions enable row level security;

drop policy if exists pulse_sources_admin_all on public.pulse_sources;
create policy pulse_sources_admin_all
on public.pulse_sources for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists pulse_items_public_read on public.pulse_items;
create policy pulse_items_public_read
on public.pulse_items for select to anon, authenticated
using (status = 'published' and published_at is not null);

drop policy if exists pulse_items_admin_all on public.pulse_items;
create policy pulse_items_admin_all
on public.pulse_items for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists pulse_item_heroes_public_read on public.pulse_item_heroes;
create policy pulse_item_heroes_public_read
on public.pulse_item_heroes for select to anon, authenticated
using (
  exists (
    select 1 from public.pulse_items p
    where p.id = pulse_item_id
      and p.status = 'published'
      and p.published_at is not null
  )
);

drop policy if exists pulse_item_heroes_admin_all on public.pulse_item_heroes;
create policy pulse_item_heroes_admin_all
on public.pulse_item_heroes for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists pulse_ingestion_runs_admin_read on public.pulse_ingestion_runs;
create policy pulse_ingestion_runs_admin_read
on public.pulse_ingestion_runs for select to authenticated
using ((select public.is_admin()));

drop policy if exists pulse_ingestion_runs_admin_write on public.pulse_ingestion_runs;
create policy pulse_ingestion_runs_admin_write
on public.pulse_ingestion_runs for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists community_posts_public_read on public.community_posts;
create policy community_posts_public_read
on public.community_posts for select to anon, authenticated
using (status = 'active');

drop policy if exists community_posts_owner_read on public.community_posts;
create policy community_posts_owner_read
on public.community_posts for select to authenticated
using (author_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists community_posts_insert on public.community_posts;
create policy community_posts_insert
on public.community_posts for insert to authenticated
with check (
  author_id = (select auth.uid())
  and not (select public.is_blocked())
  and status = 'active'
  and is_pinned = false
  and reaction_count = 0
  and reply_count = 0
);

drop policy if exists community_posts_update on public.community_posts;
create policy community_posts_update
on public.community_posts for update to authenticated
using (
  (select public.is_admin())
  or (author_id = (select auth.uid()) and not (select public.is_blocked()))
)
with check (
  (select public.is_admin())
  or author_id = (select auth.uid())
);

drop policy if exists community_posts_delete on public.community_posts;
create policy community_posts_delete
on public.community_posts for delete to authenticated
using ((select public.is_admin()) or author_id = (select auth.uid()));

drop policy if exists community_comments_public_read on public.community_comments;
create policy community_comments_public_read
on public.community_comments for select to anon, authenticated
using (
  status = 'active'
  and exists (
    select 1 from public.community_posts p
    where p.id = post_id and p.status = 'active'
  )
);

drop policy if exists community_comments_owner_read on public.community_comments;
create policy community_comments_owner_read
on public.community_comments for select to authenticated
using (author_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists community_comments_insert on public.community_comments;
create policy community_comments_insert
on public.community_comments for insert to authenticated
with check (
  author_id = (select auth.uid())
  and not (select public.is_blocked())
  and status = 'active'
  and exists (
    select 1 from public.community_posts p
    where p.id = post_id and p.status = 'active'
  )
);

drop policy if exists community_comments_update on public.community_comments;
create policy community_comments_update
on public.community_comments for update to authenticated
using (
  (select public.is_admin())
  or (author_id = (select auth.uid()) and not (select public.is_blocked()))
)
with check (
  (select public.is_admin())
  or author_id = (select auth.uid())
);

drop policy if exists community_comments_delete on public.community_comments;
create policy community_comments_delete
on public.community_comments for delete to authenticated
using ((select public.is_admin()) or author_id = (select auth.uid()));

drop policy if exists community_reactions_public_read on public.community_post_reactions;
create policy community_reactions_public_read
on public.community_post_reactions for select to anon, authenticated
using (
  exists (
    select 1 from public.community_posts p
    where p.id = post_id and p.status = 'active'
  )
);

drop policy if exists community_reactions_insert on public.community_post_reactions;
create policy community_reactions_insert
on public.community_post_reactions for insert to authenticated
with check (
  user_id = (select auth.uid())
  and not (select public.is_blocked())
  and exists (
    select 1 from public.community_posts p
    where p.id = post_id and p.status = 'active'
  )
);

drop policy if exists community_reactions_update on public.community_post_reactions;
create policy community_reactions_update
on public.community_post_reactions for update to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()))
with check (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists community_reactions_delete on public.community_post_reactions;
create policy community_reactions_delete
on public.community_post_reactions for delete to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Grants explícitos para as tabelas novas (Data API 2026).
revoke all on public.pulse_sources from anon, authenticated;
revoke all on public.pulse_items from anon, authenticated;
revoke all on public.pulse_item_heroes from anon, authenticated;
revoke all on public.pulse_ingestion_runs from anon, authenticated;
revoke all on public.pulse_runtime_secrets from anon, authenticated;
revoke all on public.community_posts from anon, authenticated;
revoke all on public.community_comments from anon, authenticated;
revoke all on public.community_post_reactions from anon, authenticated;

grant select on public.pulse_items to anon, authenticated;
grant select on public.pulse_item_heroes to anon, authenticated;
grant select, insert, update, delete on public.pulse_sources to authenticated;
grant select, insert, update, delete on public.pulse_items to authenticated;
grant select, insert, update, delete on public.pulse_item_heroes to authenticated;
grant select, insert, update, delete on public.pulse_ingestion_runs to authenticated;

grant select on public.community_posts to anon, authenticated;
grant insert, update, delete on public.community_posts to authenticated;
grant select on public.community_comments to anon, authenticated;
grant insert, update, delete on public.community_comments to authenticated;
grant select on public.community_post_reactions to anon, authenticated;
grant insert, update, delete on public.community_post_reactions to authenticated;

grant select, insert, update on public.pulse_runtime_secrets to service_role;
grant select, insert, update, delete on public.pulse_sources to service_role;
grant select, insert, update, delete on public.pulse_items to service_role;
grant select, insert, update, delete on public.pulse_item_heroes to service_role;
grant select, insert, update, delete on public.pulse_ingestion_runs to service_role;

-- Fontes reais. Não há conteúdo fictício nem auto-publicação.
insert into public.pulse_sources
  (source_key,name,source_type,platform,adapter,base_url,feed_url,trust_level,enabled,auto_collect,auto_publish,poll_interval_minutes)
values
  ('zeptolab-news-bullet-echo','ZeptoLab News · Bullet Echo','official','web','zeptolab_news',
   'https://www.zeptolab.com/news','https://www.zeptolab.com/news','official',true,true,false,30),
  ('bullet-echo-support','Bullet Echo Support','official','web','manual',
   'https://zepto.helpshift.com/hc/en/10-bullet-echo/','https://zepto.helpshift.com/hc/en/10-bullet-echo/','official',true,false,false,360),
  ('bullet-echo-youtube','Bullet Echo · YouTube oficial','official','youtube','manual',
   'https://www.youtube.com/@BulletEcho',null,'official',true,false,false,60),
  ('bullet-echo-reddit','r/BulletEchoGame','community','reddit','manual',
   'https://www.reddit.com/r/BulletEchoGame/',null,'community',true,false,false,60)
on conflict (source_key) do update set
  name = excluded.name,
  source_type = excluded.source_type,
  platform = excluded.platform,
  adapter = excluded.adapter,
  base_url = excluded.base_url,
  feed_url = excluded.feed_url,
  trust_level = excluded.trust_level,
  updated_at = now();

-- Chave privada para o scheduler.
do $$
declare
  v_secret text;
begin
  select decrypted_secret
    into v_secret
  from vault.decrypted_secrets
  where name = 'echo_pulse_cron_key'
  limit 1;

  if v_secret is null then
    v_secret := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(
      v_secret,
      'echo_pulse_cron_key',
      'Echo Pulse: autenticação do Cron para a Edge Function',
      null
    );
  end if;

  insert into public.pulse_runtime_secrets(secret_key, secret_hash, updated_at)
  values (
    'cron',
    encode(extensions.digest(convert_to(v_secret, 'UTF8'), 'sha256'), 'hex'),
    now()
  )
  on conflict (secret_key) do update
  set secret_hash = excluded.secret_hash,
      updated_at = excluded.updated_at;
end;
$$;

do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'echo_pulse_project_url'
  ) then
    perform vault.create_secret(
      'https://nqklhsfaqpbjqmfzjzxk.supabase.co',
      'echo_pulse_project_url',
      'Echo Pulse: URL do projeto para o Cron',
      null
    );
  end if;

  if not exists (
    select 1 from vault.decrypted_secrets where name = 'echo_pulse_publishable_key'
  ) then
    perform vault.create_secret(
      '__REDACTED_SUPABASE_PUBLISHABLE_KEY__',
      'echo_pulse_publishable_key',
      'Echo Pulse: chave publicável usada apenas no gateway da Edge Function',
      null
    );
  end if;
end;
$$;

-- Realtime apenas para a camada social. Pulse editorial não precisa empurrar cada mudança.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.community_posts;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.community_comments;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.community_post_reactions;
    exception when duplicate_object then null;
    end;
  end if;
end;
$$;

comment on table public.pulse_sources is
  'Fontes aprovadas do Echo Pulse. Coleta automática não implica publicação automática.';
comment on table public.pulse_items is
  'Inbox editorial do Echo Pulse. Novos itens entram como inbox e só ficam públicos com status=published.';
comment on table public.community_posts is
  'Discussões contextuais da comunidade EchoArena, ligáveis a Pulse, heróis ou builds.';
comment on table public.community_comments is
  'Respostas e conversas da comunidade EchoArena.';
