import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';

const PAGE_KEY = 'global_announcement';
const BANNER_ID = 'echo-global-announcement';
const STYLE_ID = 'echo-global-announcement-style';
const STORAGE_PREFIX = 'echo-global-announcement-dismissed:';
const VARIANTS = new Set(['maintenance', 'attention', 'promotion', 'thanks']);
let scheduleTimer = null;

const VARIANT_DEFAULTS = {
  maintenance: { label: 'Manutenção programada', icon: 'clock' },
  attention: { label: 'Atenção', icon: 'alert' },
  promotion: { label: 'Destaque da Arena', icon: 'spark' },
  thanks: { label: 'Obrigado!', icon: 'heart' }
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
}

function safeHref(value = '') {
  const href = String(value).trim();
  return /^(https?:\/\/|mailto:|\/|\.\/|\.\.\/|#)/i.test(href) ? href : '';
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isInsidePublicationWindow(content = {}) {
  const now = Date.now();
  const startsAt = validDate(content.starts_at);
  const endsAt = validDate(content.ends_at);
  if (startsAt && now < startsAt.getTime()) return false;
  if (endsAt && now >= endsAt.getTime()) return false;
  return true;
}

function scheduleBoundaryRefresh(content = {}) {
  if (scheduleTimer) window.clearTimeout(scheduleTimer);
  const now = Date.now();
  const candidates = [validDate(content.starts_at), validDate(content.ends_at)]
    .filter(Boolean)
    .map(date => date.getTime())
    .filter(time => time > now)
    .sort((a, b) => a - b);
  if (!candidates.length) return;
  const delay = Math.min(candidates[0] - now + 150, 2147483000);
  scheduleTimer = window.setTimeout(loadAnnouncement, delay);
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = new URL('../css/public-global-announcement.css?v=20260822-maintenance-2', import.meta.url).href;
  document.head.appendChild(link);
}

function iconMarkup(name) {
  const paths = {
    clock: '<circle cx="12" cy="12" r="8"></circle><path d="M12 7v5l3 2"></path><path d="M5 3 3 5M19 3l2 2"></path>',
    alert: '<path d="M12 3 2.8 20h18.4L12 3Z"></path><path d="M12 9v5M12 17h.01"></path>',
    spark: '<path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z"></path><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"></path>',
    heart: '<path d="M20.8 5.8c-2-2-5.2-2-7.2 0L12 7.4l-1.6-1.6a5.1 5.1 0 0 0-7.2 7.2L12 21l8.8-8a5.1 5.1 0 0 0 0-7.2Z"></path>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.alert}</svg>`;
}

function announcementKey(content, updatedAt = '') {
  const source = [content.variant, content.label, content.message, content.cta_label, updatedAt].join('|');
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${STORAGE_PREFIX}${(hash >>> 0).toString(36)}`;
}

function wasDismissed(key) {
  try { return localStorage.getItem(key) === '1'; } catch (_) { return false; }
}

function rememberDismissal(key) {
  try { localStorage.setItem(key, '1'); } catch (_) { /* armazenamento pode estar indisponível */ }
}

function targetHeader() {
  return document.querySelector('.echo-public-topbar, .topbar, .module-topbar, header[role="banner"]');
}

function placeBanner(banner) {
  const header = targetHeader();
  if (header?.parentNode) {
    if (header.previousElementSibling !== banner) header.insertAdjacentElement('beforebegin', banner);
    banner.dataset.placement = 'header';
  } else if (!banner.isConnected && document.body) {
    document.body.prepend(banner);
    banner.dataset.placement = 'fallback';
  }
}

function bannerMarkup(content, variant) {
  const defaults = VARIANT_DEFAULTS[variant];
  const label = String(content.label || defaults.label).trim();
  const message = String(content.message || '').trim();
  const ctaLabel = String(content.cta_label || '').trim();
  const ctaHref = safeHref(content.cta_url);
  const dismissible = content.access_mode !== 'maintenance_lock' && content.dismissible !== false;
  const hasCta = Boolean(ctaLabel && ctaHref);

  return `
    <div class="echo-announcement-inner${hasCta ? ' has-cta' : ''}">
      <div class="echo-announcement-heading">
        <span class="echo-announcement-icon">${iconMarkup(defaults.icon)}</span>
        <strong>${escapeHtml(label)}</strong>
      </div>
      <p>${escapeHtml(message)}</p>
      <div class="echo-announcement-actions">
        ${hasCta ? `<a href="${escapeHtml(ctaHref)}">${escapeHtml(ctaLabel)}</a>` : ''}
        ${dismissible ? '<button type="button" aria-label="Fechar aviso"><span aria-hidden="true">×</span></button>' : ''}
      </div>
    </div>`;
}

function mountAnnouncement(content, updatedAt) {
  const variant = VARIANTS.has(content.variant) ? content.variant : 'maintenance';
  const message = String(content.message || '').trim();
  const maintenanceLock = content.access_mode === 'maintenance_lock';
  if (content.enabled !== true || !message || !isInsidePublicationWindow(content)
      || (maintenanceLock && (variant !== 'maintenance' || !validDate(content.ends_at)))) {
    document.getElementById(BANNER_ID)?.remove();
    return null;
  }

  const key = announcementKey(content, updatedAt);
  if (!maintenanceLock && content.dismissible !== false && wasDismissed(key)) return null;

  ensureStyle();
  let banner = document.getElementById(BANNER_ID);
  if (!banner) {
    banner = document.createElement('aside');
    banner.id = BANNER_ID;
    banner.className = 'echo-global-announcement';
  }
  banner.dataset.variant = variant;
  banner.setAttribute('role', variant === 'maintenance' || variant === 'attention' ? 'alert' : 'status');
  banner.setAttribute('aria-live', variant === 'maintenance' || variant === 'attention' ? 'assertive' : 'polite');
  banner.setAttribute('aria-label', String(content.label || VARIANT_DEFAULTS[variant].label));
  banner.innerHTML = bannerMarkup(content, variant);

  banner.querySelector('button')?.addEventListener('click', () => {
    rememberDismissal(key);
    banner.remove();
  }, { once: true });

  placeBanner(banner);
  const observer = new MutationObserver(() => placeBanner(banner));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 12000);
  return banner;
}

async function loadAnnouncement() {
  try {
    const { data, error } = await supabase
      .from('site_pages')
      .select('content,published,updated_at')
      .eq('page_key', PAGE_KEY)
      .eq('published', true)
      .maybeSingle();
    if (error) throw error;
    if (!data?.content) return null;
    scheduleBoundaryRefresh(data.content);
    return mountAnnouncement(data.content, data.updated_at);
  } catch (error) {
    console.warn('[global-announcement] aviso público indisponível:', error.message);
    return null;
  }
}

if (!window.__echoGlobalAnnouncementBooted) {
  window.__echoGlobalAnnouncementBooted = true;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadAnnouncement, { once: true });
  else loadAnnouncement();
}

export { loadAnnouncement, mountAnnouncement };
