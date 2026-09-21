import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import { updateOwnDossierIdentity } from './my-profile-dossier-v15.js?v=20260905-institutional-scout-exclusion-v15-3';
import { signupHandleFromUser } from './identity-public-launch-v6.js?v=20260825-identity-public-v6-1';
import {
  COMMUNITY_TIER_GLYPHS,
  communityTierState,
  pointPreviewValues,
  tierRequirementParts
} from './my-profile-experience-v7.js?v=20260825-identity-experience-v7-1';
import {
  activateIdentityAliveV8,
  celebrateIdentitySave,
  clearIdentityGateway,
  initializeIdentityAliveV8,
  renderIdentityGateway,
  syncIdentityAliveJourney,
  syncIdentityAlivePolicy
} from './my-profile-alive-v8.js?v=20260825-identity-alive-v8-1';

const $ = (id) => document.getElementById(id);
const HANDLE_RE = /^[a-z0-9](?:[a-z0-9._-]{1,22}[a-z0-9])$/;
const GENERATED_HANDLE_RE = /^player-[a-f0-9]{16}$/;
const EMAIL_LIKE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const ACCENTS = new Set(['violet','cyan','gold','emerald','rose','steel']);
const CREATOR_PLATFORMS = new Set(['youtube','twitch','tiktok','instagram','facebook','x','other']);
const RESEARCH_TYPES = new Set(['hero_skill_level','hero_passive','equipment_stat','patch_change','counter_evidence','other']);
const EVIDENCE_KINDS = new Set(['screenshot','video','official_link','community_link','text','other']);
const ACCENT_LABELS = { violet:'VIOLETA',cyan:'CIANO',gold:'DOURADO',emerald:'ESMERALDA',rose:'ROSA',steel:'AÇO' };
const TIER_ORDER = ['member','echo_scout','tracker','cartographer','analyst','vanguard','arena_legend'];
const TIER_LABELS = {
  member:'Member', echo_scout:'Echo Scout', tracker:'Rastreador', cartographer:'Cartógrafo',
  analyst:'Analista', vanguard:'Vanguarda', arena_legend:'Lenda da Arena'
};
const BADGE_LABELS = { creator:'Creator',partner:'Partner',moderator:'Moderator',developer:'Developer' };
const CLAIM_STATUS_LABELS = { pending:'Aguardando prova',verified:'Verificado',rejected:'Rejeitado',expired:'Expirado' };
const CONTRIBUTION_STATUS_LABELS = {
  pending:'Em revisão', corroborated:'Corroborada', verified:'Verificada', rejected:'Rejeitada',
  contested:'Contestada', superseded:'Substituída'
};
const CONTRIBUTION_CONFIRMATION_LABELS = {
  awaiting_confirmation:'Aguardando 2ª confirmação',
  confirmed:'Confirmada por revisão independente',
  disputed:'Decisão divergente · nova revisão necessária',
  ineligible_self_review:'Revisão inelegível · não pontua',
  not_applicable:'Sem efeito de reputação',
  schema_unavailable:'Confirmação V5 ainda indisponível'
};
const CONTRIBUTION_TYPE_LABELS = {
  hero_skill_level:'Habilidade de herói', hero_passive:'Passiva de herói', hero_skill_audit:'Auditoria de habilidade', equipment_stat:'Equipamento',
  patch_change:'Mudança de patch', counter_evidence:'Evidência de counter', other:'Pesquisa'
};

let currentUserId = null;
let currentAuthUser = null;
let rollout = null;
let savedIdentity = null;
let researchHeroes = [];
let researchSkills = [];
let researchCatalogReady = false;

function setState(title, description, action = '') {
  $('my-profile-editor').hidden = true;
  $('my-profile-state').hidden = false;
  $('my-profile-state').replaceChildren();
  if (action === 'login' && renderIdentityGateway(
    $('my-profile-state'),
    () => document.getElementById('echo-module-login')?.click()
  )) return;
  clearIdentityGateway($('my-profile-state'));
  const kicker = document.createElement('span'); kicker.className = 'my-profile-kicker'; kicker.textContent = 'ECHO IDENTITY';
  const h1 = document.createElement('h1'); h1.textContent = title;
  const p = document.createElement('p'); p.textContent = description;
  $('my-profile-state').append(kicker,h1,p);
  if (action === 'login') {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'my-profile-save'; button.textContent = 'Entrar ou criar conta';
    button.addEventListener('click',()=>document.getElementById('echo-module-login')?.click());
    $('my-profile-state').append(button);
  }
}

function setMessage(message = '', type = '') {
  const el = $('my-profile-message'); el.textContent = message; el.className = `my-profile-message${type ? ` is-${type}` : ''}`;
}
function setCreatorMessage(message = '', type = '') {
  const el = $('creator-message'); el.textContent = message; el.className = `my-profile-message${type ? ` is-${type}` : ''}`;
}
function setResearchMessage(message = '', type = '') {
  const el = $('research-message'); el.textContent = message; el.className = `my-profile-message${type ? ` is-${type}` : ''}`;
}
function setResearchCatalogStatus(message = '', type = '') {
  const el = $('research-catalog-status'); if (!el) return; el.textContent = message; el.className = `research-catalog-status${type ? ` is-${type}` : ''}`;
}
function publicRolloutReady() {
  return Boolean(rollout?.public_identity_enabled && rollout?.public_profiles_enabled && rollout?.identity_cards_enabled);
}
function creatorRolloutReady() {
  return Boolean(rollout?.public_identity_enabled && rollout?.creator_verification_enabled);
}
function researchRolloutReady() {
  return Boolean(rollout?.public_identity_enabled && rollout?.research_submission_enabled);
}
function initials(name) {
  return String(name || 'EA').trim().split(/\s+/).slice(0,2).map((part)=>part[0]||'').join('').toUpperCase() || 'EA';
}
function safeAvatarUrl(value) {
  const url = String(value || '').trim(); return /^https:\/\//i.test(url) ? url : '';
}
function formatDate(value) {
  const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'});
}
function formatNumber(value) { return Number(value || 0).toLocaleString('pt-BR'); }
function formatPercent(value, emptyWhenNoDecisions = false, decidedCount = 0) {
  if (emptyWhenNoDecisions && Number(decidedCount || 0) === 0) return '—';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return `${Math.round(numeric * 100)}%`;
}
function updateBioCounter() { $('profile-bio-counter').textContent = `${$('profile-bio-input').value.length}/240`; }
function selectedAccent() { return document.querySelector('input[name="accent"]:checked')?.value || 'violet'; }
function selectedVisibility() { return document.querySelector('input[name="visibility"]:checked')?.value || 'private'; }

