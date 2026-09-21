/* Echo Arena — cockpit visual da comparação. Espelha valores já produzidos pela tela; não recalcula nada. */
const $ = id => document.getElementById(id);

function text(id, fallback = '—') {
  const value = $(id)?.textContent?.trim();
  return value || fallback;
}

function sourceTone() {
  const node = $('source-context');
  if (!node) return 'warn';
  if (node.classList.contains('live')) return 'live';
  if (node.classList.contains('error')) return 'error';
  return 'warn';
}

function ensureCockpit() {
  if (document.querySelector('.compare-intelligence')) return document.querySelector('.compare-intelligence');
  const context = document.querySelector('.context-strip');
  if (!context) return null;

  const panel = document.createElement('section');
  panel.className = 'compare-intelligence';
  panel.setAttribute('aria-label', 'Resumo da comparação');
  panel.innerHTML = `
    <article class="compare-intel-cell" id="ci-hero"><span class="ci-icon">♟</span><div><small>Herói em análise</small><strong id="ci-hero-value">—</strong></div></article>
    <article class="compare-intel-cell" id="ci-source"><span class="ci-icon">◎</span><div><small>Origem dos dados</small><strong id="ci-source-value">Sincronizando</strong></div></article>
    <article class="compare-intel-cell" id="ci-opponent"><span class="ci-icon">◇</span><div><small>Build comparada</small><strong id="ci-opponent-value">—</strong></div></article>
    <article class="compare-intel-cell" id="ci-score"><span class="ci-icon">↗</span><div><small>Placar atual</small><strong id="ci-score-value">—</strong></div></article>`;
  context.insertAdjacentElement('afterend', panel);
  return panel;
}

function syncCockpit() {
  const panel = ensureCockpit();
  if (!panel) return;

  $('ci-hero-value').textContent = text('comparison-hero-name');
  $('ci-source-value').textContent = text('data-source', 'Sincronizando');
  $('ci-opponent-value').textContent = text('community-name');

  const mine = text('mine-wins');
  const ties = text('ties');
  const community = text('community-wins');
  const contentVisible = [...document.querySelectorAll('[data-comparison-content]')].some(node => !node.hidden);
  $('ci-score-value').textContent = contentVisible ? `${mine} suas · ${ties} iguais · ${community} comunidade` : 'Aguardando comparação';

  const tone = sourceTone();
  $('ci-source').dataset.tone = tone;
  $('ci-score').dataset.tone = tone === 'error' ? 'error' : (contentVisible ? 'live' : 'warn');
  $('ci-hero').dataset.tone = text('comparison-hero-name') === '—' ? 'warn' : 'live';
  $('ci-opponent').dataset.tone = text('community-name') === '—' ? 'warn' : 'live';
}

function observe(ids) {
  ids.forEach(id => {
    const node = $(id);
    if (!node) return;
    new MutationObserver(syncCockpit).observe(node, { childList: true, subtree: true, characterData: true, attributes: true });
  });
}

function decorateStage() {
  document.querySelector('.comparison-stage')?.classList.add('comparison-stage-premium');
  document.querySelector('.stats-panel')?.classList.add('stats-panel-premium');
  document.querySelector('.result-summary')?.classList.add('result-summary-premium');
}

ensureCockpit();
decorateStage();
syncCockpit();
observe(['comparison-hero-name','data-source','community-name','mine-wins','ties','community-wins','comparison-state','source-context']);

document.addEventListener('click', event => {
  if (event.target.closest('#build-selector,[data-filter],#change-my-build')) requestAnimationFrame(syncCockpit);
});
