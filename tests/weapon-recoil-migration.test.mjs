import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL(
  '../supabase/migrations/20260917233651_add_weapon_recoil_definition.sql',
  import.meta.url
), 'utf8');
const pendingNumericMigration = await readFile(new URL(
  '../supabase/migrations/20260917234421_allow_pending_numeric_calculation_effects.sql',
  import.meta.url
), 'utf8');

test('migration cadastra recuo como chave própria com base relativa explícita', () => {
  assert.match(migration, /'weapon_recoil'/);
  assert.match(migration, /'weapon\.recoil'/);
  assert.match(migration, /default_base[\s\S]*100/);
  assert.match(migration, /não representa dispersão, ângulo nem fator de dispersão/);
  assert.match(migration, /WEAPON_RECOIL_MUST_NOT_ALIAS_SPREAD/);
});

test('migration expõe defaultBase no catálogo público', () => {
  assert.match(migration, /'defaultBase', d\.default_base/);
  assert.match(migration, /v_definition->>'defaultBase'/);
});

test('schema preserva observação numérica pendente sem autorizar cálculo sem alvo', () => {
  assert.match(pendingNumericMigration, /kind = 'numeric' and operation is not null/);
  assert.doesNotMatch(
    pendingNumericMigration,
    /kind = 'numeric' and target_stat_id is not null and operation is not null/
  );
  assert.match(pendingNumericMigration, /v_target is not null/);
  assert.match(pendingNumericMigration, /'target', null/);
  assert.match(pendingNumericMigration, /CALCULATION_INVALID_NUMERIC_FIELDS/);
});