function renderPreview() {
  const display = $('profile-display-input').value.trim() || 'Seu nome';
  const handle = $('profile-handle-input').value.trim().toLowerCase();
  const bio = $('profile-bio-input').value.trim() || 'Sua bio aparecerá aqui.';
  const accent = ACCENTS.has(selectedAccent()) ? selectedAccent() : 'violet';
  $('preview-name').textContent = display;
  $('preview-handle').textContent = handle ? `@${handle}` : '@seu-apelido';
  $('preview-bio').textContent = bio;
  $('preview-accent').textContent = ACCENT_LABELS[accent] || ACCENT_LABELS.violet;
  $('preview-accent').className = `my-profile-preview-accent${accent === 'violet' ? '' : ` preview-accent-${accent}`}`;
  $('identity-v7-preview').dataset.accent = accent;
  const avatar = safeAvatarUrl(savedIdentity?.avatar_url);
  $('preview-avatar').replaceChildren();
  if (avatar) {
    const img = document.createElement('img'); img.src = avatar; img.alt = `Avatar de ${display}`; $('preview-avatar').appendChild(img);
  } else $('preview-avatar').textContent = initials(display);
  updateOwnDossierIdentity({display_name:display,public_handle:handle,bio:$('profile-bio-input').value.trim(),profile_accent:accent,avatar_url:avatar,profile_visibility:selectedVisibility()});
}

function configureVisibilityControl() {
  const ready = publicRolloutReady();
  const publicRadio = $('profile-public-radio');
  publicRadio.disabled = !ready;
  $('profile-public-option').classList.toggle('is-disabled', !ready);
  $('profile-public-help').textContent = ready
    ? 'Seu perfil pode ser exibido publicamente quando você escolher esta opção.'
    : 'Bloqueado enquanto os gates seguros de identidade, perfil e card permanecerem desligados.';
  if (!ready) document.querySelector('input[name="visibility"][value="private"]').checked = true;
  updatePrivacyPill();
}
function updatePrivacyPill() {
  const isPublic = selectedVisibility() === 'public' && publicRolloutReady();
  $('my-profile-privacy-pill').textContent = isPublic ? 'PÚBLICO' : 'PRIVADO';
  $('preview-visibility').textContent = isPublic ? 'CARD PÚBLICO' : 'CARD PRIVADO';
  $('identity-v7-preview').classList.toggle('is-public',isPublic);
  updateOwnDossierIdentity({profile_visibility:isPublic ? 'public' : 'private'});
}
function configurePreviewLink(handle, visibility) {
  const link = $('my-profile-preview-link');
  const canOpen = Boolean(publicRolloutReady() && visibility === 'public' && HANDLE_RE.test(handle));
  if (canOpen) {
    link.href = `./perfil.html?u=${encodeURIComponent(handle)}`;
    link.hidden = false;
    link.setAttribute('aria-disabled','false');
  } else {
    link.hidden = true;
    link.removeAttribute('href');
    link.setAttribute('aria-disabled','true');
  }
}
function normalizeHandleInput() {
  const input = $('profile-handle-input'); input.value = input.value.toLowerCase().replace(/[^a-z0-9._-]/g,'').slice(0,24);
}

function mapBackendError(error) {
  const raw = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  const mappings = [
    ['public_handle_unavailable','Esse apelido já está em uso.'],
    ['reserved_public_handle','Esse apelido é reservado para identidade oficial do Echo Arena.'],
    ['invalid_public_handle','Use de 3 a 24 caracteres com letras minúsculas, números, ponto, hífen ou underline.'],
    ['handle_change_cooldown','Este apelido ainda está no período de espera para uma nova alteração.'],
    ['invalid_display_name','O nome de exibição precisa ter entre 2 e 40 caracteres.'],
    ['display_name_email_not_allowed','Use um nome ou apelido público; e-mail não pode ser usado como nome de perfil.'],
    ['display_name_invisible_characters','O nome contém caracteres invisíveis ou de controle não permitidos.'],
    ['display_name_reserved','Esse nome pode ser confundido com uma identidade oficial. Escolha outro.'],
    ['bio_too_long','A bio ultrapassou 240 caracteres.'],
    ['invalid_profile_accent','O acento visual selecionado não é válido.'],
    ['identity_public_rollout_disabled','Perfis públicos ainda estão bloqueados pelo rollout de segurança.'],
    ['creator_verification_rollout_disabled','Creator Verification ainda está bloqueado pelo rollout de segurança.'],
    ['creator_channel_already_verified','Esse canal já pertence a uma conta Creator verificada.'],
    ['creator_claim_already_pending','Esse canal já possui uma solicitação pendente nesta conta.'],
    ['creator_claim_rate_limited','Muitas solicitações recentes. Aguarde antes de tentar novamente.'],
    ['too_many_pending_creator_claims','Você já possui solicitações Creator aguardando verificação.'],
    ['invalid_creator_channel_url','Informe uma URL HTTPS válida do seu canal.'],
    ['creator_channel_platform_mismatch','A URL não corresponde à plataforma Creator escolhida.'],
    ['unsupported_creator_platform','A plataforma escolhida não é aceita neste fluxo.'],
    ['research_submission_rollout_disabled','O envio do Echo Research ainda está bloqueado pelo rollout de segurança.'],
    ['duplicate_research_submission','Este mesmo dado já foi enviado recentemente por esta conta.'],
    ['research_submission_rate_limited','Muitos envios nas últimas 24 horas. Aguarde antes de continuar.'],
    ['research_pending_queue_full','Sua fila pessoal está cheia. Aguarde a revisão das contribuições pendentes antes de enviar outra.'],
    ['research_knowledge_pending_limit','Você já possui evidências pendentes para este mesmo conhecimento. Aguarde a revisão antes de reenviar.'],
    ['research_knowledge_queue_saturated','A fila deste conhecimento já possui evidências suficientes. Aguarde a equipe concluir a revisão.'],
    ['research_knowledge_cooldown','Este conhecimento foi enviado recentemente por você. Aguarde o intervalo de segurança antes de acrescentar nova evidência.'],
    ['research_guardrail_policy_missing','A política de segurança do Echo Research não está disponível. O envio foi bloqueado sem alterar dados.'],
    ['invalid_contribution_type','O tipo de contribuição selecionado não é válido.'],
    ['invalid_subject_key','Descreva claramente o dado que está documentando.'],
    ['invalid_contribution_payload','A observação enviada é inválida ou grande demais.'],
    ['invalid_evidence_kind','O tipo de evidência selecionado não é válido.'],
    ['evidence_reference_too_long','A referência da evidência ficou grande demais.'],
    ['game_version_too_long','O patch/versão ficou grande demais.'],
    ['invalid_research_hero','O herói selecionado não existe ou não está disponível no catálogo atual.'],
    ['invalid_research_skill','A habilidade selecionada não existe ou não está disponível no catálogo atual.'],
    ['research_skill_requires_hero','Selecione o herói antes de selecionar uma habilidade.'],
    ['research_skill_hero_mismatch','A habilidade não pertence ao herói selecionado. Recarregue o catálogo e tente novamente.'],
    ['hero_skill_reference_required','Contribuições de nível exigem herói e habilidade reais do catálogo.'],
    ['hero_reference_required','Selecione o herói relacionado a esta passiva.'],
    ['passive_skill_reference_not_allowed','Passivas não podem ser registradas como uma das quatro habilidades.'],
    ['research_skill_level_required','Informe o nível observado da habilidade.'],
    ['research_skill_level_invalid','O nível informado precisa ser um número inteiro válido.'],
    ['research_skill_level_out_of_range','O nível informado está fora do limite cadastrado para esta habilidade.'],
    ['research_skill_level_catalog_missing','O catálogo não possui um limite seguro para esta habilidade; o envio foi bloqueado para revisão técnica.'],
    ['active_profile_required','Esta conta não está disponível para editar perfil.'],
    ['authentication_required','Sua sessão expirou. Entre novamente na conta.']
  ];
  for (const [needle,message] of mappings) if (raw.includes(needle)) return message;
  return 'A operação não foi confirmada. Nenhuma alteração provisória será tratada como concluída.';
}

