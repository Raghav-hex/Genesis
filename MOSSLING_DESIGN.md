# Mossling Character Design Contract — v1.1.0

## Core identity

**The Mossling is a seed-pod cave-forager:** small, tactile and curious, with a soft pod-like trunk, independent head chunk, flexible trailing tail, leaf-like dorsal fronds and root-hook toes. It is neither a miniature human nor a direct analogue of an existing game character. It behaves like an animal that feels its way through a strange place: it pauses to inspect, compresses under cover, springs away from nearby danger, and uses its limbs to catch a wall when a fall becomes a climb.

Its “persona” is a readable shorthand for a bundle of continuous heritable tendencies, not a scripted class or a separate brain.

## Anatomy and motion

- **Physics root:** the existing simulation agent remains responsible for terrain collision and world navigation. Art size is separate from the root collider.
- **Linked body chunks:** head and rump points use damped position integration and distance constraints. They lead/lag subtly as the body moves; the rendered pod bridges them.
- **Verlet tail:** seven points preserve inertia across ticks, constrained to a variable segment length influenced by restlessness. Speed creates a tail wave; falling/resting lets it drape.
- **Legs:** four cosmetic two-link limbs use a small analytic inverse-kinematics solver to place knees and feet according to gait phase, stride and airborne state.
- **Surface details:** ears/feelers, pupil gaze, whiskers, mouth, dorsal fronds, glow freckles and root-toes are procedural shapes. They react to state and temperament.
- **Secondary motion:** body lean responds to horizontal/vertical velocity, the body squashes on landing and stretches during pounces. Breathing and blinking advance only on simulation ticks, not render frames.

The body chunks and limbs are currently a **visual secondary-motion rig**, not separate colliders. The root hitbox remains authoritative. This is deliberate for reliability and inexpensive simulation; adding fully articulated collision would be a separate physics change.

## The seven temperament dimensions

Values are continuous and clamped to `[0.05, 0.95]`. Offspring blend parent values; small mutations occasionally perturb inherited values.

| Trait | Visible expression | Behavioral influence |
|---|---|---|
| Curiosity | alert feelers, sniffing pauses, head attention | short investigate/listen pauses when wandering slowly |
| Caution | tucked ears, tighter resting pose | stronger escape preference and more defensive choices |
| Playfulness | bouncy fronds and lively tail waves | influences tail amplitude and impulsive motion character |
| Sociability | character identity/profile | remains a bias for interpreting social proximity, not mind-reading |
| Clinginess | reach/cling pose, wall-grip readiness | raises chance of catching a wall while falling |
| Patience | calmer idle profile | contributes to the Root-Listener temperament score |
| Restlessness | asymmetrical ear/frond accents and active tail | increases roam distance, acceleration and tail length/lag |

## Persona labels

Persona selection is based on scores derived from the continuous traits; it is recalculated on birth, so personality can drift over generations.

- **Lanternnose** — curious and observant; pauses to inspect a sound or uncertain patch.
- **Fern-Sneak** — cautious and cover-seeking; lowers its posture and keeps its feelers tucked.
- **Pebble-Bounce** — playful and spring-loaded; shows rounder dorsal bumps and stronger tail action.
- **Root-Listener** — sociable and patient; maintains awareness of nearby kin.
- **Drift-Tail** — restless and nimble; ranges farther, with a looser and more active tail.

A Mossling can show traits from several personas simultaneously. Labels are for the observer; continuous values drive the behavior.

## Functional movement mechanics

1. **Amble / loaf:** speed and body motion settle toward a relaxed pose.
2. **Sniff / listen:** highly curious Mosslings can briefly pause during aimless wandering. It is a true movement hesitation, not just an animation layered over full-speed motion.
3. **Crouch / nibble:** Mosslings lower the hitbox when hiding or eating. They stand back up only when the wider hitbox has collision clearance.
4. **Sprint / escape pounce:** when a threat is close, a grounded Mossling can spend a cooldown to launch away with a real vertical and horizontal velocity impulse.
5. **Fly pounce:** a distinct jump impulse helps Mosslings reach a fly target.
6. **Wall grip:** while falling slowly beside a wall, sufficiently clingy Mosslings can briefly arrest the fall.
7. **Wall kick:** a jump command while gripping pushes away from the wall, preventing the character from repeatedly pushing into a surface.
8. **Impact response:** hard landings produce temporary squash, followed by damped recovery.

The standard simulation brain and needs-based decisions still choose high-level intentions. The Mossling module only translates Mossling state, temperament and selected movement intent into Mossling-specific locomotion and cosmetic motion. Vinebacks and Glimmers continue to use their previous motor and renderer.

## Observatory and debugging

- The inspector exposes persona, mood, all continuous traits, posture, pounce count and wall-grip history.
- **Mossling anatomy (debug)** shows head/rump anchors and the tail points.
- **Show hitboxes (debug)** independently shows the physical root collider. This distinction is important: visible tail/ears may overlap visual scenery without implying a collision error.
- The reproducibility hash includes temperament, motor counters, posture/mood, animation phases and rig point positions.

## Research principles adapted

Rain World's developers have publicly described a character built from two connected body chunks with procedurally animated cosmetic limbs/tail, and an AI structure split into behavior modules. The broad idea carried over is that physicality should be readable and creature-specific, rather than relying on a sprite sheet and one generic movement function. Sources:

- [Unity — Exploring procedural design in Rain World: The Watcher](https://unity.com/blog/exploring-procedural-design-rain-world): linked body chunks, responsive movement and creature-specific procedural graphics.
- [Chaps — Character procedural animation study](https://chaps.dev/projects/character/): point/constraint bodies, Verlet chains and inverse kinematics in an overgrown cave setting.
- [2D Procedural Animation course (GitHub)](https://github.com/mattdymott/2d-procedural-animation-course): open educational material on Verlet chains, IK, gait and secondary motion.

Genesis does not copy Rain World code, sprites, character art or exact character design. Mossling is a separate concept with its own anatomy and temperament model.

## Tests

`tests/mossling-character.test.js` checks that all five personas can emerge, inheritance remains bounded, body/tail nodes stay finite, hitboxes compress and expand with clearance, escape pounces produce real motion, wall grips and kicks work, moods react to state transitions, same-seed animation state remains reproducible, and the procedural renderer is callable with a Canvas-shaped context.
