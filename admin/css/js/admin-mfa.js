import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';
import {
  getAalState,
  logoutAdmin,
  requireAdminIdentity
} from './admin-auth.js?v=20260904-persistent-aal2-1&sb=20260823-security-supabase-pin-1';

const $ = id => document.getElementById(id);
const MAX_TOTP_FACTORS = 10;
const AAL2_SYNC_TIMEOUT_MS = 4000;
const AAL2_SYNC_POLL_MS = 100;
const manageRequested = new URLSearchParams(location.search).get('manage') === '1';

let activeFactorId = null;
let enrollment = null;
let enrollmentPurpose = 'primary';
let allTotpFactors = [];
let verifiedFactors = [];
let busy = false;

function say(text = '', type = '') {
  const node = $('mfa-message');
  if (!node) return;
  node.textContent = text;
  node.className = `mfa-message${type ? ` ${type}` : ''}`;
}

function setBusy(value) {
  busy = value;
  for (const id of ['mfa-verify', 'mfa-logout', 'mfa-cancel-enroll', 'mfa-add-backup', 'mfa-open-panel', 'mfa-manage-logout']) {
    const node = $(id);
    if (node) node.disabled = value;
  }
}

function factorLabel(factor, index = 0) {
  const friendly = String(factor?.friendly_name || factor?.friendlyName || '').trim();
  return friendly || `Autenticador ${index + 1}`;
}

function setPageCopy(title, copy) {
  if ($('mfa-title')) $('mfa-title').textContent = title;
  if ($('mfa-copy')) $('mfa-copy').textContent = copy;
}

function setMode(mode) {
  document.body.dataset.mfaMode = mode;
  $('mfa-enroll')?.toggleAttribute('hidden', mode !== 'enroll');
  $('mfa-challenge')?.toggleAttribute('hidden', mode !== 'challenge');
  $('mfa-manage')?.toggleAttribute('hidden', mode !== 'manage');
  $('mfa-code-block')?.toggleAttribute('hidden', mode === 'manage');
  $('mfa-auth-actions')?.toggleAttribute('hidden', mode === 'manage');
  $('mfa-cancel-enroll')?.toggleAttribute('hidden', !(mode === 'enroll' && enrollmentPurpose === 'recovery'));
}

async function refreshFactors() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  allTotpFactors = Array.isArray(data?.totp) ? data.totp : [];
  verifiedFactors = allTotpFactors.filter(factor => factor?.status === 'verified');
  return allTotpFactors;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* challengeAndVerify atualiza a sessão em segundo plano. Em navegadores mais
   lentos, aguardar a sessão persistida evita tratar um MFA já aceito como se o
   código estivesse errado e solicitar os mesmos seis dígitos novamente. */
async function waitForAal2Session() {
  const deadline = Date.now() + AAL2_SYNC_TIMEOUT_MS;
  let lastError = null;

  do {
    try {
      const [{ data, error }, aal] = await Promise.all([
        supabase.auth.getSession(),
        getAalState()
      ]);
      if (error) throw error;
      if (data?.session?.user && aal.currentLevel === 'aal2') return aal;
    } catch (error) {
      lastError = error;
    }
    await delay(AAL2_SYNC_POLL_MS);
  } while (Date.now() < deadline);

  if (lastError) throw lastError;
  throw new Error('MFA aceito, mas a sessão segura ainda está sincronizando.');
}

async function cleanupUnverifiedFactors(factors) {
  for (const factor of factors) {
    if (factor?.status !== 'unverified') continue;
    try {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    } catch (error) {
      console.warn('[admin-mfa] fator não verificado antigo não removido:', error?.message);
    }
  }
}

