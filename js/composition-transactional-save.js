import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';

/*
 * Camada de persistência transacional para o módulo de Composições.
 * O formulário visual continua pertencendo a public-modules.js; esta camada
 * assume somente o submit e usa a RPC save_team_composition, garantindo que
 * composição + 3 membros sejam gravados em uma única transação no banco.
 */

const form = document.getElementById('composition-form');

function setMessage(text = '', type = '') {
  const target = document.getElementById('composition-form-message');
  if (!target) return;
  target.className = `module-form-message${type ? ` ${type}` : ''}`;
  target.textContent = text;
}

async function handleSubmit(event) {
  if (!form) return;

  /* Interrompe o handler legado de duas etapas sem alterar a renderização,
     busca, listagem ou demais recursos de public-modules.js. */
  event.preventDefault();
  event.stopImmediatePropagation();

  const button = form.querySelector('button[type="submit"]');
  const selects = [...form.querySelectorAll('.composition-hero-select')];
  const title = String(form.elements.title?.value || '').trim();
  const description = String(form.elements.description?.value || '').trim();
  const heroIds = selects.map(select => select.value).filter(Boolean);

  setMessage('');

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    setMessage(`Não foi possível verificar sua sessão: ${sessionError.message}`, 'error');
    return;
  }
  if (!session?.user?.id) {
    setMessage('Entre na sua conta para salvar uma composição.', 'error');
    return;
  }
  if (!title) {
    setMessage('Dê um nome para a composição.', 'error');
    form.elements.title?.focus();
    return;
  }
  if (heroIds.length !== 3 || new Set(heroIds).size !== 3) {
    setMessage('Escolha três heróis diferentes.', 'error');
    return;
  }

  if (button) button.disabled = true;
  setMessage('Salvando composição e equipe…');

  try {
    const { data, error } = await supabase.rpc('save_team_composition', {
      p_title: title,
      p_description: description || null,
      p_is_public: Boolean(form.elements.is_public?.checked),
      p_hero_ids: heroIds
    });
    if (error) throw error;
    if (!data) throw new Error('O banco não confirmou o identificador da composição.');

    form.reset();
    selects.forEach(select => { select.value = ''; });
    setMessage('Composição salva com sucesso. Atualizando a lista…', 'ok');

    /* A página já possui toda a leitura oficial centralizada em
       public-modules.js. Recarregar após o commit evita duplicar a lógica de
       consulta e garante que o usuário veja exatamente o estado persistido. */
    window.setTimeout(() => location.reload(), 450);
  } catch (error) {
    console.error('[composition-transactional-save]', error);
    const code = String(error?.code || '');
    const raw = String(error?.message || '');
    let copy = 'Não foi possível salvar a composição.';
    if (/authentication_required/i.test(raw) || code === '42501') copy = 'Sua sessão não permite salvar esta composição. Entre novamente e tente de novo.';
    else if (/three_heroes|distinct_heroes/i.test(raw)) copy = 'A composição precisa ter exatamente três heróis diferentes.';
    else if (/unavailable_hero/i.test(raw) || code === '23503') copy = 'Um dos heróis selecionados não está mais disponível. Atualize a página e escolha novamente.';
    else if (raw) copy = `Não foi possível salvar: ${raw}`;
    setMessage(copy, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

if (form) {
  /* capture=true garante precedência sobre o submit legado que fica no mesmo
     formulário; stopImmediatePropagation impede o insert em duas etapas. */
  form.addEventListener('submit', handleSubmit, { capture: true });
  form.dataset.persistenceMode = 'transactional';
}
