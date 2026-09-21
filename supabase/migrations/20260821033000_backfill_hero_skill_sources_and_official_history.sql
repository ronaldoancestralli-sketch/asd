-- EchoArena — fontes verificadas/corroboradas e histórico oficial das habilidades.
-- Princípio: fonte comunitária pode corroborar valores, mas não é promovida a
-- verificação oficial. Patches oficiais prevalecem e só cobrem o que publicam.

insert into public.source_references(url, source_type, language, title, publisher, last_checked_at)
values
  ('https://bullet-echo.fandom.com/vi/wiki/Skill', 'wiki', 'vi', 'Tabela de habilidades — Wiki Bullet Echo Việt Nam', 'Comunidade Fandom', now()),
  ('https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1039-hero-weapons-and-abilities/?han=1&hpn=1&p=web', 'official', 'en', 'Armas e habilidades dos heróis — Central de Ajuda Bullet Echo', 'ZeptoLab', now()),
  ('https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1537-drones-rework-twinkle-nerf/', 'official', 'en', 'Reformulação de drones e balanceamento de heróis', 'ZeptoLab', now()),
  ('https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1548-new-season-hero-map-and-balance-changes/', 'official', 'en', 'High Noon — temporada, herói, mapa e balanceamento', 'ZeptoLab', now()),
  ('https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1554-new-hero-alter-noir-season-player-profile-and-more/', 'official', 'en', 'Alter, temporada Noir e mudanças de balanceamento', 'ZeptoLab', now()),
  ('https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1556-bullet-echo-march-2026-update/?han=1&hpn=1&p=web', 'official', 'en', 'Atualização de março de 2026', 'ZeptoLab', now()),
  ('https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1565-july-2026-new-season-new-hero/?contact=1&p=web', 'official', 'en', 'Atualização de julho de 2026', 'ZeptoLab', now())
on conflict (url) do update set
  source_type = excluded.source_type,
  language = excluded.language,
  title = excluded.title,
  publisher = excluded.publisher,
  last_checked_at = excluded.last_checked_at;

-- O catálogo atual foi construído com valores máximos da wiki comunitária e
-- patches oficiais. Isso é corroboração, não certificação oficial completa.
update public.hero_skills
set verification_status = 'corroborated',
    verified_at = now(),
    needs_recheck = true,
    verification_note = 'Valores máximos corroborados pela Wiki Bullet Echo Việt Nam. Mudanças pontuais publicadas pela ZeptoLab prevalecem. Manter em revisão até existir uma fonte oficial completa para todos os valores da habilidade.';

-- Fonte comunitária de valores máximos: ligada a todas as habilidades atuais.
insert into public.hero_skill_source_links(
  skill_id, source_id, coverage, is_primary, verification_status,
  verified_at, verified_patch, needs_recheck, public_note
)
select s.id, r.id, 'baseline_values', true, 'corroborated',
       now(), null, true,
       'Valores máximos corroborados em fonte comunitária. Não equivale a uma ficha oficial completa e deve ser rechecado quando a ZeptoLab publicar dados mais detalhados.'
from public.hero_skills s
join public.source_references r
  on r.url = 'https://bullet-echo.fandom.com/vi/wiki/Skill'
on conflict (skill_id, source_id, coverage) do update set
  is_primary = excluded.is_primary,
  verification_status = excluded.verification_status,
  verified_at = excluded.verified_at,
  needs_recheck = excluded.needs_recheck,
  public_note = excluded.public_note;

-- Estrutura oficial: 4 habilidades por herói e 18 níveis por habilidade.
insert into public.hero_skill_source_links(
  skill_id, source_id, coverage, is_primary, verification_status,
  verified_at, verified_patch, needs_recheck, public_note
)
select s.id, r.id, 'structure', false, 'verified',
       now(), 'Estrutura oficial de habilidades', false,
       'A ZeptoLab confirma oficialmente que cada herói possui quatro habilidades especiais e cada habilidade possui 18 níveis. Esta fonte não publica todos os valores numéricos de cada habilidade.'
from public.hero_skills s
join public.source_references r
  on r.url = 'https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1039-hero-weapons-and-abilities/?han=1&hpn=1&p=web'
