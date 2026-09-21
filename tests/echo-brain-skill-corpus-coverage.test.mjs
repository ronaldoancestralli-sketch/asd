import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { skillSemanticsV3 } from '../supabase/functions/_shared/echo-brain-semantic.ts';
import { semanticCorrectionsV4 } from '../supabase/functions/_shared/echo-brain-semantic-v4.ts';

const FILES = [
  'supabase/migrations/20260821030000_seed_verified_hero_skills_snipers_ptbr.sql',
  'supabase/migrations/20260821030100_seed_verified_hero_skills_tanks_ptbr.sql',
  'supabase/migrations/20260821030200_seed_verified_hero_skills_troopers_ptbr.sql',
  'supabase/migrations/20260821030300_seed_verified_hero_skills_scouts_ptbr.sql',
  'supabase/migrations/20260821030400_seed_verified_hero_skills_ambushers_ptbr.sql'
];

function unescapeSql(value = '') {
  return value.replace(/''/g, "'");
}

function verifiedSkillsBlock(sql, path) {
  const start = sql.search(/with\s+verified_skills\s*\(/i);
  const end = start >= 0 ? sql.indexOf('\n)\ninsert into public.hero_skills', start) : -1;
  assert.ok(start >= 0 && end > start, `${path} não contém bloco verified_skills reconhecível`);
  return sql.slice(start, end);
}

function extractSkills(path) {
  const sql = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const valuesBlock = verifiedSkillsBlock(sql, path);
  const tuplePattern = /\(\s*'((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'\s*,/g;
  const skills = [];
  for (const match of valuesBlock.matchAll(tuplePattern)) {
    skills.push({
      hero_slug: unescapeSql(match[1]),
      name: unescapeSql(match[2]),
      slug: unescapeSql(match[3]),
      description: unescapeSql(match[4]),
      skill_type: unescapeSql(match[5]),
      enabled: true,
      verification_status: 'verified',
      needs_recheck: false
    });
  }
  return skills;
}

function truthyCount(record = {}) {
  return Object.values(record).filter(Boolean).length;
}

function semanticSignalCount(skill) {
  const v3 = skillSemanticsV3(skill);
  const v4 = semanticCorrectionsV4(skill);
  return Object.keys(v3.effects || {}).length
    + Object.keys(v3.contextEffects || {}).length
    + truthyCount(v3.triggers)
    + truthyCount(v3.contextTriggers)
    + Object.keys(v4.effects || {}).length;
}

test('cada herói do corpus verificado possui exatamente quatro habilidades', () => {
  const allSkills = FILES.flatMap(path => extractSkills(path).map(skill => ({ ...skill, path })));
  const byHero = new Map();
  for (const skill of allSkills) {
    if (!byHero.has(skill.hero_slug)) byHero.set(skill.hero_slug, []);
    byHero.get(skill.hero_slug).push(skill);
  }

  assert.equal(byHero.size, 19, `esperados 19 heróis verificados; encontrados ${byHero.size}`);
  assert.equal(allSkills.length, 76, `esperadas 76 habilidades verificadas; encontradas ${allSkills.length}`);

  for (const [hero, skills] of byHero) {
    assert.equal(skills.length, 4, `${hero} possui ${skills.length} habilidades no corpus, esperado: 4`);
    assert.equal(new Set(skills.map(skill => skill.slug)).size, 4, `${hero} possui slug de habilidade duplicado`);
  }
});

test('nenhuma habilidade verificada fica semanticamente muda', () => {
  const uncovered = [];
  for (const path of FILES) {
    for (const skill of extractSkills(path)) {
      if (semanticSignalCount(skill) === 0) uncovered.push(`${path}: ${skill.name}`);
    }
  }
  assert.deepEqual(uncovered, [], `habilidades sem sinal semântico:\n${uncovered.join('\n')}`);
});

test('corpus ativa o vocabulário contextual essencial encontrado na auditoria', () => {
  const context = new Set();
  const corrections = new Set();
  for (const path of FILES) {
    for (const skill of extractSkills(path)) {
      const v3 = skillSemanticsV3(skill);
      const v4 = semanticCorrectionsV4(skill);
      for (const [id, value] of Object.entries(v3.contextEffects || {})) if (value > 0) context.add(id);
      for (const [id, value] of Object.entries(v4.effects || {})) if (value > 0) corrections.add(id);
    }
  }

  for (const id of [
    'ability_damage', 'area_damage', 'invisibility', 'deployable', 'shield_break',
    'enemy_weapon_lock', 'enemy_fire_rate_slow', 'enemy_movement_slow',
    'team_damage_buff', 'team_fire_rate_buff', 'charge_economy'
  ]) {
    assert.ok(context.has(id), `mecânica contextual do corpus não coberta: ${id}`);
  }

  for (const id of [
    'self_weapon_disable', 'self_movement_penalty', 'enemy_weapon_disable',
    'enemy_movement_slow', 'self_recovery_channel', 'post_stealth_damage_window',
    'direct_hit_shield_break'
  ]) {
    assert.ok(corrections.has(id), `correção v4 do corpus não coberta: ${id}`);
  }
});
