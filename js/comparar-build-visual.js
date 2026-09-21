/* Aprimoramento visual da página Comparar Builds.
   Observa apenas linhas de atributos já renderizadas pelo comparar-build.js.
   Não cria, altera ou recalcula dados. */

const ICONS = {
  health: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.2 4.7 13.1A5.1 5.1 0 0 1 11.8 6l.2.3.2-.3a5.1 5.1 0 0 1 7.1 7.1Z"/><path class="stat-icon-detail" d="M7.6 12h2.5l1.2-2.6 1.8 5.2 1.2-2.6h2.2"/></svg>`,
  armor: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2 19 6v5.4c0 4.4-2.6 7.5-7 9.4-4.4-1.9-7-5-7-9.4V6Z"/><path class="stat-icon-detail" d="m8.6 11.8 2.3 2.2 4.5-5"/></svg>`,
  armor_resistance: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2 19 6v5.4c0 4.4-2.6 7.5-7 9.4-4.4-1.9-7-5-7-9.4V6Z"/><path class="stat-icon-detail" d="M8.5 12h7M12 8.5v7"/></svg>`,
  penetration_resistance: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2 19 6v5.4c0 4.4-2.6 7.5-7 9.4-4.4-1.9-7-5-7-9.4V6Z"/><path class="stat-icon-detail" d="m8 15 8-8M8.5 8.5l7 7"/></svg>`,
  damage_per_shot: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.4 4 5.6-.1-.1 5.6-8.9 8.9-5.4-5.4Z"/><path class="stat-icon-detail" d="m6.8 11.7-2.5 2.5 5.5 5.5 2.5-2.5M15.8 8.2l2-2"/></svg>`,
  armor_penetration: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h11"/><path d="m12 7 5 5-5 5"/><path class="stat-icon-detail" d="M18 6.5 20.5 9 18 11.5M18 12.5l2.5 2.5-2.5 2.5"/></svg>`,
  penetration_power: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/><path class="stat-icon-detail" d="M12 2v3M22 12h-3M12 22v-3M2 12h3"/></svg>`,
  max_movement_speed: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13.8 2.8-7 10h5l-1.5 8.4 7.1-10.5h-5.1Z"/><path class="stat-icon-detail" d="M4 17.5h4M3 13.5h3"/></svg>`,
  aimed_movement_speed: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="14" cy="10" r="5"/><path d="M14 2v3M14 15v3M6 10h3M19 10h3"/><path class="stat-icon-detail" d="M3 20h8M5 17h5"/></svg>`,
  vision_range: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.8 12s3.2-5 9.2-5 9.2 5 9.2 5-3.2 5-9.2 5-9.2-5-9.2-5Z"/><circle cx="12" cy="12" r="2.6"/><path class="stat-icon-detail" d="M12 4V2M19 6l1.4-1.4M5 6 3.6 4.6"/></svg>`,
  aimed_range: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4M22 12h-4M12 22v-4M2 12h4"/></svg>`,
  hip_fire_range: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5"/><path d="M12 3v3M21 12h-3M12 21v-3M3 12h3"/><path class="stat-icon-detail" d="M5.5 5.5 8 8M18.5 5.5 16 8M5.5 18.5 8 16M18.5 18.5 16 16"/></svg>`,
  reload_time: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8a7 7 0 1 0 .3 7"/><path d="M19 4v4h-4"/><path class="stat-icon-detail" d="M12 8v4l2.5 1.5"/></svg>`,
  magazine_size: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3.5h7.5l1.2 4.2v10.8a2 2 0 0 1-2 2H9.3a2 2 0 0 1-2-2V7.7Z"/><path class="stat-icon-detail" d="M9.5 7.5h5M9.5 11h5M9.5 14.5h5"/></svg>`,
  ammo_capacity_summary: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5.5c0-1.4 1.1-2.5 2.5-2.5S12 4.1 12 5.5V20H7Z"/><path d="M12 7.5c0-1.4 1.1-2.5 2.5-2.5S17 6.1 17 7.5V20h-5Z"/><path class="stat-icon-detail" d="M7 16h10"/></svg>`,
  effective_range_summary: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18 18 4"/><path d="M14 4h4v4"/><path class="stat-icon-detail" d="M5 7v4M3 9h4M13 19h6"/></svg>`,
  aiming_stability_summary: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/><path d="M12 2v4M22 12h-4M12 22v-4M2 12h4"/><path class="stat-icon-detail" d="m5.5 5.5 2 2M18.5 5.5l-2 2M5.5 18.5l2-2M18.5 18.5l-2-2"/></svg>`,
  firepower_summary: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.2 2.8c.8 3.4-2.4 4.7-2.4 7.2 0 1.5 1 2.5 2.4 2.5 2.2 0 3.7-2.2 3.2-5.1 2.5 2.1 4.1 4.8 3.5 7.7-.7 3.5-3.8 6-7.8 6-4.5 0-8-3-8-7.2 0-3.1 1.8-5.8 5.2-8.2-.2 2 .2 3.2 1.1 3.2 1.4 0 1.5-3.6 2.8-6.1Z"/></svg>`,
  armor_break_summary: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2 19 6v5.4c0 4.4-2.6 7.5-7 9.4-4.4-1.9-7-5-7-9.4V6Z"/><path d="m12 6-1.2 4 2.4 1.5-2.1 2.3 1 3.2"/></svg>`,
  fire_rate_summary: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h8l2.5 2H20v4h-5.5L12 16H4Z"/><path class="stat-icon-detail" d="M8 16v3M16 6V3M19 7l2-2M5 5 3 2"/></svg>`,
  health_damage_multiplier: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.2 4.7 13.1A5.1 5.1 0 0 1 11.8 6l.2.3.2-.3a5.1 5.1 0 0 1 7.1 7.1Z"/><path d="m13 7-2 5h3l-2 5"/></svg>`,
  armor_drone_multiplier: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 18 7v7l-6 3.5L6 14V7Z"/><path d="M3 7h3M18 7h3M3 15h3M18 15h3"/><circle class="stat-icon-detail" cx="12" cy="10.5" r="2"/></svg>`
};