on conflict (skill_id, source_id, coverage) do update set
  verification_status = excluded.verification_status,
  verified_at = excluded.verified_at,
  verified_patch = excluded.verified_patch,
  needs_recheck = excluded.needs_recheck,
  public_note = excluded.public_note;

-- Patches oficiais aplicáveis a habilidades existentes no EchoArena.
with patch_links(hero_slug, skill_slug, source_url, patch_label) as (
  values
    ('arnie','salto','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1537-drones-rework-twinkle-nerf/','Reformulação de drones'),
    ('dragoon','salto','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1537-drones-rework-twinkle-nerf/','Reformulação de drones'),
    ('hurricane','armadura-adaptativa','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1548-new-season-hero-map-and-balance-changes/','High Noon'),
    ('smog','tanque','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1554-new-hero-alter-noir-season-player-profile-and-more/','Noir / Alter'),
    ('levi','cacadora','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1554-new-hero-alter-noir-season-player-profile-and-more/','Noir / Alter'),
    ('arnie','extase-em-batalha','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1554-new-hero-alter-noir-season-player-profile-and-more/','Noir / Alter'),
    ('sparkle','iniciadora','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1554-new-hero-alter-noir-season-player-profile-and-more/','Noir / Alter'),
    ('sparkle','curandeira','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1554-new-hero-alter-noir-season-player-profile-and-more/','Noir / Alter'),
    ('hurricane','recalibracao','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1554-new-hero-alter-noir-season-player-profile-and-more/','Noir / Alter'),
    ('bastion','defensor','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1554-new-hero-alter-noir-season-player-profile-and-more/','Noir / Alter'),
    ('bertha','supressao','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1556-bullet-echo-march-2026-update/?han=1&hpn=1&p=web','Março de 2026'),
    ('bertha','marca','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1556-bullet-echo-march-2026-update/?han=1&hpn=1&p=web','Março de 2026'),
    ('dragoon','mobilidade','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1556-bullet-echo-march-2026-update/?han=1&hpn=1&p=web','Março de 2026'),
    ('blot','campo-de-forca','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1556-bullet-echo-march-2026-update/?han=1&hpn=1&p=web','Março de 2026'),
    ('satoshi','campo-de-forca','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1556-bullet-echo-march-2026-update/?han=1&hpn=1&p=web','Março de 2026'),
    ('blot','vantagem-de-combate','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1565-july-2026-new-season-new-hero/?contact=1&p=web','Julho de 2026'),
    ('satoshi','tecnico','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1565-july-2026-new-season-new-hero/?contact=1&p=web','Julho de 2026')
)
insert into public.hero_skill_source_links(
  skill_id, source_id, coverage, is_primary, verification_status,
  verified_at, verified_patch, needs_recheck, public_note
)
select s.id, r.id, 'patch_override', true, 'verified',
       now(), p.patch_label, false,
       'A fonte oficial confirma a alteração específica registrada no histórico desta habilidade. Ela não substitui a conferência dos demais valores-base.'
from patch_links p
join public.heroes h on h.slug = p.hero_slug
join public.hero_skills s on s.hero_id = h.id and s.slug = p.skill_slug
join public.source_references r on r.url = p.source_url
on conflict (skill_id, source_id, coverage) do update set
  is_primary = excluded.is_primary,
  verification_status = excluded.verification_status,
  verified_at = excluded.verified_at,
  verified_patch = excluded.verified_patch,
  needs_recheck = excluded.needs_recheck,
  public_note = excluded.public_note;

-- Registra o patch oficial mais recente conhecido por habilidade sem elevar o
-- estado geral acima de 'corroborated', pois o patch cobre só parte dos dados.
with latest_patch(hero_slug, skill_slug, patch_label) as (
  values
    ('arnie','salto','Reformulação de drones'),
    ('dragoon','salto','Reformulação de drones'),
    ('hurricane','armadura-adaptativa','High Noon'),
    ('smog','tanque','Noir / Alter'),
    ('levi','cacadora','Noir / Alter'),
    ('arnie','extase-em-batalha','Noir / Alter'),
    ('sparkle','iniciadora','Noir / Alter'),
    ('sparkle','curandeira','Noir / Alter'),
    ('hurricane','recalibracao','Noir / Alter'),
    ('bastion','defensor','Noir / Alter'),
    ('bertha','supressao','Março de 2026'),
    ('bertha','marca','Março de 2026'),
    ('dragoon','mobilidade','Março de 2026'),
    ('blot','campo-de-forca','Março de 2026'),
    ('satoshi','campo-de-forca','Março de 2026'),
    ('blot','vantagem-de-combate','Julho de 2026'),
    ('satoshi','tecnico','Julho de 2026')
)
update public.hero_skills s
set verified_patch = p.patch_label,
    verified_at = now()
