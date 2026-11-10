# MASTER AI PROMPT — PIXEL ART HOUSE FOR A 2D RPG WORLD

Create a single house as a 2D pixel-art game sprite, using **Image 1 as the absolute master reference** for its art style, camera angle, proportions, pixel size, outline and overall shape.

Every generated house must look as though it belongs in the same game as Image 1 and was drawn by the same artist.

## 1. Image Reference Priority

**Image 1 — Master House Template**

- Controls the camera angle (straight-on front view with the roof seen from slightly above), the overall silhouette and footprint, the pixel density, the outline, the shading and the colour treatment.
- Controls the proportions: a roof occupying roughly the top half, front walls in the bottom half, a full-height front door at the bottom centre, and windows beside it.
- Treat it as an immutable base: imagine the same house being rebuilt in a new style.

**Image 2 — House Concept (if provided)**

- Used ONLY to identify the new house's materials, colours, roof style, wall style, decorations and distinctive features.
- Does NOT control the camera angle, perspective, proportions, scale or art style.

**The written description** (below) describes what the player wants. Combine it with Image 2 when both are given.

**PRIORITY RULE:** When anything conflicts with Image 1, ALWAYS follow Image 1.

## 2. Mandatory Structure

### Angled concept photographs: reconstruct, do not flatten

- Identify the main front facade and mentally rotate the house to face the viewer squarely before drawing.
- If the photograph shows both front and side walls, reconstruct the front facade only. Use the side wall as evidence of construction and depth; do not expose it in the sprite.
- Never squash, shear, unfold or combine the front and side walls into one facade. Side-wall windows and doors must not be pasted onto the front.
- Recover frontal proportions from the architecture rather than the perspective-distorted photo outline. Infer obscured front details conservatively, preserving distinctive front features and genuine asymmetry.
- Keep the vertical front wall straight-on, the foundation level and door frames upright. Show only the roof slightly from above in the game's established viewpoint.

- Exactly ONE house, centred, filling the canvas in the same way and the same proportions as Image 1.
- The house must be **taller than it is wide**, with the same width-to-height ratio as Image 1 (5 wide : 6 tall, including the roof and chimney). Do not make it wider or squatter than Image 1; leave transparent space at the sides instead.
- The front door must be as tall, relative to the house, as Image 1's door: roughly 40% of the house's total height, big enough for a person.
- Straight-on front view, exactly like Image 1. No three-quarter angle, no isometric view, no side walls visible.
- The front door is at the bottom centre, full height, sized for a person, opening onto the ground line, like Image 1.
- The house's bottom edge is a straight horizontal line, like Image 1's foundation.
- Roof on top, walls below. Chimneys, dormers, towers, signs, plants in pots, lanterns, awnings and similar details are welcome if they stay within a silhouette similar to Image 1.

## 3. Pixel Art Style

- Authentic 2D retro RPG pixel art matching Image 1: the same chunky pixel size, crisp square pixels, and dark 1-pixel outline around the whole house.
- Simple shading in flat colour clusters, light coming from the top-left, with occasional checkerboard dithering like Image 1.
- No smooth gradients, no anti-aliasing, no blur, no 3D rendering, no painterly or vector styles.

## 4. Transparent Background — MANDATORY

- PNG with a genuinely transparent background (alpha = 0) everywhere outside the house.
- No ground, grass, path, shadow, sky, scenery, border, frame, text or watermark.
- Do not draw a checkerboard pattern to fake transparency.

## 5. Strictly Forbidden

People, animals, characters, vehicles, fences or yards around the house, ground tiles, cast shadows on the ground, multiple buildings, perspective or isometric angles, text, logos, watermarks, borders, backgrounds of any colour.

**FINAL CHECK:** one front-facing pixel-art house, same style, angle and proportions as Image 1, door at the bottom centre, transparent background.
