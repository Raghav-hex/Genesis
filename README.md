# Genesis v1.4.0 — Unified Pixel Style

This release unifies the Mossling, Vineback and Glimmer visual language with a shared 16-colour palette and nearest-neighbour pixel rendering, while retaining the full-precision simulation and existing movement rigs. The scope is deliberately limited to creature locomotion, Vineback design/AI, and navigation affordances needed to remove snagging at vines, pipes, platforms, and shelter roofs. It does not change the broader world-generation or plant/ecology design goals.

## Run

Use Node.js for tests and Python 3 for the local static server:

```bash
npm test
npm run serve
```

Then open `http://localhost:8080`.

## What changed in v1.4.0

- pixel-style.js renders all creature rigs through a shared 80×48 low-resolution surface, quantizes colors to the same 16-color Genesis palette, then enlarges using nearest-neighbour sampling. Physics and route navigation remain full precision.
- Mossling, Vineback and Glimmer now share outline ink, moss/stone ramps, warm body highlights and restrained coral threat accents. State tags, hitboxes and observatory UI remain crisp and readable.
- Vineback material colors have been changed from a separate red/purple ramp to the shared Genesis moss/stone/body palette.
- PIXEL_ART_BIBLE.md documents the palette, scale, silhouette rules, and animation contract. The editable source of truth is the Genesis Pixel Art Bible in Figma: https://www.figma.com/design/j0jGzbmTq10vTYlOoB2nZq

## Previous changes (v1.3.0)

- `vineback.js` is a dedicated original Vineback module: 6-point soft spine, 10-point Verlet tail, 4 articulated feet, jaw/frill expression, movement posture, pounce response, and debug anatomy rendering.
- Five heritable archetypes can emerge from blended/mutated continuous traits: Cindermaw, Rootstalker, Rattleback, Duskcoil, and Packshade.
- Vinebacks have distinct ferocity, patience, territoriality, pack affinity, climbing, curiosity, and stealth tendencies. These traits influence pursuit posture, movement rate, pounces, patrols and group coordination.
- The existing needs-driven behavior stays modular: prey/threat selection, den-seeking, short-lived pack scent/call memory, territory patrol, dominance display, and yielding are behavior states instead of one monolithic script.
- Near a den, Vineback clans can size each other up. Dominance depends on condition, hunts, learned outcomes, successful displays, territory tenure and temperament. Subordinates may challenge a weak alpha; the loser records who it yielded to and moves away for a cooldown.
- All species brake before reversing instead of snapping velocity when route targets shift. Obstacle jumps have cooldowns to avoid jittery repeated hopping.
- Vine/pipe platform mouths are cleared after shelters are constructed, preventing later roof tiles from sealing the route. Climb selection is latched while committing to a climb so target changes don't constantly switch the chosen vine.
- The state hash includes Vineback traits, rig positions and relevant social/navigation state for reproducible runs.

## Testing

`npm test` runs:

- `tests/sim.test.js` — world ecology, determinism, collision recovery, route traversal and long-run stress checks.
- `tests/perf-assets.test.js` — local asset presence, renderer cache and local-only loading checks.
- `tests/mossling-character.test.js` — Mossling animation and movement regressions.
- `tests/vineback-character.test.js` — Vineback archetype variation/inheritance, rig stability, pounce impulse, braking across all species, climb openings, route latching, hierarchy and dominance challenge, deterministic replay and renderer smoke tests.
- `tests/pixel-style.test.js` — shared palette, integer pixel scale, HTML integration and creature renderer wiring.

## Research design notes

This release adapts general game-AI and procedural-animation principles rather than copying Rain World code or assets. The design uses a linked body-and-appendage rig with posture reacting to locomotion; and separates survival decision-making, steering, route selection and physical movement. See `VINEBACK_DESIGN.md` for a short research synthesis and source links.

## Art and licensing

The public build includes only redistributable Kenney CC0 assets; see ASSET_CREDITS.md and the bundled license files. Mossy Cavern-derived images are intentionally excluded from this repository. The world uses procedural backgrounds, root silhouettes, plants and creature fallbacks when those optional images are absent. No Rain World code or character assets are used.
