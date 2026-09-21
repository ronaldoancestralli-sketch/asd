import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';

const PAGE_KEY = 'global_announcement';
const STYLE_VERSION = '20260822-maintenance-2';
const VARIANT_LABELS = {
  maintenance: 'Manutenção',
  attention: 'Atenção',
  promotion: 'Promoção',
  thanks: 'Agradecimento'
};

let refreshTimer = null;
let boundaryTimer = null;
let lastRefresh = 0;
let snapshot = null;

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function announcementVariantLabel(value = 'maintenance') {
  return VARIANT_LABELS[value] || VARIANT_LABELS.maintenance;
}

export function formatAnnouncementDate(value) {
  const date = value instanceof Date ? value : validDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(date);
}

export function evaluateAnnouncementState(row, now = new Date()) {
  const content = row?.content && typeof row.content === 'object' ? row.content : {};
  const variant = ['maintenance', 'attention', 'promotion', 'thanks'].includes(content.variant)
    ? content.variant
    : 'maintenance';
  const startsAt = validDate(content.starts_at);
  const endsAt = validDate(content.ends_at);
  const message = String(content.message || '').trim();
  const accessMode = ['banner_only', 'maintenance_lock'].includes(content.access_mode)
    ? content.access_mode
    : 'banner_only';
  const base = { content, variant, accessMode, startsAt, endsAt, message };

  if (!row) return { ...base, state: 'missing', active: false, label: 'Nenhum banner configurado' };
  if (row.published === false || content.enabled !== true) {
    return { ...base, state: 'disabled', active: false, label: accessMode === 'maintenance_lock' ? 'Manutenção desativada' : 'Banner desativado' };
  }
  if (!message || (accessMode === 'maintenance_lock' && (variant !== 'maintenance' || (content.starts_at && !startsAt) || !endsAt || (startsAt && startsAt >= endsAt)))) {
    return { ...base, state: 'incomplete', active: false, label: accessMode === 'maintenance_lock' ? 'Manutenção incompleta' : 'Banner incompleto' };
  }
  if (startsAt && now < startsAt) {
    return { ...base, state: 'scheduled', active: false, label: accessMode === 'maintenance_lock' ? 'Manutenção programada' : 'Banner agendado' };
  }
  if (endsAt && now >= endsAt) {
    return { ...base, state: 'expired', active: false, label: accessMode === 'maintenance_lock' ? 'Manutenção encerrada' : 'Período encerrado' };
  }
  return { ...base, state: 'active', active: true, label: accessMode === 'maintenance_lock' ? 'Manutenção ativa' : 'Banner ativo no site' };
}

