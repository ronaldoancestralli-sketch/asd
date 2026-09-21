import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analyzeRound, pickCaptainIndex } from '../js/diversao-events.js';

const hero = (name, className) => ({ name, className });

test('Formacao Completa aparece quando um trio tem tres classes distintas', () => {
  const result = analyzeRound(
    [hero('A','Soldados'), hero('B','Tanques'), hero('C','Escoteiros')],
    [hero('D','Soldados'), hero('E','Soldados'), hero('F','Tanques')]
  );
  assert.equal(result.primaryEvent?.id, 'complete');
});

test('Confronto Espelho tem prioridade sobre outros eventos', () => {
  const result = analyzeRound(
    [hero('A','Soldados'), hero('B','Tanques'), hero('C','Escoteiros')],
    [hero('D','Escoteiros'), hero('E','Soldados'), hero('F','Tanques')]
  );
  assert.equal(result.primaryEvent?.id, 'mirror');
});

test('Trinca Selada detecta tres herois da mesma classe', () => {
  const result = analyzeRound(
    [hero('A','Tanques'), hero('B','Tanques'), hero('C','Tanques')],
    [hero('D','Soldados'), hero('E','Escoteiros'), hero('F','Franco-Atirador')]
  );
  assert.equal(result.primaryEvent?.id, 'triple');
});

test('Caos Perfeito exige seis classes distintas', () => {
  const result = analyzeRound(
    [hero('A','C1'), hero('B','C2'), hero('C','C3')],
    [hero('D','C4'), hero('E','C5'), hero('F','C6')]
  );
  assert.equal(result.primaryEvent?.id, 'perfect-chaos');
  assert.equal(result.stats.totalUniqueClasses, 6);
});

test('capitao respeita fonte random deterministica', () => {
  const team = [hero('A','C1'), hero('B','C2'), hero('C','C3')];
  assert.equal(pickCaptainIndex(team, () => 0), 0);
  assert.equal(pickCaptainIndex(team, () => 0.5), 1);
  assert.equal(pickCaptainIndex(team, () => 0.999999), 2);
});

test('audio do disparo nao altera prototipos globais do Web Audio', () => {
  const source = fs.readFileSync(new URL('../js/diversao-shot.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /AudioContext\.prototype\.createGain\s*=/);
  assert.doesNotMatch(source, /AudioNode\.prototype\.connect\s*=/);
  assert.match(source, /weaponObserver\?\.disconnect\(\)/);
});

test('V19 preserva animacao do Caos Perfeito e ancora VS no centro mobile', () => {
  const css = fs.readFileSync(new URL('../css/diversao-audit-v19.css', import.meta.url), 'utf8');
  assert.match(css, /sealed-chaos-orbit-contained 8s linear infinite/);
  assert.match(css, /left:50%/);
  assert.match(css, /translate:-50% 0/);
  assert.match(css, /sealed-portrait\.is-captain/);
});

test('Câmara Dourada do QA usa o runtime público em vez de duplicar a animação', () => {
  const qa = fs.readFileSync(new URL('../js/diversao-qa.js', import.meta.url), 'utf8');
  const golden = fs.readFileSync(new URL('../js/diversao-golden.js', import.meta.url), 'utf8');
  assert.match(golden, /echoArenaDiversaoGolden/);
  assert.match(golden, /armForced/);
  assert.match(golden, /hero-draw-card\.golden-reveal/);
  assert.match(qa, /golden\.armForced\('full', 0\)/);
  assert.match(qa, /await runner\.run\('full'\)/);
  assert.doesNotMatch(qa, /stage\.classList\.add\('golden-armed', 'golden-shot'\)/);
  assert.doesNotMatch(qa, /node\?\.classList\.add\('golden-active'\)/);
  assert.doesNotMatch(qa, /card\?\.classList\.add\('golden-reveal'\)/);
});