from latest_patch p
join public.heroes h on h.slug = p.hero_slug
where s.hero_id = h.id and s.slug = p.skill_slug;

-- Correções de descrição descobertas na auditoria contra a nota oficial Noir/Alter.
-- O histórico captura o texto anterior antes da atualização.
with fixes(hero_slug, skill_slug, new_description) as (
  values
    ('smog','tanque','No nível máximo, ao receber dano, a equipe em um raio de 300 recupera 48 de vida por segundo por 3 s. No mesmo raio, os inimigos perdem 28 de vida por segundo e recebem +25 de dispersão por 3 s. Além disso, ao receber qualquer dano, reduz em 25% a vida máxima de todos os inimigos em um raio de 400 por 3 s no nível máximo.'),
    ('bastion','defensor','No nível máximo, ao receber dano, concede à equipe em um raio de 400 +60 de armadura por segundo por 1,5 s e reduz em 30% o dano recebido pela equipe nesse raio por 1 s. Também reduz em 20% a penetração de armadura de todos os inimigos em um raio de 400 por 1 s no nível máximo.'),
    ('sparkle','iniciadora','No nível máximo, concede passivamente +20% de dano e +25% de vida máxima. Ao receber dano, ganha +25% de velocidade de movimento e +20% de dano contra a vida dos inimigos. A atualização oficial removeu a recuperação de vida por segundo e a substituiu por recuperação de vida a cada instância de dano recebida; a nota oficial não informa o valor dessa recuperação.'),
    ('sparkle','curandeira','No nível máximo, ao receber dano, concede +40% de cadência de tiro à equipe em um raio de 350 por 3 s. Passivamente, a equipe nesse raio recupera 28 de vida por segundo. Ao eliminar um inimigo, reduz em 25% o tempo de recarga da arma da equipe em um raio de 350 por 3 s.'),
    ('hurricane','recalibracao','No nível máximo, concede passivamente +25% de armadura máxima, +25% de vida máxima, -50% de tempo de recarga da arma, +5 munições por carregador e +30% de cadência de tiro. Ao acertar um inimigo, reduz em 30% a penetração de armadura do alvo por 3 s no nível máximo.')
), source as (
  select id from public.source_references
  where url = 'https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1554-new-hero-alter-noir-season-player-profile-and-more/'
)
insert into public.balance_history(
  hero_id, skill_id, source_id, patch_version, change_type,
  attribute_name, old_value, new_value, description
)
select h.id, s.id, src.id, 'Noir / Alter', 'sincronizacao_patch_oficial',
       'descricao', s.description, f.new_description,
       'Descrição sincronizada com uma alteração publicada oficialmente pela ZeptoLab; nenhum valor ausente foi estimado.'
from fixes f
join public.heroes h on h.slug = f.hero_slug
join public.hero_skills s on s.hero_id = h.id and s.slug = f.skill_slug
cross join source src
where s.description is distinct from f.new_description
  and not exists (
    select 1 from public.balance_history b
    where b.skill_id = s.id
      and b.patch_version = 'Noir / Alter'
      and b.attribute_name = 'descricao'
      and b.new_value = f.new_description
  );

