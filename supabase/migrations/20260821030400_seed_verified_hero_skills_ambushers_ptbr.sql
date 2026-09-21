-- EchoArena — habilidades verificadas em fontes públicas, normalizadas para pt-BR.
-- ZeptoLab Help Center confirma 4 habilidades por herói e 18 níveis por habilidade.
-- Valores máximos foram cruzados com a Wiki Bullet Echo Việt Nam; atualizações oficiais
-- de balanceamento prevalecem em caso de conflito. Nenhum valor ausente é estimado.
-- hero_skill_levels não é preenchida sem uma progressão completa e atual dos 18 níveis.

do $$
declare
  v_missing text;
begin
  select string_agg(expected.slug, ', ' order by expected.slug)
    into v_missing
  from (values
    ('hurricane'),
    ('sparkle'),
    ('arnie')
  ) as expected(slug)
  where not exists (select 1 from public.heroes h where h.slug = expected.slug);
  if v_missing is not null then
    raise exception 'verified_hero_skill_seed_missing_heroes:%', v_missing using errcode = '23503';
  end if;
end;
$$;

with verified_skills(hero_slug,name,slug,description,skill_type,cooldown,duration,display_order) as (
  values
    ('hurricane', 'Escudo', 'escudo', 'No nível máximo, cria um escudo móvel com durabilidade 28 que bloqueia dano de todos os tipos de arma por 8 s.', 'Ativa', 9, 8, 0),
    ('hurricane', 'Recuperação em Equipe', 'recuperacao-em-equipe', 'No nível máximo, o herói não pode atirar enquanto ativa a recuperação. A equipe em um raio de 400 recupera 90 de vida e 90 de armadura por segundo por até 14 s; ao concluir ou interromper a recuperação, recebe mais 200 de vida e 200 de armadura.', 'Ativa de recuperação', 10, 14, 1),
    ('hurricane', 'Recalibração', 'recalibracao', 'No nível máximo, concede passivamente +25% de armadura máxima, +25% de vida máxima, -50% de tempo de recarga da arma, +5 munições por carregador e +30% de cadência de tiro.', 'Passiva', null, null, 2),
    ('hurricane', 'Armadura Adaptativa', 'armadura-adaptativa', 'Ao acertar um inimigo, concede armadura à equipe e reduz a armadura dos inimigos dentro de um raio de 400. O balanceamento oficial mais recente para esse talento elevou a armadura concedida de +15 para +35 e a redução de armadura inimiga de -13 para -30.', 'Talento de equipe', null, null, 3),
    ('sparkle', 'Granada', 'granada', 'No nível máximo, lança uma granada que explode após um atraso e causa até 1.743 de dano a qualquer personagem dentro de um raio de 400.', 'Ativa', 1, null, 0),
    ('sparkle', 'Recuperação em Equipe', 'recuperacao-em-equipe', 'No nível máximo, o herói não pode atirar enquanto ativa a recuperação. A equipe em um raio de 400 recupera 90 de vida e 90 de armadura por segundo por até 14 s; ao concluir ou interromper a recuperação, recebe mais 200 de vida e 200 de armadura.', 'Ativa de recuperação', 10, 14, 1),
    ('sparkle', 'Iniciadora', 'iniciadora', 'No nível máximo, concede passivamente +20% de dano e +25% de vida máxima. Ao receber dano, ganha +25% de velocidade de movimento, recupera 38 de vida por segundo durante 3 s e recebe +20% de dano contra a vida dos inimigos.', 'Passiva', null, 3, 2),
    ('sparkle', 'Curandeira', 'curandeira', 'No nível máximo, ao receber dano, concede +40% de cadência de tiro à equipe em um raio de 275 por 3 s. Passivamente, a equipe nesse raio recupera 28 de vida por segundo.', 'Talento de equipe', null, null, 3),
    ('arnie', 'Salto', 'salto', 'No nível máximo, salta 420 para a frente e, ao aterrissar, causa 300 de dano aos inimigos em um raio de 220. A atualização oficial de balanceamento elevou o fator de dano à armadura do salto para 1,5.', 'Ativa', 4, null, 0),
    ('arnie', 'Recuperação em Equipe', 'recuperacao-em-equipe', 'No nível máximo, o herói não pode atirar enquanto ativa a recuperação. A equipe em um raio de 400 recupera 90 de vida e 90 de armadura por segundo por até 14 s; ao concluir ou interromper a recuperação, recebe mais 200 de vida e 200 de armadura.', 'Ativa de recuperação', 10, 14, 1),
    ('arnie', 'Predador', 'predador', 'No nível máximo, concede passivamente -200 de ruído de corrida, +25% de vida máxima, +20% de penetração de armadura e +25% de armadura máxima. Ao acertar um inimigo, concede +25% de velocidade de movimento por 3 s.', 'Passiva', null, 3, 2),
    ('arnie', 'Êxtase em Batalha', 'extase-em-batalha', 'No nível máximo, ao acertar um inimigo, concede +32 de vida e +25% de dano à equipe dentro do raio do talento por 5 s. Uma atualização oficial reduziu o raio máximo do talento de 450 para 350. A mesma atualização adicionou: ao eliminar um inimigo, reduz em 20% a vida máxima dos inimigos em um raio de 350 por 3 s.', 'Talento de equipe', null, null, 3)
)
insert into public.hero_skills(
  hero_id,name,slug,description,skill_type,cooldown,duration,
  energy_cost,unlock_level,max_level,display_order,enabled
)
select h.id,s.name,s.slug,s.description,s.skill_type,s.cooldown,s.duration,
       null,null,18,s.display_order,true
from verified_skills s
join public.heroes h on h.slug=s.hero_slug
on conflict (hero_id,slug) do update set
  name=excluded.name,
  description=excluded.description,
  skill_type=excluded.skill_type,
  cooldown=excluded.cooldown,
  duration=excluded.duration,
  energy_cost=excluded.energy_cost,
  unlock_level=excluded.unlock_level,
  max_level=excluded.max_level,
  display_order=excluded.display_order,
  enabled=excluded.enabled;
