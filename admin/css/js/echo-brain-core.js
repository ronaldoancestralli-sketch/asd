import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';
import { loadEquipmentBrainHealth } from './echo-brain-equipment-health.js?v=1&sb=20260823-security-supabase-pin-1';

export const BRAIN_THRESHOLDS=Object.freeze({minTrios:12,minMatches:120,minValidationRows:3});
const OBSERVATION_SOURCES=Object.freeze([
  {key:'teamSynergies',table:'team_synergies',label:'Agregados legados'},
  {key:'heroSynergies',table:'hero_synergies',label:'Sinergias em pares'},
  {key:'heroMetrics',table:'hero_metrics',label:'Métricas por herói'},
  {key:'heroMatchups',table:'hero_matchups',label:'Matchups'},
  {key:'seasons',table:'seasons',label:'Temporadas'}
]);

function number(value,fallback=0){const parsed=Number(value);return Number.isFinite(parsed)?parsed:fallback;}
function clamp(value,min,max){return Math.max(min,Math.min(max,number(value,min)));}
function sum(rows,key){return(rows||[]).reduce((total,row)=>total+Math.max(0,number(row?.[key])),0);}
async function countRows(table){const{count,error}=await supabase.from(table).select('id',{count:'exact',head:true});return{count:error?null:(count??0),error:error||null};}
async function fetchPaged(table,columns,{pageSize=500,maxRows=5000,order=null}={}){const rows=[];let offset=0,error=null,truncated=false;while(offset<maxRows){const end=Math.min(offset+pageSize-1,maxRows-1);let query=supabase.from(table).select(columns).range(offset,end);if(order?.column)query=query.order(order.column,{ascending:order.ascending!==false});const result=await query;if(result.error){error=result.error;break;}const batch=result.data||[];rows.push(...batch);if(batch.length<pageSize)break;offset+=pageSize;}if(!error&&rows.length>=maxRows)truncated=true;return{rows,error,truncated};}

function emptyRegistry(error=null){return{settings:null,models:{exists:false,accessible:false,rows:[],error},training:{exists:false,accessible:false,rows:[],error},activations:{rows:[],error},evaluations:{rows:[],error},actions:{rows:[],error},pipeline:{batches:0,observations:0,verifiedObservations:0,organicVerifiedObservations:0,brainInfluencedObservations:0,distinctOrganicTrios:0,latestBatch:null},shadow:{total:0,champion:0,challenger:0,byModel:[]},backtests:{rows:[],error},backtestResults:{rows:[],error},error};}
async function fetchRegistrySnapshot(){
  const{data,error}=await supabase.rpc('admin_echo_brain_registry_snapshot');
  if(error)return emptyRegistry(error);
  const payload=Array.isArray(data)?(data[0]||{}):(data||{}),fallback=emptyRegistry(null);
  return{
    settings:payload.settings||null,
    models:{exists:true,accessible:true,rows:Array.isArray(payload.models)?payload.models:[],error:null},
    training:{exists:true,accessible:true,rows:Array.isArray(payload.trainingRuns)?payload.trainingRuns:[],error:null},
    activations:{rows:Array.isArray(payload.activations)?payload.activations:[],error:null},
    evaluations:{rows:Array.isArray(payload.evaluations)?payload.evaluations:[],error:null},
    actions:{rows:Array.isArray(payload.actions)?payload.actions:[],error:null},
    pipeline:{...fallback.pipeline,...(payload.pipeline||{})},
    shadow:{...fallback.shadow,...(payload.shadow||{}),byModel:Array.isArray(payload.shadow?.byModel)?payload.shadow.byModel:[]},
    backtests:{rows:Array.isArray(payload.backtests)?payload.backtests:[],error:null},
    backtestResults:{rows:Array.isArray(payload.backtestResults)?payload.backtestResults:[],error:null},
    error:null
  };
}

function findActiveModel(rows=[],settings=null){const activeId=settings?.active_model_id;if(activeId){const byId=rows.find(row=>row?.id===activeId);if(byId)return byId;}return rows.find(row=>String(row?.status||'').toLowerCase()==='active')||null;}
function modelInfluence(model){if(!model)return 0;for(const key of['influence_weight','influence','max_influence','historical_weight']){const value=number(model?.[key],NaN);if(Number.isFinite(value))return clamp(value>1?value/100:value,0,.55);}return 0;}
function thresholdsFromSettings(settings){return{minTrios:Math.max(3,number(settings?.min_trios,BRAIN_THRESHOLDS.minTrios)),minMatches:Math.max(1,number(settings?.min_matches,BRAIN_THRESHOLDS.minMatches)),minValidationRows:Math.max(1,number(settings?.min_validation_rows,BRAIN_THRESHOLDS.minValidationRows))};}

