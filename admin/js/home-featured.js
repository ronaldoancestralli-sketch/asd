import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';
import {
  addHomeFeaturedQueueHero,
  buildHomeFeaturedAutomationRpcArgs,
  buildHomeFeaturedPlanRpcArgs,
  createHomeFeaturedDraft,
  homeFeaturedAccess,
  homeFeaturedPlanChanged,
  homeFeaturedWeekdayLabel,
  moveHomeFeaturedQueue,
  normalizeHomeFeaturedSnapshot,
  removeHomeFeaturedQueueHero,
  validateHomeFeaturedPlan
} from './home-featured-rotation-model.mjs?v=20260906-home-featured-phase-f-1';

const element = id => document.getElementById(id);
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[character]));

const state = {
  snapshot: null,
  draft: null,
  selectedHeroId: '',
  media: new Map(),
  busy: false,
  reviewOpen: false,
  automationReviewOpen: false
};

function setMessage(message = '', type = '') {
  const target = element('hf-message');
  if (!target) return;
  target.textContent = message;
  target.className = `hf-message${type ? ` is-${type}` : ''}`;
}

function safeColor(value) {
  return /^#[0-9a-f]{3,8}$/i.test(String(value || '')) ? value : '#956cff';
}

function mediaFor(heroId) {
  return state.media.get(String(heroId)) || {};
}

function heroById(heroId) {
  return state.snapshot?.heroes.find(hero => hero.id === heroId) || null;
}

function formatDate(value) {
  if (!value) return 'sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'data indisponível';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short', timeStyle: 'short', timeZone: state.snapshot?.config.timezoneName || 'America/Sao_Paulo'
  }).format(date);
}

function eventLabel(eventType) {
  return ({
    seed: 'Destaque inicial definido',
    schedule_changed: 'Planejamento atualizado',
    manual_override: 'Destaque manual alterado',
    automatic_period: 'Período automático resolvido',
    paused: 'Automação pausada',
    resumed: 'Automação retomada'
  })[eventType] || 'Evento editorial';
}

async function loadOptionalMedia() {
  const { data, error } = await supabase
    .from('v_heroes_complete')
    .select('id,class_name,class_color,card_source,main_source,enabled')
    .eq('enabled', true);
  if (error) {
    console.warn('[home-featured] mídia complementar indisponível:', error.message);
    return new Map();
  }
  return new Map((data || []).map(item => [String(item.id), item]));
}

function populateTimezones() {
  const datalist = element('hf-timezones');
  if (!datalist || datalist.dataset.ready === 'true') return;
  let zones = ['America/Sao_Paulo', 'UTC'];
  try {
    if (typeof Intl.supportedValuesOf === 'function') zones = Intl.supportedValuesOf('timeZone');
  } catch (error) {
    console.warn('[home-featured] lista de fusos indisponível:', error.message);
  }
  if (!zones.includes('America/Sao_Paulo')) zones.unshift('America/Sao_Paulo');
  datalist.innerHTML = [...new Set(zones)].map(zone => `<option value="${escapeHtml(zone)}"></option>`).join('');
  datalist.dataset.ready = 'true';
}

function syncMetrics() {
  const config = state.snapshot.config;
  element('hf-current-hero').textContent = config.currentHeroName;
  element('hf-current-slug').textContent = config.currentHeroSlug ? `/${config.currentHeroSlug}` : 'Sem identificador público';
  element('hf-current-mode').textContent = config.mode === 'manual' ? 'Manual' : 'Automático';
  element('hf-current-revision').textContent = `R${config.revision}`;
  element('hf-automation-state').textContent = config.automationEnabled ? 'Ativa' : 'Desligada';
  element('hf-automation-next').textContent = config.automationEnabled && config.nextRotationAt
    ? `Próxima virada: ${formatDate(config.nextRotationAt)}` : 'Sem troca automática em andamento';
  const phase = element('hf-phase-state');
  phase.classList.toggle('is-active', config.automationEnabled);
  phase.lastChild.textContent = config.automationEnabled
    ? ' Rotação automática em execução' : ' Autoridade canônica ativa';
}

