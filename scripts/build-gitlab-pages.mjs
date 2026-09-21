import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = resolve(ROOT, process.argv[2] || 'public');
const EXPECTED_SUPABASE_URL = 'https://nqklhsfaqpbjqmfzjzxk.supabase.co';
const RUNTIME_CONFIG_PATH = 'js/echo-arena-runtime-config.js';
const PUBLISHABLE_KEY = /^sb_publishable_[A-Za-z0-9_-]{20,}$/;
const WEB_TREES = Object.freeze({
  admin: new Set(['.css', '.html', '.js', '.json', '.mjs']),
  assets: new Set(['.gif', '.ico', '.jpeg', '.jpg', '.mp3', '.onnx', '.png', '.svg', '.ttf', '.txt', '.webp', '.woff', '.woff2']),
  css: new Set(['.css']),
  js: new Set(['.js', '.mjs']),
});
// Public browser dependency, not permission to publish the entire contracts tree.
const PUBLIC_CONTRACT_FILES = Object.freeze(['contracts/equipment-effect-contract-v1.js']);

const FORBIDDEN_CONTENT = Object.freeze([
  ['Supabase service-role', /\bSUPABASE_SERVICE_ROLE_KEY\b|\bservice[_-]?role\b/i],
  ['Supabase secret key', /\bsb_secret_[A-Za-z0-9_-]+\b/],
  ['GitLab access token', /\bglpat-[A-Za-z0-9_-]+\b/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['database connection string', /\b(?:postgres(?:ql)?|mysql):\/\/[^\s"']+/i],
  ['cloud provider secret', /\b(?:AWS_SECRET_ACCESS_KEY|CLOUDFLARE_API_TOKEN)\b/i],
]);
const JWT_LIKE = /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g;
const INTERNAL_TEST_LINK = /\s*<a\b[^>]*href=["']\.\.\/tests\/[^"']+["'][^>]*>[\s\S]*?<\/a>/gi;

function portable(path) {
  return path.split(sep).join('/');
}

function assertOutputIsSafe() {
  if (OUTPUT === ROOT || !OUTPUT.startsWith(`${ROOT}${sep}`)) {
    throw new Error('O diretório de saída do Pages deve permanecer dentro do repositório.');
  }
}

function readPublicRuntimeConfig() {
  const url = process.env.SUPABASE_URL?.trim();
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) {
    throw new Error('SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY são obrigatórias para o Pages.');
  }
  if (url !== EXPECTED_SUPABASE_URL) {
    throw new Error('SUPABASE_URL não corresponde ao projeto EchoArena autorizado.');
  }
  if (!PUBLISHABLE_KEY.test(publishableKey)) {
    throw new Error('SUPABASE_PUBLISHABLE_KEY não tem o formato publishable moderno esperado.');
  }
  return Object.freeze({ url, publishableKey });
}

async function assertPublicRuntimeConfigIsActive({ url, publishableKey }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let response;
  try {
    response = await fetch(`${url}/auth/v1/settings`, {
      headers: { Accept: 'application/json', apikey: publishableKey },
      signal: controller.signal,
    });
  } catch {
    throw new Error('Não foi possível validar a configuração pública diretamente no Supabase.');
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new Error('A configuração pública foi rejeitada pelo Supabase.');
  }
}

function cacheVersion({ url, publishableKey }, releaseManifest, mediaConfig) {
  // Infraestrutura de mídia também renova a cadeia inteira, sem inventar release pública.
  return createHash('sha256').update(`${url}\0${publishableKey}\0${releaseManifest}\0${mediaConfig}`).digest('hex').slice(0, 12);
}

function appendCacheVersion(reference, version) {
  const [beforeHash, hash = ''] = reference.split('#', 2);
  const separator = beforeHash.includes('?') ? '&' : '?';
  return `${beforeHash}${separator}pgv=${version}${hash ? `#${hash}` : ''}`;
}

function bustRelativeJavaScriptReferences(content, version) {
  return content.replace(
    /(["'])(\.\.?\/[^"']+\.(?:m?js)(?:\?[^"'#]*)?(?:#[^"']*)?)\1/g,
    (_match, quote, reference) => `${quote}${appendCacheVersion(reference, version)}${quote}`,
  );
}

function transformSupabaseClient(content) {
  const constants = /const SUPABASE_URL\s*=\s*["'][^"']+["'];\s*const SUPABASE_ANON_KEY\s*=\s*["'][^"']+["'];/;
  if (!constants.test(content)) {
    throw new Error('js/supabase.js não contém a configuração pública substituível esperada.');
  }
  const runtimeBinding = `const runtimeConfig = globalThis.__ECHO_ARENA_PUBLIC_CONFIG__;\nconst SUPABASE_URL = runtimeConfig?.SUPABASE_URL;\nconst SUPABASE_PUBLISHABLE_KEY = runtimeConfig?.SUPABASE_PUBLISHABLE_KEY;\n\nif (SUPABASE_URL !== '${EXPECTED_SUPABASE_URL}' || !${PUBLISHABLE_KEY}.test(SUPABASE_PUBLISHABLE_KEY || '')) {\n  throw new Error('[supabase] configuração pública de runtime ausente ou inválida.');\n}`;
  const transformed = content
    .replace(constants, runtimeBinding)
    .replace(/\bSUPABASE_ANON_KEY\b/g, 'SUPABASE_PUBLISHABLE_KEY');
  if (transformed.includes('SUPABASE_ANON_KEY')) {
    throw new Error('js/supabase.js ainda referencia a chave legada após a transformação.');
  }
  return transformed;
}

function transformHtml(content, version, relativePath) {
  const withoutInternalTests = content.replace(INTERNAL_TEST_LINK, '');
  const runtimeRelativePath = portable(relative(dirname(join(ROOT, relativePath)), join(ROOT, RUNTIME_CONFIG_PATH)));
  const runtimeReference = runtimeRelativePath.startsWith('.') ? runtimeRelativePath : `./${runtimeRelativePath}`;
  const runtimeTag = `<script src="${runtimeReference}"></script>`;
  if (!/<head\b[^>]*>/i.test(withoutInternalTests)) {
    throw new Error('HTML publicável sem elemento <head>.');
  }
  const contentSecurityPolicy = /<meta\b(?=[^>]*http-equiv=["']Content-Security-Policy["'])[^>]*>/i;
  const withRuntimeConfig = contentSecurityPolicy.test(withoutInternalTests)
    ? withoutInternalTests.replace(contentSecurityPolicy, (meta) => `${meta}\n  ${runtimeTag}`)
    : withoutInternalTests.replace(/<head\b[^>]*>/i, (head) => `${head}\n  ${runtimeTag}`);
  return bustRelativeJavaScriptReferences(
    withRuntimeConfig,
    version,
  );
}

function runtimeConfigSource({ url, publishableKey }) {
  return `globalThis.__ECHO_ARENA_PUBLIC_CONFIG__ = Object.freeze(${JSON.stringify({
    SUPABASE_URL: url,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
  })});\n`;
}

async function listFiles(directory, extensions) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Link simbólico não permitido no Pages: ${portable(relative(ROOT, absolute))}`);
    }
    if (entry.isDirectory()) {
      files.push(...await listFiles(absolute, extensions));
      continue;
    }
    if (!entry.isFile() || !extensions.has(extname(entry.name).toLowerCase())) {
      throw new Error(`Tipo de arquivo não permitido no Pages: ${portable(relative(ROOT, absolute))}`);
    }
    files.push(absolute);
  }
  return files;
}

async function collectPublishableFiles() {
  const rootEntries = await readdir(ROOT, { withFileTypes: true });
  const files = rootEntries
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.html')
    .map((entry) => join(ROOT, entry.name));

  for (const [tree, extensions] of Object.entries(WEB_TREES)) {
    files.push(...await listFiles(join(ROOT, tree), extensions));
  }
  for (const file of PUBLIC_CONTRACT_FILES) {
    const directory = await lstat(join(ROOT, dirname(file)));
    const info = await lstat(join(ROOT, file));
    if (!directory.isDirectory() || directory.isSymbolicLink() || !info.isFile() || info.isSymbolicLink()) {
      throw new Error(`Contrato publicável ausente ou inseguro: ${file}`);
    }
    files.push(join(ROOT, file));
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function assertNoSecrets(relativePath, content) {
  for (const [category, pattern] of FORBIDDEN_CONTENT) {
    if (pattern.test(content)) {
      throw new Error(`Conteúdo proibido (${category}) em ${relativePath}.`);
    }
  }

  const jwtMatches = content.match(JWT_LIKE) || [];
  if (jwtMatches.length > 0) {
    const allowedPublicConfig = relativePath === 'js/supabase.js'
      && content.includes('SUPABASE_ANON_KEY')
      && jwtMatches.length === 1;
    if (!allowedPublicConfig) {
      throw new Error(`Token JWT inesperado em ${relativePath}.`);
    }
  }
}

assertOutputIsSafe();
const publicRuntimeConfig = readPublicRuntimeConfig();
await assertPublicRuntimeConfigIsActive(publicRuntimeConfig);
const publicReleaseManifest = await readFile(join(ROOT, 'js/public-release-manifest.js'), 'utf8');
const mediaConfig = await readFile(join(ROOT, 'js/media-config.js'), 'utf8');
const runtimeCacheVersion = cacheVersion(publicRuntimeConfig, publicReleaseManifest, mediaConfig);
const publishableFiles = await collectPublishableFiles();
if (!publishableFiles.some((file) => relative(ROOT, file) === 'index.html')) {
  throw new Error('index.html não encontrado na raiz publicável.');
}

for (const source of publishableFiles) {
  const relativePath = portable(relative(ROOT, source));
  if (['.css', '.html', '.js', '.json', '.mjs', '.svg'].includes(extname(source).toLowerCase())) {
    assertNoSecrets(relativePath, await readFile(source, 'utf8'));
  }
}

await rm(OUTPUT, { force: true, recursive: true });
let removedInternalTestLinks = 0;
for (const source of publishableFiles) {
  const relativePath = portable(relative(ROOT, source));
  const destination = join(OUTPUT, relative(ROOT, source));
  await mkdir(dirname(destination), { recursive: true });
  if (extname(source).toLowerCase() === '.html') {
    const content = await readFile(source, 'utf8');
    const matches = content.match(INTERNAL_TEST_LINK) || [];
    removedInternalTestLinks += matches.length;
    await writeFile(destination, transformHtml(content, runtimeCacheVersion, relativePath), 'utf8');
  } else if (['.js', '.mjs'].includes(extname(source).toLowerCase())) {
    const content = await readFile(source, 'utf8');
    const configured = relativePath === 'js/supabase.js' ? transformSupabaseClient(content) : content;
    await writeFile(destination, bustRelativeJavaScriptReferences(configured, runtimeCacheVersion), 'utf8');
  } else {
    await copyFile(source, destination);
  }
}

const generatedRuntimeConfig = runtimeConfigSource(publicRuntimeConfig);
assertNoSecrets(RUNTIME_CONFIG_PATH, generatedRuntimeConfig);
await mkdir(dirname(join(OUTPUT, RUNTIME_CONFIG_PATH)), { recursive: true });
await writeFile(join(OUTPUT, RUNTIME_CONFIG_PATH), generatedRuntimeConfig, 'utf8');

const counts = publishableFiles.reduce((summary, file) => {
  const key = extname(file).toLowerCase() || '(sem extensão)';
  summary[key] = (summary[key] || 0) + 1;
  return summary;
}, {});

console.log(`GitLab Pages preparado com ${publishableFiles.length} arquivo(s).`);
console.log(`Entrada: index.html. Conteúdo por extensão: ${JSON.stringify(counts)}.`);
console.log(`Links para harnesses internos removidos somente do artefato: ${removedInternalTestLinks}.`);
console.log('Configuração pública de runtime validada no Supabase e injetada sem ecoar valores.');
console.log('Excluídos: documentação, backups, recuperação, CI, testes, scripts, Supabase backend, Cloudflare e CNAME.');
