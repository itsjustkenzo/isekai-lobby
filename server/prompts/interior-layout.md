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
- corner_accent: reserved for compatible major furniture; small decorations are disabled.
Zones are north, west, east, centre, south or corners. Select fewer groups for smaller interiors. A small room usually needs one main group plus modest storage and decoration. Churches may use repeated seating groups. Caves and empty halls must not receive unrelated domestic furnishings.
Do not duplicate grouped assets in placements or mark them as bed/table/chair grid symbols. Use placements only for unique ungrouped landmarks and finishing touches. Empty groups are appropriate when the saved inventory has no functional furnishings.
This replaces scattered individual furniture coordinates. Never fill all available space just to use every asset.


## Reference layout fidelity and surface details

For image references, each furnishing group must include x and y: the preferred bottom-left anchor in the FULL map grid, based on its position in the picture. Preserve furniture clusters, room proportions, asymmetry and intentional empty space. Zones are preferences, not a replacement template. Adjust reference anchors locally for overlap or walking access; omit a group that cannot fit near its original position rather than relocating it across the room.
For description-only prototypes, choose suitable x and y anchors yourself.
Set accentAssetId to an empty string. This generation version omits small decorations; use only compatible major furniture.


## Mandatory assembly-only furnishing

Major furniture MUST be requested as furnishingGroups. Do not scatter major furniture through placements or grid symbols. For every visible table area request a dining group with a compatible table and seating asset; use separate groups/anchors for separate reference tables. Use service_counter for a counter along a wall with stools in front, sleeping for bed-and-bedside assemblies, wall_storage for cupboards/shelves/large notice boards, and seating_rows for church seating.
Use count=1 for unique furniture and exact individual reference anchors. For repeated dining or sleeping sets occupying a broad zone, count=2..6 requests that many COMPLETE assemblies distributed throughout that zone; x/y describe the zone's representative anchor, not a constraint that every copy cluster around it. Only seating_rows interprets count as its row count. Use separate west and east repeated dining groups in busy taverns/guild halls so both the upper AND lower usable floor are furnished, with a connected entrance route between them. Code checks every assembly for fit and walking access.

Plan furniture quantities against the FULL usable room dimensions and the saved footprints, not just the top of the picture. A furnished 20x20 tavern with small 2x1 tables typically needs 6-8 dining sets spread over multiple rows, plus suitable wall storage and a service counter when available. A 16x16 room generally fits fewer. These are composition guides, not mandatory minimums: preserve intentionally open stages, church aisles, cave floors and genuinely sparse references. Cover the occupied zones with balanced repeated sets rather than leaving half of a busy hall accidentally unused. Never enlarge furniture to fill the room, invent unavailable furniture, or distribute loose seats and small clutter into gaps.
This version includes MAJOR FURNITURE ONLY. Set accentAssetId="" and omit mugs, plates, papers, books, buckets, flower pots, lamps, lanterns and chandeliers. Do not populate the placements array with finishing decorations. The local assembly solver computes furniture-member positions and checks walking access.
