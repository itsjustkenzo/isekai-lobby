# Interior room composition

Use the classic cutaway RPG room view: north is the top of the map, south is the bottom, west is left and east is right.

- Show the NORTH wall as a visible vertical wall face across the back of the room, three tiles deep on the grid. Use the selected collection's wall finish. A plaster-and-timber room can have a pale plaster face above a darker base trim, but preserve the collection's materials and palette.
- WEST, EAST and SOUTH boundaries are solid dark purple cutaway wall borders with a lighter purple outer outline, not tall front-facing wall panels. They frame the floor without hiding the character or furnishings. Do not repeat the tall north-wall face around all four edges.
- Put one clear doorway at the bottom centre of the SOUTH boundary. Leave the centre boundary tile open and continue the room's floor through it as a threshold with a red-brown wooden doorway framed in brown trim. Keep a walkable approach at least two tiles deep inside the room.
- The doorway is a visual entrance and walkable opening in this prototype, not an invented travel link to another world. Do not add an exterior scene or stairs unless the saved collection includes appropriate artwork.
- PERIMETER WALLS ONLY: walls may occupy only the four outer room boundaries (including the three-row north wall face). Never generate partitions, divider walls, pillars made of wall tiles, enclosed subrooms, central walls or wall paint anywhere inside the floor area. Even if an uploaded reference contains interior partitions, omit them and arrange one open room instead.
- Floor paint covers the room inside this frame. Rugs remain floor patches, not walls or raised furniture.
- Place furnishings on the floor below the north wall. Beds, shelves and cabinets may sit against its base but must not be painted into the wall face. Use only saved furniture and decoration assets at their game scale.
- Keep the doorway, its approach and connected circulation clear of furniture, solid props, walls and liquids. Do not close the south doorway with a continuous wall row.
- Use N for north wall cells and side/bottom boundary wall cells in the layout grid. At the south-centre doorway use a floor symbol instead. The local renderer supplies the cutaway treatment of boundary edges.


## Functional furnishing groups

Return a furnishingGroups array. AI chooses functional groups and preferred zones; code computes their final coordinates using asset footprints and validates walking access.
Each group has type, zone, primaryAssetId, secondaryAssetId, accentAssetId and count. IDs must refer to the saved inventory; use empty strings for missing optional secondary/accent assets. Never invent assets.
- seating_rows: repeat one saved bench, pew or chair in aligned rows. For a church choose separate west and east groups, both facing north toward the altar. Reserve the middle aisle. Count is 1 to 6 rows.
- dining: primary is a table; secondary is a chair or stool. Code places seats beside the table with a clear approach.
- sleeping: primary is a bed; secondary may be a bedside table. Choose a suitable wall-side zone.
- wall_storage: primary is a cupboard, shelf or cabinet. Prefer the north, west or east zone.
- focal: primary is an altar, counter, shrine or other focal furnishing. Church altars belong to the north zone.
- corner_accent: primary is a saved flower pot, lamp or decoration; prefer corners.
Zones are north, west, east, centre, south or corners. Select fewer groups for smaller interiors. A small room usually needs one main group plus modest storage and decoration. Churches may use repeated seating groups. Caves and empty halls must not receive unrelated domestic furnishings.
Do not duplicate grouped assets in placements or mark them as bed/table/chair grid symbols. Use placements only for unique ungrouped landmarks and finishing touches. Empty groups are appropriate when the saved inventory has no functional furnishings.
This replaces scattered individual furniture coordinates. Never fill all available space just to use every asset.


## Reference layout fidelity and surface details

For image references, each furnishing group must include x and y: the preferred bottom-left anchor in the FULL map grid, based on its position in the picture. Preserve furniture clusters, room proportions, asymmetry and intentional empty space. Zones are preferences, not a replacement template. Adjust reference anchors locally for overlap or walking access; omit a group that cannot fit near its original position rather than relocating it across the room.
For description-only prototypes, choose suitable x and y anchors yourself.
Use accentAssetId for a saved tabletop-sized lamp, candle, book, plate or vase to sit on the group's table, desk or bedside surface. Large floor lamps and floor-standing pots remain independent placements. Only use compatible saved artwork. Never invent an asset for a missing detail.
