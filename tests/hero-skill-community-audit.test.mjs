import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('busca preserva fontes antigas e nunca deixa o editor sem quatro posições', () => {
  const edge = read('supabase/functions/admin-hero-skills-research/index.ts');
  const panel = read('admin/js/hero-skills-panel.js');
  for (const source of ['reddit.com', 'vk.com', 'youtube.com', 'youtu.be']) assert.match(edge, new RegExp(source.replace('.', '\\.')));
  assert.match(edge, /a idade da fonte nunca é motivo para descartá-la/);
  assert.match(edge, /Fonte histórica preservada/);
  assert.match(edge, /sourceUpdatedAt/);
  assert.match(panel, /Habilidade \$\{displayOrder \+ 1\} · validar/);
  assert.match(panel, /_researchPlaceholder:\s*true/);
  assert.match(panel, /placeholderCount > 0/);
  assert.match(panel, /Aguardando validação/);
});

test('interface pública oferece auditoria e reconhecimento sem prometer prêmio no envio', () => {
  const page = read('js/herois.js');
  const css = read('css/herois-detail.css');
  assert.match(page, /Validar estes dados/);
  assert.match(page, /echo_submit_hero_skill_audit_v1/);
  assert.match(page, /depois de dois pareceres independentes/);
  assert.match(page, /CONTRIBUIÇÃO RECONHECIDA/);
  assert.match(page, /Auditado por/);
  assert.match(page, /GUARDIÃO DE DADOS/);
  assert.match(page, /Herói auditado por/);
  assert.match(page, /echo_public_hero_audit_credits_v1/);
  assert.match(page, /echo_public_identity_cards_v1/);
  assert.match(css, /skill-audit-credit/);
  assert.match(css, /hero-audit-crown/);
  assert.match(css, /prefers-reduced-motion/);
});

test('migração exige dupla revisão independente e expõe somente crédito público estreito', () => {
  const sql = read('supabase/migrations/20260830044540_hero_skill_community_audit.sql');
  assert.match(sql, /'hero_skill_audit'::text/);
  assert.match(sql, /v_policy\.max_submissions_per_window/);
  assert.match(sql, /v_policy\.max_pending_per_member/);
  assert.match(sql, /'pending',false/);
  assert.match(sql, /none_until_independent_confirmation/);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /f\.outcome='confirmed'/);
  assert.match(sql, /f\.confirmer_id is distinct from c\.contributor_id/);
  assert.match(sql, /f\.confirmer_id is distinct from e\.reviewer_id/);
  assert.match(sql, /profile_visibility='public'/);
  assert.match(sql, /cardinality\(p_hero_ids\)>50/);
  assert.match(sql, /grant execute on function public\.echo_public_hero_audit_credits_v1\(uuid\[\]\) to anon,authenticated,service_role/);
  assert.match(sql, /revoke all on function public\.echo_submit_hero_skill_audit_v1[\s\S]*from public,anon/);
});