function deriveHealth(registries,activeModel){
  if(!activeModel)return{key:'idle',label:'SEM MODELO',tone:'idle',reason:'Nenhum modelo ativo para reavaliar.',latestEvaluation:null};
  const latest=(registries.evaluations.rows||[]).find(row=>row?.model_id===activeModel.id)||null;
  if(!latest)return{key:'waiting',label:'AGUARDANDO JANELA',tone:'observing',reason:'O modelo ainda não possui avaliação pós-ativação.',latestEvaluation:null};
  const status=String(latest.status||'watch').toLowerCase();
  if(status==='drift')return{key:'drift',label:'DRIFT DETECTADO',tone:'danger',reason:'Comportamento novo se afastou da referência de treino ou da baseline.',latestEvaluation:latest};
  if(status==='watch')return{key:'watch',label:'EM OBSERVAÇÃO',tone:'warning',reason:'Há sinal de mudança, mas ainda não há motivo automático para trocar o modelo.',latestEvaluation:latest};
  return{key:'healthy',label:'SAUDÁVEL',tone:'active',reason:'A última janela pós-ativação permanece dentro das referências atuais.',latestEvaluation:latest};
}

function applyEquipmentKnowledgeHealth(baseHealth,equipmentEvolution){
  if(!equipmentEvolution?.available||!equipmentEvolution?.stale)return baseHealth;
  if(equipmentEvolution.pendingTraining>0){
    return{
      ...baseHealth,
      key:'equipment-drift',
      label:'ITENS ALTERADOS',
      tone:'danger',
      reason:`${equipmentEvolution.pendingTraining} mudança(s) de comportamento de equipamento aguardam reconciliação/novo treino. O Brain não trata conhecimento antigo como atual.`,
      compositionHealth:baseHealth
    };
  }
  return{
    ...baseHealth,
    key:'equipment-stale',
    label:'ITENS EM RECONCILIAÇÃO',
    tone:'warning',
    reason:`${equipmentEvolution.pendingItems||0} equipamento(s) e ${equipmentEvolution.pendingInvalidations||0} invalidação(ões) aguardam reavaliação.`,
    compositionHealth:baseHealth
  };
}

function deriveLifecycle({teamCount,totalMatches,validationRows,registries,criticalError}){
  const settings=registries.settings||null,thresholds=thresholdsFromSettings(settings),activeModel=findActiveModel(registries.models.rows,settings),suspendedModel=registries.models.rows.find(row=>['suspended','rejected'].includes(String(row?.status||'').toLowerCase()))||null,enoughData=teamCount>=thresholds.minTrios&&totalMatches>=thresholds.minMatches&&validationRows>=thresholds.minValidationRows;
  if(settings?.emergency_enabled===true)return{key:'emergency',label:'EMERGÊNCIA',tone:'danger',reason:'Modo de emergência ativo: influência, treino, avaliação, Shadow e troca de modelo estão congelados. A memória foi preservada.',influence:0,activeModel,thresholds};
  if(criticalError)return{key:'degraded',label:'DEGRADADO',tone:'danger',reason:'Uma ou mais fontes obrigatórias não puderam ser lidas.',influence:0,activeModel:null,thresholds};
  if(activeModel&&settings?.learning_enabled===true){const effectiveInfluence=Math.min(modelInfluence(activeModel),clamp(settings?.max_influence,0,.55));return{key:'active',label:'ATIVO',tone:'active',reason:'Modelo validado, testado em replay e Shadow, com kill switch liberado.',influence:effectiveInfluence,activeModel,thresholds};}
  if(activeModel&&settings?.learning_enabled!==true)return{key:'suspended',label:'SUSPENSO',tone:'warning',reason:'Existe um modelo ativo, mas a influência pública permanece em 0%.',influence:0,activeModel,thresholds};
  if(suspendedModel)return{key:'suspended',label:'SUSPENSO',tone:'warning',reason:'Há um modelo rejeitado ou suspenso; o aprendizado não influencia o site.',influence:0,activeModel:null,thresholds};
  if(enoughData&&registries.models.exists&&registries.training.exists)return{key:'candidate',label:'PRONTO PARA CANDIDATO',tone:'ready',reason:'A memória verificada atingiu os mínimos para treino temporal.',influence:0,activeModel:null,thresholds};
  if(teamCount>0||totalMatches>0)return{key:'observing',label:'OBSERVANDO',tone:'observing',reason:'Observações verificadas começaram a chegar, mas a amostra ainda é insuficiente.',influence:0,activeModel:null,thresholds};
  return{key:'cold-start',label:'COLD START',tone:'idle',reason:'Ainda não existem partidas verificadas no pipeline do Brain.',influence:0,activeModel:null,thresholds};
}

