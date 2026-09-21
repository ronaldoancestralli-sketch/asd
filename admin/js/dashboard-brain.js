import { loadBrainSnapshot, brainStatusCopy } from './echo-brain-core.js?v=20260822-brain-final-1&sb=20260823-security-supabase-pin-1';

const host=document.getElementById('dashboard-brain-card');
if(host){
  try{
    const snapshot=await loadBrainSnapshot(),state=snapshot.lifecycle,health=snapshot.health||{},emergency=state.key==='emergency',attention=!emergency&&['drift','watch'].includes(health.key),display=emergency?state:attention?health:state,shadow=snapshot.runtime?.settings?.shadow_mode_enabled===true;
    host.dataset.tone=display.tone||'idle';host.dataset.emergency=emergency?'true':'false';
    const title=host.querySelector('[data-brain-dashboard-state]'),detail=host.querySelector('[data-brain-dashboard-detail]'),meta=host.querySelector('[data-brain-dashboard-meta]');
    if(title)title.textContent=display.label||state.label;if(detail)detail.textContent=brainStatusCopy(snapshot);
    if(meta)meta.textContent=emergency?'0% influência · treino/Shadow/Backtest bloqueados':`${new Intl.NumberFormat('pt-BR').format(snapshot.pipeline?.organicVerifiedObservations||0)} partidas verificadas · ${new Intl.NumberFormat('pt-BR').format(snapshot.readiness.teamCount)} trios · ${shadow?'Shadow ON':'Shadow OFF'} · ${Math.round((state.influence||0)*100)}% influência`;
  }catch(error){console.error('[dashboard-brain] falha ao carregar Echo Brain:',error);host.dataset.tone='danger';const title=host.querySelector('[data-brain-dashboard-state]'),detail=host.querySelector('[data-brain-dashboard-detail]'),meta=host.querySelector('[data-brain-dashboard-meta]');if(title)title.textContent='DEGRADADO';if(detail)detail.textContent='Não foi possível ler a memória do Brain.';if(meta)meta.textContent='Nenhum dado foi alterado';}
}
