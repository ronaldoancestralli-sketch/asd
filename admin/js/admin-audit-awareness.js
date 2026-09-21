import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';

const AUDIT_URL = './equipment-audit.html';

function isDashboard() {
  const file = location.pathname.split('/').pop()?.toLowerCase() || 'index.html';
  return file === 'index.html' || file === '';
}

function isAuditPage() {
  return location.pathname.toLowerCase().endsWith('/equipment-audit.html');
}

function ensureStyles() {
  if (document.getElementById('admin-audit-awareness-style')) return;
  const style = document.createElement('style');
  style.id = 'admin-audit-awareness-style';
  style.textContent = `
    .admin-audit-nav{position:relative;display:flex;align-items:center;gap:9px;padding-right:42px!important;border-color:rgba(139,92,246,.3)!important}.admin-audit-nav::before{content:'✓';display:grid;place-items:center;width:22px;height:22px;border-radius:50%;border:1px solid currentColor;color:#86efac;font-size:11px}.admin-audit-nav.has-pending{border-color:rgba(251,113,133,.5)!important;background:linear-gradient(90deg,rgba(127,29,29,.12),transparent)!important}.admin-audit-nav.has-pending::before{content:'!';color:#fda4af}.admin-audit-nav.has-external:not(.has-pending){border-color:rgba(251,191,36,.45)!important;background:linear-gradient(90deg,rgba(120,83,8,.1),transparent)!important}.admin-audit-nav.has-external:not(.has-pending)::before{content:'i';color:#fde68a}.admin-audit-nav-badge{position:absolute;right:10px;top:50%;transform:translateY(-50%);min-width:24px;height:24px;padding:0 6px;display:grid;place-items:center;border-radius:999px;background:#7f1d1d;color:#fff;font-size:9px;font-weight:900}.admin-audit-nav.has-external:not(.has-pending) .admin-audit-nav-badge{background:#76591c}.admin-audit-nav-badge[hidden]{display:none!important}
    .admin-audit-topbar{position:relative;display:inline-flex;align-items:center;gap:8px;min-height:42px;padding:8px 12px;border:1px solid #334155;border-radius:12px;background:#0b1424;color:#cbd5e1;text-decoration:none;font-size:10px;font-weight:800;white-space:nowrap}.admin-audit-topbar.has-pending{border-color:#7f1d1d;background:rgba(127,29,29,.13);color:#fecdd3}.admin-audit-topbar.has-external:not(.has-pending){border-color:#76591c;background:rgba(120,83,8,.12);color:#fde68a}.admin-audit-topbar.is-unavailable{border-color:#76591c;background:rgba(120,83,8,.12);color:#fde68a}.admin-audit-topbar-icon{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;border:1px solid currentColor;font-size:12px}.admin-audit-topbar-count{min-width:20px;height:20px;padding:0 5px;display:grid;place-items:center;border-radius:999px;background:#7f1d1d;color:white;font-size:8px;font-weight:900}.admin-audit-topbar.has-external:not(.has-pending) .admin-audit-topbar-count{background:#76591c}.admin-audit-topbar-count[hidden]{display:none!important}
    .dashboard-audit-button{position:relative;border-color:rgba(139,92,246,.45)!important;background:linear-gradient(135deg,rgba(109,40,217,.18),rgba(8,21,37,.95))!important}.dashboard-audit-button.has-pending{border-color:rgba(248,113,113,.5)!important;background:linear-gradient(135deg,rgba(127,29,29,.22),rgba(109,40,217,.14))!important}.dashboard-audit-button.has-external:not(.has-pending){border-color:#76591c!important;background:linear-gradient(135deg,rgba(120,83,8,.14),rgba(8,21,37,.96))!important}.dashboard-audit-button.is-unavailable{border-color:#76591c!important}
    .dashboard-audit-alert{position:relative;overflow:hidden;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:14px;align-items:center;padding:17px 18px;border:1px solid #7f1d1d;border-radius:14px;background:linear-gradient(135deg,rgba(127,29,29,.18),rgba(8,21,37,.96));box-shadow:0 16px 44px rgba(0,0,0,.18)}.dashboard-audit-alert::before{content:'';position:absolute;inset:0 0 auto;height:3px;background:#fb7185}.dashboard-audit-alert.external{border-color:#76591c;background:linear-gradient(135deg,rgba(120,83,8,.15),rgba(8,21,37,.96))}.dashboard-audit-alert.external::before{background:#fbbf24}.dashboard-audit-alert-icon{width:44px;height:44px;display:grid;place-items:center;border:1px solid #fb7185;border-radius:50%;color:#fda4af;background:rgba(127,29,29,.14);font-size:22px}.dashboard-audit-alert.external .dashboard-audit-alert-icon{border-color:#fbbf24;color:#fde68a;background:rgba(120,83,8,.14)}.dashboard-audit-alert-copy strong{display:block;color:#fff;font-size:14px}.dashboard-audit-alert-copy span{display:block;margin-top:4px;color:#aeb9c9;font-size:10px;line-height:1.55}.dashboard-audit-alert .admin-button{white-space:nowrap}.dashboard-audit-alert[hidden]{display:none!important}
    @media(max-width:900px){.admin-audit-topbar{min-width:42px;padding:7px}.admin-audit-topbar-label{display:none}.admin-audit-topbar-count{position:absolute;right:-4px;top:-4px}.dashboard-audit-alert{grid-template-columns:auto 1fr}.dashboard-audit-alert .admin-button{grid-column:1/-1;width:100%;justify-content:center}}
  `;
  document.head.appendChild(style);
}

