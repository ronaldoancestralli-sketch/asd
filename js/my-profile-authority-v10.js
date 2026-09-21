import { updateOwnDossierAuthority } from './my-profile-dossier-v15.js?v=20260905-institutional-scout-exclusion-v15-3';

const INSTITUTIONAL_LABELS = Object.freeze({
  founder: 'FUNDADOR',
  admin: 'ADMIN',
  developer: 'DEVELOPER',
  moderator: 'MODERATOR',
  partner: 'PARTNER',
  creator: 'CREATOR'
});

const AUTHORITY_PRESENTATION = Object.freeze({
  founder: Object.freeze({
    eyebrow: 'ORIGIN AUTHORITY',
    label: 'FUNDADOR',
    subtitle: 'DIREÇÃO E GOVERNANÇA DA PLATAFORMA',
    emblem: '◆',
    cardLabel: 'ECHO ORIGIN ID',
    footerLabel: 'FOUNDER // ORIGIN'
  }),
  admin: Object.freeze({
    eyebrow: 'CONTROL NODE',
    label: 'ADMIN',
    subtitle: 'FUNÇÃO INSTITUCIONAL ATIVA',
    emblem: 'A',
    cardLabel: 'ECHO ADMIN ID',
    footerLabel: 'ADMIN // CONTROL'
  })
});

const ADMIN_FUNCTIONS = Object.freeze({
  heroes: Object.freeze({ glyph: 'H', label: 'ADMIN DE HERÓIS', short: 'HERÓIS' }),
  equipment: Object.freeze({ glyph: 'E', label: 'ADMIN DE EQUIPAMENTOS', short: 'EQUIPAMENTOS' }),
  publishing: Object.freeze({ glyph: 'P', label: 'ADMIN DE CONTEÚDO', short: 'CONTEÚDO' }),
  quality: Object.freeze({ glyph: 'Q', label: 'QUALIDADE DE DADOS', short: 'QUALIDADE' }),
  intelligence: Object.freeze({ glyph: 'I', label: 'INTELIGÊNCIA', short: 'INTELIGÊNCIA' }),
  moderation: Object.freeze({ glyph: 'M', label: 'MODERAÇÃO', short: 'MODERAÇÃO' })
});

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9._-]{1,22}[a-z0-9])$/;
const AUTHORITY_STYLESHEET = './css/my-profile-authority-v11.css?v=20260826-institutional-roles-v12-1';
const MEMBER_ONLY_SELECTORS = Object.freeze([
  '.identity-v7-launch',
  '#identity-v7-points',
  '.identity-v7-journey',
  '#my-research-v5',
  '.my-profile-section[aria-labelledby="contributions-title"]'
]);
let authority = null;
let adminContext = null;
let observer = null;
let activated = false;
let activationResult = null;

function element(id) { return document.getElementById(id); }

