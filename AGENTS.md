# Project requirements

## Asset deletion and MongoDB

- Permanently deleting an asset must also remove its corresponding MongoDB data, including stored images and generated variants. Do not implement permanent deletion as only a frontend removal, hidden flag, or local-state change.
- Remove references to permanently deleted assets from affected persisted libraries, worlds, item definitions, starting items, player inventories, hotbars, and dropped items wherever those references exist. Do not leave orphaned asset data or allow stale saves to restore deleted assets.
- Apply this requirement to future deletion features for houses, characters, equipment, textures, and item assets as well as general assets.
- Enforce ownership and authorization on the server. Removing another creator's shared asset from a personal library removes that membership; it does not authorize deleting the creator's source asset.
- Erasing a placed copy from a map removes that placement when persisted; it does not delete the reusable asset definition unless the user explicitly chooses permanent asset deletion.
- Only report permanent deletion as successful after the server confirms the database operation. Check database cleanup when implementing or changing deletion behavior.

## Player HUD art direction

- Keep the user's reference pixel-art HUD style: wooden frame, parchment nameplate, gold portrait trim, red segmented health bar, crisp square pixels, and hard-edged shadows.
- Dota-style requests refer to the centered grouping/layout. Preserve this game's pixel-art materials and match inventory slots and the bag icon to them.

- Player HUD and inventory text must use the shared pixel glyphs: canvas text from `pixelUi.js` and the local Isekai Pixel font for HTML controls. Rebuild the font with `python scripts/build_pixel_font.py` if glyph shapes change.

## Player controls

- Walking uses WASD or arrow keys. Left-click performs actions and nearby interactions. Do not restore click-to-walk, or right-click movement unless requested.

## Generated map prototype isolation

- Generate your map opens its own Generated Map Editor. Do not import generated maps into the regular WorldEditor unless the user explicitly requests an import feature.
- Persist generated-map prototypes only through /api/generated-map in generatedMapDrafts. Keep regular worlds, player inventories, and player positions unchanged. Prototype playtesting must use temporary preview state.


- Reference-generated props and paint textures belong to their generated-map document (`generatedAssets`, `textures`, `paint`, and local `placed` references). Do not publish them to the shared asset library or normal worlds automatically. Validate embedded images and local references on the server.

- Reference-generated assets and paint must use the uploaded picture as their sole art-style authority (palette, outlines, shading, material detail and pixel treatment), rather than imposing the default cozy RPG style. Keep this style instruction consistent across props, floors, grounds and walls.

- Generated water and other liquid paint must animate with waves, bubbles and expanding ripples, including custom liquid paint on non-water terrain. Preserve liquid metadata in saves and use the texture palette for highlights.

- Generated environmental props (trees, rocks, bushes, flowers and plants) use stable small/medium/large variants with crisp reference-coloured pixels. Keep variants in the generated map document and preserve their footprint, metadata and selected variant through save/load.

- Generated environmental props use a 1?1 tile placement/collision footprint, like default decorations. Size variation is visual; do not enlarge the footprint to 2?2 for trees. Preserve the designed footprints of buildings and furniture.

- Default round trees/pines and generated trees use small=32px (2 tiles), medium=48px (3 tiles), large=64px (4 tiles) artwork heights. Generated trees may extend beyond their one-tile footprint visually; preserve bottom-centred rendering and validate/save their taller sprites.

- Keep tree pixel density consistent across sizes: generate separate small/medium/large tree artwork at native 24?32, 36?48 and 48?64 resolution. Never enlarge a small raster tree to make medium/large versions; greater size requires additional detail at the same game-pixel scale.

- Liquid shorelines must use irregular one-pixel banks and rounded corner transitions, matching neighbouring ground paint and the liquid palette. Do not leave generated liquid surfaces as full square tiles at the shore; retain waves, bubbles and ripples.

- All liquids, including water, lava and mud, block player movement and spawn placement whether represented as water terrain or custom liquid paint on land. Travel/exit markers do not override liquid collision.

- Generate all supported nature props as separate native-pixel small/medium/large artwork, not scaled copies. Bush sprites are 24?20, 32?28 and 40?36 pixels with full leafy canopies; they may visually overhang their single-tile footprint. Apply this fuller size range to default bushes too. Nature size specifications live in natureSizes.js.
