import {
  loadPendingEquipmentAuditQueue,
  syncEquipmentAuditQueueFromDatabase
} from './equipment-audit-queue.js?v=8&sb=20260823-security-supabase-pin-1&eq=20260907-effects-1';
import {
  refreshEquipmentAttributeClassifications,
  resolvePersistedAttributeClassification,
  saveInformationalClassification,
  reopenAttributeClassification
} from '../../js/equipment-attribute-classifications.js?v=3&sb=20260823-security-supabase-pin-1';
import { showAdminDecisionModal } from './admin-decision-modal.js?v=1';

let scheduled = false;
let observer = null;

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalize(value = '') {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/%/g, ' percentual ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function observe() {
  observer?.observe(document.getElementById('audit-page') || document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'hidden']
  });
}

function ensureStyles() {
  if (document.getElementById('audit-informational-style')) return;
  const style = document.createElement('style');
  style.id = 'audit-informational-style';
  style.textContent = `
    .audit-item.informational-data{border-color:rgba(96,165,250,.38)!important;background:linear-gradient(180deg,rgba(30,64,175,.08),rgba(7,16,29,.94))!important}.audit-item.informational-data .audit-kicker{color:#93c5fd!important}.audit-item.informational-data .audit-status{color:#bfdbfe!important;border-color:#315a8b!important;background:rgba(30,64,175,.12)!important}.audit-item.informational-data .audit-answer{border-color:rgba(49,90,139,.55)!important}.audit-summary-card.informational-data{border-color:#315a8b!important;background:linear-gradient(145deg,rgba(30,64,175,.12),rgba(8,17,31,.96))!important}.audit-summary-card.informational-data small,.audit-summary-card.informational-data strong{color:#bfdbfe!important}.audit-summary-card.informational-data span{color:#8fa9ca!important}.audit-rule-action.informational{border-color:#315a8b!important;color:#bfdbfe!important;background:rgba(30,64,175,.08)!important}.audit-info-modal{position:fixed;inset:0;z-index:10000;display:none;place-items:center;padding:18px;background:rgba(2,6,15,.8);backdrop-filter:blur(6px)}.audit-info-modal.open{display:grid}.audit-info-card{width:min(620px,100%);max-height:90vh;overflow:auto;border:1px solid #315a8b;border-radius:16px;background:#0a1322;box-shadow:0 24px 70px rgba(0,0,0,.55);padding:16px}.audit-info-card h3{margin:0;color:#bfdbfe;font-size:15px}.audit-info-card>p{margin:6px 0 14px;color:#aeb9c9;font-size:9px;line-height:1.5}.audit-info-help{padding:9px;border:1px solid rgba(49,90,139,.5);border-radius:9px;background:rgba(30,64,175,.08);color:#9fb8d8;font-size:8.5px;line-height:1.5}.audit-info-fields{display:grid;gap:10px;margin-top:10px}.audit-info-field{display:grid;gap:5px}.audit-info-field span{color:#d8dfeb;font-size:8px;font-weight:900;letter-spacing:.05em;text-transform:uppercase}.audit-info-field input,.audit-info-field textarea{width:100%;box-sizing:border-box;border:1px solid #2b3951;border-radius:9px;background:#07101d;color:#f8fafc;padding:10px;font:inherit;font-size:10px}.audit-info-field textarea{min-height:72px;resize:vertical}.audit-info-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.audit-info-error{margin-top:9px;color:#fda4af;font-size:9px;line-height:1.4}@media(max-width:700px){.audit-info-actions{display:grid;grid-template-columns:1fr}.audit-info-actions .admin-button{width:100%;justify-content:center}}
  `;
  document.head.appendChild(style);
}

function ensureSummaryCard() {
  const summary = document.querySelector('.audit-summary');
  if (!summary || document.getElementById('sum-informational-data')) return;
  const card = document.createElement('article');
  card.className = 'audit-summary-card informational-data';
  card.innerHTML = '<small>Efeitos informativos</small><strong id="sum-informational-data">0</strong><span>Mecânicas reais exibidas ao usuário, mas que não representam um atributo matemático da build.</span>';
  summary.appendChild(card);
}

