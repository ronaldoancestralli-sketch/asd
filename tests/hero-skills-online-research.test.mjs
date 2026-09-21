import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('pesquisa de habilidades usa somente fontes gratuitas e retorna heróis em pt-BR', () => {
  const edge = read('supabase/functions/admin-hero-skills-research/index.ts');
  assert.doesNotMatch(edge, /OPENAI_API_KEY/);
  assert.doesNotMatch(edge, /api\.openai\.com/);
  assert.doesNotMatch(edge, /ENABLE_AI_HERO_RESEARCH/);
  assert.match(edge, /zepto\.helpshift\.com/);
  assert.match(edge, /bullet-echo\.fandom\.com/);
  assert.match(edge, /gamingonphone\.com/);
  assert.match(edge, /researchOfficialSources/);
  assert.match(edge, /const officialResearch = await researchOfficialSources\(input\)/);
  assert.match(edge, /Central de Ajuda oficial/);
  assert.match(edge, /missing_server_configuration/);
  assert.match(edge, /officialSectionLinks/);
  assert.match(edge, /OFFICIAL_GAMEPLAY_SECTION/);
  assert.match(edge, /Accept-Language/);
  assert.match(edge, /Markdown-like headings/);
  assert.match(edge, /\\p\{L\}/);
  assert.match(edge, /\/section\\\//);
  assert.match(edge, /officialSearchUrls/);
  assert.match(edge, /numeric FAQ/);
  assert.match(edge, /OFFICIAL_HERO_ARTICLE_URLS/);
  assert.match(edge, /COMMUNITY_HERO_PROFILES/);
  assert.match(edge, /RAMSAY_FANPAGE_URL/);
  assert.match(edge, /SHENJI_COMMUNITY_URL/);
  assert.match(edge, /api\.mymemory\.translated\.net\/get/);
  assert.match(edge, /translateOfficialResearchToPortuguese/);
  assert.match(edge, /officialSkills\.length === 4/);
  assert.match(edge, /resolveCommunityHeroSlug/);
  assert.match(edge, /candidates\.find\(candidate => Boolean\(COMMUNITY_HERO_PROFILES\[candidate\]\)\)/);
  assert.match(edge, /name:\s*'Caçador de Fogo'/);
  assert.match(edge, /name:\s*'Ignição'/);
  assert.match(edge, /name:\s*'Fúria Ardente'/);
  assert.doesNotMatch(edge, /name:\s*'Fire Hunter'/);
  assert.doesNotMatch(edge, /name:\s*'Ignition'/);
  assert.doesNotMatch(edge, /name:\s*'Burning Fury'/);
  assert.match(edge, /name:\s*'Investida Furiosa'/);
  assert.match(edge, /name:\s*'Kit de Batalha'/);
  assert.match(edge, /name:\s*'Incombustível'/);
  assert.match(edge, /name:\s*'Força Bruta'/);
  assert.doesNotMatch(edge, /name:\s*'Rampage'/);
  assert.doesNotMatch(edge, /name:\s*'Battle Kit'/);
  assert.doesNotMatch(edge, /name:\s*'Incombustible'/);
  assert.doesNotMatch(edge, /name:\s*'Brute Force'/);
  assert.match(edge, /sourceUpdatedAt:\s*'2024-04-16'/);
  assert.match(edge, /asArray\(asObject\(enriched\.result\)\.skills\)\.length === 4/);
  assert.match(edge, /communityOnly && asArray\(asObject\(communityOnly\.result\)\.skills\)\.length === 4/);
  assert.match(edge, /locale:\s*'pt-BR'/);
  assert.match(edge, /researchMode:\s*'free_sources'/);
  assert.match(edge, /profileSkill\.description \|\| official\?\.description/);
  assert.match(edge, /legacyOfficialSkillSections/);
  assert.match(edge, /data-href|data-url/);
});

test('cards de herói ficam compactos e preservam seis ações no celular', () => {
  const page = read('admin/heroes.html');
  const cards = read('admin/js/heroes.js');
  assert.match(page, /grid-template-columns:96px minmax\(0,1fr\);grid-template-rows:auto/);
  assert.match(page, /hero-card-actions\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(page, /hero-card-actions \.admin-button\{min-height:28px/);
  assert.match(page, /background:linear-gradient\(180deg,#8c1024,#610a18\);color:#fff/);
  assert.match(cards, />Público<\/a>/);
  assert.doesNotMatch(page, /hero-card-actions\{grid-template-columns:1fr\}/);
});

test('catálogo aplicado mantém evidências pendentes como corroboradas', () => {
  const panel = read('admin/js/hero-skills-panel.js');
  assert.match(panel, /admin_preview_hero_skill_catalog/);
  assert.match(panel, /supabase\.functions\.invoke\('admin-hero-skills-research'/);
  assert.match(panel, /verification_status:\s*'corroborated'/);
  assert.match(panel, /needs_recheck:\s*true/);
  assert.doesNotMatch(panel, /verification_status:\s*'verified'/);
});

test('painel preenche quatro habilidades e mantém a origem anexada', () => {
  const panel = read('admin/js/hero-skills-panel.js');
  assert.match(panel, /Pesquisar quatro habilidades/);
  assert.match(panel, /Salvar as quatro habilidades/);
  assert.match(panel, /Echo Arena Data ✅/);
  assert.match(panel, /Fonte oficial · ZeptoLab/);
  assert.match(panel, /Página da comunidade ·/);
  assert.match(panel, /Fórum ·/);
  assert.match(panel, /Fonte atualizada em/);
  assert.match(panel, /source_updated_at/);
  assert.match(panel, /hero_skill_source_links/);
  assert.match(panel, /\.upsert\(sourceRows, \{ onConflict: 'url' \}\)/);
  assert.match(panel, /if \(heroId && !skills\.length\) await researchSkillsOnline\(\{ automatic: true \}\)/);
});

test('novo herói abre a aba de habilidades com pesquisa automática', () => {
  const editor = read('admin/js/hero-editor.js');
  const html = read('admin/hero-editor.html');
  const shell = read('admin/js/admin-shell-core.js');
  assert.match(editor, /tab=abilities&autoSkills=1/);
  assert.match(editor, /admin_apply_hero_skill_catalog/);
  assert.match(editor, /Catálogo padrão: 4 habilidades aplicadas automaticamente/);
  assert.match(html, /20260830-skills-community-audit-1/);
  assert.match(html, /admin-shell\.js\?v=20260906-home-featured-phase-e-1/);
  assert.match(html, /refreshIfStale:\s*true/);
  assert.match(shell, /hero-skills-panel\.js\?v=20260830-skills-community-audit-1/);
});

test('catálogo padrão replica o lote aprovado e exige quatro habilidades', () => {
  const migration = read('supabase/migrations/20260829170000_hero_skill_catalog_standard.sql');
  const panel = read('admin/js/hero-skills-panel.js');
  assert.match(migration, /create table if not exists public\.hero_skill_catalog/);
  assert.match(migration, /admin_preview_hero_skill_catalog/);
  assert.match(migration, /admin_apply_hero_skill_catalog/);
  assert.match(migration, /count\(\*\).*\) <> 4/s);
  assert.match(panel, /admin_preview_hero_skill_catalog/);
  assert.match(migration, /catalog_seed/);
  assert.match(panel, /Pesquisar quatro habilidades/);
});

test('migração separa data da fonte da data de verificação', () => {
  const migration = read('supabase/migrations/20260829214140_hero_skill_source_dates.sql');
  assert.match(migration, /add column if not exists source_updated_at date/);
  assert.match(migration, /permanece nulo para evitar uma precisão inventada/);
});