function renderFactorChoice() {
  const select = $('mfa-factor-select');
  const wrap = $('mfa-factor-choice');
  if (!select || !wrap) return;

  select.replaceChildren();
  verifiedFactors.forEach((factor, index) => {
    const option = document.createElement('option');
    option.value = factor.id;
    option.textContent = factorLabel(factor, index);
    select.appendChild(option);
  });

  activeFactorId = verifiedFactors[0]?.id || null;
  wrap.hidden = verifiedFactors.length < 2;
  if (activeFactorId) select.value = activeFactorId;
}

function renderChallenge() {
  enrollment = null;
  enrollmentPurpose = 'primary';
  renderFactorChoice();
  setMode('challenge');
  setPageCopy(
    'Confirme o segundo fator',
    'O painel administrativo exige uma sessão AAL2. A senha sozinha não concede privilégios administrativos.'
  );
  if ($('mfa-verify')) $('mfa-verify').textContent = 'Confirmar MFA';
  say(verifiedFactors.length > 1
    ? 'Escolha qual autenticador deseja usar e digite o código atual.'
    : 'Digite o código atual do seu aplicativo autenticador.');
}

async function startEnrollment(purpose = 'primary') {
  await refreshFactors();
  if (purpose === 'recovery' && verifiedFactors.length === 0) purpose = 'primary';
  if (verifiedFactors.length >= MAX_TOTP_FACTORS) {
    throw new Error(`O limite de ${MAX_TOTP_FACTORS} fatores TOTP já foi atingido.`);
  }

  await cleanupUnverifiedFactors(allTotpFactors);
  enrollmentPurpose = purpose;

  const friendlyName = purpose === 'recovery'
    ? `EchoArena Recuperação ${verifiedFactors.length + 1}`
    : 'EchoArena Admin';

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName
  });
  if (error) throw error;

  if (!data?.id || !data?.totp?.qr_code || !data?.totp?.secret) {
    throw new Error('O Supabase não retornou os dados de inscrição MFA esperados.');
  }

  enrollment = data;
  activeFactorId = data.id;

  const qr = $('mfa-qr');
  if (qr) {
    qr.src = data.totp.qr_code;
    qr.alt = purpose === 'recovery'
      ? 'QR Code para configurar o autenticador de recuperação do EchoArena'
      : 'QR Code para configurar o autenticador do EchoArena';
  }

  const secret = $('mfa-secret');
  if (secret) secret.textContent = data.totp.secret;

  if ($('mfa-enroll-copy')) {
    $('mfa-enroll-copy').textContent = purpose === 'recovery'
      ? 'Cadastre este QR Code em um segundo aplicativo ou dispositivo que você consiga acessar se perder o autenticador principal.'
      : 'Abra um aplicativo autenticador compatível com TOTP, escaneie o QR Code abaixo e guarde o vínculo no seu dispositivo.';
  }

  setMode('enroll');
  if (purpose === 'recovery') {
    setPageCopy('Cadastre o autenticador de recuperação', 'Este segundo TOTP funciona como caminho de recuperação gratuito para o acesso administrativo.');
    if ($('mfa-verify')) $('mfa-verify').textContent = 'Ativar autenticador de recuperação';
    say('Escaneie o QR Code no segundo autenticador e confirme com os 6 dígitos gerados por ele.');
  } else {
    setPageCopy('Configure o segundo fator', 'O painel administrativo exige um fator TOTP verificado antes de liberar privilégios administrativos.');
    if ($('mfa-verify')) $('mfa-verify').textContent = 'Ativar MFA';
    say('Escaneie o QR Code e confirme com o código de 6 dígitos.');
  }

  $('mfa-code')?.focus();
}

