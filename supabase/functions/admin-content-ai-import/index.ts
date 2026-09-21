const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_IMAGES = 6;
const MAX_DATA_URL_CHARS = 2_800_000;
const MAX_TOTAL_CHARS = 12_000_000;
const ALLOWED_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

type Json = Record<string, unknown>;

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

function asArray(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter((item): item is Json => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : [];
}

function stringList(rows: Json[], key = 'slug') {
  return rows.map(row => String(row[key] ?? '').trim()).filter(Boolean).slice(0, 100);
}

async function isAdmin(authHeader: string) {
  const url = env('SUPABASE_URL');
  const anon = env('SUPABASE_ANON_KEY');
  const response = await fetch(`${url}/rest/v1/rpc/current_user_is_admin`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!response.ok) return false;
  const payload = await response.json().catch(() => false);
  return payload === true;
}

function nullableString() {
  return { type: ['string', 'null'] };
}
function nullableNumber() {
  return { type: ['number', 'null'] };
}
function nullableInteger() {
  return { type: ['integer', 'null'] };
}
function nullableEnum(values: string[]) {
  return { type: ['string', 'null'], enum: [...values, null] };
}

function equipmentSchema(context: Json) {
  const raritySlugs = stringList(asArray(context.rarities));
  const slotSlugs = stringList(asArray(context.slots));
  return {
    type: 'object',
    additionalProperties: false,
    required: ['equipment', 'variants', 'bonuses', 'confidence', 'warnings'],
    properties: {
      equipment: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'slug', 'slotSlug', 'setName', 'setMatch', 'description', 'recommendation', 'displayOrder'],
        properties: {
          name: nullableString(),
          slug: nullableString(),
          slotSlug: nullableEnum(slotSlugs),
          setName: nullableString(),
          setMatch: { type: 'string', enum: ['existing', 'unknown', 'none'] },
          description: nullableString(),
          recommendation: nullableString(),
          displayOrder: nullableInteger(),
        },
      },
      variants: {
        type: 'array',
        maxItems: 32,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['raritySlug', 'attributes'],
          properties: {
            raritySlug: { type: 'string', enum: raritySlugs.length ? raritySlugs : ['comum'] },
            attributes: {
              type: 'array',
              maxItems: 80,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['label', 'value', 'unit', 'raw', 'confidence'],
                properties: {
                  label: { type: 'string' },
                  value: nullableString(),
                  unit: nullableString(),
                  raw: nullableString(),
                  confidence: { type: 'number', minimum: 0, maximum: 1 },
                },
              },
            },
          },
        },
      },
      bonuses: {
        type: 'array',
        maxItems: 12,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['requiredPieces', 'title', 'description', 'displayOrder', 'effects'],
          properties: {
            requiredPieces: { type: 'integer', minimum: 1, maximum: 20 },
            title: { type: 'string' },
            description: { type: 'string' },
            displayOrder: { type: 'integer', minimum: 0, maximum: 100 },
            effects: {
              type: 'array',
              maxItems: 30,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['label', 'value', 'unit'],
                properties: {
                  label: { type: 'string' },
                  value: nullableString(),
                  unit: nullableString(),
                },
              },
            },
          },
        },
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      warnings: { type: 'array', maxItems: 30, items: { type: 'string' } },
    },
  };
}

const heroStatusProperties = {
  power: nullableNumber(), health: nullableNumber(), damage: nullableNumber(), armor: nullableNumber(),
  visionRange: nullableNumber(), movementNoiseRadius: nullableNumber(), maxMovementSpeed: nullableNumber(),
  aimedMovementSpeed: nullableNumber(), penetrationResistance: nullableNumber(), armorValue: nullableNumber(),
  armorResistance: nullableNumber(),
};
const weaponSummaryProperties = {
  name: nullableString(), firepower: nullableNumber(), armorBreak: nullableNumber(), fireRate: nullableNumber(),
  magazineCapacity: nullableNumber(), effectiveRange: nullableNumber(), aimingStability: nullableNumber(),
};
const weaponDetailProperties = {
  damagePerShot: nullableNumber(), healthDamageMultiplier: nullableNumber(), armorPenetration: nullableNumber(),
  penetrationPower: nullableNumber(), armorDroneMultiplier: nullableNumber(), shotsPerSecond: nullableNumber(),
  reloadTime: nullableNumber(), magazineSize: nullableNumber(), hipFireRange: nullableNumber(), aimedRange: nullableNumber(),
  dispersion: nullableNumber(), movingDispersion: nullableNumber(), aimedDispersion: nullableNumber(), aimTime: nullableNumber(),
  dispersionFactor: nullableNumber(),
};

