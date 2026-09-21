import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';
import { SITE_CONTENT_PAGES, getContentPage } from '../../js/site-content-schema.js?v=9';
import { uploadMedia } from '../../js/media-storage.js?v=20260823-security-supabase-pin-1';
import { showAdminDecisionModal } from './admin-decision-modal.js?v=2';
import {
  announcementVariantLabel,
  evaluateAnnouncementState,
  formatAnnouncementDate,
  getAnnouncementSnapshot
} from './admin-announcement-awareness.js?v=20260822-maintenance-2&sb=20260823-security-supabase-pin-1';

const elements = {
  pageSelect: document.getElementById('page-select'),
  pageName: document.getElementById('page-name'),
  pageDescription: document.getElementById('page-description'),
  published: document.getElementById('page-published'),
  openPage: document.getElementById('open-page'),
  fields: document.getElementById('content-fields'),
  message: document.getElementById('content-message'),
  warning: document.getElementById('setup-warning'),
  dirty: document.getElementById('dirty-badge'),
  save: document.getElementById('save-content'),
  reload: document.getElementById('reload-content'),
  refresh: document.getElementById('refresh-preview'),
  preview: document.getElementById('page-preview'),
  tabs: document.getElementById('content-editor-tabs'),
  workspace: document.getElementById('content-workspace'),
  imageTemplate: document.getElementById('image-field-template')
};

const state = {
  page: SITE_CONTENT_PAGES[0],
  row: null,
  content: {},
  original: {},
  published: true,
  originalPublished: true,
  saving: false,
  uploading: 0,
  heroes: [],
  activeTab: 'information',
  activeGroups: {}
};

const editorTabs = [
  { key: 'information', label: 'Informações', description: 'SEO, títulos, descrições e filtros.' },
  { key: 'media', label: 'Mídia', description: 'Imagens, cenários e enquadramentos.' },
  { key: 'content', label: 'Conteúdo', description: 'Textos, ações, cards e mensagens.' },
  { key: 'visibility', label: 'Visibilidade', description: 'Controle das seções publicadas.' },
  { key: 'preview', label: 'Prévia', description: 'Visualização completa em tempo real.' }
];

const announcementTabs = [
  { key: 'announcement-type', label: '1 · Objetivo', short: 'Avisar ou bloquear', description: 'Defina o visual e escolha claramente se o site continua online ou entra em manutenção.' },
  { key: 'announcement-message', label: '2 · Mensagem', short: 'Escreva o aviso', description: 'Informe o título, o texto principal e um botão opcional.' },
  { key: 'announcement-schedule', label: '3 · Agendamento', short: 'Defina o período', description: 'Escolha quando o aviso ou bloqueio começa e quando termina automaticamente.' },
  { key: 'announcement-publish', label: '4 · Publicação', short: 'Revise e ative', description: 'Confira o efeito final antes de alterar o que os visitantes encontram no site.' }
];

const announcementFieldTabs = {
  variant: 'announcement-type',
  access_mode: 'announcement-type',
  label: 'announcement-message',
  message: 'announcement-message',
  cta_label: 'announcement-message',
  cta_url: 'announcement-message',
  starts_at: 'announcement-schedule',
  ends_at: 'announcement-schedule',
  dismissible: 'announcement-schedule',
  enabled: 'announcement-publish'
};

function isAnnouncementPage() {
  return state.page?.key === 'global_announcement';
}

