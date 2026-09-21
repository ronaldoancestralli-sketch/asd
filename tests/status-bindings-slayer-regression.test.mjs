import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/20260917011649_restore_status_bindings_and_slayer.sql', import.meta.url),
  'utf8'
);
const editor = await readFile(
  new URL('../admin/js/hero-editor.js', import.meta.url),
  'utf8'
);
const edgeImport = await readFile(
  new URL('../supabase/functions/admin-content-ai-import/index.ts', import.meta.url),
  'utf8'
);

test('migration versionada contém catálogo, Slayer e pós-condições da Boina', () => {
  for (const expected of [
    "'movement_noise_radius'",
    "'aimed_movement_speed'",
    "'armor_resistance'",
    "'weapon_firepower_score'",
    "'armor_break_score'",
    "'fire_rate_score'",
    "'magazine_capacity_score'",
    "'effective_range_score'",
    "'aiming_stability_score'",
    "'hero.movement_noise_radius'",
    "'AO BARULHO DA CORRIDA DO HERÓI'"
  ]) {
    assert.ok(migration.includes(expected), `migration sem ${expected}`);
  }

  assert.match(migration, /stat_key = 'movement_speed' and value = 171/);
  assert.match(migration, /stat_key = 'aimed_movement_speed' and value = 51/);
  assert.match(migration, /stat_key = 'movement_noise_radius' and value = 300/);
  assert.match(migration, /stat_key = 'armor_resistance' and value = 6/);
  assert.match(migration, /v_value_count <> 11/);
});

test('editor usa o contrato exato e o OCR remoto proíbe mistura resumo/mecânica', () => {
  assert.match(editor, /hero-stat-import-mapping\.js\?v=20260917-status-bindings-1/);
  assert.doesNotMatch(editor, /scoreIntegratedDefinitionMatch/);
  assert.match(edgeImport, /weaponSummary contém somente os seis índices visuais/);
  assert.match(edgeImport, /Nunca use um índice de weaponSummary para preencher um campo mecânico/);
});