function strictObject(properties: Record<string, unknown>) {
  return {
    type: 'object', additionalProperties: false, required: Object.keys(properties), properties,
  };
}

function heroSchema(context: Json) {
  const classSlugs = stringList(asArray(context.classes));
  const raritySlugs = stringList(asArray(context.rarities));
  return {
    type: 'object',
    additionalProperties: false,
    required: ['hero', 'status', 'weaponSummary', 'weaponDetails', 'confidence', 'warnings'],
    properties: {
      hero: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'className', 'classSlug', 'rarityName', 'raritySlug', 'faction', 'level', 'description'],
        properties: {
          name: nullableString(),
          className: nullableString(),
          classSlug: nullableEnum(classSlugs),
          rarityName: nullableString(),
          raritySlug: nullableEnum(raritySlugs),
          faction: nullableString(),
          level: nullableInteger(),
          description: nullableString(),
        },
      },
      status: strictObject(heroStatusProperties),
      weaponSummary: strictObject(weaponSummaryProperties),
      weaponDetails: strictObject(weaponDetailProperties),
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      warnings: { type: 'array', maxItems: 30, items: { type: 'string' } },
    },
  };
}

function compactContext(entityType: string, context: Json, identity: Json) {
  if (entityType === 'equipment') {
    return JSON.stringify({
      identity,
      slots: asArray(context.slots).map(x => ({ name: x.name, slug: x.slug })),
      rarities: asArray(context.rarities).map(x => ({ name: x.name, slug: x.slug })),
      sets: asArray(context.sets).map(x => ({ name: x.name, slug: x.slug })),
    });
  }
  return JSON.stringify({
    identity,
    classes: asArray(context.classes).map(x => ({ name: x.name, slug: x.slug })),
    rarities: asArray(context.rarities).map(x => ({ name: x.name, slug: x.slug })),
    stats: asArray(context.stats).map(x => ({ key: x.key, name: x.name, category: x.category, unit: x.unit })),
  });
}

function systemPrompt(entityType: string) {
  const common = `Você interpreta screenshots do jogo Bullet Echo para o painel administrativo do EchoArena.\n\nREGRAS ABSOLUTAS:\n- Extraia somente o que estiver claramente visível nas imagens.\n- Nunca estime, complete, calcule ou invente valores ausentes.\n- Quando houver dúvida, use null e explique em warnings.\n- Preserve números decimais exatamente como aparecem, removendo apenas símbolos de unidade quando o campo é numérico.\n- Não decida publicação/ativação. O modelo não controla o campo enabled.\n- Use somente classes, raridades e slots fornecidos no contexto quando houver correspondência segura.\n- Se duas imagens se contradisserem, não escolha silenciosamente: use o valor de maior evidência somente se claro e registre o conflito em warnings.\n- A saída será validada por JSON Schema estrito.`;
  if (entityType === 'equipment') {
    return `${common}\n- Para setName, compare com os conjuntos existentes. Use setMatch=existing somente para correspondência inequívoca. Use unknown para um nome visível que não exista no catálogo; esse conjunto NÃO será criado automaticamente.\n- Agrupe atributos pela raridade exibida no print. Não copie atributos para raridades que não aparecem.\n- Em bônus de conjunto, preserve requiredPieces e também uma representação estruturada em effects.`;
  }
  return `${common}\n- Mapeie a classe e a raridade para os slugs do catálogo somente quando a correspondência for inequívoca.\n- status, weaponSummary e weaponDetails devem conter números ou null.\n- Preserve como campos distintos: maxMovementSpeed, aimedMovementSpeed, movementNoiseRadius, armorValue e armorResistance. Nunca copie o valor de um deles para outro.\n- weaponSummary contém somente os seis índices visuais do cartão da arma: firepower, armorBreak, fireRate, magazineCapacity, effectiveRange e aimingStability.\n- weaponDetails contém somente valores mecânicos: dano por tiro, multiplicadores, perfuração, tiros por segundo, recarga, pente, alcances, dispersões e tempo de mira.\n- Nunca use um índice de weaponSummary para preencher um campo mecânico de weaponDetails, nem faça o inverso.\n- Não derive dano, DPS, cadência ou qualquer outro valor matematicamente.`;
}