const CATEGORY_ICONS = {
  ofensiva: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4M22 12h-4M12 22v-4M2 12h4"/></svg>`,
  defesa: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2 19 6v5.4c0 4.4-2.6 7.5-7 9.4-4.4-1.9-7-5-7-9.4V6Z"/></svg>`,
  mobilidade: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13.8 2.8-7 10h5l-1.5 8.4 7.1-10.5h-5.1Z"/></svg>`,
  utilidade: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="7"/></svg>`
};

const ARROW_UP = `<span class="trend-arrow trend-up" aria-label="Valor maior" title="Valor maior"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 16V5"/><path d="m5.5 9.5 4.5-4.5 4.5 4.5"/></svg></span>`;
const ARROW_DOWN = `<span class="trend-arrow trend-down" aria-label="Valor menor" title="Valor menor"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v11"/><path d="m5.5 10.5 4.5 4.5 4.5-4.5"/></svg></span>`;

function ensureTrendStyles() {
  if (document.getElementById('echo-trend-arrow-styles')) return;
  const style = document.createElement('style');
  style.id = 'echo-trend-arrow-styles';
  style.textContent = `.stat-value .trend-arrow{width:22px;height:22px;display:inline-grid;place-items:center;margin-right:7px;border-radius:7px;vertical-align:middle;transform:translateY(-1px);border:1px solid currentColor;background:color-mix(in srgb,currentColor 9%,transparent);box-shadow:0 0 14px color-mix(in srgb,currentColor 13%,transparent)}.stat-value .trend-arrow svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.stat-value .trend-up{color:#45e7a4}.stat-value .trend-down{color:#ff687c}.stat-value>strong{display:inline-flex;align-items:center}@media(max-width:760px){.stat-value .trend-arrow{width:20px;height:20px;margin-right:5px}.stat-value .trend-arrow svg{width:13px;height:13px}}`;
  document.head.appendChild(style);
}

function setArrow(valueCell, direction) {
  if (!valueCell) return;
  const strong = valueCell.querySelector(':scope > strong');
  if (!strong) return;
  const current = strong.querySelector('.trend-arrow');
  if (!direction) { current?.remove(); return; }
  if (current?.dataset.direction === direction) return;
  current?.remove();
  strong.insertAdjacentHTML('afterbegin', direction === 'up' ? ARROW_UP : ARROW_DOWN);
  strong.querySelector('.trend-arrow')?.setAttribute('data-direction', direction);
}

function enhanceTrend(row) {
  const left = row.querySelector('.stat-value.left');
  const right = row.querySelector('.stat-value.right');
  const delta = row.querySelector('.delta-badge > strong')?.textContent?.trim() || '';
  if (delta.startsWith('+')) { setArrow(right, 'up'); setArrow(left, 'down'); }
  else if (delta.startsWith('-') || delta.startsWith('−')) { setArrow(left, 'up'); setArrow(right, 'down'); }
  else { setArrow(left, null); setArrow(right, null); }
}

function enhanceRow(row) {
  if (!(row instanceof HTMLElement)) return;
  const key = row.dataset.stat;
  if (!key) return;
  const icon = row.querySelector('.stat-category-icon');
  if (icon) {
    const category = [...icon.classList].find(name => CATEGORY_ICONS[name]);
    const svg = ICONS[key] || CATEGORY_ICONS[category];
    if (svg && icon.dataset.visualIcon !== key) { icon.innerHTML = svg; icon.dataset.visualIcon = key; }
  }
  row.closest('.stat-row-wrap')?.style.setProperty('--stat-row-accent', getComputedStyle(row).getPropertyValue('--stat-row-accent'));
  enhanceTrend(row);
}

function enhanceAll() {
  ensureTrendStyles();
  document.querySelectorAll('#stats-rows .stat-row[data-stat]').forEach(enhanceRow);
}

const rows = document.getElementById('stats-rows');
if (rows) new MutationObserver(() => requestAnimationFrame(enhanceAll)).observe(rows, { childList: true });
enhanceAll();