function renderManage() {
  setMode('manage');
  setPageCopy('Gerencie seus autenticadores', 'Mantenha pelo menos dois fatores TOTP verificados para ter uma opção de recuperação sem SMS ou WhatsApp.');

  const list = $('mfa-factor-list');
  if (list) {
    list.replaceChildren();
    verifiedFactors.forEach((factor, index) => {
      const row = document.createElement('div');
      row.className = 'mfa-factor-row';

      const copy = document.createElement('div');
      copy.className = 'mfa-factor-copy';
      const name = document.createElement('strong');
      name.textContent = factorLabel(factor, index);
      const meta = document.createElement('span');
      meta.textContent = index === 0 ? 'Fator principal verificado' : 'Fator de recuperação verificado';
      copy.append(name, meta);
      row.appendChild(copy);

      if (verifiedFactors.length > 1) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'mfa-factor-remove';
        remove.textContent = 'Remover';
        remove.dataset.factorId = factor.id;
        row.appendChild(remove);
      }

      list.appendChild(row);
    });
  }

  const healthy = verifiedFactors.length >= 2;
  if ($('mfa-recovery-title')) {
    $('mfa-recovery-title').textContent = healthy ? 'Recuperação configurada' : 'Recuperação ainda não configurada';
  }
  if ($('mfa-recovery-copy')) {
    $('mfa-recovery-copy').textContent = healthy
      ? `Você possui ${verifiedFactors.length} fatores TOTP verificados. Qualquer um deles pode confirmar o login.`
      : 'Você possui apenas um fator verificado. Cadastre um segundo autenticador para não depender de um único dispositivo.';
  }

  const add = $('mfa-add-backup');
  if (add) {
    add.disabled = busy || verifiedFactors.length >= MAX_TOTP_FACTORS;
    add.textContent = healthy ? 'Adicionar outro autenticador' : 'Cadastrar autenticador de recuperação';
  }

  say(healthy
    ? 'Se perder um autenticador, escolha o outro na próxima tela de MFA.'
    : 'Recomendado: cadastre um segundo autenticador antes de depender deste acesso em produção.', healthy ? 'ok' : '');
}

async function removeFactor(factorId) {
  if (busy || !factorId) return;
  setBusy(true);
  try {
    const aal = await getAalState();
    if (aal.currentLevel !== 'aal2') {
      throw new Error('A sessão precisa estar em AAL2 para remover um fator verificado.');
    }

    await refreshFactors();
    if (verifiedFactors.length <= 1) {
      throw new Error('O último fator verificado não pode ser removido pela interface do EchoArena.');
    }
    if (!verifiedFactors.some(factor => factor.id === factorId)) {
      throw new Error('O fator selecionado não está mais disponível.');
    }

    if (!window.confirm('Remover este autenticador? O outro fator verificado continuará disponível.')) return;

    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) throw error;
    await refreshFactors();
    renderManage();
    say('Autenticador removido. Pelo menos um fator verificado foi preservado.', 'ok');
  } catch (error) {
    console.error('[admin-mfa] remoção de fator falhou:', error);
    say(error?.message || 'Não foi possível remover o autenticador.', 'error');
  } finally {
    setBusy(false);
  }
}

async function cancelRecoveryEnrollment() {
  if (busy) return;
  setBusy(true);
  try {
    if (enrollment?.id) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: enrollment.id });
      if (error) throw error;
    }
    enrollment = null;
    activeFactorId = null;
    await refreshFactors();
    renderManage();
    say('Cadastro de recuperação cancelado. Nenhum fator verificado foi removido.');
  } catch (error) {
    console.error('[admin-mfa] cancelamento do cadastro falhou:', error);
    say(error?.message || 'Não foi possível cancelar o cadastro.', 'error');
  } finally {
    setBusy(false);
  }
}

async function initialize() {
  setBusy(true);
  say('Validando a sessão administrativa...');

  try {
    const identity = await requireAdminIdentity();
    $('mfa-account').textContent = identity.session.user.email || 'Administrador';
    await refreshFactors();

    if (identity.aal.currentLevel === 'aal2') {
      if (verifiedFactors.length === 0) await startEnrollment('primary');
      else renderManage();
      return;
    }

    if (verifiedFactors.length > 0) renderChallenge();
    else await startEnrollment('primary');
  } catch (error) {
    console.error('[admin-mfa] inicialização falhou:', error);
    say(error?.message || 'Não foi possível iniciar a autenticação em dois fatores.', 'error');
  } finally {
    setBusy(false);
    if (document.body.dataset.mfaMode !== 'manage') $('mfa-code')?.focus();
  }
}

