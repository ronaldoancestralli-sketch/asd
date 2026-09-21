import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import './public-account-surface-v3.js?v=20260826-global-account-v3-1&sb=20260823-security-supabase-pin-1';
import { PUBLIC_RELEASE_MANIFEST } from './public-release-manifest.js?v=20260830-release-057-1&ops=20260905&sc=20260906-1&eq=20260907-effects-1';

const BANNER_ID = 'echo-beta-banner';
const STYLE_ID = 'echo-beta-banner-style';
const VERSION_PAGE = 'versions';
const CODE_VERSION = PUBLIC_RELEASE_MANIFEST.find(release => release?.published !== false)?.version || '0.5.7-beta';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = new URL('../css/public-beta-banner.css?v=20260822-beta-1', import.meta.url).href;
  document.head.appendChild(link);
}

function versionCore(value='') {
  const match=String(value).trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function newerVersion(a,b) {
  const av=versionCore(a), bv=versionCore(b);
  if(!av) return b;
  if(!bv) return a;
  for(let i=0;i<3;i+=1){if(av[i]!==bv[i])return av[i]>bv[i]?a:b;}
  return a;
}

function bannerMarkup(version = CODE_VERSION) {
  return `
    <div class="echo-beta-inner">
      <div class="echo-beta-copy">
        <span class="echo-beta-mark"><i></i>BETA</span>
        <div class="echo-beta-message"><strong>Acesso antecipado · Em desenvolvimento.</strong> Recursos, dados e visuais do Echo Arena podem evoluir durante esta fase.</div>
      </div>
      <a class="echo-beta-version" href="./versoes.html" aria-label="Abrir histórico público de versões"><span>Versão atual</span>${escapeHtml(version)} →</a>
    </div>`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
}

function targetHeader() {
  return document.querySelector('.echo-public-topbar, .topbar, .module-topbar, header[role="banner"]');
}

function placeBanner() {
  ensureStyle();
  let banner = document.getElementById(BANNER_ID);
  if (!banner) {
    banner = document.createElement('aside');
    banner.id = BANNER_ID;
    banner.className = 'echo-beta-banner';
    banner.setAttribute('aria-label', 'Aviso de acesso Beta');
    banner.innerHTML = bannerMarkup();
  }

  const header = targetHeader();
  if (header?.parentNode) {
    if (banner.previousElementSibling !== header) header.insertAdjacentElement('afterend', banner);
    banner.dataset.placement = 'header';
  } else if (!banner.isConnected && document.body) {
    document.body.prepend(banner);
    banner.dataset.placement = 'fallback';
  }
  return banner;
}

async function loadCurrentVersion() {
  try {
    const { data, error } = await supabase
      .from('site_pages')
      .select('content,published')
      .eq('page_key', VERSION_PAGE)
      .eq('published', true)
      .maybeSingle();
    if (error) throw error;
    const cmsVersion=String(data?.content?.current_version || '').trim();
    return newerVersion(CODE_VERSION,cmsVersion || CODE_VERSION);
  } catch (error) {
    console.warn('[beta-banner] versão pública indisponível:', error.message);
    return CODE_VERSION;
  }
}

async function boot() {
  const banner = placeBanner();
  const version = await loadCurrentVersion();
  if (banner) banner.innerHTML = bannerMarkup(version);

  const observer = new MutationObserver(() => placeBanner());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 12000);
}

if (!window.__echoBetaBannerBooted) {
  window.__echoBetaBannerBooted = true;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}

export { placeBanner as mountBetaBanner };