function validateForm() {
  const handle = $('profile-handle-input').value.trim().toLowerCase();
  const displayName = $('profile-display-input').value.trim();
  const bio = $('profile-bio-input').value.trim();
  if (!HANDLE_RE.test(handle)) return 'Escolha um apelido válido com 3–24 caracteres.';
  if (displayName.length < 2 || displayName.length > 40) return 'O nome de exibição precisa ter entre 2 e 40 caracteres.';
  if (EMAIL_LIKE_RE.test(displayName)) return 'Use um nome ou apelido público; e-mail não pode ser usado como nome de perfil.';
  if (bio.length > 240) return 'A bio precisa ter no máximo 240 caracteres.';
  if (!ACCENTS.has(selectedAccent())) return 'Escolha um acento visual válido.';
  if (selectedVisibility() === 'public' && !publicRolloutReady()) return 'O perfil público continua bloqueado pelo rollout de segurança.';
  return null;
}

async function loadOwnIdentity(userId) {
  const [publicProfileResult,coreProfileResult] = await Promise.all([
    supabase.from('echo_public_profiles').select('public_handle,bio,profile_accent,profile_visibility,profile_completed_at,handle_changed_at').eq('user_id',userId).maybeSingle(),
    supabase.from('profiles').select('display_name,avatar_url').eq('id',userId).maybeSingle()
  ]);
  if (publicProfileResult.error) throw publicProfileResult.error;
  if (coreProfileResult.error) throw coreProfileResult.error;
  if (!publicProfileResult.data) throw new Error('identity_profile_missing');
  return {...publicProfileResult.data,display_name:coreProfileResult.data?.display_name || '',avatar_url:coreProfileResult.data?.avatar_url || ''};
}

function fillForm(identity, user = currentAuthUser) {
  savedIdentity = identity;
  const storedHandle = String(identity.public_handle || '');
  const signupHandle = signupHandleFromUser(user);
  const generatedHandle = GENERATED_HANDLE_RE.test(storedHandle);
  const chosenHandle = generatedHandle ? signupHandle : storedHandle;
  const legacyDisplay = String(identity.display_name || '').trim();
  $('profile-handle-input').value = chosenHandle;
  $('profile-display-input').value = EMAIL_LIKE_RE.test(legacyDisplay) ? '' : legacyDisplay;
  $('profile-bio-input').value = String(identity.bio || '');
  const accent = ACCENTS.has(identity.profile_accent) ? identity.profile_accent : 'violet';
  document.querySelector(`input[name="accent"][value="${accent}"]`)?.click();
  const desiredVisibility = identity.profile_visibility === 'public' && publicRolloutReady() ? 'public' : 'private';
  document.querySelector(`input[name="visibility"][value="${desiredVisibility}"]`)?.click();
  configureVisibilityControl(); updateBioCounter(); renderPreview(); configurePreviewLink(chosenHandle,desiredVisibility);
  const notices = [];
  if (generatedHandle && signupHandle) notices.push('Revise o apelido escolhido no cadastro e salve para confirmá-lo no servidor.');
  if (EMAIL_LIKE_RE.test(legacyDisplay)) notices.push('Escolha um nome de exibição. O e-mail legado foi removido desta prévia e não será usado como identidade pública.');
  if (notices.length) setMessage(notices.join(' '));
}

async function saveProfile(event) {
  event.preventDefault(); setMessage();
  const validation = validateForm(); if (validation) { setMessage(validation,'error'); return; }
  const handle = $('profile-handle-input').value.trim().toLowerCase();
  const displayName = $('profile-display-input').value.trim();
  const bio = $('profile-bio-input').value.trim();
  const accent = selectedAccent();
  const visibility = publicRolloutReady() ? selectedVisibility() : 'private';
  const button = $('my-profile-save'); button.disabled = true; button.textContent = 'Salvando…';
  try {
    const {data,error} = await supabase.rpc('echo_set_my_public_identity_v1',{
      p_handle:handle,p_display_name:displayName,p_bio:bio || null,p_accent:accent,p_visibility:visibility,p_allow_messages:false
    });
    if (error) throw error;
    savedIdentity = {...(savedIdentity || {}),...(data || {}),avatar_url:savedIdentity?.avatar_url || ''};
    fillForm(savedIdentity);
    setMessage('Perfil salvo com sucesso. Nenhum e-mail foi usado como identidade pública.','success');
    celebrateIdentitySave();
  } catch (error) { setMessage(mapBackendError(error),'error'); }
  finally { button.disabled = false; button.textContent = 'Salvar perfil'; }
}

function bindForm() {
  $('profile-handle-input').addEventListener('input',()=>{ normalizeHandleInput(); renderPreview(); });
  $('profile-display-input').addEventListener('input',renderPreview);
  $('profile-bio-input').addEventListener('input',()=>{ updateBioCounter(); renderPreview(); });
  document.querySelectorAll('input[name="accent"]').forEach((input)=>input.addEventListener('change',renderPreview));
  document.querySelectorAll('input[name="visibility"]').forEach((input)=>input.addEventListener('change',()=>{
    updatePrivacyPill(); configurePreviewLink($('profile-handle-input').value.trim().toLowerCase(),selectedVisibility());
  }));
  $('research-type').addEventListener('change',configureResearchStructure);
  $('research-hero').addEventListener('change',()=>{ renderResearchSkillOptions(); configureResearchStructure(); });
  $('research-skill').addEventListener('change',configureResearchStructure);
  $('research-skill-level').addEventListener('input',updateResearchCanonicalSubject);
  $('my-profile-form').addEventListener('submit',saveProfile);
  $('research-form').addEventListener('submit',submitResearchContribution);
  $('creator-form').addEventListener('submit',requestCreatorVerification);
}