async function callOpenAI(entityType: string, context: Json, identity: Json, images: Json[]) {
  const apiKey = env('OPENAI_API_KEY');
  const model = Deno.env.get('OPENAI_VISION_MODEL') || 'gpt-5.6-terra';
  const schema = entityType === 'equipment' ? equipmentSchema(context) : heroSchema(context);
  const content: Json[] = [
    { type: 'input_text', text: `Contexto canônico do banco:\n${compactContext(entityType, context, identity)}` },
  ];
  for (const image of images) {
    content.push({ type: 'input_image', image_url: image.dataUrl, detail: 'auto' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        reasoning: { effort: 'low' },
        max_output_tokens: 7000,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: systemPrompt(entityType) }] },
          { role: 'user', content },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: `echoarena_${entityType}_import_v2`,
            strict: true,
            schema,
          },
        },
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = (payload as Json)?.error && typeof (payload as Json).error === 'object'
        ? String(((payload as Json).error as Json).message || 'Falha no provedor de IA')
        : 'Falha no provedor de IA';
      throw new Error(message);
    }

    const output = Array.isArray((payload as Json).output) ? (payload as Json).output as Json[] : [];
    let text = '';
    for (const item of output) {
      const parts = Array.isArray(item.content) ? item.content as Json[] : [];
      const part = parts.find(value => value.type === 'output_text' && typeof value.text === 'string');
      if (part?.text) { text = String(part.text); break; }
    }
    if (!text) throw new Error('A IA não retornou o JSON estruturado esperado.');
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Método não permitido' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!/^Bearer\s+\S+/i.test(authHeader)) return json({ ok: false, error: 'Sessão administrativa ausente' }, 401);
    if (!(await isAdmin(authHeader))) return json({ ok: false, error: 'Acesso administrativo necessário' }, 403);

    const body = await req.json() as Json;
    if (Number(body.schemaVersion) !== 2) return json({ ok: false, error: 'schemaVersion incompatível' }, 400);
    const entityType = String(body.entityType || '');
    if (!['hero', 'equipment'].includes(entityType)) return json({ ok: false, error: 'entityType inválido' }, 400);

    const images = asArray(body.images);
    if (!images.length || images.length > MAX_IMAGES) {
      return json({ ok: false, error: `Envie entre 1 e ${MAX_IMAGES} imagens.` }, 400);
    }

    let totalChars = 0;
    for (const image of images) {
      const dataUrl = String(image.dataUrl || '');
      totalChars += dataUrl.length;
      if (dataUrl.length > MAX_DATA_URL_CHARS || !ALLOWED_DATA_URL.test(dataUrl)) {
        return json({ ok: false, error: 'Uma das imagens preparadas é inválida ou grande demais.' }, 413);
      }
    }
    if (totalChars > MAX_TOTAL_CHARS) return json({ ok: false, error: 'Conjunto de imagens grande demais.' }, 413);

    const context = body.context && typeof body.context === 'object' ? body.context as Json : {};
    const identity = body.identity && typeof body.identity === 'object' ? body.identity as Json : {};
    const result = await callOpenAI(entityType, context, identity, images);
    return json({ ok: true, schemaVersion: 2, entityType, result });
  } catch (error) {
    console.error('admin-content-ai-import:', error);
    const message = error instanceof Error ? error.message : 'Falha inesperada na interpretação';
    const status = message.includes('Configuração ausente') ? 503 : message.includes('abort') ? 504 : 500;
    return json({ ok: false, error: message }, status);
  }
});
