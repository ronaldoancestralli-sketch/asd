const MODULE_BUILD = '20260830-skills-community-audit-1';
const RESEARCH_SCHEMA_VERSION = 1;
const SOURCE_COVERAGES = new Set([
  'baseline_values',
  'structure',
  'patch_override',
  'corroboration',
  'translation'
]);

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function slugify(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function emptyToNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function numberOrNull(value, { integer = false } = {}) {
  const text = emptyToNull(value);
  if (text === null) return null;
  const number = Number(text);
  if (!Number.isFinite(number)) return NaN;
  if (integer && !Number.isInteger(number)) return NaN;
  return number;
}

function newDraftKey() {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sourceMetadata(urlValue = '') {
  try {
    const url = new URL(String(urlValue));
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:') return null;
    if (host === 'zepto.helpshift.com' || host === 'zeptolab.com' || host.endsWith('.zeptolab.com')) {
      return { source_type: 'official', publisher: 'ZeptoLab', language: 'en' };
    }
    if (host === 'bullet-echo.fandom.com') {
      const language = url.pathname.toLowerCase().startsWith('/vi/') ? 'vi' : 'en';
      return { source_type: 'wiki', publisher: 'Comunidade Fandom', language };
    }
    if (host === 'gamingonphone.com' || host === 'www.gamingonphone.com') {
      return { source_type: 'community', publisher: 'GamingOnPhone', language: 'en' };
    }
    if (host === 'reddit.com' || host === 'www.reddit.com') {
      return { source_type: 'forum', publisher: 'Reddit', language: 'multi' };
    }
    if (host === 'vk.com' || host === 'm.vk.com') {
      return { source_type: 'community', publisher: 'Comunidade VK', language: 'ru' };
    }
    if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'youtu.be') {
      return { source_type: 'community', publisher: 'YouTube', language: 'multi' };
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeEvidence(rows = []) {
  const unique = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const metadata = sourceMetadata(row?.url);
    if (!metadata) continue;
    const coverage = SOURCE_COVERAGES.has(row?.coverage) ? row.coverage : 'corroboration';
    const key = `${row.url}|${coverage}`;
    unique.set(key, {
      url: String(row.url),
      title: String(row.title || row.url),
      coverage,
      source_updated_at: row.source_updated_at || row.sourceUpdatedAt || null,
      last_checked_at: row.last_checked_at || row.lastCheckedAt || null,
      verification_status: row.verification_status || null,
      verified_at: row.verified_at || null,
      needs_recheck: row.needs_recheck ?? null,
      ...metadata
    });
  }
  return [...unique.values()];
}

function formatSourceDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date);
}

function sourceDisplay(item = {}) {
  if (item.source_type === 'official') return 'Fonte oficial · ZeptoLab';
  if (item.source_type === 'wiki') return `Wiki comunitária · ${item.publisher || 'Fandom'}`;
  if (item.source_type === 'forum') return `Fórum · ${item.publisher || 'Comunidade'}`;
  if (item.source_type === 'community') return `Página da comunidade · ${item.publisher || 'Comunidade'}`;
  return `Fonte comunitária · ${item.publisher || 'Origem externa'}`;
}

function skillTypeInPortuguese(value = '') {
  const raw = String(value || '').trim();
  const normalized = raw.toLowerCase();
  if (!raw) return 'Tipo a confirmar';
  if (/team\s*talent|talento\s*(?:de\s*)?equipe/.test(normalized)) return 'Talento de equipe';
  if (/personal\s*talent|passive|passiva|talento\s*pessoal/.test(normalized)) return 'Passiva';
  if (/recovery|heal|cura|recupera/.test(normalized)) return 'Ativa de recuperação';
  if (/active|ability|ultimate|ativa|habilidade/.test(normalized)) return 'Ativa';
  return raw;
}

function sourceFreshness(item = {}) {
  const sourceDate = formatSourceDate(item.source_updated_at);
  if (sourceDate) return `Fonte atualizada em ${sourceDate}`;
  const checkedDate = formatSourceDate(item.last_checked_at || item.verified_at);
  return checkedDate ? `Verificada em ${checkedDate}` : 'Data da fonte não informada';
}

async function readableResearchError(error) {
  const fallback = String(error?.message || 'A pesquisa online falhou.');
  const response = error?.context;
  if (response && typeof response.clone === 'function') {
    try {
      const payload = await response.clone().json();
      if (payload?.error) {
        if (payload.code === 'missing_server_configuration' && payload.missingConfig) {
          return `Pesquisa online indisponível: configure o segredo ${payload.missingConfig} nas Edge Functions do Supabase.`;
        }
        if (payload.code === 'research_timeout') return 'A pesquisa online demorou demais. Tente novamente.';
        if (payload.code === 'hero_not_found') return String(payload.error);
        return String(payload.error);
      }
    } catch {
      // The Functions client may have already consumed the response body.
    }
  }
  if (/non-2xx/i.test(fallback)) {
    return 'A pesquisa online foi recusada pelo servidor. Verifique a configuração da Edge Function e tente novamente.';
  }
  return fallback;
}

function normalizeLevel(row = {}) {
  return {
    _key: row.id || newDraftKey(),
    id: row.id || null,
    skill_id: row.skill_id || null,
    level: row.level ?? '',
    damage: row.damage ?? '',
    healing: row.healing ?? '',
    shield: row.shield ?? '',
    cooldown: row.cooldown ?? '',
    duration: row.duration ?? '',
    radius: row.radius ?? '',
    range: row.range ?? '',
    speed: row.speed ?? '',
    energy_cost: row.energy_cost ?? '',
    description: row.description ?? ''
  };
}

function normalizeSkill(row = {}, levels = []) {
  return {
    _key: row.id || newDraftKey(),
    id: row.id || null,
    hero_id: row.hero_id || null,
    name: row.name ?? '',
    slug: row.slug ?? '',
    description: row.description ?? '',
    skill_type: row.skill_type ?? '',
    cooldown: row.cooldown ?? '',
    duration: row.duration ?? '',
    energy_cost: row.energy_cost ?? '',
    unlock_level: row.unlock_level ?? '',
    max_level: row.max_level ?? '',
    display_order: row.display_order ?? 0,
    enabled: row.enabled !== false,
    levels: levels.map(normalizeLevel),
    _researchEvidence: normalizeEvidence(row._researchEvidence),
    _researchOrigin: row._researchOrigin || null,
    _researchPlaceholder: row._researchPlaceholder === true,
    _researchConfidence: Number.isFinite(Number(row._researchConfidence)) ? Number(row._researchConfidence) : null,
    _researchWarnings: Array.isArray(row._researchWarnings) ? row._researchWarnings.map(String) : []
  };
}

function blankSkill(displayOrder = 0) {
  return normalizeSkill({
    display_order: displayOrder,
    enabled: true
  });
}

function blankLevel() {
  return normalizeLevel();
}

function injectStyles() {
  if (document.getElementById('hero-skills-panel-style')) return;

  const style = document.createElement('style');
  style.id = 'hero-skills-panel-style';
  style.textContent = `
    .hero-publication-check{grid-column:1/-1;padding:14px;border:1px solid var(--admin-line);border-radius:12px;background:#08111f}
    .hero-publication-check.is-ready{border-color:#23583b;background:#0a1b16}
    .hero-publication-check.is-blocked{border-color:#70313b;background:#1b0d13}
    .hero-publication-head{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}
    .hero-publication-head strong{font-size:13px}.hero-publication-badge{padding:5px 9px;border-radius:999px;background:#17223a;color:#c8d2e3;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
    .hero-publication-check.is-ready .hero-publication-badge{background:#123422;color:#86efac}.hero-publication-check.is-blocked .hero-publication-badge{background:#3a141c;color:#fda4af}
    .hero-publication-items{display:grid;gap:6px;margin-top:10px}.hero-publication-item{font-size:11px;line-height:1.45;color:#c5cede}.hero-publication-item.warn{color:#f5d276}.hero-publication-item.block{color:#ff9aaa}
    .hero-skills-manager{display:grid;gap:14px}.hero-skills-toolbar{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:18px;padding:18px;border:1px solid #33445f;border-radius:15px;background:linear-gradient(135deg,#0b1526,#11152c)}
    .hero-skills-toolbar-actions{display:grid;gap:8px;min-width:238px}.hero-skills-toolbar-actions .admin-button{width:100%}.hero-skills-progress{display:flex;align-items:center;gap:11px;padding:11px 13px;border:1px solid var(--admin-line);border-radius:11px;background:#08111f}.hero-skills-progress-icon{display:grid;place-items:center;width:30px;height:30px;flex:0 0 30px;border-radius:9px;background:#24124b;color:#c4b5fd;font-size:13px;font-weight:900}.hero-skills-progress span:last-child{display:grid;gap:2px}.hero-skills-progress strong{font-size:11px}.hero-skills-progress small{color:var(--admin-muted);font-size:9px;line-height:1.4}
    .hero-skills-advanced{border:1px solid var(--admin-line);border-radius:10px;background:#080f1c}.hero-skills-advanced summary{padding:10px 12px;color:#aeb9ca;font-size:10px;font-weight:800;cursor:pointer}.hero-skills-advanced>div{display:flex;gap:8px;flex-wrap:wrap;padding:0 12px 12px}.hero-skills-message{min-height:18px;color:var(--admin-muted);font-size:11px}.hero-skills-message.ok{color:#86efac}.hero-skills-message.error{color:#fda4af}
    .hero-skills-research-summary{display:none;padding:12px 13px;border:1px solid #33445f;border-radius:11px;background:linear-gradient(135deg,#0b1628,#10152c)}.hero-skills-research-summary.is-visible{display:grid;gap:8px}.hero-skills-research-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.hero-skills-research-head strong{font-size:12px}.hero-skills-research-head span{padding:4px 7px;border-radius:999px;background:#233259;color:#c4b5fd;font-size:8px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.hero-skills-research-meta{color:#aeb9ca;font-size:10px;line-height:1.45}.hero-skills-research-sources{display:flex;gap:6px;flex-wrap:wrap}.hero-skills-research-sources a{padding:5px 8px;border:1px solid #33445f;border-radius:999px;color:#c4b5fd;font-size:9px;text-decoration:none}.hero-skills-research-sources a:hover{border-color:#8b5cf6;color:#fff}
    .hero-skills-list{display:grid;gap:12px}.hero-skills-empty{padding:24px;border:1px dashed var(--admin-line);border-radius:11px;background:#09111f;color:var(--admin-muted);font-size:11px;line-height:1.6;text-align:center}
    .hero-skill-card{overflow:hidden;border:1px solid var(--admin-line);border-radius:13px;background:#08101d}.hero-skill-card.is-disabled{opacity:.78}.hero-skill-card.is-validation-slot{border-color:#725d27;background:linear-gradient(145deg,#13140f,#0a111d)}
    .hero-skill-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:14px 15px;border-bottom:1px solid var(--admin-line);background:#0d1728}.hero-skill-title strong{display:block;font-size:15px}.hero-skill-title span{display:block;margin-top:4px;color:var(--admin-muted);font:10px/1.3 ui-monospace,monospace}
    .hero-skill-state{padding:5px 8px;border-radius:999px;background:#123422;color:#86efac;font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.hero-skill-state.off{background:#35141c;color:#fda4af}
    .hero-skill-body{display:grid;gap:14px;padding:15px}.hero-skill-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.hero-skill-field{display:grid;gap:6px;min-width:0}.hero-skill-field.full{grid-column:1/-1}.hero-skill-field.span2{grid-column:span 2}
    .hero-skill-field label{color:#cbd4e3;font-size:10px;font-weight:800}.hero-skill-field small{color:var(--admin-muted);font-size:9px;line-height:1.35}.hero-skill-field input,.hero-skill-field textarea{width:100%;min-height:40px;padding:9px 10px;border:1px solid var(--admin-line);border-radius:8px;background:#050c18;color:#fff;outline:none}.hero-skill-field textarea{min-height:88px;resize:vertical}.hero-skill-field input:focus,.hero-skill-field textarea:focus{border-color:var(--admin-purple);box-shadow:0 0 0 3px rgba(139,92,246,.12)}
    .hero-skill-checkbox{display:flex;align-items:center;gap:8px;min-height:40px;padding:8px 10px;border:1px solid var(--admin-line);border-radius:8px;background:#050c18;color:#d5dbea;font-size:10px;font-weight:800}.hero-skill-checkbox input{width:17px;height:17px;min-height:0;padding:0}
    .hero-skill-sources{display:grid;gap:8px;padding:11px;border:1px solid #2b3b55;border-radius:11px;background:#091322}.hero-skill-sources-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.hero-skill-sources-head strong{font-size:10px}.hero-skill-data-badge{padding:5px 8px;border-radius:999px;background:#123422;color:#86efac;font-size:8px;font-weight:900;letter-spacing:.04em}.hero-skill-data-badge.pending{background:#33264b;color:#d8c8ff}.hero-skill-source-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.hero-skill-source{display:grid;gap:3px;min-width:0;padding:8px 9px;border:1px solid #293a55;border-radius:9px;background:#0c1728;color:#dbe5f4;text-decoration:none}.hero-skill-source:hover{border-color:#8b5cf6}.hero-skill-source strong{font-size:9px}.hero-skill-source span{overflow:hidden;color:#aeb9ca;font-size:8px;text-overflow:ellipsis;white-space:nowrap}.hero-skill-source small{color:#7f8da3;font-size:8px}.hero-skill-source-empty{color:#9facc0;font-size:9px;line-height:1.45}
    .hero-levels{display:grid;gap:9px;padding-top:3px;border-top:1px solid var(--admin-line)}.hero-levels-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding-top:12px}.hero-levels-head strong{font-size:12px}.hero-levels-head span{display:block;margin-top:3px;color:var(--admin-muted);font-size:9px}
    .hero-level-row{display:grid;grid-template-columns:70px repeat(5,minmax(86px,1fr)) 38px;gap:7px;align-items:end;padding:10px;border:1px solid var(--admin-line);border-radius:10px;background:#07101c}.hero-level-field{display:grid;gap:4px;min-width:0}.hero-level-field label{font-size:8px;font-weight:800;color:#aeb9ca}.hero-level-field input{width:100%;min-height:34px;padding:7px 8px;border:1px solid var(--admin-line);border-radius:7px;background:#030914;color:#fff}.hero-level-extra{grid-column:1/-1;display:grid;grid-template-columns:repeat(5,minmax(86px,1fr)) minmax(180px,2fr);gap:7px}.hero-level-extra textarea{width:100%;min-height:54px;padding:7px 8px;border:1px solid var(--admin-line);border-radius:7px;background:#030914;color:#fff;resize:vertical}.hero-level-remove{width:34px;height:34px;border:1px solid #71303b;border-radius:8px;background:#2a1016;color:#ff9aaa;cursor:pointer}
    .hero-skill-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding-top:2px}.hero-skill-actions .danger{border-color:#71303b;background:#2a1016;color:#ff9aaa}
    .hero-publication-modal{position:fixed;inset:0;z-index:13000;display:none;place-items:center;padding:20px;background:rgba(2,7,16,.9);backdrop-filter:blur(9px)}.hero-publication-modal.is-open{display:grid}.hero-publication-modal-card{width:min(560px,100%);padding:26px;border:1px solid #71303b;border-radius:18px;background:#0b1424;box-shadow:0 30px 90px rgba(0,0,0,.62)}.hero-publication-modal-card h2{margin:0 0 8px}.hero-publication-modal-card p{margin:0;color:#aeb9ca;font-size:12px;line-height:1.6}.hero-publication-modal-list{display:grid;gap:7px;margin:16px 0}.hero-publication-modal-list div{padding:10px 11px;border:1px solid #71303b;border-radius:9px;background:#231016;color:#ffadb6;font-size:11px}.hero-publication-modal-card button{width:100%}
    @media(max-width:1050px){.hero-skill-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.hero-level-row{grid-template-columns:70px repeat(3,minmax(80px,1fr)) 38px}.hero-level-extra{grid-template-columns:repeat(3,minmax(80px,1fr))}.hero-level-extra .hero-level-field:last-child{grid-column:1/-1}}
    @media(max-width:680px){.hero-skills-toolbar{grid-template-columns:1fr;padding:15px}.hero-skills-toolbar-actions{min-width:0;width:100%}.hero-skills-advanced>div{display:grid;grid-template-columns:1fr 1fr}.hero-skill-grid{grid-template-columns:1fr}.hero-skill-field.full,.hero-skill-field.span2{grid-column:auto}.hero-skill-source-list{grid-template-columns:1fr}.hero-level-row{grid-template-columns:repeat(2,minmax(0,1fr))}.hero-level-remove{grid-column:2;justify-self:end}.hero-level-extra{grid-column:1/-1;grid-template-columns:repeat(2,minmax(0,1fr))}.hero-level-extra .hero-level-field:last-child{grid-column:1/-1}.hero-skill-actions{display:grid;grid-template-columns:1fr 1fr}.hero-skill-actions button{width:100%}}
  `;
  document.head.appendChild(style);
}

export async function initHeroSkillsPanel({ supabase, refreshIfStale = false } = {}) {
  if (!supabase) throw new Error('Supabase não foi fornecido ao módulo de habilidades.');

  const panel = document.querySelector('[data-panel="abilities"]');
  const existingManager = document.getElementById('hero-skills-manager');
  if (!panel) return;
  if (existingManager?.dataset.build === MODULE_BUILD) return;
  if (existingManager && !refreshIfStale) return;
  if (existingManager) {
    existingManager.remove();
    document.getElementById('hero-skills-panel-style')?.remove();
  }

  injectStyles();

  const params = new URLSearchParams(location.search);
  const heroId = params.get('id');
  const card = panel.querySelector('.hero-form-card');
  const placeholder = panel.querySelector('.hero-placeholder');

  if (!card || !placeholder) return;

  placeholder.outerHTML = `
    <section id="hero-skills-manager" class="hero-skills-manager" data-build="${MODULE_BUILD}">
      <section class="hero-skills-toolbar" aria-labelledby="hero-skills-title">
        <div class="hero-skills-toolbar-copy">
          <span class="hero-skills-eyebrow">HABILIDADES DO HERÓI</span>
          <strong id="hero-skills-title">Complete as quatro habilidades</strong>
          <span>O Echo Arena Data é consultado primeiro. Depois, a busca combina ZeptoLab, wiki, fóruns e páginas comunitárias — inclusive fontes antigas, sempre marcadas para revisão.</span>
        </div>
        <div class="hero-skills-toolbar-actions">
          <button id="hero-skill-research" type="button" class="admin-button primary">Pesquisar quatro habilidades</button>
          <button id="hero-skill-save-research" type="button" class="admin-button">Salvar as quatro habilidades</button>
        </div>
      </section>
      <div class="hero-skills-progress" aria-live="polite">
        <span class="hero-skills-progress-icon">4</span>
        <span><strong id="hero-skills-progress-title">Aguardando preenchimento</strong><small id="hero-skills-progress-copy">Nenhuma habilidade foi salva ainda.</small></span>
      </div>
      <details class="hero-skills-advanced">
        <summary>Ações avançadas</summary>
        <div>
          <button id="hero-skill-reload" type="button" class="admin-button">Recarregar dados salvos</button>
          <button id="hero-skill-add" type="button" class="admin-button">Adicionar manualmente</button>
        </div>
      </details>
      <div id="hero-skills-research-summary" class="hero-skills-research-summary"></div>
      <div id="hero-skills-message" class="hero-skills-message" role="status" aria-live="polite"></div>
      <div id="hero-skills-list" class="hero-skills-list"></div>
    </section>
  `;

  const manager = document.getElementById('hero-skills-manager');
  const list = document.getElementById('hero-skills-list');
  const message = document.getElementById('hero-skills-message');
  const addButton = document.getElementById('hero-skill-add');
  const reloadButton = document.getElementById('hero-skill-reload');
  const researchButton = document.getElementById('hero-skill-research');
  const saveResearchButton = document.getElementById('hero-skill-save-research');
  const researchSummary = document.getElementById('hero-skills-research-summary');
  const progressTitle = document.getElementById('hero-skills-progress-title');
  const progressCopy = document.getElementById('hero-skills-progress-copy');

  let skills = [];
  let dbPublicationCheck = null;
  let activeKey = null;
  let loading = false;
  let researching = false;
  let researchResult = null;
  let recoveryTemplate = null;
  let publicationRefreshTimer = null;

  function setMessage(text = '', type = '') {
    message.textContent = text;
    message.className = `hero-skills-message${type ? ` ${type}` : ''}`;
  }

  function renderResearchSummary() {
    if (!researchResult) {
      researchSummary.classList.remove('is-visible');
      researchSummary.innerHTML = '';
      return;
    }

    const result = researchResult.result || {};
    const sources = Array.isArray(researchResult.consultedSources) ? researchResult.consultedSources : [];
    const confidence = Math.round(Number(result.confidence || 0) * 100);
    const isCatalog = researchResult.mode === 'catalog' || result.mode === 'catalog';
    const warnings = Array.isArray(result.warnings) ? result.warnings.filter(Boolean) : [];
    researchSummary.innerHTML = `
      <div class="hero-skills-research-head">
        <strong>${escapeHtml(result.canonicalHeroName || document.getElementById('name')?.value || 'Herói')} · ${Number(result.skills?.length || 0)} habilidade(s)</strong>
        <span>${isCatalog ? 'CATÁLOGO PADRÃO' : `${confidence}% confiança`}</span>
      </div>
      <div class="hero-skills-research-meta">${isCatalog ? 'Carga em lote aprovada carregada. Revise os cartões antes de salvar.' : 'Pesquisa online concluída. Revise os cartões antes de salvar.'}${warnings.length ? ` ${warnings.length} observação(ões) foi(ram) mantida(s).` : ''}</div>
      <div class="hero-skills-research-sources">
        ${sources.slice(0, 8).map(source => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title || 'Abrir fonte')} ↗</a>`).join('')}
      </div>
    `;
    researchSummary.classList.add('is-visible');
  }

  function skillByKey(key) {
    return skills.find(item => item._key === key) || null;
  }

  function renderLevelField(skill, level, field, label, options = {}) {
    const type = options.type || 'number';
    const step = options.step || 'any';
    const value = level[field] ?? '';
    return `
      <div class="hero-level-field">
        <label>${escapeHtml(label)}</label>
        <input
          type="${type}"
          ${type === 'number' ? `step="${step}"` : ''}
          value="${escapeHtml(value)}"
          data-level-field="${escapeHtml(field)}"
          data-skill-key="${escapeHtml(skill._key)}"
          data-level-key="${escapeHtml(level._key)}"
        >
      </div>
    `;
  }

  function renderLevelRow(skill, level) {
    return `
      <div class="hero-level-row" data-level-row="${escapeHtml(level._key)}">
        ${renderLevelField(skill, level, 'level', 'Nível', { step: '1' })}
        ${renderLevelField(skill, level, 'damage', 'Dano')}
        ${renderLevelField(skill, level, 'healing', 'Cura')}
        ${renderLevelField(skill, level, 'shield', 'Escudo')}
        ${renderLevelField(skill, level, 'cooldown', 'Recarga')}
        ${renderLevelField(skill, level, 'duration', 'Duração')}
        <button
          type="button"
          class="hero-level-remove"
          data-remove-level="${escapeHtml(level._key)}"
          data-skill-key="${escapeHtml(skill._key)}"
          aria-label="Remover nível"
          title="Remover nível"
        >✕</button>
        <div class="hero-level-extra">
          ${renderLevelField(skill, level, 'radius', 'Raio')}
          ${renderLevelField(skill, level, 'range', 'Alcance')}
          ${renderLevelField(skill, level, 'speed', 'Velocidade')}
          ${renderLevelField(skill, level, 'energy_cost', 'Energia', { step: '1' })}
          <div class="hero-level-field">
            <label>Observação / descrição do nível</label>
            <textarea
              data-level-field="description"
              data-skill-key="${escapeHtml(skill._key)}"
              data-level-key="${escapeHtml(level._key)}"
            >${escapeHtml(level.description ?? '')}</textarea>
          </div>
        </div>
      </div>
    `;
  }

  function renderSkillField(skill, field, label, options = {}) {
    const value = skill[field] ?? '';
    const classes = ['hero-skill-field'];
    if (options.full) classes.push('full');
    if (options.span2) classes.push('span2');

    if (options.textarea) {
      return `
        <div class="${classes.join(' ')}">
          <label>${escapeHtml(label)}</label>
          <textarea data-skill-field="${escapeHtml(field)}" data-skill-key="${escapeHtml(skill._key)}">${escapeHtml(value)}</textarea>
          ${options.help ? `<small>${escapeHtml(options.help)}</small>` : ''}
        </div>
      `;
    }

    const type = options.type || 'text';
    return `
      <div class="${classes.join(' ')}">
        <label>${escapeHtml(label)}</label>
        <input
          type="${type}"
          ${type === 'number' ? `step="${options.step || 'any'}"` : ''}
          value="${escapeHtml(value)}"
          data-skill-field="${escapeHtml(field)}"
          data-skill-key="${escapeHtml(skill._key)}"
          ${options.readonly ? 'readonly' : ''}
        >
        ${options.help ? `<small>${escapeHtml(options.help)}</small>` : ''}
      </div>
    `;
  }

  function renderSkillSources(skill) {
    const uniqueSources = new Map();
    for (const item of skill._researchEvidence || []) {
      if (!uniqueSources.has(item.url)) uniqueSources.set(item.url, item);
    }
    const sources = [...uniqueSources.values()];
    const sourceMarkup = sources.length
      ? sources.map(item => `
          <a class="hero-skill-source" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
            <strong>${escapeHtml(sourceDisplay(item))}</strong>
            <span title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
            <small>${escapeHtml(sourceFreshness(item))}</small>
          </a>
        `).join('')
      : '<span class="hero-skill-source-empty">Nenhuma fonte externa anexada. Use a busca para localizar uma origem rastreável.</span>';

    return `
      <section class="hero-skill-sources" aria-label="Fontes de ${escapeHtml(skill.name || 'habilidade')}">
        <div class="hero-skill-sources-head">
          <strong>Origem dos dados</strong>
          <span class="hero-skill-data-badge ${skill.id ? '' : 'pending'}">${skill.id ? 'Echo Arena Data ✅' : 'Echo Arena Data · pendente'}</span>
        </div>
        <div class="hero-skill-source-list">${sourceMarkup}</div>
      </section>
    `;
  }

  function renderSkillCard(skill) {
    const title = skill.name.trim() || 'Nova habilidade';
    const slug = skill.slug || slugify(skill.name) || 'identificador-pendente';
    const isDraft = !skill.id;
    const stateLabel = skill._researchPlaceholder
      ? 'Validação necessária'
      : isDraft
      ? (skill._researchOrigin ? 'Rascunho pesquisado' : 'Rascunho')
      : (skill.enabled ? 'Publicada' : 'Oculta');

    return `
      <article class="hero-skill-card ${skill.enabled || isDraft ? '' : 'is-disabled'} ${skill._researchPlaceholder ? 'is-validation-slot' : ''}" data-skill-card="${escapeHtml(skill._key)}">
        <header class="hero-skill-head">
          <div class="hero-skill-title">
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(slug)}</span>
          </div>
          <span class="hero-skill-state ${isDraft || !skill.enabled ? 'off' : ''}">${stateLabel}</span>
        </header>
        <div class="hero-skill-body">
          <div class="hero-skill-grid">
            ${renderSkillField(skill, 'name', 'Nome da habilidade', { span2: true })}
            ${renderSkillField(skill, 'slug', 'Identificador', { readonly: true })}
            ${renderSkillField(skill, 'skill_type', 'Tipo', { help: 'Texto livre. Use somente o tipo confirmado no jogo.' })}
            ${renderSkillField(skill, 'cooldown', 'Recarga', { type: 'number' })}
            ${renderSkillField(skill, 'duration', 'Duração', { type: 'number' })}
            ${renderSkillField(skill, 'energy_cost', 'Custo de energia', { type: 'number', step: '1' })}
            ${renderSkillField(skill, 'unlock_level', 'Nível de desbloqueio', { type: 'number', step: '1' })}
            ${renderSkillField(skill, 'max_level', 'Nível máximo', { type: 'number', step: '1' })}
            ${renderSkillField(skill, 'display_order', 'Ordem de exibição', { type: 'number', step: '1' })}
            <div class="hero-skill-field">
              <label>Publicação da habilidade</label>
              <label class="hero-skill-checkbox">
                <input type="checkbox" data-skill-enabled="${escapeHtml(skill._key)}" ${skill.enabled ? 'checked' : ''}>
                Exibir no frontend quando o herói estiver publicado
              </label>
            </div>
            ${renderSkillField(skill, 'description', 'Descrição', {
              textarea: true,
              full: true,
              help: 'Preserve o texto de fontes antigas quando for o único registro disponível, marque-o para revisão e nunca estime valores.'
            })}
          </div>

          ${renderSkillSources(skill)}

          <section class="hero-levels">
            <div class="hero-levels-head">
              <div>
                <strong>Níveis da habilidade</strong>
                <span>Valores por nível são opcionais. Não preencha valores estimados.</span>
              </div>
              <button type="button" class="admin-button" data-add-level="${escapeHtml(skill._key)}">Adicionar nível</button>
            </div>
            ${skill.levels.length
              ? skill.levels.map(level => renderLevelRow(skill, level)).join('')
              : '<div class="hero-skills-empty">Nenhum nível detalhado cadastrado. Isso é válido quando o jogo não disponibiliza esses números.</div>'}
          </section>

          <div class="hero-skill-actions">
            <button type="button" class="admin-button danger" data-delete-skill="${escapeHtml(skill._key)}">${skill.id ? 'Excluir habilidade' : 'Descartar rascunho'}</button>
            <button type="button" class="admin-button primary" data-save-skill="${escapeHtml(skill._key)}" ${skill._researchPlaceholder ? 'disabled' : ''}>${skill._researchPlaceholder ? 'Aguardando validação' : skill.id ? 'Salvar habilidade' : 'Criar habilidade'}</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderSkills() {
    const busy = loading || researching || Boolean(activeKey);
    const savedCount = skills.filter(item => item.id).length;
    const researchedCount = skills.filter(item => item._researchOrigin).length;
    const placeholderCount = skills.filter(item => item._researchPlaceholder).length;
    researchButton.disabled = !heroId || busy;
    saveResearchButton.disabled = !heroId || busy || researchedCount !== 4 || placeholderCount > 0;
    researchButton.textContent = researching ? 'Consultando fontes...' : 'Pesquisar quatro habilidades';
    saveResearchButton.textContent = activeKey === 'research-batch' ? 'Salvando quatro habilidades...' : 'Salvar as quatro habilidades';

    if (researching) {
      progressTitle.textContent = 'Consultando fontes';
      progressCopy.textContent = 'Echo Arena Data, ZeptoLab e fontes comunitárias permitidas.';
    } else if (savedCount === 4) {
      progressTitle.textContent = '4 habilidades salvas';
      progressCopy.textContent = 'As fontes anexadas permanecem visíveis ao reabrir o herói.';
    } else if (researchedCount === 4 && placeholderCount === 0) {
      progressTitle.textContent = '4 habilidades prontas para revisão';
      progressCopy.textContent = 'Confira os campos e salve o conjunto quando estiver correto.';
    } else if (placeholderCount > 0) {
      progressTitle.textContent = `${4 - placeholderCount} de 4 habilidades localizadas`;
      progressCopy.textContent = 'Os espaços restantes ficam visíveis para revisão; nenhum marcador pode ser salvo como dado real.';
    } else {
      progressTitle.textContent = 'Aguardando preenchimento';
      progressCopy.textContent = savedCount
        ? `${savedCount} de 4 habilidades salvas.`
        : 'A busca automática será iniciada para heróis sem habilidades.';
    }

    if (!heroId) {
      addButton.disabled = true;
      reloadButton.disabled = true;
      renderResearchSummary();
      list.innerHTML = `
        <div class="hero-skills-empty">
          Salve o herói primeiro. Ao abrir o registro salvo, o painel buscará as quatro habilidades automaticamente.
        </div>
      `;
      return;
    }

    addButton.disabled = busy;
    reloadButton.disabled = busy;

    renderResearchSummary();

    if (loading || researching) {
      list.innerHTML = `<div class="hero-skills-empty">${researching ? 'Pesquisando fontes atuais e preparando o preenchimento...' : 'Carregando habilidades e níveis...'}</div>`;
      return;
    }

    if (!skills.length) {
      list.innerHTML = `
        <div class="hero-skills-empty">
          Nenhuma habilidade cadastrada. A busca automática está pronta; se necessário, use <strong>Pesquisar quatro habilidades</strong>.
        </div>
      `;
      return;
    }

    list.innerHTML = skills.map(renderSkillCard).join('');
  }

  function validateSkill(skill) {
    const errors = [];
    const name = skill.name.trim();
    const slug = slugify(name);

    if (!name) errors.push('Informe o nome da habilidade.');
    if (!slug) errors.push('Não foi possível gerar o identificador da habilidade.');

    const integerFields = [
      ['energy_cost', 'Custo de energia'],
      ['unlock_level', 'Nível de desbloqueio'],
      ['max_level', 'Nível máximo'],
      ['display_order', 'Ordem de exibição']
    ];
    const numericFields = [
      ['cooldown', 'Recarga'],
      ['duration', 'Duração']
    ];

    for (const [field, label] of integerFields) {
      if (emptyToNull(skill[field]) === null) continue;
      if (Number.isNaN(numberOrNull(skill[field], { integer: true }))) {
        errors.push(`${label} precisa ser um número inteiro.`);
      }
    }

    for (const [field, label] of numericFields) {
      if (emptyToNull(skill[field]) === null) continue;
      if (Number.isNaN(numberOrNull(skill[field]))) {
        errors.push(`${label} precisa ser numérico.`);
      }
    }

    const seenLevels = new Set();
    const levelNumericFields = ['damage', 'healing', 'shield', 'cooldown', 'duration', 'radius', 'range', 'speed'];

    skill.levels.forEach((level, index) => {
      const levelNumber = numberOrNull(level.level, { integer: true });
      if (!Number.isInteger(levelNumber) || levelNumber < 1) {
        errors.push(`Nível ${index + 1}: informe um número inteiro maior ou igual a 1.`);
      } else if (seenLevels.has(levelNumber)) {
        errors.push(`O nível ${levelNumber} está repetido nesta habilidade.`);
      } else {
        seenLevels.add(levelNumber);
      }

      for (const field of levelNumericFields) {
        if (emptyToNull(level[field]) === null) continue;
        if (Number.isNaN(numberOrNull(level[field]))) {
          errors.push(`Nível ${index + 1}: o campo ${field} precisa ser numérico.`);
        }
      }

      if (emptyToNull(level.energy_cost) !== null && Number.isNaN(numberOrNull(level.energy_cost, { integer: true }))) {
        errors.push(`Nível ${index + 1}: custo de energia precisa ser inteiro.`);
      }
    });

    return { errors, slug };
  }

  function toSkillPayload(skill, slug) {
    return {
      id: skill.id,
      name: skill.name.trim(),
      slug,
      description: emptyToNull(skill.description),
      skill_type: emptyToNull(skill.skill_type),
      cooldown: numberOrNull(skill.cooldown),
      duration: numberOrNull(skill.duration),
      energy_cost: numberOrNull(skill.energy_cost, { integer: true }),
      unlock_level: numberOrNull(skill.unlock_level, { integer: true }),
      max_level: numberOrNull(skill.max_level, { integer: true }),
      display_order: numberOrNull(skill.display_order, { integer: true }) ?? 0,
      enabled: skill.enabled === true
    };
  }

  function toLevelPayload(level) {
    return {
      level: numberOrNull(level.level, { integer: true }),
      damage: numberOrNull(level.damage),
      healing: numberOrNull(level.healing),
      shield: numberOrNull(level.shield),
      cooldown: numberOrNull(level.cooldown),
      duration: numberOrNull(level.duration),
      radius: numberOrNull(level.radius),
      range: numberOrNull(level.range),
      speed: numberOrNull(level.speed),
      energy_cost: numberOrNull(level.energy_cost, { integer: true }),
      description: emptyToNull(level.description)
    };
  }

  async function loadRecoveryTemplate() {
    const classField = document.getElementById('class-id');
    const classId = classField?.value || null;
    const className = classId ? (classField?.selectedOptions?.[0]?.textContent?.trim() || null) : null;
    if (!classId) return { className, template: null };

    const heroesResult = await supabase
      .from('heroes')
      .select('id,name')
      .eq('class_id', classId)
      .eq('enabled', true)
      .order('display_order', { ascending: true })
      .limit(30);
    if (heroesResult.error) throw heroesResult.error;

    const heroIds = (heroesResult.data || []).map(item => item.id).filter(id => id && id !== heroId);
    if (!heroIds.length) return { className, template: null };

    const skillsResult = await supabase
      .from('hero_skills')
      .select('id,name,slug,description,skill_type,cooldown,duration,energy_cost,unlock_level,max_level,display_order')
      .in('hero_id', heroIds)
      .eq('display_order', 1)
      .eq('enabled', true)
      .limit(1);
    if (skillsResult.error) throw skillsResult.error;

    const template = skillsResult.data?.[0];
    if (!template) return { className, template: null };

    const linksResult = await supabase
      .from('hero_skill_source_links')
      .select('source_id,coverage')
      .eq('skill_id', template.id);
    if (linksResult.error) throw linksResult.error;

    const sourceIds = (linksResult.data || []).map(item => item.source_id).filter(Boolean);
    let sources = [];
    if (sourceIds.length) {
      const sourcesResult = await supabase
        .from('source_references')
        .select('id,url,title,source_type,language,publisher,last_checked_at,source_updated_at')
        .in('id', sourceIds);
      if (sourcesResult.error) throw sourcesResult.error;
      sources = sourcesResult.data || [];
    }
    const sourceById = new Map(sources.map(item => [item.id, item]));
    const evidence = normalizeEvidence((linksResult.data || []).flatMap(link => {
      const source = sourceById.get(link.source_id);
      return source ? [{
        url: source.url,
        title: source.title,
        coverage: link.coverage,
        source_updated_at: source.source_updated_at,
        last_checked_at: source.last_checked_at
      }] : [];
    }));

    return {
      className,
      template: {
        name: template.name,
        slug: template.slug,
        description: template.description,
        skillType: template.skill_type,
        cooldown: template.cooldown,
        duration: template.duration,
        energyCost: template.energy_cost,
        unlockLevel: template.unlock_level,
        maxLevel: template.max_level,
        displayOrder: 1,
        evidence
      }
    };
  }

  async function previewSkillCatalog(heroSlug) {
    const { data, error } = await supabase.rpc('admin_preview_hero_skill_catalog', {
      p_hero_slug: heroSlug
    });
    if (error) throw error;
    if (!data?.found || !Array.isArray(data.skills) || data.skills.length !== 4) return null;
    return {
      ok: true,
      schemaVersion: RESEARCH_SCHEMA_VERSION,
      ...data,
      result: {
        heroMatch: data.heroMatch || 'exact',
        canonicalHeroName: data.canonicalHeroName || null,
        canonicalClass: data.canonicalClass || null,
        skills: data.skills,
        confidence: data.confidence,
        warnings: data.warnings || []
      }
    };
  }

  async function researchSkillsFromSources({ heroName, heroSlug, className, recoveryTemplate: template }) {
    const { data, error } = await supabase.functions.invoke('admin-hero-skills-research', {
      body: {
        schemaVersion: RESEARCH_SCHEMA_VERSION,
        heroName,
        heroSlug,
        className,
        recoveryTemplate: template
      }
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || 'A pesquisa de fontes não retornou um resultado válido.');
    return { mode: 'online', ...data };
  }

  async function researchSkillsOnline({ automatic = false } = {}) {
    if (!heroId || researching || activeKey) return;
    const heroName = document.getElementById('name')?.value.trim() || '';
    const heroSlug = document.getElementById('slug')?.value.trim() || slugify(heroName);
    if (heroName.length < 2) {
      setMessage('Informe o nome do herói antes de iniciar a pesquisa.', 'error');
      return;
    }

    if (!automatic && skills.some(item => item.id)) {
      const confirmed = window.confirm(
        'Uma nova prévia com quatro habilidades será preparada. Nada será alterado no banco até você clicar em “Salvar as 4 habilidades”. Continuar?'
      );
      if (!confirmed) return;
    }

    researching = true;
    researchResult = null;
    renderSkills();
    setMessage(`Buscando quatro habilidades de ${heroName}...`);

    try {
      const templateContext = await loadRecoveryTemplate();
      recoveryTemplate = templateContext.template;
      // A base interna é a primeira opção. Quando ela ainda não tem uma ficha
      // completa, a Edge Function administrativa consulta fontes externas
      // permitidas e devolve apenas um rascunho rastreável.
      const catalogData = await previewSkillCatalog(heroSlug);
      const data = catalogData || await researchSkillsFromSources({
        heroName,
        heroSlug,
        className: templateContext.className,
        recoveryTemplate
      });
      const researchedRows = Array.isArray(data.result?.skills) ? data.result.skills : [];
      const rowsByOrder = new Map(
        researchedRows
          .filter(row => Number.isInteger(Number(row.displayOrder)) && Number(row.displayOrder) >= 0 && Number(row.displayOrder) <= 3)
          .map(row => [Number(row.displayOrder), row])
      );
      const visibleRows = Array.from({ length: 4 }, (_, displayOrder) => rowsByOrder.get(displayOrder) || {
        name: `Habilidade ${displayOrder + 1} · validar`,
        slug: `habilidade-${displayOrder + 1}-validar`,
        description: 'Nenhuma fonte rastreável confirmou este espaço. O cartão permanece visível para nova pesquisa ou validação manual, mas não pode ser salvo como dado real.',
        skillType: 'Tipo a confirmar',
        cooldown: null,
        duration: null,
        energyCost: null,
        unlockLevel: null,
        maxLevel: null,
        displayOrder,
        origin: 'validation_placeholder',
        confidence: 0,
        evidence: [],
        warnings: ['Espaço de revisão: não representa uma habilidade confirmada.'],
        _researchPlaceholder: true
      });

      const existingBySlug = new Map(skills.filter(item => item.id).map(item => [slugify(item.slug || item.name), item]));
      skills = visibleRows.map(row => {
        const existing = existingBySlug.get(slugify(row.slug || row.name));
        const rawEvidence = row.origin === 'canonical_template'
          ? (recoveryTemplate?.evidence || [])
          : row.evidence;
        const evidence = (Array.isArray(rawEvidence) ? rawEvidence : []).map(item => ({
          ...item,
          lastCheckedAt: item.lastCheckedAt || data.searchedAt || null
        }));
        return normalizeSkill({
          id: existing?.id || null,
          hero_id: heroId,
          name: row.name,
          slug: slugify(row.slug || row.name),
          description: row.description,
          skill_type: skillTypeInPortuguese(row.skillType),
          cooldown: row.cooldown,
          duration: row.duration,
          energy_cost: row.energyCost,
          unlock_level: row.unlockLevel,
          max_level: row.maxLevel,
          display_order: row.displayOrder,
          enabled: existing?.enabled ?? true,
          _researchEvidence: evidence,
          _researchOrigin: row.origin,
          _researchPlaceholder: row._researchPlaceholder === true,
          _researchConfidence: row.confidence,
          _researchWarnings: row.warnings
        }, existing?.levels || []);
      });
      researchResult = data;
      const locatedCount = skills.filter(item => !item._researchPlaceholder).length;
      setMessage(
        locatedCount === 4
          ? 'Quatro habilidades preenchidas. Revise os cartões e salve o conjunto.'
          : `${locatedCount} de 4 habilidades localizadas. Os demais espaços continuam visíveis, sem inventar dados.`,
        locatedCount === 4 ? 'ok' : ''
      );
    } catch (error) {
      console.error('[hero-skills] pesquisa online:', error);
      if (!skills.some(item => item.id)) {
        skills = Array.from({ length: 4 }, (_, displayOrder) => normalizeSkill({
          hero_id: heroId,
          name: `Habilidade ${displayOrder + 1} · validar`,
          slug: `habilidade-${displayOrder + 1}-validar`,
          description: 'A pesquisa não encontrou uma referência segura neste momento. Este espaço não é um dado do jogo e não pode ser salvo até ser confirmado.',
          skill_type: 'Tipo a confirmar',
          display_order: displayOrder,
          enabled: false,
          _researchOrigin: 'validation_placeholder',
          _researchPlaceholder: true,
          _researchWarnings: ['Espaço de revisão: não representa uma habilidade confirmada.']
        }));
      }
      setMessage(`${await readableResearchError(error)} Os quatro espaços de revisão continuam disponíveis.`, 'error');
    } finally {
      researching = false;
      renderSkills();
      schedulePublicationRefresh();
    }
  }

  async function persistSkillEvidence(skillId, evidenceRows) {
    const evidence = normalizeEvidence(evidenceRows);
    if (!evidence.length) return;
    const urls = [...new Set(evidence.map(item => item.url))];

    const currentSourcesResult = await supabase
      .from('source_references')
      .select('id,url,source_updated_at')
      .in('url', urls);
    if (currentSourcesResult.error) throw currentSourcesResult.error;
    const currentSourceByUrl = new Map((currentSourcesResult.data || []).map(item => [item.url, item]));
    const checkedAt = new Date().toISOString();
    const sourceRows = urls.map(url => {
      const row = evidence.find(item => item.url === url);
      return {
        url,
        source_type: row.source_type,
        language: row.language,
        title: row.title,
        publisher: row.publisher,
        last_checked_at: checkedAt,
        source_updated_at: row.source_updated_at || currentSourceByUrl.get(url)?.source_updated_at || null
      };
    });
    const sourcesResult = await supabase
      .from('source_references')
      .upsert(sourceRows, { onConflict: 'url' })
      .select('id,url');
    if (sourcesResult.error) throw sourcesResult.error;
    const sourceByUrl = new Map((sourcesResult.data || []).map(item => [item.url, item]));

    const sourceIds = [...sourceByUrl.values()].map(item => item.id);
    if (!sourceIds.length) {
      throw new Error('Não foi possível registrar as fontes consultadas. Nenhuma habilidade foi marcada como verificada.');
    }
    const linksResult = await supabase
      .from('hero_skill_source_links')
      .select('source_id,coverage')
      .eq('skill_id', skillId)
      .in('source_id', sourceIds);
    if (linksResult.error) throw linksResult.error;
    const existing = new Set((linksResult.data || []).map(item => `${item.source_id}|${item.coverage}`));

    const links = evidence.flatMap((item, index) => {
      const source = sourceByUrl.get(item.url);
      if (!source || existing.has(`${source.id}|${item.coverage}`)) return [];
      return [{
        skill_id: skillId,
        source_id: source.id,
        coverage: item.coverage,
        is_primary: index === 0,
        verification_status: 'corroborated',
        verified_at: new Date().toISOString(),
        verified_patch: null,
        needs_recheck: true,
        public_note: evidence.some(item => item.source_type === 'wiki' || item.source_type === 'forum' || item.source_type === 'community')
          ? 'Fonte comunitária anexada como corroboração. Revisão administrativa continua necessária; nenhuma habilidade foi promovida automaticamente a verificada.'
          : 'Fonte localizada por pesquisa online assistida. Revisão administrativa ainda necessária; nenhuma habilidade foi promovida automaticamente a verificada.'
      }];
    });
    if (links.length) {
      const insertLinks = await supabase.from('hero_skill_source_links').insert(links);
      if (insertLinks.error) throw insertLinks.error;
    }
  }

  async function loadSkills({ announce = false } = {}) {
    if (!heroId) {
      skills = [];
      renderSkills();
      return;
    }

    loading = true;
    renderSkills();
    if (announce) setMessage('Recarregando habilidades...');

    try {
      const skillsResult = await supabase
        .from('hero_skills')
        .select('id,hero_id,name,slug,description,skill_type,cooldown,duration,energy_cost,unlock_level,max_level,display_order,enabled,created_at,updated_at')
        .eq('hero_id', heroId)
        .order('display_order', { ascending: true })
        .order('name', { ascending: true });

      if (skillsResult.error) throw skillsResult.error;

      const rows = skillsResult.data || [];
      let levelRows = [];
      let sourceLinkRows = [];
      let sourceRows = [];
      const skillIds = rows.map(item => item.id).filter(Boolean);

      if (skillIds.length) {
        const [levelsResult, linksResult] = await Promise.all([
          supabase
            .from('hero_skill_levels')
            .select('id,skill_id,level,damage,healing,shield,cooldown,duration,radius,range,speed,energy_cost,description,created_at')
            .in('skill_id', skillIds)
            .order('level', { ascending: true }),
          supabase
            .from('hero_skill_source_links')
            .select('skill_id,source_id,coverage,verification_status,verified_at,needs_recheck')
            .in('skill_id', skillIds)
        ]);

        if (levelsResult.error) throw levelsResult.error;
        if (linksResult.error) throw linksResult.error;
        levelRows = levelsResult.data || [];
        sourceLinkRows = linksResult.data || [];

        const sourceIds = [...new Set(sourceLinkRows.map(item => item.source_id).filter(Boolean))];
        if (sourceIds.length) {
          const sourcesResult = await supabase
            .from('source_references')
            .select('id,url,title,source_type,language,publisher,last_checked_at,source_updated_at')
            .in('id', sourceIds);
          if (sourcesResult.error) throw sourcesResult.error;
          sourceRows = sourcesResult.data || [];
        }
      }

      const levelsBySkill = new Map();
      for (const row of levelRows) {
        if (!levelsBySkill.has(row.skill_id)) levelsBySkill.set(row.skill_id, []);
        levelsBySkill.get(row.skill_id).push(row);
      }

      const sourceById = new Map(sourceRows.map(item => [item.id, item]));
      const evidenceBySkill = new Map();
      for (const link of sourceLinkRows) {
        const source = sourceById.get(link.source_id);
        if (!source) continue;
        if (!evidenceBySkill.has(link.skill_id)) evidenceBySkill.set(link.skill_id, []);
        evidenceBySkill.get(link.skill_id).push({
          ...source,
          coverage: link.coverage,
          verification_status: link.verification_status,
          verified_at: link.verified_at,
          needs_recheck: link.needs_recheck
        });
      }

      skills = rows.map(row => normalizeSkill({
        ...row,
        _researchEvidence: evidenceBySkill.get(row.id) || []
      }, levelsBySkill.get(row.id) || []));
      if (announce) setMessage(`${skills.length} habilidade(s) carregada(s).`, 'ok');
    } catch (error) {
      console.error('[hero-skills] erro ao carregar:', error);
      skills = [];
      setMessage(error.message || 'Não foi possível carregar as habilidades.', 'error');
    } finally {
      loading = false;
      renderSkills();
      schedulePublicationRefresh();
    }
  }

  async function saveSkillRecord(skill) {
    const validation = validateSkill(skill);
    if (validation.errors.length) {
      throw new Error(validation.errors.join(' '));
    }

    const { data, error } = await supabase.rpc('admin_save_hero_skill', {
      p_hero_id: heroId,
      p_skill: toSkillPayload(skill, validation.slug),
      p_levels: skill.levels.map(toLevelPayload)
    });

    if (error) throw error;
    if (!data) throw new Error('O banco não confirmou o ID da habilidade salva.');

    // Guarde o ID imediatamente: se apenas o vínculo de fonte falhar, uma nova
    // tentativa atualiza a habilidade já criada em vez de duplicá-la.
    skill.id = data;
    await persistSkillEvidence(data, skill._researchEvidence);
    return data;
  }

  async function saveSkill(key) {
    if (!heroId || activeKey) return;
    const skill = skillByKey(key);
    if (!skill) return;

    const validation = validateSkill(skill);
    if (validation.errors.length) {
      setMessage(validation.errors.join(' '), 'error');
      return;
    }

    activeKey = key;
    renderSkills();
    setMessage(`Salvando ${skill.name.trim()}...`);

    try {
      await saveSkillRecord(skill);
      setMessage(`${skill.name.trim()} foi salva com os níveis informados.`, 'ok');
      await loadSkills();
      await refreshDatabasePublicationCheck();
    } catch (error) {
      console.error('[hero-skills] erro ao salvar:', error);
      setMessage(error.message || 'Não foi possível salvar a habilidade.', 'error');
    } finally {
      activeKey = null;
      renderSkills();
    }
  }

  async function saveResearchSkills() {
    if (!heroId || activeKey) return;
    const researchedSkills = skills.filter(item => item._researchOrigin);
    if (!researchedSkills.length) {
      setMessage('Busque as quatro habilidades antes de salvar o preenchimento.', 'error');
      return;
    }
    if (researchedSkills.length !== 4) {
      setMessage(`Foram preparadas ${researchedSkills.length} de 4 habilidades. O conjunto incompleto não será salvo.`, 'error');
      return;
    }

    const invalid = researchedSkills.flatMap(skill => {
      const validation = validateSkill(skill);
      return validation.errors.length
        ? [`${skill.name || 'Habilidade sem nome'}: ${validation.errors.join(' ')}`]
        : [];
    });
    if (invalid.length) {
      setMessage(invalid.join(' '), 'error');
      return;
    }

    activeKey = 'research-batch';
    renderSkills();
    let savedCount = 0;

    try {
      for (const skill of researchedSkills) {
        setMessage(`Salvando pesquisa: ${savedCount + 1}/${researchedSkills.length} · ${skill.name}...`);
        await saveSkillRecord(skill);
        savedCount += 1;
      }

      researchResult = null;
      await loadSkills();
      await refreshDatabasePublicationCheck();
      setMessage(`${savedCount} habilidades e suas fontes foram salvas no Echo Arena Data.`, 'ok');
    } catch (error) {
      console.error('[hero-skills] erro ao salvar pesquisa:', error);
      setMessage(
        `${savedCount} de ${researchedSkills.length} habilidade(s) foram salvas. ${error.message || 'Não foi possível concluir o restante.'}`,
        'error'
      );
    } finally {
      activeKey = null;
      renderSkills();
    }
  }

  async function deleteSkill(key) {
    if (!heroId || activeKey) return;
    const skill = skillByKey(key);
    if (!skill) return;

    if (!skill.id) {
      skills = skills.filter(item => item._key !== key);
      renderSkills();
      setMessage('Rascunho descartado. Nada foi alterado no banco.', 'ok');
      schedulePublicationRefresh();
      return;
    }

    const confirmed = window.confirm(
      `Excluir a habilidade "${skill.name || skill.slug}"?\n\nOs níveis vinculados também serão removidos pelo relacionamento do banco.`
    );
    if (!confirmed) return;

    activeKey = key;
    renderSkills();
    setMessage(`Excluindo ${skill.name}...`);

    try {
      const { error } = await supabase
        .from('hero_skills')
        .delete()
        .eq('id', skill.id)
        .eq('hero_id', heroId);

      if (error) throw error;
      setMessage(`${skill.name} foi excluída.`, 'ok');
      await loadSkills();
      await refreshDatabasePublicationCheck();
    } catch (error) {
      console.error('[hero-skills] erro ao excluir:', error);
      setMessage(error.message || 'Não foi possível excluir a habilidade.', 'error');
    } finally {
      activeKey = null;
      renderSkills();
    }
  }

  function addSkill() {
    if (!heroId || activeKey) return;
    const highestOrder = skills.reduce((max, item) => {
      const value = Number(item.display_order);
      return Number.isFinite(value) ? Math.max(max, value) : max;
    }, -1);
    const draft = blankSkill(highestOrder + 1);
    skills.push(draft);
    renderSkills();
    setMessage('Rascunho criado. Preencha apenas dados confirmados e clique em Criar habilidade.');
    requestAnimationFrame(() => {
      manager.querySelector(`[data-skill-card="${CSS.escape(draft._key)}"] [data-skill-field="name"]`)?.focus();
    });
    schedulePublicationRefresh();
  }

  function addLevel(skillKey) {
    const skill = skillByKey(skillKey);
    if (!skill) return;
    skill.levels.push(blankLevel());
    renderSkills();
    setMessage('Nível adicionado ao formulário. Ele só será persistido ao salvar a habilidade.');
  }

  function removeLevel(skillKey, levelKey) {
    const skill = skillByKey(skillKey);
    if (!skill) return;
    skill.levels = skill.levels.filter(level => level._key !== levelKey);
    renderSkills();
    setMessage('Nível removido do formulário. Salve a habilidade para confirmar no banco.');
  }

  function updateCardHeader(skill) {
    const cardElement = manager.querySelector(`[data-skill-card="${CSS.escape(skill._key)}"]`);
    if (!cardElement) return;
    const title = cardElement.querySelector('.hero-skill-title strong');
    const slug = cardElement.querySelector('.hero-skill-title span');
    if (title) title.textContent = skill.name.trim() || 'Nova habilidade';
    if (slug) slug.textContent = skill.slug || 'identificador-pendente';
  }

  function ensurePublicationUi() {
    if (document.getElementById('hero-publication-check')) return;
    const enabled = document.getElementById('enabled');
    const grid = enabled?.closest('.hero-form-grid');
    if (!grid) return;

    const wrapper = document.createElement('section');
    wrapper.id = 'hero-publication-check';
    wrapper.className = 'hero-publication-check';
    wrapper.innerHTML = `
      <div class="hero-publication-head">
        <strong>Validação de publicação</strong>
        <span id="hero-publication-badge" class="hero-publication-badge">Verificando</span>
      </div>
      <div id="hero-publication-items" class="hero-publication-items"></div>
    `;
    grid.appendChild(wrapper);

    const modal = document.createElement('div');
    modal.id = 'hero-publication-modal';
    modal.className = 'hero-publication-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <section class="hero-publication-modal-card" role="alertdialog" aria-modal="true" aria-labelledby="hero-publication-modal-title">
        <h2 id="hero-publication-modal-title">Herói ainda não pode ser publicado</h2>
        <p>O cadastro pode ser salvo como inativo. Para publicar, complete os requisitos reais abaixo.</p>
        <div id="hero-publication-modal-list" class="hero-publication-modal-list"></div>
        <button id="hero-publication-modal-close" type="button" class="admin-button primary">Revisar cadastro</button>
      </section>
    `;
    document.body.appendChild(modal);
    document.getElementById('hero-publication-modal-close')?.addEventListener('click', () => closePublicationModal());
  }

  function editorHasLoadedHero() {
    if (!heroId) return true;
    return /^Editar\s+/i.test(document.getElementById('editor-title')?.textContent?.trim() || '');
  }

  function databaseHasNoBlock(code) {
    if (!dbPublicationCheck) return false;
    return !(dbPublicationCheck.blocking || []).some(item => item?.code === code);
  }

  function collectLocalPublicationCheck() {
    const loaded = editorHasLoadedHero();
    const classField = document.getElementById('class-id');
    const descriptionField = document.getElementById('description');
    const hasClass = Boolean(classField?.value) || (!loaded && databaseHasNoBlock('missing_class'));

    const hasCurrentMedia = Boolean(
      document.querySelector('#main-image-canvas.has-image, #card-image-canvas.has-image') ||
      document.getElementById('image-file')?.files?.length ||
      document.getElementById('card-file')?.files?.length
    );
    const hasMedia = hasCurrentMedia || (!loaded && databaseHasNoBlock('missing_media'));

    const statInputs = [...document.querySelectorAll('.stat-field[data-group="hero"] input')];
    const hasLocalBaseStat = statInputs.some(input => {
      const value = input.value.trim();
      return value !== '' && Number.isFinite(Number(value));
    });
    const hasBaseStats = statInputs.length
      ? hasLocalBaseStat
      : Boolean(dbPublicationCheck?.counts?.base_stats > 0);

    const blocking = [];
    if (!hasClass) blocking.push({ code: 'missing_class', label: 'Defina a classe do herói.' });
    if (!hasMedia) blocking.push({ code: 'missing_media', label: 'Cadastre a imagem principal ou a imagem do card.' });
    if (!hasBaseStats) blocking.push({ code: 'missing_base_stats', label: 'Cadastre ao menos um status base real do herói.' });

    const warnings = [];
    if (!descriptionField?.value?.trim()) warnings.push({ code: 'missing_description', label: 'Descrição ainda não cadastrada.' });

    const savedSkills = skills.filter(item => item.id);
    const enabledSkills = savedSkills.filter(item => item.enabled);
    if (!savedSkills.length) warnings.push({ code: 'missing_skills', label: 'Nenhuma habilidade cadastrada ainda.' });
    else if (!enabledSkills.length) warnings.push({ code: 'no_enabled_skills', label: 'Há habilidades cadastradas, mas nenhuma está publicada.' });

    const weaponInputs = [...document.querySelectorAll('.stat-field[data-group="weapon"] input')];
    const hasWeapon = weaponInputs.some(input => input.value.trim() !== '' && Number.isFinite(Number(input.value)));
    if (weaponInputs.length && !hasWeapon) warnings.push({ code: 'missing_weapon_stats', label: 'Dados de arma ainda não cadastrados.' });
    else if (!weaponInputs.length && dbPublicationCheck?.counts?.weapon_stats === 0) warnings.push({ code: 'missing_weapon_stats', label: 'Dados de arma ainda não cadastrados.' });

    return { ready: blocking.length === 0, blocking, warnings };
  }

  function renderPublicationCheck() {
    ensurePublicationUi();
    const box = document.getElementById('hero-publication-check');
    const badge = document.getElementById('hero-publication-badge');
    const items = document.getElementById('hero-publication-items');
    if (!box || !badge || !items) return;

    const check = collectLocalPublicationCheck();
    box.classList.toggle('is-ready', check.ready);
    box.classList.toggle('is-blocked', !check.ready);
    badge.textContent = check.ready ? 'Pronto para publicar' : `${check.blocking.length} bloqueio(s)`;

    const rows = [];
    if (check.ready) rows.push('<div class="hero-publication-item">✓ Classe, mídia e status base atendem aos requisitos de publicação.</div>');
    rows.push(...check.blocking.map(item => `<div class="hero-publication-item block">✕ ${escapeHtml(item.label)}</div>`));
    rows.push(...check.warnings.map(item => `<div class="hero-publication-item warn">⚠ ${escapeHtml(item.label)}</div>`));
    items.innerHTML = rows.join('');
  }

  function schedulePublicationRefresh() {
    clearTimeout(publicationRefreshTimer);
    publicationRefreshTimer = setTimeout(renderPublicationCheck, 80);
  }

  async function refreshDatabasePublicationCheck() {
    if (!heroId) {
      dbPublicationCheck = null;
      schedulePublicationRefresh();
      return;
    }

    try {
      const { data, error } = await supabase.rpc('admin_hero_publication_check', {
        p_hero_id: heroId
      });
      if (error) throw error;
      dbPublicationCheck = data || null;
    } catch (error) {
      console.warn('[hero-skills] validação de publicação indisponível:', error.message);
    } finally {
      schedulePublicationRefresh();
    }
  }

  function openPublicationModal(check) {
    ensurePublicationUi();
    const modal = document.getElementById('hero-publication-modal');
    const modalList = document.getElementById('hero-publication-modal-list');
    if (!modal || !modalList) return;
    modalList.innerHTML = check.blocking.map(item => `<div>${escapeHtml(item.label)}</div>`).join('');
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closePublicationModal() {
    const modal = document.getElementById('hero-publication-modal');
    modal?.classList.remove('is-open');
    modal?.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    document.querySelector('[data-tab="general"]')?.click();
    document.getElementById('hero-publication-check')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  manager.addEventListener('input', event => {
    const target = event.target;
    const skillKey = target.dataset.skillKey;
    const skill = skillByKey(skillKey);
    if (!skill) return;

    if (target.dataset.skillField) {
      skill[target.dataset.skillField] = target.value;
      if (target.dataset.skillField === 'name') {
        skill.slug = slugify(target.value);
        const slugInput = manager.querySelector(`[data-skill-card="${CSS.escape(skill._key)}"] [data-skill-field="slug"]`);
        if (slugInput) slugInput.value = skill.slug;
        updateCardHeader(skill);
      }
      schedulePublicationRefresh();
      return;
    }

    if (target.dataset.levelField && target.dataset.levelKey) {
      const level = skill.levels.find(item => item._key === target.dataset.levelKey);
      if (!level) return;
      level[target.dataset.levelField] = target.value;
    }
  });

  manager.addEventListener('change', event => {
    const enabledKey = event.target.dataset.skillEnabled;
    if (!enabledKey) return;
    const skill = skillByKey(enabledKey);
    if (!skill) return;
    skill.enabled = event.target.checked;
    renderSkills();
    schedulePublicationRefresh();
  });

  manager.addEventListener('click', event => {
    const addLevelButton = event.target.closest('[data-add-level]');
    if (addLevelButton) {
      addLevel(addLevelButton.dataset.addLevel);
      return;
    }

    const removeLevelButton = event.target.closest('[data-remove-level]');
    if (removeLevelButton) {
      removeLevel(removeLevelButton.dataset.skillKey, removeLevelButton.dataset.removeLevel);
      return;
    }

    const saveButton = event.target.closest('[data-save-skill]');
    if (saveButton) {
      saveSkill(saveButton.dataset.saveSkill);
      return;
    }

    const deleteButton = event.target.closest('[data-delete-skill]');
    if (deleteButton) deleteSkill(deleteButton.dataset.deleteSkill);
  });

  addButton.addEventListener('click', addSkill);
  reloadButton.addEventListener('click', () => loadSkills({ announce: true }));
  researchButton.addEventListener('click', () => researchSkillsOnline());
  saveResearchButton.addEventListener('click', saveResearchSkills);

  document.addEventListener('input', event => {
    if (event.target.closest('#hero-skills-manager')) return;
    schedulePublicationRefresh();
  }, true);
  document.addEventListener('change', event => {
    if (event.target.closest('#hero-skills-manager')) return;
    schedulePublicationRefresh();
  }, true);

  const form = document.getElementById('hero-form');
  form?.addEventListener('submit', event => {
    const enabled = document.getElementById('enabled');
    if (!enabled?.checked) return;

    const check = collectLocalPublicationCheck();
    if (check.ready) return;

    if (!heroId) {
      enabled.checked = false;
      enabled.dispatchEvent(new Event('change', { bubbles: true }));
      setMessage('Cadastro incompleto salvo como rascunho. Complete classe, mídia e status base para publicar.', '');
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    openPublicationModal(check);
    setMessage('Publicação bloqueada até completar classe, mídia e status base reais.', 'error');
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.getElementById('hero-publication-modal')?.classList.contains('is-open')) {
      closePublicationModal();
    }
  });

  ensurePublicationUi();
  renderSkills();

  await Promise.all([
    loadSkills(),
    refreshDatabasePublicationCheck()
  ]);

  if (params.get('autoSkills') === '1') {
    params.delete('autoSkills');
    const query = params.toString();
    history.replaceState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
  }
  if (heroId && !skills.length) await researchSkillsOnline({ automatic: true });

  setTimeout(schedulePublicationRefresh, 800);
}
