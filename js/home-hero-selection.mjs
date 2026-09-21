/* Shared selection contract for the home spotlight and its related builds. */
const keyOf = (value) => String(value ?? '');
const countOf = (value) => value !== null && value !== undefined && Number.isFinite(Number(value))
  ? Math.max(0, Number(value)) : null;

function heroDestinations(hero) {
  const slug = String(hero?.slug || '').trim();
  if (!slug) return { explore: null, createBuild: null };
  const encoded = encodeURIComponent(slug);
  return {
    explore: `./herois.html?heroi=${encoded}`,
    createBuild: `./criar-build.html?nova=1&heroi=${encoded}`
  };
}

export function publicBuildsQuery(query) {
  return query.eq('is_public', true).eq('visibility', 'public')
    .eq('status', 'published').is('deleted_at', null);
}

export function isPublicHeroBuild(build, heroId) {
  return Boolean(build?.id) && keyOf(build.hero_id) === keyOf(heroId)
    && build.is_public === true && build.visibility === 'public'
    && build.status === 'published' && build.deleted_at === null;
}

export function homeBuildEquipmentSlots(build) {
  const slots = Array(6).fill(null);
  for (const item of Array.isArray(build?.build_items) ? build.build_items : []) {
    const slot = Number(item?.slot);
    if (!item?.equipment_id || !Number.isInteger(slot) || slot < 1 || slot > slots.length || slots[slot - 1]) continue;
    slots[slot - 1] = item;
  }
  return slots;
}

export function createHeroBuildReader(client, { now = Date.now, cacheMs = 30000 } = {}) {
  let totalCache = null;
  let totalRequest = null;
  async function publicTotal() {
    if (totalCache && now() - totalCache.at < cacheMs) return totalCache.count;
    if (totalRequest) return totalRequest;
    totalRequest = (async () => {
      try {
        const result = await publicBuildsQuery(client.from('builds')
          .select('id', { count: 'exact', head: true }));
        const count = result.error ? null : countOf(result.count);
        if (count !== null) totalCache = { at: now(), count };
        return count;
      } catch { return null; }
      finally { totalRequest = null; }
    })();
    return totalRequest;
  }
  return async (heroId) => {
    const [result, total] = await Promise.all([
      publicBuildsQuery(client.from('builds').select(
        'id,title,hero_id,likes,views,favorites_count,created_at,is_public,visibility,status,deleted_at,author:profiles(username,display_name),build_items(slot,equipment_id,equipment:equipments(name,image_path,image_url))',
        { count: 'exact' }
      ).eq('hero_id', heroId))
        .order('likes', { ascending: false, nullsFirst: false })
        .order('views', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: true }).limit(6),
      publicTotal()
    ]);
    if (result.error) throw result.error;
    return { items: result.data || [], count: countOf(result.count), total };
  };
}

export function createHomeHeroSelection({ readBuilds, onChange = () => {}, featuredHeroId = '', now = Date.now, cacheMs = 30000 }) {
  let heroes = [];
  let selectedHeroId = '';
  let featuredId = keyOf(featuredHeroId);
  let userSelected = false;
  let generation = 0;
  let builds = { heroId: '', status: 'idle', items: [], count: null, total: null };
  const cache = new Map();
  const findHero = (id) => heroes.find(hero => keyOf(hero.id) === keyOf(id)) || null;
  const navigation = () => {
    const index = heroes.findIndex(hero => keyOf(hero.id) === selectedHeroId);
    const available = heroes.length > 1 && index >= 0;
    return {
      available,
      previousHero: available ? heroes[(index - 1 + heroes.length) % heroes.length] : null,
      nextHero: available ? heroes[(index + 1) % heroes.length] : null
    };
  };
  const snapshot = () => ({
    hero: findHero(selectedHeroId), selectedHeroId,
    featuredHeroId: findHero(featuredId) ? featuredId : '',
    isFeatured: Boolean(selectedHeroId && selectedHeroId === featuredId && findHero(featuredId)),
    userSelected, builds, navigation: navigation(),
    destinations: heroDestinations(findHero(selectedHeroId))
  });
  const notify = (change = {}) => onChange(snapshot(), change);

  async function requestBuilds(heroId, ticket) {
    try {
      const result = await readBuilds(heroId);
      if (ticket !== generation || heroId !== selectedHeroId) return;
      const items = (result.items || []).filter(build => isPublicHeroBuild(build, heroId));
      builds = { heroId, status: 'ready', items, count: countOf(result.count), total: countOf(result.total) };
      cache.set(heroId, { at: now(), builds });
    } catch {
      if (ticket !== generation || heroId !== selectedHeroId) return;
      builds = { heroId, status: 'error', items: [], count: null, total: null };
    }
    notify();
  }

  function selectHero(id, { userInitiated = true, animate = true, force = false, direction } = {}) {
    const hero = findHero(id);
    if (!hero) return false;
    if (userInitiated) userSelected = true;
    const heroId = keyOf(hero.id);
    if (heroId === selectedHeroId && !force) return true;
    const heroChanged = heroId !== selectedHeroId;
    const from = heroes.findIndex(item => keyOf(item.id) === selectedHeroId);
    const to = heroes.indexOf(hero);
    const motionDirection = direction === -1 || direction === 1 ? direction : to < from ? -1 : 1;
    selectedHeroId = heroId;
    const ticket = ++generation;
    const saved = !force && cache.get(heroId);
    const fresh = saved && now() - saved.at < cacheMs;
    builds = fresh ? saved.builds : { heroId, status: 'loading', items: [], count: null, total: null };
    notify({ heroChanged, animate, direction: motionDirection });
    if (!fresh) void requestBuilds(heroId, ticket);
    return true;
  }

  function setCatalog(items) {
    heroes = items.filter(hero => hero?.id && hero.enabled !== false);
    cache.clear();
    if (!heroes.length) {
      generation += 1;
      selectedHeroId = '';
      builds = { heroId: '', status: 'idle', items: [], count: null, total: null };
      notify({ heroChanged: true });
      return;
    }
    const first = findHero(selectedHeroId) || findHero(featuredId) || heroes[0];
    selectHero(first.id, { userInitiated: false, animate: false, force: true });
  }

  function setFeaturedHero(id, { initial = false } = {}) {
    featuredId = keyOf(id);
    const featured = findHero(featuredId);
    if (initial && !userSelected && featured && keyOf(featured.id) !== selectedHeroId) {
      selectHero(featured.id, { userInitiated: false, animate: false });
    } else notify();
  }

  function stepHero(direction) {
    const { previousHero, nextHero } = navigation();
    const target = direction === -1 ? previousHero : direction === 1 ? nextHero : null;
    return target ? selectHero(target.id, { direction }) : false;
  }

  return {
    snapshot, setCatalog, setFeaturedHero, selectHero, stepHero,
    retry: () => selectHero(selectedHeroId, { userInitiated: false, animate: false, force: true })
  };
}
