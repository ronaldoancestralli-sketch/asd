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
    ('stalker'),
    ('doc'),
    ('levi'),
    ('satoshi')
  ) as expected(slug)
  where not exists (select 1 from public.heroes h where h.slug = expected.slug);
  if v_missing is not null then
    raise exception 'verified_hero_skill_seed_missing_heroes:%', v_missing using errcode = '23503';
  end if;
end;
$$;

with verified_skills(hero_slug,name,slug,description,skill_type,cooldown,duration,display_order) as (
  values
    ('stalker', 'Invisibilidade', 'invisibilidade', 'No nível máximo, torna o herói invisível por 7 s; receber dano encerra a invisibilidade. Durante o efeito, a velocidade de movimento aumenta 20%. Ao sair da invisibilidade, o dano aumenta 30% por 2 s e o herói fica sem poder atirar por 0,5 s.', 'Ativa', 5, 7, 0),
    ('stalker', 'Cura em Equipe', 'cura-em-equipe', 'No nível máximo, reduz a velocidade de movimento do herói em 50% por 9 s. Restaura 72 de vida por segundo para toda a equipe em um raio de 400, por até 9 s, e reduz em 40% o dano recebido pela equipe nesse raio durante 9 s.', 'Ativa de recuperação', 20, 9, 1),
    ('stalker', 'Partidário', 'partidario', 'No nível máximo, concede passivamente -60% de ruído de corrida, +25% de vida máxima, -100% de dispersão em movimento, +35 de velocidade de movimento e +25% de dano.', 'Passiva', null, null, 2),
    ('stalker', 'Emboscada', 'emboscada', 'No nível máximo, ao eliminar um inimigo, concede +370 de vida à equipe em um raio de 400 e reduz em 90% o tempo de recarga da arma da equipe nesse raio por 5 s.', 'Talento de equipe', null, 5, 3),
    ('doc', 'Lança-granadas', 'lanca-granadas', 'No nível máximo, dispara um projétil explosivo que causa até 1.455 de dano em um raio de 200. Um acerto direto remove escudos móveis e paredes de energia.', 'Ativa', 2, null, 0),
    ('doc', 'Cura em Equipe', 'cura-em-equipe', 'No nível máximo, reduz a velocidade de movimento do herói em 50% por 9 s. Restaura 72 de vida por segundo para toda a equipe em um raio de 400, por até 9 s, e reduz em 40% o dano recebido pela equipe nesse raio durante 9 s.', 'Ativa de recuperação', 20, 9, 1),
    ('doc', 'Marcado pela Batalha', 'marcado-pela-batalha', 'No nível máximo, concede passivamente +25% de vida máxima, +20% de dano e +25% de armadura máxima. Ao receber dano, por 2 s reduz 60% da dispersão, aumenta em 60 o alcance de tiro, reduz 65% da dispersão ao mirar e aumenta em 60 o alcance de mira.', 'Passiva', null, 2, 2),
    ('doc', 'Prontidão de Combate', 'prontidao-de-combate', 'No nível máximo, ao receber dano, concede +40% de dano à equipe em um raio de 400 por 3 s e reduz em 70% o tempo de recarga da arma da equipe nesse raio por 3,5 s.', 'Talento de equipe', null, null, 3),
    ('levi', 'Visão Térmica', 'visao-termica', 'No nível máximo, permite atirar através de paredes por 9 s, reduz a velocidade de movimento em 70% e concede +10 de poder de perfuração. Eliminar um inimigo durante o efeito restaura 1 carga; após ativar, o herói não pode atirar por 0,5 s.', 'Ativa', 9, 9, 0),
    ('levi', 'Cura em Equipe', 'cura-em-equipe', 'No nível máximo, reduz a velocidade de movimento do herói em 50% por 9 s. Restaura 72 de vida por segundo para toda a equipe em um raio de 400, por até 9 s, e reduz em 40% o dano recebido pela equipe nesse raio durante 9 s.', 'Ativa de recuperação', 20, 9, 1),
    ('levi', 'Caçadora', 'cacadora', 'No nível máximo, concede passivamente +150 de visão, +25% de vida máxima e +25% de dano. Ao acertar um inimigo, aumenta em 25% o alcance de mira por 3 s e reduz em 40% a cadência de tiro de um inimigo ferido por 3 s. Uma atualização oficial posterior também adicionou +8 de poder de perfuração da arma ao acertar um herói inimigo, por 3 s.', 'Passiva', null, 3, 2),
    ('levi', 'Atordoamento', 'atordoamento', 'No nível máximo, ao eliminar um inimigo, atordoa inimigos em um raio de 400 por 1,3 s; a visão e a velocidade de movimento dos inimigos atordoados caem 99% por 1,5 s. Passivamente, reduz em 60% o tempo de mira da equipe em um raio de 400.', 'Talento de equipe', null, null, 3),
    ('satoshi', 'Campo de Força', 'campo-de-forca', 'No nível máximo, cria uma parede de energia com durabilidade 28 que bloqueia dano de armas por 9 s e concede +45 de alcance de mira e +45 de alcance de tiro. Inimigos que atravessam a parede não podem atirar e têm a velocidade de movimento reduzida em 90%.', 'Ativa', 4, 9, 0),
    ('satoshi', 'Cura em Equipe', 'cura-em-equipe', 'No nível máximo, reduz a velocidade de movimento do herói em 50% por 9 s. Restaura 72 de vida por segundo para toda a equipe em um raio de 400, por até 9 s, e reduz em 40% o dano recebido pela equipe nesse raio durante 9 s.', 'Ativa de recuperação', 20, 9, 1),
    ('satoshi', 'Recalibração', 'recalibracao', 'No nível máximo, concede passivamente -60% de tempo de recarga da arma, +25% de dano, +25% de armadura máxima, -80% de dispersão e +5 munições por carregador.', 'Passiva', null, null, 2),
    ('satoshi', 'Técnico', 'tecnico', 'No nível máximo, ao eliminar um inimigo, restaura 480 de armadura. Passivamente, concede +35 de armadura por segundo à equipe em um raio de 400. Desde a atualização oficial de julho de 2026, também aumenta passivamente a resistência de armadura dos aliados dentro do raio; a nota oficial não informa o valor numérico desse bônus.', 'Talento de equipe', null, null, 3)
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