function installSidebarLink() {
  if (document.getElementById('admin-audit-nav')) return;
  const link = document.querySelector('[data-menu-id="equipment-audit"]');
  if (!link) return;
  link.id = 'admin-audit-nav';
  link.classList.add('admin-audit-nav');
  link.classList.toggle('is-active', isAuditPage());
  const badge = document.createElement('span');
  badge.id = 'admin-audit-nav-badge';
  badge.className = 'admin-audit-nav-badge';
  badge.hidden = true;
  badge.textContent = '0';
  link.appendChild(badge);
}

function installTopbarIndicator() {
  const topbar = document.querySelector('.admin-shell-topbar');
  const user = document.querySelector('.admin-shell-user');
  if (!topbar || !user || document.getElementById('admin-audit-topbar')) return;
  const link = document.createElement('a');
  link.id = 'admin-audit-topbar';
  link.href = AUDIT_URL;
  link.className = 'admin-audit-topbar';
  link.innerHTML = '<span id="admin-audit-topbar-icon" class="admin-audit-topbar-icon">✓</span><span class="admin-audit-topbar-label">Auditoria</span><span id="admin-audit-topbar-count" class="admin-audit-topbar-count" hidden>0</span>';
  topbar.insertBefore(link, user);
}

function installDashboardEntry() {
  if (!isDashboard()) return;
  const actions = document.querySelector('.dashboard-welcome-actions');
  if (actions && !document.getElementById('dashboard-audit-button')) {
    const link = document.createElement('a');
    link.id = 'dashboard-audit-button';
    link.href = AUDIT_URL;
    link.className = 'admin-button dashboard-audit-button';
    link.textContent = 'Auditoria de dados';
    actions.appendChild(link);
  }
  const welcome = document.querySelector('.dashboard-welcome');
  if (welcome && !document.getElementById('dashboard-audit-alert')) {
    const alert = document.createElement('section');
    alert.id = 'dashboard-audit-alert';
    alert.className = 'dashboard-audit-alert';
    alert.hidden = true;
    alert.setAttribute('aria-live', 'polite');
    alert.innerHTML = '<div id="dashboard-audit-alert-icon" class="dashboard-audit-alert-icon">!</div><div class="dashboard-audit-alert-copy"><strong id="dashboard-audit-alert-title"></strong><span id="dashboard-audit-alert-text"></span></div><a class="admin-button" href="./equipment-audit.html">Abrir Auditoria</a>';
    welcome.insertAdjacentElement('afterend', alert);
  }
}

async function loadState() {
  const { data, error } = await supabase
    .from('equipment_audit_queue')
    .select('equipment_id,issue_type,severity,normalized_key')
    .eq('status', 'pending');
  if (error) throw error;

  const rows = data || [];
  const externalRows = rows.filter(row => row.issue_type === 'external_data_required');
  const correctionRows = rows.filter(row => row.issue_type !== 'external_data_required');
  const externalRules = new Set(externalRows.map(row => `${row.equipment_id}|${row.normalized_key || row.issue_type}`));

  return {
    available: true,
    correctionCount: correctionRows.length,
    correctionEquipmentCount: new Set(correctionRows.map(row => String(row.equipment_id))).size,
    externalOccurrenceCount: externalRows.length,
    externalRuleCount: externalRules.size,
    externalEquipmentCount: new Set(externalRows.map(row => String(row.equipment_id))).size
  };
}