function normalizedPolicyRules(rules) {
  if (!Array.isArray(rules)) return [];
  return rules
    .filter((row)=>TIER_ORDER.includes(row.tier) && Number.isFinite(Number(row.ordinal)))
    .slice()
    .sort((a,b)=>Number(a.ordinal)-Number(b.ordinal));
}

function renderScoutTrack(tier, rules = [], reputation = null) {
  const root = $('my-scout-track'); const next = $('my-scout-next'); root.replaceChildren(); next.replaceChildren();
  const currentIndex = TIER_ORDER.indexOf(tier);
  const normalizedRules = normalizedPolicyRules(rules);
  TIER_ORDER.forEach((key,index)=>{
    const step = document.createElement('button'); step.type = 'button'; step.className = 'my-scout-step'; step.dataset.tier = key;
    step.setAttribute('aria-pressed','false');
    step.title = `Explorar a insígnia ${TIER_LABELS[key]} no card`;
    const state = communityTierState(tier,key);
    step.dataset.state = state;
    if (state === 'reached' || state === 'current') step.classList.add('reached');
    if (state === 'locked') step.classList.add('locked');
    if (state === 'current') { step.classList.add('current'); step.setAttribute('aria-current','step'); }
    const mark = document.createElement('span'); mark.className = 'identity-v7-insignia-mark'; mark.textContent = COMMUNITY_TIER_GLYPHS[key] || '•'; mark.setAttribute('aria-hidden','true');
    const label = document.createElement('strong'); label.textContent = TIER_LABELS[key];
    const status = document.createElement('span'); status.className = 'identity-v7-insignia-state';
    status.textContent = state === 'current' ? 'ATUAL' : state === 'reached' ? 'CONQUISTADA' : state === 'locked' ? 'BLOQUEADA' : 'AGUARDANDO';
    const rule = normalizedRules.find((row)=>row.tier===key);
    const requirements = document.createElement('span'); requirements.className = 'identity-v7-insignia-rule';
    const parts = tierRequirementParts(rule);
    requirements.textContent = parts.length ? parts.join(' · ') : key === 'member' ? 'Início da jornada' : 'Requisitos do servidor';
    step.setAttribute('aria-label',`${TIER_LABELS[key]}: ${status.textContent.toLowerCase()}. ${requirements.textContent}`);
    step.append(mark,label,status,requirements); root.appendChild(step);
  });

  if (currentIndex < 0) {
    const unavailable = document.createElement('span'); unavailable.textContent = 'A coleção está visível, mas seu nível atual ainda não pôde ser confirmado.'; next.appendChild(unavailable); return;
  }

  if (currentIndex === TIER_ORDER.length-1) {
    const text = document.createTextNode('Você alcançou '); const strong = document.createElement('strong'); strong.textContent = 'Lenda da Arena';
    next.append(text,strong,document.createTextNode(', o topo da trilha comunitária atual.')); return;
  }

  const nextTier = TIER_ORDER[currentIndex+1];
  const nextRule = normalizedRules.find((row)=>row.tier===nextTier);
  const strong = document.createElement('strong'); strong.textContent = TIER_LABELS[nextTier];
  next.append(document.createTextNode('Próximo marco: '),strong);
  if (!nextRule || !reputation) {
    next.append(document.createTextNode('. Os requisitos exatos dependem da política versionada do servidor.')); return;
  }

  const missing = [];
  const pointsLeft = Math.max(0,Number(nextRule.min_points||0)-Number(reputation.reputation_points||0));
  const verifiedLeft = Math.max(0,Number(nextRule.min_verified||0)-Number(reputation.verified_count||0));
  const firstLeft = Math.max(0,Number(nextRule.min_first_discoveries||0)-Number(reputation.first_discoveries||0));
  const minRate = Number(nextRule.min_acceptance_rate||0);
  const currentRate = Number(reputation.acceptance_rate||0);
  if (pointsLeft) missing.push(`${formatNumber(pointsLeft)} pontos`);
  if (verifiedLeft) missing.push(`${formatNumber(verifiedLeft)} verificadas`);
  if (firstLeft) missing.push(`${formatNumber(firstLeft)} primeiras descobertas`);
  if (minRate>0 && currentRate<minRate) missing.push(`taxa mínima ${formatPercent(minRate)} (atual ${formatPercent(currentRate,true,reputation.decided_count)})`);
  next.append(document.createTextNode(missing.length ? `. Ainda falta: ${missing.join(' · ')}.` : '. Os requisitos atuais estão atendidos; o tier definitivo continua sendo o valor recalculado pelo servidor.'));
}

function setLaunchPointPreview(values, policyVersion = '') {
  $('identity-v7-launch-corroborated').textContent = values ? `+${formatNumber(values.corroborated)}` : '—';
  $('identity-v7-launch-verified').textContent = values ? `+${formatNumber(values.verified)}` : '—';
  $('identity-v7-launch-first').textContent = values ? `+${formatNumber(values.firstTotal)}` : '—';
  $('identity-v7-launch-policy').textContent = values
    ? `Pesos confirmados pelo servidor · ${String(policyVersion || 'política ativa').toUpperCase()}`
    : 'Política de pontos indisponível · nenhum valor foi presumido';
}

