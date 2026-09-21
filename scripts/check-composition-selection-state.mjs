import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeCompositionSelection,
  resolveCompositionTarget
} from '../js/composition-selection-state.mjs';

assert.deepEqual(
  normalizeCompositionSelection(['hero-a', 'hero-a', 'hero-c']),
  ['hero-a', '', 'hero-c'],
  'heróis repetidos não podem ocupar duas posições'
);

assert.equal(
  resolveCompositionTarget(['hero-a', 'hero-b', ''], 0),
  2,
  'uma posição ocupada não pode impedir o terceiro herói de completar o trio'
);

assert.equal(
  resolveCompositionTarget(['hero-a', '', ''], 2),
  2,
  'uma posição vazia escolhida explicitamente deve ser respeitada'
);

assert.equal(
  resolveCompositionTarget(['hero-a', 'hero-b', 'hero-c'], 1),
  1,
  'com o trio completo, um slot ativo pode ser substituído'
);

assert.equal(
  resolveCompositionTarget(['hero-a', 'hero-b', 'hero-c'], null),
  null,
  'um trio completo sem slot ativo não deve sofrer substituição implícita'
);

const experience = readFileSync(new URL('../js/compositions-experience-v3.js', import.meta.url), 'utf8');
const publicModules = readFileSync(new URL('../js/public-modules.js', import.meta.url), 'utf8');
const polish = readFileSync(new URL('../js/public-modules-polish.js', import.meta.url), 'utf8');

for (const token of (
  [
    'composition-selection-state.mjs?v=20260822-selection-1',
    'resolveCompositionTarget(state.selectedIds, state.activeSlot)',
    'new CustomEvent(COMPOSITION_SELECTION_EVENT',
    'form.addEventListener(COMPOSITION_OPTIONS_EVENT, syncFormSelections)',
    "form.querySelectorAll('.composition-hero-select').forEach(select =>",
    'observer.observe(select, { childList: true })',
  ]
)) assert.ok(experience.includes(token), `compositions-experience-v3.js sem integração: ${token}`);

assert.ok(!experience.includes("observe(form, { childList: true, subtree: true })"), 'o observer não pode reagir a mensagens/readiness do próprio formulário');

assert.ok(publicModules.includes("new CustomEvent('echo:composition-options-ready'"), 'public-modules.js não anuncia a remontagem dos seletores');
assert.ok(polish.includes("form.addEventListener('echo:composition-selection-change', sync)"), 'public-modules-polish.js não acompanha mudanças programáticas');

console.log('Seleção de Composições: preenchimento 3/3, unicidade e substituição explícita validados.');
