const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_SOURCE_HOSTS = new Set([
  'zepto.helpshift.com',
  'zeptolab.com',
  'www.zeptolab.com',
  'bullet-echo.fandom.com',
  'gamingonphone.com',
  'www.gamingonphone.com',
  'reddit.com',
  'www.reddit.com',
  'vk.com',
  'm.vk.com',
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
]);
const FREE_TRANSLATION_ENDPOINT = 'https://api.mymemory.translated.net/get';
const FREE_TRANSLATION_CHUNK_SIZE = 420;
const MAX_HERO_NAME = 80;
const OFFICIAL_HELP_CENTER = 'https://zepto.helpshift.com/hc/en/10-bullet-echo/';
const OFFICIAL_GAMEPLAY_SECTION = `${OFFICIAL_HELP_CENTER}section/82-gameplay/`;
// Helpshift uses numeric FAQ slugs (for example `1466-ramsay`) and publishes
// most hero links from section pages rather than the help-center index. Keep
// the crawl bounded, but large enough for the complete current roster.
const MAX_OFFICIAL_ARTICLES = 96;
const MAX_OFFICIAL_SECTIONS = 16;

// A few current hero pages use numeric FAQ IDs, so their human-readable slug
// cannot be derived from the hero name. These are only fast paths: discovery
// below still crawls the official Help Center and remains the route for new
// heroes. The values are public ZeptoLab URLs, never user-provided URLs.
const OFFICIAL_HERO_ARTICLE_URLS: Record<string, string[]> = {
  alice: [`${OFFICIAL_HELP_CENTER}faq/1445-alice/`],
  flynt: [`${OFFICIAL_HELP_CENTER}faq/1565-july-2026-new-season-new-hero/`],
  molly: [`${OFFICIAL_HELP_CENTER}faq/1504-meet-molly/`],
  ramsay: [`${OFFICIAL_HELP_CENTER}faq/1466-ramsay/`],
  shenji: [`${OFFICIAL_HELP_CENTER}faq/1403-shenji/`],
  tess: [`${OFFICIAL_HELP_CENTER}faq/1363-tess/`],
};

// Recent official update pages are useful when a newly released hero is
// announced before the Help Center navigation has been rebuilt. Keep this
// list short and bounded; every page is still checked against the requested
// hero name before any content is accepted.
const OFFICIAL_UPDATE_ARTICLE_URLS = [
  `${OFFICIAL_HELP_CENTER}faq/1565-july-2026-new-season-new-hero/`,
  `${OFFICIAL_HELP_CENTER}faq/1556-bullet-echo-march-2026-update/`,
  `${OFFICIAL_HELP_CENTER}faq/1548-new-season-hero-map-and-balance-changes/`,
  `${OFFICIAL_HELP_CENTER}faq/1537-drones-rework-twinkle-nerf/`,
];

type Json = Record<string, unknown>;

const RAMSAY_FANPAGE_URL = 'https://gamingonphone.com/guides/bullet-echo-heroes-tier-list-guide-tips/';
const RAMSAY_MARCH_UPDATE_URL = `${OFFICIAL_HELP_CENTER}faq/1556-bullet-echo-march-2026-update/`;
const SHENJI_COMMUNITY_URL = 'https://www.reddit.com/r/BulletEchoGame/comments/11wqili/new_hero_shenji_too_good_or_really_bad_my_and/';

