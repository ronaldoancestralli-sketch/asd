import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../js/echo-profile-dossier-v15.js',import.meta.url),'utf8');
const {renderProfileDossier,profileDossierState,PROFILE_TIERS,PROFILE_DOSSIER_VERSION} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
// Synthetic fixtures exist only in tests; production always receives the RPC response.
const fixture = {identity:{display_name:'Conta de teste',public_handle:'teste',bio:'',profile_accent:'gold',community_tier:'member'},visual_identity:{authority:'founder',community_tier:'member'}};

test('public and editor use the approved dossier structure',()=>{
  for (const editor of [false,true]) {
    const html=renderProfileDossier(fixture,{editor});
    for (const cls of ['founder-origin-rail','founder-portrait-wrap','founder-nameplate','founder-authority-card','founder-seal','founder-dossier-footer']) assert.ok(html.includes(cls),cls);
    assert.ok(html.includes('Fundador do Echo Arena'));
    assert.ok(html.includes('Direção da plataforma e coerência entre produto, dados e comunidade.'));
    assert.ok(html.includes('Institucional · fora da trilha Scout'));
    assert.ok(!html.includes('<small>TRILHA SCOUT</small>'));
    assert.ok(html.includes('data-tier="unavailable"'));
    assert.ok(html.includes('Conta de teste'));
    assert.ok(html.includes('A identidade por trás da arena'));
    for (const title of ['Direção da plataforma','Coerência do ecossistema','Dados sem atalhos']) assert.ok(html.includes(title),title);
    assert.ok(!/>\s*0[1-9]\s*</.test(html));
  }
});
test('public and editor markup differ only in heading IDs and explicit preview labels',()=>{
  const data={...fixture,identity:{...fixture.identity,profile_visibility:'public'}};
  const publicHtml=renderProfileDossier(data)
    .replaceAll('id="profile-','id="editor-dossier-')
    .replaceAll('aria-labelledby="profile-','aria-labelledby="editor-dossier-')
    .replace('<h1 ','<h2 ').replace('</h1>','</h2>')
    .replace('class="founder-portrait-badge">IDENTIDADE CONFIRMADA','class="founder-portrait-badge">PRÉVIA DO PERFIL')
    .replace('<b>Pública</b>','<b>Pública · prévia</b>');
  assert.equal(publicHtml,renderProfileDossier(data,{editor:true}));
});
test('personal gold does not grant Founder and authority is independent of all seven tiers',()=>{
  assert.equal(Object.keys(PROFILE_TIERS).length,7);
  for (const tier of Object.keys(PROFILE_TIERS)) {
    assert.deepEqual(profileDossierState({identity:{profile_accent:'gold',community_tier:tier}}),{role:'member',tier,accent:'gold',institutional:false});
    assert.equal(profileDossierState({...fixture,visual_identity:{authority:'founder',community_tier:tier}}).role,'founder');
    assert.equal(profileDossierState({...fixture,visual_identity:{authority:'founder',community_tier:tier}}).tier,'unavailable');
    assert.ok(!renderProfileDossier({identity:{profile_accent:'gold',community_tier:tier}}).includes('data-founder-domain'));
  }
});
test('Admin is institutional and never receives a Scout tier',()=>{
  const data={identity:{...fixture.identity,community_tier:'arena_legend'},visual_identity:{authority:'admin',community_tier:'arena_legend',authority_label:'Admin de Heróis'}};
  const state=profileDossierState(data);
  const html=renderProfileDossier(data);
  assert.deepEqual(state,{role:'admin',tier:'unavailable',accent:'gold',institutional:true});
  assert.ok(html.includes('Admin de Heróis'));
  assert.ok(html.includes('Institucional · fora da trilha Scout'));
  assert.ok(!html.includes('<small>TRILHA SCOUT</small>'));
  assert.ok(!html.includes('LENDA DA ARENA'));
});
test('escape public data and reject unsafe avatar URLs',()=>{
  const html=renderProfileDossier({identity:{display_name:'<img onerror="alert(1)">',public_handle:'x" onclick="evil',bio:'<script>bad</script>',avatar_url:'javascript:alert(1)',profile_accent:'gold" onmouseover="evil'},visual_identity:{authority:'founder" onclick="evil',community_tier:'__proto__'}});
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('data-authority="member"'));
  assert.ok(html.includes('data-tier="unavailable"'));
  assert.ok(!html.includes('AUTORIDADE CONFIRMADA'));
});
test('unknown authority and educational showroom are never reported as earned authority',()=>{
  const unknown=renderProfileDossier({identity:fixture.identity},{editor:true,authorityConfirmed:false});
  assert.ok(unknown.includes('CONFIRMANDO IDENTIDADE'));
  assert.ok(!unknown.includes('AUTORIDADE CONFIRMADA'));
  assert.ok(!renderProfileDossier(fixture,{editor:true,authorityConfirmed:false}).includes('data-founder-domain'));
  const demo=renderProfileDossier({identity:fixture.identity,visual_identity:{authority:'member',community_tier:'arena_legend'}},{editor:true,showroom:true});
  assert.ok(demo.includes('SIMULAÇÃO VISUAL · NÃO CONQUISTADO'));
});
test('both routes import the same renderer and cache-busted stylesheet',async()=>{
  for (const path of ['../perfil.html','../meu-perfil.html']) {
    const html=await readFile(new URL(path,import.meta.url),'utf8');
    assert.ok(html.includes(`echo-profile-dossier-v15.css?v=${PROFILE_DOSSIER_VERSION}`));
  }
  for (const path of ['../js/profile-experience-v3.js','../js/my-profile-dossier-v15.js']) {
    const js=await readFile(new URL(path,import.meta.url),'utf8');
    assert.ok(js.includes(`echo-profile-dossier-v15.js?v=${PROFILE_DOSSIER_VERSION}`));
    assert.ok(js.includes('renderProfileDossier('));
  }
});
test('renderer contains no user-specific hardcoding, network calls or reputation writes',()=>{
  for (const forbidden of ['Tatudobem','@tatu','fetch(','supabase','localStorage','reputation_points']) assert.ok(!source.includes(forbidden),forbidden);
});
test('account preview preserves existing controls, updates drafts and observes only tier state',async()=>{
  const rendererUrl=`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  const controller=await readFile(new URL('../js/my-profile-dossier-v15.js',import.meta.url),'utf8');
  const moduleSource=controller.replace(/from '\.\/echo-profile-dossier-v15\.js\?[^']+'/,`from '${rendererUrl}'`);
  let host=null, observed=null, callback=null, moves=0, mirrorRemoved=false;
  const classes=new Set();
  const preview={dataset:{tier:'member'},classList:{contains:value=>classes.has(value)},querySelector(selector){
    if(selector==='[data-own-profile-dossier]') return host;
    if(selector==='.identity-v7-preview-frame') return {before(node){host=node;}};
    return null;
  }};
  const layout={prepend(node){assert.equal(node,preview);moves++;}};
  const oldDocument=globalThis.document,oldObserver=globalThis.MutationObserver;
  globalThis.document={body:{dataset:{}},getElementById:id=>id==='identity-v7-preview'?preview:id==='my-profile-editor'?layout:null,
    createElement:()=>({dataset:{},innerHTML:''}),querySelector:()=>({remove(){mirrorRemoved=true;}})};
  globalThis.MutationObserver=class{constructor(fn){callback=fn;}observe(node,options){assert.equal(node,preview);observed=options;}};
  try {
    const {updateOwnDossierIdentity,updateOwnDossierAuthority}=await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);
    updateOwnDossierAuthority({institutional_role:'founder'});
    updateOwnDossierIdentity({...fixture.identity,profile_visibility:'public'});
    assert.equal(moves,1);assert.equal(mirrorRemoved,true);
    assert.equal(preview.dataset.sharedProfileReady,'true');
    assert.deepEqual(observed,{attributes:true,attributeFilter:['data-tier','class']});
    assert.ok(host.innerHTML.includes('data-authority="founder"'));
    updateOwnDossierIdentity({display_name:'Nome editado',profile_accent:'cyan',profile_visibility:'private'});
    assert.ok(host.innerHTML.includes('Nome editado'));
    assert.ok(host.innerHTML.includes('data-accent="cyan"'));
    assert.ok(host.innerHTML.includes('Privada · prévia'));
    assert.equal(moves,1);
    preview.dataset.tier='arena_legend';classes.add('is-showroom');callback();
    assert.ok(host.innerHTML.includes('data-tier="unavailable"'));
    assert.ok(host.innerHTML.includes('SIMULAÇÃO VISUAL · NÃO CONQUISTADO'));
    assert.ok(host.innerHTML.includes('data-authority="founder"'));
  } finally {globalThis.document=oldDocument;globalThis.MutationObserver=oldObserver;}
});
