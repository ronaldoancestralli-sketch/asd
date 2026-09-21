import { resolveMediaUrl } from './media-storage.js?v=20260823-security-supabase-pin-1';

const page = document.querySelector('.heroes-page');

if (page) {
  const grid = document.getElementById('grid');
  const classShowcase = document.getElementById('class-showcase');
  const featuredMedia = document.getElementById('featured-media');
  const featuredBackground = document.getElementById('hero-explorer-bg');
  const featuredWatermark = document.getElementById('featured-watermark');
  const detailMedia = document.getElementById('hd-media');

  const baseByHost = new WeakMap();
  let content = window.EchoSiteContent?.content || {};
  let frame = 0;

  function injectStyles() {
    if (document.getElementById('heroes-page-media-style')) return;
    const style = document.createElement('style');
    style.id = 'heroes-page-media-style';
    style.textContent = `
      .class-card.has-page-art{min-height:132px;display:flex;flex-direction:column;justify-content:flex-end;background:#090e19}
      .class-card.has-page-art::before{z-index:4}
      .class-card.has-page-art>small,.class-card.has-page-art>strong,.class-card.has-page-art>span{position:relative;z-index:3;text-shadow:0 2px 12px rgba(0,0,0,.94)}
      .heroes-class-card-visual{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none}
      .heroes-class-card-visual img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(1.07) contrast(1.04);transform-origin:center}
      .heroes-class-card-visual::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,8,17,.06),rgba(6,9,16,.28) 42%,rgba(6,9,16,.96) 100%),linear-gradient(90deg,color-mix(in srgb,var(--class-color) 18%,transparent),transparent 62%)}
      .page-hero-media-override{overflow:hidden!important}
      .page-hero-media-override>img{position:absolute;inset:0;width:100%;height:100%;max-width:none;max-height:none}
      .heroes-page.is-all-overview .hero-featured-media.page-hero-media-override>img{filter:saturate(1.04) contrast(1.03)}
      .heroes-page.is-all-overview .hero-featured-name-watermark{opacity:.12}
      @media(max-width:820px){.class-card.has-page-art{min-height:112px}}
    `;
    document.head.appendChild(style);
  }

  function mediaSpec(value) {
    if (!value) return null;
    const source = typeof value === 'string' ? { url: value } : value;
    const rawUrl = String(source?.url || '').trim();
    if (!rawUrl) return null;
    const safe = /^(data:image\/|https?:\/\/|\/|\.\/|\.\.\/)/i.test(rawUrl);
    if (!safe) return null;
    return {
      ...source,
      url: rawUrl.startsWith('data:image/') ? rawUrl : resolveMediaUrl(rawUrl),
      fit: source.fit === 'contain' ? 'contain' : 'cover',
      position: String(source.position || '50% 50%'),
      zoom: Math.max(50, Math.min(200, Number(source.zoom ?? 100)))
    };
  }

  function heroKey(kind, slug) {
    return `heroes_${kind}_${String(slug || '').toLowerCase()}`;
  }

  function classKey(slug) {
    return `heroes_class_${String(slug || '').toLowerCase()}_image`;
  }

  function cardForSlug(slug) {
    return [...(grid?.querySelectorAll('.hc[data-slug]') || [])]
      .find(card => String(card.dataset.slug || '') === String(slug || '')) || null;
  }

  function heroName(slug) {
    return cardForSlug(slug)?.querySelector('.n')?.textContent?.trim() || slug || 'Herói';
  }

  function snapshot(host) {
    return {
      html: host.innerHTML,
      style: host.getAttribute('style') || '',
      empty: host.classList.contains('empty')
    };
  }

  function rememberBase(host) {
    if (!host) return;
    if (!host.querySelector('[data-page-media-image]')) {
      baseByHost.set(host, snapshot(host));
      host.classList.remove('page-hero-media-override');
      delete host.dataset.pageMediaOverride;
    }
  }

  function restoreBase(host) {
    const saved = baseByHost.get(host);
    if (!host || !saved) return;
    host.innerHTML = saved.html;
    if (saved.style) host.setAttribute('style', saved.style);
    else host.removeAttribute('style');
    host.classList.toggle('empty', saved.empty);
    host.classList.remove('page-hero-media-override');
    delete host.dataset.pageMediaOverride;
  }

  function applyHost(host, spec, key, { fit = 'cover', alt = '' } = {}) {
    if (!host || !key) return;
    rememberBase(host);

    const existing = host.querySelector('[data-page-media-image]');
    if (!spec) {
      if (existing) restoreBase(host);
      return;
    }

    const resolvedFit = spec.fit || fit;
    if (existing && host.dataset.pageMediaOverride === key && existing.dataset.source === spec.url) {
      existing.style.objectFit = resolvedFit;
      existing.style.objectPosition = spec.position;
      existing.style.transformOrigin = spec.position;
      existing.style.transform = `scale(${spec.zoom / 100})`;
      return;
    }

    const image = document.createElement('img');
    image.dataset.pageMediaImage = 'true';
    image.dataset.source = spec.url;
    image.src = spec.url;
    image.alt = alt;
    image.decoding = 'async';
    image.style.objectFit = resolvedFit;
    image.style.objectPosition = spec.position;
    image.style.transformOrigin = spec.position;
    image.style.transform = `scale(${spec.zoom / 100})`;
    host.replaceChildren(image);
    host.classList.remove('empty');
    host.classList.add('page-hero-media-override');
    host.dataset.pageMediaOverride = key;
  }

  function currentFeaturedSlug() {
    return grid?.querySelector('.hc.is-featured[data-slug]')?.dataset.slug
      || new URLSearchParams(location.search).get('heroi')
      || grid?.querySelector('.hc[data-slug]')?.dataset.slug
      || '';
  }

  function allOverviewActive() {
    if (new URLSearchParams(location.search).get('heroi')) return false;
    const active = classShowcase?.querySelector('.class-card.is-active[data-class-showcase]');
    return active?.dataset.classShowcase === '';
  }

  function applyFeatured() {
    const slug = currentFeaturedSlug();
    if (!slug) return;

    const allSpec = allOverviewActive() ? mediaSpec(content.heroes_all_feature_image) : null;
    if (allSpec) {
      page.classList.add('is-all-overview');
      applyHost(featuredMedia, allSpec, '__all_feature__', { fit: 'cover', alt: 'Heróis do Echo Arena' });
      applyHost(featuredBackground, { ...allSpec, fit: 'cover' }, '__all_background__', { fit: 'cover', alt: '' });
      if (featuredWatermark) featuredWatermark.textContent = 'TODOS';
      return;
    }

    page.classList.remove('is-all-overview');
    const spec = mediaSpec(content[heroKey('featured', slug)]);
    const backgroundSpec = spec ? { ...spec, fit: 'cover' } : null;
    applyHost(featuredMedia, spec, `hero:${slug}`, { fit: 'contain', alt: heroName(slug) });
    applyHost(featuredBackground, backgroundSpec, `hero-bg:${slug}`, { fit: 'cover', alt: '' });
    if (featuredWatermark) featuredWatermark.textContent = heroName(slug);
  }

  function applyRoster() {
    grid?.querySelectorAll('.hc[data-slug]').forEach(card => {
      const slug = card.dataset.slug || '';
      const host = card.querySelector('.thumb .media');
      const spec = mediaSpec(content[heroKey('roster', slug)]);
      applyHost(host, spec, `roster:${slug}`, { fit: 'cover', alt: heroName(slug) });
    });
  }

  function applyDetail(slug = new URLSearchParams(location.search).get('heroi') || '') {
    if (!slug || !detailMedia) return;
    const spec = mediaSpec(content[heroKey('featured', slug)]);
    applyHost(detailMedia, spec, `detail:${slug}`, { fit: 'contain', alt: heroName(slug) });
  }

  function applyClassCards() {
    classShowcase?.querySelectorAll('.class-card[data-class-showcase]').forEach(button => {
      const slug = button.dataset.classShowcase || '';
      const spec = mediaSpec(slug ? content[classKey(slug)] : content.heroes_all_card_image);
      let visual = button.querySelector('.heroes-class-card-visual');

      if (!spec) {
        visual?.remove();
        button.classList.remove('has-page-art');
        return;
      }

      if (!visual) {
        visual = document.createElement('div');
        visual.className = 'heroes-class-card-visual';
        button.prepend(visual);
      }

      let image = visual.querySelector('img');
      if (!image) {
        image = document.createElement('img');
        image.alt = '';
        visual.appendChild(image);
      }

      image.src = spec.url;
      image.style.objectFit = spec.fit;
      image.style.objectPosition = spec.position;
      image.style.transformOrigin = spec.position;
      image.style.transform = `scale(${spec.zoom / 100})`;
      button.classList.add('has-page-art');
    });
  }

  function applyAll() {
    frame = 0;
    applyClassCards();
    applyRoster();
    applyFeatured();
    if (document.getElementById('hero-detail')?.classList.contains('open')) applyDetail();
  }

  function queueApply() {
    if (frame) return;
    frame = requestAnimationFrame(applyAll);
  }

  injectStyles();
  queueApply();

  document.addEventListener('echo:content-applied', event => {
    if (event.detail?.pageKey !== 'heroes') return;
    content = event.detail.content || {};
    queueApply();
  });

  grid?.addEventListener('click', event => {
    const card = event.target.closest('.hc[data-slug]');
    if (!card) return;
    setTimeout(() => applyDetail(card.dataset.slug || ''), 0);
  }, true);

  const gridObserver = new MutationObserver(queueApply);
  if (grid) gridObserver.observe(grid, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  const classObserver = new MutationObserver(queueApply);
  if (classShowcase) classObserver.observe(classShowcase, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  const featuredObserver = new MutationObserver(queueApply);
  if (featuredMedia) featuredObserver.observe(featuredMedia, { childList: true });
  if (featuredBackground) featuredObserver.observe(featuredBackground, { childList: true });
}
