import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';

const params = new URLSearchParams(location.search);
const novaBuild = params.get('nova') === '1';
const heroSlug = String(params.get('heroi') || '').trim();
const draftKey = 'echo-arena-build-draft';
const handoffSource = 'heroes-page-handoff';

if (novaBuild) {
  /* Entrada explícita de "Criar build" vinda da página de Heróis.
     Uma nova build nunca pode herdar build salva, comparação ou rascunho antigo. */
  params.delete('build');
  params.delete('draft');
  history.replaceState({}, '', `${location.pathname}?${params.toString()}${location.hash}`);
  localStorage.removeItem(draftKey);

  if (heroSlug) {
    const { data: hero, error } = await supabase
      .from('heroes')
      .select('id,slug')
      .eq('slug', heroSlug)
      .eq('enabled', true)
      .maybeSingle();

    if (error) {
      console.error('[criar-build-entry] Não foi possível resolver o herói recebido:', error);
    } else if (hero?.id) {
      localStorage.setItem(draftKey, JSON.stringify({
        heroId: hero.id,
        items: [],
        title: '',
        description: '',
        visibility: 'public',
        entrySource: handoffSource
      }));
    }
  }
}

try {
  await import('./criar-build.js?v=20260906-home-featured-route-f2-1&sb=20260823-security-supabase-pin-1&calc=20260915-calculation-v2-1&partial=20260917-partial-effects-1');
} finally {
  /* O rascunho acima é só um envelope de transporte para o módulo principal.
     Não deve virar um rascunho persistente sem ação do usuário. */
  if (novaBuild) {
    try {
      const current = JSON.parse(localStorage.getItem(draftKey) || 'null');
      if (current?.entrySource === handoffSource) localStorage.removeItem(draftKey);
    } catch {
      localStorage.removeItem(draftKey);
    }
  }
}
