const CADENCES = new Set(['daily', 'weekly']);
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const TIMEZONE_PATTERN = /^(?:UTC|[A-Za-z0-9._+-]+(?:\/[A-Za-z0-9._+-]+)+)$/;

const text = value => String(value ?? '').trim();
const integer = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
};

export function normalizeHomeFeaturedSnapshot(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const configSource = source.config && typeof source.config === 'object'
    ? source.config : {};
  const heroMap = new Map();

  for (const item of Array.isArray(source.heroes) ? source.heroes : []) {
    const id = text(item?.id);
    if (!id || heroMap.has(id) || item?.enabled === false) continue;
    heroMap.set(id, {
      id,
      name: text(item?.name) || 'Herói sem nome',
      slug: text(item?.slug),
      displayOrder: integer(item?.display_order),
      enabled: true
    });
  }

  const queue = [];
  const queued = new Set();
  for (const item of Array.isArray(source.queue) ? source.queue : []) {
    const heroId = text(item?.hero_id);
    if (!heroId || queued.has(heroId)) continue;
    queued.add(heroId);
    const hero = heroMap.get(heroId);
    queue.push({
      heroId,
      name: text(item?.name) || hero?.name || 'Herói indisponível',
      slug: text(item?.slug) || hero?.slug || '',
      enabled: item?.enabled !== false,
      position: integer(item?.position, queue.length + 1),
      isCurrent: item?.is_current === true
    });
  }
  queue.sort((a, b) => a.position - b.position);

  const currentHeroId = text(configSource.current_hero_id);
  const localTime = text(configSource.local_time).slice(0, 5) || '00:00';
  const previewSource = source.preview && typeof source.preview === 'object' ? source.preview : {};
  const nextHeroSource = previewSource.next_hero && typeof previewSource.next_hero === 'object'
    ? previewSource.next_hero : {};
  const workerSource = source.worker && typeof source.worker === 'object' ? source.worker : {};

  return {
    phase: text(source.phase) || 'E',
    automationAvailable: source.automation_available === true,
    serverNow: source.server_now || null,
    permissions: {
      view: source.permissions?.view === true,
      edit: source.permissions?.edit === true,
      publish: source.permissions?.publish === true
    },
    config: {
      mode: text(configSource.mode) || 'manual',
      automationEnabled: configSource.automation_enabled === true,
      cadence: CADENCES.has(configSource.cadence) ? configSource.cadence : 'weekly',
      timezoneName: text(configSource.timezone_name) || 'America/Sao_Paulo',
      localTime,
      weekday: integer(configSource.weekday, 1),
      currentHeroId,
      currentHeroName: text(configSource.current_hero_name) || heroMap.get(currentHeroId)?.name || 'Sem destaque',
      currentHeroSlug: text(configSource.current_hero_slug) || heroMap.get(currentHeroId)?.slug || '',
      revision: Math.max(1, integer(configSource.revision, 1)),
      lastStatus: text(configSource.last_status) || 'inactive',
      updatedAt: configSource.updated_at || null,
      periodStartAt: configSource.period_start_at || null,
      periodEndAt: configSource.period_end_at || null,
      nextRotationAt: configSource.next_rotation_at || null
    },
    preview: {
      status: text(previewSource.status) || 'unavailable',
      mutatesState: previewSource.mutates_state === true,
      scheduledFor: previewSource.scheduled_for || null,
      currentHeroId: text(previewSource.current_hero?.id),
      nextHeroId: text(nextHeroSource.id),
      nextHeroName: text(nextHeroSource.name) || 'Próximo herói indisponível',
      nextHeroSlug: text(nextHeroSource.slug)
    },
    worker: {
      jobName: text(workerSource.job_name),
      active: workerSource.active === true,
      schedule: text(workerSource.schedule)
    },
    heroes: [...heroMap.values()].sort((a, b) =>
      a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, 'pt-BR')
    ),
    queue: queue.map((item, index) => ({ ...item, position: index + 1 })),
    history: (Array.isArray(source.history) ? source.history : []).map(item => ({
      id: integer(item?.id),
      eventType: text(item?.event_type),
      previousHeroId: text(item?.previous_hero_id),
      previousHeroName: text(item?.previous_hero_name),
      heroId: text(item?.hero_id),
      heroName: text(item?.hero_name),
      changed: item?.changed === true,
      source: text(item?.source),
      executedAt: item?.executed_at || null,
      details: item?.details && typeof item.details === 'object' ? item.details : {}
    }))
  };
}

