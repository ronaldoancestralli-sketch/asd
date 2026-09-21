import { classIconSymbol, classIconTokens } from '../../js/class-icons.js?v=1';

const list = document.getElementById('classes-list');

function ensureDatalist() {
  if (document.getElementById('class-icon-tokens')) return;
  const datalist = document.createElement('datalist');
  datalist.id = 'class-icon-tokens';
  datalist.innerHTML = classIconTokens.map(token => `<option value="${token}"></option>`).join('');
  document.body.appendChild(datalist);
}

function enhanceAdminClassIcons() {
  if (!list) return;
  ensureDatalist();

  list.querySelectorAll('[data-icon-text]').forEach(input => {
    input.setAttribute('list', 'class-icon-tokens');
    input.title = 'Tokens existentes: swords, radar, crosshair, target, shield. Também é possível usar um símbolo curto.';

    const id = input.dataset.iconText;
    const preview = list.querySelector(`[data-preview-icon="${CSS.escape(id)}"]`);
    if (!preview) return;

    const raw = input.value.trim();
    const visual = classIconSymbol(raw);
    if (preview.textContent !== visual) preview.textContent = visual;
    preview.title = raw ? `Token salvo: ${raw}` : 'Sem token de ícone';
  });
}

if (list) {
  const observer = new MutationObserver(enhanceAdminClassIcons);
  observer.observe(list, { childList: true, subtree: true, characterData: true });
  list.addEventListener('input', event => {
    if (event.target.closest('[data-icon-text]')) queueMicrotask(enhanceAdminClassIcons);
  });
  enhanceAdminClassIcons();
}
