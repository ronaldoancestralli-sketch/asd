import test from 'node:test';
import assert from 'node:assert/strict';
import { compareHeroCountersV5,suggestSemanticFactsV5,counterCoverageV5 } from '../js/echo-brain-counter-v5.js';

const fact=(fact_role,mechanic,extra={})=>({fact_role,mechanic,review_status:'confirmed',verification_status:'verified',needs_recheck:false,semantic_confidence:1,strength:1,...extra});
const hero=(id,name,facts=[])=>({id,name,facts});

test('reveal countera dependência confirmada de invisibilidade',()=>{
  const raven=hero('a','Raven',[fact('capability','reveal')]);
  const ghost=hero('b','Ghost',[fact('dependency','invisibility')]);
  const result=compareHeroCountersV5(raven,ghost);
  assert.equal(result.verdict,'a_strong_counter');
  assert.ok(result.aToB.pressure>40);
  assert.match(result.aToB.evidence[0].reason,/invisibilidade/i);
});

test('fatos não verificados ou pendentes não geram counter',()=>{
  const a=hero('a','A',[fact('capability','shield_break',{verification_status:'unverified'})]);
  const b=hero('b','B',[fact('dependency','shield')]);
  const result=compareHeroCountersV5(a,b);
  assert.equal(result.verdict,'uncertain');
  assert.equal(result.evidenceCount,0);
});

test('imunidade reduz contribuição de counter',()=>{
  const a=hero('a','A',[fact('capability','stun')]);
  const base=hero('b','B',[fact('dependency','close_range')]);
  const immune=hero('c','C',[fact('dependency','close_range'),fact('immunity','stun')]);
  const withoutImmunity=compareHeroCountersV5(a,base);
  const withImmunity=compareHeroCountersV5(a,immune);
  assert.ok(withImmunity.aToB.pressure<withoutImmunity.aToB.pressure);
});

test('interpretador apenas sugere fatos e detecta condição de invisibilidade',()=>{
  const rows=suggestSemanticFactsV5({heroId:'h',sourceKind:'passive',sourceId:'p',text:'Após sair da invisibilidade, o dano aumenta durante 3 segundos.',verificationStatus:'verified',needsRecheck:false});
  assert.ok(rows.some(row=>row.factRole==='capability'&&row.mechanic==='invisibility'));
  assert.ok(rows.some(row=>row.factRole==='dependency'&&row.mechanic==='invisibility'));
  assert.ok(rows.every(row=>row.semanticConfidence<1));
});

test('coverage só considera fatos confirmados e utilizáveis',()=>{
  const profile=hero('x','X',[
    fact('capability','reveal'),
    {...fact('dependency','vision'),review_status:'proposed'},
    {...fact('capability','slow'),needs_recheck:true}
  ]);
  assert.deepEqual(counterCoverageV5(profile),{all:3,confirmed:2,usable:1,verified:1});
});