function renderState(state) {
  const available = state?.available !== false;
  const corrections = state?.correctionCount || 0;
  const correctionEquipments = state?.correctionEquipmentCount || 0;
  const externalOccurrences = state?.externalOccurrenceCount || 0;
  const externalRules = state?.externalRuleCount || 0;
  const externalEquipments = state?.externalEquipmentCount || 0;
  const hasCorrections = available && corrections > 0;
  const hasExternal = available && externalRules > 0;
  const displayedCount = hasCorrections ? corrections : externalRules;

  const nav = document.getElementById('admin-audit-nav');
  const navBadge = document.getElementById('admin-audit-nav-badge');
  nav?.classList.toggle('has-pending', hasCorrections);
  nav?.classList.toggle('has-external', hasExternal);
  if (navBadge) { navBadge.textContent = String(displayedCount); navBadge.hidden = !displayedCount; }

  const topbar = document.getElementById('admin-audit-topbar');
  const topbarIcon = document.getElementById('admin-audit-topbar-icon');
  const topbarCount = document.getElementById('admin-audit-topbar-count');
  topbar?.classList.toggle('has-pending', hasCorrections);
  topbar?.classList.toggle('has-external', hasExternal);
  topbar?.classList.toggle('is-unavailable', !available);
  if (topbarIcon) topbarIcon.textContent = !available ? '?' : hasCorrections ? '!' : hasExternal ? 'i' : '✓';
  if (topbarCount) { topbarCount.textContent = String(displayedCount); topbarCount.hidden = !displayedCount; }
  if (topbar) topbar.title = !available
    ? 'Não foi possível consultar a Auditoria agora'
    : hasCorrections
      ? `${corrections} correção(ões) necessária(s)${hasExternal ? ` · ${externalRules} efeito(s) aguardando dados oficiais` : ''}`
      : hasExternal
        ? `${externalRules} efeito(s) aguardando dados oficiais — nenhuma correção exigida`
        : 'Auditoria sem pendências';

  const button = document.getElementById('dashboard-audit-button');
  button?.classList.toggle('has-pending', hasCorrections);
  button?.classList.toggle('has-external', hasExternal);
  button?.classList.toggle('is-unavailable', !available);
  if (button) button.textContent = !available
    ? 'Auditoria · verificar status'
    : hasCorrections
      ? `Auditoria · ${corrections} correção${corrections === 1 ? '' : 'ões'}`
      : hasExternal
        ? `Auditoria · ${externalRules} dado${externalRules === 1 ? '' : 's'} oficial${externalRules === 1 ? '' : 'is'} pendente${externalRules === 1 ? '' : 's'}`
        : 'Auditoria de dados';

  const alert = document.getElementById('dashboard-audit-alert');
  const icon = document.getElementById('dashboard-audit-alert-icon');
  const title = document.getElementById('dashboard-audit-alert-title');
  const text = document.getElementById('dashboard-audit-alert-text');
  if (!alert) return;

  alert.hidden = available && !hasCorrections && !hasExternal;
  alert.classList.toggle('external', available && !hasCorrections && hasExternal);

  if (!available) {
    if (icon) icon.textContent = '?';
    if (title) title.textContent = 'Não foi possível verificar a Auditoria';
    if (text) text.textContent = 'O Dashboard não conseguiu consultar o banco de auditoria. Abra a ferramenta antes de continuar o trabalho.';
  } else if (hasCorrections) {
    if (icon) icon.textContent = '!';
    if (title) title.textContent = 'Correções necessárias na Auditoria';
    if (text) text.textContent = `${correctionEquipments} equipamento(s) possui(em) ${corrections} problema(s) que exigem ação da equipe.${hasExternal ? ` Separadamente, ${externalRules} efeito(s) em ${externalEquipments} equipamento(s) aguardam dados oficiais do jogo e não contam como erro.` : ''}`;
  } else if (hasExternal) {
    if (icon) icon.textContent = 'i';
    if (title) title.textContent = 'Efeitos aguardando dados oficiais';
    if (text) text.textContent = `${externalEquipments} equipamento(s) possui(em) ${externalRules} efeito(s) conhecido(s) sem base pública suficiente para cálculo (${externalOccurrences} ocorrência(s) entre raridades). Nenhuma correção é exigida da equipe.`;
  }
}

async function refreshAuditState() {
  try { renderState(await loadState()); }
  catch (error) {
    console.warn('[admin-audit-awareness] Não foi possível consultar a Auditoria.', error);
    renderState({ available: false });
  }
}

export async function initAdminAuditAwareness() {
  ensureStyles();
  installSidebarLink();
  installTopbarIndicator();
  installDashboardEntry();
  await refreshAuditState();
  if (!window.__adminAuditAwarenessBound) {
    window.__adminAuditAwarenessBound = true;
    window.addEventListener('focus', refreshAuditState);
    window.addEventListener('equipment:audit-sync', refreshAuditState);
  }
}
