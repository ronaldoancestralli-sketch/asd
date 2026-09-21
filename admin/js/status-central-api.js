import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';

async function readAll(table, columns, order = 'id') {
  const rows = [];
  for (let page = 0; page < 20; page++) {
    const { data, error } = await supabase.from(table).select(columns).order(order).range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
  throw new Error(`${table}: leitura excede 20 mil registros; nenhuma contagem parcial será apresentada como completa.`);
}
export async function centralRpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    const message = {
      STATUS_REVISION_CONFLICT: 'Outra edição foi salva. Recarregue e compare antes de substituir o trabalho.',
      STATUS_BASE_CONFLICT: 'O valor-base mudou. Recarregue antes de corrigir.',
      STATUS_SOURCE_CHANGED: 'Um atributo mudou desde o vínculo. Revise a linha antes de publicar.',
      STATUS_REASON_REQUIRED: 'Informe um motivo com pelo menos cinco caracteres.'
    }[String(error.message).split(':')[0]];
    throw new Error(message || error.message);
  }
  return data;
}
export async function loadStatusCentralData() {
  const names = ['central','heroes','bases','skills','levels','equipments','variants','rarities','bonuses','slots'];
  const values = await Promise.all([
    centralRpc('admin_get_status_central_v1'),
    readAll('heroes','id,name,slug,class_id,enabled'),
    readAll('hero_complete_base_stats','hero_id,hero_name,hero_stats,weapon_stats','hero_id'),
    readAll('hero_skills','id,hero_id,name,enabled,skill_type,cooldown,duration,energy_cost,verification_status,needs_recheck'),
    readAll('hero_skill_levels','id,skill_id,level,damage,healing,shield,cooldown,duration,radius,range,speed,energy_cost'),
    readAll('equipments','id,name,enabled,slot_id,hero_id,class_id,is_personal,set_id'),
    readAll('equipment_variants','id,equipment_id,rarity_id,attributes'),
    readAll('equipment_rarities','id,name,slug,rank','rank'),
    readAll('equipment_set_bonuses','id,set_id,required_pieces,title,stats'),
    readAll('equipment_slots','id,name,slug')
  ]);
  return Object.fromEntries(names.map((name, i) => [name, values[i]]));
}
export async function requestBrainProof(heroId, items, calculationContext = {}) {
  const requestId = `status-proof-${crypto.randomUUID()}`;
  const { data, error } = await supabase.functions.invoke('echo-brain-item-fit', {
    body: { requestId, heroId, items, calculationContext, surface: 'build_lab' }
  });
  if (error) {
    let detail = error.message;
    try { const body = await error.context?.json(); detail = body?.error || detail; } catch { /* response body may be unavailable */ }
    throw new Error(`Brain não confirmou a prova: ${detail}`);
  }
  if (!data?.ok || data.requestId !== requestId || data.authority !== 'server' || !data.calculationTrace) throw new Error('Brain respondeu sem a trilha necessária para confirmar o cálculo.');
  return data;
}