function ensureStylesheet() {
  if (document.querySelector('link[data-admin-announcement-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.dataset.adminAnnouncementStyle = 'true';
  link.href = new URL(`../css/admin-announcement.css?v=${STYLE_VERSION}`, import.meta.url).href;
  document.head.appendChild(link);
}

function installStrip() {
  const topbar = document.querySelector('.admin-shell-topbar');
  if (!topbar || document.getElementById('admin-site-operation-strip')) return;
  const strip = document.createElement('a');
  strip.id = 'admin-site-operation-strip';
  strip.className = 'admin-site-operation-strip';
  strip.href = './site-content.html?page=global_announcement';
  strip.hidden = true;
  strip.setAttribute('aria-live', 'polite');
  strip.innerHTML = '<span class="admin-site-operation-pulse" aria-hidden="true"></span><span class="admin-site-operation-copy"><strong></strong><small></small></span><span class="admin-site-operation-action">Abrir Central de Avisos →</span>';
  topbar.insertAdjacentElement('afterend', strip);
}

function bannerDetail(banner) {
  const type = announcementVariantLabel(banner.variant);
  const maintenanceLock = banner.accessMode === 'maintenance_lock';
  if (banner.state === 'scheduled') return maintenanceLock
    ? `Manutenção completa · bloqueia visitantes em ${formatAnnouncementDate(banner.startsAt)} e reabre em ${formatAnnouncementDate(banner.endsAt)}.`
    : `${type} · começa em ${formatAnnouncementDate(banner.startsAt)}.`;
  if (banner.state !== 'active') return '';
  if (maintenanceLock) return `Visitantes bloqueados até ${formatAnnouncementDate(banner.endsAt)}; administradores continuam com acesso.`;
  if (banner.variant === 'maintenance') {
    const end = banner.endsAt ? ` Encerramento: ${formatAnnouncementDate(banner.endsAt)}.` : '';
    return `Aviso de manutenção visível; o site permanece online.${end}`;
  }
  const end = banner.endsAt ? ` · encerra em ${formatAnnouncementDate(banner.endsAt)}` : '';
  return `${type} visível para os visitantes${end}.`;
}

function renderStrip(next) {
  const strip = document.getElementById('admin-site-operation-strip');
  if (!strip) return;
  const { banner, maintenanceMode, manualMaintenanceMode, scheduledMaintenanceMode } = next;
  const unavailable = !next.bannerAvailable || !next.maintenanceAvailable;
  const show = unavailable || maintenanceMode || banner.state === 'active' || banner.state === 'scheduled';
  strip.hidden = !show;
  if (!show) return;

  let tone = banner.state === 'scheduled' ? 'scheduled' : banner.variant;
  let title = banner.label;
  let detail = bannerDetail(banner);
  if (unavailable) {
    tone = 'unavailable';
    title = 'Status do site não confirmado';
    detail = 'Não foi possível confirmar banner e manutenção. Abra a Central antes de publicar.';
  } else if (maintenanceMode) {
    tone = 'critical';
    title = manualMaintenanceMode ? 'Bloqueio emergencial ativo' : 'Site em manutenção programada';
    detail = scheduledMaintenanceMode
      ? bannerDetail(banner)
      : 'O bloqueio emergencial está ligado. Administradores continuam com acesso.';
  } else if (banner.state === 'active' && banner.variant === 'maintenance') {
    title = 'Aviso de manutenção ativo';
  }
  strip.dataset.tone = tone;
  strip.querySelector('strong').textContent = title;
  strip.querySelector('small').textContent = detail;
}

function renderSidebar(next) {
  const link = document.querySelector('[data-menu-id="announcements"]');
  const badge = link?.querySelector('em');
  if (!link || !badge) return;
  const { banner, maintenanceMode, manualMaintenanceMode } = next;
  const unavailable = !next.bannerAvailable || !next.maintenanceAvailable;
  link.dataset.announcementState = unavailable ? 'unavailable' : maintenanceMode ? 'critical' : banner.state;
  badge.textContent = unavailable
    ? 'Verificar status'
    : maintenanceMode
    ? manualMaintenanceMode ? 'Emergência ativa' : 'Manutenção ativa'
    : banner.state === 'active'
      ? 'Ativo agora'
      : banner.state === 'scheduled'
        ? 'Agendado'
        : 'Acesso rápido';
}

function renderDashboard(next) {
  const card = document.querySelector('.dashboard-announcement-card');
  const quick = document.querySelector('.dashboard-announcement-quick');
  if (!card && !quick) return;
  const { banner, maintenanceMode, manualMaintenanceMode, scheduledMaintenanceMode } = next;
  const unavailable = !next.bannerAvailable || !next.maintenanceAvailable;
  const tone = unavailable ? 'unavailable' : maintenanceMode ? 'critical' : banner.state === 'active' ? banner.variant : banner.state;
  const title = unavailable
    ? 'Status do banner indisponível'
    : maintenanceMode
    ? manualMaintenanceMode ? 'Bloqueio emergencial ativo' : 'Site em manutenção'
    : banner.state === 'active'
      ? banner.variant === 'maintenance' ? 'Aviso de manutenção ativo' : 'Banner ativo no site'
      : banner.state === 'scheduled'
        ? banner.accessMode === 'maintenance_lock' ? 'Manutenção programada' : 'Banner agendado'
        : 'Central de Avisos';
  const detail = unavailable
    ? 'O Admin não conseguiu confirmar o banner ou o modo de manutenção. Confira antes de publicar.'
    : maintenanceMode
    ? scheduledMaintenanceMode
      ? bannerDetail(banner)
      : 'O bloqueio emergencial está ligado. Abra as Configurações Gerais para reativar o site.'
    : banner.state === 'active'
      ? bannerDetail(banner)
      : banner.state === 'scheduled'
        ? bannerDetail(banner)
        : 'Crie, edite, agende ou desative os banners exibidos no topo do site.';

  if (card) {
    card.dataset.announcementState = tone;
    const kicker = card.querySelector('.dashboard-announcement-copy span');
    const heading = card.querySelector('.dashboard-announcement-copy h3');
    const paragraph = card.querySelector('.dashboard-announcement-copy p');
    if (kicker) kicker.textContent = maintenanceMode ? 'Operação do site' : 'Comunicação global';
    if (heading) heading.textContent = title;
    if (paragraph) paragraph.textContent = detail;
    let status = card.querySelector('.dashboard-announcement-status');
    if (!status) {
      status = document.createElement('b');
      status.className = 'dashboard-announcement-status';
      card.querySelector('.dashboard-announcement-copy')?.prepend(status);
    }
    status.textContent = unavailable ? 'Confirmação necessária' : maintenanceMode ? manualMaintenanceMode ? 'Emergência ativa' : 'Manutenção ativa' : banner.label;
  }
  if (quick) {
    quick.dataset.announcementState = tone;
    const titleNode = quick.querySelector('strong');
    const detailNode = quick.querySelector('span');
    const actionNode = quick.querySelector('small');
    if (titleNode) titleNode.textContent = title;
    if (detailNode) detailNode.textContent = detail;
    if (actionNode) actionNode.textContent = banner.state === 'active' || maintenanceMode ? 'Conferir agora' : 'Gerenciar banners';
  }
}

function scheduleBoundary(next) {
  if (boundaryTimer) clearTimeout(boundaryTimer);
  const now = Date.now();
  const future = [next.banner.startsAt, next.banner.endsAt]
    .filter(Boolean)
    .map(date => date.getTime())
    .filter(time => time > now)
    .sort((a, b) => a - b)[0];
  if (!future) return;
  boundaryTimer = setTimeout(() => refreshAnnouncementAwareness(), Math.min(future - now + 250, 2147483000));
}

function maintenanceFlag(data) {
  const row = Array.isArray(data) ? data[0] : data;
  return row?.maintenance_mode === true;
}

export async function refreshAnnouncementAwareness(client = supabase) {
  let announcementResult;
  let maintenanceResult;
  try {
    [announcementResult, maintenanceResult] = await Promise.all([
      client.from('site_pages').select('content,published,updated_at').eq('page_key', PAGE_KEY).maybeSingle(),
      client.rpc('site_status')
    ]);
  } catch (error) {
    announcementResult = { data: null, error };
    maintenanceResult = { data: null, error };
  }
  const bannerAvailable = !announcementResult.error;
  const maintenanceAvailable = !maintenanceResult.error;
  if (!bannerAvailable) console.warn('[admin-announcement] banner indisponível:', announcementResult.error.message);
  if (!maintenanceAvailable) console.warn('[admin-announcement] manutenção indisponível:', maintenanceResult.error.message);

  const banner = evaluateAnnouncementState(bannerAvailable ? announcementResult.data : null);
  const manualMaintenanceMode = maintenanceAvailable ? maintenanceFlag(maintenanceResult.data) : false;
  const scheduledMaintenanceMode = banner.active && banner.accessMode === 'maintenance_lock';
  snapshot = {
    banner,
    manualMaintenanceMode,
    scheduledMaintenanceMode,
    maintenanceMode: manualMaintenanceMode || scheduledMaintenanceMode,
    bannerAvailable,
    maintenanceAvailable,
    checkedAt: new Date()
  };
  lastRefresh = Date.now();
  renderStrip(snapshot);
  renderSidebar(snapshot);
  renderDashboard(snapshot);
  scheduleBoundary(snapshot);
  window.dispatchEvent(new CustomEvent('echo:announcement-status', { detail: snapshot }));
  return snapshot;
}

export function getAnnouncementSnapshot() {
  return snapshot;
}

export async function initAdminAnnouncementAwareness({ client = supabase } = {}) {
  ensureStylesheet();
  installStrip();
  if (!window.EchoAdminAnnouncementStatus) {
    window.EchoAdminAnnouncementStatus = {
      refresh: () => refreshAnnouncementAwareness(client),
      get snapshot() { return getAnnouncementSnapshot(); }
    };
    window.addEventListener('focus', () => {
      if (Date.now() - lastRefresh > 15000) refreshAnnouncementAwareness(client);
    });
    window.addEventListener('echo:announcement-saved', () => refreshAnnouncementAwareness(client));
    refreshTimer = setInterval(() => refreshAnnouncementAwareness(client), 60000);
  }
  return refreshAnnouncementAwareness(client);
}
