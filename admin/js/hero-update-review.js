function isEmpty(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function hasValue(value) {
  return !isEmpty(value);
}

export function valuesEqual(left, right) {
  if (isEmpty(left)) return isEmpty(right);
  if (isEmpty(right)) return false;
  if (typeof left === 'boolean' || typeof right === 'boolean') return left === right;

  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber === rightNumber;
  }

  return String(left).trim() === String(right).trim();
}

function classifyDifference(before, after, kind = 'text') {
  if (valuesEqual(before, after)) return 'same';
  if (kind !== 'number') return 'text';

  const beforeNumber = Number(before);
  const afterNumber = Number(after);
  if (!Number.isFinite(beforeNumber) || !Number.isFinite(afterNumber)) return 'text';
  return afterNumber > beforeNumber ? 'increase' : 'decrease';
}

function isLargeNumericChange(before, after) {
  const beforeNumber = Number(before);
  const afterNumber = Number(after);
  if (!Number.isFinite(beforeNumber) || !Number.isFinite(afterNumber) || beforeNumber === 0) return false;
  return Math.abs(afterNumber - beforeNumber) / Math.abs(beforeNumber) > .8;
}

export function createDiff({ key, label, group, before, after, kind = 'text', apply, selected = true }) {
  const change = classifyDifference(before, after, kind);
  return {
    key,
    label,
    group,
    before,
    after,
    kind,
    change,
    apply,
    changed: change !== 'same',
    selected: change !== 'same' && selected,
    risky: kind === 'number' && change !== 'same' && isLargeNumericChange(before, after)
  };
}

export function summarizeDiffs(diffs = []) {
  const changed = diffs.filter(item => item.changed);
  return {
    changed: changed.length,
    selected: changed.filter(item => item.selected).length,
    increases: changed.filter(item => item.change === 'increase').length,
    decreases: changed.filter(item => item.change === 'decrease').length,
    texts: changed.filter(item => item.change === 'text').length,
    same: diffs.length - changed.length
  };
}

export function projectUpdateState(bundle, diffs = [], { selectAll = false } = {}) {
  const state = {
    hero: { ...(bundle?.hero || {}) },
    heroStats: { ...(bundle?.heroStats || {}) },
    persistedHeroStatsCount: Object.keys(bundle?.heroStats || {}).length,
    weaponStats: { ...(bundle?.weaponStats || {}) },
    weaponName: bundle?.weaponName || '',
    media: {
      image: hasValue(bundle?.hero?.image_path) || hasValue(bundle?.hero?.image_url),
      card: hasValue(bundle?.hero?.card_image_path) || hasValue(bundle?.hero?.card_image_url),
      gif: hasValue(bundle?.hero?.gif_path),
      buildImage: hasValue(bundle?.hero?.build_image_path),
      buildCard: hasValue(bundle?.hero?.build_card_image_path),
      screenVideo: hasValue(bundle?.hero?.screen_video_path)
    }
  };

  for (const item of diffs) {
    if (!item.changed || (!selectAll && !item.selected)) continue;
    const action = item.apply || {};

    if (action.type === 'hero') state.hero[action.column] = item.after;
    if (action.type === 'weapon-name') state.weaponName = item.after || '';
    if (action.type === 'stat') {
      const target = action.table === 'hero_base_stats' ? state.heroStats : state.weaponStats;
      target[action.statKey] = item.after;
    }
    if (action.type === 'media') state.media[action.media] = action.action !== 'remove';
  }

  return state;
}

export function buildHeroReadiness(state) {
  const hero = state?.hero || {};
  const baseStatsReady = hero.enabled === true
    ? Number(state?.persistedHeroStatsCount || 0) > 0
    : Object.keys(state?.heroStats || {}).length > 0;
  const required = [
    { key: 'name', label: 'Nome do herói', tab: 'general', ok: hasValue(hero.name) },
    { key: 'class', label: 'Classe', tab: 'general', ok: hasValue(hero.class_id) },
    { key: 'base-stats', label: 'Ao menos 1 status base salvo', tab: 'stats', ok: baseStatsReady },
    { key: 'public-media', label: 'Imagem principal ou card', tab: 'media', ok: Boolean(state?.media?.image || state?.media?.card) }
  ];
  const recommended = [
    { key: 'rarity', label: 'Raridade', tab: 'general', ok: hasValue(hero.rarity_id) },
    { key: 'faction', label: 'Facção', tab: 'general', ok: hasValue(hero.faction) },
    { key: 'description', label: 'Descrição revisada em PT-BR', tab: 'general', ok: hasValue(hero.description) },
    { key: 'weapon-name', label: 'Nome da arma', tab: 'weapon', ok: hasValue(state?.weaponName) },
    { key: 'weapon-stats', label: 'Dados da arma', tab: 'weapon', ok: Object.keys(state?.weaponStats || {}).length > 0 }
  ];
  const publicationPending = required.filter(item => !item.ok);
  const qualityPending = recommended.filter(item => !item.ok);
  const isPublished = hero.enabled === true;

  return {
    isPublished,
    required,
    recommended,
    publicationPending,
    qualityPending,
    blockers: isPublished ? publicationPending : []
  };
}
