import { classIconSymbol } from './class-icons.js?v=1';

const grid = document.getElementById('module-grid');

function setAttributeIfChanged(element, name, value) {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

function enhanceClassCards() {
  if (!grid) return;

  grid.querySelectorAll('.class-card').forEach(card => {
    const icon = card.querySelector('.class-icon');
    if (icon) {
      const token = icon.dataset.iconToken || icon.textContent.trim();
      if (icon.dataset.iconToken !== token) icon.dataset.iconToken = token;
      const visual = classIconSymbol(token);
      if (icon.textContent !== visual) icon.textContent = visual;
      setAttributeIfChanged(icon, 'title', token ? `Ícone: ${token}` : 'Ícone da classe');
      setAttributeIfChanged(icon, 'aria-label', token ? `Ícone da classe: ${token}` : 'Ícone da classe');
    }

    const footer = card.querySelector('.module-card-footer');
    const slug = footer?.querySelector('span')?.textContent?.trim() || '';
    const action = footer?.querySelector('.module-card-action');
    if (slug && action) {
      if (card.dataset.classSlug !== slug) card.dataset.classSlug = slug;
      const href = `./herois.html?classe=${encodeURIComponent(slug)}`;
      if (action.getAttribute('href') !== href) action.setAttribute('href', href);
      const label = 'Ver heróis da classe →';
      if (action.textContent !== label) action.textContent = label;
    }
  });
}

if (grid) {
  const observer = new MutationObserver(enhanceClassCards);
  observer.observe(grid, { childList: true, subtree: true });
  enhanceClassCards();
}
