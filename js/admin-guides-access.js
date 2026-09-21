import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';
import {
  getAdminProfile,
  getRoleName
} from '../admin/js/admin-auth.js?v=20260822-post-main-audit-1&sb=20260823-security-supabase-pin-1';

const root = document.documentElement;

function redirectTo(path) {
  location.replace(path);
}

function showClosedState(message) {
  document.body.innerHTML = `
    <main style="min-height:100dvh;display:grid;place-items:center;padding:24px;background:#060910;color:#f5f7ff;font-family:Inter,system-ui,sans-serif">
      <section style="width:min(480px,100%);padding:28px;border:1px solid rgba(147,103,255,.35);border-radius:18px;background:#0d1320;box-shadow:0 24px 70px rgba(0,0,0,.45)">
        <small style="color:#a987ff;font-weight:800;letter-spacing:.14em;text-transform:uppercase">Acesso administrativo</small>
        <h1 style="margin:8px 0 10px;font:800 34px/1 'Barlow Condensed',sans-serif;text-transform:uppercase">Guias está privado</h1>
        <p style="margin:0;color:#98a3b9;font-size:12px;line-height:1.7">${message}</p>
        <a href="./admin/login.html" style="display:inline-flex;margin-top:18px;padding:11px 15px;border-radius:9px;background:#7549df;color:#fff;font-size:10px;font-weight:800;letter-spacing:.08em;text-decoration:none;text-transform:uppercase">Ir ao login administrativo</a>
      </section>
    </main>`;
  root.classList.remove('guides-auth-pending');
  root.classList.add('guides-auth-closed');
}

async function loadAuthorizedExperience() {
  await import('./site-content.js?v=20260822-drawer-unified-1&sb=20260823-security-supabase-pin-1&ops=20260905&sc=20260906-1&eq=20260907-effects-1');
  await import('./public-modules.js?v=20260822-drawer-unified-1&sb=20260823-security-supabase-pin-1&ops=20260905&sc=20260906-1&eq=20260907-effects-1');
  await import('./public-modules-polish.js?v=20260823-public-modules-freeze-hotfix-1');
  await import('./editorial-seo.js?v=1&sb=20260823-security-supabase-pin-1');
  await import('./module-public-shell.js?v=20260822-beta-module-4&active=guias&sb=20260823-security-supabase-pin-1&identity=20260825-v6-public-1&ops=20260905&sc=20260906-1&eq=20260907-effects-1');
}

async function authorizeGuides() {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.error('[admin-guides-access] Falha ao validar a sessão:', error);
    showClosedState('Não foi possível validar a sessão com segurança. O conteúdo permaneceu bloqueado.');
    return;
  }

  if (!data?.user) {
    redirectTo('./admin/login.html');
    return;
  }

  try {
    const profile = await getAdminProfile(data.user.id);

    if (getRoleName(profile) !== 'admin') {
      redirectTo('./index.html');
      return;
    }

    root.classList.remove('guides-auth-pending');
    root.classList.add('guides-admin-authorized');
    await loadAuthorizedExperience();
  } catch (error) {
    console.error('[admin-guides-access] A autorização administrativa falhou:', error);
    showClosedState('A permissão administrativa não pôde ser confirmada. O conteúdo permaneceu bloqueado.');
  }
}

await authorizeGuides();