function renderReputationPolicy(meta, rules, reputation) {
  const pointRoot = $('my-reputation-points'); const ruleRoot = $('my-reputation-rules');
  pointRoot.replaceChildren(); ruleRoot.replaceChildren();
  const normalized = normalizedPolicyRules(rules);
  const pointValues = pointPreviewValues(meta);
  if (!meta || !normalized.length || !pointValues) {
    syncIdentityAlivePolicy(null);
    setLaunchPointPreview(null);
    $('my-reputation-policy-version').textContent = 'POLÍTICA INDISPONÍVEL';
    const unavailable = document.createElement('div'); unavailable.className = 'my-reputation-loading'; unavailable.textContent = 'A política versionada não está disponível neste backend.'; pointRoot.appendChild(unavailable);
    const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 5; td.textContent = 'Regras indisponíveis. Nenhum threshold será inventado pelo cliente.'; tr.appendChild(td); ruleRoot.appendChild(tr);
    $('my-reputation-formula').textContent = 'A fórmula de qualidade será exibida quando o servidor disponibilizar a política versionada.';
    $('my-reputation-current').textContent = 'O cliente não estima promoção sem a política do servidor.';
    return;
  }

  const policyVersion = String(meta.policy_version || reputation?.policy_version || 'policy');
  syncIdentityAlivePolicy(meta);
  setLaunchPointPreview(pointValues,policyVersion);
  $('my-reputation-policy-version').textContent = `POLÍTICA ${policyVersion.toUpperCase()}`;
  const pointCards = [
    ['CORROBORADA',`+${formatNumber(pointValues.corroborated)}`,'Dado aceito como plausível depois de uma decisão confirmada.','corroborated'],
    ['VERIFICADA',`+${formatNumber(pointValues.verified)}`,'Dado comprovado e confirmado por um segundo revisor independente.','verified'],
    ['PRIMEIRA DESCOBERTA',`+${formatNumber(pointValues.firstTotal)} total`,`${formatNumber(pointValues.verified)} da verificação + ${formatNumber(pointValues.firstBonus)} de bônus por ser a primeira descoberta confirmada.`,'first'],
    ['ENVIO / PENDÊNCIA / RECUSA','+0','Enviar, aguardar revisão, repetir ou ter uma decisão não aceita não acrescenta pontos.','zero']
  ];
  for (const [label,value,description,className] of pointCards) {
    const article = document.createElement('article'); article.className = className;
    const small = document.createElement('small'); small.textContent = label;
    const strong = document.createElement('strong'); strong.textContent = value;
    const span = document.createElement('span'); span.textContent = description;
    article.append(small,strong,span); pointRoot.appendChild(article);
  }

  for (const rule of normalized) {
    const tr = document.createElement('tr');
    const values = [
      rule.label || TIER_LABELS[rule.tier] || rule.tier,
      formatNumber(rule.min_points),
      formatNumber(rule.min_verified),
      Number(rule.min_first_discoveries||0) ? formatNumber(rule.min_first_discoveries) : '—',
      Number(rule.min_acceptance_rate||0) ? formatPercent(rule.min_acceptance_rate) : '—'
    ];
    for (const value of values) { const td = document.createElement('td'); td.textContent = value; tr.appendChild(td); }
    if (reputation?.community_tier === rule.tier) tr.classList.add('current-rule');
    ruleRoot.appendChild(tr);
  }

  $('my-reputation-formula').textContent = 'Taxa de aceitação = (verificadas + corroboradas) ÷ (verificadas + corroboradas + rejeitadas + contestadas). Pendente e substituída não entram no denominador; obsolescência/espera não são tratadas como erro.';
  if (reputation) {
    const rate = formatPercent(reputation.acceptance_rate,true,reputation.decided_count);
    $('my-reputation-current').textContent = `Seu cálculo atual: ${formatNumber(reputation.reputation_points)} pontos · ${formatNumber(reputation.accepted_count)} aceitas de ${formatNumber(reputation.decided_count)} decisões · taxa ${rate} · política ${reputation.policy_version || policyVersion}.`;
  } else $('my-reputation-current').textContent = 'A reputação desta conta ainda não está disponível.';
}

function renderPreviewJourney(reputation, badges, availability = {}) {
  const preview = $('identity-v7-preview');
  const tier = String(reputation?.community_tier || '');
  const knownTier = TIER_ORDER.includes(tier);
  preview.dataset.tier = knownTier ? tier : 'unavailable';
  $('preview-tier-glyph').textContent = knownTier ? (COMMUNITY_TIER_GLYPHS[tier] || '•') : '?';
  $('preview-tier').textContent = availability.institutional
    ? 'NÃO PARTICIPA'
    : availability.reputationUnavailable
      ? 'INDISPONÍVEL'
    : knownTier ? TIER_LABELS[tier].toUpperCase() : 'SEM NÍVEL CONFIRMADO';
  syncIdentityAliveJourney({
    tier: knownTier ? tier : '',
    label: availability.institutional ? 'NÃO PARTICIPA' : availability.reputationUnavailable ? 'INDISPONÍVEL' : knownTier ? TIER_LABELS[tier] : 'SEM NÍVEL CONFIRMADO',
    glyph: knownTier ? (COMMUNITY_TIER_GLYPHS[tier] || '•') : '?',
    unavailable: availability.reputationUnavailable || !knownTier
  });

  const row = $('preview-institutional-badges'); row.replaceChildren();
  if (availability.badgesUnavailable) {
    const unavailable = document.createElement('span'); unavailable.textContent = 'RECONHECIMENTOS INDISPONÍVEIS'; row.appendChild(unavailable); return;
  }
  const active = Array.isArray(badges) ? badges.filter((badge)=>badge.active && BADGE_LABELS[badge.badge_type]) : [];
  updateOwnDossierIdentity({institutional_badges:active.map(badge=>badge.badge_type)});
  for (const badge of active) {
    const el = document.createElement('span'); el.textContent = BADGE_LABELS[badge.badge_type]; row.appendChild(el);
  }
}

function renderJourney(reputation, badges, policyMeta = null, policyRules = [], availability = {}) {
  const scoutReputation=availability.institutional?null:reputation;
  $('my-scout-tier').textContent = scoutReputation ? (TIER_LABELS[scoutReputation.community_tier] || scoutReputation.community_tier || 'Member') : '—';
  $('my-scout-points').textContent = scoutReputation ? formatNumber(scoutReputation.reputation_points) : '—';
  $('my-scout-acceptance').textContent = scoutReputation ? formatPercent(scoutReputation.acceptance_rate,true,scoutReputation.decided_count) : '—';
  $('my-scout-verified').textContent = scoutReputation ? formatNumber(scoutReputation.verified_count) : '—';
  $('my-scout-corroborated').textContent = scoutReputation ? formatNumber(scoutReputation.corroborated_count) : '—';
  $('my-scout-first').textContent = scoutReputation ? formatNumber(scoutReputation.first_discoveries) : '—';
  renderScoutTrack(scoutReputation?.community_tier || '',policyRules,scoutReputation);
  if (availability.reputationUnavailable) {
    const next = $('my-scout-next'); next.replaceChildren();
    next.appendChild(document.createTextNode('Não foi possível confirmar sua reputação agora. Nenhum nível ou progresso foi presumido.'));
  }
  renderReputationPolicy(policyMeta,policyRules,scoutReputation);
  renderPreviewJourney(scoutReputation,badges,availability);
  const row = $('my-institutional-badges'); row.replaceChildren();
  if (availability.badgesUnavailable) {
    const unavailable = document.createElement('span'); unavailable.className = 'my-profile-badge-empty'; unavailable.textContent = 'Não foi possível confirmar seus reconhecimentos agora. Nenhuma ausência foi presumida.'; row.appendChild(unavailable); return;
  }
  const active = Array.isArray(badges) ? badges.filter((badge)=>badge.active && BADGE_LABELS[badge.badge_type]) : [];
  if (!active.length) {
    const empty = document.createElement('span'); empty.className = 'my-profile-badge-empty'; empty.textContent = 'Nenhum reconhecimento institucional concedido.'; row.appendChild(empty); return;
  }
  for (const badge of active) {
    const el = document.createElement('span'); el.className = `my-profile-badge ${badge.badge_type}`; el.textContent = BADGE_LABELS[badge.badge_type]; row.appendChild(el);
  }
}

