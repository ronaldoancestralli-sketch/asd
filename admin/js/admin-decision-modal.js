function ensureStyle() {
  if (document.getElementById('admin-decision-modal-style')) return;

  const style = document.createElement('style');
  style.id = 'admin-decision-modal-style';
  style.textContent = `
    .admin-decision-modal{position:fixed;inset:0;z-index:22000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(1,7,17,.95);backdrop-filter:blur(9px);color:#f8fafc}
    .admin-decision-card{width:min(680px,100%);overflow:hidden;border:1px solid #b94a5d;border-radius:24px;background:#081525;box-shadow:0 35px 100px rgba(0,0,0,.65);text-align:center}
    .admin-decision-line{height:4px;background:linear-gradient(90deg,#fb7185,#f43f5e)}
    .admin-decision-body{padding:34px 30px 28px}.admin-decision-icon{width:96px;height:96px;margin:0 auto 22px;display:grid;place-items:center;border:2px solid #fb7185;border-radius:50%;color:#fda4af;font-size:58px;line-height:1;box-shadow:0 0 0 12px rgba(244,63,94,.06)}
    .admin-decision-kicker{color:#fda4af;font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.admin-decision-card h2{margin:12px 0 12px;color:#fff;font-size:clamp(27px,5vw,40px);line-height:1.1}.admin-decision-card p{max-width:560px;margin:0 auto;color:#aab6ca;font-size:15px;line-height:1.65}.admin-decision-detail{margin:18px auto 0;padding:14px 16px;max-width:560px;border:1px solid #3a2940;border-radius:12px;background:rgba(127,29,29,.12);color:#fecdd3;font-size:12px;line-height:1.6;text-align:left}
    .admin-decision-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:28px}.admin-decision-actions button{min-height:52px;border:1px solid #3b4a68;border-radius:13px;background:#101c31;color:#fff;font:inherit;font-size:14px;font-weight:900;cursor:pointer}.admin-decision-actions .primary{border:0;background:linear-gradient(135deg,#9857f7,#6d28d9)}
    @media(max-width:560px){.admin-decision-body{padding:28px 18px 22px}.admin-decision-icon{width:82px;height:82px;font-size:48px}.admin-decision-actions{grid-template-columns:1fr}.admin-decision-card p{font-size:13px}}
  `;

  document.head.appendChild(style);
}

export function showAdminDecisionModal({
  kicker = 'ATENÇÃO',
  title = 'Confirme antes de continuar',
  message = '',
  detail = '',
  confirmLabel = 'Continuar',
  cancelLabel = 'Cancelar'
} = {}) {
  ensureStyle();

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'admin-decision-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    overlay.innerHTML = `
      <section class="admin-decision-card">
        <div class="admin-decision-line"></div>
        <div class="admin-decision-body">
          <div class="admin-decision-icon">!</div>
          <div class="admin-decision-kicker"></div>
          <h2></h2>
          <p></p>
          <div class="admin-decision-detail" ${detail ? '' : 'hidden'}></div>
          <div class="admin-decision-actions">
            <button type="button" data-decision="cancel"></button>
            <button type="button" class="primary" data-decision="confirm"></button>
          </div>
        </div>
      </section>
    `;

    overlay.querySelector('.admin-decision-kicker').textContent = kicker;
    overlay.querySelector('h2').textContent = title;
    overlay.querySelector('p').textContent = message;
    overlay.querySelector('.admin-decision-detail').textContent = detail;
    overlay.querySelector('[data-decision="cancel"]').textContent = cancelLabel;
    overlay.querySelector('[data-decision="confirm"]').textContent = confirmLabel;

    function close(result) {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(result);
    }

    function onKey(event) {
      if (event.key === 'Escape') close(false);
    }

    overlay.querySelector('[data-decision="cancel"]').addEventListener('click', () => close(false));
    overlay.querySelector('[data-decision="confirm"]').addEventListener('click', () => close(true));
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    window.setTimeout(() => overlay.querySelector('[data-decision="cancel"]')?.focus(), 20);
  });
}
