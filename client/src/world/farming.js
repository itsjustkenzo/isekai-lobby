import { isLocked } from './world.js';
// The farming prototype keeps tilling as an overlay, leaving the creator's ground intact.
export function canTill(world, x, y, feet) {
  if (world.interior || x < 0 || y < 0 || x >= world.width || y >= world.height) return false;
  if (isLocked(world, x, y)) return false;
  const i = y * world.width + x;
  return (world.farmCells ?? []).includes(i) && world.terrain[i] === 'g' && world.objects[i] === '.'
    && !world.occupied?.[i] && !(world.npcs ?? []).some((p) => p.x === x && p.y === y)
    && !(world.restCells ?? []).includes(i) && (!feet || Math.abs(feet.x - x) + Math.abs(feet.y - y) <= 1);
}

export function drawSoilPatch(ctx, world, x, y, tilled, size = 16) {
  const i = y * world.width + x;
  if (!tilled?.has(i)) return;
  const has = (dx, dy) => x + dx >= 0 && x + dx < world.width && y + dy >= 0 && y + dy < world.height && tilled.has((y + dy) * world.width + x + dx);
  const left = has(-1, 0) ? 0 : 2, right = has(1, 0) ? size : size - 2;
  const top = has(0, -1) ? 0 : 2, bottom = has(0, 1) ? size : size - 2;
  const ox = x * size, oy = y * size;
  ctx.fillStyle = '#65412d'; ctx.fillRect(ox + left, oy + top, right - left, bottom - top);
  ctx.fillStyle = '#94603b'; ctx.fillRect(ox + left + 1, oy + top + 1, right - left - 2, bottom - top - 2);
  ctx.fillStyle = '#533626';
  for (let row = top + 3; row < bottom - 1; row += 4) ctx.fillRect(ox + left + 1, oy + row, right - left - 2, 1);
  ctx.fillStyle = '#b47b4c';
  for (let n = 0; n < 3; n++) ctx.fillRect(ox + left + 2 + ((x * 7 + y * 11 + n * 3) % Math.max(1, right - left - 4)), oy + top + 1 + n * 3, 1, 1);
}
