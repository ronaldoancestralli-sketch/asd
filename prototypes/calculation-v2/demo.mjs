import { calculateBuild, calculateTeam, POLICY_ID } from './engine.mjs';

const root = document.getElementById('ea-engine-lab');
const $ = selector => root.querySelector(selector);
const $$ = selector => [...root.querySelectorAll(selector)];
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = value => value === null || value === undefined ? '—' : value.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const rarities = ['Comum','Raro','Épico','Lendário','Mítico','Supremo','Grandioso','Celestial','Estelar','Imortal','Divino'];
const values = array => Object.fromEntries(rarities.map((r,i) => [r,array[i]]));
const all = amount => Object.fromEntries(rarities.map(r => [r,amount]));
const policy = { id: POLICY_ID, reference: 'Política demonstrativa: percentuais somados sobre a base; não validada como regra do jogo.' };
const definitions = [
  {id:'hero.health',label:'Vida',unit:'pontos',policy},
  {id:'hero.armor',label:'Armadura',unit:'pontos',policy},
  {id:'hero.speed',label:'Velocidade',unit:'unidade do cadastro',policy},
  {id:'weapon.magazine',label:'Carregador',unit:'munições',policy},
  {id:'weapon.range.aimed',label:'Alcance com mira',unit:'unidade não validada',policy},
  {id:'weapon.spread.moving',label:'Dispersão em movimento',unit:'unidade não validada',policy}
];
const effect = (id,target,operation,amounts,description,extra={}) => ({id,kind:'numeric',target,operation,values:amounts,description,scope:'self',source:{kind:'fixture',reference:'Vínculo demonstrativo; não publicado nem validado como regra do jogo.'},ruleStatus:'reviewed',...extra});
const equipment = [
  {id:'arm',name:'A.R.M. Implante Sombrio',note:'Valores do cadastro · vínculos de teste',effects:[
    effect('arm.range','weapon.range.aimed','flat',values([10,12,14,null,18,20,22,23,24,25,25]),'Alcance do tiro com mira do herói',{condition:'aiming'}),
    effect('arm.magazine','weapon.magazine','flat',values([1,2,3,null,5,5,5,5,6,6,7]),'Tamanho do carregador da arma do herói')
  ]},
  {id:'health-test',name:'Colete · teste',note:'Item fictício · +100 de vida',effects:[effect('test.health','hero.health','flat',all(100),'Aumenta a vida máxima')]},
  {id:'speed-test',name:'Botas · teste',note:'Item fictício · +10% de velocidade',effects:[effect('test.speed','hero.speed','percent',all(10),'Aumenta a velocidade em movimento',{condition:'moving'})]},
  {id:'spread-test',name:'Estabilizador · teste',note:'Item fictício · dispersão em movimento',effects:[effect('test.spread','weapon.spread.moving','percent',all(-20),'Reduz a dispersão em movimento',{condition:'moving'})]},
  {id:'team-test',name:'Emissor de equipe · teste',note:'Item fictício · +10% de vida para todos',effects:[effect('test.team.health','hero.health','percent',all(10),'Aumenta a vida dos membros da equipe',{scope:'team'})]},
  {id:'info-test',name:'Sinalizador · teste',note:'Item fictício · informação sem cálculo',effects:[{id:'test.info',kind:'informational',scope:'self',description:'Exibe uma marca visual. Não altera um atributo numérico.'}]}
];
// Snapshot de SELECT remoto de 14/09/2026. Apenas estes campos exatos são mapeados.
// weapon_range, weapon_spread e moving_spread_modifier NÃO viram bases de mira/movimento por semelhança.
const heroes = [
  {id:'4c5c95c5-5c46-45d3-990d-2efbc601d4ad',name:'Slayer',base:{'hero.health':811,'hero.armor':811,'hero.speed':51,'weapon.magazine':5,'weapon.range.aimed':null,'weapon.spread.moving':null}},
  {id:'cd681075-8f31-48eb-b416-134581d6432c',name:'Bastion',base:{'hero.health':1905,'hero.armor':10,'hero.speed':14,'weapon.magazine':100,'weapon.range.aimed':null,'weapon.spread.moving':null}},
  {id:'24dce7bd-1f15-48ed-91a2-c7a3e5b192e0',name:'Freddie',base:{'hero.health':1262,'hero.armor':5,'hero.speed':75,'weapon.magazine':30,'weapon.range.aimed':null,'weapon.spread.moving':null}}
];
const builds = heroes.map((hero,i) => ({id:'member-'+i,hero,slots:[null,null,null,null,null,null],conditions:{moving:false,aiming:true}}));
builds[0].slots[0] = {equipmentId:'arm',rarity:'Comum'};
const state = {member:0,view:'build',stat:'weapon.magazine',item:'arm',effect:0,rarities:['Comum','Comum','Comum']};
const badges = {calculated:'Calculado neste teste',pending:'Com pendências',invalid:'Configuração inválida',unchanged:'Base preservada'};
const conditionLabel = {moving:'Em movimento',aiming:'Com mira'};
const reasons = {BASE_UNKNOWN:'Falta a base exata deste atributo',POLICY_UNKNOWN:'Regra de combinação não definida',RULE_NOT_REVIEWED:'Vínculo ainda não confirmado',RARITY_VALUE_UNKNOWN:'Valor desta raridade não informado',CONDITION_UNKNOWN:'Condição não informada',EFFECT_PENDING:'Há efeitos pendentes',NUMERIC_OVERFLOW:'Resultado fora do limite numérico'};
let lastTeam;

