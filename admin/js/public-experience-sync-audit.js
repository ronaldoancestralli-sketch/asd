import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';
import { SITE_CONTENT_PAGES } from '../../js/site-content-schema.js?v=8';

const LEGACY_CONTENT_KEYS = new Map([
  ['compare', new Set(['hero_art'])]
]);

const SUSPENDED_PUBLIC_PAGES = new Map([
  ['news', 'Echo Pulse está em modo privado / Em breve; o schema fica preparado, mas a rota pública não consome esses campos enquanto a publicação estiver suspensa.']
]);

const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[char]));

function schemaMap() {
  return new Map(SITE_CONTENT_PAGES.map(page => [page.key, {
    ...page,
    fieldKeys: new Set((page.fields || []).map(field => field.key))
  }]));
}

function contentKeys(row) {
  return Object.keys(row?.content && typeof row.content === 'object' ? row.content : {}).sort();
}

function isKnownLegacy(pageKey, key) {
  return LEGACY_CONTENT_KEYS.get(pageKey)?.has(key) === true;
}

function editorHref(pageKey) {
  return `./site-content.html?page=${encodeURIComponent(pageKey)}${pageKey === 'heroes' ? '&tab=media' : ''}`;
}

function ensureHeroMediaShortcut() {
  const actions = document.querySelector('#ax-module-heroes .ax-module-actions');
  if (!actions || actions.querySelector('[data-heroes-page-media-link]')) return;
  const link = document.createElement('a');
  link.href = './site-content.html?page=heroes&tab=media';
  link.dataset.heroesPageMediaLink = 'true';
  link.textContent = 'Mídias da página';
  actions.prepend(link);
}

function ensureSection() {
  let section = document.getElementById('ax-editorial-sync-audit');
  if (section) return section;
  const issues = document.getElementById('ax-issues')?.closest('.ax-section');
  section = document.createElement('section');
  section.id = 'ax-editorial-sync-audit';
  section.className = 'ax-section';
  section.innerHTML = `
    <header class="ax-section-head"><div><div class="ax-kicker">Auditoria editorial</div><h3>Schema do Admin ↔ conteúdo persistido</h3></div><p>Compara as páginas que o editor realmente conhece com as chaves armazenadas em <code>site_pages</code>. Registros legados e páginas deliberadamente suspensas são mostrados separadamente.</p></header>
    <div id="ax-sync-audit-metrics" class="ax-metrics"><article class="ax-metric"><span>Páginas no schema</span><strong>—</strong><small>Editor atual</small></article><article class="ax-metric"><span>Linhas em site_pages</span><strong>—</strong><small>Overrides persistidos</small></article><article class="ax-metric"><span>Chaves órfãs</span><strong>—</strong><small>Dados sem controle atual</small></article><article class="ax-metric"><span>Legado site_content</span><strong>—</strong><small>Fonte antiga separada</small></article></div>
    <div id="ax-sync-page-list" class="ax-module-grid"><div class="ax-note">Auditando schema e banco…</div></div>`;
  if (issues) issues.insertAdjacentElement('beforebegin', section);
  else document.querySelector('.ax-page')?.appendChild(section);
  return section;
}

function setMetric(index, value, tone = '') {
  const card = document.querySelectorAll('#ax-sync-audit-metrics .ax-metric')[index];
  if (!card) return;
  card.querySelector('strong').textContent = String(value);
  card.classList.remove('good', 'warn', 'bad');
  if (tone) card.classList.add(tone);
}

function patchCmsModule({ schemaPages, rows, orphanCount, legacyRows }) {
  const root = document.getElementById('ax-module-cms');
  if (!root) return;
  const chip = root.querySelector('[data-module-state]');
  const copy = root.querySelector('[data-module-copy]');
  if (chip) {
    chip.textContent = orphanCount ? 'Revisar paridade' : 'Schema conectado';
    chip.className = `ax-chip ${orphanCount ? 'warn' : 'good'}`.trim();
  }
  if (copy) copy.textContent = `${schemaPages} páginas no schema · ${rows} linhas com overrides · ${orphanCount} chave(s) sem controle atual · ${legacyRows} registro(s) na fonte legada site_content.`;
}

function observeThenPatch(summary) {
  const root = document.getElementById('ax-module-cms');
  const chip = root?.querySelector('[data-module-state]');
  if (!chip) return patchCmsModule(summary);
  const apply = () => patchCmsModule(summary);
  if (chip.textContent.trim() !== 'Carregando') return apply();
  const observer = new MutationObserver(() => {
    if (chip.textContent.trim() === 'Carregando') return;
    observer.disconnect();
    apply();
  });
  observer.observe(chip, { childList: true, characterData: true, subtree: true });
  setTimeout(() => { observer.disconnect(); apply(); }, 2500);
}

