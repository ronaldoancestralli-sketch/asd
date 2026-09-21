import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHomeHeroSelection, createHeroBuildReader, homeBuildEquipmentSlots } from '../js/home-hero-selection.mjs';
import { parseCreateBuildEntry, resolveCreateBuildEntry } from '../js/criar-build-route.mjs';

const heroes = ['A', 'B', 'C'].map(id => ({ id, name: id, enabled: true }));
const build = (hero_id, id = `${hero_id}-build`, extra = {}) => ({
  id, hero_id, title: id, is_public: true, visibility: 'public', status: 'published',
  deleted_at: null, likes: 0, views: 0, created_at: '2026-09-05', ...extra
});
const result = (hero, id) => ({ items: [build(hero, id)], count: 1, total: 3 });
const tick = () => new Promise(resolve => setImmediate(resolve));

test('a partial saved build keeps its three items in positions 1, 3 and 4 regardless of response order', () => {
  const items = [3, 4, 1].map(slot => ({ slot, equipment_id: `item-${slot}`, equipment: { name: `Peça ${slot}` } }));
  const slots = homeBuildEquipmentSlots({ build_items: items });
  assert.deepEqual(slots.map(item => item?.equipment_id || null), ['item-1', null, 'item-3', 'item-4', null, null]);
  assert.deepEqual(items.map(item => item.slot), [3, 4, 1], 'the saved data is not reordered or changed');
  assert.equal(homeBuildEquipmentSlots({ build_items: [] }).filter(Boolean).length, 0);
});

test('unavailable equipment metadata remains occupied and invalid positions never move into an empty slot', () => {
  const unavailable = { slot: 4, equipment_id: 'unavailable', equipment: null };
  const slots = homeBuildEquipmentSlots({ build_items: [
    { slot: 0, equipment_id: 'zero' }, { slot: 7, equipment_id: 'outside' },
    { slot: 1.5, equipment_id: 'fractional' }, { slot: 2 }, unavailable
  ] });
  assert.equal(slots[3], unavailable);
  assert.equal(slots.filter(Boolean).length, 1);
  assert.deepEqual(homeBuildEquipmentSlots(null), Array(6).fill(null));
});

test('switching heroes clears old equipment and returning restores only the selected build items', async () => {
  const { state, requests } = harness();
  const items = [1, 3, 4].map(slot => ({ slot, equipment_id: `item-${slot}` }));
  requests[0].resolve({ items: [build('A', 'saved-A', { build_items: items })], count: 1, total: 1 });
  await tick();
  const occupied = () => homeBuildEquipmentSlots(state.snapshot().builds.items[0]).filter(Boolean).length;
  assert.equal(occupied(), 3);
  state.stepHero(1);
  assert.equal(occupied(), 0);
  state.stepHero(-1);
  assert.equal(occupied(), 3);
  requests[1].resolve({ items: [build('B', 'late-B', { build_items: [{ slot: 2, equipment_id: 'foreign' }] })], count: 1, total: 2 });
  await tick();
  assert.equal(occupied(), 3);
  assert.equal(state.snapshot().builds.items[0].id, 'saved-A');
  state.retry();
  assert.equal(occupied(), 0);
  requests[2].reject(new Error('offline'));
  await tick();
  assert.equal(occupied(), 0);
});

function harness(options = {}) {
  const requests = [];
  const history = [];
  const state = createHomeHeroSelection({
    readBuilds: heroId => new Promise((resolve, reject) => requests.push({ heroId, resolve, reject })),
    onChange: value => history.push(value), ...options
  });
  state.setCatalog(heroes);
  return { state, requests, history };
}

test('editorial identity is independent of visitor selection and CMS arrival order', () => {
  const { state } = harness({ featuredHeroId: 'A' });
  assert.equal(state.snapshot().isFeatured, true);
  state.selectHero('B');
  assert.equal(state.snapshot().isFeatured, false);
  state.setFeaturedHero('C', { initial: true });
  assert.equal(state.snapshot().selectedHeroId, 'B');
  state.selectHero('C');
  assert.equal(state.snapshot().isFeatured, true);
  state.setFeaturedHero('A');
  assert.equal(state.snapshot().selectedHeroId, 'C');
  assert.equal(state.snapshot().isFeatured, false);
  state.selectHero('A');
  assert.equal(state.snapshot().isFeatured, true);
});

test('late initial CMS can select its featured hero only before visitor interaction', () => {
  const { state } = harness();
  assert.equal(state.snapshot().isFeatured, false);
  state.setFeaturedHero('B', { initial: true });
  assert.equal(state.snapshot().selectedHeroId, 'B');
  assert.equal(state.snapshot().isFeatured, true);
  state.setFeaturedHero('missing');
  assert.equal(state.snapshot().featuredHeroId, '');
  assert.equal(state.snapshot().selectedHeroId, 'B');
});