async function loadJourney() {
  const [repResult,badgesResult,metaResult,rulesResult] = await Promise.all([
    supabase.from('echo_community_reputation').select('scout_eligible,community_tier,reputation_points,verified_count,corroborated_count,first_discoveries,acceptance_rate,accepted_count,decided_count,policy_version').eq('user_id',currentUserId).maybeSingle(),
    supabase.from('echo_identity_badges').select('badge_type,active').eq('user_id',currentUserId).eq('active',true),
    supabase.from('echo_reputation_policy_meta').select('policy_version,verified_points,corroborated_points,first_discovery_bonus').eq('singleton',true).maybeSingle(),
    supabase.from('echo_reputation_tier_rules').select('policy_version,tier,ordinal,label,min_points,min_verified,min_first_discoveries,min_acceptance_rate').order('ordinal',{ascending:true})
  ]);
  const availability = {
    reputationUnavailable:Boolean(repResult.error),
    badgesUnavailable:Boolean(badgesResult.error),
    policyUnavailable:Boolean(metaResult.error || rulesResult.error)
  };
  const reputation = availability.reputationUnavailable ? null : repResult.data;
  if(reputation?.scout_eligible===false){
    availability.institutional=true;
    reputation.community_tier='';
  }
  const badges = availability.badgesUnavailable ? [] : (badgesResult.data || []);
  const meta = availability.policyUnavailable ? null : metaResult.data;
  const rules = availability.policyUnavailable ? [] : (rulesResult.data || []);
  renderJourney(reputation,badges,meta,rules,availability);
}

function renderContributions(rows) {
  const root = $('my-contributions'); root.replaceChildren();
  if (!Array.isArray(rows) || !rows.length) {
    const empty = document.createElement('div'); empty.className = 'my-contribution-empty'; empty.textContent = 'Você ainda não possui contribuições registradas no Echo Research.'; root.appendChild(empty); return;
  }
  for (const row of rows) {
    const confirmationState=String(row.review_confirmation_state||'schema_unavailable');
    const firstConfirmed=Boolean(row.is_first_discovery&&confirmationState==='confirmed');
    const firstCandidate=Boolean(row.is_first_discovery&&!firstConfirmed);
    const article = document.createElement('article'); article.className = `my-contribution${firstConfirmed?' is-first':firstCandidate?' is-first-candidate':''}`;
    const copy = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = row.subject_key || CONTRIBUTION_TYPE_LABELS[row.contribution_type] || 'Contribuição';
    const detail = document.createElement('p');
    const typeLabel = CONTRIBUTION_TYPE_LABELS[row.contribution_type] || 'Pesquisa';
    detail.textContent = `${typeLabel}${row.game_version ? ` · patch ${row.game_version}` : ''}`;
    copy.append(title,detail);
    const meta = document.createElement('div'); meta.className = 'my-contribution-meta';
    const status = document.createElement('span'); status.className = `my-contribution-status ${row.status || 'pending'}`; status.textContent = CONTRIBUTION_STATUS_LABELS[row.status] || row.status || 'Desconhecido'; meta.appendChild(status);
    const confirmationLabel=CONTRIBUTION_CONFIRMATION_LABELS[confirmationState];
    if (confirmationLabel) { const confirmation=document.createElement('span'); confirmation.className=`my-contribution-confirmation ${confirmationState}`; confirmation.textContent=confirmationLabel; meta.appendChild(document.createElement('br')); meta.appendChild(confirmation); }
    if (row.is_first_discovery) {
      const first = document.createElement('span'); first.className = 'my-contribution-first';
      first.textContent=firstConfirmed?'Primeira descoberta confirmada':confirmationState==='awaiting_confirmation'?'Candidata à primeira descoberta':confirmationState==='disputed'?'Primeira descoberta contestada':'Primeira descoberta sem efeito';
      meta.appendChild(document.createElement('br')); meta.appendChild(first);
    }
    const date = document.createElement('small'); date.className = 'my-contribution-date'; date.textContent = row.reviewed_at ? `Decisão ${formatDate(row.reviewed_at)}${Number(row.review_revision)>1?` · revisão ${row.review_revision}`:''}` : `Enviada ${formatDate(row.submitted_at)}`; meta.appendChild(date);
    article.append(copy,meta); root.appendChild(article);
  }
}

async function loadContributions() {
  let result = await supabase
    .from('echo_research_contributions')
    .select('id,contribution_type,subject_key,game_version,status,is_first_discovery,submitted_at,reviewed_at,review_confirmation_state,current_review_event_id,review_revision')
    .eq('contributor_id',currentUserId)
    .order('submitted_at',{ascending:false})
    .limit(30);
  if (result.error&&/review_confirmation_state|current_review_event_id|review_revision/i.test(String(result.error.message||''))) {
    result=await supabase
      .from('echo_research_contributions')
      .select('id,contribution_type,subject_key,game_version,status,is_first_discovery,submitted_at,reviewed_at')
      .eq('contributor_id',currentUserId)
      .order('submitted_at',{ascending:false})
      .limit(30);
    if(!result.error) result.data=(result.data||[]).map((row)=>({...row,review_confirmation_state:'schema_unavailable',review_revision:0}));
  }
  if (result.error) {
    const root = $('my-contributions'); root.replaceChildren(); const empty = document.createElement('div'); empty.className = 'my-contribution-empty'; empty.textContent = 'Não foi possível carregar seu histórico de contribuições agora.'; root.appendChild(empty); return;
  }
  renderContributions(result.data || []);
}

