import './public-beta-banner.js?v=20260822-beta-1&sb=20260823-security-supabase-pin-1&ops=20260905&sc=20260906-1&eq=20260907-effects-1';

export const PUBLIC_NAVIGATION_GROUPS = {
  explore: [
    ['inicio', '⌂', 'Início', 'Página principal da arena', './index.html'],
    ['herois', '♟', 'Heróis', 'Lista, funções e atributos', './herois.html'],
    ['builds', '◇', 'Builds', 'Monte e analise sua configuração', './criar-build.html'],
    ['comparar', '⇄', 'Comparar', 'Compare sua build com as mais votadas', './comparar-build.html'],
    ['equipamentos', '✣', 'Equipamentos', 'Itens, raridades e status', './equipamentos.html'],
    ['estatisticas', '⌁', 'Estatísticas', 'Dados atuais da comunidade', './estatisticas.html'],
    ['classes', '◆', 'Classes', 'Funções e estilos de combate', './classes.html'],
    ['composicoes', '◉', 'Composições', 'Estratégias para equipes 3×3', './composicoes.html'],
    ['tier-list', '★', 'Tier List', 'Ranking competitivo de heróis', './tier-list.html']
  ],
  community: [
    ['community', '◉', 'Comunidade', 'Discussões reais entre jogadores', './comunidade.html'],
    ['noticias', '◫', 'Echo Pulse', 'Radar editorial em preparação', './noticias.html', 'Em breve'],
    ['versoes', '↻', 'Versões & evolução', 'Notas públicas de cada atualização', './versoes.html'],
    ['sobre', '◎', 'Sobre o Echo Arena', 'Propósito, Beta e transparência', './sobre.html']
  ],
  support: [
    ['contato', '✉', 'Contate-nos', 'Dúvidas, sugestões e parcerias', './suporte.html?tipo=contato'],
    ['problema', '!', 'Reportar problema', 'Informe erros encontrados no site', './suporte.html?tipo=problema']
  ]
};

function resolvedActiveId(activeId) {
  if (activeId !== 'suporte') return activeId;
  return new URLSearchParams(location.search).get('tipo') === 'problema'
    ? 'problema'
    : 'contato';
}

export function publicNavigationItems() {
  return Object.values(PUBLIC_NAVIGATION_GROUPS).flat().map(item => {
    const [id, icon, label, description, href, comingSoon, external] = item;
    return { id, icon, label, description, href, comingSoon, external };
  });
}

function linkMarkup(item, activeId) {
  const [id, icon, label, description, href, comingSoon, external] = item;
  const classes = ['sidebar-link'];
  if (id === resolvedActiveId(activeId)) classes.push('active');
  if (external) classes.push('external');

  const attributes = [
    `class="${classes.join(' ')}"`,
    `href="${href}"`,
    comingSoon ? `data-coming-soon="${comingSoon}"` : '',
    external ? 'target="_blank" rel="noopener noreferrer"' : ''
  ].filter(Boolean).join(' ');

  const badge = comingSoon
    ? '<span class="sidebar-badge">Em breve</span>'
    : external
      ? '<span class="sidebar-badge">Abrir ↗</span>'
      : '';

  return `<a ${attributes}><span class="sidebar-link-icon">${icon}</span><span><strong>${label}</strong><small>${description}</small></span>${badge}</a>`;
}

function section(label, items, activeId, ariaLabel) {
  return `<section class="sidebar-section"><div class="sidebar-label">${label}</div><nav class="sidebar-links" aria-label="${ariaLabel}">${items.map(item => linkMarkup(item, activeId)).join('')}</nav></section>`;
}

function echoLinkMarkup(item, activeId) {
  const [id, icon, label, description, href, comingSoon, external] = item;
  const classes = ['echo-public-drawer-link'];
  if (id === resolvedActiveId(activeId)) classes.push('on');
  if (external) classes.push('external');

  const attributes = [
    `class="${classes.join(' ')}"`,
    `href="${href}"`,
    comingSoon ? `data-coming-soon="${comingSoon}"` : '',
    external ? 'target="_blank" rel="noopener noreferrer"' : ''
  ].filter(Boolean).join(' ');

  const badge = comingSoon
    ? '<span class="echo-public-drawer-badge">Em breve</span>'
    : external
      ? '<span class="echo-public-drawer-badge">Abrir ↗</span>'
      : '';

  return `<a ${attributes}><i>${icon}</i><span><strong>${label}</strong><small>${description}</small></span>${badge}</a>`;
}

function echoSection(label, items, activeId, ariaLabel) {
  return `<section class="echo-public-drawer-section"><div class="echo-public-drawer-label">${label}</div><nav class="echo-public-drawer-links" aria-label="${ariaLabel}">${items.map(item => echoLinkMarkup(item, activeId)).join('')}</nav></section>`;
}

export function echoDrawerMarkup(activeId = '') {
  return [
    echoSection('Explorar', PUBLIC_NAVIGATION_GROUPS.explore, activeId, 'Explorar Echo Arena'),
    echoSection('Conteúdo e comunidade', PUBLIC_NAVIGATION_GROUPS.community, activeId, 'Conteúdo e comunidade'),
    echoSection('Ajuda e suporte', PUBLIC_NAVIGATION_GROUPS.support, activeId, 'Ajuda e suporte'),
    '<section class="echo-public-drawer-section"><div class="echo-public-drawer-news"><div class="echo-public-drawer-news-kicker">Versão Beta</div><h3>A arena está evoluindo</h3><p>Acompanhe mudanças relevantes no histórico público de versões, sem precisar sair do Echo Arena.</p><a href="./versoes.html">Ver Versões &amp; Evolução →</a></div></section>'
  ].join('');
}

export function syncPublicNavigation(activeId = '') {
  const container = document.querySelector('#site-sidebar .sidebar-scroll');
  if (!container) return;

  container.innerHTML = [
    section('Explorar', PUBLIC_NAVIGATION_GROUPS.explore, activeId, 'Explorar Echo Arena'),
    section('Conteúdo e comunidade', PUBLIC_NAVIGATION_GROUPS.community, activeId, 'Conteúdo e comunidade'),
    section('Ajuda e suporte', PUBLIC_NAVIGATION_GROUPS.support, activeId, 'Ajuda e suporte'),
    `<section class="sidebar-section"><div class="sidebar-news"><div class="sidebar-news-kicker">Versão Beta</div><h3>A arena está evoluindo</h3><p>Acompanhe mudanças relevantes no histórico público de versões, sem precisar sair do Echo Arena.</p><a href="./versoes.html">Ver Versões & Evolução →</a></div></section>`
  ].join('');
}
