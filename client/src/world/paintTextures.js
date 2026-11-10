let textures = [];
export function setPaintTextures(list) { textures = list ?? []; }
export function paintTextures() { return textures; }

export const textureSurfaces = (interior) => interior ? ['floor', 'wall'] : ['ground'];
export const surfaceLabel = (surface) => ({ floor: 'Floors', wall: 'Walls', ground: 'Grounds' })[surface];