function escapeHtml(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function setMessage(text = '', type = '') {
  elements.message.textContent = text;
  elements.message.className = `content-message${type ? ` ${type}` : ''}`;
}

function isDirty() {
  return JSON.stringify(state.content) !== JSON.stringify(state.original)
    || state.published !== state.originalPublished;
}

function updateDirty() {
  elements.dirty.hidden = !isDirty();
  updateAnnouncementConsole();
}

function setValue(key, value) {
  if (value === '' || value === null || value === undefined) delete state.content[key];
  else state.content[key] = value;
  if (key === 'access_mode' && value === 'maintenance_lock') {
    state.content.variant = 'maintenance';
    state.content.dismissible = false;
  }
  if (key === 'variant' && value !== 'maintenance' && state.content.access_mode === 'maintenance_lock') {
    state.content.access_mode = 'banner_only';
  }
  updateDirty();
  applyDraftToPreview();
  syncCompareHeroEditor();
}

const compareTransformKeys = new Set(['hero_art_scale', 'hero_art_scale_mobile', 'hero_art_x', 'hero_art_y']);

function renderCompareHeroEditor() {
  return `<div class="content-field hero-transform-field">
    <div class="content-field-head"><label>Enquadramento visual do herói</label><button class="field-reset" type="button" data-reset-hero-transform>Restaurar posição</button></div>
    <p class="hero-transform-help">Arraste o herói com o dedo ou mouse. Use a barra para aproximar ou afastar.</p>
    <div class="hero-transform-mode" role="group" aria-label="Dispositivo da prévia"><button class="is-active" type="button" data-hero-mode="mobile">Mobile</button><button type="button" data-hero-mode="desktop">Desktop</button></div>
    <div class="hero-transform-stage is-mobile" data-hero-transform-stage><div class="hero-transform-bg"></div><img class="hero-transform-art" alt="Prévia do herói"><span>ARRASTE PARA POSICIONAR</span></div>
    <label class="hero-zoom-control"><span><b>Zoom</b><output data-hero-zoom-output>88%</output></span><input type="range" min="50" max="130" step="1" value="88" data-hero-zoom></label>
    <div class="hero-transform-coordinates"><span>Horizontal <b data-hero-x>50%</b></span><span>Vertical <b data-hero-y>52%</b></span></div>
  </div>`;
}

function groupFields(fields) {
  return fields.reduce((groups, field) => {
    (groups[field.group] ||= []).push(field);
    return groups;
  }, {});
}

function datetimeLocalValue(value = '') {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function renderAnnouncementVariantField(field) {
  const value = String(state.content[field.key] ?? field.default ?? 'maintenance');
  const options = [
    { value: 'maintenance', title: 'Manutenção', copy: 'Aviso operacional em âmbar e vermelho.' },
    { value: 'attention', title: 'Atenção', copy: 'Informação importante em azul e ciano.' },
    { value: 'promotion', title: 'Promoção', copy: 'Campanha ou destaque em roxo e magenta.' },
    { value: 'thanks', title: 'Agradecimento', copy: 'Mensagem positiva em verde e dourado.' }
  ];
  return `<div class="content-field announcement-variant-field" data-field-key="${escapeHtml(field.key)}">
    <div class="content-field-head"><label>Qual é a finalidade deste banner?</label></div>
    <div class="announcement-variant-grid" role="radiogroup" aria-label="Tipo de banner">
      ${options.map(option => `<label class="announcement-variant-option" data-variant="${option.value}"><input type="radio" name="announcement-variant" value="${option.value}" data-content-key="variant" data-content-kind="select" ${option.value === value ? 'checked' : ''}><i aria-hidden="true"></i><strong>${option.title}</strong><span>${option.copy}</span></label>`).join('')}
    </div>
  </div>`;
}

function renderAnnouncementAccessModeField(field) {
  const value = String(state.content[field.key] ?? field.default ?? 'banner_only');
  const options = [
    {
      value: 'banner_only',
      title: 'Somente banner',
      badge: 'Site online',
      copy: 'Mostra o comunicado no topo e mantém todas as páginas disponíveis aos visitantes.'
    },
    {
      value: 'maintenance_lock',
      title: 'Bloquear visitantes',
      badge: 'Admins entram',
      copy: 'No período programado, visitantes veem a tela de manutenção; administradores continuam com acesso.'
    }
  ];
  return `<div class="content-field announcement-access-field" data-field-key="${escapeHtml(field.key)}">
    <div class="content-field-head"><label>O que deve acontecer com o site?</label></div>
    <div class="announcement-access-grid" role="radiogroup" aria-label="Comportamento do site">
      ${options.map(option => `<label class="announcement-access-option" data-access-mode="${option.value}"><input type="radio" name="announcement-access-mode" value="${option.value}" data-content-key="access_mode" data-content-kind="select" ${option.value === value ? 'checked' : ''}><span><strong>${option.title}</strong><b>${option.badge}</b></span><small>${option.copy}</small></label>`).join('')}
    </div>
  </div>`;
}

function renderBasicField(field) {
  if (isAnnouncementPage() && field.key === 'variant') return renderAnnouncementVariantField(field);
  if (isAnnouncementPage() && field.key === 'access_mode') return renderAnnouncementAccessModeField(field);
  const value = state.content[field.key] ?? field.default ?? '';
  const isNumber = field.type === 'number';
  const isDatetime = field.type === 'datetime';
  const isSelect = field.type === 'select';
  const required = isAnnouncementPage() && state.content.access_mode === 'maintenance_lock' && field.key === 'ends_at';
  const constraints = isNumber
    ? `min="${field.min ?? ''}" max="${field.max ?? ''}" step="${field.step ?? 1}" inputmode="decimal"`
    : isDatetime || isSelect ? '' : `maxlength="${field.max || 500}"`;
  const common = `data-content-key="${escapeHtml(field.key)}" data-content-kind="${escapeHtml(field.type)}" ${constraints} ${required ? 'required aria-required="true"' : ''}`;
  const control = field.type === 'select'
    ? `<select class="admin-select" ${common}>${(field.options || []).map(option => `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select>`
    : field.type === 'textarea'
    ? `<textarea class="admin-textarea" ${common} rows="3" placeholder="${escapeHtml(field.placeholder ?? 'Vazio mantém o texto padrão')}">${escapeHtml(value)}</textarea>`
    : `<input class="admin-input" ${common} type="${field.type === 'url' ? 'url' : isNumber ? 'number' : isDatetime ? 'datetime-local' : 'text'}" value="${escapeHtml(isDatetime ? datetimeLocalValue(value) : value)}" placeholder="${escapeHtml(field.placeholder ?? (field.type === 'url' ? 'https://…' : 'Vazio mantém o conteúdo padrão'))}">`;
  return `<div class="content-field" data-field-key="${escapeHtml(field.key)}"><div class="content-field-head"><label>${escapeHtml(field.label)}${required ? ' *' : ''}</label><button class="field-reset" type="button" data-reset-key="${escapeHtml(field.key)}">Restaurar padrão</button></div>${control}${!isNumber && !isDatetime && field.max ? `<div class="field-counter"><span>${String(value).length}</span> / ${field.max}</div>` : ''}</div>`;
}

function renderHeroField(field) {
  const value = String(state.content[field.key] ?? '');
  const options = state.heroes.map(hero => `<option value="${escapeHtml(hero.id)}" ${String(hero.id) === value ? 'selected' : ''}>${escapeHtml(hero.name)}</option>`).join('');
  return `<div class="content-field" data-field-key="${escapeHtml(field.key)}"><div class="content-field-head"><label>${escapeHtml(field.label)}</label><button class="field-reset" type="button" data-reset-key="${escapeHtml(field.key)}">Usar primeiro da lista</button></div><select class="admin-select" data-content-key="${escapeHtml(field.key)}"><option value="">Primeiro herói ativo</option>${options}</select><div class="field-counter">A imagem e os dados vêm do Editor de Herói.</div></div>`;
}

function renderToggleField(field) {
  const maintenanceLock = isAnnouncementPage() && state.content.access_mode === 'maintenance_lock';
  const checked = maintenanceLock && field.key === 'dismissible'
    ? false
    : state.content[field.key] ?? field.default ?? true;
  if (isAnnouncementPage() && field.key === 'enabled') {
    const title = maintenanceLock ? 'Ativar a manutenção conforme o período' : 'Exibir este banner no site';
    const copy = checked
      ? maintenanceLock
        ? 'Ao salvar, o acesso dos visitantes será bloqueado somente dentro do período configurado.'
        : 'Ao salvar, o banner ficará disponível conforme o período configurado.'
      : maintenanceLock
        ? 'A programação será salva, mas não bloqueará nenhum visitante.'
        : 'O conteúdo será salvo, mas continuará invisível para os visitantes.';
    return `<div class="content-field" data-field-key="enabled"><label class="announcement-master-switch ${maintenanceLock ? 'is-maintenance-lock' : ''}"><span><strong>${title}</strong><span>${copy}</span></span><input type="checkbox" data-content-toggle="enabled" ${checked ? 'checked' : ''} aria-label="${escapeHtml(title)}"></label></div>`;
  }
  if (maintenanceLock && field.key === 'dismissible') {
    return `<div class="content-field" data-field-key="dismissible"><label class="toggle-field is-disabled"><span>O bloqueio de manutenção não pode ser fechado por visitantes</span><input type="checkbox" data-content-toggle="dismissible" disabled></label><div class="field-counter">Administradores continuam vendo o site com um alerta operacional fixo.</div></div>`;
  }
  const resetLabel = field.default === false ? 'Restaurar padrão desativado' : 'Restaurar padrão visível';
  return `<div class="content-field" data-field-key="${escapeHtml(field.key)}"><label class="toggle-field"><span>${escapeHtml(field.label)}</span><input type="checkbox" data-content-toggle="${escapeHtml(field.key)}" ${checked ? 'checked' : ''}></label><button class="field-reset" type="button" data-reset-key="${escapeHtml(field.key)}">${resetLabel}</button></div>`;
}

function renderImageField(field) {
  return `<div class="content-field image-field" data-field-key="${escapeHtml(field.key)}"><div class="content-field-head"><label>${escapeHtml(field.label)}</label><button class="field-reset" type="button" data-reset-key="${escapeHtml(field.key)}">Restaurar padrão</button></div><div data-image-editor="${escapeHtml(field.key)}"></div></div>`;
}

function fieldTab(field) {
  if (isAnnouncementPage()) return announcementFieldTabs[field.key] || 'announcement-message';
  if (field.tab && editorTabs.some(tab => tab.key === field.tab)) return field.tab;
  if (field.type === 'image' || compareTransformKeys.has(field.key)) return 'media';
  if (field.type === 'toggle' || field.group === 'Visibilidade') return 'visibility';
  if (['SEO', 'Cabeçalho', 'Filtros', 'Geral'].includes(field.group)) return 'information';
  return 'content';
}

function availableEditorTabs() {
  if (isAnnouncementPage()) return announcementTabs;
  const keys = new Set(state.page.fields.map(fieldTab));
  return editorTabs.filter(tab => tab.key === 'preview' || keys.has(tab.key));
}

function renderEditorTabs() {
  const tabs = availableEditorTabs();
  if (!tabs.some(tab => tab.key === state.activeTab)) state.activeTab = tabs[0]?.key || 'preview';
  elements.tabs.innerHTML = tabs.map(tab => {
    const complete = isAnnouncementPage() && announcementStepComplete(tab.key);
    return `<button type="button" class="content-editor-tab ${isAnnouncementPage() ? 'announcement-editor-tab' : ''} ${tab.key === state.activeTab ? 'is-active' : ''} ${complete ? 'is-complete' : ''}" data-editor-tab="${tab.key}">${tab.label}${tab.short ? `<small>${tab.short}</small>` : ''}</button>`;
  }).join('');
  elements.workspace.classList.toggle('preview-mode', state.activeTab === 'preview');
}

function renderFieldControl(field) {
  if (field.type === 'image') return renderImageField(field);
  if (field.type === 'toggle') return renderToggleField(field);
  if (field.type === 'hero') return renderHeroField(field);
  return renderBasicField(field);
}

function renderFields() {
  renderEditorTabs();
  if (state.activeTab === 'preview') {
    elements.fields.innerHTML = '';
    return;
  }

  const tabFields = state.page.fields.filter(field => fieldTab(field) === state.activeTab && !compareTransformKeys.has(field.key));
  if (isAnnouncementPage()) {
    const tab = announcementTabs.find(item => item.key === state.activeTab) || announcementTabs[0];
    const extras = renderAnnouncementExtras(state.activeTab);
    elements.fields.innerHTML = `<article class="content-section-card announcement-section-card"><header><div><small>Central de Avisos</small><h2>${escapeHtml(tab.label)}</h2><p>${escapeHtml(tab.description)}</p></div><span>${tabFields.length} ${tabFields.length === 1 ? 'controle' : 'controles'}</span></header><div class="content-section-body">${extras.before}${tabFields.map(renderFieldControl).join('')}${extras.after}</div></article>`;
    return;
  }
  const groups = groupFields(tabFields);
  const names = Object.keys(groups);
  const storedGroup = state.activeGroups[state.activeTab];
  const activeGroup = names.includes(storedGroup) ? storedGroup : names[0];
  state.activeGroups[state.activeTab] = activeGroup;
  const tab = editorTabs.find(item => item.key === state.activeTab);
  const groupNav = names.length > 1 ? `<nav class="content-subtabs" aria-label="Áreas de ${tab?.label || 'edição'}">${names.map(name => `<button type="button" class="${name === activeGroup ? 'is-active' : ''}" data-editor-group="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('')}</nav>` : '';
  const fields = groups[activeGroup] || [];
  const hasCompareHeroSource = state.page.fields.some(field => field.key === 'hero_art');
  const visualEditor = state.page.key === 'compare' && state.activeTab === 'media' && hasCompareHeroSource
    ? renderCompareHeroEditor()
    : '';
  elements.fields.innerHTML = `${groupNav}<article class="content-section-card"><header><div><small>${escapeHtml(tab?.label || '')}</small><h2>${escapeHtml(activeGroup || tab?.label || '')}</h2><p>${escapeHtml(tab?.description || '')}</p></div><span>${fields.length + (visualEditor ? 1 : 0)} ${fields.length + (visualEditor ? 1 : 0) === 1 ? 'controle' : 'controles'}</span></header><div class="content-section-body ${state.activeTab === 'media' ? 'is-media' : ''}">${fields.map(renderFieldControl).join('')}${visualEditor}</div></article>`;

  fields.filter(field => field.type === 'image').forEach(mountImageEditor);
  mountCompareHeroEditor();
}

function announcementStepComplete(key) {
  if (!isAnnouncementPage()) return false;
  if (key === 'announcement-type') {
    const variant = state.content.variant || 'maintenance';
    const accessMode = state.content.access_mode || 'banner_only';
    return ['maintenance', 'attention', 'promotion', 'thanks'].includes(variant)
      && ['banner_only', 'maintenance_lock'].includes(accessMode)
      && (accessMode !== 'maintenance_lock' || variant === 'maintenance');
  }
  if (key === 'announcement-message') {
    const hasMessage = Boolean(String(state.content.message || '').trim());
    const ctaLabel = Boolean(String(state.content.cta_label || '').trim());
    const ctaUrl = Boolean(String(state.content.cta_url || '').trim());
    return hasMessage && ctaLabel === ctaUrl;
  }
  if (key === 'announcement-schedule') {
    const startsAt = state.content.starts_at ? new Date(state.content.starts_at) : null;
    const endsAt = state.content.ends_at ? new Date(state.content.ends_at) : null;
    return (!startsAt || !Number.isNaN(startsAt.getTime()))
      && (!endsAt || !Number.isNaN(endsAt.getTime()))
      && (!startsAt || !endsAt || startsAt < endsAt);
  }
  return key === 'announcement-publish' && typeof state.content.enabled === 'boolean';
}

function maintenanceExplanation() {
  const snapshot = getAnnouncementSnapshot();
  const maintenanceMode = snapshot?.maintenanceMode === true;
  const manualMode = snapshot?.manualMaintenanceMode === true;
  const draftLocksSite = state.content.access_mode === 'maintenance_lock';
  const title = manualMode
    ? 'Bloqueio emergencial ativo agora'
    : draftLocksSite
      ? 'Manutenção completa selecionada'
      : maintenanceMode
        ? 'Há uma manutenção programada em andamento'
        : 'Somente comunicação: o site continuará online';
  const copy = manualMode
    ? 'O interruptor emergencial das Configurações Gerais está ligado. Ele permanece independente deste agendamento até ser desligado manualmente.'
    : draftLocksSite
      ? 'Dentro do período definido, visitantes verão a tela de manutenção. Administradores autenticados continuam acessando o site e o painel.'
      : maintenanceMode
        ? 'O bloqueio salvo já está dentro do período ativo. Alterações neste rascunho só entram em vigor depois de salvar.'
        : 'Este modo mostra apenas a faixa no topo. Para tirar o site do ar no horário programado, selecione “Bloquear visitantes”.';
  return `<div class="announcement-maintenance-note ${maintenanceMode || draftLocksSite ? 'is-critical' : ''}"><b aria-hidden="true">!</b><div><strong>${title}</strong><p>${copy}</p><a href="./site-texts.html#access-settings">Abrir controle emergencial imediato →</a></div></div>`;
}

function renderAnnouncementExtras(tabKey) {
  if (tabKey === 'announcement-type') {
    return { before: maintenanceExplanation(), after: '' };
  }
  if (tabKey === 'announcement-schedule') {
    const maintenanceLock = state.content.access_mode === 'maintenance_lock';
    return {
      before: `<p class="announcement-timezone-note">Os horários usam o fuso local deste dispositivo. ${maintenanceLock ? 'O início vazio significa ativação imediata; o encerramento é obrigatório para garantir a reabertura automática.' : 'Campos vazios significam início imediato ou banner sem encerramento automático.'}</p>`,
      after: `<div class="announcement-schedule-tools" aria-label="Atalhos de agendamento"><button type="button" data-announcement-schedule="start-now">Iniciar agora</button><button type="button" data-announcement-schedule="clear-start">Sem início programado</button><button type="button" data-announcement-schedule="end-1h">Encerrar em 1 hora</button><button type="button" data-announcement-schedule="end-24h">Encerrar em 24 horas</button>${maintenanceLock ? '' : '<button type="button" data-announcement-schedule="clear-end">Sem encerramento</button>'}</div>`
    };
  }
  if (tabKey === 'announcement-publish') {
    const draft = evaluateAnnouncementState({ published: true, content: state.content });
    const manualMode = getAnnouncementSnapshot()?.manualMaintenanceMode === true;
    const summary = announcementStateCopy(draft);
    return {
      before: maintenanceExplanation(),
      after: `<div class="announcement-final-summary ${draft.accessMode === 'maintenance_lock' ? 'is-maintenance-lock' : ''}"><strong>Resultado ao salvar: ${escapeHtml(summary.title)}</strong><p>${escapeHtml(summary.detail)}${manualMode ? ' O bloqueio emergencial já está ativo e continua sendo controlado separadamente.' : ''}</p></div>`
    };
  }
  return { before: '', after: '' };
}

function announcementStateCopy(value) {
  const type = announcementVariantLabel(value.variant);
  const maintenanceLock = value.accessMode === 'maintenance_lock';
  if (value.state === 'active') {
    return {
      title: maintenanceLock ? 'Manutenção em andamento' : value.variant === 'maintenance' ? 'Aviso de manutenção em andamento' : 'Banner em andamento',
      detail: maintenanceLock
        ? `Visitantes serão bloqueados até ${formatAnnouncementDate(value.endsAt)}; administradores preservam o acesso.`
        : `${type} visível agora${value.endsAt ? ` até ${formatAnnouncementDate(value.endsAt)}` : ', sem encerramento automático'}.`
    };
  }
  if (value.state === 'scheduled') return maintenanceLock
    ? { title: 'Manutenção programada', detail: `O bloqueio dos visitantes começa em ${formatAnnouncementDate(value.startsAt)} e termina automaticamente em ${formatAnnouncementDate(value.endsAt)}.` }
    : { title: 'Banner agendado', detail: `${type} será exibido a partir de ${formatAnnouncementDate(value.startsAt)}.` };
  if (value.state === 'expired') return { title: maintenanceLock ? 'Manutenção encerrada' : 'Período encerrado', detail: maintenanceLock ? 'O período terminou e o site está novamente liberado para visitantes.' : 'O banner está habilitado, mas a data final já passou e ele não aparece no site.' };
  if (value.state === 'incomplete') return { title: 'Configuração incompleta', detail: maintenanceLock ? 'Informe a mensagem e um horário de encerramento válido antes de bloquear o site.' : 'O banner está habilitado, mas ainda precisa de uma mensagem principal.' };
  if (value.state === 'missing') return { title: 'Nenhum aviso salvo', detail: 'Ainda não existe uma configuração salva para esta área.' };
  return { title: maintenanceLock ? 'Manutenção desativada' : 'Banner desativado', detail: 'A configuração fica salva, mas não altera o que os visitantes encontram.' };
}

function ensureAnnouncementConsole() {
  let consoleElement = document.getElementById('announcement-command-center');
  if (consoleElement) return consoleElement;
  consoleElement = document.createElement('section');
  consoleElement.id = 'announcement-command-center';
  consoleElement.className = 'announcement-command-center';
  consoleElement.setAttribute('aria-live', 'polite');
  consoleElement.innerHTML = `<div class="announcement-command-main"><i class="announcement-command-dot" aria-hidden="true"></i><div class="announcement-command-copy"><small>Rascunho neste editor</small><strong data-announcement-draft-title>Carregando</strong><span data-announcement-draft-detail>Verificando configuração…</span></div></div><div class="announcement-command-cell"><small>No site agora</small><strong data-announcement-live-title>Verificando</strong><span data-announcement-live-detail>Consultando o estado salvo.</span></div><div class="announcement-command-cell"><small>Acesso dos visitantes</small><strong data-announcement-maintenance-title>Verificando</strong><span data-announcement-maintenance-detail>Consultando manutenção.</span></div>`;
  document.querySelector('.cms-editor-toolbar')?.insertAdjacentElement('afterend', consoleElement);
  return consoleElement;
}

function updateAnnouncementConsole() {
  const consoleElement = document.getElementById('announcement-command-center');
  if (!isAnnouncementPage() || !consoleElement) return;
  const draft = evaluateAnnouncementState({ published: true, content: state.content });
  const draftCopy = announcementStateCopy(draft);
  const current = getAnnouncementSnapshot();
  const liveCopy = current?.banner ? announcementStateCopy(current.banner) : { title: 'Estado indisponível', detail: 'Não foi possível confirmar o banner salvo.' };
  const dirtySuffix = isDirty() ? ' · alterações ainda não salvas' : ' · igual ao conteúdo salvo';
  consoleElement.dataset.draftState = draft.state;
  consoleElement.querySelector('[data-announcement-draft-title]').textContent = draftCopy.title;
  consoleElement.querySelector('[data-announcement-draft-detail]').textContent = `${draftCopy.detail}${dirtySuffix}`;
  consoleElement.querySelector('[data-announcement-live-title]').textContent = liveCopy.title;
  consoleElement.querySelector('[data-announcement-live-detail]').textContent = liveCopy.detail;
  const maintenance = current?.maintenanceMode === true;
  const manualMode = current?.manualMaintenanceMode === true;
  consoleElement.querySelector('[data-announcement-maintenance-title]').textContent = maintenance ? 'Visitantes bloqueados' : 'Site online';
  consoleElement.querySelector('[data-announcement-maintenance-detail]').textContent = maintenance
    ? manualMode
      ? 'Bloqueio emergencial ativo; administradores preservam o acesso.'
      : 'Manutenção programada dentro do período ativo; administradores preservam o acesso.'
    : 'Nenhum bloqueio ativo neste momento.';
  elements.openPage.textContent = draft.accessMode === 'maintenance_lock' ? 'Testar acesso de admin ↗' : 'Ver banner no site ↗';
  if (!state.saving) elements.save.textContent = announcementSaveLabel(draft);
}

function announcementSaveLabel(draft = evaluateAnnouncementState({ published: true, content: state.content })) {
  if (state.content.enabled !== true) return 'Salvar como desativado';
  if (draft.accessMode !== 'maintenance_lock') return 'Salvar e ativar banner';
  if (draft.state === 'scheduled') return 'Programar manutenção';
  if (draft.state === 'active') return 'Ativar manutenção agora';
  return 'Salvar manutenção';
}

function configureAnnouncementMode() {
  const active = isAnnouncementPage();
  document.body.classList.toggle('is-announcement-editor', active);
  const bridge = document.querySelector('.cms-public-bridge');
  if (bridge) bridge.hidden = active;
  let back = document.getElementById('announcement-back-link');
  if (active && !back) {
    back = document.createElement('a');
    back.id = 'announcement-back-link';
    back.className = 'announcement-back-link';
    back.href = './site-content.html';
    back.textContent = '← Textos e imagens';
    document.querySelector('.cms-editor-actions')?.prepend(back);
  }
  if (back) back.hidden = !active;
  if (active) {
    ensureAnnouncementConsole().hidden = false;
    elements.openPage.textContent = 'Ver banner no site ↗';
    elements.reload.textContent = 'Descartar rascunho';
  } else {
    const consoleElement = document.getElementById('announcement-command-center');
    if (consoleElement) consoleElement.hidden = true;
    elements.openPage.textContent = 'Abrir página ↗';
    elements.reload.textContent = 'Descartar';
    elements.save.textContent = 'Publicar alterações';
  }
}

function applyAnnouncementSchedule(action) {
  const now = new Date();
  if (action === 'start-now') setValue('starts_at', now.toISOString());
  if (action === 'clear-start') setValue('starts_at', null);
  if (action === 'end-1h') setValue('ends_at', new Date(now.getTime() + 60 * 60 * 1000).toISOString());
  if (action === 'end-24h') setValue('ends_at', new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString());
  if (action === 'clear-end') setValue('ends_at', null);
  renderFields();
}

function mediaUrl(key, fallback = '') {
  const value = state.content[key];
  return String(typeof value === 'string' ? value : value?.url || fallback);
}

function syncCompareHeroEditor() {
  const stage = elements.fields.querySelector('[data-hero-transform-stage]');
  if (!stage) return;
  const mode = stage.dataset.mode || 'mobile';
  const x = Number(state.content.hero_art_x ?? 50);
  const y = Number(state.content.hero_art_y ?? 52);
  const scaleKey = mode === 'mobile' ? 'hero_art_scale_mobile' : 'hero_art_scale';
  const scale = Number(state.content[scaleKey] ?? (mode === 'mobile' ? 88 : 100));
  const art = stage.querySelector('.hero-transform-art');
  const bg = stage.querySelector('.hero-transform-bg');
  art.src = mediaUrl('hero_art', '../assets/echo-arena-hero.png?v=2');
  art.style.left = `${x}%`;
  art.style.top = `${y}%`;
  art.style.transform = `translate(-50%,-50%) scale(${scale / 100})`;
  const background = mediaUrl('mine_card_background');
  bg.style.backgroundImage = background ? `linear-gradient(115deg,rgba(5,7,14,.58),rgba(7,8,17,.18)),url("${background.replaceAll('"', '%22')}")` : '';
  const slider = elements.fields.querySelector('[data-hero-zoom]');
  slider.min = '50'; slider.max = mode === 'mobile' ? '130' : '140'; slider.value = String(scale);
  elements.fields.querySelector('[data-hero-zoom-output]').textContent = `${scale}%`;
  elements.fields.querySelector('[data-hero-x]').textContent = `${Math.round(x)}%`;
  elements.fields.querySelector('[data-hero-y]').textContent = `${Math.round(y)}%`;
}

function mountCompareHeroEditor() {
  const stage = elements.fields.querySelector('[data-hero-transform-stage]');
  if (!stage) return;
  stage.dataset.mode = 'mobile';
  let drag = null;
  const move = event => {
    if (!drag) return;
    const rect = stage.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, drag.x + ((event.clientX - drag.clientX) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, drag.y + ((event.clientY - drag.clientY) / rect.height) * 100));
    setValue('hero_art_x', Math.round(x));
    setValue('hero_art_y', Math.round(y));
  };
  stage.addEventListener('pointerdown', event => {
    drag = { clientX: event.clientX, clientY: event.clientY, x: Number(state.content.hero_art_x ?? 50), y: Number(state.content.hero_art_y ?? 52) };
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointermove', move);
  stage.addEventListener('pointerup', () => { drag = null; });
  stage.addEventListener('pointercancel', () => { drag = null; });
  elements.fields.querySelectorAll('[data-hero-mode]').forEach(button => button.addEventListener('click', () => {
    stage.dataset.mode = button.dataset.heroMode;
    stage.classList.toggle('is-mobile', button.dataset.heroMode === 'mobile');
    elements.fields.querySelectorAll('[data-hero-mode]').forEach(item => item.classList.toggle('is-active', item === button));
    syncCompareHeroEditor();
  }));
  elements.fields.querySelector('[data-hero-zoom]').addEventListener('input', event => {
    setValue(stage.dataset.mode === 'mobile' ? 'hero_art_scale_mobile' : 'hero_art_scale', Number(event.target.value));
  });
  elements.fields.querySelector('[data-reset-hero-transform]').addEventListener('click', () => {
    ['hero_art_scale', 'hero_art_scale_mobile', 'hero_art_x', 'hero_art_y'].forEach(key => delete state.content[key]);
    updateDirty(); applyDraftToPreview(); syncCompareHeroEditor();
  });
  syncCompareHeroEditor();
}

function getImage(key) {
  const value = state.content[key];
  const defaults = { url: '', alt: '', position: '50% 50%', fit: 'cover', zoom: 100 };
  if (typeof value === 'string') return { ...defaults, url: value };
  return value && typeof value === 'object' ? { ...defaults, ...value } : defaults;
}

function imageCoordinates(image) {
  const values = String(image.position || '50% 50%').match(/-?\d+(?:\.\d+)?/g) || [];
  return { x: Math.max(0, Math.min(100, Number(values[0] ?? 50))), y: Math.max(0, Math.min(100, Number(values[1] ?? 50))) };
}

function updateImagePreview(editor, image) {
  const preview = editor.querySelector('.image-preview');
  const tag = preview.querySelector('img');
  const { x, y } = imageCoordinates(image);
  const zoom = Math.max(50, Math.min(200, Number(image.zoom ?? 100)));
  tag.src = image.url || '';
  tag.alt = image.alt || '';
  tag.style.objectFit = image.fit || 'cover';
  tag.style.transform = `translate(${-50 + (x - 50)}%, ${-50 + (y - 50)}%) scale(${zoom / 100})`;
  editor.querySelector('.image-position').value = `${Math.round(x)}% ${Math.round(y)}%`;
  editor.querySelector('.image-position-value').textContent = `X ${Math.round(x)}% · Y ${Math.round(y)}%`;
  editor.querySelector('.image-zoom').value = String(zoom);
  editor.querySelector('.image-zoom-value').textContent = `${Math.round(zoom)}%`;
  preview.classList.toggle('has-image', Boolean(image.url));
}

function mountImageEditor(field) {
  const host = elements.fields.querySelector(`[data-image-editor="${CSS.escape(field.key)}"]`);
  const fragment = elements.imageTemplate.content.cloneNode(true);
  host.appendChild(fragment);
  const image = getImage(field.key);
  const editor = host.querySelector('.image-editor');
  if (state.page.key === 'compare' && field.key === 'hero_art') editor.classList.add('is-source-only');
  editor.querySelector('.image-url').value = image.url || '';
  editor.querySelector('.image-alt').value = image.alt || '';
  editor.querySelector('.image-position').value = image.position || '50% 50%';
  editor.querySelector('.image-fit').value = image.fit || 'cover';
  editor.querySelector('.image-zoom').value = String(image.zoom ?? 100);
  updateImagePreview(editor, image);

  const collectImage = () => {
    const url = editor.querySelector('.image-url').value.trim();
    if (!url) return setValue(field.key, null);
    const next = {
      ...getImage(field.key),
      url,
      alt: editor.querySelector('.image-alt').value.trim(),
      position: editor.querySelector('.image-position').value,
      fit: editor.querySelector('.image-fit').value,
      zoom: Number(editor.querySelector('.image-zoom').value)
    };
    setValue(field.key, next);
    updateImagePreview(editor, next);
  };

  editor.querySelectorAll('.image-url,.image-alt,.image-position,.image-fit,.image-zoom').forEach(control => {
    control.addEventListener('input', collectImage);
    control.addEventListener('change', collectImage);
  });
  editor.querySelector('.remove-image').addEventListener('click', () => {
    setValue(field.key, null);
    editor.querySelector('.image-url').value = '';
    editor.querySelector('.image-alt').value = '';
    editor.querySelector('.image-position').value = '50% 50%';
    editor.querySelector('.image-zoom').value = '100';
    updateImagePreview(editor, getImage(field.key));
  });
  editor.querySelector('.center-image').addEventListener('click', () => {
    editor.querySelector('.image-position').value = '50% 50%';
    collectImage();
  });
  const preview = editor.querySelector('.image-preview');
  let drag = null;
  preview.addEventListener('pointerdown', event => {
    if (!getImage(field.key).url) return;
    const point = imageCoordinates(getImage(field.key));
    drag = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: point.x, y: point.y };
    preview.setPointerCapture(event.pointerId);
    preview.classList.add('is-dragging');
  });
  preview.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const x = Math.max(0, Math.min(100, drag.x + ((event.clientX - drag.clientX) / (preview.clientWidth || 1)) * 100));
    const y = Math.max(0, Math.min(100, drag.y + ((event.clientY - drag.clientY) / (preview.clientHeight || 1)) * 100));
    editor.querySelector('.image-position').value = `${Math.round(x)}% ${Math.round(y)}%`;
    collectImage();
  });
  const stopDrag = event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    preview.classList.remove('is-dragging');
    if (preview.hasPointerCapture(event.pointerId)) preview.releasePointerCapture(event.pointerId);
  };
  preview.addEventListener('pointerup', stopDrag);
  preview.addEventListener('pointercancel', stopDrag);
  editor.querySelector('input[type="file"]').addEventListener('change', event => uploadImage(field, editor, event.target.files?.[0]));
}

async function uploadImage(field, editor, file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) return setMessage('Escolha um arquivo de imagem válido.', 'error');
  if (file.size > 8 * 1024 * 1024) return setMessage('A imagem deve ter no máximo 8 MB.', 'error');
  const progress = editor.querySelector('.upload-progress');
  progress.hidden = false;
  state.uploading += 1;
  elements.save.disabled = true;
  try {
    const safeKey = field.key.replace(/[^a-z0-9_-]/gi, '-');
    const url = await uploadMedia(file, `site-content/${state.page.key}/${safeKey}`);
    const next = { url, path: url, alt: editor.querySelector('.image-alt').value.trim(), position: editor.querySelector('.image-position').value, fit: editor.querySelector('.image-fit').value, zoom: Number(editor.querySelector('.image-zoom').value) };
    editor.querySelector('.image-url').value = next.url;
    setValue(field.key, next);
    updateImagePreview(editor, next);
    setMessage('Imagem enviada. Clique em Publicar alterações para colocá-la no site.', 'ok');
  } catch (error) {
    console.error('[site-content upload]', error);
    setMessage(error.message || 'Não foi possível enviar a imagem.', 'error');
  } finally {
    progress.hidden = true;
    state.uploading -= 1;
    elements.save.disabled = state.uploading > 0;
  }
}

