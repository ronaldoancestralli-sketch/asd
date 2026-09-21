/* =========================================================
   PORTEIRO GLOBAL — Echo Arena

   Carregado como script clássico no início do <head> de todas
   as páginas públicas. Decide antes da pintura se o visitante
   pode ver a página.

   Fontes de manutenção:
     1. bloqueio emergencial de system_settings/site_status;
     2. manutenção programada na Central de Avisos.

   Em manutenção:
     visitante  → tela de manutenção;
     admin      → página normal + alerta operacional.

   O painel /admin/ não usa este arquivo e continua disponível
   para autenticação e operação.
   ========================================================= */

(function () {
  'use strict';

  var SUPABASE_URL = 'https://nqklhsfaqpbjqmfzjzxk.supabase.co';
  var ANON_KEY = 'sb_publishable_20kuwDQ9LpRI10-hR2kXkA_pu4eVBmC';
  var STORAGE_KEY = 'echo-arena-auth';
  var ANNOUNCEMENT_PAGE_KEY = 'global_announcement';
  var MAINTENANCE_ACCESS_MODE = 'maintenance_lock';
  var TIMEOUT_MS = 5000;
  var MAX_TIMER_DELAY = 2147483000;
  var GUARD_ID = 'echo-boot-guard';
  var SITE_PAINT_GUARD_ID = 'site-paint-guard';
  var ADMIN_BANNER_ID = 'echo-mnt-banner';
  var boundaryTimer = null;

  var paintGuard = document.createElement('style');
  paintGuard.id = GUARD_ID;
  paintGuard.textContent = 'body{visibility:hidden !important}';
  (document.head || document.documentElement).appendChild(paintGuard);

  function reveal() {
    var element = document.getElementById(GUARD_ID);
    if (element) element.remove();
  }

  var safetyTimer = setTimeout(reveal, TIMEOUT_MS + 2000);

  function finish() {
    clearTimeout(safetyTimer);
    reveal();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return {
        '&': '&amp;', '<': '&lt;', '>': '&gt;',
        '"': '&quot;', "'": '&#039;'
      }[character];
    });
  }

  function validDate(value) {
    if (!value) return null;
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value) {
    var date = value instanceof Date ? value : validDate(value);
    if (!date) return '';
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }).format(date);
    } catch (_) {
      return date.toLocaleString('pt-BR');
    }
  }

  function whenBodyReady(callback) {
    if (document.body) callback();
    else document.addEventListener('DOMContentLoaded', callback, { once: true });
  }

  function accessToken() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed[0] || null;
      return parsed.access_token ||
        (parsed.currentSession && parsed.currentSession.access_token) ||
        null;
    } catch (_) {
      return null;
    }
  }

  function request(path, options) {
    var settings = options || {};
    var token = settings.token;
    return fetch(SUPABASE_URL + path, {
      method: settings.method || 'GET',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': 'Bearer ' + (token || ANON_KEY),
        'Content-Type': 'application/json'
      },
      body: settings.body,
      signal: settings.signal
    }).then(function (response) {
      if (!response.ok) throw new Error('status ' + response.status);
      return response.json();
    });
  }

  function firstRow(value) {
    return Array.isArray(value) ? value[0] || null : value || null;
  }

  function evaluateScheduledMaintenance(row, now) {
    var content = row && row.content && typeof row.content === 'object' ? row.content : {};
    var startsAt = validDate(content.starts_at);
    var endsAt = validDate(content.ends_at);
    var base = {
      active: false,
      scheduled: false,
      startsAt: startsAt,
      endsAt: endsAt,
      nextAt: null,
      label: String(content.label || 'Manutenção programada').trim(),
      message: String(content.message || '').trim()
    };

    var eligible = row && row.published === true &&
      content.enabled === true &&
      content.variant === 'maintenance' &&
      content.access_mode === MAINTENANCE_ACCESS_MODE &&
      base.message && (!content.starts_at || startsAt) && endsAt &&
      (!startsAt || startsAt < endsAt);

    if (!eligible) return base;

    var nowTime = now instanceof Date ? now.getTime() : Number(now || Date.now());
    if (startsAt && nowTime < startsAt.getTime()) {
      base.scheduled = true;
      base.nextAt = startsAt;
      return base;
    }
    if (nowTime >= endsAt.getTime()) return base;

    base.active = true;
    base.nextAt = endsAt;
    return base;
  }

  function resolveGate(statusData, announcementData) {
    var status = firstRow(statusData) || {};
    var announcement = firstRow(announcementData);
    var scheduled = evaluateScheduledMaintenance(announcement, Date.now());
    var manual = status.maintenance_mode === true;
    var source = manual ? 'manual' : scheduled.active ? 'scheduled' : 'none';
    return {
      active: manual || scheduled.active,
      source: source,
      siteName: String(status.site_name || 'Echo Arena').trim(),
      label: source === 'scheduled' ? scheduled.label : 'Manutenção em andamento',
      message: source === 'scheduled'
        ? scheduled.message
        : String(status.maintenance_message || 'Estamos ajustando os bastidores da arena. O site volta ao ar em breve.').trim(),
      startsAt: source === 'scheduled' ? scheduled.startsAt : null,
      endsAt: source === 'scheduled' ? scheduled.endsAt : null,
      nextAt: source === 'scheduled' ? scheduled.nextAt : source === 'none' ? scheduled.nextAt : null
    };
  }

  function scheduleBoundaryReload(value) {
    var date = value instanceof Date ? value : validDate(value);
    var target = date ? date.getTime() : null;
    if (!target) return;
    if (boundaryTimer) clearTimeout(boundaryTimer);

    function arm() {
      var remaining = target - Date.now();
      if (remaining <= 200) {
        location.reload();
        return;
      }
      boundaryTimer = setTimeout(arm, Math.min(remaining + 120, MAX_TIMER_DELAY));
    }

    arm();
  }

  function showMaintenance(gate) {
    window.__ECHO_BLOCKED = true;
    window.__ECHO_MAINTENANCE_ACTIVE = true;

    whenBodyReady(function () {
      var sitePaintGuard = document.getElementById(SITE_PAINT_GUARD_ID);
      if (sitePaintGuard) sitePaintGuard.remove();

      var siteName = escapeHtml(gate.siteName || 'Echo Arena');
      var label = escapeHtml(gate.label || 'Manutenção em andamento');
      var message = escapeHtml(gate.message || 'O site volta ao ar em breve.');
      var returnCopy = gate.endsAt
        ? 'Retorno automático previsto para <strong>' + escapeHtml(formatDate(gate.endsAt)) + '</strong>.'
        : 'A liberação será feita pela equipe assim que o trabalho terminar.';

      document.title = (gate.siteName || 'Echo Arena') + ' — Manutenção';
      document.body.innerHTML =
        '<div class="mnt-wrap">' +
          '<div class="mnt-grid" aria-hidden="true"></div>' +
          '<div class="mnt-glow" aria-hidden="true"></div>' +
          '<main class="mnt-card">' +
            '<div class="mnt-state"><i></i><span>ACESSO TEMPORARIAMENTE PAUSADO</span></div>' +
            '<div class="mnt-mark" aria-hidden="true"></div>' +
            '<p class="mnt-site">' + siteName + '</p>' +
            '<h1>' + label + '</h1>' +
            '<p class="mnt-copy">' + message + '</p>' +
            '<p class="mnt-return">' + returnCopy + '</p>' +
            '<div class="mnt-bar" aria-hidden="true"><i></i></div>' +
            '<div class="mnt-actions">' +
              '<button class="mnt-retry" type="button">Verificar novamente</button>' +
              '<a href="./admin/">Acesso administrativo</a>' +
            '</div>' +
          '</main>' +
        '</div>';

      var style = document.createElement('style');
      style.textContent =
        'html body{visibility:visible!important}*{box-sizing:border-box}.mnt-wrap{position:fixed;inset:0;display:grid;place-items:center;padding:24px;' +
          'background:radial-gradient(circle at 50% -15%,#30205f 0%,#0a0714 48%,#05070d 100%);overflow:auto;' +
          'font-family:Inter,system-ui,-apple-system,sans-serif;color:#f3efff}.mnt-grid{position:absolute;inset:0;opacity:.13;' +
          'background-image:linear-gradient(#9e83dd22 1px,transparent 1px),linear-gradient(90deg,#9e83dd22 1px,transparent 1px);' +
          'background-size:42px 42px;mask-image:linear-gradient(to bottom,#000,transparent 78%)}' +
        '.mnt-glow{position:absolute;width:min(680px,94vw);aspect-ratio:1;border-radius:50%;' +
          'background:radial-gradient(circle,#8b5cf62d,transparent 65%);filter:blur(12px)}' +
        '.mnt-card{position:relative;width:min(520px,100%);padding:34px 32px;text-align:center;border:1px solid #322552;' +
          'border-radius:22px;background:linear-gradient(155deg,rgba(23,17,43,.97),rgba(9,12,23,.97));' +
          'box-shadow:0 36px 110px rgba(0,0,0,.64),inset 0 1px rgba(255,255,255,.04)}' +
        '.mnt-state{display:inline-flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid #613442;border-radius:999px;' +
          'background:#2a1119;color:#ffb5c0;font-size:9px;font-weight:800;letter-spacing:.11em}.mnt-state i{width:7px;height:7px;' +
          'border-radius:50%;background:#ff6579;box-shadow:0 0 14px #ff6579;animation:mntPulse 1.8s ease-in-out infinite}' +
        '.mnt-mark{width:58px;height:58px;margin:25px auto 16px;border-radius:16px;position:relative;' +
          'background:linear-gradient(140deg,#b99cff,#6d28d9);box-shadow:0 0 32px #8b5cf65c}' +
        '.mnt-mark::after{content:"";position:absolute;inset:15px;background:#fff;opacity:.94;' +
          'clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)}' +
        '@keyframes mntPulse{50%{opacity:.48;transform:scale(.78)}}' +
        '.mnt-site{margin:0;color:#a993e3;font-size:10px;font-weight:800;letter-spacing:.18em;text-transform:uppercase}' +
        '.mnt-card h1{margin:8px 0 0;font-size:clamp(25px,6vw,36px);line-height:1.03;font-weight:850;letter-spacing:-.02em}' +
        '.mnt-copy{margin:19px auto 0;max-width:410px;color:#afa5c6;font-size:13px;line-height:1.7}' +
        '.mnt-return{margin:16px 0 0;padding:12px;border:1px solid #2a2441;border-radius:11px;background:#0c101d;' +
          'color:#8f87a3;font-size:11px;line-height:1.55}.mnt-return strong{color:#d9ccff}' +
        '.mnt-bar{height:4px;margin:23px 0 20px;border-radius:4px;background:#251b45;overflow:hidden}' +
        '.mnt-bar i{display:block;width:34%;height:100%;border-radius:4px;background:linear-gradient(90deg,#8b5cf6,#d6c8ff);' +
          'animation:mntSlide 1.9s ease-in-out infinite}@keyframes mntSlide{0%{transform:translateX(-100%)}100%{transform:translateX(390%)}}' +
        '.mnt-actions{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap}.mnt-retry,.mnt-actions a{' +
          'min-height:40px;display:inline-flex;align-items:center;justify-content:center;padding:0 15px;border:1px solid #342959;' +
          'border-radius:10px;background:#17122c;color:#d4caed;font:inherit;font-size:10px;font-weight:750;text-decoration:none;cursor:pointer}' +
        '.mnt-retry:hover,.mnt-actions a:hover{border-color:#7658bd;background:#21183e;color:#fff}.mnt-actions a{background:transparent;color:#827995}' +
        '@media(max-width:480px){.mnt-wrap{padding:14px}.mnt-card{padding:27px 18px}.mnt-actions{display:grid}.mnt-retry,.mnt-actions a{width:100%}}' +
        '@media(prefers-reduced-motion:reduce){.mnt-state i,.mnt-bar i{animation:none}}';
      document.head.appendChild(style);

      var retry = document.querySelector('.mnt-retry');
      if (retry) retry.addEventListener('click', function () { location.reload(); });
      if (gate.nextAt) scheduleBoundaryReload(gate.nextAt);
      finish();
    });
  }

  function showAdminBanner(gate) {
    window.__ECHO_MAINTENANCE_ACTIVE = true;

    whenBodyReady(function () {
      var bar = document.getElementById(ADMIN_BANNER_ID) || document.createElement('div');
      bar.id = ADMIN_BANNER_ID;
      var endCopy = gate.endsAt ? ' · reabertura automática em ' + formatDate(gate.endsAt) : '';
      bar.innerHTML = '<strong>MODO MANUTENÇÃO ATIVO</strong><span>Visitantes estão bloqueados' +
        escapeHtml(endCopy) + '. Você continua vendo o site por ser administrador.</span>';
      bar.setAttribute('role', 'alert');
      bar.setAttribute('style',
        'position:sticky;top:0;z-index:10001;display:flex;justify-content:center;align-items:center;gap:9px;' +
        'padding:10px 16px;text-align:center;background:linear-gradient(90deg,#3b1019,#591424,#3b1019);' +
        'border-bottom:2px solid #d4485e;color:#ffd2d8;font-family:Inter,system-ui,sans-serif;' +
        'font-size:11px;letter-spacing:.02em;line-height:1.45;box-shadow:0 10px 28px rgba(0,0,0,.28)');

      function place() {
        if (document.body && document.body.firstElementChild !== bar) document.body.prepend(bar);
      }

      place();
      if (typeof MutationObserver === 'function') {
        var observer = new MutationObserver(place);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(function () { observer.disconnect(); }, 15000);
      }
      if (gate.nextAt) scheduleBoundaryReload(gate.nextAt);
      finish();
    });
  }

  function applyGate(gate) {
    if (!gate.active) {
      if (gate.nextAt) scheduleBoundaryReload(gate.nextAt);
      finish();
      return Promise.resolve();
    }

    var token = accessToken();
    if (!token) {
      showMaintenance(gate);
      return Promise.resolve();
    }

    return request('/rest/v1/rpc/echo_is_admin', {
      method: 'POST', body: '{}', token: token
    }).then(function (rows) {
      if (rows === true || firstRow(rows) === true) showAdminBanner(gate);
      else showMaintenance(gate);
    }).catch(function () {
      showMaintenance(gate);
    });
  }

  var controller = typeof AbortController === 'function' ? new AbortController() : null;
  var requestTimer = controller ? setTimeout(function () { controller.abort(); }, TIMEOUT_MS) : null;
  var signal = controller ? controller.signal : undefined;

  var statusRequest = request('/rest/v1/rpc/site_status', {
    method: 'POST', body: '{}', signal: signal
  }).then(function (data) {
    return { data: data, error: null };
  }).catch(function (error) {
    return { data: null, error: error };
  });

  var announcementPath = '/rest/v1/site_pages?select=content,published,updated_at&page_key=eq.' +
    encodeURIComponent(ANNOUNCEMENT_PAGE_KEY) + '&published=eq.true&limit=1';
  var announcementRequest = request(announcementPath, { signal: signal }).then(function (data) {
    return { data: data, error: null };
  }).catch(function (error) {
    return { data: null, error: error };
  });

  Promise.all([statusRequest, announcementRequest]).then(function (results) {
    if (requestTimer) clearTimeout(requestTimer);
    var statusResult = results[0];
    var announcementResult = results[1];
    if (statusResult.error && announcementResult.error) {
      console.warn('[guard] estado de manutenção indisponível; site mantido online');
      finish();
      return null;
    }
    return applyGate(resolveGate(statusResult.data, announcementResult.data));
  }).catch(function (error) {
    if (requestTimer) clearTimeout(requestTimer);
    console.warn('[guard] verificação indisponível:', error.message);
    finish();
  });
})();