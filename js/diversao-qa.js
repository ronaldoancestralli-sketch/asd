import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import { normalizeHeroMedia } from './media-storage.js?v=20260823-security-supabase-pin-1';
import { escapeHtml, classColor, mediaOf, mediaStyle, mediaInner } from './site-shell.js?v=20260831-hero-gif-rollback-1&sb=20260823-security-supabase-pin-1&identity=20260825-v6-public-1&ops=20260905&sc=20260906-1&eq=20260907-effects-1';

const QA_MESSAGE = 'echoarena:diversao-qa-command';
const QA_RESULT = 'echoarena:diversao-qa-result';
const stage = document.getElementById('duel-stage');
const resultNode = document.getElementById('round-result');
const yourTeam = document.getElementById('your-team');
const enemyTeam = document.getElementById('enemy-team');
const liveRound = document.getElementById('live-round');
const liveShot = document.getElementById('live-shot');
const shotNodes = [...document.querySelectorAll('[data-shot]')];

let roster = [];
let qaRound = 70;

function post(type, detail = {}) {
  if (window.parent === window) return;
  window.parent.postMessage({ type: QA_RESULT, event: type, detail }, location.origin);
}

function groupByClass(rows = []) {
  const groups = new Map();
  rows.forEach(hero => {
    const key = String(hero.class_name || 'Sem classe').trim() || 'Sem classe';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(hero);
  });
  return [...groups.entries()].map(([name, heroes]) => ({ name, heroes }));
}

function distinctRows(rows = []) {
  const seen = new Set();
  return rows.filter(row => row?.id && !seen.has(row.id) && seen.add(row.id));
}

function pickMirror(groups) {
  const usable = groups.filter(group => group.heroes.length >= 2).slice(0, 3);
  if (usable.length < 3) return null;
  return {
    allies: usable.map(group => group.heroes[0]),
    enemies: usable.map(group => group.heroes[1]),
    fixture: false
  };
}

function pickTriple(groups) {
  const triple = groups.find(group => group.heroes.length >= 3);
  if (!triple) return null;
  const allies = triple.heroes.slice(0, 3);
  const blocked = new Set(allies.map(hero => hero.id));
  const enemies = distinctRows(roster.filter(hero => !blocked.has(hero.id))).slice(0, 3);
  return enemies.length === 3 ? { allies, enemies, fixture: false } : null;
}

function pickComplete(groups) {
  const distinctGroups = groups.filter(group => group.heroes.length).slice(0, 3);
  if (distinctGroups.length < 3) return null;
  const allies = distinctGroups.map(group => group.heroes[0]);
  const blocked = new Set(allies.map(hero => hero.id));
  const first = distinctGroups.find(group => group.heroes.filter(hero => !blocked.has(hero.id)).length >= 2);
  const second = distinctGroups.find(group => group !== first && group.heroes.some(hero => !blocked.has(hero.id)));
  if (!first || !second) return null;
  const enemies = [
    ...first.heroes.filter(hero => !blocked.has(hero.id)).slice(0, 2),
    ...second.heroes.filter(hero => !blocked.has(hero.id)).slice(0, 1)
  ];
  return enemies.length === 3 ? { allies, enemies, fixture: false } : null;
}

function pickPerfectChaos(groups) {
  const six = groups.filter(group => group.heroes.length).slice(0, 6);
  if (six.length >= 6) {
    return { allies: six.slice(0, 3).map(group => group.heroes[0]), enemies: six.slice(3, 6).map(group => group.heroes[0]), fixture: false };
  }
  const base = distinctRows(roster).slice(0, 6);
  if (base.length < 6) return null;
  const fixtureRows = base.map((hero, index) => ({ ...hero, class_name: `${hero.class_name || 'Classe'} · QA ${index + 1}` }));
  return { allies: fixtureRows.slice(0, 3), enemies: fixtureRows.slice(3, 6), fixture: true };
}

function pickStandard() {
  const groups = groupByClass(roster);
  const selected = [];
  let cursor = 0;
  while (selected.length < 6 && cursor < 30) {
    const group = groups[cursor % groups.length];
    const hero = group?.heroes[Math.floor(cursor / Math.max(1, groups.length))];
    if (hero && !selected.some(row => row.id === hero.id)) selected.push(hero);
    cursor += 1;
  }
  return selected.length === 6 ? { allies: selected.slice(0, 3), enemies: selected.slice(3, 6), fixture: false } : null;
}

function heroCard(hero, index) {
  const color = classColor(hero);
  const media = mediaOf(hero, 'card');
  return `<article class="hero-draw-card revealed qa-forced-card" style="--hero-color:${escapeHtml(color)}" aria-label="${escapeHtml(hero.name)}, ${escapeHtml(hero.class_name || 'sem classe')}">
    <span class="draw-index">${String(index + 1).padStart(2, '0')}</span>
    <div class="draw-media media ${media ? '' : 'empty'}" style="${mediaStyle(media, 'cover')}">${mediaInner(media, hero.name)}</div>
    <div class="draw-copy"><small>${escapeHtml(hero.class_name || 'Sem classe')}</small><strong>${escapeHtml(hero.name)}</strong></div>
  </article>`;
}

