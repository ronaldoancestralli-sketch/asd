import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import './public-beta-banner.js?v=20260830-release-057-1&sb=20260823-security-supabase-pin-1&ops=20260905&sc=20260906-1&eq=20260907-effects-1';
import { PUBLIC_RELEASE_MANIFEST } from './public-release-manifest.js?v=20260830-release-057-1&ops=20260905&sc=20260906-1&eq=20260907-effects-1';

const timeline = document.getElementById('release-timeline');
const current = document.getElementById('version-current');
const count = document.getElementById('version-count');
const status = document.getElementById('version-status');
const filters = [...document.querySelectorAll('[data-release-filter]')];
const PUBLIC_KINDS = new Set(['beta', 'feature', 'improvement', 'fix', 'content']);
const CODE_VERSION = PUBLIC_RELEASE_MANIFEST.find(release => release?.published !== false)?.version || '0.5.7-beta';
let releases = [];
let activeFilter = 'all';

const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[char]));

const kindLabel = kind => ({
  beta: 'Beta', feature: 'Novidade', improvement: 'Melhoria', fix: 'Correção', content: 'Conteúdo'
})[kind] || 'Atualização';

function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data não informada' : date.toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' });
}

function versionCore(value='') {
  const match=String(value).trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function newerVersion(a,b) {
  const av=versionCore(a),bv=versionCore(b);
  if(!av)return b;if(!bv)return a;
  for(let i=0;i<3;i+=1){if(av[i]!==bv[i])return av[i]>bv[i]?a:b;}
  return a;
}

function normalizeRelease(item = {}) {
  return {
    version: String(item.version || '').trim(),
    title: String(item.title || '').trim(),
    summary: String(item.summary || '').trim(),
    description: String(item.description || '').trim(),
    kind: String(item.kind || 'improvement').trim(),
    released_at: item.released_at || null,
    published: item.published !== false,
    highlights: Array.isArray(item.highlights) ? item.highlights.map(value => String(value).trim()).filter(Boolean).slice(0, 12) : []
  };
}

function isPublicRelease(item) {
  return item?.published === true && PUBLIC_KINDS.has(item.kind);
}

function visibleReleases() {
  return releases.filter(item => isPublicRelease(item) && (activeFilter === 'all' || item.kind === activeFilter));
}

function render() {
  const visible = visibleReleases();
  if (count) count.textContent = releases.filter(isPublicRelease).length.toLocaleString('pt-BR');
  if (!timeline) return;
  if (!visible.length) {
    timeline.innerHTML = '<div class="release-empty">Nenhuma atualização pública corresponde a este filtro.</div>';
    return;
  }
  timeline.innerHTML = visible.map((item, index) => `
    <article class="release-entry ${index === 0 && activeFilter === 'all' ? 'latest' : ''}">
      <div class="release-meta">
        <strong class="release-version">${esc(item.version || 'Beta')}</strong>
        <span class="release-kind">${esc(kindLabel(item.kind))}</span>
        <span class="release-date">${esc(dateLabel(item.released_at))}</span>
      </div>
      <div class="release-copy">
        <h3>${esc(item.title || 'Atualização do Echo Arena')}</h3>
        ${item.summary ? `<p>${esc(item.summary)}</p>` : ''}
        ${item.description ? `<p class="release-description">${esc(item.description)}</p>` : ''}
        ${item.highlights.length ? `<ul class="release-highlights">${item.highlights.map(highlight => `<li>${esc(highlight)}</li>`).join('')}</ul>` : ''}
      </div>
    </article>`).join('');
}

async function load() {
  if (status) status.textContent = 'Carregando histórico público…';
  let cmsReleases = [];
  let cmsCurrent = '';
  try {
    const { data, error } = await supabase
      .from('site_pages')
      .select('content,published,updated_at')
      .eq('page_key', 'versions')
      .eq('published', true)
      .maybeSingle();
    if (error) throw error;
    const content = data?.content || {};
    cmsReleases = Array.isArray(content.releases) ? content.releases : [];
    cmsCurrent = String(content.current_version || '').trim();
  } catch (error) {
    console.warn('[versões] CMS indisponível:', error);
  }

  const merged = new Map();
  for (const item of [...PUBLIC_RELEASE_MANIFEST, ...cmsReleases]) {
    const normalized = normalizeRelease(item);
    if (normalized.version && normalized.title && !merged.has(normalized.version)) {
      merged.set(normalized.version, normalized);
    }
  }

  releases = [...merged.values()].sort((a, b) => {
    const av=versionCore(a.version),bv=versionCore(b.version);
    if(av&&bv){for(let i=0;i<3;i+=1){if(av[i]!==bv[i])return bv[i]-av[i];}}
    return new Date(b.released_at || 0) - new Date(a.released_at || 0);
  });

  const currentVersion = newerVersion(CODE_VERSION, cmsCurrent || CODE_VERSION);
  if (current) current.textContent = currentVersion.toUpperCase();
  if (status) {
    const stale = cmsCurrent && newerVersion(CODE_VERSION,cmsCurrent) === CODE_VERSION && cmsCurrent !== CODE_VERSION;
    status.textContent = stale
      ? 'Histórico público sincronizado com o código; o CMS editorial será reconciliado sem esconder versões já publicadas.'
      : 'Histórico sincronizado com as publicações do Echo Arena.';
    status.className = 'trust-status ok';
  }
  render();
}

filters.forEach(button => button.addEventListener('click', () => {
  activeFilter = button.dataset.releaseFilter || 'all';
  filters.forEach(item => item.classList.toggle('is-active', item === button));
  render();
}));

load();
