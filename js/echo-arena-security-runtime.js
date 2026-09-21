// EchoArena — browser defense-in-depth runtime.
// This does not replace server-side authorization/RLS. It blocks unsafe navigation
// schemes, hardens target=_blank, and prevents Admin UI from rendering in a frame.

const SAFE_EXTERNAL_PROTOCOLS = new Set(['https:', 'mailto:', 'tel:']);
const ADMIN_PATH = /(?:^|\/)admin(?:\/|$)/.test(location.pathname);

function hardenAnchor(anchor) {
  if (!(anchor instanceof HTMLAnchorElement)) return;

  if (anchor.target === '_blank') {
    const rel = new Set(String(anchor.rel || '').split(/\s+/).filter(Boolean));
    rel.add('noopener');
    rel.add('noreferrer');
    anchor.rel = [...rel].join(' ');
  }

  const raw = anchor.getAttribute('href');
  if (!raw || raw.startsWith('#')) return;

  try {
    const parsed = new URL(raw, document.baseURI);
    if (parsed.origin === location.origin) return;
    if (!SAFE_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
      anchor.removeAttribute('href');
      anchor.dataset.echoSecurityBlockedHref = 'true';
    }
  } catch {
    anchor.removeAttribute('href');
    anchor.dataset.echoSecurityBlockedHref = 'true';
  }
}

function hardenTree(root) {
  if (root instanceof HTMLAnchorElement) hardenAnchor(root);
  if (root instanceof Element || root instanceof Document || root instanceof DocumentFragment) {
    root.querySelectorAll?.('a[href],a[target="_blank"]').forEach(hardenAnchor);
  }
}

if (ADMIN_PATH && window.top !== window.self) {
  // HTTP frame-ancestors cannot be configured per-page on GitLab.com Pages.
  // Fail closed in the UI as a secondary anti-clickjacking barrier.
  document.documentElement.replaceChildren();
  throw new Error('ADMIN_FRAME_BLOCKED');
}

hardenTree(document);
new MutationObserver(records => {
  for (const record of records) {
    for (const node of record.addedNodes) hardenTree(node);
  }
}).observe(document.documentElement, { childList: true, subtree: true });