test('a late response cannot restore the previous hero build or counters', async () => {
  const { state, requests, history } = harness();
  state.selectHero('B');
  assert.equal(state.snapshot().builds.status, 'loading');
  assert.deepEqual(state.snapshot().builds.items, []);
  requests[1].resolve({ ...result('B'), count: 8 });
  await tick();
  requests[0].resolve({ ...result('A'), count: 99 });
  await tick();
  assert.equal(state.snapshot().builds.items[0].hero_id, 'B');
  assert.equal(state.snapshot().builds.count, 8);
  assert.ok(history.every(s => s.builds.items.every(b => b.hero_id === s.selectedHeroId)));
});

test('A → B → A rejects even an old response with the same hero ID', async () => {
  const { state, requests } = harness();
  state.selectHero('B');
  state.selectHero('A');
  requests[2].resolve(result('A', 'latest-A'));
  await tick();
  requests[0].resolve(result('A', 'obsolete-A'));
  requests[1].reject(new Error('obsolete request failed'));
  await tick();
  assert.equal(state.snapshot().builds.status, 'ready');
  assert.equal(state.snapshot().builds.items[0].id, 'latest-A');
});

test('empty results and failures remain distinct and retry clears stale data', async () => {
  const { state, requests } = harness();
  requests[0].resolve({ items: [], count: 0, total: 3 });
  await tick();
  assert.equal(state.snapshot().builds.status, 'ready');
  assert.equal(state.snapshot().builds.count, 0);
  state.retry();
  requests[1].reject(new Error('offline'));
  await tick();
  assert.equal(state.snapshot().builds.status, 'error');
  assert.equal(state.snapshot().builds.count, null);
  state.retry();
  assert.deepEqual(state.snapshot().builds.items, []);
  requests[2].resolve(result('A'));
  await tick();
  assert.equal(state.snapshot().builds.status, 'ready');
});

test('cache is scoped to hero, expires and does not retain errors', async () => {
  let now = 0;
  const { state, requests } = harness({ now: () => now, cacheMs: 100 });
  requests[0].resolve(result('A'));
  await tick();
  state.selectHero('B');
  state.selectHero('A');
  assert.equal(requests.length, 2);
  assert.equal(state.snapshot().builds.items[0].hero_id, 'A');
  now = 101;
  state.selectHero('B');
  state.selectHero('A');
  assert.equal(state.snapshot().builds.status, 'loading');
  assert.equal(requests.length, 4);
});

test('catalog removal invalidates pending requests and never invents a featured hero', async () => {
  const { state, requests } = harness({ featuredHeroId: 'A' });
  state.setCatalog([{ ...heroes[0], enabled: false }, heroes[1]]);
  assert.equal(state.snapshot().selectedHeroId, 'B');
  assert.equal(state.snapshot().isFeatured, false);
  state.setCatalog([]);
  requests[0].resolve(result('A'));
  requests[1].resolve(result('B'));
  await tick();
  assert.equal(state.snapshot().hero, null);
  assert.equal(state.snapshot().builds.status, 'idle');
  assert.equal(state.selectHero('A'), false);
});

