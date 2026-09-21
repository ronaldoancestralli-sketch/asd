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
    ('raven'),
    ('freddie'),
    ('ghost')
  ) as expected(slug)
  where not exists (select 1 from public.heroes h where h.slug = expected.slug);
  if v_missing is not null then
    raise exception 'verified_hero_skill_seed_missing_heroes:%', v_missing using errcode = '23503';
  end if;
end;
$$;

with verified_skills(hero_slug,name,slug,description,skill_type,cooldown,duration,display_order) as (
  values
    ('raven', 'Varredura', 'varredura', 'No nível máximo, revela inimigos em um raio de 1.000 por 3 s e concede +35% de dano contra os inimigos revelados durante 3 s.', 'Ativa', 6, 3, 0),
    ('raven', 'Estimulante', 'estimulante', 'No nível máximo, o herói não pode atirar por 0,5 s ao ativar. Depois recebe +30% de velocidade de movimento por 8 s e recupera 45 de vida por segundo por até 8 s.', 'Ativa de recuperação', 10, 8, 1),
    ('raven', 'Treinamento', 'treinamento', 'No nível máximo, concede passivamente +60% de velocidade ao se mover devagar, +20% de vida máxima, +200 de visão e +22% de dano. Ao acertar um inimigo, concede +120 de alcance de mira por 2 s.', 'Passiva', null, 2, 2),
    ('raven', 'Tático', 'tatico', 'No nível máximo, ao eliminar um inimigo, bloqueia as armas dos inimigos em um raio de 400 por 3,5 s. Passivamente, concede +55 de alcance de tiro e +55 de alcance de mira à equipe em um raio de 400.', 'Talento de equipe', null, 3.5, 3),
    ('freddie', 'Granada', 'granada', 'No nível máximo, lança uma granada que explode após um atraso e causa até 1.743 de dano a qualquer personagem dentro de um raio de 400.', 'Ativa', 1, null, 0),
    ('freddie', 'Estimulante', 'estimulante', 'No nível máximo, o herói não pode atirar por 0,5 s ao ativar. Depois recebe +30% de velocidade de movimento por 8 s e recupera 45 de vida por segundo por até 8 s.', 'Ativa de recuperação', 10, 8, 1),
    ('freddie', 'Lutador de Rua', 'lutador-de-rua', 'No nível máximo, concede passivamente +25% de vida máxima e +20% de dano. Ao receber dano, por 3 s recebe +30% de velocidade de movimento, -65% de dispersão, +30% de cadência de tiro e -65% de dispersão ao mirar.', 'Passiva', null, 3, 2),
    ('freddie', 'Influência', 'influencia', 'No nível máximo, ao receber dano, reduz em 90% o tempo de coleta de itens da equipe em um raio de 300 por 7 s e em 90% o tempo de coleta de munição em um raio de 325 por 7 s. Ao acertar um inimigo, reduz a vida dos inimigos em 80 por segundo dentro de um raio de 325 por 1 s.', 'Talento de equipe', null, null, 3),
    ('ghost', 'Invisibilidade', 'invisibilidade', 'No nível máximo, torna o herói invisível por 7 s; receber dano encerra a invisibilidade. Durante o efeito, a velocidade de movimento aumenta 20%. Ao sair da invisibilidade, o dano aumenta 30% por 2 s e o herói fica sem poder atirar por 0,5 s.', 'Ativa', 5, 7, 0),
    ('ghost', 'Estimulante', 'estimulante', 'No nível máximo, o herói não pode atirar por 0,5 s ao ativar. Depois recebe +30% de velocidade de movimento por 8 s e recupera 45 de vida por segundo por até 8 s.', 'Ativa de recuperação', 10, 8, 1),
    ('ghost', 'Sanguessuga', 'sanguessuga', 'No nível máximo, concede passivamente -200 de ruído de corrida, +20% de dano, +20% de cadência de tiro e +25% de vida máxima. Ao acertar um inimigo, recupera 35 de vida.', 'Passiva', null, null, 2),
    ('ghost', 'Rei dos Ladrões', 'rei-dos-ladroes', 'No nível máximo, concede à equipe em um raio de 450 -60% de tempo de coleta de munição, +18 de penetração de armadura e -60% de tempo de coleta de itens.', 'Talento de equipe', null, null, 3)
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
