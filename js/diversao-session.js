const roundResult = document.getElementById('round-result');
const matchIntel = document.getElementById('match-intel');
const yourTeam = document.getElementById('your-team');
const enemyTeam = document.getElementById('enemy-team');
const stage = document.getElementById('duel-stage');
const STORAGE_KEY = 'echoarena:diversao:history:v1';
const HISTORY_LIMIT = 5;

if (roundResult && matchIntel && yourTeam && enemyTeam) {
  let latestRound = null;
  let history = loadHistory();

  const actions = document.createElement('section');
  actions.className = 'fun-round-actions';
  actions.hidden = true;
  actions.setAttribute('aria-label', 'Próximas ações da rodada');
  actions.innerHTML = `
    <header>
      <div><small>O tambor continua</small><strong>Qual é a próxima?</strong></div>
      <span data-action-status>Escolha como continuar</span>
    </header>
    <div class="fun-action-grid">
      <button type="button" data-diversao-mode="full"><b>↻</b><span><strong>Novo 3 × 3</strong><small>Refaz os dois lados</small></span></button>
      <button type="button" data-diversao-mode="rematch"><b>⚡</b><span><strong>Revanche</strong><small>Mantém seu trio</small></span></button>
      <button type="button" data-diversao-mode="destiny"><b>◇</b><span><strong>Trocar meu destino</strong><small>Mantém os inimigos</small></span></button>
      <button type="button" data-round-card><b>▣</b><span><strong>Cartão da rodada</strong><small>Rever o confronto</small></span></button>
    </div>`;
  roundResult.insertAdjacentElement('afterend', actions);

  const historySection = document.createElement('section');
  historySection.className = 'fun-history';
  historySection.setAttribute('aria-labelledby', 'fun-history-title');
  historySection.innerHTML = `
    <header>
      <div><small>Registro local</small><h3 id="fun-history-title">Últimas rodadas</h3></div>
      <button type="button" data-clear-history>Limpar sessão</button>
    </header>
    <div class="fun-history-track" data-history-track></div>`;
  matchIntel.insertAdjacentElement('afterend', historySection);

  const cardOverlay = document.createElement('section');
  cardOverlay.className = 'round-card-overlay';
  cardOverlay.setAttribute('aria-hidden', 'true');
  cardOverlay.setAttribute('aria-label', 'Cartão da rodada');
  cardOverlay.innerHTML = `
    <div class="round-card-shell" role="dialog" aria-modal="true" aria-labelledby="round-card-title">
      <button type="button" class="round-card-close" data-card-close aria-label="Fechar cartão">×</button>
      <header><small data-card-kicker>Echo Randomizer</small><h2 id="round-card-title" data-card-title>Confronto selado</h2><p data-card-personality></p></header>
      <div class="round-card-battle">
        <section class="round-card-team ally"><small>Seu esquadrão</small><div data-card-allies></div><p data-card-ally-captain></p></section>
        <div class="round-card-vs"><strong>VS</strong><span>3 × 3</span><p data-card-round></p></div>
        <section class="round-card-team enemy"><small>Time inimigo</small><div data-card-enemies></div><p data-card-enemy-captain></p></section>
      </div>
      <footer><span>Gerado a partir da rodada real desta sessão.</span></footer>
    </div>`;
  document.body.appendChild(cardOverlay);

  const actionStatus = actions.querySelector('[data-action-status]');
  const historyTrack = historySection.querySelector('[data-history-track]');

  function loadHistory() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.slice(0, HISTORY_LIMIT) : [];
    } catch {
      return [];
    }
  }

  function persistHistory() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, HISTORY_LIMIT)));
    } catch (error) {
      console.warn('[diversao-session] Histórico local indisponível:', error);
    }
  }

  function mediaSnapshot(card) {
    const media = card?.querySelector('.draw-media');
    if (!media) return '';
    const clone = media.cloneNode(true);
    clone.removeAttribute('id');
    clone.querySelectorAll?.('[id]').forEach(node => node.removeAttribute('id'));
    return clone.outerHTML;
  }

  function captureTeam(container, captainName = '') {
    return [...container.querySelectorAll('.hero-draw-card.revealed')].slice(0, 3).map(card => ({
      name: card.querySelector('.draw-copy strong')?.textContent?.trim() || 'Herói',
      className: card.querySelector('.draw-copy small')?.textContent?.trim() || 'Sem classe',
      mediaHtml: mediaSnapshot(card),
      captain: card.querySelector('.draw-copy strong')?.textContent?.trim() === captainName
    }));
  }

  function modeLabel(mode) {
    if (mode === 'rematch') return 'Revanche';
    if (mode === 'destiny') return 'Destino alterado';
    return 'Novo 3 × 3';
  }

  function eventLabel(snapshot) {
    return snapshot?.analysis?.primaryEvent?.label || 'CONFRONTO SELADO';
  }

  function heroThumb(hero) {
    const item = document.createElement('article');
    item.className = `session-hero${hero.captain ? ' captain' : ''}`;
    if (hero.mediaHtml) {
      const template = document.createElement('template');
      template.innerHTML = hero.mediaHtml.trim();
      const media = template.content.firstElementChild;
      if (media) item.appendChild(media);
    }
    const copy = document.createElement('span');
    const name = document.createElement('strong');
    const klass = document.createElement('small');
    name.textContent = hero.name;
    klass.textContent = hero.className;
    copy.append(name, klass);
    item.appendChild(copy);
    if (hero.captain) {
      const badge = document.createElement('i');
      badge.textContent = 'C';
      badge.setAttribute('aria-label', 'Capitão');
      item.appendChild(badge);
    }
    return item;
  }

  function renderHistory() {
    historyTrack.replaceChildren();
    historySection.classList.toggle('has-history', history.length > 0);

    if (!history.length) {
      const empty = document.createElement('p');
      empty.className = 'fun-history-empty';
      empty.textContent = 'As rodadas desta sessão aparecerão aqui.';
      historyTrack.appendChild(empty);
      return;
    }

    history.forEach(entry => {
      const card = document.createElement('article');
      card.className = 'fun-history-card';
      card.dataset.round = entry.round;

      const head = document.createElement('header');
      const title = document.createElement('div');
      const small = document.createElement('small');
      const strong = document.createElement('strong');
      small.textContent = `Rodada ${entry.round} · ${modeLabel(entry.mode)}`;
      strong.textContent = entry.analysis?.personality?.label || 'Sinais cruzados';
      title.append(small, strong);
      const event = document.createElement('span');
      event.textContent = eventLabel(entry);
      head.append(title, event);

      const duel = document.createElement('div');
      duel.className = 'fun-history-duel';
      const ally = document.createElement('div');
      ally.className = 'history-team ally';
      entry.allies.forEach(hero => ally.appendChild(heroThumb(hero)));
      const vs = document.createElement('b');
      vs.textContent = 'VS';
      const enemy = document.createElement('div');
      enemy.className = 'history-team enemy';
      entry.enemies.forEach(hero => enemy.appendChild(heroThumb(hero)));
      duel.append(ally, vs, enemy);

      card.append(head, duel);
      card.addEventListener('click', () => openCard(entry));
      historyTrack.appendChild(card);
    });
  }

  function setActionsBusy(value) {
    actions.querySelectorAll('button').forEach(button => {
      button.disabled = value;
    });
    actionStatus.textContent = value ? 'Tambor em movimento' : 'Escolha como continuar';
  }

  function snapshotRound(detail) {
    const current = window.echoArenaDiversao?.getCurrentMatch?.();
    const allyCaptain = detail.captains?.ally?.name || '';
    const enemyCaptain = detail.captains?.enemy?.name || '';
    const goldenIndex = Number(stage?.dataset?.goldenChamber);

    return {
      round: String(detail.round || current?.round || '00'),
      mode: current?.mode || 'full',
      analysis: detail.analysis || null,
      captains: detail.captains || { ally: null, enemy: null },
      goldenChamber: Number.isInteger(goldenIndex) && goldenIndex >= 0 ? goldenIndex : null,
      allies: captureTeam(yourTeam, allyCaptain),
      enemies: captureTeam(enemyTeam, enemyCaptain)
    };
  }

  function saveSnapshot(snapshot) {
    latestRound = snapshot;
    history = [snapshot, ...history.filter(item => String(item.round) !== String(snapshot.round))].slice(0, HISTORY_LIMIT);
    persistHistory();
    renderHistory();
    actions.hidden = false;
    setActionsBusy(false);
  }

  function buildCardTeam(target, rows) {
    target.replaceChildren();
    rows.forEach(hero => {
      const portrait = heroThumb(hero);
      portrait.classList.add('round-card-hero');
      target.appendChild(portrait);
    });
  }

  function openCard(snapshot = latestRound) {
    if (!snapshot) return;
    const event = snapshot.analysis?.primaryEvent;
    cardOverlay.querySelector('[data-card-kicker]').textContent = event?.kicker || 'Echo Randomizer · confronto definido';
    cardOverlay.querySelector('[data-card-title]').textContent = event?.label || 'Confronto selado';
    cardOverlay.querySelector('[data-card-personality]').textContent = snapshot.analysis?.personality ? `${snapshot.analysis.personality.label} · ${snapshot.analysis.personality.description}` : '';
    cardOverlay.querySelector('[data-card-round]').textContent = `RODADA ${snapshot.round} · ${modeLabel(snapshot.mode)}`;
    cardOverlay.querySelector('[data-card-ally-captain]').textContent = snapshot.captains?.ally?.name ? `CAPITÃO · ${snapshot.captains.ally.name}` : '';
    cardOverlay.querySelector('[data-card-enemy-captain]').textContent = snapshot.captains?.enemy?.name ? `CAPITÃO · ${snapshot.captains.enemy.name}` : '';
    buildCardTeam(cardOverlay.querySelector('[data-card-allies]'), snapshot.allies);
    buildCardTeam(cardOverlay.querySelector('[data-card-enemies]'), snapshot.enemies);
    cardOverlay.classList.add('is-open');
    cardOverlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('round-card-active');
  }

  function closeCard() {
    cardOverlay.classList.remove('is-open');
    cardOverlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('round-card-active');
  }

  actions.addEventListener('click', event => {
    const modeButton = event.target.closest('[data-diversao-mode]');
    if (modeButton) {
      const mode = modeButton.dataset.diversaoMode || 'full';
      if (window.echoArenaDiversao?.isBusy?.()) return;
      setActionsBusy(true);
      window.echoArenaDiversao?.run?.(mode);
      return;
    }

    if (event.target.closest('[data-round-card]')) openCard();
  });

  historySection.addEventListener('click', event => {
    if (!event.target.closest('[data-clear-history]')) return;
    history = [];
    latestRound = null;
    persistHistory();
    renderHistory();
  });

  cardOverlay.addEventListener('click', event => {
    if (event.target === cardOverlay || event.target.closest('[data-card-close]')) closeCard();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && cardOverlay.classList.contains('is-open')) closeCard();
  });

  document.addEventListener('echoarena:diversao-round-analysis', event => {
    saveSnapshot(snapshotRound(event.detail || {}));
  });

  document.addEventListener('echoarena:diversao-round-complete', () => {
    setActionsBusy(true);
  });

  renderHistory();
}
