# Genesis — Living Worlds

Genesis is a no-build artificial-life sandbox: seed a world, watch a population adapt through selection and mutation, intervene with god tools, and inspect a tiny neural policy while it acts. The model is deliberately small and local rather than LLM-driven.

## Run it

Open `index.html` in a modern browser. No install, network, or build step is required.

For local testing:

```bash
npm test
npm run serve
```

Then open `http://localhost:8080`.

## Controls

- **Pause / Resume / Step:** control model time.
- **Species / Lineage / Energy / Food:** switch map overlays.
- **Inspect agent:** click near an agent to inspect its live neural activations.
- **Paint food, Drought, Bloom, Meteor:** intervene in a local region; drag to paint.
- **Spawn herbivores / predators:** inject agents into the ecosystem.
- **Natural events:** enable/disable droughts, blooms, and meteor impacts.
- **Export world:** download a JSON snapshot for analysis. This is data capture, not yet a fully implemented replay/restore interface.
- **Seed:** make a repeatable initial world.

## Architecture

- `sim.js`: deterministic simulation core; typed-array, struct-of-arrays storage; no DOM dependencies.
- `index.html`: visualization, controls, time series, agent inspector, event stream.
- `tests/sim.test.js`: Node-based invariant and seeded-determinism checks.

The core uses isolated random streams for ordinary agent/genome dynamics, world events, initial population, and direct player actions. This prevents manual tools from consuming the RNG stream used for genetics or natural events. Core rules are still evolving, so this build stays in JavaScript rather than locking them into a premature WASM port.

## Current scope and known limits

- Agents use a small 16-8-4 MLP with 172 weights, mutation, food foraging, predation, and reproduction.
- Population cap is 3,000.
- The inspector's nearest-agent search still scans live agents. A full spatial hash is future optimization work.
- The neural inputs include neighbor food/prey, nearby predator pressure, energy, local resources, bias, and season. This is an experimental artificial-life toy, not a biologically accurate ecosystem.
- Export contains a snapshot for offline inspection; restore, rewind, and branched replay are not implemented yet.
- Rust/WASM is intentionally deferred until the rules and tests stabilize.

## Tests

`npm test` checks fixed-seed repeatability with player actions, verifies RNG-stream isolation for manual tools, and exercises seeds 1–20 for finite agent state and population invariants.
