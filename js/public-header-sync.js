import './public-beta-banner.js?v=20260822-beta-1&sb=20260823-security-supabase-pin-1&ops=20260905&sc=20260906-1&eq=20260907-effects-1';
const wrapperParams = new URL(import.meta.url).searchParams;
const coreUrl = new URL('./public-header-sync-core.js?v=20260822-public-header-core-3&sb=20260823-security-supabase-pin-1&identity=20260825-v6-public-1&ops=20260905&sc=20260906-1&eq=20260907-effects-1', import.meta.url);
coreUrl.searchParams.set('active', wrapperParams.get('active') || '');
coreUrl.searchParams.set('mode', wrapperParams.get('mode') || 'site-shell');
await import(coreUrl.href);
