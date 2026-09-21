import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';

/* Dashboard operacional dos módulos.
   Usa a RPC administrativa consolidada e não substitui nenhuma métrica do
   dashboard.js. O objetivo é trocar estados hardcoded por saúde real. */

const statusList = document.querySelector('.dashboard-status-list');
const quickGrid = document.querySelector('.dashboard-quick-grid');

function esc(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function ensureStyles() {
  if (document.getElementById('dashboard-modules-style')) return;
  const style = document.createElement('style');
  style.id = 'dashboard-modules-style';
  style.textContent = `
    .dashboard-status-list[data-live="true"]{gap:8px}
    .dashboard-status-item.module-live{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;color:inherit;text-decoration:none;transition:.16s}
    .dashboard-status-item.module-live:hover{border-color:rgba(139,92,246,.48);transform:translateY(-1px)}
    .dashboard-status-copy{min-width:0}.dashboard-status-copy>span{display:flex;align-items:center;color:#dce3ee;font-weight:700}.dashboard-status-copy small{display:block;margin-top:3px;color:#728098;font-size:8px;line-height:1.4}
    .dashboard-status-value{display:grid;justify-items:end;gap:2px}.dashboard-status-value strong{font-size:9px}.dashboard-status-value small{color:#66758c;font-size:7px}
    .dashboard-status-dot.is-warning{background:#f4c451;box-shadow:0 0 10px rgba(244,196,81,.42)}
    .dashboard-status-dot.is-error{background:#ff6f82;box-shadow:0 0 10px rgba(255,111,130,.42)}
    .dashboard-status-dot.is-idle{background:#8391a7;box-shadow:none}
    .dashboard-quick-card.dashboard-system-card{border-color:rgba(52,223,244,.18);background:linear-gradient(145deg,rgba(52,223,244,.06),transparent 65%),#09111f}
    .dashboard-quick-card.dashboard-system-card small{color:#68dcec}
    @media(max-width:520px){.dashboard-status-item.module-live{grid-template-columns:1fr}.dashboard-status-value{justify-items:start}}
  `;
  document.head.appendChild(style);
}

function stateFor(module) {
  const total = Number(module?.total || 0);
  const visible = Number(module?.visible || 0);
  const issues = Number(module?.issues || 0);
  if (issues > 0) return { label:`Revisar · ${issues}`, dot:'is-error', detail:`${visible}/${total} visível(is)` };
  if (total === 0) return { label:'Pronto · sem conteúdo', dot:'is-idle', detail:'estrutura conectada' };
  if (visible === 0) return { label:'Sem publicação', dot:'is-warning', detail:`0/${total} visível` };
  return { label:'Operacional', dot:'', detail:`${visible}/${total} visível(is)` };
}

function renderModules(modules = []) {
  if (!statusList) return;
  if (!Array.isArray(modules) || !modules.length) {
    statusList.innerHTML = '<div class="dashboard-empty">O backend não retornou a saúde dos módulos.</div>';
    return;
  }

  statusList.dataset.live = 'true';
  statusList.innerHTML = modules.map(module => {
    const state = stateFor(module);
    const href = module.admin_url || './data-health.html';
    return `
      <a class="dashboard-status-item module-live" href="${esc(href)}">
        <div class="dashboard-status-copy">
          <span><i class="dashboard-status-dot ${esc(state.dot)}"></i>${esc(module.label || module.key || 'Módulo')}</span>
          <small>${esc(state.detail)}</small>
        </div>
        <div class="dashboard-status-value"><strong>${esc(state.label)}</strong><small>Abrir →</small></div>
      </a>`;
  }).join('');
}

function addQuickCard(href, title, copy, action) {
  if (!quickGrid || quickGrid.querySelector(`[href="${href}"]`)) return;
  const card = document.createElement('a');
  card.className = 'dashboard-quick-card dashboard-system-card';
  card.href = href;
  card.innerHTML = `<div><strong>${esc(title)}</strong><span>${esc(copy)}</span></div><small>${esc(action)}</small>`;
  quickGrid.appendChild(card);
}

function enhanceQuickAccess() {
  addQuickCard('./data-health.html', 'Saúde dos dados', 'Integridade de todos os módulos, vínculos e pendências reais do banco.', 'Abrir diagnóstico');
  addQuickCard('./content-modules.html', 'Conteúdo público', 'Guias, notícias, Tier List e composições com publicação sincronizada.', 'Administrar módulos');
}

async function loadModuleHealth() {
  if (!statusList) return;
  statusList.innerHTML = '<div class="dashboard-empty">Consultando a saúde real dos módulos…</div>';
  const { data, error } = await supabase.rpc('echo_admin_module_health');
  if (error) {
    console.error('[dashboard-modules]', error);
    statusList.innerHTML = `<div class="dashboard-empty">Não foi possível consultar os módulos: ${esc(error.message)}</div>`;
    return;
  }
  renderModules(data || []);
}

ensureStyles();
enhanceQuickAccess();
await loadModuleHealth();