function renderPreview() {
  const preview = state.snapshot.preview;
  const ready = preview.status === 'ready' && Boolean(preview.nextHeroId);
  element('hf-preview-hero').textContent = ready ? preview.nextHeroName : 'Próximo herói indisponível';
  element('hf-preview-time').textContent = ready && preview.scheduledFor
    ? `Virada real prevista para ${formatDate(preview.scheduledFor)}. A prévia não publica nada.`
    : 'Nenhum estado será alterado.';
  const link = element('hf-open-preview');
  link.setAttribute('aria-disabled', String(!ready || !state.snapshot.permissions.view));
  link.tabIndex = ready && state.snapshot.permissions.view ? 0 : -1;
}

function renderHeroes() {
  const target = element('hf-hero-options');
  const query = String(element('hf-hero-search')?.value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const heroes = state.snapshot.heroes.filter(hero => !query || `${hero.name} ${hero.slug}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(query));
  if (!heroes.length) {
    target.innerHTML = '<div class="hf-loading">Nenhum herói corresponde à busca.</div>';
    return;
  }
  target.innerHTML = heroes.map(hero => {
    const media = mediaFor(hero.id);
    const source = media.card_source || media.main_source || '';
    const selected = hero.id === state.selectedHeroId;
    const current = hero.id === state.snapshot.config.currentHeroId;
    const queued = state.draft.queue.includes(hero.id);
    const art = source
      ? `<img src="${escapeHtml(source)}" alt="" loading="lazy">`
      : `<span class="hf-hero-monogram">${escapeHtml(hero.name.slice(0, 2))}</span>`;
    const subtitle = queued ? (media.class_name || hero.slug || 'Herói') : 'Fora da fila · adicione abaixo';
    return `<button class="hf-hero-option${selected ? ' is-selected' : ''}${current ? ' is-current' : ''}${queued ? '' : ' is-outside-queue'}" type="button" data-select-hero="${escapeHtml(hero.id)}" aria-pressed="${String(selected)}" ${queued ? '' : 'disabled'} style="--hero-color:${escapeHtml(safeColor(media.class_color))}"><span class="hf-hero-art">${art}</span><span class="hf-hero-copy-card"><strong>${escapeHtml(hero.name)}</strong><small>${escapeHtml(subtitle)}</small></span></button>`;
  }).join('');
}

function renderQueue() {
  const target = element('hf-queue');
  const access = homeFeaturedAccess(state.snapshot);
  const heroMap = new Map(state.snapshot.heroes.map(hero => [hero.id, hero]));
  target.innerHTML = state.draft.queue.map((heroId, index) => {
    const hero = heroMap.get(heroId) || { name: 'Herói indisponível', slug: heroId };
    const current = heroId === state.snapshot.config.currentHeroId;
    const controlsDisabled = state.busy || state.snapshot.config.automationEnabled || !access.canEdit;
    return `<li class="hf-queue-item${current ? ' is-current' : ''}" data-queue-hero="${escapeHtml(heroId)}"><span class="hf-queue-copy"><strong>${escapeHtml(hero.name)}</strong><small>${current ? 'Destaque atual · posição protegida' : escapeHtml(hero.slug)}</small></span><span class="hf-queue-controls"><button type="button" data-queue-move="up" aria-label="Subir ${escapeHtml(hero.name)}" ${controlsDisabled || index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-queue-move="down" aria-label="Descer ${escapeHtml(hero.name)}" ${controlsDisabled || index === state.draft.queue.length - 1 ? 'disabled' : ''}>↓</button><button class="remove" type="button" data-queue-remove aria-label="Remover ${escapeHtml(hero.name)} da fila" ${controlsDisabled || current || state.draft.queue.length <= 1 ? 'disabled' : ''}>×</button></span></li>`;
  }).join('');
  element('hf-queue-count').textContent = `${state.draft.queue.length} herói${state.draft.queue.length === 1 ? '' : 's'} na sequência`;

  const available = state.snapshot.heroes.filter(hero => !state.draft.queue.includes(hero.id));
  const select = element('hf-queue-add-select');
  select.innerHTML = available.length
    ? `<option value="">Escolha um herói</option>${available.map(hero => `<option value="${escapeHtml(hero.id)}">${escapeHtml(hero.name)}</option>`).join('')}`
    : '<option value="">Todos já estão na fila</option>';
  select.disabled = state.busy || state.snapshot.config.automationEnabled || !access.canEdit || !available.length;
  element('hf-queue-add').disabled = select.disabled || !select.value;
}

function renderHistory() {
  const target = element('hf-history');
  if (!state.snapshot.history.length) {
    target.innerHTML = '<div class="hf-loading">Nenhum evento editorial registrado.</div>';
    return;
  }
  target.innerHTML = state.snapshot.history.map(item => {
    const from = item.previousHeroName || 'sem destaque anterior';
    const to = item.heroName || 'estado neutro';
    const route = item.changed ? `${from} → ${to}` : to;
    const reason = item.details?.reason ? ` · ${item.details.reason}` : '';
    return `<article class="hf-history-item${item.eventType === 'manual_override' ? ' is-manual' : ''}"><i class="hf-history-dot" aria-hidden="true"></i><div class="hf-history-copy"><strong>${escapeHtml(eventLabel(item.eventType))}</strong><p>${escapeHtml(route + reason)}</p></div><time datetime="${escapeHtml(item.executedAt || '')}">${escapeHtml(formatDate(item.executedAt))}</time></article>`;
  }).join('');
}

function syncPlanControls() {
  document.querySelectorAll('input[name="hf-cadence"]').forEach(input => {
    input.checked = input.value === state.draft.cadence;
  });
  element('hf-local-time').value = state.draft.localTime;
  element('hf-weekday').value = String(state.draft.weekday);
  element('hf-timezone').value = state.draft.timezoneName;
  element('hf-weekday-field').hidden = state.draft.cadence !== 'weekly';
}

function updateActionState() {
  if (!state.snapshot || !state.draft) return;
  const access = homeFeaturedAccess(state.snapshot);
  const validation = validateHomeFeaturedPlan(state.draft, state.snapshot);
  const changed = homeFeaturedPlanChanged(state.draft, state.snapshot);
  const selectionChanged = state.selectedHeroId && state.selectedHeroId !== state.snapshot.config.currentHeroId;
  const reasonReady = String(element('hf-publish-reason')?.value || '').trim().length >= 4;
  const automationReasonReady = String(element('hf-automation-reason')?.value || '').trim().length >= 4;
  const automationRunning = state.snapshot.config.automationEnabled;
  const workerReady = state.snapshot.worker.active && state.snapshot.worker.jobName === 'echo-home-featured-rotation-1m';

  element('hf-dirty-badge').hidden = !changed;
  element('hf-save-plan').disabled = state.busy || automationRunning || !access.canEdit || !changed || !validation.valid;
  element('hf-discard-plan').disabled = state.busy || !changed;
  element('hf-prepare-publish').disabled = state.busy || automationRunning || !access.canPublish || !selectionChanged || changed || !reasonReady;

  document.querySelectorAll('input[name="hf-cadence"],#hf-local-time,#hf-weekday,#hf-timezone').forEach(control => {
    control.disabled = state.busy || automationRunning || !access.canEdit;
  });

  const automation = element('hf-automation-control');
  automation.classList.toggle('is-active', automationRunning);
  element('hf-automation-title').textContent = automationRunning ? 'Rotação automática ativa' : 'Rotação pronta para ativar';
  element('hf-automation-description').textContent = automationRunning
    ? `O próximo ciclo começa ${state.snapshot.config.nextRotationAt ? `em ${formatDate(state.snapshot.config.nextRotationAt)}` : 'no calendário configurado'}. Pause antes de editar a fila ou trocar manualmente.`
    : 'O destaque atual vira a âncora; o próximo herói entra somente no fim do período configurado.';
  const automationButton = element('hf-prepare-automation');
  automationButton.textContent = automationRunning ? 'Pausar rotação' : 'Ativar rotação';
  automationButton.disabled = state.busy || access.automationLocked || !workerReady || !access.canPublish || changed || !automationReasonReady;
  element('hf-automation-reason').disabled = state.busy || access.automationLocked || !access.canPublish;

  const summary = element('hf-plan-summary');
  if (!validation.valid) {
    summary.classList.add('is-error');
    summary.textContent = validation.errors.join(' ');
  } else {
    summary.classList.remove('is-error');
    const cadence = state.draft.cadence === 'daily'
      ? 'Todos os dias'
      : `Toda ${homeFeaturedWeekdayLabel(state.draft.weekday)}`;
    summary.textContent = `${cadence}, às ${state.draft.localTime}, no fuso ${state.draft.timezoneName}. Sequência com ${state.draft.queue.length} herói${state.draft.queue.length === 1 ? '' : 's'}.`;
  }

  const editNote = element('hf-edit-permission');
  editNote.textContent = !access.canEdit
    ? 'Sua sessão possui leitura, sem permissão publishing.edit para alterar o planejamento.'
    : automationRunning
      ? 'Pause a rotação para editar frequência, calendário ou fila.'
      : 'Você pode editar e salvar o planejamento antes da ativação.';
  editNote.classList.toggle('is-denied', !access.canEdit);
  const publishNote = element('hf-publish-permission');
  if (!access.canPublish) publishNote.textContent = 'Sua sessão não possui publishing.publish para trocar o destaque.';
  else if (automationRunning) publishNote.textContent = 'Pause a rotação antes de publicar um destaque manual.';
  else if (changed) publishNote.textContent = 'Salve ou descarte o planejamento antes de revisar uma troca manual.';
  else if (!selectionChanged) publishNote.textContent = 'Escolha na galeria um herói diferente do destaque atual.';
  else if (!reasonReady) publishNote.textContent = 'Explique o motivo da troca com pelo menos 4 caracteres.';
  else publishNote.textContent = 'Pronto para revisão final. A publicação será auditada.';
  publishNote.classList.toggle('is-denied', !access.canPublish);
}

function renderAll() {
  syncMetrics();
  renderPreview();
  syncPlanControls();
  renderHeroes();
  renderQueue();
  renderHistory();
  updateActionState();
}

function applySnapshot(raw) {
  state.snapshot = normalizeHomeFeaturedSnapshot(raw);
  state.draft = createHomeFeaturedDraft(state.snapshot);
  state.selectedHeroId = state.snapshot.config.currentHeroId;
  state.reviewOpen = false;
  state.automationReviewOpen = false;
  element('hf-publish-reason').value = '';
  element('hf-automation-reason').value = '';
  closeReview();
  closeAutomationReview();
  renderAll();
}

async function load({ quiet = false } = {}) {
  if (!quiet) setMessage('Sincronizando destaque, planejamento e histórico…');
  state.busy = true;
  updateActionState();
  const [snapshotResult, media] = await Promise.all([
    supabase.rpc('echo_admin_home_featured_rotation_v1'),
    loadOptionalMedia()
  ]);
  state.busy = false;
  if (snapshotResult.error) throw snapshotResult.error;
  state.media = media;
  applySnapshot(snapshotResult.data);
  if (!quiet) setMessage('Destaque, prévia e agendador sincronizados com o SNV.', 'success');
}

function setBusy(value) {
  state.busy = value;
  updateActionState();
  renderQueue();
  element('hf-refresh').disabled = value;
}

async function recoverConflict() {
  await load({ quiet: true });
  setMessage('Outro administrador salvou uma revisão antes desta ação. Os dados mais recentes foram recarregados; revise e tente novamente.', 'error');
}

function messageFromError(error) {
  const message = String(error?.message || 'Não foi possível concluir a operação.');
  if (error?.code === '42501' || message.includes('ADMIN_CAPABILITY_DENIED')) return 'Sua sessão não possui a capacidade necessária para esta ação.';
  if (message.includes('HOME_FEATURED_REASON_REQUIRED')) return 'Informe um motivo com 4 a 240 caracteres.';
  if (message.includes('HOME_FEATURED_CURRENT_MUST_REMAIN_IN_QUEUE')) return 'O destaque atual precisa permanecer na fila.';
  if (message.includes('HOME_FEATURED_HERO_NOT_ELIGIBLE')) return 'Adicione esse herói à fila e salve o planejamento antes de publicá-lo.';
  if (message.includes('HOME_FEATURED_TIMEZONE_INVALID')) return 'Informe um fuso IANA existente, como America/Sao_Paulo.';
  if (message.includes('HOME_FEATURED_QUEUE')) return 'Revise a fila: use somente heróis ativos, sem repetições.';
  if (message.includes('HOME_FEATURED_AUTOMATION_MANAGED_IN_PHASE_F')) return 'Pause a rotação automática antes de alterar o planejamento ou o destaque manual.';
  if (message.includes('HOME_FEATURED_CURRENT_NOT_ELIGIBLE')) return 'O destaque atual precisa estar ativo e presente na fila.';
  if (message.includes('HOME_FEATURED_CRON_UNAVAILABLE')) return 'O verificador automático do SNV não está disponível.';
  return message;
}

async function savePlan() {
  try {
    const args = buildHomeFeaturedPlanRpcArgs(state.draft, state.snapshot);
    setBusy(true);
    setMessage('Salvando frequência, calendário e ordem da fila…');
    const { data, error } = await supabase.rpc('echo_admin_save_home_featured_plan_v1', args);
    if (error) throw error;
    applySnapshot(data);
    setMessage(data?.operation === 'unchanged' ? 'O planejamento já estava sincronizado.' : 'Planejamento salvo. A automação continua desligada.', 'success');
  } catch (error) {
    console.error('[home-featured plan]', error);
    if (error?.code === '40001' || String(error?.message || '').includes('HOME_FEATURED_REVISION_CONFLICT')) await recoverConflict();
    else setMessage(messageFromError(error), 'error');
  } finally {
    setBusy(false);
  }
}

function openReview() {
  const selected = heroById(state.selectedHeroId);
  const reason = String(element('hf-publish-reason').value || '').trim();
  if (!selected || selected.id === state.snapshot.config.currentHeroId || reason.length < 4) return;
  if (homeFeaturedPlanChanged(state.draft, state.snapshot)) {
    setMessage('Salve ou descarte o planejamento antes de publicar outro destaque.', 'error');
    return;
  }
  element('hf-review-from').textContent = state.snapshot.config.currentHeroName;
  element('hf-review-to').textContent = selected.name;
  element('hf-review-reason').textContent = `Motivo: ${reason}`;
  element('hf-publish-review').hidden = false;
  state.reviewOpen = true;
  document.body.classList.add('admin-shell-lock');
  setTimeout(() => element('hf-confirm-publish')?.focus(), 30);
}

function closeReview() {
  const review = element('hf-publish-review');
  if (review) review.hidden = true;
  state.reviewOpen = false;
  document.body.classList.remove('admin-shell-lock');
}

async function publishHero() {
  const reason = String(element('hf-publish-reason').value || '').trim();
  try {
    setBusy(true);
    closeReview();
    setMessage('Publicando a nova referência manual do destaque…');
    const { data, error } = await supabase.rpc('echo_admin_set_home_featured_hero_v1', {
      p_hero_id: state.selectedHeroId,
      p_expected_revision: state.snapshot.config.revision,
      p_reason: reason
    });
    if (error) throw error;
    const heroName = data?.config?.current_hero_name || 'O herói escolhido';
    applySnapshot(data);
    setMessage(`${heroName} agora é o destaque canônico exibido pela home.`, 'success');
  } catch (error) {
    console.error('[home-featured publish]', error);
    if (error?.code === '40001' || String(error?.message || '').includes('HOME_FEATURED_REVISION_CONFLICT')) await recoverConflict();
    else setMessage(messageFromError(error), 'error');
  } finally {
    setBusy(false);
  }
}

function openAutomationReview() {
  if (!state.snapshot || homeFeaturedPlanChanged(state.draft, state.snapshot)) {
    setMessage('Salve ou descarte o planejamento antes de alterar a automação.', 'error');
    return;
  }
  const enabling = !state.snapshot.config.automationEnabled;
  const reason = String(element('hf-automation-reason').value || '').trim();
  if (reason.length < 4) return;
  element('hf-automation-review-title').textContent = enabling
    ? 'Ativar rotação automática?' : 'Pausar rotação automática?';
  element('hf-automation-review-from').textContent = enabling ? 'Manual' : 'Automática';
  element('hf-automation-review-to').textContent = enabling ? 'Automática' : 'Manual';
  element('hf-automation-review-reason').textContent = `Motivo: ${reason}`;
  element('hf-automation-review-note').textContent = enabling
    ? 'O destaque atual vira a âncora. O próximo herói só entra no fim do período e a ação fica auditada.'
    : 'O herói atual permanece em destaque; calendário e fila deixam de executar trocas até uma nova ativação.';
  element('hf-confirm-automation').textContent = enabling ? 'Confirmar ativação' : 'Confirmar pausa';
  element('hf-automation-review').hidden = false;
  state.automationReviewOpen = true;
  document.body.classList.add('admin-shell-lock');
  setTimeout(() => element('hf-confirm-automation')?.focus(), 30);
}

function closeAutomationReview() {
  const review = element('hf-automation-review');
  if (review) review.hidden = true;
  state.automationReviewOpen = false;
  if (!state.reviewOpen) document.body.classList.remove('admin-shell-lock');
}

async function setAutomation() {
  const enabling = !state.snapshot.config.automationEnabled;
  try {
    const args = buildHomeFeaturedAutomationRpcArgs(
      enabling, element('hf-automation-reason').value, state.snapshot
    );
    setBusy(true);
    closeAutomationReview();
    setMessage(enabling ? 'Ativando rotação automática…' : 'Pausando rotação automática…');
    const { data, error } = await supabase.rpc('echo_admin_set_home_featured_automation_v1', args);
    if (error) throw error;
    applySnapshot(data);
    setMessage(enabling
      ? 'Rotação automática ativa. O destaque atual foi preservado como âncora do ciclo.'
      : 'Rotação pausada. O destaque atual permanece publicado.', 'success');
  } catch (error) {
    console.error('[home-featured automation]', error);
    if (error?.code === '40001' || String(error?.message || '').includes('HOME_FEATURED_REVISION_CONFLICT')) await recoverConflict();
    else setMessage(messageFromError(error), 'error');
  } finally {
    setBusy(false);
  }
}

function bindEvents() {
  element('hf-hero-search')?.addEventListener('input', renderHeroes);
  element('hf-hero-options')?.addEventListener('click', event => {
    const button = event.target.closest('[data-select-hero]');
    if (!button || state.busy) return;
    state.selectedHeroId = button.dataset.selectHero;
    closeReview();
    renderHeroes();
    updateActionState();
  });

  document.querySelectorAll('input[name="hf-cadence"]').forEach(input => input.addEventListener('change', () => {
    state.draft.cadence = input.value;
    element('hf-weekday-field').hidden = input.value !== 'weekly';
    updateActionState();
  }));
  element('hf-local-time')?.addEventListener('input', event => { state.draft.localTime = event.target.value; updateActionState(); });
  element('hf-weekday')?.addEventListener('change', event => { state.draft.weekday = Number(event.target.value); updateActionState(); });
  element('hf-timezone')?.addEventListener('input', event => { state.draft.timezoneName = event.target.value; updateActionState(); });
  element('hf-publish-reason')?.addEventListener('input', updateActionState);
  element('hf-automation-reason')?.addEventListener('input', updateActionState);

  element('hf-queue')?.addEventListener('click', event => {
    const item = event.target.closest('[data-queue-hero]');
    if (!item || state.busy) return;
    const heroId = item.dataset.queueHero;
    const direction = event.target.closest('[data-queue-move]')?.dataset.queueMove;
    try {
      if (direction) state.draft.queue = moveHomeFeaturedQueue(state.draft.queue, heroId, direction);
      else if (event.target.closest('[data-queue-remove]')) state.draft.queue = removeHomeFeaturedQueueHero(state.draft.queue, heroId, state.snapshot.config.currentHeroId);
      else return;
      renderQueue(); updateActionState();
    } catch (error) { setMessage(error.message, 'error'); }
  });

  element('hf-queue-add-select')?.addEventListener('change', event => {
    element('hf-queue-add').disabled = state.busy || !event.target.value;
  });
  element('hf-queue-add')?.addEventListener('click', () => {
    const select = element('hf-queue-add-select');
    state.draft.queue = addHomeFeaturedQueueHero(state.draft.queue, select.value, state.snapshot.heroes.map(hero => hero.id));
    renderQueue(); updateActionState();
  });
  element('hf-discard-plan')?.addEventListener('click', () => {
    state.draft = createHomeFeaturedDraft(state.snapshot);
    syncPlanControls(); renderQueue(); updateActionState();
    setMessage('Alterações locais descartadas.');
  });
  element('hf-save-plan')?.addEventListener('click', savePlan);
  element('hf-prepare-publish')?.addEventListener('click', openReview);
  element('hf-confirm-publish')?.addEventListener('click', publishHero);
  element('hf-prepare-automation')?.addEventListener('click', openAutomationReview);
  element('hf-confirm-automation')?.addEventListener('click', setAutomation);
  document.querySelectorAll('[data-review-cancel]').forEach(button => button.addEventListener('click', closeReview));
  document.querySelectorAll('[data-automation-review-cancel]').forEach(button => button.addEventListener('click', closeAutomationReview));
  element('hf-refresh')?.addEventListener('click', async () => {
    try { await load(); } catch (error) { setMessage(messageFromError(error), 'error'); }
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (state.reviewOpen) closeReview();
    if (state.automationReviewOpen) closeAutomationReview();
  });
  window.addEventListener('beforeunload', event => {
    if (!state.snapshot || !state.draft || !homeFeaturedPlanChanged(state.draft, state.snapshot)) return;
    event.preventDefault(); event.returnValue = '';
  });
}

export async function initHomeFeaturedAdmin() {
  populateTimezones();
  bindEvents();
  try {
    await load();
  } catch (error) {
    console.error('[home-featured load]', error);
    state.busy = false;
    setMessage(messageFromError(error), 'error');
    element('hf-hero-options').innerHTML = '<div class="hf-loading">Não foi possível carregar os heróis. Nenhum dado foi alterado.</div>';
    element('hf-queue').innerHTML = '<li class="hf-loading">Fila indisponível.</li>';
    element('hf-history').innerHTML = '<div class="hf-loading">Histórico indisponível.</div>';
  }
}
