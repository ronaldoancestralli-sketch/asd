import test from 'node:test';
import assert from 'node:assert/strict';
import {
  semanticCompositionAssessmentV4
} from '../supabase/functions/_shared/echo-brain-semantic-v4.ts';

const verifiedSkill = (name, description, skillType = 'Passiva', extra = {}) => ({
  name,
  description,
  skill_type: skillType,
  enabled: true,
  verification_status: 'verified',
  needs_recheck: false,
  ...extra
});

const hero = (id, classId, skills) => ({ id, class_id: classId, skills });

const AREA = verifiedSkill(
  'Carga explosiva',
  'A granada causa 1.455 de dano em um raio de 200.',
  'Habilidade Ativa',
  { cooldown: 8, duration: 0 }
);
const ENEMY_SLOW = verifiedSkill(
  'Campo de contenção',
  'Reduz em 40% a velocidade de movimento dos inimigos por 5 s.',
  'Habilidade Ativa',
  { cooldown: 10, duration: 5 }
);
const TEAM_HEAL = verifiedSkill(
  'Suporte de campo',
  'Os aliados da equipe recuperam 120 de vida por segundo durante 6 s.',
  'Talento de equipe',
  { duration: 6 }
);
const SELF_PENALTY = verifiedSkill(
  'Canal arriscado',
  'Ao ativar, o herói não pode atirar e reduz a velocidade de movimento do herói em 70% por 5 s.',
  'Habilidade Ativa',
  { cooldown: 10, duration: 5 }
);
const TEAM_DEFENSE = verifiedSkill(
  'Cobertura defensiva',
  'A equipe reduz em 35% o dano recebido e os aliados recuperam 100 de vida por segundo durante 6 s.',
  'Talento de equipe',
  { duration: 6 }
);

function complementaryTeam() {
  return [
    hero('area', 'assault', [AREA]),
    hero('slow', 'control', [ENEMY_SLOW]),
    hero('heal', 'support', [TEAM_HEAL])
  ];
}

function redundantTeam() {
  return [
    hero('area-a', 'assault', [AREA]),
    hero('area-b', 'assault', [AREA]),
    hero('area-c', 'assault', [AREA])
  ];
}

test('avaliação de composição é invariável à ordem dos três heróis', () => {
  const team = complementaryTeam();
  const a = semanticCompositionAssessmentV4(team);
  const b = semanticCompositionAssessmentV4([team[2], team[0], team[1]]);
  const c = semanticCompositionAssessmentV4([team[1], team[2], team[0]]);

  assert.equal(a.complete, true);
  assert.equal(a.score, b.score);
  assert.equal(a.score, c.score);
  assert.deepEqual(a.components, b.components);
  assert.deepEqual(a.components, c.components);
  assert.equal(a.confidence, b.confidence);
});

test('controle de movimento e dano em área por heróis diferentes criam sinergia contextual real', () => {
  const complementary = semanticCompositionAssessmentV4(complementaryTeam());
  const redundant = semanticCompositionAssessmentV4(redundantTeam());

  assert.ok(complementary.components.crossHeroSynergy > redundant.components.crossHeroSynergy,
    `cross-hero esperado maior: ${complementary.components.crossHeroSynergy} vs ${redundant.components.crossHeroSynergy}`);
  assert.ok(complementary.components.mechanicDiversity > redundant.components.mechanicDiversity,
    `diversidade esperada maior: ${complementary.components.mechanicDiversity} vs ${redundant.components.mechanicDiversity}`);
  assert.ok(complementary.components.controlCoverage > redundant.components.controlCoverage);
  assert.ok(complementary.components.defenseCoverage > redundant.components.defenseCoverage);
  assert.ok(complementary.score > redundant.score,
    `trio complementar deveria superar redundante: ${complementary.score} vs ${redundant.score}`);
});

test('três cópias funcionais da mesma mecânica não fabricam sinergia cross-hero', () => {
  const result = semanticCompositionAssessmentV4(redundantTeam());
  assert.equal(result.components.crossHeroSynergy, 0);
  assert.ok(result.components.mechanicDiversity < .12);
  assert.ok(result.risks.some(text => /redundância/i.test(text)), `risco de redundância ausente: ${result.risks.join(' | ')}`);
});

test('penalidade própria ativa gera vulnerabilidade quando o trio não oferece compensação', () => {
  const exposed = semanticCompositionAssessmentV4([
    hero('penalty', 'scout', [SELF_PENALTY]),
    hero('area-a', 'assault', [AREA]),
    hero('area-b', 'assault', [AREA])
  ]);

  assert.ok(exposed.components.uncompensatedPenalty > 0);
  assert.ok(exposed.risks.some(text => /vulnerabilidade/i.test(text)), `risco de vulnerabilidade ausente: ${exposed.risks.join(' | ')}`);
});

test('defesa/sustentação do trio reduz a parcela não compensada da mesma penalidade', () => {
  const exposed = semanticCompositionAssessmentV4([
    hero('penalty', 'scout', [SELF_PENALTY]),
    hero('area-a', 'assault', [AREA]),
    hero('area-b', 'assault', [AREA])
  ]);
  const compensated = semanticCompositionAssessmentV4([
    hero('penalty', 'scout', [SELF_PENALTY]),
    hero('defense', 'support', [TEAM_DEFENSE]),
    hero('area', 'assault', [AREA])
  ]);

  assert.ok(compensated.components.defenseCoverage > exposed.components.defenseCoverage);
  assert.ok(compensated.components.uncompensatedPenalty < exposed.components.uncompensatedPenalty,
    `penalidade deveria cair: ${compensated.components.uncompensatedPenalty} vs ${exposed.components.uncompensatedPenalty}`);
});

test('trocar controle inimigo por penalidade própria destrói a sinergia slow + área em vez de preservar score por palavras parecidas', () => {
  const controlled = semanticCompositionAssessmentV4([
    hero('area', 'assault', [AREA]),
    hero('control', 'control', [ENEMY_SLOW]),
    hero('heal', 'support', [TEAM_HEAL])
  ]);
  const selfPenalized = semanticCompositionAssessmentV4([
    hero('area', 'assault', [AREA]),
    hero('penalty', 'control', [SELF_PENALTY]),
    hero('heal', 'support', [TEAM_HEAL])
  ]);

  assert.ok(controlled.components.crossHeroSynergy > selfPenalized.components.crossHeroSynergy);
  assert.ok(controlled.components.enemyDebuffCoverage > selfPenalized.components.enemyDebuffCoverage);
  assert.ok(selfPenalized.components.uncompensatedPenalty > controlled.components.uncompensatedPenalty);
});