// Some official hero pages publish the signature ability but omit the three
// remaining skill cards. This bounded profile only supplies facts that are
// visible in the cited fanpage (names and unlock levels). Missing mechanics
// stay explicitly unfilled instead of being inferred.
const COMMUNITY_HERO_PROFILES: Record<string, Json> = {
  shenji: {
    canonicalHeroName: 'SHENJI',
    canonicalClass: 'Emboscadores',
    source: {
      url: SHENJI_COMMUNITY_URL,
      title: 'Discussão comunitária — habilidades de SHENJI',
      sourceUpdatedAt: '2023-03-21',
    },
    skills: [
      {
        name: 'Caçador de Fogo', slug: 'fire-hunter', displayOrder: 0, unlockLevel: 7,
        skillType: 'Ativa',
        description: 'SHENJI lança o Caçador de Fogo, um dispositivo que cria uma Zona de Ignição após algum tempo ou ao tocar outro herói. A zona cresce, aumenta o dano principal a cada segundo, causa dano adicional à armadura e reduz a velocidade de quem permanece dentro dela.',
      },
      {
        name: 'Kit de Batalha', slug: 'battle-kit', displayOrder: 1, unlockLevel: 5,
        skillType: 'Ativa de recuperação',
        description: 'A fonte comunitária confirma Kit de Batalha entre as quatro habilidades de SHENJI. Os valores e a mecânica detalhada permanecem pendentes de validação no jogo.',
      },
      {
        name: 'Ignição', slug: 'ignition', displayOrder: 2, unlockLevel: 3,
        skillType: 'Passiva',
        description: 'Os disparos incendiários deixam quatro linhas de fogo no chão. O dano se acumula conforme o herói permanece sobre elas; a fonte oficial também confirma um modificador de dano contra armadura.',
      },
      {
        name: 'Fúria Ardente', slug: 'burning-fury', displayOrder: 3, unlockLevel: 1,
        skillType: 'Talento de equipe',
        description: 'A fonte comunitária confirma Fúria Ardente entre as quatro habilidades de SHENJI. A mecânica e os valores detalhados não foram publicados nas fontes consultadas e continuam pendentes de validação no jogo.',
      },
    ],
  },
  ramsay: {
    canonicalHeroName: 'Ramsay',
    canonicalClass: 'Tanques',
    source: {
      url: RAMSAY_FANPAGE_URL,
      title: 'Bullet Echo Heroes Tier List — Ramsay skills',
      sourceUpdatedAt: '2024-04-16',
    },
    skills: [
      {
        name: 'Investida Furiosa', slug: 'rampage', displayOrder: 0, unlockLevel: 7,
        skillType: 'Ativa',
        description: 'Ramsay entra em fúria e avança protegido por uma barreira de energia. Ao colidir, empurra e atordoa o oponente; a descrição oficial atual também informa aumento de 80% na velocidade de movimento.',
        additionalEvidence: [{
          url: RAMSAY_MARCH_UPDATE_URL,
          title: 'Bullet Echo March 2026 Update — Ramsay',
          coverage: 'patch_override',
          sourceUpdatedAt: null,
        }],
      },
      {
        name: 'Kit de Batalha', slug: 'battle-kit', displayOrder: 1, unlockLevel: 5,
        skillType: 'Ativa de recuperação',
        description: 'A fonte comunitária confirma Kit de Batalha entre as quatro habilidades de Ramsay e seu nível de desbloqueio. Os valores e a mecânica detalhada não foram publicados nessa fonte e permanecem sem estimativa, aguardando validação no jogo.',
      },
      {
        name: 'Incombustível', slug: 'incombustible', displayOrder: 2, unlockLevel: 3,
        skillType: 'Passiva',
        description: 'A fonte comunitária confirma Incombustível entre as quatro habilidades de Ramsay e seu nível de desbloqueio. A mecânica detalhada não foi publicada nessa fonte e permanece sem estimativa, aguardando validação no jogo.',
      },
      {
        name: 'Força Bruta', slug: 'brute-force', displayOrder: 3, unlockLevel: 1,
        skillType: 'Talento de equipe',
        description: 'A fonte comunitária confirma Força Bruta entre as quatro habilidades de Ramsay e seu nível de desbloqueio. A mecânica detalhada não foi publicada nessa fonte e permanece sem estimativa, aguardando validação no jogo.',
      },
    ],
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Configuração ausente no servidor: ${name}`);
  return value;
}

function asObject(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
}

function asArray(value: unknown): Json[] {
  return Array.isArray(value)
    ? value.filter((item): item is Json => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function cleanText(value: unknown, maximum = 5000) {
  return String(value ?? '').trim().slice(0, maximum);
}

function slugify(value: unknown) {
  return cleanText(value, 120)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeUrl(value: unknown) {
  try {
    const url = new URL(String(value || ''));
    url.hash = '';
    url.search = '';
    return `${url.protocol}//${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, '')}`;
  } catch {
    return '';
  }
}

function allowedUrl(value: unknown) {
  try {
    const url = new URL(String(value || ''));
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && (
      ALLOWED_SOURCE_HOSTS.has(host) || host.endsWith('.zeptolab.com')
    );
  } catch {
    return false;
  }
}

