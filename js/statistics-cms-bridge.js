import { supabase } from './supabase.js?v=20260823-security-supabase-pin-1';

const text = (content, key) => {
  if (!Object.hasOwn(content, key) || content[key] === null) return '';
  return String(content[key]).trim();
};

function setText(selector, content, key) {
  const value = text(content, key);
  const node = document.querySelector(selector);
  if (node && value) node.textContent = value;
}

function setMeta(content) {
  const title = text(content, 'meta_title');
  if (title) document.title = title;
  const description = text(content, 'meta_description');
  if (!description) return;
  let meta = document.querySelector('meta[name="description"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'description';
    document.head.appendChild(meta);
  }
  meta.content = description;
}

function applyStatisticsContent(content = {}) {
  setMeta(content);
  setText('.stats-watermark', content, 'watermark');
  setText('.stats-kicker', content, 'explorer_kicker');
  const title = document.querySelector('.stats-title');
  if (title) {
    const prefix = text(content, 'explorer_title');
    const accent = text(content, 'explorer_accent');
    const accentNode = title.querySelector('span');
    if (prefix && title.firstChild) title.firstChild.textContent = `${prefix} `;
    if (accent && accentNode) accentNode.textContent = accent;
  }
  setText('.stats-lead', content, 'explorer_description');
  setText('.stats-actions .stats-button:first-child', content, 'activity_button');
  setText('.stats-actions .stats-button.secondary', content, 'open_build_button');
  setText('.stats-command-head span', content, 'command_kicker');
  setText('.stats-command-head strong', content, 'command_title');
  setText('#metric-heroes small', content, 'metric_heroes_label');
  setText('#metric-heroes span', content, 'metric_heroes_description');
  setText('#metric-builds small', content, 'metric_builds_label');
  setText('#metric-builds span', content, 'metric_builds_description');
  setText('#metric-equipments small', content, 'metric_equipments_label');
  setText('#metric-equipments span', content, 'metric_equipments_description');
  setText('#metric-compositions small', content, 'metric_compositions_label');
  setText('#metric-compositions span', content, 'metric_compositions_description');

  const sections = [...document.querySelectorAll('.stats-section')];
  const activity = sections[0];
  const coverage = sections[1];
  const buildFeed = sections[2];
  if (activity) {
    setText('#arena-activity .stats-eyebrow', content, 'activity_kicker');
    setText('#arena-activity .stats-section-head h2', content, 'activity_title');
    setText('#arena-activity .stats-section-head p', content, 'activity_description');
    setText('#arena-activity .stats-section-head > a', content, 'activity_link');
    setText('#arena-activity .stats-panel-label small', content, 'activity_criterion');
    setText('#arena-activity .stats-reading-card > small', content, 'reading_kicker');
    setText('#arena-activity .stats-reading-card h3', content, 'reading_title');
    setText('#stats-activity-reading', content, 'reading_description');
  }
  if (coverage) {
    setText('.stats-section:nth-of-type(3) .stats-eyebrow', content, 'coverage_kicker');
    setText('.stats-section:nth-of-type(3) .stats-section-head h2', content, 'coverage_title');
    setText('.stats-section:nth-of-type(3) .stats-section-head p', content, 'coverage_description');
    setText('.stats-section:nth-of-type(3) .stats-section-meta', content, 'coverage_meta');
    setText('.stats-coverage-panel:first-child header small', content, 'classes_kicker');
    setText('.stats-coverage-panel:first-child header h3', content, 'classes_title');
    setText('.stats-coverage-panel:nth-child(2) header small', content, 'equipment_kicker');
    setText('.stats-coverage-panel:nth-child(2) header h3', content, 'equipment_title');
  }
  if (buildFeed) {
    setText('.stats-section:nth-of-type(4) .stats-eyebrow', content, 'build_feed_kicker');
    setText('.stats-section:nth-of-type(4) .stats-section-head h2', content, 'build_feed_title');
    setText('.stats-section:nth-of-type(4) .stats-section-head p', content, 'build_feed_description');
    setText('.stats-section:nth-of-type(4) .stats-section-meta', content, 'build_feed_meta');
    setText('.stats-build-context > small', content, 'signal_kicker');
  }
  setText('.stats-methodology > div:first-child > span', content, 'methodology_kicker');
  setText('.stats-methodology > div:first-child > h2', content, 'methodology_title');

  const sources = [...document.querySelectorAll('.stats-method-grid p')];
  const sourceMap = [
    ['source_heroes_title', 'source_heroes_description'],
    ['source_builds_title', 'source_builds_description'],
    ['source_failures_title', 'source_failures_description']
  ];
  sources.forEach((node, index) => {
    const pair = sourceMap[index];
    if (!pair) return;
    const titleValue = text(content, pair[0]);
    const descriptionValue = text(content, pair[1]);
    if (!titleValue && !descriptionValue) return;
    node.replaceChildren();
    const strong = document.createElement('b');
    strong.textContent = titleValue || ['Heróis','Builds','Falha de fonte'][index];
    node.append(strong, document.createTextNode(` ${descriptionValue || ''}`));
  });

  document.dispatchEvent(new CustomEvent('echo:statistics-content-applied', { detail: { content } }));
}

try {
  const { data, error } = await supabase
    .from('site_pages')
    .select('content,updated_at')
    .eq('page_key', 'statistics')
    .eq('published', true)
    .maybeSingle();
  if (error) throw error;
  const content = data?.content && typeof data.content === 'object' ? data.content : {};
  applyStatisticsContent(content);
} catch (error) {
  console.info('[statistics-cms] Conteúdo padrão em uso:', error.message);
}
