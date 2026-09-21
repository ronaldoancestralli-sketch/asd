import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const guardSource = await readFile(new URL('../js/guard.js', import.meta.url), 'utf8');
const NOW = Date.parse('2026-08-22T22:00:00.000Z');

function response(data, ok = true, status = 200) {
  return { ok, status, json: async () => data };
}

function schedule(overrides = {}) {
  return [{
    published: true,
    content: {
      enabled: true,
      variant: 'maintenance',
      access_mode: 'maintenance_lock',
      label: 'Atualização da Arena',
      message: 'Voltamos logo.',
      starts_at: '2026-08-22T21:00:00.000Z',
      ends_at: '2026-08-22T23:00:00.000Z',
      ...overrides
    }
  }];
}

async function runGuard({
  status = [{ maintenance_mode: false, site_name: 'Echo Arena' }],
  announcement = [],
  isAdmin = false,
  userId = null,
  failStatus = false,
  failAnnouncement = false,
  secondaryPaintGuard = false
} = {}) {
  const elements = new Map();
  const timers = [];
  let nextTimerId = 1;
  let reloads = 0;

  function createElement(tagName) {
    const node = {
      tagName: String(tagName).toUpperCase(),
      id: '',
      textContent: '',
      innerHTML: '',
      firstElementChild: null,
      attributes: {},
      listeners: {},
      appendChild(child) {
        if (child.id) elements.set(child.id, child);
        return child;
      },
      prepend(child) {
        this.firstElementChild = child;
        if (child.id) elements.set(child.id, child);
      },
      remove() {
        if (this.id) elements.delete(this.id);
      },
      setAttribute(name, value) {
        this.attributes[name] = String(value);
      },
      addEventListener(name, callback) {
        this.listeners[name] = callback;
      }
    };
    return node;
  }

  const head = createElement('head');
  const body = createElement('body');
  const documentElement = createElement('html');
  const retry = createElement('button');
  if (secondaryPaintGuard) {
    const sitePaintGuard = createElement('style');
    sitePaintGuard.id = 'site-paint-guard';
    head.appendChild(sitePaintGuard);
  }
  const document = {
    head,
    body,
    documentElement,
    title: '',
    createElement,
    getElementById(id) {
      return elements.get(id) || null;
    },
    querySelector(selector) {
      return selector === '.mnt-retry' && body.innerHTML.includes('mnt-retry') ? retry : null;
    },
    addEventListener() {}
  };

  class FixedDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [NOW]));
    }
    static now() { return NOW; }
  }

  const token = userId
    ? `header.${Buffer.from(JSON.stringify({ sub: userId })).toString('base64url')}.signature`
    : null;

  const context = {
    document,
    window: null,
    location: { reload() { reloads += 1; } },
    localStorage: {
      getItem(key) {
        return key === 'echo-arena-auth' && token ? JSON.stringify({ access_token: token }) : null;
      }
    },
    fetch: async url => {
      if (url.includes('/rpc/site_status')) return failStatus ? response({}, false, 503) : response(status);
      if (url.includes('/site_pages?')) return failAnnouncement ? response({}, false, 503) : response(announcement);
      if (url.includes('/rpc/echo_is_admin')) return response(isAdmin);
      throw new Error(`URL inesperada: ${url}`);
    },
    setTimeout(callback, delay) {
      const id = nextTimerId++;
      timers.push({ id, callback, delay, cleared: false });
      return id;
    },
    clearTimeout(id) {
      const timer = timers.find(item => item.id === id);
      if (timer) timer.cleared = true;
    },
    AbortController: undefined,
    MutationObserver: undefined,
    Date: FixedDate,
    Intl,
    Promise,
    JSON,
    Math,
    Number,
    String,
    Array,
    Object,
    encodeURIComponent,
    atob(value) { return Buffer.from(value, 'base64url').toString('utf8'); },
    console: { warn() {}, log() {}, error() {} }
  };
  context.window = context;

  vm.runInNewContext(guardSource, context, { filename: 'guard.js' });
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));

  return {
    blocked: context.__ECHO_BLOCKED === true,
    maintenanceActive: context.__ECHO_MAINTENANCE_ACTIVE === true,
    html: body.innerHTML,
    adminBanner: elements.get('echo-mnt-banner') || null,
    paintGuard: elements.get('echo-boot-guard') || null,
    secondaryPaintGuard: elements.get('site-paint-guard') || null,
    activeTimers: timers.filter(timer => !timer.cleared),
    reloads
  };
}

