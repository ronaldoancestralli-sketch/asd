// One presentation for the public profile and the account editor.
// Callers supply server-confirmed authority/reputation; this module never grants either.
export const PROFILE_DOSSIER_VERSION = '20260905-institutional-scout-exclusion-v15-3';
export const PROFILE_TIERS = Object.freeze({
  member: 'MEMBRO', echo_scout: 'ECHO SCOUT', tracker: 'RASTREADOR',
  cartographer: 'CARTÓGRAFO', analyst: 'ANALISTA', vanguard: 'VANGUARDA', arena_legend: 'LENDA DA ARENA'
});
const ROLES = Object.freeze({founder:'FOUNDER',admin:'ADMIN',developer:'DEVELOPER',moderator:'MODERATOR',partner:'PARTNER',creator:'CREATOR'});
const ACCENTS = Object.freeze({violet:'VIOLETA',cyan:'CIANO',gold:'DOURADO',emerald:'ESMERALDA',rose:'ROSA',steel:'AÇO'});
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const initials = name => String(name || 'EA').trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase() || 'EA';
const safeAvatar = value => {
  try { const url = new URL(String(value || '')); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
};

export function profileDossierState(data = {}) {
  const identity = data.identity || {};
  const visual = data.visual_identity || {};
  const requestedRole = String(visual.authority || identity.institutional_role || 'member').toLowerCase();
  const role = own(ROLES, requestedRole) ? requestedRole : 'member';
  const institutional = role === 'founder' || role === 'admin';
  const requestedTier = String(visual.community_tier || identity.community_tier || '');
  const tier = !institutional && own(PROFILE_TIERS, requestedTier) ? requestedTier : 'unavailable';
  const requestedAccent = String(identity.profile_accent || 'violet');
  const accent = own(ACCENTS, requestedAccent) ? requestedAccent : 'violet';
  return {role,tier,accent,institutional};
}

export function renderProfileDossier(data = {}, options = {}) {
  const identity = data.identity || {};
  const visual = data.visual_identity || {};
  const {role,tier,accent,institutional} = profileDossierState(data);
  const founder = role === 'founder';
  const confirmed = options.authorityConfirmed !== false;
  const tierLabel = PROFILE_TIERS[tier] || 'NÍVEL INDISPONÍVEL';
  const designation = confirmed ? (ROLES[role] || tierLabel) : 'CONFIRMANDO…';
  const name = String(identity.display_name || identity.public_handle || (options.editor ? 'Seu nome' : 'Jogador'));
  const handle = identity.public_handle ? `@${identity.public_handle}` : '';
  const avatar = safeAvatar(identity.avatar_url);
  const bio = String(identity.bio || 'Sem bio pública.');
  const prefix = options.editor ? 'editor-dossier' : 'profile';
  const heading = options.editor ? 'h2' : 'h1';
  const visibility = options.editor ? (identity.profile_visibility === 'public' ? 'Pública' : 'Privada') : 'Pública';
  const adminLabel = String(visual.authority_label || 'Admin do Echo Arena');
  const roleTitle = founder ? 'Fundador do Echo Arena' : role === 'admin' ? adminLabel : ROLES[role] || 'Comunidade Echo Arena';
  const scope = founder ? 'Direção do Echo Arena' : institutional ? adminLabel : 'Contribuição comunitária';
  const statement = founder ? 'Direção da plataforma e coerência entre produto, dados e comunidade.'
    : institutional ? 'Função institucional confirmada. Permissões e áreas de atuação são definidas pelo servidor.'
      : 'Cada contribuição reconhecida faz parte da história desta identidade na comunidade.';
  const confirmedLabel = confirmed ? (institutional ? 'AUTORIDADE CONFIRMADA' : tier === 'unavailable' ? 'NÍVEL INDISPONÍVEL' : 'NÍVEL CONFIRMADO') : 'CONFIRMANDO IDENTIDADE';
  const badges = Array.isArray(identity.institutional_badges) ? identity.institutional_badges.filter(b=>own(ROLES,b) && b!==role) : [];
  return `<section class="echo-profile-identity founder-dossier" data-profile-dossier="v15" data-authority="${role}" data-tier="${tier}" data-accent="${accent}" aria-labelledby="${prefix}-name">
    <div class="founder-atmosphere" aria-hidden="true"></div>
    <div class="founder-watermark" aria-hidden="true">${esc(designation)}</div>
    <aside class="founder-origin-rail" aria-label="${institutional ? 'Autoridade institucional' : 'Identidade comunitária'}">
      <div class="founder-origin-mark"><span>EA</span><i></i></div>
      <p>${founder ? 'ORIGIN<br>AUTHORITY' : institutional ? 'INSTITUTIONAL<br>AUTHORITY' : 'ECHO<br>SCOUTS'}</p>
      <b>${esc(designation)}</b>
    </aside>
    <div class="founder-main">
      <div class="founder-topline"><span>ECHO IDENTITY</span><i></i><b>${institutional ? 'RECONHECIMENTO INSTITUCIONAL' : 'IDENTIDADE COMUNITÁRIA'}</b></div>
      <div class="founder-identity-grid">
        <div class="founder-portrait-wrap">
          <div class="founder-halo" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
          <div class="founder-portrait" id="${prefix}-avatar">${avatar ? `<img src="${esc(avatar)}" alt="Avatar de ${esc(name)}">` : esc(initials(name))}</div>
          <span class="founder-portrait-badge">${options.editor ? 'PRÉVIA DO PERFIL' : 'IDENTIDADE CONFIRMADA'}</span>
        </div>
        <div class="founder-nameplate">
          <span class="founder-role">${esc(roleTitle)}</span>
          <${heading} id="${prefix}-name">${esc(name)}</${heading}>
          <div class="founder-handle-row"><b id="${prefix}-handle">${esc(handle)}</b><span></span><small class="founder-personal-accent" id="${prefix}-personal-accent">ACENTO PESSOAL · ${ACCENTS[accent]}</small></div>
          <p class="founder-bio" id="${prefix}-bio">${esc(bio)}</p>
          <div id="${prefix}-badges" class="founder-extra-badges">${badges.map(b=>`<span>${ROLES[b]}</span>`).join('')}</div>
          ${founder ? '<div class="founder-signature-line"><span>VISÃO</span><i></i><span>PRODUTO</span><i></i><span>INTEGRIDADE</span></div>' : ''}
        </div>
      </div>
      <div class="founder-statement"><div><small>${institutional ? 'MANDATO INSTITUCIONAL' : 'PARTICIPAÇÃO NA ARENA'}</small><p>${esc(statement)}</p></div><b>ECHO ARENA</b></div>
    </div>
    <aside class="founder-authority-card" aria-label="Registro da identidade">
      <div class="founder-authority-head"><span>EA</span><small>${institutional ? 'AUTHORITY' : 'IDENTITY'}<br>REGISTRY</small></div>
      <div class="founder-rank"><small>DESIGNAÇÃO</small><strong id="${prefix}-authority">${esc(designation)}</strong><span>${confirmed ? '<i></i>' : ''} ${options.showroom ? 'SIMULAÇÃO VISUAL · NÃO CONQUISTADO' : confirmedLabel}</span></div>
      <div class="founder-authority-data">
        <div><small>${institutional ? 'INSTITUIÇÃO' : 'COMUNIDADE'}</small><b>Echo Arena</b></div>
        <div><small>IDENTIDADE</small><b>${visibility}${options.editor ? ' · prévia' : ''}</b></div>
        <div><small>${institutional ? 'CONTRIBUIÇÃO' : 'TRILHA SCOUT'}</small><b>${institutional ? 'Institucional · fora da trilha Scout' : esc(tierLabel)}</b></div>
      </div>
      <div class="founder-seal"><span>${institutional ? '◆' : '◇'}</span><b>${esc(designation)}</b><small>ECHO ARENA</small></div>
    </aside>
    <div class="founder-dossier-footer">
      <span><small>STATUS</small><b>${confirmed && !options.showroom ? '<i></i>' : ''} ${options.showroom ? 'SIMULAÇÃO VISUAL' : confirmedLabel}</b></span>
      <span><small>ESCOPO</small><b>${esc(scope)}</b></span>
      <span><small>ORIGEM</small><b>${institutional ? 'IDENTIDADE INSTITUCIONAL' : 'REPUTAÇÃO COMUNITÁRIA'}</b></span>
    </div>
  </section>${founder && confirmed ? `
  <section class="echo-profile-domain founder-domain" data-founder-domain aria-labelledby="${prefix}-domain-title">
    <header>
      <div><span class="founder-kicker">CAMPO DE ATUAÇÃO</span><h2 id="${prefix}-domain-title">A identidade por trás da arena</h2></div>
      <p>O reconhecimento de Founder existe acima da progressão comunitária e representa a direção institucional da plataforma.</p>
    </header>
    <div class="founder-domain-grid">
      <article><div><small>VISÃO</small><h3>Direção da plataforma</h3><p>Define o rumo do Echo Arena e mantém a experiência alinhada à proposta do projeto.</p></div></article>
      <article><div><small>PRODUTO</small><h3>Coerência do ecossistema</h3><p>Conecta páginas, recursos e sistemas para que toda a arena caminhe como um único produto.</p></div></article>
      <article><div><small>INTEGRIDADE</small><h3>Dados sem atalhos</h3><p>Autoridade institucional não cria reputação, números ou conquistas que não existam.</p></div></article>
    </div>
  </section>` : ''}`;
}