function ensureAuthorityStyles() {
  if (document.querySelector('link[data-identity-authority-v11]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = AUTHORITY_STYLESHEET;
  link.dataset.identityAuthorityV11 = 'true';
  document.head.appendChild(link);
}

function adminFunctionFromContext() {
  const modules = Array.isArray(adminContext?.modules) ? adminContext.modules : [];
  const key = ['heroes', 'equipment', 'publishing', 'quality', 'intelligence', 'moderation'].find((moduleKey) => modules.includes(moduleKey));
  const fallback = { glyph: 'A', label: String(adminContext?.staff_label || 'ADMIN').trim().toUpperCase(), short: 'ADMIN' };
  return key ? { ...ADMIN_FUNCTIONS[key], staffLabel: adminContext?.staff_label || ADMIN_FUNCTIONS[key].label, moduleKey: key } : fallback;
}

function setInstitutionalMode(role) {
  const institutional = role === 'founder' || role === 'admin';
  document.body.dataset.identityParticipation = institutional ? 'institutional' : 'community';
  document.body.dataset.identityAuthority = role;
  if (!institutional) return;

  for (const selector of MEMBER_ONLY_SELECTORS) {
    document.querySelectorAll(selector).forEach((node) => {
      node.hidden = true;
      node.dataset.memberOnlyHidden = 'true';
    });
  }

  const main = document.querySelector('.my-profile-main');
  const builder = element('identity-v7-builder');
  if (!main || !builder) return;
  let panel = element('identity-institutional-profile');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'identity-institutional-profile';
    panel.className = 'identity-institutional-profile';
    main.insertBefore(panel, builder);
  }

  if (role === 'founder') {
    panel.dataset.role = 'founder';
    panel.innerHTML = '<div class="identity-institutional-profile-mark" aria-hidden="true">◆</div><div><small>IDENTIDADE INSTITUCIONAL</small><h1>Founder</h1><p>Direção, governança e origem do Echo Arena. Este perfil não participa de pontos, ranks, missões ou especialidades comunitárias.</p><span>FOUNDER · AUTORIDADE INSTITUCIONAL</span></div>';
    return;
  }

  const fn = adminFunctionFromContext();
  panel.dataset.role = 'admin';
  panel.innerHTML = `<div class="identity-institutional-profile-mark" aria-hidden="true">${fn.glyph}</div><div><small>IDENTIDADE INSTITUCIONAL · ADMIN</small><h1>${fn.staffLabel || fn.label}</h1><p>A função deste perfil é exercida no painel administrativo. Pontos, ranks, missões e especialidades comunitárias não se aplicam a esta identidade.</p><span>${fn.label}</span></div>`;
}

function ensureAdminFunctionInsignia(frame, tier) {
  let insignia = frame.querySelector('.identity-admin-function');
  if (!insignia) {
    insignia = document.createElement('div');
    insignia.className = 'identity-admin-function';
    insignia.innerHTML = '<span class="identity-admin-function-mark" aria-hidden="true"></span><div><small>FUNÇÃO OFICIAL</small><strong></strong><em></em></div>';
  }
  const fn = adminFunctionFromContext();
  insignia.querySelector('.identity-admin-function-mark').textContent = fn.glyph;
  insignia.querySelector('strong').textContent = fn.staffLabel || fn.label;
  insignia.querySelector('em').textContent = fn.label;
  if (tier) {
    tier.hidden = true;
    tier.dataset.institutionalSuppressed = 'true';
    if (!insignia.isConnected) tier.after(insignia);
  } else if (!insignia.isConnected) frame.prepend(insignia);
}

function ensureAuthorityHero(role) {
  const presentation = AUTHORITY_PRESENTATION[role];
  const preview = element('identity-v7-preview');
  const frame = preview?.querySelector('.identity-v7-preview-frame');
  let tier = preview?.querySelector('.identity-v7-preview-tier');
  if (!preview || !frame) return;

  preview.dataset.authority = role;
  const topLabel = preview.querySelector('.identity-v7-preview-top > span');
  const footerLabel = preview.querySelector('.identity-v7-preview-footer > b');

  if (!presentation) {
    frame.querySelector('.identity-authority-banner')?.remove();
    frame.querySelector('.identity-admin-function')?.remove();
    if (tier) {
      tier.hidden = false;
      delete tier.dataset.institutionalSuppressed;
    }
    if (topLabel) topLabel.textContent = 'SEU CARD NA ARENA';
    if (footerLabel) footerLabel.textContent = 'ECHO IDENTITY';
    return;
  }

  if (topLabel) topLabel.textContent = presentation.cardLabel;
  if (footerLabel) footerLabel.textContent = presentation.footerLabel;

  let banner = frame.querySelector('.identity-authority-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'identity-authority-banner';
    banner.setAttribute('aria-label', 'Autoridade institucional confirmada');
    banner.innerHTML = '<span class="identity-authority-emblem"></span><span class="identity-authority-copy"><small></small><strong></strong><span></span></span>';
  }

  banner.querySelector('.identity-authority-emblem').textContent = presentation.emblem;
  banner.querySelector('.identity-authority-copy small').textContent = presentation.eyebrow;
  banner.querySelector('.identity-authority-copy strong').textContent = presentation.label;
  banner.querySelector('.identity-authority-copy span').textContent = presentation.subtitle;
  if (tier) frame.insertBefore(banner, tier);
  else if (!banner.isConnected) frame.prepend(banner);

  tier = frame.querySelector('.identity-v7-preview-tier');
  if (role === 'founder') {
    if (tier) {
      tier.hidden = true;
      tier.dataset.institutionalSuppressed = 'true';
    }
    frame.querySelector('.identity-admin-function')?.remove();
  } else if (role === 'admin') {
    ensureAdminFunctionInsignia(frame, tier);
  }
}

function addBadge(row, role, label, className = '') {
  if (!row || row.querySelector(`[data-institutional-authority="${role}"]`)) return;
  const badge = document.createElement('span');
  badge.dataset.institutionalAuthority = role;
  if (className) badge.className = className;
  badge.textContent = label;
  row.prepend(badge);
}

function addAdminFunctionBadge(row) {
  if (!row || row.querySelector('[data-admin-function]')) return;
  const fn = adminFunctionFromContext();
  const badge = document.createElement('span');
  badge.dataset.adminFunction = fn.moduleKey || 'admin';
  badge.className = 'my-profile-badge admin-function';
  badge.textContent = fn.staffLabel || fn.label;
  row.prepend(badge);
}

function ensureAuthorityBadge() {
  const role = String(authority?.institutional_role || 'member');
  const label = INSTITUTIONAL_LABELS[role];
  const preview = element('identity-v7-preview');
  if (preview) preview.dataset.authority = role;

  const previewRow = element('preview-institutional-badges');
  const profileRow = element('my-institutional-badges');
  if (label) {
    addBadge(previewRow, role, label);
    addBadge(profileRow, role, label, `my-profile-badge ${role}`);
  }
  if (role === 'admin') {
    addAdminFunctionBadge(previewRow);
    addAdminFunctionBadge(profileRow);
  }

  ensureAuthorityHero(role);
  setInstitutionalMode(role);
}

function watchJourneyRenders() {
  observer?.disconnect();
  observer = new MutationObserver(() => ensureAuthorityBadge());
  for (const row of [element('preview-institutional-badges'), element('my-institutional-badges')]) {
    if (row) observer.observe(row, { childList: true });
  }
}

function prefillLegacyIdentity(profile) {
  const username = String(profile?.username || '').trim().toLowerCase();
  const displayName = String(profile?.display_name || '').trim();
  const handleInput = element('profile-handle-input');
  const displayInput = element('profile-display-input');

  if (handleInput && !handleInput.value && HANDLE_RE.test(username)) {
    handleInput.value = username;
    handleInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (displayInput && !displayInput.value && username) {
    displayInput.value = displayName || username;
    displayInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

export async function activateOwnIdentityAuthorityV10() {
  if (activated) return activationResult;
  activated = true;
  ensureAuthorityStyles();
  const { supabase } = await import('./supabase.js?v=20260823-security-supabase-pin-1');
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user;
  if (userError || !user) return null;

  const [authorityResult, profileResult] = await Promise.all([
    supabase.rpc('echo_my_identity_authority_v1'),
    supabase.from('profiles').select('username,display_name').eq('id', user.id).maybeSingle()
  ]);

  if (!authorityResult.error && authorityResult.data) authority = authorityResult.data;
  const role = String(authority?.institutional_role || 'member');
  if (role === 'admin') {
    const contextResult = await supabase.rpc('echo_admin_context');
    if (!contextResult.error && contextResult.data) adminContext = contextResult.data;
  }

  if (authority) {
    updateOwnDossierAuthority({...authority,institutional_label:role === 'admin' ? adminFunctionFromContext().staffLabel || adminFunctionFromContext().label : 'FOUNDER'});
    ensureAuthorityBadge();
    watchJourneyRenders();
  }
  if (!profileResult.error && profileResult.data) prefillLegacyIdentity(profileResult.data);

  activationResult = Object.freeze({ institutionalRole: role, authority, adminContext });
  return activationResult;
}
