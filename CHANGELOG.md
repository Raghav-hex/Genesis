# Genesis v1.4.0 — Unified Pixel Style

- Added a shared low-resolution creature renderer with a 16-color Genesis palette and nearest-neighbour enlargement.
- Mosslings, Vinebacks and Glimmers use the same pixel scale, dark outline, moss/stone material language, warm highlight ramp and restrained coral threat accent.
- Pixel rendering affects the creature visual layer only; the world simulation, collision geometry, rigs, routes, and AI retain their existing precision and behavior.
- Updated Vineback colors to match the common visual language.
- Added pixel-style regression tests.

# Changelog

## v1.3.0 — Vineback Soul & Smooth Routes

- Added `vineback.js`, an original Vineback-only procedural rig with a linked spine, Verlet tail, articulated feet, jaw/frill expression, posture-aware motion and pounce response.
- Added five heritable predator archetypes (Cindermaw, Rootstalker, Rattleback, Duskcoil, Packshade) driven by seven continuous traits rather than immutable class flags.
- Added den-approach dominance displays: pack members size up rivals, weak alphas can be challenged, successful challengers gain display history, and losers record who they yielded to and temporarily move off the approach.
- Improved scent/call-style pack coordination with noisy, time-limited last-known-prey memories rather than omniscient prey tracking.
- Smoothed all species' direction changes with braking/dead zones and cooldown-gated obstacle jumps.
- Fixed route-snapping sources: climbable openings are edge-biased, route choice remains latched during a climb, and the climb-mouth clearance pass runs after shelter roofs are added.
- Expanded Vineback traits, body points, posture, pack, dominance and route state in the deterministic state hash.
- Added `tests/vineback-character.test.js`, including real den challenge/yield, pounce impulse, rig stability, movement damping, route opening and determinism checks.

## v1.1.0 — Mossling Soul / procedural character pass

- Added `mossling.js`, a dedicated Mossling-only character layer. Vinebacks, Glimmers, world-generation rules and broader ecology were not redesigned.
- Replaced the original simple Mossling drawing with a soft, two-chunk seed-pod body, a seven-node Verlet tail, four two-segment IK-style limbs, expressive feelers/ears/eyes/whiskers/mouth, animated moss fronds, glow freckles and impact squash/stretch.
- Added five original temperament personas: Lanternnose, Fern-Sneak, Pebble-Bounce, Root-Listener and Drift-Tail. Underlying continuous values are inherited and slightly mutated, so the labels describe tendencies rather than immutable classes.
- Made curiosity produce real listening/sniff pauses, restlessness affect wandering distance and movement, and playfulness influence tail motion.
- Added close-threat escape pounces, crouching hitbox reduction when clearance allows, short wall grips and wall-kick redirection. These mechanics are scoped to Mosslings.
- Fixed state-transition anticipation animation, counted actual pounce decisions, and added procedural rig debug rendering and inspector personality/mood/posture stats.
- Expanded deterministic state hashing to include Mossling movement/animation state and rig point positions.
- Added dedicated Mossling tests for inheritance, five-persona coverage, soft-body/tail stability, crouch clearance, pounce and wall-kick impulses, mood transitions, seeded repeatability and renderer smoke testing.

## v1.0.0 — Vast Underdeep & Navigation Pass

- Expanded the simulation to three connected regions, about 23,040 world units wide, with 21 caverns and distributed vaults, predator dens, shelters, flora and glowfly prey.
- Added multi-stage route waypoints: leave a cave using its full-height shaft, traverse the surface to the intended destination, and descend through the destination's clear shaft.
- Predators abandon targets that become hidden behind sealed Moss vaults and search a different area instead of camping by the door.
- Added a clickable World Atlas with region separators, cave layouts, vaults, dens, creature markers and a viewport outline.

## v0.9.0 — Predator/prey, Moss vaults and plant ecology

- Added one-entry living Moss vault seals, prey hiding, hungry-predator hunting, den behavior, carcass scavenging, implicit clan ranks and plant growth influenced by moisture/light/temperature/nutrients.
- Added ecology observability for hiding, seedling counts, clan leaders, carcass biomass, moisture and territories.

## v0.8.2 — Hitbox & collision pass

- Separated artwork dimensions from physical hitboxes and improved swept collision, one-way platforms, obstacle avoidance and safe-position recovery.
