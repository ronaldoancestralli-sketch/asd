-- CI ONLY: requires an empty disposable database. Existing public.media aborts
-- before any fixture/function can be created. Never run on the live SNV.
\set ON_ERROR_STOP on
BEGIN;
CREATE TABLE public.media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text, slug text UNIQUE, bucket text, folder text, file_name text,
  file_extension text, mime_type text, public_url text, entity_hint text,
  enabled boolean, fit text, scale numeric, offset_x integer, offset_y integer,
  anchor_x text, anchor_y text, updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.heroes (image_path text, card_image_path text, gif_path text);
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE FUNCTION public.mime_of(ext text) RETURNS text LANGUAGE sql IMMUTABLE
SET search_path='' AS $$ SELECT CASE ext WHEN 'png' THEN 'image/png' WHEN 'gif' THEN 'image/gif' ELSE 'application/octet-stream' END $$;
CREATE OR REPLACE FUNCTION public.upsert_hero_media(p_slug text, p_name text, p_slot text, p_path text, p_scale numeric, p_ox integer, p_oy integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_url text := 'https://nqklhsfaqpbjqmfzjzxk.supabase.co/storage/v1/object/public/game-media/' || p_path;
  v_ext text := lower(regexp_replace(p_path, '^.*\.', ''));
begin
  select id into v_id from public.media where slug = p_slug || '-' || p_slot;

  if v_id is null then
    insert into public.media
      (name, slug, bucket, folder, file_name, file_extension, mime_type,
       public_url, entity_hint, enabled, fit, scale, offset_x, offset_y,
       anchor_x, anchor_y)
    values
      (p_name || ' — ' || p_slot, p_slug || '-' || p_slot, 'game-media',
       nullif(regexp_replace(p_path, '/[^/]+$', ''), p_path),
       regexp_replace(p_path, '^.*/', ''), v_ext, public.mime_of(v_ext),
       v_url, 'hero-' || p_slot, true, 'cover',
       coalesce(p_scale, 1), coalesce(p_ox, 0), coalesce(p_oy, 0), '50%', '50%')
    returning id into v_id;
  else
    update public.media set
      name = p_name || ' — ' || p_slot,
      folder = nullif(regexp_replace(p_path, '/[^/]+$', ''), p_path),
      file_name = regexp_replace(p_path, '^.*/', ''),
      file_extension = v_ext,
      mime_type = public.mime_of(v_ext),
      public_url = v_url,
      entity_hint = 'hero-' || p_slot,
      enabled = true,
      scale = coalesce(p_scale, 1),
      offset_x = coalesce(p_ox, 0),
      offset_y = coalesce(p_oy, 0),
      updated_at = now()
    where id = v_id;
  end if;

  return v_id;
end
$function$

;
REVOKE ALL ON FUNCTION public.upsert_hero_media(text,text,text,text,numeric,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hero_media(text,text,text,text,numeric,integer,integer) TO service_role;
INSERT INTO public.heroes VALUES ('Heros/fixture/old.png', NULL, NULL);
SELECT public.upsert_hero_media('fixture-old','Fixture','main','Heros/fixture/old.png',1,0,0);
CREATE TEMP TABLE original_media AS SELECT id, slug FROM public.media;

\ir ../migrations/20260828114022_hero_media_r2_url_compat.sql

DO $test$
DECLARE
  new_url text := 'https://echo-arena-media-api.echo-arena-midia-20c30ea6.workers.dev/files/Heros/fixture/new.png';
  created uuid;
  updated uuid;
BEGIN
  -- INSERT a new media row using the actual patched production function.
  created := public.upsert_hero_media('fixture-new','Fixture','main',new_url,1.5,2,3);
  IF NOT EXISTS (SELECT 1 FROM public.media WHERE id=created AND public_url=new_url
      AND mime_type='image/png' AND scale=1.5 AND offset_x=2 AND offset_y=3) THEN
    RAISE EXCEPTION 'New R2 media INSERT contract failed';
  END IF;
  -- UPDATE an existing row must keep its ID and replace only the expected media.
  updated := public.upsert_hero_media('fixture-old','Fixture','main',new_url,1,0,0);
  IF updated IS DISTINCT FROM (SELECT id FROM original_media WHERE slug='fixture-old-main')
     OR NOT EXISTS (SELECT 1 FROM public.media WHERE id=updated AND public_url=new_url) THEN
    RAISE EXCEPTION 'Existing media UPDATE contract failed';
  END IF;
  PERFORM public.upsert_hero_media('fixture-legacy','Fixture','main','Heros/fixture/old.png',NULL,NULL,NULL);
  IF NOT EXISTS (SELECT 1 FROM public.media WHERE slug='fixture-legacy-main'
      AND public_url='https://nqklhsfaqpbjqmfzjzxk.supabase.co/storage/v1/object/public/game-media/Heros/fixture/old.png'
      AND scale=1 AND offset_x=0 AND offset_y=0) THEN
    RAISE EXCEPTION 'Relative legacy path or defaults changed';
  END IF;
  BEGIN
    PERFORM public.upsert_hero_media('fixture-invalid','Fixture','main','https://evil.example/a.png',1,0,0);
    RAISE EXCEPTION 'Unapproved host accepted by upsert';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.media WHERE slug='fixture-invalid-main') THEN
    RAISE EXCEPTION 'Rejected URL wrote a row';
  END IF;
END
$test$;
-- Reapplying the compatibility patch is safe and repeats all URL/ACL checks.

\ir ../migrations/20260828114022_hero_media_r2_url_compat.sql

SELECT 'Hero media: INSERT, UPDATE, legacy, defaults, rejected hosts, ACL and idempotence passed' AS result;
ROLLBACK;

