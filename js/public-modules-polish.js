/* Experiência compartilhada dos módulos públicos.
   Não cria conteúdo e não substitui as consultas de public-modules.js. */

const moduleKey = document.body?.dataset.publicModule || 'módulo';
const grid = document.getElementById('module-grid');
const toolbar = document.querySelector('.module-toolbar');
const search = document.getElementById('module-search');
const detail = document.getElementById('module-detail');
let refreshFrame = 0;

function setText(target, value) {
  if (target && target.textContent !== value) target.textContent = value;
}

function setHtml(target, value) {
  if (target && target.innerHTML !== value) target.innerHTML = value;
}

function setAttributeValue(target, name, value) {
  if (target && target.getAttribute(name) !== value) target.setAttribute(name, value);
}

function ensureRuntimeStrip() {
  let strip = document.getElementById('module-runtime-strip');
  if (strip) return strip;
  const hero = document.querySelector('.module-hero');
  if (!hero) return null;
  strip = document.createElement('div');
  strip.id = 'module-runtime-strip';
  strip.className = 'module-runtime-strip loading';
  strip.setAttribute('role', 'status');
  strip.setAttribute('aria-live', 'polite');
  strip.innerHTML = '<span class="module-runtime-main"><i class="module-runtime-dot"></i><span id="module-runtime-copy"><strong>Sincronizando</strong> com o banco do projeto.</span></span><span id="module-runtime-meta" class="module-runtime-meta">Dados reais</span>';
  hero.insertAdjacentElement('afterend', strip);
  return strip;
}

function countVisibleResults() {
  if (!grid) return 0;
  if (grid.querySelector('.module-empty,.module-error,.module-loading')) return 0;
  if (grid.classList.contains('tier-board')) return grid.querySelectorAll('.tier-hero').length;
  return grid.querySelectorAll(':scope > .module-card, :scope > .tier-row').length;
}

function updateRuntime() {
  const strip = ensureRuntimeStrip();
  if (!strip || !grid) return;
  const copy = strip.querySelector('#module-runtime-copy');
  const meta = strip.querySelector('#module-runtime-meta');
  const loading = Boolean(grid.querySelector('.module-loading'));
  const error = grid.querySelector('.module-error');
  const empty = grid.querySelector('.module-empty');
  const count = countVisibleResults();

  strip.classList.toggle('loading', loading);
  strip.classList.toggle('error', Boolean(error));
  strip.classList.toggle('empty', Boolean(empty) && !error);
  setAttributeValue(grid, 'aria-busy', String(loading));

  if (loading) {
    setHtml(copy, '<strong>Sincronizando</strong> dados reais do módulo.');
    setText(meta, 'Banco conectado');
    return;
  }
  if (error) {
    setHtml(copy, '<strong>Falha de sincronização.</strong> Os dados não foram substituídos por conteúdo fictício.');
    setHtml(meta, '<button class="module-runtime-retry" type="button">Tentar novamente</button>');
    const retry = meta?.querySelector('button');
    if (retry && retry.dataset.runtimeBound !== '1') {
      retry.dataset.runtimeBound = '1';
      retry.addEventListener('click', () => location.reload(), { once:true });
    }
    return;
  }
  if (empty) {
    setHtml(copy, '<strong>Módulo conectado.</strong> Ainda não há conteúdo real publicado para exibir.');
    setText(meta, 'Sem dados fictícios');
    return;
  }
  setHtml(copy, `<strong>Dados sincronizados.</strong> ${count.toLocaleString('pt-BR')} ${count === 1 ? 'resultado disponível' : 'resultados disponíveis'}.`);
  setText(meta, 'Fonte: banco do projeto');
}

function ensureSearchUX() {
  if (!search || !toolbar) return;
  const shell = search.closest('.module-search');
  if (!shell) return;
  let clear = shell.querySelector('.module-search-clear');
  if (!clear) {
    clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'module-search-clear';
    clear.setAttribute('aria-label', 'Limpar busca');
    clear.textContent = '×';
    clear.hidden = true;
    shell.appendChild(clear);
    clear.addEventListener('click', () => {
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles:true }));
      search.focus();
    });
  }
  let result = toolbar.querySelector('.module-search-result');
  if (!result) {
    result = document.createElement('span');
    result.className = 'module-search-result';
    toolbar.appendChild(result);
  }
  const sync = () => {
    clear.hidden = !search.value;
    window.setTimeout(() => {
      const count = countVisibleResults();
      setText(result, search.value ? `${count} ${count === 1 ? 'resultado' : 'resultados'}` : '');
      updateRuntime();
    }, 0);
  };
  search.addEventListener('input', sync);
  sync();
}