function options(items,value) { return items.map(([id,label])=>`<option value="${escape(id)}"${id===value?' selected':''}>${escape(label)}</option>`).join(''); }
function setView(view) { state.view=view;$$('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==view);$$('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));if(view==='edit')renderEditor(); }
function selectedItem() { return equipment.find(item=>item.id===state.item); }
function heroBuild() { return builds[state.member]; }
function statResult(stat) {
  if (!stat) return '<span class="ea-invalid">Configuração inválida</span>';
  if (stat.status==='pending' || stat.status==='invalid') return `<span class="ea-${stat.status}">Pendente</span><small class="ea-result-label">${escape(reasons[stat.trace.find(t=>t.status==='pending')?.code] || reasons[stat.reasons[0]?.code] || 'Revise a configuração')}</small>`;
  return `<span class="${stat.status==='calculated'?'ea-calculated':''}">${number(stat.final)}</span><small class="ea-result-label">${stat.status==='calculated'?'Aplicado neste teste':'Sem efeito aplicado'}</small>`;
}
function calculate() {
  lastTeam=calculateTeam({definitions,equipment,builds});
  return lastTeam.members[state.member];
}
function renderRoster() {
  $('#ea-roster').innerHTML=builds.map((b,i)=>`<button type="button" data-member="${i}" aria-pressed="${i===state.member}"><span class="ea-avatar">${escape(b.hero.name.slice(0,2).toUpperCase())}</span><span>${escape(b.hero.name)}<small>${b.slots.filter(Boolean).length}/6 equipamentos</small></span></button>`).join('');
  $$('[data-member]').forEach(b=>b.addEventListener('click',()=>{state.member=Number(b.dataset.member);renderBuild();}));
}
function renderSlots() {
  const build=heroBuild();
  $('#ea-slot-count').textContent=`${build.slots.filter(Boolean).length} de 6 slots`;
  $('#ea-slots').innerHTML=build.slots.map((slot,i)=>{
    const item=equipment.find(e=>e.id===slot?.equipmentId);
    return `<div class="ea-slot"><div class="ea-slot-head"><span>SLOT ${i+1}</span>${item?`<button type="button" data-edit-slot="${i}">Ajustar</button>`:''}</div><label><span class="ea-result-label">Equipamento</span><select aria-label="Equipamento do slot ${i+1}" data-slot="${i}">${options([['','Vazio'],...equipment.filter(e=>e.id===slot?.equipmentId||!build.slots.some(s=>s?.equipmentId===e.id)).map(e=>[e.id,e.name])],slot?.equipmentId||'')}</select></label><small>${escape(item?.note||'Escolha um equipamento')}</small></div>`;
  }).join('');
  $$('[data-slot]').forEach(select=>select.addEventListener('change',()=>{build.slots[Number(select.dataset.slot)]=select.value?{equipmentId:select.value,rarity:state.rarities[state.member]}:null;renderBuild();}));
  $$('[data-edit-slot]').forEach(button=>button.addEventListener('click',()=>{state.item=build.slots[Number(button.dataset.editSlot)].equipmentId;state.effect=0;setView('edit');}));
}
function renderResults(result) {
  $('#ea-status').textContent=badges[result?.status||'invalid'];
  $('#ea-errors').innerHTML=lastTeam.errors.length?`<div class="ea-errors">${lastTeam.errors.map(e=>escape(e.message)).join('<br>')}</div>`:'';
  $('#ea-results').innerHTML=`<table><thead><tr><th>Atributo</th><th class="ea-number">Base</th><th class="ea-number">Com a build</th></tr></thead><tbody>${definitions.map(d=>{const s=result?.stats[d.id];return `<tr><td><button type="button" class="ea-stat-button" data-stat="${d.id}" aria-pressed="${state.stat===d.id}">${escape(d.label)}</button></td><td class="ea-number">${number(s?.base)}</td><td class="ea-number">${statResult(s)}</td></tr>`;}).join('')}</tbody></table>`;
  $$('[data-stat]').forEach(b=>b.addEventListener('click',()=>{state.stat=b.dataset.stat;renderResults(result);renderTrace(result);}));
}
function renderTrace(result) {
  const stat=result?.stats[state.stat];
  $('#ea-trace-label').textContent=definitions.find(d=>d.id===state.stat)?.label||'';
  if(!stat){$('#ea-trace').innerHTML='<div class="ea-empty">Corrija a configuração para calcular.</div>';return;}
  let content=`<div class="ea-trace-line"><span>Base do herói<small>${escape(heroBuild().hero.name)} · ${escape(stat.unit)}</small></span><span>${stat.base===null?'Não informada':number(stat.base)}</span></div>`;
  content+=stat.trace.map(t=>`<div class="ea-trace-line ${t.status==='pending'?'ea-trace-pending':''}"><span>${escape(t.equipmentName)}<small>${escape(t.description)}${t.scope==='team'?' · Equipe':''}${t.condition.key?' · '+escape(conditionLabel[t.condition.key]||t.condition.key):''}</small></span><span>${t.status==='applied'?(t.delta>=0?'+':'')+number(t.delta):t.status==='inactive'?'Não ativo':escape(reasons[t.code]||t.reason)}${t.status==='applied'&&t.operation==='percent'?`<small>${number(t.amount)}% da base</small>`:''}</span></div>`).join('');
  if(!stat.trace.length)content+='<div class="ea-empty">Nenhum equipamento altera este atributo.</div>';
  if(stat.final===null&&stat.knownSubtotal!==null)content+=`<div class="ea-trace-line ea-trace-pending"><span>Subtotal conhecido<small>Resultado final pendente</small></span><span>${number(stat.knownSubtotal)}</span></div>`;
  content+=`<div class="ea-trace-line"><span>Resultado neste cenário</span><span>${statResult(stat)}</span></div>`;
  $('#ea-trace').innerHTML=`<div class="ea-trace-lines">${content}</div>`;
}
function renderTeam() {
  $('#ea-team').innerHTML=`<table><thead><tr><th>Herói</th><th class="ea-number">Vida</th><th class="ea-number">Carregador</th><th class="ea-number">Efeitos recebidos</th></tr></thead><tbody>${lastTeam.members.map((r,i)=>`<tr><td>${escape(builds[i].hero.name)}</td><td class="ea-number">${number(r.stats['hero.health']?.final)}</td><td class="ea-number">${number(r.stats['weapon.magazine']?.final)}</td><td class="ea-number">${r.effects.filter(t=>t.scope==='team'&&t.status==='applied').length}</td></tr>`).join('')}</tbody></table>`;
}
function renderBuild() {
  renderRoster();renderSlots();
  $('#ea-movement').value=String(heroBuild().conditions.moving??'unknown');
  $('#ea-aiming').value=String(heroBuild().conditions.aiming??'unknown');
  $('#ea-rarity').innerHTML=options(rarities.map(r=>[r,r]),state.rarities[state.member]);
  const result=calculate();renderResults(result);renderTrace(result);renderTeam();
}
function renderEditor() {
  const item=selectedItem();const fx=item.effects[state.effect];
  $('#ea-edit-item').innerHTML=options(equipment.map(e=>[e.id,e.name]),state.item);
  $('#ea-effect-picker').innerHTML=item.effects.map((e,i)=>`<button type="button" data-effect="${i}" aria-pressed="${i===state.effect}">Efeito ${i+1}</button>`).join('');
  $$('[data-effect]').forEach(b=>b.addEventListener('click',()=>{state.effect=Number(b.dataset.effect);renderEditor();}));
  $('#ea-effect-fields').innerHTML=fx.kind==='informational'?`<div class="ea-empty">${escape(fx.description)}<br>Efeito informativo, sem cálculo.</div>`:`<div class="ea-effect-fields"><label>Descrição do efeito<textarea id="ea-description">${escape(fx.description)}</textarea></label><label>Atributo que recebe o efeito<select id="ea-target">${options(definitions.map(d=>[d.id,d.label+' · '+(d.id.startsWith('hero.')?'Herói':'Arma')]),fx.target)}</select></label><div class="ea-pair"><label>Operação<select id="ea-operation">${options([['flat','Valor fixo (+ / −)'],['percent','Percentual (+% / −%)']],fx.operation)}</select></label><label>Quando se aplica<select id="ea-condition">${options([['always','Sempre'],['moving','Em movimento'],['aiming','Com mira']],fx.condition||'always')}</select></label></div><div class="ea-pair"><label>Quem recebe<select id="ea-scope">${options([['self','Este herói'],['team','Toda a equipe']],fx.scope)}</select></label><label>Vínculo neste protótipo<select id="ea-rule">${options([['reviewed','Confirmado para teste'],['draft','Pendente de revisão']],fx.ruleStatus)}</select></label></div><small class="ea-pending">${fx.scope==='team'&&fx.condition?'A condição é verificada no herói que recebe o efeito.':'Valores negativos reduzem; positivos aumentam.'}</small></div>`;
  if(fx.kind==='numeric'){
    $('#ea-description').addEventListener('input',e=>{fx.description=e.target.value;renderTest();});
    for(const [id,key] of [['ea-target','target'],['ea-operation','operation'],['ea-scope','scope'],['ea-rule','ruleStatus']])$('#'+id).addEventListener('change',e=>{fx[key]=e.target.value;if(fx.scope==='team'&&fx.condition)fx.evaluatedOn='recipient';else delete fx.evaluatedOn;renderEditor();});
    $('#ea-condition').addEventListener('change',e=>{if(e.target.value==='always'){delete fx.condition;delete fx.evaluatedOn;}else {fx.condition=e.target.value;if(fx.scope==='team')fx.evaluatedOn='recipient';}renderEditor();});
  }
  const numeric=item.effects.filter(e=>e.kind==='numeric');
  $('#ea-rarity-table').innerHTML=numeric.length?`<table><thead><tr><th>Raridade</th>${numeric.map((e,i)=>`<th class="ea-number">Efeito ${i+1}</th>`).join('')}</tr></thead><tbody>${rarities.map(r=>`<tr class="${r===state.rarities[state.member]?'ea-selected-rarity':''}"><td>${r}</td>${numeric.map(e=>`<td class="ea-number"><input aria-label="${escape(r+' · '+e.description)}" data-value-effect="${escape(e.id)}" data-rarity="${r}" inputmode="decimal" value="${e.values[r]??''}" placeholder="—"></td>`).join('')}</tr>`).join('')}</tbody></table>`:'<div class="ea-empty">Sem valores numéricos.</div>';
  $$('[data-value-effect]').forEach(input=>input.addEventListener('input',()=>{const e=item.effects.find(x=>x.id===input.dataset.valueEffect);const raw=input.value.trim();e.values[input.dataset.rarity]=raw===''?null:/^[+-]?\d+(?:[.,]\d+)?$/.test(raw)?Number(raw.replace(',','.')):NaN;input.setAttribute('aria-invalid',String(Number.isNaN(e.values[input.dataset.rarity])));renderTest();}));
  renderTest();
}
function renderTest(){
  const item=selectedItem();const build=structuredClone(heroBuild());
  // Preview isolada do item selecionado: não o insere silenciosamente na build do usuário.
  build.slots=[{equipmentId:item.id,rarity:state.rarities[state.member]},null,null,null,null,null];
  const result=calculateBuild({definitions,equipment,build});
  $('#ea-test-context').textContent=`${build.hero.name} · ${state.rarities[state.member]} · somente este equipamento`;
  if(result.errors.length){$('#ea-test-result').innerHTML=`<div class="ea-errors">${result.errors.map(e=>escape(e.message)).join('<br>')}</div>`;return;}
  const targets=[...new Set(item.effects.filter(e=>e.kind==='numeric').map(e=>e.target))];
  $('#ea-test-result').innerHTML=targets.length?`<div class="ea-test-grid">${targets.map(id=>{const s=result.stats[id];return `<div class="ea-test-cell"><small>${escape(s.label)} · base ${number(s.base)}</small><strong>${statResult(s)}</strong></div>`;}).join('')}</div>`:'<div class="ea-empty">Informativo: nenhum valor da build é alterado.</div>';
}
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>{setView(b.dataset.view);if(state.view==='build')renderBuild();}));
$('#ea-return-build').addEventListener('click',()=>{setView('build');renderBuild();});
$('#ea-edit-item').addEventListener('change',e=>{state.item=e.target.value;state.effect=0;renderEditor();});
for(const [selector,key] of [['#ea-movement','moving'],['#ea-aiming','aiming']])$(selector).addEventListener('change',e=>{heroBuild().conditions[key]=e.target.value==='unknown'?null:e.target.value==='true';renderBuild();});
$('#ea-rarity').addEventListener('change',e=>{state.rarities[state.member]=e.target.value;heroBuild().slots.forEach(s=>{if(s)s.rarity=e.target.value;});renderBuild();});
renderBuild();
if(globalThis.Tweak){const design={radius:12};const tweak=new globalThis.Tweak({container:root,onChange:()=>root.style.setProperty('--ea-radius',design.radius+'px')});tweak.addSlider(design,'radius',{label:'Cantos dos slots',min:0,max:20,unit:'px'});}