function researchTypeUsesHero(type) {
  return type === 'hero_skill_level' || type === 'hero_passive' || type === 'counter_evidence';
}
function researchTypeUsesSkill(type) {
  return type === 'hero_skill_level' || type === 'counter_evidence';
}
function researchHeroById(id) { return researchHeroes.find((row)=>row.id===id) || null; }
function researchSkillById(id) { return researchSkills.find((row)=>row.id===id) || null; }
function resetSelect(select, placeholder) {
  select.replaceChildren(); const option = document.createElement('option'); option.value=''; option.textContent=placeholder; select.appendChild(option);
}
function renderResearchHeroOptions() {
  const select=$('research-hero'); const previous=select.value; resetSelect(select,'Selecionar herói');
  for (const hero of researchHeroes) { const option=document.createElement('option'); option.value=hero.id; option.textContent=hero.name; select.appendChild(option); }
  if (researchHeroById(previous)) select.value=previous;
}
function renderResearchSkillOptions() {
  const select=$('research-skill'); const previous=select.value; const heroId=$('research-hero').value; resetSelect(select,'Selecionar habilidade');
  for (const skill of researchSkills.filter((row)=>row.hero_id===heroId)) { const option=document.createElement('option'); option.value=skill.id; option.textContent=skill.name; select.appendChild(option); }
  if (researchSkillById(previous)?.hero_id===heroId) select.value=previous;
}
function updateResearchCanonicalSubject() {
  const type=$('research-type').value; const subject=$('research-subject');
  if (type!=='hero_skill_level') {
    if (subject.dataset.catalogGenerated==='true') { subject.value=''; subject.dataset.catalogGenerated='false'; }
    subject.readOnly=false; return;
  }
  subject.readOnly=true;
  const hero=researchHeroById($('research-hero').value); const skill=researchSkillById($('research-skill').value); const rawLevel=$('research-skill-level').value;
  const level=Number(rawLevel);
  if (hero&&skill&&Number.isInteger(level)&&level>0) {
    subject.value=`${hero.name} · ${skill.name} · nível ${level}`; subject.dataset.catalogGenerated='true';
  } else { subject.value=''; subject.dataset.catalogGenerated='true'; }
}
function configureResearchStructure() {
  const type=$('research-type').value; const usesHero=researchTypeUsesHero(type); const usesSkill=researchTypeUsesSkill(type);
  const hero=$('research-hero'); const skill=$('research-skill'); const level=$('research-skill-level');
  $('research-catalog-context').hidden=!usesHero;
  $('research-skill-field').hidden=!usesSkill;
  $('research-level-context').hidden=type!=='hero_skill_level';
  hero.disabled=!usesHero||!researchCatalogReady;
  hero.required=type==='hero_skill_level'||type==='hero_passive';
  skill.disabled=!usesSkill||!researchCatalogReady||!hero.value;
  skill.required=type==='hero_skill_level';
  level.disabled=type!=='hero_skill_level'||!researchCatalogReady;
  level.required=type==='hero_skill_level';

  if (!usesHero) { hero.value=''; renderResearchSkillOptions(); }
  if (!usesSkill) skill.value='';
  const selectedSkill=researchSkillById(skill.value);
  const maxLevel=Number(selectedSkill?.max_level);
  if (Number.isInteger(maxLevel)&&maxLevel>0) {
    level.max=String(maxLevel);
    $('research-level-help').textContent=`Nível válido para esta habilidade: 1–${maxLevel}, conforme o catálogo atual.`;
  } else {
    level.removeAttribute('max');
    $('research-level-help').textContent='Selecione uma habilidade para carregar o limite real de nível.';
  }
  updateResearchCanonicalSubject();
}
async function loadResearchCatalog() {
  if (!researchRolloutReady()) return;
  setResearchCatalogStatus('Carregando catálogo real de heróis e habilidades…');
  const [heroesResult,skillsResult]=await Promise.all([
    supabase.from('heroes').select('id,name,enabled,display_order').eq('enabled',true).order('display_order',{ascending:true}).order('name'),
    supabase.from('hero_skills').select('id,hero_id,name,max_level,enabled,display_order').eq('enabled',true).order('display_order',{ascending:true}).order('name')
  ]);
  if (heroesResult.error||skillsResult.error) {
    researchCatalogReady=false; researchHeroes=[]; researchSkills=[];
    setResearchCatalogStatus('O catálogo estruturado não pôde ser carregado. Envios que exigem herói/habilidade ficarão bloqueados.','error');
    configureResearchStructure(); return;
  }
  researchHeroes=Array.isArray(heroesResult.data)?heroesResult.data:[];
  researchSkills=Array.isArray(skillsResult.data)?skillsResult.data:[];
  researchCatalogReady=researchHeroes.length>0;
  renderResearchHeroOptions(); renderResearchSkillOptions(); configureResearchStructure();
  setResearchCatalogStatus(researchCatalogReady?'Catálogo carregado. IDs e limites exibidos serão revalidados pelo servidor no envio.':'Nenhum herói ativo está disponível no catálogo.','error');
  if (researchCatalogReady) setResearchCatalogStatus('Catálogo carregado. IDs e limites exibidos serão revalidados pelo servidor no envio.');
}
function resolveResearchReferences(type) {
  const heroId=researchTypeUsesHero(type)?$('research-hero').value||null:null;
  const skillId=researchTypeUsesSkill(type)?$('research-skill').value||null:null;
  if ((type==='hero_skill_level'||type==='hero_passive')&&!researchCatalogReady) return {error:'O catálogo real ainda não está disponível para este tipo de contribuição.'};
  if ((type==='hero_skill_level'||type==='hero_passive')&&!heroId) return {error:'Selecione o herói real relacionado a esta contribuição.'};
  const hero=heroId?researchHeroById(heroId):null;
  if (heroId&&!hero) return {error:'O herói selecionado não pertence ao catálogo carregado.'};
  if (type==='hero_skill_level'&&!skillId) return {error:'Selecione a habilidade real relacionada ao nível observado.'};
  const skill=skillId?researchSkillById(skillId):null;
  if (skillId&&(!skill||skill.hero_id!==heroId)) return {error:'A habilidade selecionada não pertence ao herói atual.'};
  if (type==='hero_skill_level') {
    const level=Number($('research-skill-level').value); const maxLevel=Number(skill?.max_level);
    if (!Number.isInteger(level)||level<1) return {error:'Informe um nível inteiro válido para a habilidade.'};
    if (!Number.isInteger(maxLevel)||maxLevel<1) return {error:'O catálogo não possui um limite seguro para esta habilidade.'};
    if (level>maxLevel) return {error:`O nível máximo cadastrado para esta habilidade é ${maxLevel}.`};
    return {heroId,skillId,skillLevel:level};
  }
  return {heroId,skillId,skillLevel:null};
}

function configureResearchCenter() {
  const enabled = researchRolloutReady();
  $('research-locked').hidden = enabled;
  $('research-form').hidden = !enabled;
  if (!enabled) { setResearchMessage(); setResearchCatalogStatus(); }
  else configureResearchStructure();
}