export async function loadBrainSnapshot(){
  const countsEntries=await Promise.all(OBSERVATION_SOURCES.map(async source=>[source.key,await countRows(source.table)])),counts=Object.fromEntries(countsEntries);
  const[teamData,skillsData,seasonsData,registries,equipmentEvolution]=await Promise.all([
    fetchPaged('team_synergies','id,season_id,matches,wins,win_rate,synergy_score,created_at,updated_at',{order:{column:'updated_at',ascending:false}}),
    fetchPaged('hero_skills','id,verification_status,needs_recheck,enabled',{maxRows:2000}),
    fetchPaged('seasons','id,name,slug,game_version,starts_at,ends_at,active,created_at',{maxRows:200,order:{column:'starts_at',ascending:false}}),
    fetchRegistrySnapshot(),
    loadEquipmentBrainHealth()
  ]);
  const activeSkills=skillsData.rows.filter(row=>row?.enabled!==false),verifiedSkills=activeSkills.filter(row=>row?.verification_status==='verified'&&row?.needs_recheck===false).length,corroboratedSkills=activeSkills.filter(row=>row?.verification_status==='corroborated').length;
  const pipeline=registries.pipeline||{},teamCount=Math.max(0,number(pipeline.distinctOrganicTrios)),totalMatches=Math.max(0,number(pipeline.organicVerifiedObservations)),validationRows=Math.floor(totalMatches*.2),legacyAggregateMatches=sum(teamData.rows,'matches');
  const criticalErrors=[skillsData.error,seasonsData.error,registries.error].filter(Boolean);
  const lifecycle=deriveLifecycle({teamCount,totalMatches,validationRows,registries,criticalError:criticalErrors[0]||null});
  const baseHealth=deriveHealth(registries,lifecycle.activeModel||findActiveModel(registries.models.rows,registries.settings));
  const health=applyEquipmentKnowledgeHealth(baseHealth,equipmentEvolution);
  const activeSeason=seasonsData.rows.find(row=>row?.active===true)||null,thresholds=lifecycle.thresholds||BRAIN_THRESHOLDS,progress={trios:Math.min(1,teamCount/thresholds.minTrios),matches:Math.min(1,totalMatches/thresholds.minMatches),validation:Math.min(1,validationRows/thresholds.minValidationRows)};
  return{
    generatedAt:new Date().toISOString(),lifecycle,health,equipmentEvolution,
    counts:Object.fromEntries(OBSERVATION_SOURCES.map(source=>[source.key,counts[source.key]?.count])),
    observationSources:OBSERVATION_SOURCES.map(source=>({...source,count:counts[source.key]?.count,error:counts[source.key]?.error||null})),
    team:{rows:teamData.rows,totalMatches,legacyAggregateMatches,truncated:teamData.truncated},skills:{total:activeSkills.length,verified:verifiedSkills,corroborated:corroboratedSkills,truncated:skillsData.truncated},seasons:{rows:seasonsData.rows,active:activeSeason,truncated:seasonsData.truncated},
    registries:{models:registries.models,training:registries.training,activations:registries.activations,evaluations:registries.evaluations,actions:registries.actions},
    pipeline,shadow:registries.shadow,backtests:registries.backtests,backtestResults:registries.backtestResults,
    runtime:{settings:registries.settings||null},readiness:{teamCount,totalMatches,validationRows,progress,thresholds},errors:criticalErrors
  };
}

export async function setBrainRuntime({learningEnabled,maxInfluence=null}={}){const{data,error}=await supabase.rpc('admin_echo_brain_set_runtime',{p_learning_enabled:learningEnabled===true,p_max_influence:maxInfluence===null||maxInfluence===undefined?null:Number(maxInfluence)});if(error)throw error;return Array.isArray(data)?(data[0]||null):data;}

export function brainStatusCopy(snapshot){const lifecycle=snapshot?.lifecycle,health=snapshot?.health,settings=snapshot?.runtime?.settings||{},equipment=snapshot?.equipmentEvolution;if(!lifecycle)return'Estado indisponível';if(lifecycle.key==='emergency')return'Modo de emergência ativo · Brain isolado do site · memória preservada';if(health?.key==='equipment-drift')return`${equipment?.pendingTraining||0} mudança(s) de comportamento de item aguardam reconciliação · conhecimento antigo marcado como obsoleto`;if(health?.key==='equipment-stale')return`${equipment?.pendingItems||0} equipamento(s) alterado(s) aguardam reavaliação`;if(health?.key==='drift')return'Modelo sob sinal de drift · influência e rollback permanecem sob controle manual';if(lifecycle.key==='cold-start')return'Pipeline verificado vazio · aprendizado com 0% de influência';if(lifecycle.key==='observing')return'Coletando partidas verificadas · influência ainda bloqueada';if(lifecycle.key==='candidate')return'Amostra mínima atingida · pronto para treino de candidato';if(lifecycle.key==='active')return`Modelo ativo · ${Math.round((lifecycle.influence||0)*100)}% de influência efetiva`;if(settings.shadow_mode_enabled===true)return'Shadow Mode ligado · Champion/Challenger observam sem influenciar usuários';if(lifecycle.key==='suspended')return'Influência em 0% · Replay e Shadow protegem a liberação pública';return lifecycle.reason||'Estado degradado';}
