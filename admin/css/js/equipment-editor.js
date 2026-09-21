await import('./equipment-editor-core.js?v=20260916-automatic-recognition-1&scope=20260917-persistence-1&av2=20260828&sb=20260823-security-supabase-pin-1&eq=20260907-effects-1');
await import('./equipment-attribute-assistant.js?v=20260920-resolution-authority-1&persist=20260917-scope-1&sb=20260823-security-supabase-pin-1&sc=20260906-1&eq=20260907-effects-1');


const { initAdminLocalImageImport } = await import(
  './admin-ai-image-import.js?v=20260916-automatic-recognition-1&nocr=20260828-paddle-browser-v3&parser=20260916-ocr-continuation-1&sb=20260823-security-supabase-pin-1&eq=20260907-effects-1'
);
await initAdminLocalImageImport({ entityType: 'equipment' });

// Compatibilidade visual/operacional do painel de Equipamentos:
// o OCR pode manter sua proteção interna para lotes incompletos, mas o editor
// preserva o botão original solicitado pelo painel e conclui a confirmação
// interna no mesmo clique, sem introduzir novos estados/botões na interface.
const equipmentOcrModal = document.getElementById('admin-ai-image-import-equipment');
const equipmentOcrApply = equipmentOcrModal?.querySelector('[data-ai-apply]');

if (equipmentOcrApply) {
  let forwardingIncompleteConfirmation = false;

  const restoreOriginalApplyLabel = () => {
    if (equipmentOcrApply.textContent.trim() !== 'Aplicar no editor') {
      equipmentOcrApply.textContent = 'Aplicar no editor';
    }
  };

  equipmentOcrApply.addEventListener('click', () => {
    if (forwardingIncompleteConfirmation) return;

    if (equipmentOcrApply.textContent.trim() === 'Aplicar mesmo assim') {
      forwardingIncompleteConfirmation = true;
      try {
        equipmentOcrApply.click();
      } finally {
        forwardingIncompleteConfirmation = false;
      }
    }
  });

  const applyLabelObserver = new MutationObserver(restoreOriginalApplyLabel);
  applyLabelObserver.observe(equipmentOcrApply, {
    childList: true,
    subtree: true,
    characterData: true
  });
  restoreOriginalApplyLabel();
}