function updatePageHeader() {
  elements.pageName.textContent = state.page.label;
  elements.pageDescription.textContent = state.page.description;
  elements.openPage.href = state.page.url;
  elements.preview.src = `${state.page.url}${state.page.url.includes('?') ? '&' : '?'}cms=${Date.now()}`;
}

function applyDraftToPreview() {
  const win = elements.preview.contentWindow;
  if (!win?.EchoSiteContent?.apply) return;
  win.EchoSiteContent.apply(state.content);
}

function isMissingTable(error) {
  return error?.code === '42P01' || /site_pages|schema cache|does not exist/i.test(error?.message || '');
}

async function loadPage(pageKey, { force = false } = {}) {
  if (!force && isDirty()) {
    const discard = await showAdminDecisionModal({
      kicker: 'ALTERAÇÕES NÃO PUBLICADAS',
      title: 'Descartar as alterações desta página?',
      message: 'Você modificou o conteúdo, mas ainda não publicou. Trocar de página agora remove somente esse rascunho local.',
      detail: `Página atual: ${state.page.label}. Nenhum conteúdo já publicado no banco será apagado.`,
      confirmLabel: 'Descartar e trocar',
      cancelLabel: 'Continuar editando'
    });
    if (!discard) {
      elements.pageSelect.value = state.page.key;
      return;
    }
  }
  state.page = getContentPage(pageKey);
  state.activeTab = state.page.key === 'global_announcement' ? 'announcement-type' : 'information';
  state.activeGroups = {};
  elements.fields.innerHTML = '<div class="content-loading">Carregando conteúdo…</div>';
  setMessage('Carregando…');
  configureAnnouncementMode();
  updatePageHeader();
  try {
    if (state.page.key === 'home' && !state.heroes.length) {
      const heroesResult = await supabase.from('heroes').select('id,name').eq('enabled', true).order('display_order', { ascending: true, nullsFirst: false }).order('name');
      if (!heroesResult.error) state.heroes = heroesResult.data || [];
    }
    const { data, error } = await supabase.from('site_pages').select('*').eq('page_key', state.page.key).maybeSingle();
    if (error) throw error;
    state.row = data;
    state.content = structuredClone(data?.content || {});
    state.original = structuredClone(state.content);
    state.originalPublished = data?.published !== false;
    state.published = state.page.key === 'global_announcement' ? true : state.originalPublished;
    elements.published.checked = state.published;
    elements.warning.hidden = true;
    renderFields();
    updateDirty();
    setMessage(data ? (isAnnouncementPage() ? 'Central sincronizada com o estado salvo no site.' : 'Conteúdo sincronizado.') : 'Página pronta para receber conteúdo.');
    updateAnnouncementConsole();
  } catch (error) {
    console.error('[site-content load]', error);
    state.row = null; state.content = {}; state.original = {}; state.published = true; state.originalPublished = true;
    elements.published.checked = true;
    renderFields();
    elements.warning.hidden = !isMissingTable(error);
    setMessage(error.message || 'Não foi possível carregar o conteúdo.', 'error');
    updateAnnouncementConsole();
  }
}