with fixes(hero_slug, skill_slug, new_description) as (
  values
    ('smog','tanque','No nível máximo, ao receber dano, a equipe em um raio de 300 recupera 48 de vida por segundo por 3 s. No mesmo raio, os inimigos perdem 28 de vida por segundo e recebem +25 de dispersão por 3 s. Além disso, ao receber qualquer dano, reduz em 25% a vida máxima de todos os inimigos em um raio de 400 por 3 s no nível máximo.'),
    ('bastion','defensor','No nível máximo, ao receber dano, concede à equipe em um raio de 400 +60 de armadura por segundo por 1,5 s e reduz em 30% o dano recebido pela equipe nesse raio por 1 s. Também reduz em 20% a penetração de armadura de todos os inimigos em um raio de 400 por 1 s no nível máximo.'),
    ('sparkle','iniciadora','No nível máximo, concede passivamente +20% de dano e +25% de vida máxima. Ao receber dano, ganha +25% de velocidade de movimento e +20% de dano contra a vida dos inimigos. A atualização oficial removeu a recuperação de vida por segundo e a substituiu por recuperação de vida a cada instância de dano recebida; a nota oficial não informa o valor dessa recuperação.'),
    ('sparkle','curandeira','No nível máximo, ao receber dano, concede +40% de cadência de tiro à equipe em um raio de 350 por 3 s. Passivamente, a equipe nesse raio recupera 28 de vida por segundo. Ao eliminar um inimigo, reduz em 25% o tempo de recarga da arma da equipe em um raio de 350 por 3 s.'),
    ('hurricane','recalibracao','No nível máximo, concede passivamente +25% de armadura máxima, +25% de vida máxima, -50% de tempo de recarga da arma, +5 munições por carregador e +30% de cadência de tiro. Ao acertar um inimigo, reduz em 30% a penetração de armadura do alvo por 3 s no nível máximo.')
)
update public.hero_skills s
set description = f.new_description,
    verified_at = now(),
    verified_patch = 'Noir / Alter'
from fixes f
join public.heroes h on h.slug = f.hero_slug
where s.hero_id = h.id and s.slug = f.skill_slug
  and s.description is distinct from f.new_description;

