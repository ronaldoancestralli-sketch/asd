/* Campos editoriais do site. Dados de heróis, equipamentos e builds continuam
   nos módulos próprios do Admin e nunca são sobrescritos por este CMS. */
const field = (key, label, type = 'text', group = 'Geral', extra = {}) => ({
  key, label, type, group, ...extra
});

export const SITE_CONTENT_PAGES = [
  {
    key: 'home', label: 'Página inicial', url: '../index.html',
    description: 'Apresentação, seções editoriais, chamadas e imagem de fundo.',
    fields: [
      field('meta_title', 'Título da aba', 'text', 'SEO', { max: 70 }),
      field('meta_description', 'Descrição para buscadores', 'textarea', 'SEO', { max: 180 }),
      field('featured_hero_id', 'Herói em destaque', 'hero', 'Destaque'),
      field('hero_background', 'Imagem de fundo do destaque', 'image', 'Destaque'),
      field('hero_eyebrow', 'Chamada superior', 'text', 'Destaque', { max: 45 }),
      field('hero_sync', 'Selo de atualização', 'text', 'Destaque', { max: 40 }),
      field('hero_tag_secondary', 'Tag secundária', 'text', 'Destaque', { max: 24 }),
      field('hero_tag_tertiary', 'Terceira tag', 'text', 'Destaque', { max: 24 }),
      field('hero_primary_button', 'Botão principal', 'text', 'Destaque', { max: 28 }),
      field('hero_secondary_button', 'Botão de criar build', 'text', 'Destaque', { max: 28 }),
      field('show_featured_build', 'Mostrar build em destaque', 'toggle', 'Destaque'),
      field('pulse_kicker', 'Identificador', 'text', 'Pulso da comunidade', { max: 35 }),
      field('pulse_title', 'Título', 'text', 'Pulso da comunidade', { max: 70 }),
      field('pulse_season', 'Temporada atual', 'text', 'Pulso da comunidade', { max: 35 }),
      field('discover_kicker', 'Chamada superior', 'text', 'Descobrir heróis', { max: 40 }),
      field('discover_title', 'Título', 'text', 'Descobrir heróis', { max: 70 }),
      field('discover_accent', 'Trecho em degradê', 'text', 'Descobrir heróis', { max: 45 }),
      field('discover_description', 'Descrição', 'textarea', 'Descobrir heróis', { max: 220 }),
      field('discover_button', 'Texto do botão', 'text', 'Descobrir heróis', { max: 30 }),
      field('discover_url', 'Destino do botão', 'url', 'Descobrir heróis'),
      field('compare_kicker', 'Chamada superior', 'text', 'Comparador', { max: 40 }),
      field('compare_title', 'Título', 'text', 'Comparador', { max: 55 }),
      field('compare_accent', 'Trecho em degradê', 'text', 'Comparador', { max: 35 }),
      field('compare_description', 'Descrição', 'textarea', 'Comparador', { max: 220 }),
      field('compare_button', 'Texto do botão', 'text', 'Comparador', { max: 35 }),
      field('compare_url', 'Destino do botão', 'url', 'Comparador'),
      field('community_kicker', 'Chamada superior', 'text', 'Comunidade', { max: 40 }),
      field('community_title', 'Título', 'text', 'Comunidade', { max: 60 }),
      field('community_accent', 'Trecho em degradê', 'text', 'Comunidade', { max: 40 }),
      field('community_description', 'Descrição', 'textarea', 'Comunidade', { max: 220 }),
      field('explore_kicker', 'Chamada superior', 'text', 'Explorar', { max: 40 }),
      field('explore_title', 'Título', 'text', 'Explorar', { max: 65 }),
      field('explore_accent', 'Trecho em degradê', 'text', 'Explorar', { max: 40 }),
      field('explore_description', 'Descrição', 'textarea', 'Explorar', { max: 220 }),
      field('equipment_card_title', 'Título do card Equipamentos', 'text', 'Explorar', { max: 35 }),
      field('equipment_card_description', 'Descrição do card Equipamentos', 'textarea', 'Explorar', { max: 200 }),
      field('equipment_card_url', 'Destino do card Equipamentos', 'url', 'Explorar'),
      field('heroes_card_title', 'Título do card Heróis', 'text', 'Explorar', { max: 35 }),
      field('heroes_card_description', 'Descrição do card Heróis', 'textarea', 'Explorar', { max: 200 }),
      field('heroes_card_url', 'Destino do card Heróis', 'url', 'Explorar'),
      field('teams_card_title', 'Título do card Composições', 'text', 'Explorar', { max: 35 }),
      field('teams_card_description', 'Descrição do card Composições', 'textarea', 'Explorar', { max: 200 }),
      field('teams_card_url', 'Destino do card Composições', 'url', 'Explorar'),
      field('cta_kicker', 'Chamada superior', 'text', 'Chamada final', { max: 40 }),
      field('cta_title', 'Título', 'text', 'Chamada final', { max: 60 }),
      field('cta_accent', 'Trecho em degradê', 'text', 'Chamada final', { max: 35 }),
      field('cta_description', 'Descrição', 'textarea', 'Chamada final', { max: 220 }),
      field('cta_primary', 'Botão principal', 'text', 'Chamada final', { max: 30 }),
      field('cta_secondary', 'Botão secundário', 'text', 'Chamada final', { max: 30 }),
      field('cta_primary_url', 'Destino do botão principal', 'url', 'Chamada final'),
      field('cta_secondary_url', 'Destino do botão secundário', 'url', 'Chamada final'),
      field('show_discover', 'Mostrar seção Descobrir heróis', 'toggle', 'Visibilidade'),
      field('show_compare', 'Mostrar seção Comparador', 'toggle', 'Visibilidade'),
      field('show_community', 'Mostrar seção Comunidade', 'toggle', 'Visibilidade'),
      field('show_explore', 'Mostrar seção Explorar', 'toggle', 'Visibilidade'),
      field('show_stats', 'Mostrar números do site', 'toggle', 'Visibilidade'),
      field('show_cta', 'Mostrar chamada final', 'toggle', 'Visibilidade')
    ]
  },
  {
    key: 'heroes', label: 'Heróis', url: '../herois.html',
    description: 'Cabeçalho e instruções da lista. Cards e imagens vêm do cadastro de heróis.',
    fields: [
      field('meta_title', 'Título da aba', 'text', 'SEO', { max: 70 }),
      field('meta_description', 'Descrição para buscadores', 'textarea', 'SEO', { max: 180 }),
      field('title', 'Título da página', 'text', 'Cabeçalho', { max: 50 }),
      field('subtitle', 'Descrição da página', 'textarea', 'Cabeçalho', { max: 180 }),
      field('search_placeholder', 'Texto da busca', 'text', 'Filtros', { max: 70 }),
      field('page_background', 'Imagem de fundo', 'image', 'Aparência')
    ]
  },
  {
    key: 'equipments', label: 'Equipamentos', url: '../equipamentos.html',
    description: 'Cabeçalho e instruções da lista. Itens e imagens vêm do editor de equipamentos.',
    fields: [
      field('meta_title', 'Título da aba', 'text', 'SEO', { max: 70 }),
      field('meta_description', 'Descrição para buscadores', 'textarea', 'SEO', { max: 180 }),
      field('title', 'Título da página', 'text', 'Cabeçalho', { max: 50 }),
      field('subtitle', 'Descrição da página', 'textarea', 'Cabeçalho', { max: 180 }),
      field('search_placeholder', 'Texto da busca', 'text', 'Filtros', { max: 70 }),
      field('page_background', 'Imagem de fundo', 'image', 'Aparência')
    ]
  },
  {
    key: 'build_creator', label: 'Criar build', url: '../criar-build.html',
    description: 'Textos e cenário da mesa. Mídias de heróis continuam exclusivas do Editor de Herói.',
    fields: [
      field('meta_title', 'Título da aba', 'text', 'SEO', { max: 70 }),
      field('page_title', 'Título da página', 'text', 'Cabeçalho', { max: 60 }),
      field('page_subtitle', 'Descrição da página', 'textarea', 'Cabeçalho', { max: 180 }),
      field('stage_background', 'Fundo do cenário (não altera o herói)', 'image', 'Aparência'),
      field('news_kicker', 'Chamada da atualização', 'text', 'Bloco de atualização', { max: 45 }),
      field('news_title', 'Título da atualização', 'text', 'Bloco de atualização', { max: 70 }),
      field('news_description', 'Descrição da atualização', 'textarea', 'Bloco de atualização', { max: 240 }),
      field('news_url', 'Link da atualização', 'url', 'Bloco de atualização'),
      field('show_news', 'Mostrar bloco de atualização', 'toggle', 'Visibilidade')
    ]
  },
  {
    key: 'compare', label: 'Comparar builds', url: '../comparar-build.html',
    description: 'Textos e cenários do comparador. Mídias do herói vêm exclusivamente do Editor de Herói.',
    fields: [
      field('meta_title', 'Título da aba', 'text', 'SEO', { max: 70 }),
      field('meta_description', 'Descrição para buscadores', 'textarea', 'SEO', { max: 180 }),
      field('page_background', 'Fundo externo da página (fora dos cards)', 'image', 'Aparência'),
      field('mine_card_background', 'Cenário atrás do herói — Sua build', 'image', 'Aparência'),
      field('community_card_background', 'Cenário atrás do herói — Comunidade', 'image', 'Aparência'),
      field('breadcrumb_section', 'Primeiro nível do caminho', 'text', 'Cabeçalho', { max: 24 }),
      field('breadcrumb_page', 'Página atual no caminho', 'text', 'Cabeçalho', { max: 24 }),
      field('title', 'Primeira parte do título', 'text', 'Cabeçalho', { max: 55 }),
      field('title_accent', 'Trecho em degradê', 'text', 'Cabeçalho', { max: 35 }),
      field('description', 'Descrição', 'textarea', 'Cabeçalho', { max: 220 }),
      field('search_placeholder', 'Texto da busca superior', 'text', 'Cabeçalho', { max: 60 }),
      field('change_button', 'Botão trocar build', 'text', 'Ações', { max: 35 }),
      field('save_button', 'Botão salvar', 'text', 'Ações', { max: 35 }),
      field('saved_button', 'Botão após salvar', 'text', 'Ações', { max: 35 }),
      field('hero_context_label', 'Identificador do herói', 'text', 'Contexto', { max: 40 }),
      field('change_hero_label', 'Link para trocar herói', 'text', 'Contexto', { max: 30 }),
      field('change_hero_url', 'Destino de trocar herói', 'url', 'Contexto'),
      field('better_value_label', 'Legenda do melhor valor', 'text', 'Contexto', { max: 30 }),
      field('lower_value_label', 'Legenda do menor valor', 'text', 'Contexto', { max: 30 }),
      field('same_value_label', 'Legenda sem alteração', 'text', 'Contexto', { max: 30 }),
      field('my_build_context_label', 'Chamada da build do usuário', 'text', 'Cards', { max: 30 }),
      field('my_build_label', 'Nome da sua build no card', 'text', 'Cards', { max: 30 }),
      field('my_build_owner_badge', 'Selo de identificação do usuário', 'text', 'Cards', { max: 14 }),
      field('draft_label', 'Selo da sua build', 'text', 'Cards', { max: 20 }),
      field('community_build_label', 'Identificador da build pública', 'text', 'Cards', { max: 38 }),
      field('versus_label', 'Texto central de comparação', 'text', 'Cards', { max: 18 }),
      field('view_build_button', 'Botão para abrir a build', 'text', 'Cards', { max: 35 }),
      field('summary_kicker', 'Identificador do resumo', 'text', 'Resumo', { max: 30 }),
      field('my_advantages_label', 'Legenda das suas vantagens', 'text', 'Resumo', { max: 35 }),
      field('ties_label', 'Legenda dos empates', 'text', 'Resumo', { max: 25 }),
      field('community_advantages_label', 'Legenda das vantagens públicas', 'text', 'Resumo', { max: 45 }),
      field('stats_title', 'Título da análise', 'text', 'Análise', { max: 65 }),
      field('stats_description', 'Descrição da análise', 'textarea', 'Análise', { max: 180 }),
      field('stat_search_placeholder', 'Busca de atributos', 'text', 'Análise', { max: 45 }),
      field('filter_changed', 'Filtro Alterados', 'text', 'Análise', { max: 22 }),
      field('filter_all', 'Filtro Todos', 'text', 'Análise', { max: 22 }),
      field('filter_offense', 'Filtro Ofensiva', 'text', 'Análise', { max: 22 }),
      field('filter_defense', 'Filtro Defesa', 'text', 'Análise', { max: 22 }),
      field('filter_mobility', 'Filtro Mobilidade', 'text', 'Análise', { max: 22 }),
      field('filter_utility', 'Filtro Utilidade', 'text', 'Análise', { max: 22 }),
      field('advantage_hint', 'Explicação dos valores verdes', 'text', 'Análise', { max: 70 }),
      field('header_attribute', 'Cabeçalho Atributo', 'text', 'Tabela', { max: 24 }),
      field('header_my_build', 'Cabeçalho Sua build', 'text', 'Tabela', { max: 24 }),
      field('header_variation', 'Cabeçalho Variação', 'text', 'Tabela', { max: 24 }),
      field('header_top_build', 'Cabeçalho da build pública', 'text', 'Tabela', { max: 24 }),
      field('modal_kicker', 'Identificador do modal', 'text', 'Modal', { max: 42 }),
      field('modal_title', 'Título do modal', 'text', 'Modal', { max: 65 }),
      field('modal_my_build_label', 'Título da coluna pessoal', 'text', 'Modal', { max: 28 }),
      field('modal_hint', 'Aviso inferior do modal', 'textarea', 'Modal', { max: 180 }),
      field('modal_back_button', 'Botão de retorno', 'text', 'Modal', { max: 35 }),
      field('saved_toast', 'Aviso ao salvar', 'text', 'Mensagens', { max: 50 }),
      field('removed_toast', 'Aviso ao remover', 'text', 'Mensagens', { max: 60 }),
      field('shared_toast', 'Aviso ao copiar link', 'text', 'Mensagens', { max: 60 }),
      field('change_build_toast', 'Aviso ao trocar build', 'text', 'Mensagens', { max: 80 }),
      field('show_context', 'Mostrar contexto e legenda', 'toggle', 'Visibilidade'),
      field('show_comparison', 'Mostrar cards da comparação', 'toggle', 'Visibilidade'),
      field('show_summary', 'Mostrar leitura rápida', 'toggle', 'Visibilidade'),
      field('show_stats', 'Mostrar tabela de atributos', 'toggle', 'Visibilidade')
    ]
  },
  {
    key: 'classes', label: 'Classes', url: '../classes.html',
    description: 'Cabeçalho, busca e textos institucionais do módulo de classes. A relação de heróis vem do cadastro real.',
    fields: [
      field('meta_title', 'Título da aba', 'text', 'SEO', { max: 70 }),
      field('meta_description', 'Descrição para buscadores', 'textarea', 'SEO', { max: 180 }),
      field('title', 'Título da página', 'text', 'Cabeçalho', { max: 50 }),
      field('subtitle', 'Descrição da página', 'textarea', 'Cabeçalho', { max: 220 }),
      field('search_placeholder', 'Texto da busca', 'text', 'Filtros', { max: 70 }),
      field('section_title', 'Título da seção', 'text', 'Conteúdo', { max: 60 }),
      field('section_description', 'Descrição da seção', 'textarea', 'Conteúdo', { max: 200 }),
      field('source_label', 'Selo da fonte', 'text', 'Conteúdo', { max: 50 }),
      field('page_background', 'Imagem de fundo', 'image', 'Aparência')
    ]
  },
  {
    key: 'guides', label: 'Guias', url: '../guias.html',
    description: 'Apresentação do módulo de guias. Os artigos continuam sendo publicados no hub de Conteúdo público.',
    fields: [
      field('meta_title', 'Título da aba', 'text', 'SEO', { max: 70 }),
      field('meta_description', 'Descrição para buscadores', 'textarea', 'SEO', { max: 180 }),
      field('title', 'Título da página', 'text', 'Cabeçalho', { max: 50 }),
      field('subtitle', 'Descrição da página', 'textarea', 'Cabeçalho', { max: 220 }),
      field('search_placeholder', 'Texto da busca', 'text', 'Filtros', { max: 70 }),
      field('section_title', 'Título da lista', 'text', 'Conteúdo', { max: 60 }),
      field('section_description', 'Descrição da lista', 'textarea', 'Conteúdo', { max: 200 }),
      field('source_label', 'Selo do conteúdo', 'text', 'Conteúdo', { max: 50 }),
      field('page_background', 'Imagem de fundo', 'image', 'Aparência')
    ]
  },
  {
    key: 'news', label: 'Notícias', url: '../noticias.html',
    description: 'Apresentação do módulo de notícias. As publicações continuam sendo gerenciadas no hub de Conteúdo público.',
    fields: [
      field('meta_title', 'Título da aba', 'text', 'SEO', { max: 70 }),
      field('meta_description', 'Descrição para buscadores', 'textarea', 'SEO', { max: 180 }),
      field('title', 'Título da página', 'text', 'Cabeçalho', { max: 50 }),
      field('subtitle', 'Descrição da página', 'textarea', 'Cabeçalho', { max: 220 }),
      field('search_placeholder', 'Texto da busca', 'text', 'Filtros', { max: 70 }),
      field('section_title', 'Título da lista', 'text', 'Conteúdo', { max: 60 }),
      field('section_description', 'Descrição da lista', 'textarea', 'Conteúdo', { max: 200 }),
      field('source_label', 'Selo da fonte', 'text', 'Conteúdo', { max: 50 }),
      field('page_background', 'Imagem de fundo', 'image', 'Aparência')
    ]
  },
  {
    key: 'tier_list', label: 'Tier List', url: '../tier-list.html',
    description: 'Apresentação da classificação competitiva. Posições e heróis vêm das listas publicadas no banco.',
    fields: [
      field('meta_title', 'Título da aba', 'text', 'SEO', { max: 70 }),
      field('meta_description', 'Descrição para buscadores', 'textarea', 'SEO', { max: 180 }),
      field('title', 'Título da página', 'text', 'Cabeçalho', { max: 50 }),
      field('subtitle', 'Descrição da página', 'textarea', 'Cabeçalho', { max: 220 }),
      field('section_title', 'Título antes da classificação', 'text', 'Conteúdo', { max: 60 }),
      field('section_description', 'Descrição antes da classificação', 'textarea', 'Conteúdo', { max: 200 }),
      field('source_label', 'Selo de ordenação', 'text', 'Conteúdo', { max: 50 }),
      field('page_background', 'Imagem de fundo', 'image', 'Aparência')
    ]
  },
  {
    key: 'compositions', label: 'Composições', url: '../composicoes.html',
    description: 'Cabeçalho e orientação do módulo 3×3. Composições e sinergias permanecem dados dinâmicos do banco.',
    fields: [
      field('meta_title', 'Título da aba', 'text', 'SEO', { max: 70 }),
      field('meta_description', 'Descrição para buscadores', 'textarea', 'SEO', { max: 180 }),
      field('title', 'Título da página', 'text', 'Cabeçalho', { max: 50 }),
      field('subtitle', 'Descrição da página', 'textarea', 'Cabeçalho', { max: 220 }),
      field('search_placeholder', 'Texto da busca', 'text', 'Filtros', { max: 70 }),
      field('public_title', 'Título de composições públicas', 'text', 'Conteúdo', { max: 60 }),
      field('public_description', 'Descrição de composições públicas', 'textarea', 'Conteúdo', { max: 200 }),
      field('synergy_title', 'Título de sinergias', 'text', 'Conteúdo', { max: 60 }),
      field('synergy_description', 'Descrição de sinergias', 'textarea', 'Conteúdo', { max: 200 }),
      field('create_title', 'Título do criador', 'text', 'Conteúdo', { max: 60 }),
      field('create_description', 'Descrição do criador', 'textarea', 'Conteúdo', { max: 220 }),
      field('page_background', 'Imagem de fundo', 'image', 'Aparência')
    ]
  },
  {
    key: 'global_announcement', label: 'Central de Avisos', url: '../index.html',
    description: 'Banners globais e manutenção programada, com bloqueio de visitantes e acesso administrativo preservado.',
    fields: [
      field('variant', 'Tipo de aviso', 'select', 'Identidade', {
        default: 'maintenance',
        options: [
          { value: 'maintenance', label: 'Manutenção — âmbar e vermelho' },
          { value: 'attention', label: 'Atenção — azul e ciano' },
          { value: 'promotion', label: 'Promoção — roxo e magenta' },
          { value: 'thanks', label: 'Agradecimento — verde e dourado' }
        ]
      }),
      field('access_mode', 'Comportamento do site', 'select', 'Identidade', {
        default: 'banner_only',
        options: [
          { value: 'banner_only', label: 'Somente banner — site continua online' },
          { value: 'maintenance_lock', label: 'Manutenção completa — bloquear visitantes' }
        ]
      }),
      field('label', 'Título curto', 'text', 'Mensagem', { max: 42, placeholder: 'Ex.: Manutenção programada' }),
      field('message', 'Mensagem principal', 'textarea', 'Mensagem', { max: 180, placeholder: 'Informe o aviso que será mostrado ao público.' }),
      field('cta_label', 'Texto do botão (opcional)', 'text', 'Ação', { max: 24, placeholder: 'Ex.: Ver detalhes' }),
      field('cta_url', 'Destino do botão (opcional)', 'url', 'Ação'),
      field('starts_at', 'Início programado (opcional)', 'datetime', 'Agendamento'),
      field('ends_at', 'Encerramento programado', 'datetime', 'Agendamento'),
      field('enabled', 'Exibir o aviso no site', 'toggle', 'Visibilidade', { default: false }),
      field('dismissible', 'Permitir que o visitante feche o banner', 'toggle', 'Visibilidade', { default: true })
    ]
  }
];

export function getContentPage(key) {
  return SITE_CONTENT_PAGES.find(page => page.key === key) || SITE_CONTENT_PAGES[0];
}
