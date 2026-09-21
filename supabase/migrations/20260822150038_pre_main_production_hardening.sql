-- Pré-main production hardening.
-- 1) Materializa no CMS apenas o texto editorial que já está publicado em estatisticas.html.
-- 2) Remove exclusão direta de temporadas por clientes autenticados para preservar histórico.

insert into public.site_pages (page_key, content, published)
values (
  'statistics',
  jsonb_build_object(
    'meta_title', 'Estatísticas — Echo Arena',
    'meta_description', 'Inteligência pública do Echo Arena: catálogo, atividade publicada, builds e cobertura do arsenal.',
    'watermark', 'INTEL',
    'explorer_kicker', 'INTELIGÊNCIA DA ARENA',
    'explorer_title', 'Entenda o que está',
    'explorer_accent', 'vivo agora.',
    'explorer_description', 'Uma leitura objetiva do catálogo e da atividade pública do Echo Arena. Aqui você vê o que está disponível, onde existem builds publicadas e como heróis e equipamentos estão distribuídos — sem transformar ausência de dados em tendência.',
    'activity_button', 'Ver atividade',
    'open_build_button', 'Criar build',
    'command_kicker', 'LEITURA ATUAL',
    'command_title', 'Estado público da Arena',
    'metric_heroes_label', 'Heróis ativos',
    'metric_heroes_description', 'Catálogo disponível',
    'metric_builds_label', 'Builds publicadas',
    'metric_builds_description', 'Atividade compartilhada',
    'metric_equipments_label', 'Equipamentos ativos',
    'metric_equipments_description', 'Arsenal disponível',
    'metric_compositions_label', 'Composições públicas',
    'metric_compositions_description', 'Trios compartilhados',
    'activity_kicker', 'ATIVIDADE PUBLICADA',
    'activity_title', 'Onde as builds estão aparecendo',
    'activity_description', 'Não é um ranking de força nem de meta. É a distribuição real das builds atualmente devolvidas pela superfície pública.',
    'activity_link', 'Abrir hub de builds →',
    'activity_criterion', 'Builds → views → curtidas',
    'reading_kicker', 'COMO LER',
    'reading_title', 'Quantidade antes de popularidade.',
    'reading_description', 'A página só trata views e curtidas como sinal quando esses valores realmente existem. Com interação zerada, a leitura principal continua sendo quantidade de builds publicadas.',
    'coverage_kicker', 'COBERTURA DO CATÁLOGO',
    'coverage_title', 'Como a Arena está distribuída',
    'coverage_description', 'Distribuições simples, calculadas diretamente sobre os registros ativos desta leitura.',
    'coverage_meta', 'CONTAGENS, NÃO PERCENTUAIS',
    'classes_kicker', 'HERÓIS',
    'classes_title', 'Classes no catálogo',
    'equipment_kicker', 'EQUIPAMENTOS',
    'equipment_title', 'Arsenal por slot',
    'build_feed_kicker', 'BUILD FEED',
    'build_feed_title', 'Builds públicas recentes',
    'build_feed_description', 'Ordem cronológica da superfície pública atual. Sem chamar de “melhores” quando a base ainda não sustenta essa afirmação.',
    'build_feed_meta', 'MAIS RECENTES PRIMEIRO',
    'signal_kicker', 'SINAL DE ENGAJAMENTO',
    'methodology_kicker', 'FONTES E LIMITES',
    'methodology_title', 'O painel mostra o que existe. Não preenche o que falta.',
    'source_heroes_title', 'Heróis',
    'source_heroes_description', 'usam v_heroes_complete com registros habilitados; a mídia vem das fontes atuais da própria view.',
    'source_builds_title', 'Builds',
    'source_builds_description', 'usam v_popular_builds, mas a página só fala em popularidade quando existe engajamento mensurável.',
    'source_failures_title', 'Falha de fonte',
    'source_failures_description', 'mantém “—” e um estado explícito de indisponibilidade. Erro de consulta não vira zero.'
  ),
  true
)
on conflict (page_key) do nothing;

drop policy if exists seasons_admin_delete on public.seasons;
revoke delete on table public.seasons from public, anon, authenticated;
