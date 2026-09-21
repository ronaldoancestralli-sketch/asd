import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';

const $ = id => document.getElementById(id);

function esc(value=''){
  return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
}
function num(value){ return new Intl.NumberFormat('pt-BR').format(Number(value||0)); }
function message(text='',type=''){
  const el=$('health-message'); if(!el)return;
  el.textContent=text; el.className=`health-message${text?' show':''}${type?` ${type}`:''}`;
}
function empty(text){ return `<div class="health-empty">${esc(text)}</div>`; }
function row({title,detail,badge='Atenção',variant='',actions=[]}){
  return `<div class="health-row"><div class="health-row-copy"><strong>${esc(title)}</strong><span>${esc(detail)}</span></div><div class="health-row-actions"><span class="health-badge ${esc(variant)}">${esc(badge)}</span>${actions.map(action=>`<a class="admin-button" href="${esc(action.href)}"${action.external?' target="_blank" rel="noopener"':''}>${esc(action.label)}</a>`).join('')}</div></div>`;
}

async function healthSnapshot(){
  const { data,error }=await supabase.rpc('echo_admin_system_health');
  if(error) throw error;
  return data||{};
}

function renderSummary(health){
  const heroIssues=Number(health.heroes?.enabled_missing_class||0)+Number(health.heroes?.enabled_missing_media||0)+Number(health.heroes?.enabled_missing_base_stats||0);
  const auditOpen=Number(health.equipments?.audit_open||0);
  const buildIssues=Number(health.builds?.orphan_items||0)+Number(health.builds?.missing_hero||0);
  const legacy=Number(health.equipments?.legacy_table_rows||0);
  const moduleIssues=(health.modules||[]).reduce((sum,item)=>sum+Number(item?.issues||0),0);
  const cards=[
    {label:'Heróis incompletos',value:heroIssues,detail:'Classe, mídia ou atributos-base ausentes.',attention:heroIssues>0},
    {label:'Auditoria pendente',value:auditOpen,detail:'Registros aguardando revisão de atributos.',attention:auditOpen>0},
    {label:'Builds inconsistentes',value:buildIssues,detail:'Referências quebradas detectadas.',attention:buildIssues>0},
    {label:'Módulos com pendência',value:moduleIssues,detail:'Problemas reais somados entre os módulos do site.',attention:moduleIssues>0},
    {label:'Linhas legadas',value:legacy,detail:'Registros preservados na tabela antiga equipment.',attention:legacy>0}
  ];
  $('health-summary').innerHTML=cards.map(card=>`<article class="health-card ${card.attention?'attention':'ok'}"><small>${esc(card.label)}</small><strong>${num(card.value)}</strong><span>${esc(card.detail)}</span></article>`).join('');
}

async function renderHeroIssues(){
  const [heroesResult,statsResult]=await Promise.all([
    supabase.from('heroes').select('id,name,slug,class_id,enabled,card_image_path,image_path,card_image_url,image_url').eq('enabled',true).order('display_order',{ascending:true}),
    supabase.from('hero_complete_base_stats').select('hero_id')
  ]);
  if(heroesResult.error) throw heroesResult.error;
  if(statsResult.error) throw statsResult.error;
  const heroesWithStats=new Set((statsResult.data||[]).map(row=>String(row.hero_id)));
  const issues=(heroesResult.data||[]).map(hero=>{
    const problems=[];
    if(!hero.class_id) problems.push('classe não definida');
    if(!String(hero.card_image_path||hero.image_path||hero.card_image_url||hero.image_url||'').trim()) problems.push('mídia principal ausente');
    if(!heroesWithStats.has(String(hero.id))) problems.push('atributos-base ausentes');
    return {hero,problems};
  }).filter(item=>item.problems.length);
  $('health-heroes').innerHTML=issues.length?issues.map(({hero,problems})=>row({title:hero.name||hero.slug||'Herói sem nome',detail:problems.join(' · '),badge:'Corrigir',variant:'red',actions:[{label:'Abrir editor',href:`./hero-editor.html?id=${encodeURIComponent(hero.id)}`},{label:'Status',href:`./hero-stats.html?id=${encodeURIComponent(hero.id)}`}]})).join(''):empty('Nenhum herói ativo com ausência de classe, mídia ou atributos-base.');
}