async function submitResearchContribution(event) {
  event.preventDefault(); setResearchMessage();
  if (!researchRolloutReady()) { setResearchMessage('O envio do Echo Research continua bloqueado pelo rollout de segurança.','error'); return; }
  const type = $('research-type').value;
  const subject = $('research-subject').value.trim();
  const version = $('research-version').value.trim();
  const observation = $('research-observation').value.trim();
  const evidenceKind = $('research-evidence-kind').value;
  const evidenceReference = $('research-evidence-reference').value.trim();
  if (!RESEARCH_TYPES.has(type)) { setResearchMessage('Selecione um tipo de dado válido.','error'); return; }
  const references=resolveResearchReferences(type); if (references.error) { setResearchMessage(references.error,'error'); return; }
  if (!subject || subject.length > 160) { setResearchMessage('Descreva claramente o dado que está documentando.','error'); return; }
  if (!observation || observation.length > 3000) { setResearchMessage('A observação precisa ter entre 1 e 3000 caracteres.','error'); return; }
  if (version.length > 80) { setResearchMessage('O patch/versão ficou grande demais.','error'); return; }
  if (!EVIDENCE_KINDS.has(evidenceKind)) { setResearchMessage('Selecione um tipo de evidência válido.','error'); return; }
  if (evidenceReference.length > 1200) { setResearchMessage('A referência da evidência ficou grande demais.','error'); return; }
  const payload=references.skillLevel?{observation,skill_level:references.skillLevel}:{observation};

  const button = $('research-submit'); button.disabled = true; button.textContent = 'Enviando…';
  try {
    const {error} = await supabase.rpc('echo_submit_research_contribution_v1',{
      p_contribution_type:type,
      p_subject_key:subject,
      p_payload:payload,
      p_hero_id:references.heroId,
      p_skill_id:references.skillId,
      p_game_version:version || null,
      p_evidence_kind:evidenceKind,
      p_evidence_reference:evidenceReference || null
    });
    if (error) throw error;
    $('research-subject').value = '';
    $('research-version').value = '';
    $('research-observation').value = '';
    $('research-evidence-reference').value = '';
    $('research-evidence-kind').value = 'text';
    $('research-hero').value=''; $('research-skill-level').value=''; renderResearchSkillOptions(); configureResearchStructure();
    setResearchMessage('Contribuição enviada como pendente. Ela só poderá afetar reputação após revisão e confirmação por outro Admin independente.','success');
    await loadContributions();
  } catch (error) { setResearchMessage(mapBackendError(error),'error'); }
  finally { button.disabled = false; button.textContent = 'Enviar para revisão'; }
}

function configureCreatorCenter() {
  const enabled = creatorRolloutReady();
  $('creator-locked').hidden = enabled;
  $('creator-form').hidden = !enabled;
  if (!enabled) {
    $('creator-claims').replaceChildren();
    setCreatorMessage();
  }
}

function claimStatusLabel(status) { return CLAIM_STATUS_LABELS[status] || status || 'Desconhecido'; }
function renderCreatorClaims(claims) {
  const root = $('creator-claims'); root.replaceChildren();
  if (!Array.isArray(claims) || !claims.length) {
    const empty = document.createElement('div'); empty.className = 'creator-claim-empty'; empty.textContent = 'Nenhuma solicitação Creator nesta conta.'; root.appendChild(empty); return;
  }
  for (const claim of claims) {
    const article = document.createElement('article'); article.className = 'creator-claim';
    const copy = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = `${String(claim.platform || '').toUpperCase()} · ${claim.channel_url || ''}`;
    const detail = document.createElement('p');
    const expires = claim.expires_at ? new Date(claim.expires_at).toLocaleDateString('pt-BR') : '—';
    detail.textContent = claim.status === 'pending' ? `Coloque temporariamente o código abaixo no perfil/descrição pública do canal. Expira em ${expires}.` : `Solicitação registrada. Último status: ${claimStatusLabel(claim.status)}.`;
    copy.append(title,detail);
    if (claim.status === 'pending' && claim.proof_code) {
      const proof = document.createElement('code'); proof.className = 'creator-proof'; proof.textContent = claim.proof_code; copy.appendChild(proof);
    }
    const meta = document.createElement('div'); meta.className = 'creator-claim-meta';
    const status = document.createElement('span'); status.className = `creator-status ${claim.status || 'pending'}`; status.textContent = claimStatusLabel(claim.status); meta.appendChild(status);
    article.append(copy,meta); root.appendChild(article);
  }
}

async function loadCreatorClaims() {
  if (!creatorRolloutReady()) return;
  const {data,error} = await supabase
    .from('echo_creator_claims')
    .select('id,platform,channel_url,proof_code,status,requested_at,expires_at,reviewed_at')
    .eq('user_id',currentUserId)
    .order('requested_at',{ascending:false})
    .limit(5);
  if (error) { setCreatorMessage('Não foi possível carregar suas solicitações Creator agora.','error'); return; }
  renderCreatorClaims(data || []);
}

async function requestCreatorVerification(event) {
  event.preventDefault(); setCreatorMessage();
  if (!creatorRolloutReady()) { setCreatorMessage('Creator Verification continua bloqueado pelo rollout de segurança.','error'); return; }
  const platform = $('creator-platform').value;
  const channelUrl = $('creator-channel-url').value.trim();
  if (!CREATOR_PLATFORMS.has(platform)) { setCreatorMessage('Escolha uma plataforma válida.','error'); return; }
  if (!/^https:\/\//i.test(channelUrl) || channelUrl.length > 1000) { setCreatorMessage('Informe a URL HTTPS oficial do seu canal.','error'); return; }
  const button = $('creator-request'); button.disabled = true; button.textContent = 'Gerando…';
  try {
    const {error} = await supabase.rpc('echo_request_creator_verification_v1',{p_platform:platform,p_channel_url:channelUrl});
    if (error) throw error;
    $('creator-channel-url').value = '';
    setCreatorMessage('Prova criada. Use o código exibido abaixo no seu canal e aguarde a revisão.','success');
    await loadCreatorClaims();
  } catch (error) { setCreatorMessage(mapBackendError(error),'error'); }
  finally { button.disabled = false; button.textContent = 'Gerar prova de propriedade'; }
}

async function load() {
  const {data:userData,error:userError} = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    setState('Entre na sua conta','Entre ou crie sua conta para configurar a identidade. Nenhum e-mail será exibido como nome público.','login'); return;
  }
  currentAuthUser = userData.user;
  currentUserId = userData.user.id;
  const rolloutResult = await supabase.rpc('echo_identity_rollout_status_v1');
  if (rolloutResult.error) {
    setState('Echo Identity ainda não instalado','O backend disponível não possui o contrato de identidade esperado. A página falhou fechado e nenhum dado foi alterado.'); return;
  }
  rollout = rolloutResult.data || {};
  let identity;
  try { identity = await loadOwnIdentity(currentUserId); }
  catch { setState('Perfil ainda indisponível','A estrutura de identidade desta conta ainda não está pronta no backend. Nenhum perfil provisório foi inventado.'); return; }
  bindForm(); fillForm(identity,userData.user); configureResearchCenter(); configureCreatorCenter();
  $('my-profile-state').hidden = true; $('my-profile-editor').hidden = false;
  activateIdentityAliveV8();
  await Promise.all([loadJourney(),loadContributions(),loadCreatorClaims(),loadResearchCatalog()]);
}

initializeIdentityAliveV8();
load().catch(()=>setState('Perfil indisponível','Não foi possível carregar esta área agora. Nenhuma alteração foi aplicada.'));
