import { SITE_CONTENT_PAGES as EDITOR_SITE_CONTENT_PAGES } from '../../js/site-content-schema.js?v=9';

/*
  As extensões editoriais mais antigas ainda carregam o schema canônico com o
  cache token v=8, enquanto o editor atual consome v=9. Em ES modules, URLs com
  query strings diferentes são módulos distintos, mesmo apontando para o mesmo
  arquivo. Este wrapper é a fronteira única que reconcilia as extensões no
  mesmo array que o editor usa, evitando campos invisíveis no Admin sem mexer
  no armazenamento ou duplicar dados.
*/

await import('./site-content-premium-schema-core.js?v=20260822-admin-public-sync-3&sb=20260823-security-supabase-pin-1');
await import('./heroes-overview-schema.js?v=20260829-heroes-admin-schema-2');
await import('./site-content-final-sync.js?v=20260822-admin-public-sync-3');

const { SITE_CONTENT_PAGES: EXTENDED_SITE_CONTENT_PAGES } = await import('../../js/site-content-schema.js?v=8');

function cloneField(field) {
  return { ...field };
}

function reconcilePage(targetPages, sourcePage) {
  const targetPage = targetPages.find(page => page.key === sourcePage.key);
  if (!targetPage) {
    targetPages.push({
      ...sourcePage,
      fields: (sourcePage.fields || []).map(cloneField)
    });
    return;
  }

  targetPage.label = sourcePage.label;
  targetPage.url = sourcePage.url;
  targetPage.description = sourcePage.description;

  const targetByKey = new Map((targetPage.fields || []).map(field => [field.key, field]));
  const reconciled = [];
  const seen = new Set();

  for (const sourceField of sourcePage.fields || []) {
    const existing = targetByKey.get(sourceField.key);
    if (existing) {
      Object.assign(existing, sourceField);
      reconciled.push(existing);
    } else {
      reconciled.push(cloneField(sourceField));
    }
    seen.add(sourceField.key);
  }

  for (const targetField of targetPage.fields || []) {
    if (!seen.has(targetField.key)) reconciled.push(targetField);
  }

  targetPage.fields = reconciled;
}

for (const page of EXTENDED_SITE_CONTENT_PAGES) {
  reconcilePage(EDITOR_SITE_CONTENT_PAGES, page);
}

const heroesEditor = EDITOR_SITE_CONTENT_PAGES.find(page => page.key === 'heroes');
const requiredHeroFields = ['heroes_all_feature_image', 'heroes_all_card_image', 'heroes_overview_title'];
const heroFieldKeys = new Set((heroesEditor?.fields || []).map(field => field.key));
const missingHeroFields = requiredHeroFields.filter(key => !heroFieldKeys.has(key));

if (missingHeroFields.length) {
  throw new Error(`[site-content-schema] Reconciliação incompleta do editor de Heróis: ${missingHeroFields.join(', ')}`);
}
