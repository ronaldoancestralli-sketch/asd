// Compatibilidade para o validador legado de heróis.
// O módulo original resolve './js/admin-shell.js' a partir de admin/js/;
// este bridge mantém o fluxo funcional sem duplicar a implementação do Shell.
export * from '../admin-shell.js?v=20260906-home-featured-phase-e-1&sb=20260823-security-supabase-pin-1&sc=20260906-1';