function clearGoldenRuntime() {
  const controller = window.echoArenaDiversaoGolden;
  if (controller?.clear) {
    controller.clear();
    return;
  }
  stage?.classList.remove('golden-armed', 'golden-shot');
  shotNodes.forEach(node => node.classList.remove('golden-ready', 'golden-active', 'golden-done'));
  document.querySelectorAll('.hero-draw-card.golden-reveal').forEach(card => card.classList.remove('golden-reveal'));
}

function closeTransientPresentation() {
  const overlay = document.getElementById('sealed-clash');
  overlay?.classList.remove('is-open', 'is-closing');
  document.body.classList.remove('sealed-active');
  clearGoldenRuntime();
  shotNodes.forEach(node => node.classList.remove('active'));
}

async function renderScenario(eventId = 'standard') {
  if (roster.length < 6 || !stage || !resultNode || !yourTeam || !enemyTeam) throw new Error('QA indisponível: roster ou superfície incompletos.');
  if (window.echoArenaDiversao?.isBusy?.()) throw new Error('A rodada pública ainda está em andamento. Aguarde a conclusão antes de forçar outro evento.');
  closeTransientPresentation();
  resultNode.className = 'round-result';
  resultNode.textContent = '';
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const groups = groupByClass(roster);
  const scenario = eventId === 'mirror' ? pickMirror(groups)
    : eventId === 'triple' ? pickTriple(groups)
      : eventId === 'perfect-chaos' ? pickPerfectChaos(groups)
        : eventId === 'complete' ? pickComplete(groups)
          : pickStandard();
  if (!scenario) throw new Error(`Não foi possível montar o cenário ${eventId} com o roster atual.`);

  qaRound += 1;
  yourTeam.innerHTML = scenario.allies.map((hero, index) => heroCard(hero, index)).join('');
  enemyTeam.innerHTML = scenario.enemies.map((hero, index) => heroCard(hero, index)).join('');
  liveRound.textContent = String(qaRound);
  if (liveShot) liveShot.textContent = `QA · ${eventId}`;
  stage.dataset.phase = 'complete';
  stage.dataset.qaScenario = eventId;
  resultNode.textContent = `QA administrativo · ${eventId}${scenario.fixture ? ' · fixture visual' : ' · roster real'}`;
  resultNode.className = 'round-result ready qa-ready';

  post('scenario', {
    eventId,
    fixture: scenario.fixture,
    allies: scenario.allies.map(hero => hero.name),
    enemies: scenario.enemies.map(hero => hero.name)
  });
}

async function forceGolden() {
  const runner = window.echoArenaDiversao;
  const golden = window.echoArenaDiversaoGolden;
  if (!runner?.run || !golden?.armForced) throw new Error('Câmara Dourada indisponível: o runtime público ainda não terminou de carregar.');
  if (runner.isBusy?.()) throw new Error('A rodada pública ainda está em andamento. Aguarde a conclusão antes de forçar a Câmara Dourada.');

  closeTransientPresentation();
  delete stage.dataset.qaScenario;
  resultNode.className = 'round-result';
  resultNode.textContent = '';

  const index = golden.armForced('full', 0);
  if (!Number.isInteger(index)) throw new Error('Não foi possível armar a Câmara Dourada no runtime público.');
  post('golden', { forced: true, state: 'armed', index });

  await runner.run('full');
  if (stage.dataset.phase !== 'complete') {
    golden.clear();
    throw new Error('A rodada real da Câmara Dourada não concluiu; o estado foi limpo com segurança.');
  }

  post('golden', { forced: true, state: 'complete', index });
}

async function loadRoster() {
  const { data, error } = await supabase.from('v_heroes_complete').select('*').eq('enabled', true).order('display_order', { ascending: true });
  if (error) throw error;
  roster = (data || []).map(normalizeHeroMedia).filter(hero => hero?.id && hero?.name);
  const groups = groupByClass(roster);
  post('ready', {
    roster: roster.length,
    classes: groups.map(group => ({ name: group.name, heroes: group.heroes.length })),
    perfectChaosUsesFixture: groups.length < 6
  });
}

async function handleCommand(command = {}) {
  const action = command.action || '';
  if (action === 'event') return renderScenario(command.eventId || 'standard');
  if (action === 'golden') return forceGolden();
  if (action === 'random') return window.echoArenaDiversao?.run?.('full');
  if (action === 'reset') {
    if (window.echoArenaDiversao?.isBusy?.()) throw new Error('A rodada pública está em andamento; aguarde antes de limpar o preview.');
    closeTransientPresentation();
    delete stage.dataset.qaScenario;
    post('reset');
    return;
  }
  throw new Error(`Comando QA desconhecido: ${action}`);
}

window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.data?.type !== QA_MESSAGE) return;
  Promise.resolve(handleCommand(event.data)).catch(error => post('error', { message: error?.message || String(error) }));
});

Object.defineProperty(window, 'echoArenaDiversaoQA', {
  configurable: true,
  enumerable: false,
  value: { renderScenario, forceGolden, getRoster: () => roster.slice() }
});

loadRoster().catch(error => post('error', { message: `Falha ao preparar QA: ${error?.message || error}` }));
