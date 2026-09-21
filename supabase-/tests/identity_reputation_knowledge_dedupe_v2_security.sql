-- Echo Identity — Knowledge Dedupe V2: contrato antifarming.
-- Executar somente no SNV após as migrations de reputação V2.

begin;
do $$
declare
  v_a text;
  v_b text;
  v_c text;
  v_decimal text;
  v_integer text;
  v_negative text;
  v_positive text;
  v_def text;
  v_compact text;
begin
  if to_regprocedure('public.echo_research_normalize_subject_v1(text)') is null then
    raise exception 'knowledge subject normalizer missing';
  end if;
  if to_regprocedure('public.echo_research_knowledge_fingerprint_v1(text,text,uuid,uuid,text)') is null then
    raise exception 'knowledge fingerprint helper missing';
  end if;

  v_a:=public.echo_research_knowledge_fingerprint_v1('hero_skill_level','Visão Térmica - nível 18',null,null,'1.2.3');
  v_b:=public.echo_research_knowledge_fingerprint_v1('HERO_SKILL_LEVEL','  Visão   Térmica   -   nível 18  ',null,null,'1.2.3');
  v_c:=public.echo_research_knowledge_fingerprint_v1('hero_skill_level','Visão Térmica - nível 17',null,null,'1.2.3');
  v_decimal:=public.echo_research_knowledge_fingerprint_v1('hero_skill_level','recarga 1.8 s',null,null,'1.2.3');
  v_integer:=public.echo_research_knowledge_fingerprint_v1('hero_skill_level','recarga 18 s',null,null,'1.2.3');
  v_negative:=public.echo_research_knowledge_fingerprint_v1('hero_skill_level','movimento -70%',null,null,'1.2.3');
  v_positive:=public.echo_research_knowledge_fingerprint_v1('hero_skill_level','movimento 70%',null,null,'1.2.3');

  if v_a is distinct from v_b then
    raise exception 'knowledge normalization does not collapse harmless formatting variants';
  end if;
  if v_a is not distinct from v_c then
    raise exception 'knowledge normalization collapsed different levels';
  end if;
  if v_decimal is not distinct from v_integer then
    raise exception 'knowledge normalization collapsed decimal and integer values';
  end if;
  if v_negative is not distinct from v_positive then
    raise exception 'knowledge normalization collapsed signed numeric values';
  end if;
  if public.echo_research_normalize_subject_v1('recarga 1.8 s') is distinct from 'recarga 1.8 s'
     or public.echo_research_normalize_subject_v1('movimento -70%') is distinct from 'movimento -70%' then
    raise exception 'knowledge normalizer modified semantic numeric punctuation';
  end if;
  if v_a !~ '^[a-f0-9]{64}$' then
    raise exception 'knowledge fingerprint format invalid';
  end if;

  if has_function_privilege('authenticated','public.echo_research_normalize_subject_v1(text)','EXECUTE')
     or has_function_privilege('authenticated','public.echo_research_knowledge_fingerprint_v1(text,text,uuid,uuid,text)','EXECUTE') then
    raise exception 'client can invoke private knowledge normalization helpers';
  end if;

  if not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='echo_research_contributions' and column_name='knowledge_fingerprint' and is_nullable='NO'
  ) then
    raise exception 'knowledge fingerprint column missing or nullable';
  end if;

  if not exists(
    select 1 from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='echo_research_contributions'
      and t.tgname='echo_research_set_knowledge_fingerprint' and not t.tgisinternal
  ) then
    raise exception 'knowledge fingerprint maintenance trigger missing';
  end if;

  select pg_get_functiondef('public.echo_recompute_community_reputation(uuid)'::regprocedure::oid) into v_def;
  v_compact:=regexp_replace(replace(lower(v_def),'::text',''),'[[:space:]]+','','g');
  if (position('groupbyc.knowledge_fingerprint' in v_compact)=0
      and position('groupbyknowledge_fingerprint' in v_compact)=0)
     or (position($needle$bool_or(c.status='verified'$needle$ in v_compact)=0
         and position($needle$bool_or(status='verified'$needle$ in v_compact)=0)
     or (position($needle$bool_or(c.status='corroborated'$needle$ in v_compact)=0
         and position($needle$bool_or(status='corroborated'$needle$ in v_compact)=0) then
    raise exception 'reputation does not dedupe by knowledge fingerprint';
  end if;
  if position('submission_fingerprint' in lower(v_def))>0 then
    raise exception 'reputation incorrectly dedupes by evidence fingerprint instead of knowledge';
  end if;
end $$;
rollback;
