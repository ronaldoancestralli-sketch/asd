import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';

let currentFilter = 'all';
let refreshTimer = 0;

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function resultingClassification(row) {
  return row?.after_data?.classification || row?.before_data?.classification || '';
}

function actionLabel(row = {}) {
  const action = row.action || '';
  const classification = resultingClassification(row);
  if (/classificacao_(criada|atualizada|reativada)/i.test(action)) {
    if (classification === 'informational') return 'Marcado como efeito informativo';
    if (classification === 'external_data_required') return 'Marcado como aguardando dado oficial';
  }
  const labels = {
    baseline_classificacao: 'Classificação já existente',
    classificacao_criada: 'Classificação criada',
    classificacao_criada_inativa: 'Classificação criada inativa',
    classificacao_atualizada: 'Classificação atualizada',
    classificacao_reativada: 'Classificação reativada',
    classificacao_reaberta: 'Reaberto para revisão',
    regra_calculo_alterada: 'Regra de cálculo alterada',
    pendencia_resolvida: 'Pendência corrigida',
    pendencia_ignorada: 'Pendência marcada como ignorada',
    pendencia_reaberta: 'Pendência reaberta',
    pendencia_status_alterado: 'Status da pendência alterado'
  };
  return labels[action] || action.replaceAll('_', ' ');
}

function actionTone(row = {}) {
  const action = row.action || '';
  if (/pendencia_resolvida/i.test(action)) return 'resolved';
  if (/pendencia_reaberta/i.test(action)) return 'bad';
  if (/reaberta|ignorada/i.test(action)) return 'info';
  if (/classificacao_(criada|atualizada|reativada)/i.test(action)) {
    return resultingClassification(row) === 'informational' ? 'info' : 'external';
  }
  if (/regra_calculo/i.test(action)) return 'math';
  return 'neutral';
}

function entityLabel(type = '') {
  if (type === 'set_bonus') return 'Bônus';
  if (type === 'queue_issue') return 'Correção';
  return 'Classificação';
}

function actorLabel(row) {
  if (row.actor_email) return row.actor_email;
  if (row.actor_id) return `Administrador · ${String(row.actor_id).slice(0, 8)}…`;
  return row.action === 'baseline_classificacao' ? 'Registro anterior ao histórico' : 'Sistema';
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(new Date(value));
  } catch {
    return String(value || '—');
  }
}

function compactData(value) {
  if (!value || typeof value !== 'object') return '—';
  return JSON.stringify(value, null, 2);
}

function ensureStyles() {
  if (document.getElementById('audit-history-style')) return;
  const style = document.createElement('style');
  style.id = 'audit-history-style';
  style.textContent = `
    .audit-team-history-tools{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin:0 0 10px}.audit-team-history-tools button{min-height:32px!important;padding:7px 9px!important;font-size:8px!important}.audit-team-history-tools button.is-active{border-color:#8b5cf6!important;color:#ddd6fe!important;background:rgba(109,40,217,.12)!important}.audit-team-history-note{margin:0 0 10px;padding:9px 10px;border:1px solid #2a3951;border-radius:9px;background:#07101d;color:#9da9bb;font-size:8.5px;line-height:1.5}.audit-team-history-list{display:grid;gap:8px}.audit-team-history-entry{padding:11px;border:1px solid #26344d;border-radius:10px;background:#07101d}.audit-team-history-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.audit-team-history-head strong{color:#f3f6fb;font-size:10px}.audit-team-history-head small{display:block;margin-top:3px;color:#7f8da2;font-size:8px}.audit-team-history-badge{flex:0 0 auto;padding:4px 7px;border:1px solid #3a475d;border-radius:999px;color:#b9c4d3;font-size:7px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}.audit-team-history-badge.external{color:#fde68a;border-color:#76591c;background:rgba(120,83,8,.08)}.audit-team-history-badge.math{color:#c4b5fd;border-color:#6d28d9;background:rgba(109,40,217,.08)}.audit-team-history-badge.info{color:#bfdbfe;border-color:#315a8b;background:rgba(30,64,175,.08)}.audit-team-history-badge.resolved{color:#86efac;border-color:#225d49;background:rgba(22,101,52,.1)}.audit-team-history-badge.bad{color:#fecdd3;border-color:#7f1d1d;background:rgba(127,29,29,.1)}.audit-team-history-meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px;color:#8d99ac;font-size:8px}.audit-team-history-tech{margin-top:8px;border-top:1px solid rgba(148,163,184,.12);padding-top:7px}.audit-team-history-tech summary{cursor:pointer;color:#8f9db1;font-size:8px}.audit-team-history-tech pre{overflow:auto;margin:7px 0 0;padding:8px;border:1px solid #202d42;border-radius:8px;background:#050b15;color:#aeb8c9;font:8px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-word}.audit-team-history-empty{padding:18px 10px;text-align:center;color:#8794a8;font-size:9px}.audit-team-history-error{padding:10px;border:1px solid #7f1d1d;border-radius:9px;background:rgba(127,29,29,.1);color:#fecdd3;font-size:9px;line-height:1.5}@media(max-width:700px){.audit-team-history-head{display:grid}.audit-team-history-badge{justify-self:start}}
  `;
  document.head.appendChild(style);
}