test('banner informativo nunca bloqueia o visitante', async () => {
  const result = await runGuard({ announcement: schedule({ access_mode: 'banner_only' }) });
  assert.equal(result.blocked, false);
  assert.equal(result.paintGuard, null);
});

test('manutenção futura mantém o site online e agenda a virada', async () => {
  const result = await runGuard({
    announcement: schedule({
      starts_at: '2026-08-22T22:30:00.000Z',
      ends_at: '2026-08-22T23:30:00.000Z'
    })
  });
  assert.equal(result.blocked, false);
  assert.ok(result.activeTimers.some(timer => timer.delay >= 1_800_000));
});

test('visitante recebe a tela completa dentro do período', async () => {
  const result = await runGuard({ announcement: schedule(), secondaryPaintGuard: true });
  assert.equal(result.blocked, true);
  assert.equal(result.secondaryPaintGuard, null);
  assert.match(result.html, /Atualização da Arena/);
  assert.match(result.html, /Voltamos logo\./);
  assert.match(result.html, /Retorno automático previsto/);
  assert.match(result.html, /Acesso administrativo/);
});

test('mensagem de manutenção é escapada antes de entrar no HTML', async () => {
  const result = await runGuard({ announcement: schedule({ message: '<img src=x onerror=alert(1)>' }) });
  assert.equal(result.blocked, true);
  assert.doesNotMatch(result.html, /<img src=x/);
  assert.match(result.html, /&lt;img src=x/);
});

test('administrador autenticado preserva o site e recebe alerta fixo', async () => {
  const result = await runGuard({
    announcement: schedule(),
    userId: 'admin-1',
    isAdmin: true
  });
  assert.equal(result.blocked, false);
  assert.equal(result.maintenanceActive, true);
  assert.ok(result.adminBanner);
  assert.match(result.adminBanner.innerHTML, /Você continua vendo o site por ser administrador/);
});

test('usuário autenticado sem papel admin continua bloqueado', async () => {
  const result = await runGuard({
    announcement: schedule(),
    userId: 'user-1',
    isAdmin: false
  });
  assert.equal(result.blocked, true);
});

test('encerramento passado reabre o site automaticamente em nova leitura', async () => {
  const result = await runGuard({
    announcement: schedule({
      starts_at: '2026-08-22T19:00:00.000Z',
      ends_at: '2026-08-22T21:59:59.000Z'
    })
  });
  assert.equal(result.blocked, false);
});

test('programação sem encerramento falha de modo seguro e não prende o site', async () => {
  const result = await runGuard({ announcement: schedule({ ends_at: null }) });
  assert.equal(result.blocked, false);
});

test('data inicial inválida não transforma a manutenção em ativação imediata', async () => {
  const result = await runGuard({ announcement: schedule({ starts_at: 'data-inválida' }) });
  assert.equal(result.blocked, false);
});

test('bloqueio emergencial continua funcionando independentemente do banner', async () => {
  const result = await runGuard({
    status: [{ maintenance_mode: true, site_name: 'Echo Arena' }],
    announcement: []
  });
  assert.equal(result.blocked, true);
  assert.match(result.html, /Manutenção em andamento/);
});

test('agendamento continua valendo quando apenas o status emergencial falha', async () => {
  const result = await runGuard({ announcement: schedule(), failStatus: true });
  assert.equal(result.blocked, true);
  assert.match(result.html, /Atualização da Arena/);
});

test('bloqueio emergencial continua valendo quando apenas o aviso falha', async () => {
  const result = await runGuard({
    status: [{ maintenance_mode: true, site_name: 'Echo Arena' }],
    failAnnouncement: true
  });
  assert.equal(result.blocked, true);
  assert.match(result.html, /Manutenção em andamento/);
});

test('indisponibilidade simultânea das fontes mantém o comportamento fail-open', async () => {
  const result = await runGuard({ failStatus: true, failAnnouncement: true });
  assert.equal(result.blocked, false);
  assert.equal(result.paintGuard, null);
});
