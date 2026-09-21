import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';

const slug = new URLSearchParams(location.search).get('slug');
const moduleKey = document.body?.dataset.publicModule;
const table = moduleKey === 'guias' ? 'guides' : moduleKey === 'noticias' ? 'news' : '';

function ensureMeta(selector, attributes = {}) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement('meta');
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    document.head.appendChild(element);
  }
  return element;
}

function setMetaName(name, content) {
  if (!content) return;
  ensureMeta(`meta[name="${name}"]`, { name }).content = String(content);
}

function setMetaProperty(property, content) {
  if (!content) return;
  ensureMeta(`meta[property="${property}"]`, { property }).content = String(content);
}

function setCanonical(url) {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = url;
}

async function applyArticleSeo() {
  if (!slug || !table) return;

  const { data, error } = await supabase
    .from(table)
    .select('title,slug,summary,meta_title,meta_description,created_at,updated_at,published')
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle();

  if (error || !data) {
    if (error) console.warn('[editorial-seo] Falha ao carregar metadados:', error.message);
    return;
  }

  const title = String(data.meta_title || data.title || '').trim();
  const description = String(data.meta_description || data.summary || '').trim();
  if (title) document.title = `${title} — Echo Arena`;
  setMetaName('description', description);
  setMetaProperty('og:title', title);
  setMetaProperty('og:description', description);
  setMetaProperty('og:type', 'article');
  setMetaProperty('og:url', location.href);

  const canonical = new URL(location.href);
  canonical.search = `?slug=${encodeURIComponent(data.slug)}`;
  canonical.hash = '';
  setCanonical(canonical.href);

  const old = document.getElementById('editorial-structured-data');
  old?.remove();
  const structured = document.createElement('script');
  structured.id = 'editorial-structured-data';
  structured.type = 'application/ld+json';
  structured.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': moduleKey === 'noticias' ? 'NewsArticle' : 'Article',
    headline: data.title,
    description: description || undefined,
    datePublished: data.created_at || undefined,
    dateModified: data.updated_at || data.created_at || undefined,
    mainEntityOfPage: canonical.href
  });
  document.head.appendChild(structured);
}

applyArticleSeo().catch(error => console.warn('[editorial-seo] Falha inesperada:', error));