async function isAdmin(authHeader: string) {
  const response = await fetch(`${env('SUPABASE_URL')}/rest/v1/rpc/current_user_is_admin`, {
    method: 'POST',
    headers: {
      apikey: env('SUPABASE_ANON_KEY'),
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!response.ok) return false;
  return (await response.json().catch(() => false)) === true;
}

function compactRecoveryTemplate(value: unknown) {
  const source = asObject(value);
  const name = cleanText(source.name, 120);
  const description = cleanText(source.description);
  const skillType = cleanText(source.skillType, 80);
  if (!name || !description || !skillType || Number(source.displayOrder) !== 1) return null;
  return {
    name,
    slug: slugify(source.slug || name),
    description,
    skillType,
    cooldown: typeof source.cooldown === 'number' ? source.cooldown : null,
    duration: typeof source.duration === 'number' ? source.duration : null,
    energyCost: Number.isInteger(source.energyCost) ? source.energyCost : null,
    unlockLevel: Number.isInteger(source.unlockLevel) ? source.unlockLevel : null,
    maxLevel: Number.isInteger(source.maxLevel) ? source.maxLevel : null,
    displayOrder: 1,
  };
}

function decodeHtml(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function htmlToLines(value: string) {
  return decodeHtml(String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/?(?:h[1-6]|p|li|br|div|section|article|tr|td|th)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function decodeEmbeddedHtml(value: unknown) {
  // Some Help Center responses embed navigation in escaped JSON rather than
  // plain anchor tags. Normalize those two encodings before looking for URLs.
  return decodeHtml(String(value || '')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"'));
}

function officialLinks(html: string, kind: 'faq' | 'section') {
  const links = new Set<string>();
  const source = decodeEmbeddedHtml(html);
  const pathPattern = kind === 'faq'
    ? /^\/hc\/en\/10-bullet-echo\/faq\//i
    : /^\/hc\/en\/10-bullet-echo\/section\//i;

  // Normal HTML attributes, plus data attributes used by some Help Center
  // themes. The second pass below handles absolute URLs embedded in JSON.
  for (const match of source.matchAll(/(?:href|data-href|data-url|data-link)\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const url = new URL(match[1], OFFICIAL_HELP_CENTER);
      if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'zepto.helpshift.com') continue;
      if (!pathPattern.test(url.pathname)) continue;
      url.hash = '';
      url.search = '';
      links.add(url.toString());
    } catch {
      // Ignore malformed links from the public index.
    }
  }

  for (const match of source.matchAll(/https:\/\/zepto\.helpshift\.com\/hc\/en\/10-bullet-echo\/(?:faq|section)\/[^\s"'<>\\]+/gi)) {
    try {
      const url = new URL(match[0].replace(/[),.;]+$/g, ''));
      if (!pathPattern.test(url.pathname)) continue;
      url.hash = '';
      url.search = '';
      links.add(url.toString());
    } catch {
      // Ignore malformed embedded URLs.
    }
  }
  return [...links];
}

function officialArticleLinks(html: string) {
  return officialLinks(html, 'faq').slice(0, MAX_OFFICIAL_ARTICLES);
}

function officialSectionLinks(html: string) {
  return officialLinks(html, 'section').slice(0, MAX_OFFICIAL_SECTIONS);
}

function officialSearchUrls(heroName: string) {
  const query = encodeURIComponent(cleanText(heroName, MAX_HERO_NAME));
  // Helpshift has served both slash and no-slash variants over time. A failed
  // variant is harmless; the successful one exposes the canonical numeric FAQ
  // URL in its links, so future heroes do not require a hard-coded map.
  return [
    `${OFFICIAL_HELP_CENTER}search/?q=${query}`,
    `${OFFICIAL_HELP_CENTER}search?q=${query}`,
    `${OFFICIAL_HELP_CENTER}search/?query=${query}`,
    `${OFFICIAL_HELP_CENTER}search?query=${query}`,
  ];
}

function splitTranslationChunks(value: string) {
  const text = cleanText(value);
  if (!text) return [];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > FREE_TRANSLATION_CHUNK_SIZE) {
    const window = remaining.slice(0, FREE_TRANSLATION_CHUNK_SIZE + 1);
    const boundary = Math.max(window.lastIndexOf('. '), window.lastIndexOf('; '), window.lastIndexOf(', '), window.lastIndexOf(' '));
    const cut = boundary >= Math.floor(FREE_TRANSLATION_CHUNK_SIZE * 0.6) ? boundary + 1 : FREE_TRANSLATION_CHUNK_SIZE;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function alreadyPortuguese(value: string) {
  const text = ` ${comparable(value)} `;
  const markers = [' habilidade ', ' habilidades ', ' dano ', ' heroi ', ' armadura ', ' inimigo ', ' equipe ', ' recarga ', ' velocidade ', ' fonte ', ' validacao '];
  return markers.filter(marker => text.includes(marker)).length >= 2;
}

async function translateChunkToPortuguese(value: string) {
  const url = new URL(FREE_TRANSLATION_ENDPOINT);
  url.searchParams.set('q', value);
  url.searchParams.set('langpair', 'en|pt-BR');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Tradução gratuita indisponível (HTTP ${response.status}).`);
    const payload = asObject(await response.json());
    const responseData = asObject(payload.responseData);
    const translated = decodeHtml(cleanText(responseData.translatedText));
    if (!translated) throw new Error('A tradução gratuita retornou um texto vazio.');
    return translated;
  } finally {
    clearTimeout(timeout);
  }
}

async function translateTextToPortuguese(value: unknown) {
  const text = cleanText(value);
  if (!text || alreadyPortuguese(text)) return text;
  const translated = await Promise.all(splitTranslationChunks(text).map(translateChunkToPortuguese));
  return translated.join(' ').replace(/\s+/g, ' ').trim();
}

async function translateOfficialResearchToPortuguese(officialResearch: Json) {
  const officialResult = asObject(officialResearch.result);
  const officialSkills = asArray(officialResult.skills);
  const translatedSkills = await Promise.all(officialSkills.map(async skill => {
    const canonicalTemplate = skill.origin === 'canonical_template';
    return {
      ...skill,
      name: canonicalTemplate ? cleanText(skill.name, 120) : await translateTextToPortuguese(skill.name),
      description: canonicalTemplate ? cleanText(skill.description) : await translateTextToPortuguese(skill.description),
    };
  }));
  return {
    ...officialResearch,
    result: {
      ...officialResult,
      canonicalClass: classComparable(officialResult.canonicalClass),
      skills: translatedSkills,
      warnings: [
        ...((Array.isArray(officialResult.warnings) ? officialResult.warnings : []).map(item => cleanText(item, 500)).filter(Boolean)),
        'Textos estrangeiros foram traduzidos para português por um serviço gratuito, sem chave ou API paga; revise os termos do jogo antes de verificar.',
      ],
    },
  };
}

async function fetchText(url: string, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      // Helpshift may challenge opaque/custom user agents. Use a normal
      // browser profile so the Edge Function receives the same public HTML
      // that an administrator sees when opening the official page.
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        Referer: OFFICIAL_HELP_CENTER,
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
      },
    });
    if (!response.ok) return '';
    return await response.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

function officialSkillHeading(line: string) {
  // Official articles are not perfectly uniform: older pages use
  // `Ability - Name`, while newer announcements use Markdown-like headings
  // with icons, for example `### ⛏️ Ability: Burrow ⛏️`. Strip presentation
  // markers before matching, but keep the published skill title intact.
  const normalized = cleanText(line, 500)
    .replace(/^#+\s*/, '')
    .replace(/^[^\p{L}\p{N}]*(?=(?:Ability|Ultimate|Active Ability|Personal Talent|Personal Ability|Passive Talent|Passive Ability|Team Talent)\b)/iu, '');
  const match = normalized.match(/^(Ability|Ultimate|Active Ability|Personal Talent|Personal Ability|Passive Talent|Passive Ability|Team Talent)\s*(?:[—–-]|:)\s*(.+?)\s*$/iu);
  if (!match) return null;
  const title = match[2].replace(/[^\p{L}\p{N}\s'’().,!+&-]+$/gu, '').trim();
  return title ? [match[0], match[1], title] : null;
}

function legacySkillTitle(line: string) {
  const title = cleanText(line, 120)
    .replace(/^#+\s*/, '')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N})\]!?,.&+'’\-]+$/gu, '')
    .replace(/^[—–-]+|[—–-]+$/g, '')
    .trim();
  if (!title || title.length < 2 || title.length > 80) return '';
  if (/[.!?:;]/.test(title) || title.split(/\s+/).length > 7) return '';
  if (/^(?:class|faction|fraction|weapon|abilities|talents|shooting|additional facts|how to play|about|privacy|terms|careers|watch the|read the)\b/i.test(title)) return '';
  return title;
}

function legacyOfficialSkillSections(lines: string[]) {
  const sections: Array<{ heading: string; title: string; description: string }> = [];
  let group: 'abilities' | 'talents' | null = null;
  let pending: { heading: string; title: string; descriptionLines: string[] } | null = null;

  const flush = () => {
    if (!pending) return;
    const description = pending.descriptionLines.join(' ').trim().slice(0, 5000);
    if (description) sections.push({ heading: pending.heading, title: pending.title, description });
    pending = null;
  };

  for (const line of lines) {
    if (/^#+\s*(?:abilities)\s*:/i.test(line) || /^abilities\s*:/i.test(line)) {
      flush();
      group = 'abilities';
      continue;
    }
    if (/^#+\s*(?:talents)\s*:/i.test(line) || /^talents\s*:/i.test(line)) {
      flush();
      group = 'talents';
      continue;
    }
    if (/^(?:how to play|additional facts|watch the|read the|about|privacy|terms|careers)\b/i.test(line)) {
      flush();
      group = null;
      continue;
    }
    if (!group) continue;

    const title = legacySkillTitle(line);
    if (title) {
      flush();
      pending = {
        heading: group === 'abilities' ? 'Ability' : 'Personal Talent',
        title,
        descriptionLines: [],
      };
      continue;
    }
    if (pending) pending.descriptionLines.push(line);
  }
  flush();

  // Legacy pages call every talent a “Talent”; the first talent is the
  // personal section and the second is the team section. The caller maps
  // these headings to the panel's display orders.
  let abilityIndex = 0;
  let talentIndex = 0;
  return sections.map(section => {
    if (section.heading === 'Ability') {
      abilityIndex += 1;
      return {
        ...section,
        heading: abilityIndex > 2 ? 'Team Talent' : abilityIndex > 1 ? 'Personal Talent' : 'Ability',
      };
    }
    if (section.heading !== 'Personal Talent') return section;
    talentIndex += 1;
    return { ...section, heading: talentIndex > 1 ? 'Team Talent' : 'Personal Talent' };
  });
}

function officialSkillSectionCount(lines: string[]) {
  const explicit = lines.filter(line => officialSkillHeading(line)).length;
  return explicit || legacyOfficialSkillSections(lines).length;
}

function isRecoverySection(title: string, description: string, recoveryTemplate: ReturnType<typeof compactRecoveryTemplate>) {
  if (!recoveryTemplate) return false;
  const titleKey = comparable(title);
  const templateKey = comparable(recoveryTemplate.name);
  return Boolean(titleKey && templateKey && (
    titleKey === templateKey || titleKey.includes(templateKey) || templateKey.includes(titleKey)
  ));
}

function parseOfficialHeroArticle(url: string, html: string, heroName: string, className: string | null, recoveryTemplate: ReturnType<typeof compactRecoveryTemplate>) {
  const lines = htmlToLines(html);
  const heroKey = comparable(heroName);
  const heroMention = lines.find(line => containsComparable(line, heroKey));
  const canonicalHeroName = (lines.find(line => /(?:new hero|hero)\s*[—–:-]/i.test(line) && containsComparable(line, heroKey)) || heroMention || heroName)
    .replace(/^(?:new hero|hero)\s*[—–:-]\s*/i, '')
    .replace(/[.!]+$/, '')
    .trim()
    .slice(0, 120) || heroName;
  const classMatch = lines.find(line => /^(?:hero\s+)?class\s*[:—–-]/i.test(line));
  const canonicalClass = classMatch
    ? classMatch.replace(/^(?:hero\s+)?class\s*[:—–-]\s*/i, '').trim().split(/\s+(?:faction|weapon)\s*[:—–-]/i)[0].trim().slice(0, 120)
    : className;
  const sections: Array<{ heading: string; title: string; description: string }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const heading = officialSkillHeading(lines[index]);
    if (!heading) continue;
    const descriptionLines: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (officialSkillHeading(lines[cursor])) break;
      if (/^(?:class|faction|weapon|watch the|read the|about|privacy|terms|careers)\b/i.test(lines[cursor])) break;
      descriptionLines.push(lines[cursor]);
      if (descriptionLines.join(' ').length >= 5000) break;
    }
    const description = descriptionLines.join(' ').trim().slice(0, 5000);
    if (description) sections.push({ heading: heading[1], title: heading[2].trim().slice(0, 120), description });
  }
  if (!sections.length) sections.push(...legacyOfficialSkillSections(lines));
  const skills: Json[] = [];
  const seenOrders = new Set<number>();
  const warnings: string[] = [];
  const source = { url, title: 'Central de Ajuda oficial da ZeptoLab' };
  for (const section of sections) {
    const heading = section.heading.toLowerCase();
    let displayOrder = heading.includes('personal') || heading.includes('passive') ? 2 : heading.includes('team') ? 3 : 0;
    let skillType = heading.includes('personal') || heading.includes('passive') ? 'Passiva' : heading.includes('team') ? 'Talento de equipe' : 'Ativa';
    if (heading.includes('team') && isRecoverySection(section.title, section.description, recoveryTemplate)) {
      displayOrder = 1;
      skillType = recoveryTemplate?.skillType || 'Ativa de recuperação';
      if (recoveryTemplate && !seenOrders.has(1)) {
        skills.push({ ...recoveryTemplate, origin: 'canonical_template', confidence: 1, evidence: [], warnings: [] });
        seenOrders.add(1);
      }
      continue;
    }
    if (seenOrders.has(displayOrder)) continue;
    skills.push({
      name: section.title,
      slug: slugify(section.title),
      description: section.description,
      skillType,
      cooldown: null,
      duration: null,
      energyCost: null,
      unlockLevel: null,
      maxLevel: null,
      displayOrder,
      origin: 'online_research',
      confidence: 0.78,
      evidence: [{ ...source, coverage: 'structure' }],
      warnings: ['Valores numéricos não publicados nesta fonte foram mantidos vazios.'],
    });
    seenOrders.add(displayOrder);
  }
  const classMatches = Boolean(recoveryTemplate && classesMatch(canonicalClass, className));
  if (recoveryTemplate && !seenOrders.has(1) && classMatches) {
    skills.push({ ...recoveryTemplate, origin: 'canonical_template', confidence: 1, evidence: [], warnings: [] });
    seenOrders.add(1);
  }
  if (!recoveryTemplate) warnings.push('Não foi encontrado um modelo canônico de recuperação para esta classe; nenhuma habilidade foi inventada.');
  if (skills.filter(skill => skill.origin === 'online_research').length < 2) warnings.push('A fonte oficial trouxe poucas seções de habilidade; revise antes de salvar.');
  skills.sort((a, b) => Number(a.displayOrder) - Number(b.displayOrder));
  return {
    result: {
      heroMatch: heroMention ? 'exact' : 'probable',
      canonicalHeroName,
      canonicalClass: canonicalClass || className,
      skills: skills.slice(0, 4),
      confidence: skills.length >= 3 ? 0.78 : 0.55,
      warnings,
    },
    consultedSources: [source],
    searchedAt: new Date().toISOString(),
  };
}

async function researchOfficialSources(input: Json) {
  const heroName = cleanText(input.heroName, MAX_HERO_NAME);
  const className = cleanText(input.className, 80) || null;
  const recoveryTemplate = compactRecoveryTemplate(input.recoveryTemplate);
  const directUrls = [
    ...(OFFICIAL_HERO_ARTICLE_URLS[slugify(heroName)] || []),
    `${OFFICIAL_HELP_CENTER}faq/${slugify(heroName)}/`,
  ];
  for (const directUrl of [...new Set(directUrls)]) {
    const directHtml = await fetchText(directUrl, 8_000);
    const directLines = htmlToLines(directHtml);
    if (directHtml && containsComparable(directLines.join(' '), heroName) && officialSkillSectionCount(directLines) >= 1) {
      const directResearch = parseOfficialHeroArticle(directUrl, directHtml, heroName, className, recoveryTemplate);
      if (asArray(asObject(directResearch.result).skills).length > 0) return directResearch;
    }
  }

  const indexHtml = await fetchText(OFFICIAL_HELP_CENTER, 12_000);
  if (!indexHtml) throw new Error('A Central de Ajuda oficial não respondeu à pesquisa.');
  const listingUrls = [
    // Keep one stable official section as a discovery anchor even if the
    // help-center index changes its navigation markup. Hero links are still
    // extracted dynamically from that section; no hero ID is hard-coded.
    OFFICIAL_GAMEPLAY_SECTION,
    ...OFFICIAL_UPDATE_ARTICLE_URLS,
    ...officialSectionLinks(indexHtml),
    ...officialSearchUrls(heroName),
  ];
  const listingPages = await Promise.all(listingUrls.map(async url => ({
    url,
    html: await fetchText(url, 8_000),
  })));
  const heroKey = comparable(heroName);
  // Put the section/search page that actually mentions the requested hero
  // first. This prevents a long, unrelated section (for example news) from
  // consuming the article budget before the Gameplay page is inspected.
  listingPages.sort((left, right) => {
    const leftScore = containsComparable(left.html, heroKey) ? 1 : 0;
    const rightScore = containsComparable(right.html, heroKey) ? 1 : 0;
    return rightScore - leftScore;
  });
  const urls = [...new Set([
    ...(OFFICIAL_HERO_ARTICLE_URLS[slugify(heroName)] || []),
    ...OFFICIAL_UPDATE_ARTICLE_URLS,
    ...listingPages.flatMap(page => officialArticleLinks(page.html)),
    ...officialArticleLinks(indexHtml),
  ])].slice(0, MAX_OFFICIAL_ARTICLES);
  const candidates: Array<{ url: string; html: string; score: number }> = [];
  for (let index = 0; index < urls.length; index += 6) {
    const batch = await Promise.all(urls.slice(index, index + 6).map(async url => {
      const html = await fetchText(url, 8_000);
      if (!html) return null;
      const lines = htmlToLines(html);
      const key = comparable(heroName);
      const skillCount = officialSkillSectionCount(lines);
      const score = (lines.some(line => containsComparable(line, key)) ? 3 : 0)
        + (skillCount >= 1 ? 2 : 0)
        + (skillCount >= 2 ? 2 : 0)
        + (lines.some(line => /(?:new hero|hero)\s*[—–:-]/i.test(line) && containsComparable(line, key)) ? 3 : 0);
      return score >= 5 ? { url, html, score } : null;
    }));
    candidates.push(...batch.filter(Boolean) as Array<{ url: string; html: string; score: number }>);
    if (candidates.length) break;
  }
  const selected = candidates.sort((a, b) => b.score - a.score)[0];
  if (!selected) throw new Error('Não encontrei uma correspondência segura nas fontes oficiais permitidas.');
  return parseOfficialHeroArticle(selected.url, selected.html, heroName, className, recoveryTemplate);
}

function enrichWithCommunityProfile(officialResearch: Json, heroSlug: string) {
  const profile = asObject(COMMUNITY_HERO_PROFILES[heroSlug]);
  const profileSkills = asArray(profile.skills);
  const communitySource = asObject(profile.source);
  if (!profileSkills.length || !allowedUrl(communitySource.url)) return null;

  // a idade da fonte nunca é motivo para descartá-la: ela continua útil para
  // corroborar nomes e ordem, mas o resultado fica explicitamente pendente de
  // validação quando os detalhes atuais não foram republicados.
  const communitySourceDate = cleanText(communitySource.sourceUpdatedAt, 20);
  const communitySourceTimestamp = /^\d{4}-\d{2}-\d{2}$/.test(communitySourceDate)
    ? Date.parse(`${communitySourceDate}T00:00:00Z`)
    : Number.NaN;
  const historicalCommunitySource = Number.isFinite(communitySourceTimestamp)
    && Date.now() - communitySourceTimestamp > 365 * 24 * 60 * 60 * 1000;

  const officialResult = asObject(officialResearch.result);
  const officialBySlug = new Map(asArray(officialResult.skills).map(skill => [slugify(skill.slug || skill.name), skill]));
  const checkedAt = new Date().toISOString();
  const skills = profileSkills.map(profileSkill => {
    const key = slugify(profileSkill.slug || profileSkill.name);
    const official = officialBySlug.get(key);
    const evidence = [
      ...asArray(official?.evidence),
      {
        url: communitySource.url,
        title: cleanText(communitySource.title, 300) || String(communitySource.url),
        coverage: 'structure',
        sourceUpdatedAt: cleanText(communitySource.sourceUpdatedAt, 20) || null,
      },
      ...asArray(profileSkill.additionalEvidence),
    ];
    const uniqueEvidence = new Map<string, Json>();
    for (const item of evidence) {
      const key = `${normalizeUrl(item.url)}|${cleanText(item.coverage, 40)}`;
      if (key.startsWith('|') || !allowedUrl(item.url)) continue;
      uniqueEvidence.set(key, item);
    }
    const hasOfficialDescription = Boolean(cleanText(official?.description));
    return {
      name: cleanText(profileSkill.name || official?.name, 120),
      slug: key,
      description: cleanText(profileSkill.description || official?.description),
      skillType: cleanText(profileSkill.skillType || official?.skillType, 80) || 'Não informado',
      cooldown: typeof official?.cooldown === 'number' ? official.cooldown : null,
      duration: typeof official?.duration === 'number' ? official.duration : null,
      energyCost: Number.isInteger(official?.energyCost) ? official?.energyCost : null,
      unlockLevel: Number.isInteger(profileSkill.unlockLevel) ? profileSkill.unlockLevel : null,
      maxLevel: Number.isInteger(official?.maxLevel) ? official?.maxLevel : null,
      displayOrder: Number(profileSkill.displayOrder),
      origin: 'online_research',
      confidence: hasOfficialDescription ? 0.88 : 0.7,
      evidence: [...uniqueEvidence.values()],
      warnings: hasOfficialDescription
        ? ['Valores numéricos ausentes nas fontes foram mantidos vazios.']
        : ['A fonte comunitária confirma nome e desbloqueio, mas não publica a mecânica detalhada; revise no jogo antes de verificar.'],
    };
  }).sort((a, b) => a.displayOrder - b.displayOrder);

  const consulted = new Map<string, Json>();
  for (const item of [
    ...asArray(officialResearch.consultedSources),
    communitySource,
    ...profileSkills.flatMap(skill => asArray(skill.additionalEvidence)),
  ]) {
    const key = normalizeUrl(item.url);
    if (!key || !allowedUrl(item.url)) continue;
    consulted.set(key, item);
  }

  return {
    result: {
      ...officialResult,
      heroMatch: 'exact',
      canonicalHeroName: cleanText(officialResult.canonicalHeroName || profile.canonicalHeroName, 120) || null,
      canonicalClass: cleanText(profile.canonicalClass || officialResult.canonicalClass, 120) || null,
      skills,
      confidence: 0.76,
      warnings: [
        ...((Array.isArray(officialResult.warnings) ? officialResult.warnings : []).map(item => cleanText(item, 500)).filter(Boolean)),
        'Quatro nomes corroborados por fanpage; campos não publicados continuam vazios para revisão administrativa.',
        ...(historicalCommunitySource
          ? ['Fonte histórica preservada. Solicite validação da comunidade antes de considerar estes dados atuais.']
          : []),
      ],
    },
    consultedSources: [...consulted.values()],
    searchedAt: checkedAt,
  };
}

function comparable(value: unknown) {
  return cleanText(value, 120)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function containsComparable(text: unknown, needle: unknown) {
  const haystack = ` ${comparable(text)} `;
  const target = comparable(needle);
  return Boolean(target && haystack.includes(` ${target} `));
}

function classComparable(value: unknown) {
  const key = comparable(value);
  const aliases: Record<string, string> = {
    trooper: 'soldados', troopers: 'soldados', soldier: 'soldados', soldiers: 'soldados', soldado: 'soldados', soldados: 'soldados',
    scout: 'escoteiros', scouts: 'escoteiros', escoteiro: 'escoteiros', escoteiros: 'escoteiros',
    sniper: 'franco atirador', snipers: 'franco atirador', 'franco atirador': 'franco atirador',
    tank: 'tanques', tanks: 'tanques', tanque: 'tanques', tanques: 'tanques',
    ambusher: 'emboscadores', ambushers: 'emboscadores', emboscador: 'emboscadores', emboscadores: 'emboscadores',
    gunner: 'artilheiros', gunners: 'artilheiros', artilheiro: 'artilheiros', artilheiros: 'artilheiros',
  };
  return aliases[key] || key;
}

function classesMatch(left: unknown, right: unknown) {
  const a = classComparable(left);
  const b = classComparable(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function resolveCommunityHeroSlug(input: Json, heroName: string) {
  const candidates = [input.heroSlug, heroName].map(slugify).filter(Boolean);
  return candidates.find(candidate => Boolean(COMMUNITY_HERO_PROFILES[candidate])) || candidates[0] || '';
}

async function researchHeroSkills(input: Json) {
  const heroName = cleanText(input.heroName, MAX_HERO_NAME);
  const heroSlug = resolveCommunityHeroSlug(input, heroName);
  const className = cleanText(input.className, 80) || null;

  // O catálogo interno atende os heróis já aprovados. Esta função cobre, sem
  // APIs pagas, heróis novos que possuam um perfil pt-BR corroborado em fontes
  // públicas permitidas. Campos não publicados permanecem vazios e sinalizados
  // para validação administrativa/comunitária.
  let officialResearchError: unknown = null;
  try {
    const officialResearch = await researchOfficialSources(input);
    const officialResult = asObject(officialResearch.result);
    const enriched = enrichWithCommunityProfile(officialResearch as unknown as Json, heroSlug);
    if (enriched && asArray(asObject(enriched.result).skills).length === 4) {
      return { ...enriched, locale: 'pt-BR', researchMode: 'free_sources' };
    }
    const officialSkills = asArray(officialResult.skills);
    if (officialSkills.length === 4) {
      const translatedOfficial = await translateOfficialResearchToPortuguese(officialResearch as unknown as Json);
      return { ...translatedOfficial, locale: 'pt-BR', researchMode: 'free_sources' };
    }
    officialResearchError = String(officialResult.heroMatch) !== 'not_found'
      ? new Error('A fonte oficial foi localizada, mas não publicou as quatro habilidades completas; procurei também os perfis comunitários gratuitos permitidos.')
      : new Error('A pesquisa gratuita não encontrou as quatro habilidades em fontes públicas permitidas.');
  } catch (error) {
    const communityOnly = enrichWithCommunityProfile({
      result: {
        heroMatch: 'probable',
        canonicalHeroName: heroName,
        canonicalClass: className,
        skills: [],
        confidence: 0,
        warnings: [],
      },
      consultedSources: [],
    }, heroSlug);
    if (communityOnly && asArray(asObject(communityOnly.result).skills).length === 4) {
      return { ...communityOnly, locale: 'pt-BR', researchMode: 'free_sources' };
    }
    officialResearchError = error;
  }

  if (officialResearchError instanceof Error) throw officialResearchError;
  throw new Error('A pesquisa gratuita não encontrou dados utilizáveis para este herói.');
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Método não permitido' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!/^Bearer\s+\S+/i.test(authHeader)) return json({ ok: false, error: 'Sessão administrativa ausente' }, 401);
    if (!(await isAdmin(authHeader))) return json({ ok: false, error: 'Acesso administrativo necessário' }, 403);

    const body = asObject(await req.json());
    if (Number(body.schemaVersion) !== 1) return json({ ok: false, error: 'schemaVersion incompatível' }, 400);
    const heroName = cleanText(body.heroName, MAX_HERO_NAME);
    if (heroName.length < 2) return json({ ok: false, error: 'Informe o nome completo do herói.' }, 400);

    const research = await researchHeroSkills({
      heroName,
      heroSlug: body.heroSlug,
      className: body.className,
      recoveryTemplate: body.recoveryTemplate,
    });
    return json({ ok: true, schemaVersion: 1, ...research });
  } catch (error) {
    console.error('admin-hero-skills-research:', error);
    const message = error instanceof Error ? error.message : 'Falha inesperada na pesquisa de habilidades';
    const missingConfig = message.match(/Configuração ausente no servidor:\s*([A-Z0-9_]+)/i);
    const notFound = /correspondência segura|fontes oficiais permitidas|não respondeu à pesquisa/i.test(message);
    const timedOut = /abort|timeout|tempo/i.test(message);
    const status = missingConfig ? 503 : timedOut ? 504 : notFound ? 422 : 500;
    const code = missingConfig ? 'missing_server_configuration' : timedOut ? 'research_timeout' : notFound ? 'hero_not_found' : 'research_failed';
    return json({ ok: false, code, error: message, missingConfig: missingConfig?.[1] || null }, status);
  }
});
