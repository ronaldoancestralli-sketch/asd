const text = value => String(value ?? '').trim();

function firstRow(value) {
  return Array.isArray(value) ? value[0] || {} : value && typeof value === 'object' ? value : {};
}

export function homeFeaturedPreviewRequested(search = '') {
  try {
    return new URLSearchParams(String(search || '')).get('previewDestaque') === 'proximo';
  } catch {
    return false;
  }
}

export function normalizeHomeFeaturedAuthority(raw, {
  source = 'canonical',
  preview = false,
  fallbackHeroId = ''
} = {}) {
  const row = firstRow(raw);
  const previewHero = row.next_hero && typeof row.next_hero === 'object' ? row.next_hero : {};
  const heroId = text(preview ? previewHero.id : row.hero_id);
  const resolvedFallback = source === 'fallback' ? text(fallbackHeroId) : '';

  return {
    featuredHeroId: heroId || resolvedFallback,
    heroSlug: text(preview ? previewHero.slug : row.hero_slug),
    heroName: text(preview ? previewHero.name : ''),
    source,
    preview: preview && Boolean(heroId),
    automationEnabled: preview ? row.automation_enabled === true : row.automation_enabled === true,
    periodStartAt: preview ? null : row.period_start_at || null,
    periodEndAt: preview ? null : row.period_end_at || null,
    nextRotationAt: preview ? row.scheduled_for || null : row.next_rotation_at || null,
    revision: Number.isFinite(Number(row.revision)) ? Number(row.revision) : null,
    status: text(row.status) || (heroId || resolvedFallback ? 'ready' : 'empty')
  };
}

export async function readHomeFeaturedAuthority(client, {
  search = '',
  fallbackHeroId = ''
} = {}) {
  const wantsPreview = homeFeaturedPreviewRequested(search);
  const canonicalRequest = client.rpc('echo_home_featured_state_v1');
  const previewRequest = wantsPreview
    ? client.rpc('echo_admin_preview_home_featured_rotation_v1')
    : Promise.resolve({ data: null, error: null });
  const [canonicalResult, previewResult] = await Promise.all([canonicalRequest, previewRequest]);

  if (wantsPreview && !previewResult?.error) {
    const previewAuthority = normalizeHomeFeaturedAuthority(previewResult?.data, {
      source: 'admin-preview', preview: true
    });
    if (previewAuthority.featuredHeroId) return previewAuthority;
  }

  if (!canonicalResult?.error) {
    return normalizeHomeFeaturedAuthority(canonicalResult?.data, { source: 'canonical' });
  }

  return normalizeHomeFeaturedAuthority({}, { source: 'fallback', fallbackHeroId });
}

export function homeFeaturedPresentation({ isFeatured = false, preview = false } = {}) {
  if (!isFeatured) return {
    mode: 'explore',
    eyebrow: 'Explorar heróis',
    sealLabel: '',
    announcementSuffix: ''
  };
  return {
    mode: preview ? 'preview' : 'featured',
    eyebrow: preview ? 'Prévia do próximo destaque' : 'Herói em destaque',
    sealLabel: preview ? 'Próximo ciclo' : 'Destaque da Arena',
    announcementSuffix: preview ? ', prévia administrativa do próximo destaque' : ', herói em destaque'
  };
}