export function createHomeFeaturedDraft(snapshot) {
  return {
    cadence: snapshot.config.cadence,
    timezoneName: snapshot.config.timezoneName,
    localTime: snapshot.config.localTime,
    weekday: snapshot.config.weekday,
    queue: snapshot.queue.map(item => item.heroId)
  };
}

export function moveHomeFeaturedQueue(queue, heroId, direction) {
  const next = [...queue];
  const index = next.indexOf(heroId);
  const target = direction === 'up' ? index - 1 : direction === 'down' ? index + 1 : index;
  if (index < 0 || target < 0 || target >= next.length || target === index) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function removeHomeFeaturedQueueHero(queue, heroId, currentHeroId) {
  if (heroId === currentHeroId) throw new Error('O herói em destaque precisa permanecer na fila.');
  if (queue.length <= 1) throw new Error('A fila precisa manter pelo menos um herói.');
  return queue.filter(id => id !== heroId);
}

export function addHomeFeaturedQueueHero(queue, heroId, availableHeroIds) {
  if (!heroId || !availableHeroIds.includes(heroId) || queue.includes(heroId)) return [...queue];
  return [...queue, heroId];
}

export function validateHomeFeaturedPlan(draft, snapshot) {
  const errors = [];
  const cadence = text(draft?.cadence);
  const timezoneName = text(draft?.timezoneName);
  const localTime = text(draft?.localTime).slice(0, 5);
  const weekday = integer(draft?.weekday, -1);
  const queue = Array.isArray(draft?.queue) ? draft.queue.map(text).filter(Boolean) : [];
  const eligible = new Set(snapshot.heroes.filter(hero => hero.enabled).map(hero => hero.id));

  if (!CADENCES.has(cadence)) errors.push('Escolha frequência diária ou semanal.');
  if (!TIME_PATTERN.test(localTime)) errors.push('Informe um horário válido.');
  if (!TIMEZONE_PATTERN.test(timezoneName)) errors.push('Informe um fuso IANA válido.');
  if (weekday < 0 || weekday > 6) errors.push('Escolha um dia válido para a semana.');
  if (!queue.length) errors.push('A fila precisa ter ao menos um herói.');
  if (new Set(queue).size !== queue.length) errors.push('A fila não pode repetir heróis.');
  if (queue.some(id => !eligible.has(id))) errors.push('A fila contém um herói indisponível.');
  if (!queue.includes(snapshot.config.currentHeroId)) errors.push('O destaque atual precisa permanecer na fila.');

  return {
    valid: errors.length === 0,
    errors,
    value: { cadence, timezoneName, localTime, weekday, queue }
  };
}

export function homeFeaturedPlanChanged(draft, snapshot) {
  const current = createHomeFeaturedDraft(snapshot);
  return current.cadence !== draft.cadence
    || current.timezoneName !== text(draft.timezoneName)
    || current.localTime !== text(draft.localTime).slice(0, 5)
    || current.weekday !== integer(draft.weekday, -1)
    || current.queue.length !== draft.queue.length
    || current.queue.some((id, index) => id !== draft.queue[index]);
}

export function buildHomeFeaturedPlanRpcArgs(draft, snapshot) {
  const result = validateHomeFeaturedPlan(draft, snapshot);
  if (!result.valid) throw new Error(result.errors.join(' '));
  return {
    p_cadence: result.value.cadence,
    p_timezone_name: result.value.timezoneName,
    p_local_time: result.value.localTime,
    p_weekday: result.value.weekday,
    p_queue: result.value.queue,
    p_expected_revision: snapshot.config.revision
  };
}

export function homeFeaturedAccess(snapshot) {
  return {
    canView: snapshot.permissions.view,
    canEdit: snapshot.permissions.edit,
    canPublish: snapshot.permissions.publish,
    automationLocked: snapshot.automationAvailable !== true
  };
}

export function buildHomeFeaturedAutomationRpcArgs(enabled, reason, snapshot) {
  const normalizedReason = text(reason);
  if (typeof enabled !== 'boolean') throw new Error('Escolha ativar ou pausar a rotação.');
  if (!snapshot?.automationAvailable) throw new Error('A automação ainda não está disponível.');
  if (normalizedReason.length < 4 || normalizedReason.length > 240) {
    throw new Error('Informe um motivo com 4 a 240 caracteres.');
  }
  return {
    p_enabled: enabled,
    p_expected_revision: snapshot.config.revision,
    p_reason: normalizedReason
  };
}

export function homeFeaturedWeekdayLabel(value) {
  return ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][integer(value, 1)];
}
