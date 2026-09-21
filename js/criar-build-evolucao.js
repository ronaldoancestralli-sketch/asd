import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';

/* Camada aditiva de apresentação.
   Preserva seleção, cálculo, persistência, imagens e raridades reais. */

const evolutionFixHref = './css/criar-build-evolucao-fix.css?v=1';
if (!document.querySelector('link[data-build-evolution-fix]')) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = evolutionFixHref;
  link.dataset.buildEvolutionFix = 'true';
  document.head.appendChild(link);
}

const normalizeText = value => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .trim().toLowerCase().replace(/\s+/g, ' ');

const compactKey = value => normalizeText(value).replace(/[^a-z0-9]/g, '');
const normalizeColor = value => String(value || '').trim().toLowerCase();

const LABEL_ALIASES = new Map([
  ['alcancedevisaodoheroi', 'Alcance de visão'],
  ['danodaarmaaarmaduradoinimigopercentual', 'Dano contra armadura'],
  ['danodaarmaavidadosinimigopercentual', 'Dano contra vida'],
  ['velocidadeparapegarmelhoriaspercentual', 'Velocidade para pegar melhorias'],
  ['velocidadedeparapegarmelhoriaspercentual', 'Velocidade para pegar melhorias'],
  ['velocidadeparapegarmelhorias', 'Velocidade para pegar melhorias'],
  ['velocidadedeparapegarmelhorias', 'Velocidade para pegar melhorias']
]);

const ACCENTS = {
  visao:'visão', heroi:'herói', municao:'munição', municoes:'munições',
  precisao:'precisão', critico:'crítico', criticos:'críticos', area:'área',
  explosao:'explosão', reducao:'redução', duracao:'duração', protecao:'proteção',
  resistencia:'resistência', distancia:'distância', regeneracao:'regeneração',
  penetracao:'penetração', cadencia:'cadência', aceleracao:'aceleração',
  recuperacao:'recuperação', perfuracao:'perfuração', maxima:'máxima', minima:'mínima',
  nivel:'nível', bonus:'bônus', primaria:'primária', secundaria:'secundária'
};

const TOKENS = [
  'recarregamento','velocidade','melhorias','regeneracao','resistencia','perfuracao',
  'percentual','armadura','aceleracao','recuperacao','distancia','protecao','penetracao',
  'precisao','municoes','municao','cadencia','movimento','alcance','inimigo','explosao',
  'criticos','critico','duracao','reducao','secundaria','primaria','maxima','minima',
  'visao','heroi','recarga','tempo','pegar','abrir','caixa','tiro','mira','vida','dano',
  'arma','bonus','nivel','para','contra','com','sem','por','dos','das','do','da','de','ao','a'
].sort((a,b) => b.length - a.length);

function splitCompactWords(source) {
  const input = compactKey(source);
  if (!input) return null;
  const memo = new Map();
  const walk = index => {
    if (index === input.length) return [];
    if (memo.has(index)) return memo.get(index);
    for (const token of TOKENS) {
      if (!input.startsWith(token, index)) continue;
      const rest = walk(index + token.length);
      if (rest) {
        const result = [token, ...rest];
        memo.set(index, result);
        return result;
      }
    }
    memo.set(index, null);
    return null;
  };
  return walk(0);
}

function accentWords(text) {
  return String(text || '').split(/\s+/).map(word => ACCENTS[word] || word).join(' ');
}

