const buildLink = document.getElementById('featured-build');
const grid = document.getElementById('grid');
const detail = document.getElementById('hero-detail');

function routeHeroSlug() {
  return new URLSearchParams(location.search).get('heroi') || '';
}

function featuredHeroSlug() {
  return grid?.querySelector('.hc.is-featured[data-slug]')?.dataset.slug || '';
}

function buildHref(slug = '') {
  const params = new URLSearchParams();
  params.set('nova', '1');
  if (slug) params.set('heroi', slug);
  return `./criar-build.html?${params.toString()}`;
}

function selectedHeroSlug() {
  return featuredHeroSlug() || routeHeroSlug() || '';
}

function syncFeaturedBuildLink() {
  if (!buildLink) return;
  buildLink.href = buildHref(selectedHeroSlug());
}

function syncDetailBuildLink() {
  const detailLink = detail?.querySelector('.hd-cta[href*="criar-build.html"]');
  if (!detailLink) return;

  // A ficha lateral sincroniza ?heroi=<slug> ao abrir. Para o drawer,
  // essa rota é a fonte prioritária porque o spotlight pode apontar
  // para outro card enquanto a ficha está aberta.
  const slug = routeHeroSlug() || selectedHeroSlug();
  detailLink.href = buildHref(slug);
}

function syncBuildLinks() {
  syncFeaturedBuildLink();
  syncDetailBuildLink();
}

syncBuildLinks();

if (grid) {
  const observer = new MutationObserver(syncFeaturedBuildLink);
  observer.observe(grid, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });
}

if (detail) {
  const detailObserver = new MutationObserver(syncDetailBuildLink);
  detailObserver.observe(detail, {
    childList: true,
    subtree: true
  });
}

// Proteção final para conteúdo dinâmico: antes da navegação, recalcula
// o CTA usando o herói efetivamente aberto na ficha lateral.
document.addEventListener('click', event => {
  const detailLink = event.target.closest('.hd-cta[href*="criar-build.html"]');
  if (!detailLink || !detail?.contains(detailLink)) return;

  const slug = routeHeroSlug() || selectedHeroSlug();
  detailLink.href = buildHref(slug);
}, true);