async function savePage() {
  if (state.saving || state.uploading) return;
  state.saving = true;
  elements.save.disabled = true;
  const savingMaintenance = isAnnouncementPage() && state.content.access_mode === 'maintenance_lock';
  elements.save.textContent = isAnnouncementPage() ? savingMaintenance ? 'Salvando manutenção…' : 'Salvando banner…' : 'Publicando…';
  setMessage('Salvando conteúdo…');
  try {
    for (const field of state.page.fields.filter(item => item.type === 'url')) {
      const value = String(state.content[field.key] || '').trim();
      if (value && !/^(https?:\/\/|mailto:|\/|\.\/|\.\.\/|#)/i.test(value)) {
        throw new Error(`O campo “${field.label}” precisa usar https:// ou um link interno válido.`);
      }
    }
    for (const field of state.page.fields.filter(item => item.type === 'image')) {
      const value = state.content[field.key];
      const url = String(typeof value === 'string' ? value : value?.url || '').trim();
      if (url && !/^(https?:\/\/|\/|\.\/|\.\.\/)/i.test(url)) {
        throw new Error(`A imagem “${field.label}” precisa usar https:// ou um caminho interno válido.`);
      }
    }
    if (state.page.key === 'global_announcement') {
      state.content.access_mode ||= 'banner_only';
      if (state.content.access_mode === 'maintenance_lock') state.content.dismissible = false;
    }
    if (state.page.key === 'global_announcement' && state.content.enabled === true) {
      const message = String(state.content.message || '').trim();
      const variants = new Set(['maintenance', 'attention', 'promotion', 'thanks']);
      const variant = String(state.content.variant || 'maintenance');
      const accessModes = new Set(['banner_only', 'maintenance_lock']);
      const accessMode = String(state.content.access_mode || 'banner_only');
      if (!message) throw new Error('Informe a mensagem principal antes de ativar o aviso.');
      if (!variants.has(variant)) throw new Error('Escolha um tipo de aviso válido.');
      if (!accessModes.has(accessMode)) throw new Error('Escolha se o site continuará online ou bloqueará visitantes.');
      if (accessMode === 'maintenance_lock' && variant !== 'maintenance') {
        throw new Error('O bloqueio de visitantes só pode ser usado com o tipo Manutenção.');
      }
      const startsAt = state.content.starts_at ? new Date(state.content.starts_at) : null;
      const endsAt = state.content.ends_at ? new Date(state.content.ends_at) : null;
      if (startsAt && Number.isNaN(startsAt.getTime())) throw new Error('O início programado não é uma data válida.');
      if (endsAt && Number.isNaN(endsAt.getTime())) throw new Error('O encerramento programado não é uma data válida.');
      if (startsAt && endsAt && startsAt >= endsAt) throw new Error('O encerramento precisa acontecer depois do início.');
      if (accessMode === 'maintenance_lock' && !endsAt) {
        throw new Error('Defina o encerramento da manutenção para garantir a reabertura automática do site.');
      }
      if (accessMode === 'maintenance_lock' && endsAt <= new Date()) {
        throw new Error('O encerramento da manutenção precisa estar no futuro.');
      }
      const ctaLabel = String(state.content.cta_label || '').trim();
      const ctaUrl = String(state.content.cta_url || '').trim();
      if (Boolean(ctaLabel) !== Boolean(ctaUrl)) throw new Error('Preencha o texto e o destino do botão, ou deixe os dois vazios.');
      if (accessMode === 'maintenance_lock') {
        const scheduled = startsAt && startsAt > new Date();
        const confirmed = await showAdminDecisionModal({
          kicker: scheduled ? 'MANUTENÇÃO PROGRAMADA' : 'BLOQUEIO IMEDIATO',
          title: scheduled ? 'Programar o bloqueio dos visitantes?' : 'Bloquear os visitantes agora?',
          message: 'Durante esse período, visitantes verão somente a tela de manutenção. Administradores autenticados continuam acessando o site e o painel.',
          detail: `${scheduled ? `Início: ${formatAnnouncementDate(startsAt)}. ` : 'Início imediato. '}Reabertura automática: ${formatAnnouncementDate(endsAt)}.`,
          confirmLabel: scheduled ? 'Programar manutenção' : 'Ativar manutenção',
          cancelLabel: 'Revisar configuração'
        });
        if (!confirmed) {
          setMessage('Publicação cancelada. Revise os horários antes de tentar novamente.');
          return;
        }
      }
    }
    const { data: { user } } = await supabase.auth.getUser();
    const payload = { page_key: state.page.key, content: state.content, published: state.published, updated_at: new Date().toISOString(), updated_by: user?.id || null };
    const { data, error } = await supabase.from('site_pages').upsert(payload, { onConflict: 'page_key' }).select('*').single();
    if (error) throw error;
    state.row = data; state.original = structuredClone(state.content); state.originalPublished = state.published;
    updateDirty(); elements.warning.hidden = true;
    const savedState = isAnnouncementPage() ? evaluateAnnouncementState({ published: true, content: state.content }) : null;
    setMessage(isAnnouncementPage()
      ? savedState.accessMode === 'maintenance_lock'
        ? savedState.state === 'scheduled'
          ? 'Manutenção programada. O site será bloqueado e reaberto automaticamente nos horários definidos.'
          : savedState.state === 'active'
            ? 'Manutenção ativa. Visitantes estão bloqueados e administradores continuam com acesso.'
            : 'Configuração de manutenção salva, mas o bloqueio permanece desativado.'
        : 'Banner salvo e estado público sincronizado.'
      : 'Alterações publicadas com sucesso.', 'ok');
    elements.preview.src = `${state.page.url}?cms=${Date.now()}`;
    if (isAnnouncementPage()) window.dispatchEvent(new CustomEvent('echo:announcement-saved'));
  } catch (error) {
    console.error('[site-content save]', error);
    elements.warning.hidden = !isMissingTable(error);
    setMessage(error.message || 'Não foi possível publicar.', 'error');
  } finally {
    state.saving = false; elements.save.disabled = false;
    elements.save.textContent = isAnnouncementPage() ? announcementSaveLabel() : 'Publicar alterações';
    updateAnnouncementConsole();
  }
}

elements.pageSelect.innerHTML = SITE_CONTENT_PAGES.map(page => `<option value="${escapeHtml(page.key)}">${escapeHtml(page.label)}</option>`).join('');
elements.pageSelect.addEventListener('change', () => loadPage(elements.pageSelect.value));
elements.tabs.addEventListener('click', event => {
  const tab = event.target.closest('[data-editor-tab]');
  if (!tab) return;
  state.activeTab = tab.dataset.editorTab;
  renderFields();
  if (state.activeTab === 'preview') elements.preview.focus();
});
elements.published.addEventListener('change', () => { state.published = elements.published.checked; updateDirty(); });
function contentControlValue(control) {
  const value = control.value.trim();
  if (control.dataset.contentKind !== 'datetime' || !value) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}
elements.fields.addEventListener('input', event => {
  const control = event.target.closest('[data-content-key]');
  if (!control) return;
  setValue(control.dataset.contentKey, contentControlValue(control));
  const counter = control.closest('.content-field')?.querySelector('.field-counter span');
  if (counter) counter.textContent = control.value.length;
});
elements.fields.addEventListener('change', event => {
  const toggle = event.target.closest('[data-content-toggle]');
  if (toggle) {
    setValue(toggle.dataset.contentToggle, toggle.checked);
    if (isAnnouncementPage() && toggle.dataset.contentToggle === 'enabled') renderFields();
  }
  const control = event.target.closest('[data-content-key]');
  if (control) {
    setValue(control.dataset.contentKey, contentControlValue(control));
    if (isAnnouncementPage() && ['variant', 'access_mode'].includes(control.dataset.contentKey)) renderFields();
  }
});
elements.fields.addEventListener('click', event => {
  const schedule = event.target.closest('[data-announcement-schedule]');
  if (schedule) { applyAnnouncementSchedule(schedule.dataset.announcementSchedule); return; }
  const group = event.target.closest('[data-editor-group]');
  if (group) { state.activeGroups[state.activeTab] = group.dataset.editorGroup; renderFields(); return; }
  const reset = event.target.closest('[data-reset-key]');
  if (reset) { delete state.content[reset.dataset.resetKey]; renderFields(); updateDirty(); elements.preview.src = `${state.page.url}?cms=${Date.now()}`; }
});
elements.save.addEventListener('click', savePage);
elements.reload.addEventListener('click', () => loadPage(state.page.key, { force: true }));
elements.refresh.addEventListener('click', () => { elements.preview.src = `${state.page.url}?cms=${Date.now()}`; });
elements.preview.addEventListener('load', () => setTimeout(applyDraftToPreview, 400));
window.addEventListener('beforeunload', event => { if (isDirty()) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('echo:announcement-status', updateAnnouncementConsole);

await loadPage(state.page.key, { force: true });
