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
    ('smog'),
    ('bertha'),
    ('bastion'),
    ('leviathan'),
    ('dragoon')
  ) as expected(slug)
  where not exists (select 1 from public.heroes h where h.slug = expected.slug);
  if v_missing is not null then
    raise exception 'verified_hero_skill_seed_missing_heroes:%', v_missing using errcode = '23503';
  end if;
end;
$$;

with verified_skills(hero_slug,name,slug,description,skill_type,cooldown,duration,display_order) as (
  values
    ('smog', 'Lança-granadas', 'lanca-granadas', 'No nível máximo, dispara um projétil explosivo que causa até 1.455 de dano em um raio de 200. Um acerto direto remove escudos móveis e paredes de energia.', 'Ativa', 2, null, 0),
    ('smog', 'Kit de Combate', 'kit-de-combate', 'No nível máximo, reduz a velocidade de movimento do herói em 90% por 5 s e impede disparos durante esse período. Após 5 s, restaura 1.220 de vida e armadura; também concede +550 de vida máxima e +550 de armadura máxima por 10 s.', 'Ativa de recuperação', 10, null, 1),
    ('smog', 'Fogo Direcional', 'fogo-direcional', 'No nível máximo, concede passivamente +25% de armadura máxima e +25% de vida máxima. Ao receber dano, recupera 25 de vida e recebe +30% de cadência de tiro por 2 s e +30% de dano.', 'Passiva', null, 2, 2),
    ('smog', 'Tanque', 'tanque', 'No nível máximo, ao receber dano, a equipe em um raio de 300 recupera 48 de vida por segundo por 3 s. No mesmo raio, os inimigos perdem 28 de vida por segundo e recebem +25 de dispersão por 3 s.', 'Talento de equipe', null, 3, 3),
    ('bertha', 'Supressão', 'supressao', 'No nível máximo, o herói para e dispara na direção escolhida até acabar a munição. Durante a habilidade, a velocidade de movimento cai 95%, o poder de perfuração aumenta em 13, a visão aumenta 50% e o tempo de recarga da arma diminui 30%. A atualização oficial de março de 2026 definiu a recarga da habilidade em 8 s. A reposição é de 18 s, há até 4 cargas e a habilidade começa com 1 carga.', 'Ativa', 8, null, 0),
    ('bertha', 'Kit de Combate', 'kit-de-combate', 'No nível máximo, reduz a velocidade de movimento do herói em 90% por 5 s e impede disparos durante esse período. Após 5 s, restaura 1.220 de vida e armadura; também concede +550 de vida máxima e +550 de armadura máxima por 10 s.', 'Ativa de recuperação', 10, null, 1),
    ('bertha', 'Marca', 'marca', 'No nível máximo, concede passivamente +170 de alcance de mira, +22% de armadura máxima, -35% de dispersão ao mirar, +20% de dano e +20% de vida máxima. Ao acertar um inimigo, reduz a velocidade de movimento dele em 30% por 0,5 s, conforme o balanceamento oficial de março de 2026.', 'Passiva', null, 0.5, 2),
    ('bertha', 'Autogiro', 'autogiro', 'No nível máximo, ao eliminar um inimigo, os inimigos em um raio de 400 passam a receber +50% de dano e +75% de dispersão por 4,5 s.', 'Talento de equipe', null, 4.5, 3),
    ('bastion', 'Escudo', 'escudo', 'No nível máximo, cria um escudo móvel com durabilidade 28 que bloqueia dano de todos os tipos de arma por 8 s.', 'Ativa', 9, 8, 0),
    ('bastion', 'Kit de Combate', 'kit-de-combate', 'No nível máximo, reduz a velocidade de movimento do herói em 90% por 5 s e impede disparos durante esse período. Após 5 s, restaura 1.220 de vida e armadura; também concede +550 de vida máxima e +550 de armadura máxima por 10 s.', 'Ativa de recuperação', 10, null, 1),
    ('bastion', 'Blindado', 'blindado', 'No nível máximo, concede passivamente +25% de armadura máxima, +20% de vida máxima e +20% de dano. Ao receber dano, restaura 28 de armadura; além disso, recupera passivamente 28 de armadura por segundo.', 'Passiva', null, null, 2),
    ('bastion', 'Defensor', 'defensor', 'No nível máximo, ao receber dano, concede à equipe em um raio de 400 +60 de armadura por segundo por 1,5 s e reduz em 30% o dano recebido pela equipe nesse raio por 1 s.', 'Talento de equipe', null, null, 3),
    ('leviathan', 'Torreta', 'torreta', 'No nível máximo, instala uma torreta com durabilidade 17 e duração de 20 s. A torreta tem 218 de dano, 1.488 de vida e 1.993 de armadura.', 'Ativa', 5, 20, 0),
    ('leviathan', 'Kit de Combate', 'kit-de-combate', 'No nível máximo, reduz a velocidade de movimento do herói em 90% por 5 s e impede disparos durante esse período. Após 5 s, restaura 1.220 de vida e armadura; também concede +550 de vida máxima e +550 de armadura máxima por 10 s.', 'Ativa de recuperação', 10, null, 1),
    ('leviathan', 'Fogo de Supressão', 'fogo-de-supressao', 'No nível máximo, concede passivamente -50% de tempo de recarga da arma, +20% de dano, +4 de poder de perfuração, +22% de armadura máxima e +18% de alcance de tiro.', 'Passiva', null, null, 2),
    ('leviathan', 'Opressão', 'opressao', 'No nível máximo, ao eliminar um inimigo, reduz em 50% a cadência de tiro e em 55% a velocidade de movimento dos inimigos em um raio de 400 por 4,5 s.', 'Talento de equipe', null, 4.5, 3),
    ('dragoon', 'Salto', 'salto', 'No nível máximo, salta 420 para a frente e, ao aterrissar, causa 300 de dano aos inimigos em um raio de 220. A atualização oficial de balanceamento elevou o fator de dano à armadura do salto para 1,5.', 'Ativa', 4, null, 0),
    ('dragoon', 'Kit de Combate', 'kit-de-combate', 'No nível máximo, reduz a velocidade de movimento do herói em 90% por 5 s e impede disparos durante esse período. Após 5 s, restaura 1.220 de vida e armadura; também concede +550 de vida máxima e +550 de armadura máxima por 10 s.', 'Ativa de recuperação', 10, null, 1),
    ('dragoon', 'Tempestade', 'tempestade', 'No nível máximo, concede passivamente -95% de dispersão em movimento, +25% de armadura máxima, +17% de penetração de armadura, +20% de dano e +25% de vida máxima.', 'Passiva', null, null, 2),
    ('dragoon', 'Mobilidade', 'mobilidade', 'Talento de equipe. A atualização oficial de março de 2026 ajustou o bônus de velocidade de movimento dos aliados para +20 e o raio do talento para 375. O talento também reduz em 50% o ruído de corrida dos aliados dentro do raio.', 'Talento de equipe', null, null, 3)
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
