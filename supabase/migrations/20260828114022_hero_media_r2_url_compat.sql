-- SNV only. Pure URL compatibility; no row updates or backfill.
-- Generated/registered through the Supabase integration (CLI unavailable).
CREATE OR REPLACE FUNCTION public.echo_hero_media_public_url(p_path text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE STRICT
SECURITY INVOKER
SET search_path = ''
AS $url$
BEGIN
  IF p_path ~ '^https://(echo-arena-media-api[.]echo-arena-midia-20c30ea6[.]workers[.]dev/files/|echo-arena-media-api[.]28vkwpbtz5[.]workers[.]dev/(files|legacy)/|nqklhsfaqpbjqmfzjzxk[.]supabase[.]co/storage/v1/object/public/game-media/)[^?#[:space:]]+$'
     AND position(chr(92) in p_path) = 0 THEN
    RETURN p_path;
  END IF;
  IF p_path ~ '^[A-Za-z][A-Za-z0-9+.-]*:' OR left(p_path, 2) = '//' THEN
    RAISE EXCEPTION 'Unsupported absolute hero media URL' USING ERRCODE = '22023';
  END IF;
  RETURN 'https://nqklhsfaqpbjqmfzjzxk.supabase.co/storage/v1/object/public/game-media/' || p_path;
END
$url$;
REVOKE ALL ON FUNCTION public.echo_hero_media_public_url(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.echo_hero_media_public_url(text) TO service_role;

-- Test URL resolution without writing any application records.
DO $test$
DECLARE
  base text := 'https://nqklhsfaqpbjqmfzjzxk.supabase.co/storage/v1/object/public/game-media/';
  candidate text;
BEGIN
  FOREACH candidate IN ARRAY ARRAY[
    'https://echo-arena-media-api.echo-arena-midia-20c30ea6.workers.dev/files/Heros/test/image.png',
    'https://echo-arena-media-api.28vkwpbtz5.workers.dev/files/image.png',
    'https://echo-arena-media-api.28vkwpbtz5.workers.dev/legacy/image.png',
    'https://nqklhsfaqpbjqmfzjzxk.supabase.co/storage/v1/object/public/game-media/image.png'
  ] LOOP
    IF public.echo_hero_media_public_url(candidate) IS DISTINCT FROM candidate THEN
      RAISE EXCEPTION 'Absolute media URL regression';
    END IF;
  END LOOP;
  IF public.echo_hero_media_public_url('Heros/test/image one.png') IS DISTINCT FROM base || 'Heros/test/image one.png'
     OR public.echo_hero_media_public_url(NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy media URL regression';
  END IF;
  FOREACH candidate IN ARRAY ARRAY[
    'http://echo-arena-media-api.echo-arena-midia-20c30ea6.workers.dev/files/a.png',
    'https://echo-arena-media-api.echo-arena-midia-20c30ea6.workers.dev.evil.example/files/a.png',
    'https://echo-arena-media-api.echo-arena-midia-20c30ea6.workers.dev@evil.example/files/a.png',
    'https://evil.example/a.png', 'javascript:alert(1)', '//evil.example/a.png',
    'https://echo-arena-media-api.echo-arena-midia-20c30ea6.workers.dev/files/'
  ] LOOP
    BEGIN
      PERFORM public.echo_hero_media_public_url(candidate);
      RAISE EXCEPTION 'Unsupported URL was accepted';
    EXCEPTION WHEN invalid_parameter_value THEN
      NULL;
    END;
  END LOOP;
  -- Every currently stored relative path must retain exactly its old destination.
  IF EXISTS (
    SELECT 1 FROM public.heroes h
    CROSS JOIN LATERAL (VALUES(h.image_path),(h.card_image_path),(h.gif_path)) v(path)
    WHERE path IS NOT NULL AND path !~ '^[A-Za-z][A-Za-z0-9+.-]*:' AND left(path,2) <> '//'
      AND public.echo_hero_media_public_url(path) IS DISTINCT FROM base || path
  ) THEN
    RAISE EXCEPTION 'Existing hero media destination changed';
  END IF;
END
$test$;

-- Replace only the URL initializer, preserving the rest of the live function,
-- its signature, owner, SECURITY DEFINER setting and existing EXECUTE ACL.
DO $patch$
DECLARE
  target regprocedure := 'public.upsert_hero_media(text,text,text,text,numeric,integer,integer)'::regprocedure;
  definition text;
  previous_acl aclitem[];
  previous_owner oid;
  old_line text := $old$  v_url text := 'https://nqklhsfaqpbjqmfzjzxk.supabase.co/storage/v1/object/public/game-media/' || p_path;$old$;
  new_line text := '  v_url text := public.echo_hero_media_public_url(p_path);';
BEGIN
  SELECT pg_get_functiondef(oid), proacl, proowner
    INTO definition, previous_acl, previous_owner FROM pg_proc WHERE oid=target;
  IF has_function_privilege('anon', target, 'EXECUTE')
     OR has_function_privilege('authenticated', target, 'EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected execution permissions on internal media function';
  END IF;
  IF position(old_line in definition) > 0 THEN
    EXECUTE replace(definition, old_line, new_line);
  ELSIF position(new_line in definition) = 0 THEN
    RAISE EXCEPTION 'Media function drift: URL initializer requires review';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE oid=target
      AND (proacl IS DISTINCT FROM previous_acl OR proowner IS DISTINCT FROM previous_owner OR NOT prosecdef)
  ) THEN
    RAISE EXCEPTION 'Media function security contract changed';
  END IF;
  IF has_function_privilege('anon', 'public.echo_hero_media_public_url(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.echo_hero_media_public_url(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'URL helper must not be a public RPC';
  END IF;
END
$patch$;