function enhanceEditorialDetail() {
  if (!detail || detail.hidden) return;
  const article = detail.querySelector('.article-detail');
  if (!article || article.dataset.seoPolished === '1') return;
  const heading = article.querySelector('h1')?.textContent?.trim();
  if (!heading) return;
  article.dataset.seoPolished = '1';
  document.title = `${heading} — Echo Arena`;
  const summary = [...article.querySelectorAll('p')].map(node => node.textContent?.trim()).find(Boolean) || '';
  if (summary) {
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = summary.slice(0, 180);
  }
}

function addCharacterCounter(field) {
  const max = Number(field.maxLength || 0);
  if (!max || field.nextElementSibling?.classList?.contains('composition-char-counter')) return;
  const counter = document.createElement('small');
  counter.className = 'composition-char-counter';
  const sync = () => {
    const size = String(field.value || '').length;
    setText(counter, `${size}/${max}`);
    counter.classList.toggle('near-limit', size >= Math.floor(max * .9));
  };
  field.insertAdjacentElement('afterend', counter);
  field.addEventListener('input', sync);
  sync();
}

function enhanceCompositionForm() {
  const form = document.getElementById('composition-form');
  if (!form || form.dataset.uxPolished === '1') return;
  form.dataset.uxPolished = '1';
  form.querySelectorAll('input[maxlength],textarea[maxlength]').forEach(addCharacterCounter);

  const selects = [...form.querySelectorAll('.composition-hero-select')];
  const button = form.querySelector('button[type="submit"]');
  const readiness = document.createElement('div');
  readiness.className = 'composition-readiness warn';
  readiness.setAttribute('aria-live', 'polite');
  const formMessage = document.getElementById('composition-form-message');
  formMessage?.insertAdjacentElement('beforebegin', readiness);

  const sync = () => {
    const values = selects.map(select => select.value).filter(Boolean);
    const complete = values.length === 3;
    const distinct = new Set(values).size === values.length;
    const ready = complete && distinct;
    form.dataset.ready = String(ready);
    readiness.classList.toggle('ok', ready);
    readiness.classList.toggle('warn', !ready);
    if (!complete) setText(readiness, `Selecione os ${3 - values.length} herói(s) restante(s) para completar o trio.`);
    else if (!distinct) setText(readiness, 'Cada posição precisa usar um herói diferente.');
    else setText(readiness, 'Trio válido. O salvamento será confirmado em uma única transação no banco.');
    if (button) setAttributeValue(button, 'aria-disabled', String(!ready));
  };
  selects.forEach(select => select.addEventListener('change', sync));
  form.addEventListener('echo:composition-selection-change', sync);
  sync();
}

function applyAccessibility() {
  setAttributeValue(grid, 'aria-live', 'polite');
  setAttributeValue(document.getElementById('synergy-grid'), 'aria-live', 'polite');
  document.querySelectorAll('.module-card-action').forEach(link => {
    if (link instanceof HTMLAnchorElement && !link.getAttribute('aria-label')) {
      const cardTitle = link.closest('.module-card')?.querySelector('h3')?.textContent?.trim();
      if (cardTitle) link.setAttribute('aria-label', `${link.textContent.trim()} ${cardTitle}`);
    }
  });
}

function refreshExperience() {
  updateRuntime();
  enhanceEditorialDetail();
  enhanceCompositionForm();
  applyAccessibility();
}

function scheduleRefresh() {
  if (refreshFrame) return;
  refreshFrame = window.requestAnimationFrame(() => {
    refreshFrame = 0;
    refreshExperience();
  });
}

ensureRuntimeStrip();
ensureSearchUX();
refreshExperience();

/*
  Observe somente a área em que public-modules.js troca os resultados.
  O callback atualiza status/ARIA fora da árvore de filhos observada e não
  pode realimentar o próprio observer. Nunca ampliar este alvo para
  .module-shell, document.body ou document.documentElement.
*/
if (grid && typeof MutationObserver === 'function') {
  const observer = new MutationObserver(scheduleRefresh);
  observer.observe(grid, { childList:true, subtree:true });
}

document.addEventListener('echo:content-applied', scheduleRefresh);
window.addEventListener('pageshow', scheduleRefresh);
