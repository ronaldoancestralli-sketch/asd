-- Echo Pulse permanece em preparação interna: somente Admin pode ler/operar.
-- Visitantes e usuários autenticados comuns não recebem linhas do Pulse pela Data API.

drop policy if exists pulse_items_public_read on public.pulse_items;
drop policy if exists pulse_item_heroes_public_read on public.pulse_item_heroes;

revoke select on public.pulse_items from anon;
revoke select on public.pulse_item_heroes from anon;

-- authenticated mantém os privilégios de tabela necessários ao painel Admin,
-- mas a única policy aplicável é pulse_*_admin_all, condicionada a is_admin().

-- Enquanto o Pulse estiver fechado, discussões públicas não podem ser ligadas
-- a itens internos do Pulse. Admin continua podendo trabalhar com esse contexto.
drop policy if exists community_posts_public_read on public.community_posts;
create policy community_posts_public_read
on public.community_posts
for select
to anon, authenticated
using (status = 'active' and pulse_item_id is null);

drop policy if exists community_posts_insert on public.community_posts;
create policy community_posts_insert
on public.community_posts
for insert
to authenticated
with check (
  author_id = (select auth.uid())
  and not (select public.is_blocked())
  and status = 'active'
  and is_pinned = false
  and reaction_count = 0
  and reply_count = 0
  and (pulse_item_id is null or (select public.is_admin()))
);

comment on table public.pulse_items is
  'Inbox editorial interna do Echo Pulse. Em 2026-08-21 o módulo público permanece Em breve; leitura permitida apenas a Admin/service role.';
comment on table public.pulse_item_heroes is
  'Vínculos internos do Echo Pulse com heróis. Leitura pública desativada enquanto o módulo estiver Em breve.';