async function renderAuditIssues(){
  const { data,error }=await supabase.from('equipment_audit_queue').select('id,equipment_id,equipment_name,severity,issue_type,status,rarity_name,attribute_key,updated_at').neq('status','resolved').order('updated_at',{ascending:false}).limit(12);
  if(error) throw error;
  const issues=data||[];
  $('health-audit').innerHTML=issues.length?issues.map(item=>row({title:item.equipment_name||'Equipamento',detail:[item.rarity_name,item.attribute_key,item.issue_type].filter(Boolean).join(' · '),badge:item.severity||item.status||'Pendente',variant:/block|critical|error/i.test(String(item.severity||''))?'red':'',actions:[{label:'Auditoria',href:`./equipment-audit.html?equipment=${encodeURIComponent(item.equipment_id)}`},{label:'Editor',href:`./equipment-editor.html?id=${encodeURIComponent(item.equipment_id)}`}]})).join(''):empty('Nenhuma pendência ativa na fila da Auditoria.');
}

function renderBuildIntegrity(health){
  const orphan=Number(health.builds?.orphan_items||0);
  const missingHero=Number(health.builds?.missing_hero||0);
  const items=[];
  if(orphan) items.push(row({title:'Itens de build sem equipamento',detail:`${num(orphan)} referência(s) não encontram equipamento na tabela canônica.`,badge:'Corrigir',variant:'red',actions:[{label:'Ver builds',href:'./builds.html'}]}));
  if(missingHero) items.push(row({title:'Builds sem herói válido',detail:`${num(missingHero)} build(s) apontam para herói inexistente.`,badge:'Corrigir',variant:'red',actions:[{label:'Ver builds',href:'./builds.html'}]}));
  $('health-builds').innerHTML=items.length?items.join(''):empty('Nenhuma referência quebrada foi detectada entre builds, heróis e equipamentos.');
}

function renderModules(health){
  const target=$('health-modules'); if(!target)return;
  const modules=Array.isArray(health.modules)?health.modules:[];
  if(!modules.length){ target.innerHTML=empty('O backend ainda não retornou o diagnóstico dos módulos.'); return; }
  target.innerHTML=modules.map(module=>{
    const total=Number(module.total||0);
    const visible=Number(module.visible||0);
    const issues=Number(module.issues||0);
    let badge='Operacional'; let variant='green';
    if(issues>0){ badge='Revisar'; variant='red'; }
    else if(total===0){ badge='Pronto · sem conteúdo'; variant=''; }
    else if(visible===0){ badge='Sem publicação'; variant=''; }
    const detail=issues>0
      ? `${num(total)} registro(s) · ${num(visible)} visível(is) · ${num(issues)} pendência(s) real(is).`
      : total===0
        ? 'Estrutura conectada ao banco, ainda sem registros cadastrados.'
        : `${num(total)} registro(s) · ${num(visible)} disponível(is) no site · nenhuma inconsistência estrutural detectada.`;
    return row({
      title:module.label||module.key||'Módulo',
      detail,
      badge,
      variant,
      actions:[
        {label:'Administrar',href:module.admin_url||'#'},
        {label:'Abrir site ↗',href:module.public_url||'../index.html',external:true}
      ]
    });
  }).join('');
}

async function renderLegacy(health){
  const count=Number(health.equipments?.legacy_table_rows||0);
  if(!count){ $('health-legacy').innerHTML=empty('Nenhuma linha na tabela antiga equipment.'); return; }
  const { data,error }=await supabase.from('equipment').select('id,name').order('name',{ascending:true});
  if(error){ $('health-legacy').innerHTML=row({title:'Tabela legada contém registros',detail:`${num(count)} linha(s) existem, mas a leitura detalhada falhou.`,badge:'Revisar'}); return; }
  $('health-legacy').innerHTML=(data||[]).map(item=>row({title:item.name||'Registro sem nome',detail:'Existe somente na tabela legada “equipment”. Não é mesclado nem apagado automaticamente.',badge:'Legado',variant:'red'})).join('')+`<div class="health-note"><strong>Proteção:</strong> o site e o novo painel usam <code>equipments</code> como tabela canônica. Os registros acima permanecem intactos até uma migração deliberada.</div>`;
}

async function load(){
  const button=$('health-refresh'); if(button) button.disabled=true;
  message('Atualizando diagnóstico do banco e dos módulos…');
  try{
    const health=await healthSnapshot();
    renderSummary(health);
    await Promise.all([renderHeroIssues(),renderAuditIssues(),renderLegacy(health)]);
    renderBuildIntegrity(health);
    renderModules(health);
    message(`Diagnóstico atualizado. Gerado em ${new Date(health.generated_at||Date.now()).toLocaleString('pt-BR')}.`);
  }catch(error){
    console.error('[data-health]',error);
    message(`Não foi possível atualizar a central: ${error.message}`,'error');
  }finally{ if(button) button.disabled=false; }
}

$('health-refresh')?.addEventListener('click',load);
load();
