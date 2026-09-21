import { emptyStatusPayload } from '../../js/status-registry-v1.js';

// Isolated catalogue and simulated RPC responses; never connects to a database.
export const id = n => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
export function fixture() {
  return {
    heroes: [{ id: id(1), name: 'Herói do teste', enabled: true }, { id: id(2), name: 'Outro herói', enabled: true }],
    bases: [{ hero_id: id(1), hero_stats: { health: 100 }, weapon_stats: { weapon_spread: 50, aimed_dispersion: 20, moving_dispersion: 5 } }],
    equipments: [{ id: id(3), name: 'Botas de teste', enabled: true, hero_id: id(1), slot_id: id(4) }],
    slots: [{ id: id(4), slug: 'legs', name: 'Pernas' }],
    rarities: [{ id: id(5), name: 'Comum', slug: 'comum', rank: 1 }, { id: id(6), name: 'Raro', slug: 'raro', rank: 2 }],
    variants: [
      { id: id(7), equipment_id: id(3), rarity_id: id(5), attributes: [
        { label: 'Dispersão da arma', value: '-28', raw: '-28% à dispersão de tiro da arma quando em movimento', operator: 'decrease_percent' },
        { label: 'Dispersão da arma', value: '-16', raw: '-16% à dispersão do tiro ao mirar', operator: 'decrease_percent' }
      ] },
      { id: id(8), equipment_id: id(3), rarity_id: id(6), attributes: [{ label: 'Dispersão da arma', value: '-30', operator: 'decrease_percent' }] }
    ],
    skills: [], levels: [], bonuses: [],
    central: { draft: emptyStatusPayload(), draft_revision: 0, active_publication: 0,
      published: { revision: 0, fingerprint: 'fixture-unpublished', payload: emptyStatusPayload() },
      permissions: { edit: true, publish: true, base_edit: true } }
  };
}
export const selection = extra => ({ equipmentId: id(3), variantId: id(7), heroId: id(1), rowKey: '0', bindingId: id(9),
  scope: 'weapon', sourceKey: 'weapon_spread', name: 'Dispersão de tiro', unit: 'degree', operator: 'decrease_percent', condition: 'moving', conditions: { moving: true, aiming: false }, ...extra });
