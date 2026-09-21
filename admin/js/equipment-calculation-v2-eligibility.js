import { equipmentEligibility } from '../../js/equipment-eligibility.js?v=1';

export function previewHeroEligibility(equipment, hero) {
  return equipmentEligibility(equipment, hero);
}

export function eligiblePreviewHeroes(equipment, heroes = []) {
  if (!equipment) return [];
  return heroes.filter(hero => previewHeroEligibility(equipment, hero).eligible);
}
