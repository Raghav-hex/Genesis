# Genesis — Living Worlds

Genesis is a no-build artificial-life sandbox. Seed a world, watch populations adapt through selection and mutation, intervene with god tools, and inspect a tiny neural policy while it acts. This is an experiment in emergence, not an LLM-driven simulation.

## Run it

Open `index.html` in a modern browser. No build step or dependencies are required.

Run the deterministic core tests with Node.js:

```bash
npm test
npm run serve
```

Then open `http://localhost:8080`.

## Controls

- Pause / Resume / Step controls model time.
- Species / Lineage / Energy / Food switches map overlays.
- Inspect agent selects a nearby creature and visualizes neural activations.
- Paint food, Drought, Bloom and Meteor alter a local region; drag to paint.
- Spawn herbivores / predators inject new agents.
- Natural events toggles drought, bloom and meteor events.
- Export world downloads a JSON snapshot for offline analysis. Restore, rewind and branched replay are not implemented yet.
- Seed creates reproducible initial terrain and population.

## Architecture

- `sim.js`: simulation core, typed-array/struct-of-arrays agent state, deterministic random streams; no DOM dependencies.
- `index.html`: interactive observatory, map, charts, controls, event log and live agent inspector.
- `tests/sim.test.js`: deterministic-run, random-stream isolation and invariant tests.

Separate random streams are used for initial agents, mutation/genetics, natural world events and manual player actions. The engine remains in JavaScript while the core rules stabilize; the code is deliberately organized for a later Rust/WASM port.

## Current scope and known limits

- 16-8-4 MLP with 172 weights per creature; offspring inherit weights with mutation.
- Herbivores forage, predators hunt, agents spend energy, reproduce and die.
- Population cap: 3,000.
- The nearest-agent inspector currently scans live agents; a spatial hash is a future performance upgrade.
- This is an experimental toy model, not a biologically accurate ecosystem.
- Snapshots can be exported, but restore/rewind/replay are not yet implemented.

## Tests

`npm test` verifies seeded repeatability with manual actions, isolates random streams from ordinary food-paint tools, and smoke-tests 20 seeds for finite state and population bounds.
