# Vineback: character and locomotion design

## Character identity

Vinebacks are territorial, opportunistic cave predators. They should feel dangerous because they plan an approach, preserve momentum, use height, remember short-lived prey signals, and negotiate access to dens — not because they are simply faster or omniscient.

Five readable, heritable temperaments are derived from seven continuous genes:

- **Cindermaw** — ferocious, explosive, difficult to drive away.
- **Rootstalker** — patient, sure-footed, closes exits before striking.
- **Rattleback** — territorial, confrontational, uses threat displays.
- **Duskcoil** — stealthy, patient, uses cover and a quieter approach.
- **Packshade** — socially inclined, listens to a brief last-known-prey signal and joins coordinated searches.

The archetype is descriptive rather than a fixed class. Offspring blend parental genes and undergo small mutations; the continuous traits influence behavior and movement. A label can change as the genes in a lineage drift.

## Procedural body

`vineback.js` owns Vineback-only appearance and locomotion response. Its spine is a short linked point chain; its tail is a Verlet chain; four feet follow alternating gait phases with two-segment knee placement. Posture changes silhouette and motion: `prowl`, `stalk`, `lunge`, `flare`, `clamber`, `curl`, `braced`, and `submissive`. Jaw, dorsal plates and throat/frill communicate hunting, pursuit, territorial challenge and submission.

The body rig is a visual secondary-motion layer rooted to the simulation's collision body. Cosmetic points do not become separate collision bodies; this avoids making navigation fragile or making the broad phase more expensive. The physical root remains authoritative for collision and route progress.

## Needs-driven AI and hierarchy

The architecture keeps concerns separate:

1. **Perception** resolves the current prey, nearby clanmates, danger, den and route.
2. **Decision state** selects stalking, hunting, returning to den, patrol, pack-signal search, dominance display, or yielding.
3. **Steering/motor** translates the target into movement while braking before reversal and damping speed according to posture.
4. **Procedural rig** follows locomotion and state, so animation describes action instead of deciding physics independently.

Pack calls share a noisy, time-limited last-seen position; this avoids giving every predator a globally perfect target. The signal expires, and predators resume independent search if it is stale. Clan rank is recalculated from dominance history, condition, hunting, learning and territory tenure. Near dens, rivals can display instead of overlapping indefinitely. Winners gain display history; losers record the winner and temporarily yield the den approach. Subordinates can challenge an alpha only when the trait/score conditions are met.

## Route smoothness fixes

- Brake forward velocity before reversing direction when moving targets or route corrections change sign.
- Keep a dead zone near a target so an agent doesn't continuously oscillate around a one-pixel destination.
- Gate opportunistic obstacle jumps with a cooldown; don't restart a hop on every decision tick.
- Latch the chosen vine/pipe until the climb segment is completed.
- Clear a three-cell climb mouth after all architecture, including shelter roofs, is generated. A route point inside a solid tile is a world-generation bug, not an AI problem.

## Research synthesis

The public Rain World developer interview explains that its slugcat's locomotion feel comes from two linked body chunks, while limbs and tail are procedurally animated additions; it also emphasizes that many different creature types need their own locomotion logic. This guided the separation between shared collision/movement infrastructure and a Vineback-specific rig rather than reusing the Mossling animation with a different palette.

- [Unity: Exploring Procedural Design in Rain World: The Watcher](https://unity.com/blog/exploring-procedural-design-rain-world)
- [Rain World devlog: procedural animation and AI motivation](https://candlesign.github.io/Rain-World-Devlog/Pages/001)
- [Chaps: procedural creature animation study](https://chaps.dev/projects/character/)
- [Craig Reynolds: steering behaviors](https://www.red3d.com/cwr/gdc99/)

These sources are references for broad techniques (linked-body motion, procedural appendages, specialized creature behavior, and separation of steering from locomotion), not a license to reproduce Rain World's proprietary character art or implementation.

## Test contract

`tests/vineback-character.test.js` checks trait inheritance/bounds, five-archetype coverage, finite spine/tail/foot positions, bounded tail segments over time, a real pounce impulse, braking before reversal, clear vine/pipe openings, latching a ladder route stage, implicit clan formation, rank changes from dominance score, an actual den challenge that produces a display/yield event, deterministic replay and a Canvas renderer smoke test.
