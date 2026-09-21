import { SITE_CONTENT_PAGES } from '../../js/site-content-schema.js?v=8';

/*
  A página pública /herois é um catálogo. Este módulo adapta o schema premium
  para que o Admin descreva a interface atual: topo geral do roster, mídia de
  navegação e mídia das fichas individuais, sem reaproveitar a antiga ideia de
  “Herói em foco”. A reconciliação com a instância usada pelo editor acontece
  no wrapper site-content-premium-schema.js.
*/

const page = SITE_CONTENT_PAGES.find(item => item.key === 'heroes');

function moveFieldBefore(fields, key, beforeKey) {
  const from = fields.findIndex(field => field.key === key);
  const to = fields.findIndex(field => field.key === beforeKey);
  if (from < 0 || to < 0 || from < to) return;
  const [field] = fields.splice(from, 1);
  fields.splice(to, 0, field);
}

if (page) {
  page.description = 'Textos, fundo e mídias exclusivas da página Heróis. A imagem principal do topo representa o roster completo; cards e fichas individuais continuam separados por função.';

  const obsolete = new Set([
    'featured_label',
    'featured_live_label',
    'featured_builds_label',
    'featured_views_label',
    'featured_likes_label',
    'featured_open_button',
    'featured_build_button'
  ]);

  page.fields = page.fields.filter(field => !obsolete.has(field.key));

  const pageBackground = page.fields.find(field => field.key === 'page_background');
  if (pageBackground) {
    pageBackground.label = 'Fundo geral da página';
    pageBackground.group = 'Fundo da página';
  }

  const featureImage = page.fields.find(field => field.key === 'heroes_all_feature_image');
  if (featureImage) {
    featureImage.label = 'Imagem principal do topo · Todos os heróis';
    featureImage.group = 'Topo · Todos os heróis';
  }

  const allCardImage = page.fields.find(field => field.key === 'heroes_all_card_image');
  if (allCardImage) {
    allCardImage.label = 'Imagem do card · Todos os heróis';
    allCardImage.group = 'Navegação · Todos os heróis';
  }

  for (const field of page.fields) {
    const key = String(field.key || '');
    if (key.startsWith('heroes_featured_')) {
      field.label = String(field.label || '').replace(/imagem em foco$/i, 'imagem da ficha detalhada');
      field.group = 'Fichas individuais';
    } else if (key.startsWith('heroes_roster_')) {
      field.group = 'Cards do roster';
    } else if (key.startsWith('heroes_class_')) {
      field.group = 'Cards das classes';
    }
  }

  const additions = [
    { key: 'heroes_overview_kicker', label: 'Chamada do painel', type: 'text', group: 'Painel · Roster completo', max: 36 },
    { key: 'heroes_overview_title', label: 'Título do painel', type: 'text', group: 'Painel · Roster completo', max: 80 },
    { key: 'heroes_overview_description', label: 'Descrição do painel', type: 'textarea', group: 'Painel · Roster completo', max: 260 },
    { key: 'heroes_overview_primary_button', label: 'Botão: explorar classes', type: 'text', group: 'Painel · Roster completo', max: 28 },
    { key: 'heroes_overview_secondary_button', label: 'Botão: ver roster', type: 'text', group: 'Painel · Roster completo', max: 24 }
  ];

  const existing = new Set(page.fields.map(field => field.key));
  for (const field of additions) {
    if (!existing.has(field.key)) page.fields.push(field);
  }

  // No mobile, a aba Mídia abre diretamente no controle mais procurado desta
  // página: a arte grande do topo. O fundo geral e as demais mídias vêm depois.
  moveFieldBefore(page.fields, 'heroes_all_feature_image', 'page_background');
}
