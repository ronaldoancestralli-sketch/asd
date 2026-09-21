import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';

const message = document.getElementById('audit-message');
const sourceForm = document.getElementById('source-form');
const linkForm = document.getElementById('link-form');

function setMessage(text, type = 'error') {
  if (!message) return;
  message.textContent = text;
  message.className = `skill-audit-message${type ? ` ${type}` : ''}`;
}

function officialOriginAllowed(value = '') {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && (
      host === 'zepto.helpshift.com' ||
      host === 'zeptolab.com' ||
      host.endsWith('.zeptolab.com')
    );
  } catch {
    return false;
  }
}

function letOriginalHandlerContinue(form) {
  form.dataset.trustGuardBypass = '1';
  form.requestSubmit();
}

async function validateLinkSubmit(form) {
  const sourceId = form.elements.source_id.value;
  const coverage = form.elements.coverage.value;
  const status = form.elements.verification_status.value;
  const needsRecheck = form.elements.needs_recheck.checked;
  const patch = form.elements.verified_patch.value.trim();

  if (!sourceId) {
    setMessage('Escolha uma fonte real antes de salvar o vínculo.');
    return false;
  }

  const { data: source, error } = await supabase
    .from('source_references')
    .select('id,source_type,url,title')
    .eq('id', sourceId)
    .single();

  if (error || !source) {
    setMessage(`Não foi possível validar a origem da fonte: ${error?.message || 'fonte não encontrada'}.`);
    return false;
  }

  const officialSensitiveCoverage = ['baseline_values', 'structure', 'patch_override'].includes(coverage);

  if (officialSensitiveCoverage && status === 'verified' && source.source_type !== 'official') {
    setMessage('Este vínculo não pode ser marcado como Verificado: valores-base, estrutura e patches só recebem esse status quando a origem vinculada é oficial da ZeptoLab.');
    return false;
  }

  if (coverage === 'baseline_values' && !needsRecheck && !(status === 'verified' && source.source_type === 'official')) {
    setMessage('Valores-base só podem sair da fila de rechecagem quando estiverem verificados por uma fonte oficial da ZeptoLab.');
    return false;
  }

  if (coverage === 'patch_override' && status === 'verified' && !patch) {
    setMessage('Informe o identificador do patch/atualização antes de marcar uma alteração de patch como Verificada.');
    return false;
  }

  return true;
}

async function validateSourceDowngrade(form) {
  const id = form.elements.id.value.trim();
  const nextType = form.elements.source_type.value;
  if (!id || nextType === 'official') return true;

  const { data: current, error } = await supabase
    .from('source_references')
    .select('id,source_type,title')
    .eq('id', id)
    .single();

  if (error || !current) {
    setMessage(`Não foi possível validar a fonte antes da alteração: ${error?.message || 'fonte não encontrada'}.`);
    return false;
  }

  if (current.source_type !== 'official') return true;

  const { count, error: linksError } = await supabase
    .from('hero_skill_source_links')
    .select('id', { count: 'exact', head: true })
    .eq('source_id', id)
    .eq('verification_status', 'verified')
    .in('coverage', ['baseline_values', 'structure', 'patch_override']);

  if (linksError) {
    setMessage(`Não foi possível conferir os vínculos verificados desta fonte: ${linksError.message}.`);
    return false;
  }

  if (Number(count || 0) > 0) {
    setMessage('Esta fonte oficial sustenta vínculos verificados. Reclassifique primeiro esses vínculos; o banco não permite rebaixar a origem enquanto a confiança depender dela.');
    return false;
  }

  return true;
}

document.addEventListener('submit', async event => {
  const form = event.target;
  if (form !== sourceForm && form !== linkForm) return;

  if (form.dataset.trustGuardBypass === '1') {
    delete form.dataset.trustGuardBypass;
    return;
  }

  if (form === sourceForm) {
    const type = form.elements.source_type.value;
    const url = form.elements.url.value.trim();

    if (type === 'official' && !officialOriginAllowed(url)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setMessage('Fonte marcada como Oficial precisa usar HTTPS em zeptolab.com (ou subdomínio) ou zepto.helpshift.com. Para outras origens, use Wiki, Fórum, Comunidade ou Outro.');
      return;
    }

    if (form.elements.id.value.trim() && type !== 'official') {
      event.preventDefault();
      event.stopImmediatePropagation();
      setMessage('Validando dependências da fonte...', '');
      if (await validateSourceDowngrade(form)) letOriginalHandlerContinue(form);
      return;
    }

    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  setMessage('Validando confiança da fonte...', '');
  if (await validateLinkSubmit(form)) letOriginalHandlerContinue(form);
}, true);
