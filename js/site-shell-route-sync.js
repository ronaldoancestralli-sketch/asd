const ROUTES = new Map([
  ['Heróis', './herois.html'],
  ['Classes', './classes.html'],
  ['Builds', './criar-build.html'],
  ['Equipamentos', './equipamentos.html'],
  ['Estatísticas', './index.html#site-stats'],
  ['Composições', './composicoes.html'],
  ['Tier List', './tier-list.html'],
  ['Notícias', './noticias.html']
]);

function cleanLabel(anchor) {
  const clone = anchor.cloneNode(true);
  clone.querySelectorAll('.ic').forEach(node => node.remove());
  return String(clone.textContent || '').replace(/\s+/g, ' ').trim();
}

function ensureSideItem(nav, { label, href, icon, afterLabel }) {
  if ([...nav.querySelectorAll('a')].some(anchor => cleanLabel(anchor) === label)) return;
  const item = document.createElement('a');
  item.href = href;
  item.innerHTML = `<span class="ic">${icon}</span>${label}`;
  const after = [...nav.querySelectorAll('a')].find(anchor => cleanLabel(anchor) === afterLabel);
  if (after?.nextSibling) nav.insertBefore(item, after.nextSibling);
  else nav.appendChild(item);
}

export function syncSiteShellRoutes() {
  const main = document.querySelector('.mainnav');
  const side = document.querySelector('.snav');
  if (!main && !side) return false;

  [main, side].filter(Boolean).forEach(nav => {
    nav.querySelectorAll('a').forEach(anchor => {
      const label = cleanLabel(anchor);
      const href = ROUTES.get(label);
      if (href) anchor.setAttribute('href', href);
    });
  });

  if (side) {
    ensureSideItem(side, { label: 'Classes', href: './classes.html', icon: '◆', afterLabel: 'Heróis' });
    ensureSideItem(side, { label: 'Comparar', href: './comparar-build.html', icon: '⇄', afterLabel: 'Builds' });
  }

  return true;
}

if (!syncSiteShellRoutes()) {
  const observer = new MutationObserver(() => {
    if (syncSiteShellRoutes()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 8000);
}
