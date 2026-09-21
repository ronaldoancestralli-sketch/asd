import { renderProfileDossier } from './echo-profile-dossier-v15.js?v=20260905-institutional-scout-exclusion-v15-3';

let identity = null;
let authority = null;
let observer = null;
let lastMarkup = '';

function refresh() {
  const source = document.getElementById('identity-v7-preview');
  const layout = document.getElementById('my-profile-editor');
  if (!source || !layout || !identity) return;
  let host = source.querySelector('[data-own-profile-dossier]');
  if (!host) {
    host = document.createElement('div');
    host.dataset.ownProfileDossier = 'true';
    source.querySelector('.identity-v7-preview-frame').before(host);
    source.dataset.sharedProfileReady = 'true';
    document.body.dataset.profileParity = 'v15';
    // Preserve the old runtime targets and showroom controls, but display the shared card.
    layout.prepend(source);
    document.querySelector('[data-preview-mirror="editor"]')?.remove();
  }
  let role = String(authority?.institutional_role || 'member');
  if (role === 'member' && Array.isArray(identity.institutional_badges)) {
    role = ['developer','moderator','partner','creator'].find(value=>identity.institutional_badges.includes(value)) || role;
  }
  const showroom = source.classList.contains('is-showroom');
  const markup = renderProfileDossier({
    identity: {...identity, community_tier: source.dataset.tier || ''},
    visual_identity: {authority: role, authority_label: authority?.institutional_label || '', community_tier: source.dataset.tier || ''}
  }, {editor:true, authorityConfirmed:!!authority, showroom});
  if (markup !== lastMarkup) { host.innerHTML = markup; lastMarkup = markup; }
  if (!observer) {
    observer = new MutationObserver(refresh);
    observer.observe(source, {attributes:true, attributeFilter:['data-tier','class']});
  }
}

export function updateOwnDossierIdentity(value) { identity = {...identity,...value}; refresh(); }
export function updateOwnDossierAuthority(value) { authority = value || null; refresh(); }
