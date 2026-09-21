import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';

const $ = id => document.getElementById(id);

function setMetric(id, value, note = '') {
  const target = $(id);
  if (!target) return;
  target.textContent = value == null ? '—' : String(value);
  const card = target.closest('.hero-status-card');
  const noteTarget = card?.querySelector('small');
  if (noteTarget && note) noteTarget.textContent = note;
}

function setMessage(text, type = '') {
  const target = $('hero-status-message');
  if (!target) return;
  target.textContent = text;
  target.className = `hero-status-message${type ? ` ${type}` : ''}`;
}

async function loadHeroStatus() {
  setMessage('Lendo o estado real dos heróis, habilidades e mídia no Supabase…');

  const [heroesResult, skillsResult] = await Promise.all([
    supabase
      .from('v_heroes_complete')
      .select('id,enabled,main_source,card_source'),
    supabase
      .from('hero_skills')
      .select('id,hero_id,enabled')
  ]);

  if (heroesResult.error || skillsResult.error) {
    const reasons = [heroesResult.error?.message, skillsResult.error?.message]
      .filter(Boolean)
      .join(' · ');
    setMetric('hero-status-total', null, 'Consulta indisponível');
    setMetric('hero-status-active', null, 'Consulta indisponível');
    setMetric('hero-status-skills', null, 'Consulta indisponível');
    setMetric('hero-status-media', null, 'Consulta indisponível');
    setMessage(`Não foi possível confirmar o estado no Supabase${reasons ? `: ${reasons}` : '.'}`, 'error');
    return;
  }

  const heroes = heroesResult.data || [];
  const skills = skillsResult.data || [];
  const activeHeroes = heroes.filter(hero => hero.enabled === true);
  const activeSkills = skills.filter(skill => skill.enabled !== false);
  const activeWithMedia = activeHeroes.filter(hero =>
    String(hero.main_source || '').trim() && String(hero.card_source || '').trim()
  );
  const missingMedia = Math.max(0, activeHeroes.length - activeWithMedia.length);

  setMetric('hero-status-total', heroes.length, 'Registros retornados pela view canônica');
  setMetric('hero-status-active', activeHeroes.length, 'enabled = true');
  setMetric('hero-status-skills', activeSkills.length, 'Habilidades ativas cadastradas');
  setMetric(
    'hero-status-media',
    `${activeWithMedia.length}/${activeHeroes.length}`,
    missingMedia ? `${missingMedia} herói(s) ativo(s) sem mídia completa` : 'Main e card presentes nos heróis ativos'
  );

  const mediaCard = $('hero-status-media')?.closest('.hero-status-card');
  mediaCard?.classList.toggle('warn', missingMedia > 0);

  setMessage(
    missingMedia
      ? `Leitura concluída. Existem ${missingMedia} herói(s) ativo(s) que precisam de revisão de mídia.`
      : 'Leitura concluída. Os heróis ativos retornados pela view estão com mídia principal e de card preenchidas.'
  );
}

$('hero-status-refresh')?.addEventListener('click', loadHeroStatus);
loadHeroStatus().catch(error => {
  console.error('[hero-status]', error);
  setMessage(`Falha inesperada ao carregar o status: ${error?.message || String(error)}`, 'error');
});