function ensurePanel() {
  if (document.getElementById('audit-team-history')) return document.getElementById('audit-team-history');
  const session = document.getElementById('session-history')?.closest('.audit-help');
  if (!session?.parentElement) return null;

  const details = document.createElement('details');
  details.id = 'audit-team-history';
  details.className = 'audit-help';
  details.open = true;
  details.innerHTML = `
    <summary>Histórico permanente da equipe</summary>
    <div class="audit-help-body">
      <p>Decisões e correções importantes ficam salvas no banco para que outras pessoas saibam o que mudou, quando mudou e quem realizou a ação. Este histórico continua disponível depois de fechar a página.</p>
      <div class="audit-team-history-note"><b>Registrado automaticamente:</b> classificações informativas, efeitos aguardando dados oficiais, alterações em regras matemáticas de bônus e resolução/reabertura de pendências reais. O histórico não altera o cálculo; ele documenta as decisões.</div>
      <div class="audit-team-history-tools">
        <button class="admin-button is-active" type="button" data-history-filter="all">Todos</button>
        <button class="admin-button" type="button" data-history-filter="queue_issue">Correções</button>
        <button class="admin-button" type="button" data-history-filter="attribute_classification">Classificações</button>
        <button class="admin-button" type="button" data-history-filter="set_bonus">Regras de bônus</button>
        <button class="admin-button" type="button" id="audit-history-reload">Atualizar</button>
      </div>
      <div id="audit-team-history-list" class="audit-team-history-list"><div class="audit-team-history-empty">Carregando histórico...</div></div>
    </div>`;

  session.parentElement.insertBefore(details, session);

  details.querySelectorAll('[data-history-filter]').forEach(button => {
    button.addEventListener('click', () => {
      currentFilter = button.dataset.historyFilter || 'all';
      details.querySelectorAll('[data-history-filter]').forEach(item => item.classList.toggle('is-active', item === button));
      loadHistory();
    });
  });
  details.querySelector('#audit-history-reload')?.addEventListener('click', loadHistory);
  return details;
}

function renderRows(rows = []) {
  const host = document.getElementById('audit-team-history-list');
  if (!host) return;
  if (!rows.length) {
    host.innerHTML = '<div class="audit-team-history-empty">Nenhuma alteração registrada para este filtro.</div>';
    return;
  }

  host.innerHTML = rows.map(row => `
    <article class="audit-team-history-entry">
      <div class="audit-team-history-head">
        <div>
          <strong>${escapeHtml(row.summary || 'Alteração na Auditoria')}</strong>
          <small>${escapeHtml(actionLabel(row))}</small>
        </div>
        <span class="audit-team-history-badge ${escapeHtml(actionTone(row))}">${escapeHtml(entityLabel(row.entity_type))}</span>
      </div>
      <div class="audit-team-history-meta">
        <span>${escapeHtml(formatDate(row.created_at))}</span>
        <span>·</span>
        <span>${escapeHtml(actorLabel(row))}</span>
      </div>
      <details class="audit-team-history-tech">
        <summary>Detalhes técnicos da alteração</summary>
        <pre>ANTES\n${escapeHtml(compactData(row.before_data))}\n\nDEPOIS\n${escapeHtml(compactData(row.after_data))}</pre>
      </details>
    </article>`).join('');
}

async function loadHistory() {
  const host = document.getElementById('audit-team-history-list');
  if (!host) return;
  host.innerHTML = '<div class="audit-team-history-empty">Atualizando histórico...</div>';

  let query = supabase
    .from('equipment_audit_history')
    .select('id,entity_type,entity_id,action,summary,before_data,after_data,actor_id,actor_email,metadata,created_at')
    .order('created_at', { ascending: false })
    .limit(60);

  if (currentFilter !== 'all') query = query.eq('entity_type', currentFilter);

  const { data, error } = await query;
  if (error) {
    host.innerHTML = `<div class="audit-team-history-error"><b>Histórico indisponível.</b><br>${escapeHtml(error.message || error)}</div>`;
    return;
  }
  renderRows(data || []);
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(loadHistory, 900);
}

ensureStyles();
if (ensurePanel()) {
  await loadHistory();
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('#audit-classify-save, #audit-info-save, [data-reopen-external], [data-reopen-informational], #confirm-apply, .undo-session-change')) {
      scheduleRefresh();
    }
  }, true);
  window.addEventListener('focus', scheduleRefresh);
}
