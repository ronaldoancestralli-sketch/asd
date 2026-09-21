import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';

export async function loadHeroPublicParityData() {
  const [heroesResult, skillsResult] = await Promise.all([
    supabase.from('v_heroes_complete')
      .select('id,name,slug,enabled,class_name,main_source,card_source')
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('name'),
    supabase.from('hero_skills').select('id,hero_id,enabled')
  ]);

  if (heroesResult.error) throw heroesResult.error;
  if (skillsResult.error) throw skillsResult.error;

  const heroesById = new Map(
    (heroesResult.data || []).map(hero => [String(hero.id), hero])
  );
  const skillCountsByHero = new Map();

  for (const row of skillsResult.data || []) {
    if (row.enabled === false) continue;
    const id = String(row.hero_id || '');
    skillCountsByHero.set(id, (skillCountsByHero.get(id) || 0) + 1);
  }

  return { heroesById, skillCountsByHero };
}

export function mergeHeroPublicState(hero, parity) {
  const id = String(hero?.id || '');
  const publicHero = parity?.heroesById?.get(id) || null;
  const publicSkillCount = parity?.skillCountsByHero?.get(id) || 0;

  return {
    ...(publicHero || {}),
    ...(hero || {}),
    class_name: publicHero?.class_name || hero?.class_name || '',
    main_source: publicHero?.main_source || '',
    card_source: publicHero?.card_source || '',
    public_skill_count: publicSkillCount
  };
}
