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
    ('slayer'),
    ('mirage'),
    ('firefly'),
    ('blot')
  ) as expected(slug)
  where not exists (select 1 from public.heroes h where h.slug = expected.slug);
  if v_missing is not null then
    raise exception 'verified_hero_skill_seed_missing_heroes:%', v_missing using errcode = '23503';
  end if;
end;
$$;

with verified_skills(hero_slug,name,slug,description,skill_type,cooldown,duration,display_order) as (
  values
    ('slayer', 'Visão Térmica', 'visao-termica', 'No nível máximo, permite atirar através de paredes por 9 s, reduz a velocidade de movimento em 70% e concede +10 de poder de perfuração. Eliminar um inimigo durante o efeito restaura 1 carga; após ativar, o herói não pode atirar por 0,5 s.', 'Ativa', 9, 9, 0),
    ('slayer', 'Bandagem', 'bandagem', 'No nível máximo, restaura 390 de vida e reduz em 50% o ruído de movimento por 4 s.', 'Ativa de recuperação', 1, null, 1),
    ('slayer', 'Cartuchos de Abate', 'cartuchos-de-abate', 'No nível máximo, concede passivamente +11 de poder de perfuração, +25% de vida máxima, +25% de armadura máxima e +20% de dano. Ao acertar um inimigo ferido, causa cegueira por 1,25 s; durante a cegueira, o inimigo não pode atirar.', 'Passiva', null, null, 2),
    ('slayer', 'Mira', 'mira', 'No nível máximo, ao acertar um inimigo, concede +50% de dano e reduz em 35% a dispersão ao mirar para toda a equipe em um raio de 400 por 5,5 s.', 'Talento de equipe', null, 5.5, 3),
    ('mirage', 'Recuo', 'recuo', 'No nível máximo, salta 400 para trás, concede +35% de velocidade de movimento por 5 s e +50 de alcance de tiro por 5 s.', 'Ativa', 3, 5, 0),
    ('mirage', 'Bandagem', 'bandagem', 'No nível máximo, restaura 390 de vida e reduz em 50% o ruído de movimento por 4 s.', 'Ativa de recuperação', 1, null, 1),
    ('mirage', 'Precisão', 'precisao', 'No nível máximo, concede passivamente +25% de vida máxima, -200 de ruído de corrida, +20% de penetração de armadura, +25% de armadura máxima e +25% de dano.', 'Passiva', null, null, 2),
    ('mirage', 'Agilidade', 'agilidade', 'No nível máximo, ao acertar um inimigo, concede +55 de velocidade de movimento e +20% de cadência de tiro para toda a equipe em um raio de 400 por 3,5 s.', 'Talento de equipe', null, 3.5, 3),
    ('firefly', 'Granada', 'granada', 'No nível máximo, lança uma granada que explode após um atraso e causa até 1.743 de dano a qualquer personagem dentro de um raio de 400.', 'Ativa', 1, null, 0),
    ('firefly', 'Bandagem', 'bandagem', 'No nível máximo, restaura 390 de vida e reduz em 50% o ruído de movimento por 4 s.', 'Ativa de recuperação', 1, null, 1),
    ('firefly', 'Ferrão', 'ferrao', 'No nível máximo, concede passivamente +25% de dano contra a vida dos inimigos, +25% de vida máxima e +20% de dano. Ao receber dano, concede +100% de cadência de tiro por 5 s. Ao acertar um inimigo, reduz a vida dele em 30 por segundo durante 5 s.', 'Passiva', null, 5, 2),
    ('firefly', 'Vigilância', 'vigilancia', 'No nível máximo, ao eliminar um inimigo, concede à equipe em um raio de 400 +45% de dano contra a vida dos inimigos e +50% de cadência de tiro por 3,5 s.', 'Talento de equipe', null, 3.5, 3),
    ('blot', 'Campo de Força', 'campo-de-forca', 'No nível máximo, cria uma parede de energia com durabilidade 28 que bloqueia dano de armas por 9 s e concede +45 de alcance de mira e +45 de alcance de tiro. Inimigos que atravessam a parede não podem atirar e têm a velocidade de movimento reduzida em 90%.', 'Ativa', 4, 9, 0),
    ('blot', 'Bandagem', 'bandagem', 'No nível máximo, restaura 390 de vida e reduz em 50% o ruído de movimento por 4 s.', 'Ativa de recuperação', 1, null, 1),
    ('blot', 'Rifle Aprimorado', 'rifle-aprimorado', 'No nível máximo, concede passivamente +6 munições por carregador, +30% de dano, +35% de armadura máxima e -50% de tempo de mira. Ao acertar um inimigo, reduz a armadura dele em 390.', 'Passiva', null, null, 2),
    ('blot', 'Vantagem de Combate', 'vantagem-de-combate', 'No nível máximo, ao eliminar um inimigo, reduz em 50% o dano recebido pela equipe em um raio de 400 por 3 s. Ao acertar um inimigo, concede +450 de armadura à equipe em um raio de 400. Desde a atualização oficial de julho de 2026, o acerto também aumenta por 3 s a resistência de armadura dos aliados no raio e reduz por 3 s o dano à armadura causado pelos inimigos no raio; a nota oficial não informa valores numéricos para esses dois efeitos.', 'Talento de equipe', null, 3, 3)
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