function fixtureClient(rows) {
  return {
    from(table) {
      assert.equal(table, 'builds');
      let filters = [], orders = [], limit = Infinity, head = false;
      const query = {
        select(_columns, options) { head = options?.head; return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        is(key, value) { filters.push(row => row[key] === value); return query; },
        order(key, options) { orders.push([key, options.ascending]); return query; },
        limit(value) { limit = value; return query; },
        then(resolve, reject) {
          const matched = rows.filter(row => filters.every(filter => filter(row)));
          matched.sort((a,b) => {
            for (const [key, ascending] of orders) {
              if (a[key] < b[key]) return ascending ? -1 : 1;
              if (a[key] > b[key]) return ascending ? 1 : -1;
            }
            return 0;
          });
          return Promise.resolve({ data: head ? null : matched.slice(0, limit), count: matched.length, error: null }).then(resolve, reject);
        }
      };
      return query;
    }
  };
}

test('query finds hero builds beyond global top 20 and enforces public eligibility', async () => {
  const rows = Array.from({ length: 30 }, (_,i) => build('A', `A-${i}`, { likes: 100 }));
  for (let i=0;i<8;i++) rows.push(build('B', `B-${i}`, { likes: i }));
  rows.push(build('B', 'private', { visibility: 'private', likes: 999 }));
  rows.push(build('B', 'draft', { status: 'draft', likes: 999 }));
  rows.push(build('B', 'removed', { deleted_at: '2026-09-05', likes: 999 }));
  rows.push(build('B', 'unlisted', { is_public: false, likes: 999 }));
  const read = createHeroBuildReader(fixtureClient(rows));
  const actual = await read('B');
  assert.equal(actual.count, 8);
  assert.equal(actual.total, 38);
  assert.equal(actual.items.length, 6);
  assert.equal(actual.items[0].id, 'B-7');
  assert.ok(actual.items.every(row => row.hero_id === 'B' && row.id.startsWith('B-')));
});

test('foreign or ineligible rows from an unexpected response never enter the selection', async () => {
  const { state, requests } = harness();
  requests[0].resolve({ items: [build('B'), build('A','draft',{status:'draft'}), build('A')], count: 1, total: null });
  await tick();
  assert.deepEqual(state.snapshot().builds.items.map(b => b.id), ['A-build']);
  assert.equal(state.snapshot().builds.total, null);
});

test('spotlight arrows wrap in both directions and preserve the editorial identity', async () => {
  const { state, requests } = harness({ featuredHeroId: 'A' });
  requests[0].resolve(result('A'));
  await tick();
  assert.equal(state.snapshot().navigation.previousHero.id, 'C');
  assert.equal(state.snapshot().navigation.nextHero.id, 'B');
  assert.equal(state.stepHero(-1), true);
  assert.equal(state.snapshot().selectedHeroId, 'C');
  assert.equal(state.snapshot().isFeatured, false);
  assert.equal(state.snapshot().builds.status, 'loading');
  assert.deepEqual(state.snapshot().builds.items, []);
  assert.equal(requests[1].heroId, 'C');
  state.stepHero(1);
  assert.equal(state.snapshot().selectedHeroId, 'A');
  assert.equal(state.snapshot().isFeatured, true);
  assert.equal(state.snapshot().builds.items[0].hero_id, 'A');
  state.selectHero('B');
  state.stepHero(1);
  assert.equal(state.snapshot().selectedHeroId, 'C');
  assert.equal(state.snapshot().userSelected, true);
  state.setFeaturedHero('B', { initial: true });
  assert.equal(state.snapshot().selectedHeroId, 'C');
});

test('arrows follow enabled catalog order and stay unavailable with fewer than two heroes', () => {
  const { state } = harness();
  state.setCatalog([heroes[2], { ...heroes[1], enabled: false }, heroes[0]]);
  state.stepHero(1);
  assert.equal(state.snapshot().selectedHeroId, 'C');
  state.stepHero(-1);
  assert.equal(state.snapshot().selectedHeroId, 'A');
  assert.equal(state.stepHero(0), false);
  assert.equal(state.stepHero(2), false);
  state.setCatalog([heroes[1]]);
  assert.equal(state.snapshot().navigation.available, false);
  assert.equal(state.snapshot().navigation.previousHero, null);
  assert.equal(state.stepHero(1), false);
  assert.equal(state.snapshot().selectedHeroId, 'B');
  state.setCatalog([]);
  assert.equal(state.snapshot().navigation.available, false);
  assert.equal(state.stepHero(-1), false);
  assert.equal(state.snapshot().hero, null);
});

test('rapid arrow clicks commit each step immediately and discard late builds after a full lap', async () => {
  const { state, requests, history } = harness();
  state.stepHero(1);
  state.stepHero(1);
  state.stepHero(1);
  assert.deepEqual(requests.map(request => request.heroId), ['A', 'B', 'C', 'A']);
  assert.equal(state.snapshot().selectedHeroId, 'A');
  requests[3].resolve(result('A', 'current-A'));
  await tick();
  requests[1].resolve(result('B'));
  requests[2].reject(new Error('late C'));
  requests[0].resolve(result('A', 'old-A'));
  await tick();
  assert.equal(state.snapshot().builds.items[0].id, 'current-A');
  assert.ok(history.every(s => s.builds.items.every(item => item.hero_id === s.selectedHeroId)));
});

const linkedHeroes = [
  { id: 'slayer-uuid', slug: 'slayer', name: 'Slayer' },
  { id: 'mirage-uuid', slug: 'mirage', name: 'Mirage' }
];

test('both destinations follow the selected slug and explicitly start a new build', () => {
  const { state } = harness();
  state.setCatalog(linkedHeroes);
  state.stepHero(1);
  const { destinations } = state.snapshot();
  const explore = new URL(destinations.explore, 'https://echo.test/');
  const create = new URL(destinations.createBuild, 'https://echo.test/');
  assert.equal(explore.pathname, '/herois.html');
  assert.equal(explore.searchParams.get('heroi'), 'mirage');
  assert.equal(create.pathname, '/criar-build.html');
  assert.equal(create.searchParams.get('heroi'), 'mirage');
  assert.equal(create.searchParams.get('nova'), '1');
  assert.equal(create.searchParams.has('build'), false);
  assert.equal(create.searchParams.has('draft'), false);
  state.selectHero('slayer-uuid');
  assert.equal(new URL(state.snapshot().destinations.explore, explore).searchParams.get('heroi'), 'slayer');
  state.setCatalog([{ id: 'missing-slug' }]);
  assert.equal(state.snapshot().destinations.createBuild, null);
  assert.equal(state.snapshot().destinations.explore, null);
});

async function runBuildEntry(href, previousDraft) {
  // Run the real destination entry; replace only its network client and workbench import.
  const source = await readFile(new URL('../js/criar-build-entry.js', import.meta.url), 'utf8');
  const entry = source.replace(/^import \{ supabase \} from [^\n]+\n/, '')
    .replace(/await import\('\.\/criar-build\.js[^']*'\);/, 'await loadWorkbench();');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const key = 'echo-arena-build-draft';
  const stored = new Map(previousDraft ? [[key, JSON.stringify(previousDraft)]] : []);
  const filters = {};
  const query = {
    select() { return query; },
    eq(field, value) { filters[field] = value; return query; },
    async maybeSingle() {
      assert.equal(filters.enabled, true);
      return { data: linkedHeroes.find(hero => hero.slug === filters.slug) || null, error: null };
    }
  };
  const client = { from(table) { assert.equal(table, 'heroes'); return query; } };
  const location = new URL(href, 'https://echo.test/');
  let received, replacedUrl;
  await new AsyncFunction('supabase', 'location', 'history', 'localStorage', 'loadWorkbench', entry)(
    client, location, { replaceState(_state, _title, url) { replacedUrl = url; } },
    { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) },
    async () => { received = JSON.parse(stored.get(key) || 'null'); }
  );
  return { received, stored, filters, replacedUrl };
}

test('the home creation URL reaches the real build entry with Mirage instead of an old Slayer draft', async () => {
  const { state } = harness();
  state.setCatalog(linkedHeroes);
  state.stepHero(1);
  const { received, filters, stored } = await runBuildEntry(state.snapshot().destinations.createBuild,
    { heroId: 'slayer-uuid', title: 'Rascunho anterior', items: [{ id: 'old-item' }] });
  assert.equal(filters.slug, 'mirage');
  assert.equal(received.heroId, 'mirage-uuid');
  assert.equal(received.title, '');
  assert.deepEqual(received.items, []);
  assert.equal(stored.has('echo-arena-build-draft'), false, 'the transport envelope is temporary');
});

test('the workbench resolves the explicit hero route after the real catalog loads', () => {
  const catalog = [
    { id: 'slayer', databaseId: 'slayer-uuid', nome: 'Slayer' },
    { id: 'mirage', databaseId: 'mirage-uuid', nome: 'Mirage' }
  ];
  const route = resolveCreateBuildEntry(
    '?nova=1&heroi=Mirage&build=old-slayers-build&draft=1',
    catalog
  );
  assert.equal(route.isNew, true);
  assert.equal(route.hero, catalog[1]);
  assert.equal(route.buildId, '');
  assert.equal(route.allowsDraft, false);
  assert.equal(route.missingRequestedHero, false);
});

test('a new workbench never restores an old draft when the requested hero is unavailable', () => {
  const route = resolveCreateBuildEntry('?nova=1&heroi=unknown', [{ id: 'slayer' }]);
  assert.equal(route.hero, null);
  assert.equal(route.missingRequestedHero, true);
  assert.equal(route.allowsDraft, false);
  assert.deepEqual(parseCreateBuildEntry('?build=published-build'), {
    isNew: false,
    heroSlug: '',
    buildId: 'published-build',
    allowsDraft: true
  });
});

test('opening the workbench without a new-build intent keeps its existing draft flow', async () => {
  const draft = { heroId: 'slayer-uuid', title: 'Meu rascunho', items: [{ id: 'saved-item' }] };
  const { received, stored, filters, replacedUrl } = await runBuildEntry('./criar-build.html?draft=1', draft);
  assert.deepEqual(received, draft);
  assert.deepEqual(filters, {});
  assert.equal(replacedUrl, undefined);
  assert.deepEqual(JSON.parse(stored.get('echo-arena-build-draft')), draft);
});

test('motion direction follows the arrow even when wrapping and follows card order on direct selection', () => {
  const changes = [];
  const { state } = harness({ onChange: (_snapshot, change) => changes.push(change) });
  state.stepHero(-1); // A -> C is still a backward transition.
  assert.equal(changes.at(-1).direction, -1);
  state.stepHero(1); // C -> A is still forward.
  assert.equal(changes.at(-1).direction, 1);
  state.selectHero('C');
  assert.equal(changes.at(-1).direction, 1);
  state.selectHero('B');
  assert.equal(changes.at(-1).direction, -1);
});
