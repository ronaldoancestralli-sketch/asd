import test from 'node:test';
import assert from 'node:assert/strict';
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
} from '../admin/js/home-featured-rotation-model.mjs';

const raw = {
  phase: 'E',
  automation_available: false,
  permissions: { view: true, edit: true, publish: false },
  config: {
    mode: 'manual', automation_enabled: false, cadence: 'weekly',
    timezone_name: 'America/Sao_Paulo', local_time: '00:00:00', weekday: 1,
    current_hero_id: 'a', current_hero_name: 'Alpha', current_hero_slug: 'alpha', revision: 7
  },
  heroes: [
    { id: 'a', name: 'Alpha', slug: 'alpha', display_order: 2, enabled: true },
    { id: 'b', name: 'Bravo', slug: 'bravo', display_order: 1, enabled: true },
    { id: 'b', name: 'Duplicado', enabled: true },
    { id: 'x', name: 'Desativado', enabled: false }
  ],
  queue: [
    { hero_id: 'a', name: 'Alpha', position: 1, is_current: true, enabled: true },
    { hero_id: 'b', name: 'Bravo', position: 2, enabled: true },
    { hero_id: 'b', name: 'Bravo', position: 3, enabled: true }
  ],
  history: [{ id: 2, event_type: 'manual_override', hero_id: 'a', hero_name: 'Alpha', changed: true }]
};

test('normaliza snapshot, remove duplicatas e preserva a ordem editorial', () => {
  const state = normalizeHomeFeaturedSnapshot(raw);
  assert.deepEqual(state.heroes.map(hero => hero.id), ['b', 'a']);
  assert.deepEqual(state.queue.map(item => item.heroId), ['a', 'b']);
  assert.equal(state.config.localTime, '00:00');
  assert.equal(state.config.revision, 7);
});

test('cria rascunho sem compartilhar a fila do snapshot', () => {
  const state = normalizeHomeFeaturedSnapshot(raw);
  const draft = createHomeFeaturedDraft(state);
  draft.queue.reverse();
  assert.deepEqual(state.queue.map(item => item.heroId), ['a', 'b']);
});

test('move heróis nos dois sentidos e respeita os limites', () => {
  assert.deepEqual(moveHomeFeaturedQueue(['a', 'b', 'c'], 'b', 'up'), ['b', 'a', 'c']);
  assert.deepEqual(moveHomeFeaturedQueue(['a', 'b', 'c'], 'b', 'down'), ['a', 'c', 'b']);
  assert.deepEqual(moveHomeFeaturedQueue(['a', 'b'], 'a', 'up'), ['a', 'b']);
  assert.deepEqual(moveHomeFeaturedQueue(['a', 'b'], 'b', 'down'), ['a', 'b']);
});

test('não permite remover o destaque ou esvaziar a fila', () => {
  assert.throws(() => removeHomeFeaturedQueueHero(['a', 'b'], 'a', 'a'), /destaque/);
  assert.throws(() => removeHomeFeaturedQueueHero(['a'], 'a', 'b'), /pelo menos um/);
  assert.deepEqual(removeHomeFeaturedQueueHero(['a', 'b'], 'b', 'a'), ['a']);
});

test('adiciona somente herói elegível ausente', () => {
  assert.deepEqual(addHomeFeaturedQueueHero(['a'], 'b', ['a', 'b']), ['a', 'b']);
  assert.deepEqual(addHomeFeaturedQueueHero(['a'], 'a', ['a', 'b']), ['a']);
  assert.deepEqual(addHomeFeaturedQueueHero(['a'], 'x', ['a', 'b']), ['a']);
});

test('valida frequência, horário, fuso, fila e presença do destaque', () => {
  const state = normalizeHomeFeaturedSnapshot(raw);
  const valid = validateHomeFeaturedPlan(createHomeFeaturedDraft(state), state);
  assert.equal(valid.valid, true);
  const invalid = validateHomeFeaturedPlan({
    cadence: 'monthly', timezoneName: 'São Paulo', localTime: '25:70', weekday: 9, queue: ['b', 'b']
  }, state);
  assert.equal(invalid.valid, false);
  assert.equal(invalid.errors.length, 6);
});

test('detecta alterações inclusive na ordem da fila', () => {
  const state = normalizeHomeFeaturedSnapshot(raw);
  const draft = createHomeFeaturedDraft(state);
  assert.equal(homeFeaturedPlanChanged(draft, state), false);
  draft.queue.reverse();
  assert.equal(homeFeaturedPlanChanged(draft, state), true);
});

test('monta payload RPC com revisão otimista e sem campo de ativação', () => {
  const state = normalizeHomeFeaturedSnapshot(raw);
  const args = buildHomeFeaturedPlanRpcArgs(createHomeFeaturedDraft(state), state);
  assert.equal(args.p_expected_revision, 7);
  assert.equal(args.p_local_time, '00:00');
  assert.deepEqual(args.p_queue, ['a', 'b']);
  assert.equal('p_automation_enabled' in args, false);
});

test('separa permissões e mantém automação bloqueada na etapa E', () => {
  const access = homeFeaturedAccess(normalizeHomeFeaturedSnapshot(raw));
  assert.deepEqual(access, {
    canView: true, canEdit: true, canPublish: false, automationLocked: true
  });
});

test('traduz o dia semanal sem depender do fuso do navegador', () => {
  assert.equal(homeFeaturedWeekdayLabel(0), 'domingo');
  assert.equal(homeFeaturedWeekdayLabel(1), 'segunda-feira');
  assert.equal(homeFeaturedWeekdayLabel(6), 'sábado');
});

test('libera automação na etapa F e normaliza prévia e saúde do worker', () => {
  const state = normalizeHomeFeaturedSnapshot({
    ...raw,
    phase: 'F',
    automation_available: true,
    preview: {
      status: 'ready', mutates_state: false, scheduled_for: '2026-09-07T03:00:00Z',
      current_hero: { id: 'a' }, next_hero: { id: 'b', name: 'Bravo', slug: 'bravo' }
    },
    worker: { job_name: 'echo-home-featured-rotation-1m', active: true, schedule: '* * * * *' }
  });
  assert.deepEqual(homeFeaturedAccess(state), {
    canView: true, canEdit: true, canPublish: false, automationLocked: false
  });
  assert.equal(state.preview.nextHeroId, 'b');
  assert.equal(state.preview.nextHeroName, 'Bravo');
  assert.equal(state.preview.mutatesState, false);
  assert.equal(state.worker.active, true);
});

test('monta ativação com revisão otimista e motivo auditável', () => {
  const state = normalizeHomeFeaturedSnapshot({ ...raw, phase: 'F', automation_available: true });
  assert.deepEqual(buildHomeFeaturedAutomationRpcArgs(true, ' Iniciar ciclo diário ', state), {
    p_enabled: true,
    p_expected_revision: 7,
    p_reason: 'Iniciar ciclo diário'
  });
  assert.throws(() => buildHomeFeaturedAutomationRpcArgs(true, 'x', state), /4 a 240/);
  assert.throws(() => buildHomeFeaturedAutomationRpcArgs('true', 'motivo válido', state), /ativar ou pausar/);
  assert.throws(() => buildHomeFeaturedAutomationRpcArgs(true, 'motivo válido', normalizeHomeFeaturedSnapshot(raw)), /não está disponível/);
});
