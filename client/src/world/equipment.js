export const EQUIPMENT_TYPES = [
  { id: 'pickaxe', label: 'Pickaxe' }, { id: 'knife', label: 'Knife' }, { id: 'frying-pan', label: 'Frying pan' },
  { id: 'hoe', label: 'Hoe' }, { id: 'watering-can', label: 'Watering can' },
  { id: 'axe', label: 'Axe' }, { id: 'fishing-rod', label: 'Fishing rod' },
  { id: 'sword', label: 'Sword' }, { id: 'bow', label: 'Bow' },
  { id: 'gun', label: 'Gun' }, { id: 'custom', label: 'Other equipment' },
];
export const canUseHoe = (item) => item?.kind === 'hoe';
