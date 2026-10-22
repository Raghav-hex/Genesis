# Genesis — Living Worlds

This repository is the versioned home for Genesis, a small artificial-life and ecosystem simulation. The complete upgrade source package is available in the conversation as `genesis-upgrade.zip`; this repository currently contains the observatory UI and supporting project files, with full local validation performed on the ZIP working tree.

## Run

Open `index.html` in a modern browser; it is designed to run without a build step or external dependencies.

For the full tested working tree, extract `genesis-upgrade.zip` and run:

```bash
npm test
npm run serve
```

Then open `http://localhost:8080`.

## Features in the current upgrade package

- Interactive world map with species, lineage, energy, and food/fertility views.
- Pause, resume, single-step, speed, seed and brush controls.
- Tools to paint food, trigger drought/bloom/meteor events, and spawn agents.
- Tiny 16-8-4 neural policy inspector, population/resource charts, telemetry and event log.
- JSON world snapshot export.
- Deterministic core tests covering seeded runs, random stream isolation and state invariants.

## Roadmap / honest limitations

- Rust/WASM is intentionally deferred until the simulation rules stabilize.
- A full spatial hash, snapshot restore, rewind and branched replay are not implemented yet.
- This is a learning-oriented toy model, not a biologically accurate ecosystem.