function humanizeLabel(label, { short = true } = {}) {
  const raw = String(label || '').trim();
  if (!raw) return '';
  const key = compactKey(raw);
  if (LABEL_ALIASES.has(key)) return LABEL_ALIASES.get(key);

  let words;
  if (/[_\s-]/.test(raw)) {
    words = normalizeText(raw).replace(/[_-]+/g, ' ').split(/\s+/).filter(Boolean);
  } else {
    words = splitCompactWords(raw);
    if (!words) return '';
  }

  let text = accentWords(words.join(' '))
    .replace(/\barma a armadura\b/g, 'arma à armadura')
    .replace(/\barma a vida\b/g, 'arma à vida')
    .replace(/\s+/g, ' ')
    .trim();

  if (short) {
    text = text
      .replace(/\s+percentual$/i, '')
      .replace(/\s+do herói$/i, '')
      .replace(/\s+do inimigo$/i, '')
      .replace(/^dano da arma à\s+/i, 'dano contra ')
      .trim();
  }

  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function attributesToEntries(attributes) {
  if (Array.isArray(attributes)) {
    return attributes
      .filter(item => String(item?.label || '').trim())
      .map(item => [String(item.label).trim(), item.value]);
  }
  if (attributes && typeof attributes === 'object') return Object.entries(attributes);
  return [];
}

function formatValue(label, value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const labelText = normalizeText(label);
  const isPercent = /(?:^|_)pct$/.test(String(label || '')) ||
    /\bpercentual\b|\bporcentagem\b/.test(labelText) ||
    /percentual|porcentagem/.test(compactKey(label));

  if (/^[+-]/.test(raw)) {
    return isPercent && !raw.includes('%') ? `${raw}%` : raw;
  }

  const numeric = Number(raw.replace(',', '.'));
  if (!Number.isFinite(numeric)) return raw;
  const sign = numeric >= 0 ? '+' : '';
  return `${sign}${raw}${isPercent ? '%' : ''}`;
}

function summarizeAttributes(attributes) {
  const entries = attributesToEntries(attributes)
    .filter(([, value]) => String(value ?? '').trim() !== '' && Number(value) !== 0);

  for (const [label, value] of entries) {
    const readable = humanizeLabel(label, { short:true });
    if (!readable) continue;
    const formattedValue = formatValue(label, value);
    return {
      text: `${formattedValue} ${readable}`.trim(),
      negative: /^-/.test(formattedValue),
      label: readable
    };
  }
  return null;
}

async function loadEquipmentPresentationData() {
  const [equipmentsResult, variantsResult, raritiesResult, legacyResult] = await Promise.all([
    supabase.from('equipments').select('id,name'),
    supabase.from('equipment_variants').select('equipment_id,rarity_id,attributes'),
    supabase.from('equipment_rarities').select('id,slug,name,color,rank'),
    supabase.from('equipment_rarity_levels').select('equipment_id,rarity_slug,rarity_name,rarity_order,rarity_color,stats')
  ]);

  const equipments = equipmentsResult.data || [];
  const variants = variantsResult.data || [];
  const rarities = raritiesResult.data || [];
  const legacy = legacyResult.data || [];

  const equipmentNames = new Map(equipments.map(item => [item.id, item.name]));
  const rarityById = new Map(rarities.map(item => [item.id, item]));
  const rarityMetaByName = new Map();
  const rarityMetaByColor = new Map();

  rarities.forEach(rarity => {
    const meta = {
      name: rarity.name || rarity.slug || '',
      slug: rarity.slug || '',
      color: rarity.color || '',
      rank: Number(rarity.rank) || 0
    };
    rarityMetaByName.set(normalizeText(rarity.name), meta);
    rarityMetaByName.set(normalizeText(rarity.slug), meta);
    if (rarity.color) rarityMetaByColor.set(normalizeColor(rarity.color), meta);
  });

  const impacts = new Map();
  const setImpact = (equipmentId, rarityName, raritySlug, attributes) => {
    const equipmentName = equipmentNames.get(equipmentId);
    const summary = summarizeAttributes(attributes);
    if (!equipmentName || !summary) return;
    const base = normalizeText(equipmentName);
    if (rarityName) impacts.set(`${base}::${normalizeText(rarityName)}`, summary);
    if (raritySlug) impacts.set(`${base}::${normalizeText(raritySlug)}`, summary);
    if (!impacts.has(base)) impacts.set(base, summary);
  };

  legacy.forEach(level => {
    setImpact(level.equipment_id, level.rarity_name, level.rarity_slug, level.stats);
    const meta = {
      name: level.rarity_name || level.rarity_slug || '',
      slug: level.rarity_slug || '',
      color: level.rarity_color || '',
      rank: Number(level.rarity_order) || 0
    };
    if (level.rarity_name) rarityMetaByName.set(normalizeText(level.rarity_name), meta);
    if (level.rarity_slug) rarityMetaByName.set(normalizeText(level.rarity_slug), meta);
    if (level.rarity_color) rarityMetaByColor.set(normalizeColor(level.rarity_color), meta);
  });

  variants.forEach(variant => {
    const rarity = rarityById.get(variant.rarity_id);
    if (!rarity) return;
    setImpact(variant.equipment_id, rarity.name, rarity.slug, variant.attributes);
  });

  return { impacts, rarityMetaByName, rarityMetaByColor };
}

let presentationDataPromise = null;
function getPresentationData() {
  if (!presentationDataPromise) {
    presentationDataPromise = loadEquipmentPresentationData().catch(error => {
      console.warn('Criar Build: não foi possível enriquecer a apresentação dos equipamentos.', error);
      return { impacts:new Map(), rarityMetaByName:new Map(), rarityMetaByColor:new Map() };
    });
  }
  return presentationDataPromise;
}

function readCssVariable(element, name) {
  const inline = element?.style?.getPropertyValue(name)?.trim();
  if (inline) return normalizeColor(inline);
  return normalizeColor(getComputedStyle(element).getPropertyValue(name));
}

async function enhanceSlots() {
  const { impacts, rarityMetaByName } = await getPresentationData();
  document.querySelectorAll('#ring .slot, #slots-mobile .slot').forEach(slot => {
    if (!(slot instanceof HTMLElement)) return;

    /* O código principal posiciona o popup desktop por data-key.
       Os slots reais usam data-slot; manter ambos evita falha de ancoragem
       sem alterar a lógica de seleção ou o identificador oficial do slot. */
    if (slot.dataset.slot) slot.dataset.key = slot.dataset.slot;

    if (slot.classList.contains('empty')) return;
    const info = slot.querySelector('.in');
    const name = info?.querySelector('b')?.textContent?.trim();
    const rarity = info?.querySelector('i')?.textContent?.trim();
    if (!name) return;

    const rarityMeta = rarityMetaByName.get(normalizeText(rarity));
    if (rarityMeta?.rank) slot.dataset.rarityRank = String(rarityMeta.rank);

    const summary = impacts.get(`${normalizeText(name)}::${normalizeText(rarity)}`) || impacts.get(normalizeText(name));
    let impact = info?.querySelector('.slot-impact');
    if (!summary) {
      impact?.remove();
      return;
    }
    if (!impact) {
      impact = document.createElement('small');
      impact.className = 'slot-impact';
      info.appendChild(impact);
    }
    impact.textContent = summary.text;
    impact.title = summary.text;
    impact.classList.toggle('is-negative', summary.negative);
  });
}

async function enhanceCatalog() {
  const { impacts, rarityMetaByColor } = await getPresentationData();
  document.querySelectorAll('#ilist .pick-tile').forEach(tile => {
    if (!(tile instanceof HTMLElement)) return;
    const name = tile.querySelector(':scope > b')?.textContent?.trim();
    if (!name) return;
    const color = readCssVariable(tile, '--rc');
    const rarity = rarityMetaByColor.get(color);
    const summary = impacts.get(`${normalizeText(name)}::${normalizeText(rarity?.name)}`) ||
      impacts.get(`${normalizeText(name)}::${normalizeText(rarity?.slug)}`) ||
      impacts.get(normalizeText(name));

    let meta = tile.querySelector('.pick-evolution-meta');
    if (!meta) {
      meta = document.createElement('span');
      meta.className = 'pick-evolution-meta';
      tile.appendChild(meta);
    }
    meta.replaceChildren();

    if (rarity?.name) {
      const rarityNode = document.createElement('span');
      rarityNode.className = 'pick-evolution-rarity';
      rarityNode.textContent = rarity.name;
      meta.appendChild(rarityNode);
    }
    if (summary?.text) {
      const impactNode = document.createElement('span');
      impactNode.className = 'pick-evolution-impact';
      impactNode.textContent = summary.text;
      impactNode.title = summary.text;
      meta.appendChild(impactNode);
    }
  });
}

function sanitizeRenderedStatLabels() {
  document.querySelectorAll(
    '#equipment-detail .stat-label, #equipment-detail .stat-desc, #equipment-float .delta-list i'
  ).forEach(element => {
    const original = element.textContent?.trim();
    if (!original) return;
    const clean = humanizeLabel(original, { short: element.matches('.stat-label, .delta-list i') });
    if (clean && clean !== original) element.textContent = clean;
  });
}

function ensureBuildStatus() {
  const plan = document.querySelector('.build-plan');
  if (!plan) return null;
  let card = plan.querySelector('.build-evolution-status');
  if (card) return card;
  card = document.createElement('section');
  card.className = 'build-evolution-status';
  card.setAttribute('aria-live', 'polite');
  card.innerHTML = '<div><small>STATUS DA BUILD</small><strong>Comece a montar</strong></div><em>0% concluída</em><div class="progress"><i></i></div>';
  plan.prepend(card);
  return card;
}

function updateBuildStatus() {
  const card = ensureBuildStatus();
  if (!card) return;
  const countText = document.getElementById('eq-count')?.textContent?.trim() || '0/6';
  const match = countText.match(/(\d+)\s*\/\s*(\d+)/);
  const count = Number(match?.[1]) || 0;
  const total = Math.max(1, Number(match?.[2]) || 6);
  const pct = Math.min(100, Math.round((count / total) * 100));
  const title = count === 0 ? 'Comece a montar' : count < total ? 'Build em construção' : 'Pronta para revisar';
  card.querySelector('strong').textContent = title;
  card.querySelector('em').textContent = `${pct}% concluída`;
  card.style.setProperty('--build-progress', `${pct}%`);
}

function rebalanceMobileLayout() {
  const ring = document.getElementById('ring');
  const stage = document.querySelector('.synergy-stage');
  const float = document.getElementById('equipment-float');
  const count = stage?.querySelector('.stage-count');
  if (!ring || !stage || !float || !count) return;

  const mobile = window.matchMedia('(max-width:560px)').matches;
  if (mobile) {
    if (float.parentElement !== stage) stage.insertBefore(float, count);
    const positions = [
      {x:13,y:24},{x:11,y:50},{x:13,y:76},
      {x:87,y:24},{x:89,y:50},{x:87,y:76}
    ];
    [...ring.querySelectorAll(':scope > .slot')].forEach((slot, index) => {
      const pos = positions[index];
      if (!pos) return;
      slot.style.setProperty('left', `${pos.x}%`, 'important');
      slot.style.setProperty('top', `${pos.y}%`, 'important');
    });
  } else {
    if (float.parentElement !== ring) ring.appendChild(float);
  }
}

let scheduled = false;
function scheduleEnhancement() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(async () => {
    scheduled = false;
    rebalanceMobileLayout();
    updateBuildStatus();
    await Promise.all([enhanceSlots(), enhanceCatalog()]);
    sanitizeRenderedStatLabels();
  });
}

const observer = new MutationObserver(scheduleEnhancement);
[
  document.getElementById('ring'),
  document.getElementById('slots-mobile'),
  document.getElementById('ilist'),
  document.getElementById('eq-count'),
  document.getElementById('equipment-detail'),
  document.getElementById('equipment-float')
].forEach(target => {
  if (target) observer.observe(target, { childList:true, subtree:true, characterData:true });
});

document.addEventListener('click', event => {
  if (event.target.closest('.slot, .pick-tile, #clear-all, #next-equip, .rar-pill')) scheduleEnhancement();
});
window.addEventListener('resize', scheduleEnhancement, { passive:true });

scheduleEnhancement();