function ensureModal() {
  let modal = document.getElementById('audit-info-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'audit-info-modal';
  modal.className = 'audit-info-modal';
  modal.innerHTML = `
    <section class="audit-info-card" role="dialog" aria-modal="true" aria-labelledby="audit-info-title">
      <h3 id="audit-info-title">Marcar como efeito informativo</h3>
      <p>Use quando a mecânica for real e útil para o usuário, mas não representar um status numérico que deva entrar no motor de cálculo.</p>
      <div class="audit-info-help"><b>Importante:</b> esta decisão não cria fórmula, não inventa base e não apaga o atributo. O efeito continuará visível no site e na build como informação.</div>
      <div class="audit-info-fields">
        <label class="audit-info-field"><span>Nome exibido</span><input id="audit-info-label"></label>
        <label class="audit-info-field"><span>Por que é somente informativo?</span><textarea id="audit-info-reason"></textarea></label>
        <label class="audit-info-field"><span>Explicação pública</span><textarea id="audit-info-public"></textarea></label>
      </div>
      <div id="audit-info-error" class="audit-info-error"></div>
      <div class="audit-info-actions"><button class="admin-button" type="button" id="audit-info-cancel">Cancelar</button><button class="admin-button audit-primary" type="button" id="audit-info-save">Salvar classificação</button></div>
    </section>`;
  document.body.appendChild(modal);
  modal.querySelector('#audit-info-cancel').onclick = () => modal.classList.remove('open');
  modal.addEventListener('click', event => { if (event.target === modal) modal.classList.remove('open'); });
  return modal;
}

async function resyncAffected(rawAttributeKey) {
  const result = await loadPendingEquipmentAuditQueue();
  const wanted = normalize(rawAttributeKey);
  const affected = new Map();
  for (const row of result.rows || []) {
    if (row.issue_type !== 'unknown_attribute') continue;
    if (normalize(row.attribute_key) !== wanted) continue;
    affected.set(String(row.equipment_id), row.equipment_name || 'Equipamento');
  }
  for (const [equipmentId, equipmentName] of affected) {
    await syncEquipmentAuditQueueFromDatabase(equipmentId, equipmentName, 'audit-informational-classification');
  }
}

async function openInformationalModal(rawAttributeKey) {
  const modal = ensureModal();
  const label = String(rawAttributeKey || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\bpercentual\b/i, '').replace(/\s+/g, ' ').trim();
  modal.querySelector('#audit-info-label').value = label || rawAttributeKey;
  modal.querySelector('#audit-info-reason').value = 'O efeito é uma mecânica real do equipamento, mas não representa um atributo matemático que deva ser calculado na build.';
  modal.querySelector('#audit-info-public').value = 'Este é um efeito informativo do equipamento. Ele é exibido como referência e não altera diretamente os atributos numéricos calculados da build.';
  modal.querySelector('#audit-info-error').textContent = '';
  modal.classList.add('open');

  modal.querySelector('#audit-info-save').onclick = async () => {
    const button = modal.querySelector('#audit-info-save');
    const errorNode = modal.querySelector('#audit-info-error');
    button.disabled = true;
    errorNode.textContent = '';
    try {
      await saveInformationalClassification({
        rawLabel: rawAttributeKey,
        displayLabel: modal.querySelector('#audit-info-label').value,
        reason: modal.querySelector('#audit-info-reason').value,
        publicNote: modal.querySelector('#audit-info-public').value
      });
      await resyncAffected(rawAttributeKey);
      location.reload();
    } catch (error) {
      errorNode.textContent = `Não foi possível salvar a classificação: ${error?.message || error}`;
    } finally {
      button.disabled = false;
    }
  };
}

async function reopenInformational(rawAttributeKey) {
  const confirmed = await showAdminDecisionModal({
    kicker: 'REABRIR PARA REVISÃO',
    title: 'Este efeito deixou de ser apenas informativo?',
    message: 'A classificação informativa será desativada e a mecânica voltará para a Auditoria como pendência até receber uma nova definição segura.',
    detail: 'Nenhuma fórmula será criada automaticamente e nenhum dado do equipamento será apagado.',
    confirmLabel: 'Reabrir revisão',
    cancelLabel: 'Manter informativo'
  });
  if (!confirmed) return;
  await reopenAttributeClassification(rawAttributeKey);
  location.reload();
}

function addInformationalActions() {
  document.querySelectorAll('[data-mark-external]').forEach(button => {
    const raw = button.getAttribute('data-mark-external') || '';
    const parent = button.parentElement;
    if (!parent || parent.querySelector('[data-mark-informational]')) return;
    const info = document.createElement('button');
    info.type = 'button';
    info.className = 'admin-button audit-rule-action informational';
    info.dataset.markInformational = raw;
    info.textContent = 'É efeito informativo / sem cálculo';
    info.addEventListener('click', () => openInformationalModal(raw));
    button.insertAdjacentElement('afterend', info);
  });
}

function answerByLabel(card, label) {
  return [...card.querySelectorAll('.audit-answer')].find(answer => answer.querySelector('small')?.textContent?.trim().toUpperCase() === label);
}

function decorateInformationalCards() {
  const healthy = document.getElementById('healthy-results');
  const unique = new Set();

  document.querySelectorAll('.audit-item').forEach(card => {
    if (card.hasAttribute('data-external-data-count')) return;
    const heading = card.querySelector('h3')?.textContent?.trim() || '';
    const classification = resolvePersistedAttributeClassification(heading);
    if (classification?.classification !== 'informational') return;
    unique.add(classification.normalizedKey);

    const alreadyDone = card.dataset.informationalProcessed === classification.normalizedKey;
    if (!alreadyDone) {
      card.dataset.informationalProcessed = classification.normalizedKey;
      card.classList.add('informational-data');
      card.classList.remove('bad', 'external-data');
      card.hidden = false;

      const status = card.querySelector('.audit-status');
      if (status) { status.className = 'audit-status info'; status.textContent = 'Efeito informativo — não é erro'; }
      const found = answerByLabel(card, 'O QUE ENCONTRAMOS?');
      if (found) {
        if (found.querySelector('strong')) found.querySelector('strong').textContent = classification.label;
        if (found.querySelector('span')) found.querySelector('span').textContent = 'Uma mecânica real do equipamento que deve permanecer visível como informação.';
      }
      const working = answerByLabel(card, 'ESTÁ FUNCIONANDO?');
      if (working) {
        if (working.querySelector('strong')) working.querySelector('strong').textContent = 'Sim, como informação.';
        if (working.querySelector('span')) working.querySelector('span').textContent = 'O efeito não participa do motor porque não representa um atributo matemático da build.';
      }
      const why = answerByLabel(card, 'POR QUÊ?');
      if (why?.querySelector('span')) why.querySelector('span').textContent = classification.reason || 'A equipe classificou este efeito como informativo.';
      const action = answerByLabel(card, 'O QUE PRECISO FAZER?');
      if (action?.querySelector('span')) action.querySelector('span').textContent = 'Nenhuma correção é necessária. Mantenha o efeito visível como informação; reabra a revisão somente se surgir uma regra matemática real.';
      const targetRow = [...card.querySelectorAll('.audit-tech-row')].find(row => row.querySelector('span')?.textContent?.toLowerCase().includes('destino reconhecido'));
      if (targetRow?.querySelector('code')) targetRow.querySelector('code').textContent = 'Sem cálculo por definição · efeito informativo';

      const actions = document.createElement('div');
      actions.className = 'audit-item-actions';
      actions.innerHTML = `<button type="button" class="admin-button audit-rule-action reopen" data-reopen-informational="${escapeHtml(heading)}">Reabrir para revisão</button>`;
      card.appendChild(actions);
      actions.querySelector('button')?.addEventListener('click', () => reopenInformational(heading));
    }

    if (card.closest('#pending-results') && healthy) healthy.appendChild(card);
  });

  ensureSummaryCard();
  const count = document.getElementById('sum-informational-data');
  if (count) count.textContent = String(unique.size);
  return unique.size;
}

function adjustSummary(id, subtract) {
  const node = document.getElementById(id);
  if (!node) return;
  const current = Number(String(node.textContent || '').replace(/\D/g, ''));
  const previous = Number(node.dataset.informationalAdjusted);
  let base = Number(node.dataset.informationalBase);
  if (!Number.isFinite(base) || !Number.isFinite(previous) || current !== previous) base = Number.isFinite(current) ? current : 0;
  const adjusted = Math.max(0, base - subtract);
  node.dataset.informationalBase = String(base);
  node.dataset.informationalAdjusted = String(adjusted);
  if (node.textContent !== String(adjusted)) node.textContent = String(adjusted);
}

function process() {
  scheduled = false;
  observer?.disconnect();
  try {
    addInformationalActions();
    const count = decorateInformationalCards();
    adjustSummary('sum-not-calculated', count);
    adjustSummary('sum-attention', count);
  } finally {
    observe();
  }
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(process);
}

ensureStyles();
await refreshEquipmentAttributeClassifications();
observer = new MutationObserver(schedule);
schedule();
