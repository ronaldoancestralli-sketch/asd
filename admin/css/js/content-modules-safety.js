import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';
import { showAdminDecisionModal } from './admin-decision-modal.js?v=2';

function fieldValue(form, name) {
  return String(form?.elements?.namedItem(name)?.value || '').trim();
}

function setFormStatus(form, text, type = 'error') {
  const status = form?.querySelector('[data-editor-status],#tier-status');
  if (!status) return;
  status.textContent = text;
  status.className = `content-editor-status${type ? ` ${type}` : ''}`;
}

function setHubMessage(text, type = 'error') {
  const target = document.getElementById('content-hub-message');
  if (!target) return;
  target.textContent = text;
  target.className = `content-hub-message show${type ? ` ${type}` : ''}`;
}

function editorialPublishIssues(form) {
  if (!form?.elements?.published?.checked) return [];
  const issues = [];
  if (!fieldValue(form, 'title')) issues.push('título');
  if (!fieldValue(form, 'slug')) issues.push('slug');
  if (!fieldValue(form, 'summary')) issues.push('resumo');
  if (!fieldValue(form, 'content')) issues.push('conteúdo');
  return issues;
}

function bindEditorialPublishProtection() {
  document.querySelectorAll('[data-editorial-form]').forEach(form => {
    form.addEventListener('submit', event => {
      const issues = editorialPublishIssues(form);
      if (!issues.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setFormStatus(
        form,
        `Para publicar, preencha ${issues.join(', ')}. Você pode desmarcar “Publicado” e salvar como rascunho enquanto prepara o conteúdo.`
      );
    }, true);
  });
}

function bindTierPublishProtection() {
  const form = document.getElementById('tier-form');
  if (!form) return;

  form.addEventListener('submit', async event => {
    if (form.dataset.publishValidated === '1') {
      delete form.dataset.publishValidated;
      return;
    }
    if (!form.elements.published?.checked) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const id = fieldValue(form, 'id');
    if (!id) {
      setFormStatus(
        form,
        'Para publicar uma Tier List, salve primeiro como rascunho, adicione pelo menos um herói e então marque como publicada.'
      );
      return;
    }

    setFormStatus(form, 'Verificando a classificação antes de publicar…', '');
    const { count, error } = await supabase
      .from('tier_list_entries')
      .select('id', { count: 'exact', head: true })
      .eq('tier_list_id', id);

    if (error) {
      setFormStatus(form, `Não foi possível validar a Tier List: ${error.message}`);
      return;
    }
    if (!Number(count || 0)) {
      setFormStatus(
        form,
        'Esta lista ainda não possui heróis. Adicione pelo menos uma entrada antes de publicar.'
      );
      return;
    }

    form.dataset.publishValidated = '1';
    form.requestSubmit();
  }, true);
}

async function confirmDelete({ title, message, detail }) {
  return showAdminDecisionModal({
    kicker: 'EXCLUSÃO PERMANENTE',
    title,
    message,
    detail,
    confirmLabel: 'Excluir definitivamente',
    cancelLabel: 'Cancelar'
  });
}

function reloadCurrentTab() {
  const hash = location.hash;
  location.href = `${location.pathname}${location.search}${hash}`;
  location.reload();
}

function bindEditorialDeleteProtection() {
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-delete-editorial]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const type = button.dataset.deleteEditorial;
    const form = document.querySelector(`[data-editorial-form="${CSS.escape(type)}"]`);
    const id = fieldValue(form, 'id');
    if (!id) return;
    const title = fieldValue(form, 'title') || (type === 'guides' ? 'Guia' : 'Notícia');
    const label = type === 'guides' ? 'guia' : 'notícia';

    const confirmed = await confirmDelete({
      title: `Excluir ${label} “${title}”?`,
      message: 'O registro será removido do banco e deixará de existir no painel e no site.',
      detail: 'Esta ação não é apenas uma despublicação. Para manter o conteúdo sem exibi-lo no site, cancele e salve como rascunho.'
    });
    if (!confirmed) return;

    setFormStatus(form, 'Excluindo…', '');
    const table = type === 'guides' ? 'guides' : 'news';
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) {
      setFormStatus(form, `Não foi possível excluir: ${error.message}`);
      return;
    }
    reloadCurrentTab();
  }, true);
}

function bindTierDeleteProtection() {
  document.addEventListener('click', async event => {
    const listButton = event.target.closest('#tier-delete');
    if (listButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const form = document.getElementById('tier-form');
      const id = fieldValue(form, 'id');
      if (!id) return;
      const title = fieldValue(form, 'title') || 'Tier List';
      const confirmed = await confirmDelete({
        title: `Excluir a Tier List “${title}”?`,
        message: 'A lista e todas as suas entradas serão removidas juntas do banco.',
        detail: 'Se você só quer retirar a classificação do site, cancele e desmarque “Publicada no site”.'
      });
      if (!confirmed) return;
      const { error } = await supabase.from('tier_lists').delete().eq('id', id);
      if (error) {
        setHubMessage(`Não foi possível excluir a Tier List: ${error.message}`);
        return;
      }
      reloadCurrentTab();
      return;
    }

    const entryButton = event.target.closest('[data-delete-tier-entry]');
    if (!entryButton) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const node = entryButton.closest('[data-tier-entry]');
    const id = node?.dataset.tierEntry;
    if (!id) return;
    const heroSelect = node.querySelector('[data-entry-field="hero_id"]');
    const heroName = heroSelect?.selectedOptions?.[0]?.textContent?.trim() || 'este herói';
    const confirmed = await confirmDelete({
      title: `Remover ${heroName} desta Tier List?`,
      message: 'A entrada será removida da classificação.',
      detail: 'Se esta for a última entrada de uma lista publicada, o banco exigirá que a lista seja despublicada antes para evitar uma página pública vazia.'
    });
    if (!confirmed) return;
    const { error } = await supabase.from('tier_list_entries').delete().eq('id', id);
    if (error) {
      const friendly = /unpublish_tier_list_before_removing_last_entry/i.test(error.message || '')
        ? 'Esta é a última entrada de uma Tier List publicada. Desmarque “Publicada no site”, salve a lista e depois remova a entrada.'
        : `Não foi possível remover a entrada: ${error.message}`;
      setHubMessage(friendly);
      return;
    }
    reloadCurrentTab();
  }, true);
}

bindEditorialPublishProtection();
bindTierPublishProtection();
bindEditorialDeleteProtection();
bindTierDeleteProtection();
