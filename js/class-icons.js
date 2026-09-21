const CLASS_ICON_SYMBOLS = Object.freeze({
  swords: '⚔',
  radar: '◎',
  crosshair: '⊕',
  target: '◉',
  shield: '⬡'
});

export function classIconSymbol(value = '') {
  const raw = String(value || '').trim();
  const token = raw.toLowerCase();
  if (CLASS_ICON_SYMBOLS[token]) return CLASS_ICON_SYMBOLS[token];
  if (!raw) return '◆';
  if ([...raw].length <= 3) return raw;
  return '◆';
}

export function isKnownClassIcon(value = '') {
  return Boolean(CLASS_ICON_SYMBOLS[String(value || '').trim().toLowerCase()]);
}

export const classIconTokens = Object.freeze(Object.keys(CLASS_ICON_SYMBOLS));
