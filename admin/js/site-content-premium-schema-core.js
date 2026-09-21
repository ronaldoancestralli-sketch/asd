import { SITE_CONTENT_PAGES } from '../../js/site-content-schema.js?v=8';
import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';

/*
  Extensão editorial da experiência premium.
  Reutiliza o mesmo array exportado pelo schema canônico; não cria tabela nem
  fonte paralela. Dados dinâmicos continuam nos módulos próprios do Admin.
*/

const field = (key, label, type = 'text', group = 'Geral', extra = {}) => ({
  key, label, type, group, ...extra
});

function addFields(page, fields) {
  if (!page) return;
  const existing = new Set(page.fields.map(item => item.key));
  for (const item of fields) {
    if (!existing.has(item.key)) page.fields.push(item);
  }
}

function safeSlug(value = '') {
  return String(value).toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

const heroes = SITE_CONTENT_PAGES.find(page => page.key === 'heroes');
addFields(heroes, [
  field('explorer_kicker', 'Chamada do destaque', 'text', 'Experiência premium', { max: 45 }),
  field('explorer_sync', 'Selo de sincronização', 'text', 'Experiência premium', { max: 40 }),
  field('explorer_title', 'Título principal', 'text', 'Experiência premium', { max: 60 }),
  field('explorer_accent', 'Trecho em degradê', 'text', 'Experiência premium', { max: 45 }),
  field('explorer_description', 'Descrição do destaque', 'textarea', 'Experiência premium', { max: 260 }),
  field('metric_heroes_label', 'Rótulo: heróis ativos', 'text', 'Indicadores', { max: 30 }),
  field('metric_classes_label', 'Rótulo: classes', 'text', 'Indicadores', { max: 30 }),
  field('metric_skills_label', 'Rótulo: habilidades', 'text', 'Indicadores', { max: 30 }),
  field('featured_label', 'Identificador do herói em foco', 'text', 'Herói em foco', { max: 32 }),
  field('featured_live_label', 'Selo do herói em foco', 'text', 'Herói em foco', { max: 28 }),
  field('featured_builds_label', 'Rótulo: builds', 'text', 'Herói em foco', { max: 24 }),
  field('featured_views_label', 'Rótulo: views', 'text', 'Herói em foco', { max: 24 }),
  field('featured_likes_label', 'Rótulo: curtidas', 'text', 'Herói em foco', { max: 24 }),
  field('featured_open_button', 'Botão: ficha completa', 'text', 'Herói em foco', { max: 34 }),
  field('featured_build_button', 'Botão: criar build', 'text', 'Herói em foco', { max: 30 }),
  field('classes_kicker', 'Chamada da área de classes', 'text', 'Classes', { max: 40 }),
  field('classes_title', 'Título da área de classes', 'text', 'Classes', { max: 55 }),
  field('classes_description', 'Descrição da área de classes', 'textarea', 'Classes', { max: 220 }),
  field('roster_kicker', 'Chamada do roster', 'text', 'Roster', { max: 35 }),
  field('search_label', 'Rótulo da busca', 'text', 'Filtros', { max: 28 }),
  field('sort_label', 'Rótulo da ordenação', 'text', 'Filtros', { max: 28 }),
  field('heroes_all_card_image', 'Arte do card “Todos os heróis”', 'image', 'Mídia exclusiva · Todos os heróis'),
  field('heroes_all_feature_image', 'Arte principal · Todos os heróis', 'image', 'Mídia exclusiva · Todos os heróis')
]);

if (heroes) {
  try {
    const [heroesResult, classesResult] = await Promise.all([
      supabase
        .from('v_heroes_complete')
        .select('id,name,slug')
        .eq('enabled', true)
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('name'),
      supabase
        .from('hero_classes')
        .select('id,name,slug,color')
        .order('name')
    ]);

    if (heroesResult.error) throw heroesResult.error;
    if (classesResult.error) throw classesResult.error;

    const classFields = [];
    for (const item of classesResult.data || []) {
      const slug = safeSlug(item.slug);
      if (!slug) continue;
      classFields.push(field(
        `heroes_class_${slug}_image`,
        `${item.name} — arte do card da classe`,
        'image',
        'Mídia exclusiva · Cards das classes'
      ));
    }

    const featuredFields = [];
    const rosterFields = [];
    for (const hero of heroesResult.data || []) {
      const slug = safeSlug(hero.slug);
      if (!slug) continue;
      featuredFields.push(field(
        `heroes_featured_${slug}`,
        `${hero.name} — imagem em foco`,
        'image',
        'Mídia exclusiva · Herói em foco'
      ));
      rosterFields.push(field(
        `heroes_roster_${slug}`,
        `${hero.name} — card do roster`,
        'image',
        'Mídia exclusiva · Cards do roster'
      ));
    }

    addFields(heroes, classFields);
    addFields(heroes, featuredFields);
    addFields(heroes, rosterFields);
  } catch (error) {
    console.warn('[site-content-schema] Não foi possível listar classes/heróis para os slots de mídia exclusivos:', error.message);
  }
}

if (!SITE_CONTENT_PAGES.some(page => page.key === 'builds')) {
  SITE_CONTENT_PAGES.splice(3, 0, {
    key: 'builds',
    label: 'Hub de Builds',
    url: '../builds.html',
    description: 'Textos do Hub público. As builds, heróis e métricas permanecem dados dinâmicos do banco.',
    fields: [
      field('meta_title', 'Título da aba', 'text', 'SEO', { max: 70 }),
      field('meta_description', 'Descrição para buscadores', 'textarea', 'SEO', { max: 180 }),
      field('watermark', 'Marca d’água', 'text', 'Destaque', { max: 18 }),
      field('explorer_kicker', 'Chamada superior', 'text', 'Destaque', { max: 45 }),
      field('explorer_title', 'Título principal', 'text', 'Destaque', { max: 65 }),
      field('explorer_description', 'Descrição do Hub', 'textarea', 'Destaque', { max: 280 }),
      field('metric_public_label', 'Rótulo: builds públicas', 'text', 'Indicadores', { max: 32 }),
      field('metric_heroes_label', 'Rótulo: heróis ativos', 'text', 'Indicadores', { max: 32 }),
      field('metric_represented_label', 'Rótulo: heróis representados', 'text', 'Indicadores', { max: 38 }),
      field('open_workbench_button', 'Botão da Mesa', 'text', 'Ações', { max: 35 }),
      field('compare_button', 'Botão Comparar', 'text', 'Ações', { max: 30 }),
      field('public_title', 'Título da lista pública', 'text', 'Builds públicas', { max: 55 }),
      field('public_description', 'Descrição da lista pública', 'textarea', 'Builds públicas', { max: 220 }),
      field('public_source_label', 'Selo da lista pública', 'text', 'Builds públicas', { max: 40 }),
      field('flow_title', 'Título do fluxo', 'text', 'Fluxo da Mesa', { max: 55 }),
      field('flow_description', 'Descrição do fluxo', 'textarea', 'Fluxo da Mesa', { max: 220 }),
      field('flow_source_label', 'Selo do fluxo', 'text', 'Fluxo da Mesa', { max: 42 }),
      field('step_one_title', 'Etapa 1 — título', 'text', 'Fluxo da Mesa', { max: 38 }),
      field('step_one_description', 'Etapa 1 — descrição', 'textarea', 'Fluxo da Mesa', { max: 180 }),
      field('step_two_title', 'Etapa 2 — título', 'text', 'Fluxo da Mesa', { max: 38 }),
      field('step_two_description', 'Etapa 2 — descrição', 'textarea', 'Fluxo da Mesa', { max: 180 }),
      field('step_three_title', 'Etapa 3 — título', 'text', 'Fluxo da Mesa', { max: 38 }),
      field('step_three_description', 'Etapa 3 — descrição', 'textarea', 'Fluxo da Mesa', { max: 180 })
    ]
  });
}

if (!SITE_CONTENT_PAGES.some(page => page.key === 'statistics')) {
  SITE_CONTENT_PAGES.push({
    key: 'statistics',
    label: 'Estatísticas',
    url: '../estatisticas.html',
    description: 'Textos e explicações da Central de Estatísticas. Contagens e rankings continuam dinâmicos e vêm das fontes públicas.',
    fields: [
      field('meta_title', 'Título da aba', 'text', 'SEO', { max: 70 }),
      field('meta_description', 'Descrição para buscadores', 'textarea', 'SEO', { max: 180 }),
      field('watermark', 'Marca d’água', 'text', 'Destaque', { max: 18 }),
      field('explorer_kicker', 'Chamada superior', 'text', 'Destaque', { max: 45 }),
      field('explorer_title', 'Título principal', 'text', 'Destaque', { max: 65 }),
      field('explorer_description', 'Descrição principal', 'textarea', 'Destaque', { max: 320 }),
      field('open_heroes_button', 'Botão: explorar heróis', 'text', 'Ações', { max: 35 }),
      field('open_build_button', 'Botão: criar build', 'text', 'Ações', { max: 30 }),
      field('radar_core_label', 'Radar: builds vinculadas', 'text', 'Radar', { max: 42 }),
      field('radar_heroes_label', 'Radar: heróis ativos', 'text', 'Radar', { max: 30 }),
      field('radar_builds_label', 'Radar: builds públicas', 'text', 'Radar', { max: 30 }),
      field('radar_equipments_label', 'Radar: equipamentos', 'text', 'Radar', { max: 30 }),
      field('radar_compositions_label', 'Radar: composições', 'text', 'Radar', { max: 30 }),
      field('overview_title', 'Panorama — título', 'text', 'Panorama', { max: 50 }),
      field('overview_description', 'Panorama — descrição', 'textarea', 'Panorama', { max: 200 }),
      field('overview_source_label', 'Panorama — selo', 'text', 'Panorama', { max: 40 }),
      field('metric_heroes_label', 'Card: heróis ativos', 'text', 'Panorama', { max: 35 }),
      field('metric_heroes_description', 'Card: descrição de heróis', 'textarea', 'Panorama', { max: 180 }),
      field('metric_builds_label', 'Card: builds públicas', 'text', 'Panorama', { max: 40 }),
      field('metric_builds_description', 'Card: descrição de builds', 'textarea', 'Panorama', { max: 200 }),
      field('metric_equipments_label', 'Card: equipamentos ativos', 'text', 'Panorama', { max: 40 }),
      field('metric_equipments_description', 'Card: descrição de equipamentos', 'textarea', 'Panorama', { max: 190 }),
      field('metric_compositions_label', 'Card: composições públicas', 'text', 'Panorama', { max: 42 }),
      field('metric_compositions_description', 'Card: descrição de composições', 'textarea', 'Panorama', { max: 180 }),
      field('activity_title', 'Atividade — título', 'text', 'Atividade', { max: 60 }),
      field('activity_description', 'Atividade — descrição', 'textarea', 'Atividade', { max: 220 }),
      field('activity_source_label', 'Atividade — critério', 'text', 'Atividade', { max: 45 }),
      field('public_builds_title', 'Builds públicas — título', 'text', 'Atividade', { max: 40 }),
      field('public_builds_description', 'Builds públicas — descrição', 'textarea', 'Atividade', { max: 190 }),
      field('reading_title', 'Transparência — título', 'text', 'Transparência', { max: 55 }),
      field('reading_description', 'Transparência — descrição', 'textarea', 'Transparência', { max: 220 }),
      field('reading_source_label', 'Transparência — selo', 'text', 'Transparência', { max: 40 }),
      field('source_heroes_title', 'Fonte Heróis — título', 'text', 'Transparência', { max: 30 }),
      field('source_heroes_description', 'Fonte Heróis — descrição', 'textarea', 'Transparência', { max: 260 }),
      field('source_public_title', 'Fonte pública — título', 'text', 'Transparência', { max: 35 }),
      field('source_public_description', 'Fonte pública — descrição', 'textarea', 'Transparência', { max: 260 }),
      field('source_failures_title', 'Falhas — título', 'text', 'Transparência', { max: 30 }),
      field('source_failures_description', 'Falhas — descrição', 'textarea', 'Transparência', { max: 220 })
    ]
  });
}
