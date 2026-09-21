const text = value => String(value ?? '').trim();
const slugKey = value => text(value).toLocaleLowerCase('pt-BR');

export function parseCreateBuildEntry(search = '') {
  let params;
  try {
    params = new URLSearchParams(String(search || ''));
  } catch {
    params = new URLSearchParams();
  }

  const isNew = params.get('nova') === '1';
  const heroSlug = text(params.get('heroi'));
  const requestedBuildId = text(params.get('build'));

  return {
    isNew,
    heroSlug,
    buildId: isNew ? '' : requestedBuildId,
    allowsDraft: !isNew
  };
}

export function resolveCreateBuildEntry(search = '', heroes = []) {
  const route = parseCreateBuildEntry(search);
  const requested = slugKey(route.heroSlug);
  const hero = route.isNew && requested
    ? (Array.isArray(heroes) ? heroes : []).find(item =>
      [item?.id, item?.slug].some(value => slugKey(value) === requested)
    ) || null
    : null;

  return {
    ...route,
    hero,
    missingRequestedHero: route.isNew && Boolean(requested) && !hero
  };
}