-- Histórico estruturado das alterações oficiais já refletidas no catálogo.
with events(
  hero_slug, skill_slug, source_url, patch_version, attribute_name,
  old_value, new_value, description
) as (
  values
    ('arnie','salto','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1537-drones-rework-twinkle-nerf/','Reformulação de drones','fator_dano_armadura','0,5','1,5','Fator de dano à armadura do Salto aumentado oficialmente.'),
    ('dragoon','salto','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1537-drones-rework-twinkle-nerf/','Reformulação de drones','fator_dano_armadura','0,5','1,5','Fator de dano à armadura do Salto aumentado oficialmente.'),
    ('hurricane','armadura-adaptativa','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1548-new-season-hero-map-and-balance-changes/','High Noon','armadura_aliados_ao_acertar','+15','+35','Armadura concedida ao acertar um inimigo aumentada oficialmente.'),
    ('hurricane','armadura-adaptativa','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1548-new-season-hero-map-and-balance-changes/','High Noon','reducao_armadura_inimiga_ao_acertar','-13','-30','Redução de armadura inimiga ao acertar aumentada oficialmente.'),
    ('smog','tanque','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1554-new-hero-alter-noir-season-player-profile-and-more/','Noir / Alter','reducao_vida_maxima_inimigos_ao_receber_dano',null,'-10% a -25%; raio 200 a 400; duração 1,5 a 3 s','Novo efeito oficial. O texto público usa somente o valor máximo explicitado pela fonte.'),
    ('levi','cacadora','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1554-new-hero-alter-noir-season-player-profile-and-more/','Noir / Alter','poder_perfuracao_ao_acertar',null,'+3 a +8; duração 3 s','Novo efeito oficial ao acertar um herói inimigo.'),
    ('arnie','extase-em-batalha','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1554-new-hero-alter-noir-season-player-profile-and-more/','Noir / Alter','raio_maximo','450','350','Raio máximo do talento reduzido oficialmente.'),
    ('arnie','extase-em-batalha','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1554-new-hero-alter-noir-season-player-profile-and-more/','Noir / Alter','reducao_vida_maxima_ao_abater',null,'-4% a -20%; raio 150 a 350; duração 3 s','Novo efeito oficial ao eliminar um inimigo.'),
    ('sparkle','iniciadora','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1554-new-hero-alter-noir-season-player-profile-and-more/','Noir / Alter','cura_ao_receber_dano','cura por segundo','cura a cada instância de dano; valor não divulgado na nota','A ZeptoLab removeu a cura por segundo e adicionou cura por instância de dano. Nenhum valor foi estimado.'),
    ('sparkle','curandeira','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1554-new-hero-alter-noir-season-player-profile-and-more/','Noir / Alter','raio_maximo','275','350','Raio máximo do talento aumentado oficialmente.'),
    ('sparkle','curandeira','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1554-new-hero-alter-noir-season-player-profile-and-more/','Noir / Alter','recarga_arma_aliados_ao_abater',null,'-10% a -25%; raio 150 a 350; duração 3 s','Novo efeito oficial ao eliminar um inimigo.'),
    ('hurricane','recalibracao','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1554-new-hero-alter-noir-season-player-profile-and-more/','Noir / Alter','penetracao_armadura_alvo_ao_acertar',null,'-10% a -30%; duração 3 s','Novo efeito oficial ao acertar um inimigo.'),
    ('bastion','defensor','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1554-new-hero-alter-noir-season-player-profile-and-more/','Noir / Alter','penetracao_armadura_inimigos_ao_receber_dano',null,'-10% a -20%; raio 200 a 400; duração 1 s','Novo efeito oficial ao receber dano.'),
    ('bertha','supressao','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1556-bullet-echo-march-2026-update/?han=1&hpn=1&p=web','Março de 2026','recarga','4 s','8 s','Recarga da habilidade alterada oficialmente.'),
    ('bertha','marca','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1556-bullet-echo-march-2026-update/?han=1&hpn=1&p=web','Março de 2026','duracao_lentidao_ao_acertar','1 s','0,5 s','Duração da lentidão ao acertar reduzida oficialmente.'),
    ('dragoon','mobilidade','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1556-bullet-echo-march-2026-update/?han=1&hpn=1&p=web','Março de 2026','velocidade_movimento_aliados','+30','+20','Bônus de velocidade de movimento dos aliados reduzido oficialmente.'),
    ('dragoon','mobilidade','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1556-bullet-echo-march-2026-update/?han=1&hpn=1&p=web','Março de 2026','raio','350','375','Raio do talento de equipe aumentado oficialmente.'),
    ('blot','campo-de-forca','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1556-bullet-echo-march-2026-update/?han=1&hpn=1&p=web','Março de 2026','descricao_efeito_parede','Inimigo não pode atirar ao atravessar','Inimigo não pode atirar e tem velocidade reduzida em 90% ao atravessar','Atualização oficial de descrição alinhada ao comportamento já existente no jogo; não foi mudança de mecânica.'),
    ('satoshi','campo-de-forca','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1556-bullet-echo-march-2026-update/?han=1&hpn=1&p=web','Março de 2026','descricao_efeito_parede','Inimigo não pode atirar ao atravessar','Inimigo não pode atirar e tem velocidade reduzida em 90% ao atravessar','Atualização oficial de descrição alinhada ao comportamento já existente no jogo; não foi mudança de mecânica.'),
    ('blot','vantagem-de-combate','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1565-july-2026-new-season-new-hero/?contact=1&p=web','Julho de 2026','resistencia_armadura_aliados_ao_acertar',null,'aumenta por 3 s; valor não divulgado','Novo efeito oficial sem valor numérico publicado; nenhum número foi estimado.'),
    ('blot','vantagem-de-combate','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1565-july-2026-new-season-new-hero/?contact=1&p=web','Julho de 2026','dano_armadura_inimigos_ao_acertar',null,'reduz por 3 s; valor não divulgado','Novo efeito oficial sem valor numérico publicado; nenhum número foi estimado.'),
    ('satoshi','tecnico','https://zepto.helpshift.com/hc/en/10-bullet-echo/faq/1565-july-2026-new-season-new-hero/?contact=1&p=web','Julho de 2026','resistencia_armadura_aliados',null,'aumenta passivamente; valor não divulgado','Novo efeito oficial sem valor numérico publicado; nenhum número foi estimado.')
)
insert into public.balance_history(
  hero_id, skill_id, source_id, patch_version, change_type,
  attribute_name, old_value, new_value, description
)
select h.id, s.id, r.id, e.patch_version, 'patch_oficial',
       e.attribute_name, e.old_value, e.new_value, e.description
from events e
join public.heroes h on h.slug = e.hero_slug
join public.hero_skills s on s.hero_id = h.id and s.slug = e.skill_slug
join public.source_references r on r.url = e.source_url
where not exists (
  select 1
  from public.balance_history b
  where b.skill_id = s.id
    and b.patch_version = e.patch_version
    and b.change_type = 'patch_oficial'
    and b.attribute_name = e.attribute_name
    and b.new_value is not distinct from e.new_value
);
