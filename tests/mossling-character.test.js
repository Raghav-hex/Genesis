'use strict';
const assert = require('node:assert/strict');
const Simulation = require('../sim.js');
const Mossling = require('../mossling.js');

function close(a, b, eps = 0.15) { assert.ok(Math.abs(a-b) <= eps, `${a} should be within ${eps} of ${b}`); }

// 1. Creature personality is heritable, bounded, and represented by all five personas.
assert.equal(Mossling.PERSONAS.length, 5, 'Mosslings have five distinct persona archetypes');
const personaSet = new Set();
for (let seed = 1; seed <= 300; seed++) personaSet.add(Mossling.createState(Simulation.mulberry32(seed), null, null, seed).persona.key);
assert.equal(personaSet.size, 5, 'all five personas can emerge from seeded personality variation');
const parent = { personality: { curiosity:.92, caution:.12, playfulness:.2, sociability:.24, clinginess:.18, patience:.3, restlessness:.25 } };
const child = Mossling.createState(() => .5, parent, null, 99);
close(child.personality.curiosity, .92, .00001);
for (const value of Object.values(child.personality)) assert.ok(value >= .05 && value <= .95 && Number.isFinite(value));

// 2. Rig setup and animation remain finite through ordinary simulation steps.
const sim = new Simulation(991, { startingMosslings: 2, storms: false });
const a = sim.agents.find(x => x.species === 'mossling');
assert.ok(a && a.mossling, 'only Mosslings receive the dedicated character rig');
assert.ok(sim.agents.every(x => x.species === 'mossling' || x.mossling === null), 'other species do not receive Mossling mechanics');
Mossling.initializeRig(a);
assert.equal(a.mossling.rig.tail.length, 7, 'tail is a Verlet chain');
for (let t = 0; t < 180; t++) {
  sim.step();
  for (const agent of sim.agents) if (agent.alive && agent.mossling) {
    const m = agent.mossling, rig = m.rig;
    assert.ok(Number.isFinite(m.gaitPhase) && Number.isFinite(m.breathPhase));
    assert.ok([rig.head.x, rig.head.y, rig.rump.x, rig.rump.y, ...rig.tail.flatMap(p => [p.x,p.y])].every(Number.isFinite), 'body/limb nodes stay finite');
    for (let j=0;j<rig.tail.length-1;j++) { const d=Math.hypot(rig.tail[j+1].x-rig.tail[j].x,rig.tail[j+1].y-rig.tail[j].y); assert.ok(d < 15, 'tail constraint prevents runaway segment lengths'); }
  }
}
assert.ok(a.mossling.stepCount > 0, 'rig animates on simulation ticks');
assert.ok(a.mossling.rig && a.mossling.rig.tail.length === 7);

// 3. Pose follows behavior, crouching changes only Mossling hitbox height and it can stand again.
a.mossling.lookingTicks = 0; a.mossling.sniffTicks = 0; a.mossling.wallGripTicks = 0;
Mossling.prepareMovement(a, sim, 'hiding', 0, false, Infinity);
assert.equal(a.mossling.posture, 'crouch');
assert.equal(a.hitboxH, 18, 'crouch pose compresses the physical Mossling hitbox');
a.mossling.lookingTicks = 0; a.mossling.sniffTicks = 0;
Mossling.prepareMovement(a, sim, 'wandering', 0, false, Infinity);
assert.ok(a.hitboxH >= 25, 'Mossling returns to standing height when clear');

// 4. Panic pounce is a real movement impulse and the state transition triggers anticipation squash/stretch.
a.grounded = true; a.energy = 80; a.jumpCooldown = 0;
a.mossling.pounceCooldown = 0; a.mossling.wallGripTicks = 0; a.mossling.personality.caution = .95;
const pounce = Mossling.prepareMovement(a, sim, 'fleeing', 0, false, 65);
assert.equal(pounce.jump, true, 'near threat triggers an escape pounce');
assert.equal(a.mossling.jumpKind, 'escape-pounce');
assert.equal(a.mossling.pounces, 1);
Mossling.moveTowards(a, -24, pounce.jump);
assert.ok(a.vy < -5, 'pounce launches the Mossling upward');
assert.equal(a.grounded, false);
a.state = 'fleeing'; a.mossling.lastState = 'wandering'; a.mossling.stretch = 0;
Mossling.tick(a, sim);
assert.ok(a.mossling.stretch >= .25, 'state transition adds anticipation stretch');
assert.equal(a.mossling.mood, 'alarmed', 'mood reflects alarm state');

// 5. Wall grips and wall kicks are functional, not just animation.
a.mossling.wallGripTicks = 0; a.mossling.wallGripCooldown = 0; a.mossling.personality.clinginess = .9;
const fakeWall = { solidAt: () => true };
assert.equal(Mossling.beforeVerticalPhysics(a, fakeWall, true, 2.2, false, 1.1), true);
assert.ok(a.mossling.wallGripTicks > 0 && a.mossling.wallGrips > 0, 'Mossling grips a reachable wall while falling');
a.jumpCooldown = 0;
assert.equal(Mossling.moveTowards(a, 10, true), true);
assert.equal(a.mossling.jumpKind, 'wall-kick');
assert.ok(a.vy < -4.5, 'wall kick reverses downward velocity');

// 6. Determinism includes personality, rig initialization, and motor state.
function deterministic(seed) { const s = new Simulation(seed, { startingMosslings: 4, storms: false }); for (let i=0;i<160;i++) s.step(); return s; }
const d1 = deterministic(5544), d2 = deterministic(5544);
assert.equal(d1.stateHash(), d2.stateHash(), 'same seed reproduces the same Mossling motor/personality state');
assert.deepEqual(d1.agents.map(x => x.mossling?.persona.key), d2.agents.map(x => x.mossling?.persona.key));

// 7. Renderer smoke test with a Canvas-shaped no-op proxy catches integration typos.
const gradient = { addColorStop() {} };
const ctx = new Proxy({ createLinearGradient: () => gradient }, {
  get(target, key) { if (key in target) return target[key]; return () => (key === 'measureText' ? { width: 0 } : undefined); },
  set(target, key, value) { target[key] = value; return true; }
});
Mossling.draw(ctx, a, sim.tick, true, true);
console.log('Mossling character tests passed: five personas, inheritance, soft-body rig, crouch clearance, pounce, state-driven animation, wall grip/kick, determinism, and renderer smoke test.');