async function verify() {
  if (busy || !activeFactorId) return;

  const code = String($('mfa-code')?.value || '').replace(/\D/g, '').slice(0, 6);
  if (code.length !== 6) {
    say('Digite os 6 dígitos exibidos no aplicativo autenticador.', 'error');
    return;
  }

  setBusy(true);
  say('Verificando segundo fator...');
  let challengeAccepted = false;

  try {
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: activeFactorId,
      code
    });
    if (error) throw error;
    challengeAccepted = true;

    const aal = await waitForAal2Session();
    if (aal.currentLevel !== 'aal2') {
      throw new Error('O segundo fator foi aceito, mas a sessão ainda não atingiu AAL2.');
    }

    await refreshFactors();

    if (enrollment) {
      const purpose = enrollmentPurpose;
      enrollment = null;
      activeFactorId = null;
      renderManage();
      say(purpose === 'recovery'
        ? 'Autenticador de recuperação ativado. Agora você possui uma segunda opção para confirmar o login.'
        : 'MFA ativado. Recomendamos cadastrar também um autenticador de recuperação.', 'ok');
      return;
    }

    if (manageRequested || verifiedFactors.length < 2) {
      renderManage();
      say(verifiedFactors.length < 2
        ? 'MFA confirmado. Antes de depender de um único dispositivo, cadastre um autenticador de recuperação.'
        : 'MFA confirmado. Você pode gerenciar os fatores verificados abaixo.', verifiedFactors.length >= 2 ? 'ok' : '');
      return;
    }

    say('MFA confirmado. Abrindo o painel...', 'ok');
    location.replace('./index.html');
  } catch (error) {
    console.error('[admin-mfa] verificação falhou:', error);
    if (challengeAccepted) {
      say('MFA confirmado. A sessão segura está terminando de sincronizar; abrindo o painel...', 'ok');
      setTimeout(() => location.replace('./index.html'), 500);
      return;
    }
    if ($('mfa-code')) {
      $('mfa-code').value = '';
      $('mfa-code').focus();
    }
    say('Código inválido ou expirado. Gere um novo código no autenticador selecionado e tente novamente.', 'error');
  } finally {
    setBusy(false);
  }
}

$('mfa-verify')?.addEventListener('click', verify);
$('mfa-code')?.addEventListener('keydown', event => {
  if (event.key === 'Enter') verify();
});
$('mfa-code')?.addEventListener('input', event => {
  event.currentTarget.value = event.currentTarget.value.replace(/\D/g, '').slice(0, 6);
});
$('mfa-factor-select')?.addEventListener('change', event => {
  activeFactorId = event.currentTarget.value || null;
  $('mfa-code')?.focus();
});
$('mfa-factor-list')?.addEventListener('click', event => {
  const button = event.target.closest('[data-factor-id]');
  if (button) removeFactor(button.dataset.factorId);
});
$('mfa-add-backup')?.addEventListener('click', async () => {
  if (busy) return;
  setBusy(true);
  try {
    await startEnrollment('recovery');
  } catch (error) {
    console.error('[admin-mfa] cadastro de recuperação falhou:', error);
    say(error?.message || 'Não foi possível iniciar o cadastro do autenticador de recuperação.', 'error');
  } finally {
    setBusy(false);
  }
});
$('mfa-cancel-enroll')?.addEventListener('click', cancelRecoveryEnrollment);
$('mfa-open-panel')?.addEventListener('click', () => location.replace('./index.html'));
$('mfa-logout')?.addEventListener('click', () => logoutAdmin());
$('mfa-manage-logout')?.addEventListener('click', () => logoutAdmin());

initialize();
