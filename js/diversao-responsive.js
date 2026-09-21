/* Diversão — reforço estrutural responsivo do Confronto Selado */
const sealedOverlay = document.getElementById('sealed-clash');

if (sealedOverlay) {
  const title = sealedOverlay.querySelector('.sealed-title');
  const eventBadge = sealedOverlay.querySelector('.sealed-event-badge');

  if (title && eventBadge && eventBadge.parentElement !== title) {
    title.appendChild(eventBadge);
  }

  sealedOverlay.dataset.responsiveLayout = 'v2';
}

if (!document.querySelector('link[data-diversao-audit-v19]')) {
  const auditCss = document.createElement('link');
  auditCss.rel = 'stylesheet';
  auditCss.href = './css/diversao-audit-v19.css?v=20260827-diversao-audit-v19-1';
  auditCss.dataset.diversaoAuditV19 = 'true';
  document.head.appendChild(auditCss);
}

await import('./diversao-runtime-guard-v19.js?v=20260827-diversao-audit-v19-1');

const qaEnabled = new URLSearchParams(location.search).has('qa') || window.parent !== window;
if (qaEnabled) await import('./diversao-qa-isolated-v21.js?v=20260827-diversao-ios-isolation-v21-1&sb=20260823-security-supabase-pin-1&ops=20260905&sc=20260906-1&eq=20260907-effects-1');
