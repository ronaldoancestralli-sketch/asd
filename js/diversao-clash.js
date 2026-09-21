import { analyzeRound, pickCaptainIndex } from './diversao-events.js';

const resultNode = document.getElementById('round-result');
const allyCardsNode = document.getElementById('your-team');
const enemyCardsNode = document.getElementById('enemy-team');
const liveRoundNode = document.getElementById('live-round');
const matchStateNode = document.getElementById('match-state');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (resultNode && allyCardsNode && enemyCardsNode) {
  const overlay = document.createElement('section');
  overlay.id = 'sealed-clash';
  overlay.className = 'sealed-clash';
  overlay.dataset.event = 'standard';
  overlay.setAttribute('aria-live', 'polite');
  overlay.setAttribute('aria-atomic', 'true');
  overlay.setAttribute('aria-label', 'Confronto selado');
  overlay.innerHTML = `
    <div class="sealed-shell">
      <div class="sealed-frame" aria-hidden="true"></div>
      <div class="sealed-event-badge" data-sealed-event-badge hidden></div>
      <header class="sealed-title">
        <small data-sealed-kicker>Todos os seis heróis foram revelados</small>
        <h2 data-sealed-title>Confronto selado</h2>
      </header>

      <div class="sealed-battle">
        <section class="sealed-team ally" aria-label="Seu esquadrão">
          <div class="sealed-portraits" data-sealed-ally-portraits></div>
          <div class="sealed-team-copy">
            <small>Lado da arena</small>
            <h3>Seu esquadrão</h3>
            <p class="sealed-captain-line">Capitão · <b data-sealed-ally-captain>—</b></p>
            <p class="sealed-names" data-sealed-ally-names></p>
            <p class="sealed-classes" data-sealed-ally-classes></p>
          </div>
        </section>

        <div class="sealed-center">
          <div class="sealed-impact" aria-hidden="true"></div>
          <div class="sealed-shards" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
          <strong class="sealed-vs" aria-hidden="true">VS</strong>
          <span class="sealed-scale">3 × 3</span>
          <div class="sealed-personality">
            <small>Personalidade da rodada</small>
            <strong data-sealed-personality>Sinais cruzados</strong>
            <p data-sealed-personality-note></p>
          </div>
          <p class="sealed-round">RODADA <b data-sealed-round>00</b> · <i>6 HERÓIS ÚNICOS</i></p>
        </div>

        <section class="sealed-team enemy" aria-label="Time inimigo">
          <div class="sealed-portraits" data-sealed-enemy-portraits></div>
          <div class="sealed-team-copy">
            <small>Resposta da arena</small>
            <h3>Time inimigo</h3>
            <p class="sealed-captain-line">Capitão · <b data-sealed-enemy-captain>—</b></p>
            <p class="sealed-names" data-sealed-enemy-names></p>
            <p class="sealed-classes" data-sealed-enemy-classes></p>
          </div>
        </section>

        <div class="sealed-energy" aria-hidden="true"></div>
      </div>

      <div class="sealed-weapon-ghost" aria-hidden="true">
        <img src="./assets/diversao/revolver-32.svg?v=20260821-weapon-1" alt="">
      </div>

      <footer class="sealed-footer"><span><b>Echo Randomizer</b> · toque para continuar</span></footer>
    </div>`;

  document.body.appendChild(overlay);

  const allyPortraits = overlay.querySelector('[data-sealed-ally-portraits]');
  const enemyPortraits = overlay.querySelector('[data-sealed-enemy-portraits]');
  const allyNames = overlay.querySelector('[data-sealed-ally-names]');
  const enemyNames = overlay.querySelector('[data-sealed-enemy-names]');
  const allyClasses = overlay.querySelector('[data-sealed-ally-classes]');
  const enemyClasses = overlay.querySelector('[data-sealed-enemy-classes]');
  const allyCaptain = overlay.querySelector('[data-sealed-ally-captain]');
  const enemyCaptain = overlay.querySelector('[data-sealed-enemy-captain]');
  const roundLabel = overlay.querySelector('[data-sealed-round]');
  const titleNode = overlay.querySelector('[data-sealed-title]');
  const kickerNode = overlay.querySelector('[data-sealed-kicker]');
  const eventBadge = overlay.querySelector('[data-sealed-event-badge]');
  const personalityNode = overlay.querySelector('[data-sealed-personality]');
  const personalityNote = overlay.querySelector('[data-sealed-personality-note]');

  let closeTimer = 0;
  let openTimer = 0;
  let lastRound = '';
  let openedAt = 0;

  function readCard(card) {
    return {
      name: card.querySelector('.draw-copy strong')?.textContent?.trim() || 'Herói',
      className: card.querySelector('.draw-copy small')?.textContent?.trim() || 'Sem classe',
      media: card.querySelector('.draw-media')
    };
  }

  function buildPortrait(card, index) {
    const data = readCard(card);
    const portrait = document.createElement('article');
    portrait.className = 'sealed-portrait';
    portrait.style.setProperty('--sealed-slot', String(index + 1));

    if (data.media) {
      const media = data.media.cloneNode(true);
      media.removeAttribute('id');
      media.querySelectorAll?.('[id]').forEach(node => node.removeAttribute('id'));
      portrait.appendChild(media);
    }

    const tag = document.createElement('div');
    tag.className = 'sealed-hero-tag';
    const classNode = document.createElement('small');
    classNode.textContent = data.className;
    const nameNode = document.createElement('strong');
    nameNode.textContent = data.name;
    tag.append(classNode, nameNode);
    portrait.appendChild(tag);
    return { portrait, data };
  }

  function renderTeam(source, target, namesTarget, classesTarget) {
    const cards = [...source.querySelectorAll('.hero-draw-card.revealed')].slice(0, 3);
    target.replaceChildren();
    const rows = cards.map((card, index) => buildPortrait(card, index));
    rows.forEach(row => target.appendChild(row.portrait));
    namesTarget.textContent = rows.map(row => row.data.name).join(' · ');
    classesTarget.textContent = rows.map(row => row.data.className).join(' · ');
    return rows;
  }

  function markCaptain(rows, index, target) {
    rows.forEach(row => row.portrait.classList.remove('is-captain'));
    const selected = rows[index];
    if (!selected) {
      target.textContent = '—';
      return null;
    }

    selected.portrait.classList.add('is-captain');
    const badge = document.createElement('span');
    badge.className = 'sealed-captain-badge';
    badge.textContent = 'Capitão';
    selected.portrait.appendChild(badge);
    target.textContent = selected.data.name;
    return selected.data;
  }

  function applyAnalysis(analysis) {
    const event = analysis.primaryEvent;
    const personality = analysis.personality;

    overlay.dataset.event = event?.id || 'standard';
    overlay.dataset.personality = personality.id;
    titleNode.textContent = event?.label || 'Confronto selado';
    kickerNode.textContent = event?.kicker || 'Todos os seis heróis foram revelados';
    personalityNode.textContent = personality.label;
    personalityNote.textContent = personality.description;

    if (event) {
      eventBadge.hidden = false;
      eventBadge.textContent = event.description;
      eventBadge.dataset.tone = event.tone || 'cyan';
    } else {
      eventBadge.hidden = true;
      eventBadge.textContent = '';
      delete eventBadge.dataset.tone;
    }

    if (matchStateNode) {
      matchStateNode.textContent = event ? `${event.label} · ${personality.label}` : personality.label;
      matchStateNode.dataset.roundEvent = event?.id || 'standard';
    }
  }

  function closeOverlay(immediate = false) {
    window.clearTimeout(closeTimer);
    window.clearTimeout(openTimer);
    if (!overlay.classList.contains('is-open') && !overlay.classList.contains('is-closing')) return;

    if (immediate || reduceMotion) {
      overlay.classList.remove('is-open', 'is-closing');
      document.body.classList.remove('sealed-active');
      return;
    }

    overlay.classList.add('is-closing');
    overlay.classList.remove('is-open');
    window.setTimeout(() => {
      overlay.classList.remove('is-closing');
      document.body.classList.remove('sealed-active');
    }, 360);
  }

  function openOverlay() {
    const allyRows = renderTeam(allyCardsNode, allyPortraits, allyNames, allyClasses);
    const enemyRows = renderTeam(enemyCardsNode, enemyPortraits, enemyNames, enemyClasses);
    if (allyRows.length !== 3 || enemyRows.length !== 3) return;

    const round = liveRoundNode?.textContent?.trim() || '00';
    const analysis = analyzeRound(
      allyRows.map(row => row.data),
      enemyRows.map(row => row.data)
    );
    const allyCaptainIndex = pickCaptainIndex(allyRows);
    const enemyCaptainIndex = pickCaptainIndex(enemyRows);
    const allyCaptainData = markCaptain(allyRows, allyCaptainIndex, allyCaptain);
    const enemyCaptainData = markCaptain(enemyRows, enemyCaptainIndex, enemyCaptain);

    roundLabel.textContent = round;
    lastRound = round;
    openedAt = performance.now();
    applyAnalysis(analysis);

    overlay.classList.remove('is-closing', 'is-open');
    void overlay.offsetWidth;
    document.body.classList.add('sealed-active');
    overlay.classList.add('is-open');

    document.dispatchEvent(new CustomEvent('echoarena:diversao-round-analysis', {
      detail: {
        round,
        allies: allyRows.map(row => ({ name: row.data.name, className: row.data.className })),
        enemies: enemyRows.map(row => ({ name: row.data.name, className: row.data.className })),
        captains: {
          ally: allyCaptainData ? { name: allyCaptainData.name, className: allyCaptainData.className, index: allyCaptainIndex } : null,
          enemy: enemyCaptainData ? { name: enemyCaptainData.name, className: enemyCaptainData.className, index: enemyCaptainIndex } : null
        },
        analysis
      }
    }));

    closeTimer = window.setTimeout(() => closeOverlay(false), reduceMotion ? 1700 : 5150);
  }

  function scheduleOverlay() {
    const round = liveRoundNode?.textContent?.trim() || '';
    if (!resultNode.classList.contains('ready') || !round || round === lastRound) return;
    window.clearTimeout(openTimer);
    openTimer = window.setTimeout(openOverlay, reduceMotion ? 60 : 360);
  }

  const observer = new MutationObserver(() => {
    if (resultNode.classList.contains('ready')) scheduleOverlay();
    else closeOverlay(true);
  });
  observer.observe(resultNode, { attributes: true, attributeFilter: ['class'], childList: true, characterData: true, subtree: true });

  overlay.addEventListener('click', () => {
    if (performance.now() - openedAt > 650) closeOverlay(false);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeOverlay(false);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) closeOverlay(true);
  });
}