async function run() {
  ensureSection();
  ensureHeroMediaShortcut();
  const schemas = schemaMap();
  const [{ data: rows, error: pagesError }, legacyResult] = await Promise.all([
    supabase.from('site_pages').select('page_key,content,published').order('page_key'),
    supabase.from('site_content').select('key', { count: 'exact', head: true })
  ]);
  if (pagesError) throw pagesError;

  const storedRows = rows || [];
  const rowMap = new Map(storedRows.map(row => [row.page_key, row]));
  const unknownPages = [];
  const orphanKeys = [];
  const legacyKeys = [];

  for (const row of storedRows) {
    const schema = schemas.get(row.page_key);
    if (!schema) {
      unknownPages.push(row.page_key);
      continue;
    }
    for (const key of contentKeys(row)) {
      if (schema.fieldKeys.has(key)) continue;
      if (isKnownLegacy(row.page_key, key)) legacyKeys.push(`${row.page_key}.${key}`);
      else orphanKeys.push(`${row.page_key}.${key}`);
    }
  }

  setMetric(0, schemas.size, 'good');
  setMetric(1, storedRows.length, storedRows.length ? 'good' : 'warn');
  setMetric(2, orphanKeys.length + unknownPages.length, orphanKeys.length || unknownPages.length ? 'bad' : 'good');
  setMetric(3, legacyResult.count ?? '—', legacyResult.error ? 'bad' : (legacyResult.count ? 'warn' : 'good'));

  const host = document.getElementById('ax-sync-page-list');
  if (host) {
    host.innerHTML = [...schemas.values()].map(schema => {
      const row = rowMap.get(schema.key);
      const keys = contentKeys(row);
      const unknown = keys.filter(key => !schema.fieldKeys.has(key) && !isKnownLegacy(schema.key, key));
      const legacy = keys.filter(key => isKnownLegacy(schema.key, key));
      const suspendedReason = SUSPENDED_PUBLIC_PAGES.get(schema.key) || '';
      const tone = suspendedReason ? 'warn' : unknown.length ? 'warn' : 'good';
      const state = suspendedReason ? 'Publicação suspensa' : unknown.length ? `${unknown.length} órfã(s)` : row ? 'Sincronizada' : 'Somente padrão';
      const details = suspendedReason
        ? suspendedReason
        : row
          ? `${schema.fields?.length || 0} controles no Admin · ${keys.length} override(s) persistido(s)${legacy.length ? ` · legado preservado: ${legacy.join(', ')}` : ''}`
          : `${schema.fields?.length || 0} controles no Admin · nenhuma linha persistida; HTML usa os padrões.`;
      const editLabel = schema.key === 'heroes' ? 'Editar mídias' : suspendedReason ? 'Preparar conteúdo' : 'Editar';
      return `<article class="ax-module"><div class="ax-module-head"><h4>${esc(schema.label || schema.key)}</h4><span class="ax-chip ${tone}">${esc(state)}</span></div><p>${esc(details)}</p><div class="ax-module-actions"><a href="${esc(editorHref(schema.key))}">${editLabel}</a><a href="${esc(schema.url || '#')}" target="_blank" rel="noopener">Ver público</a></div>${unknown.length ? `<div class="ax-note ax-error">Sem controle: ${esc(unknown.join(', '))}</div>` : ''}</article>`;
    }).join('');
  }

  const issues = document.getElementById('ax-issues');
  if (issues) {
    const notes = [];
    if (unknownPages.length) notes.push(`site_pages possui página(s) fora do schema atual: ${unknownPages.join(', ')}.`);
    if (orphanKeys.length) notes.push(`Chaves sem controle correspondente no Admin: ${orphanKeys.join(', ')}.`);
    if (legacyKeys.length) notes.push(`Chaves legadas preservadas e ignoradas pelo editor atual: ${legacyKeys.join(', ')}.`);
    if (SUSPENDED_PUBLIC_PAGES.size) notes.push('Echo Pulse / Notícias permanece com publicação pública suspensa; o conteúdo pode ser preparado no Admin sem ser injetado na rota de visitantes.');
    if (legacyResult.error) notes.push(`Não foi possível contar site_content legado: ${legacyResult.error.message}`);
    else if ((legacyResult.count || 0) > 0) notes.push(`${legacyResult.count} registro(s) permanecem em site_content legado; eles não são contados como campos do CMS de páginas.`);
    if (notes.length) {
      issues.insertAdjacentHTML('beforeend', notes.map(note => `<div class="ax-note ${orphanKeys.length || unknownPages.length ? 'ax-error' : ''}">${esc(note)}</div>`).join(''));
    }
  }

  observeThenPatch({
    schemaPages: schemas.size,
    rows: storedRows.length,
    orphanCount: orphanKeys.length + unknownPages.length,
    legacyRows: legacyResult.count ?? '—'
  });
}

run().catch(error => {
  console.error('[admin-public-sync-audit]', error);
  ensureSection();
  ensureHeroMediaShortcut();
  const host = document.getElementById('ax-sync-page-list');
  if (host) host.innerHTML = `<div class="ax-note ax-error">Auditoria editorial indisponível: ${esc(error.message || String(error))}</div>`;
});
