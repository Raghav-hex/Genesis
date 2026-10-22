const assert = require('node:assert/strict');
const Simulation = require('../sim.js');
const C = Simulation.constants;

function run(seed, ticks, actions = [], options = {}) {
  const sim = new Simulation(seed, { startingMosslings: 3, storms: true, ...options });
  for (let t = 0; t < ticks; t++) {
    for (const a of actions) if (a.tick === t + 1) {
      if (['predators', 'scavengers', 'storms'].includes(a.type)) sim.enableFeature(a.type, a.value);
      else sim.applyTool(a.type, a.x, a.y);
    }
    sim.step();
    assert.ok(sim.metrics().population <= C.MAX, `population cap at tick ${t + 1}`);
    for (const agent of sim.agents) if (agent.alive) {
      assert.ok(Number.isFinite(agent.x) && Number.isFinite(agent.y) && Number.isFinite(agent.energy) && Number.isFinite(agent.hunger), 'finite agent state');
      assert.ok(agent.x >= 0 && agent.x <= C.WORLD_W, 'agent remains in world bounds');
      assert.ok(agent.y >= 0 && agent.y <= C.WORLD_H, 'agent remains in world bounds');
      assert.equal(agent.policy.length, 6);
      assert.equal(agent.brain.w1.length, C.BRAIN_INPUTS * C.BRAIN_HIDDEN);
      assert.equal(agent.brain.w2.length, C.BRAIN_HIDDEN * C.BRAIN_OUTPUTS);
      assert.ok([...agent.brain.lastInputs, ...agent.brain.lastHidden, ...agent.brain.lastOutputs].every(Number.isFinite), 'neural activations remain finite');
      assert.ok(agent.policy.every(v => v >= -1 && v <= 1), 'policy remains bounded');
    }
  }
  return sim;
}

assert.equal(C.SECTOR_COLS, 320); assert.equal(C.SECTORS, 3); assert.equal(C.COLS, 960); assert.equal(C.ROWS, 42); assert.equal(C.WORLD_W, 23040); assert.equal(C.WORLD_H, 1008); assert.equal(C.MAX, 280);
assert.equal(C.BRAIN_INPUTS, 16); assert.equal(C.BRAIN_HIDDEN, 12); assert.equal(C.BRAIN_OUTPUTS, 8);
const initial = new Simulation(42);
assert.equal(initial.count('mossling'), 0); assert.equal(initial.count('vineback'), 0); assert.equal(initial.count('glimmer'), 0, 'creatures are manually placed except predator layer');
assert.equal(initial.predatorsEnabled, false); assert.equal(initial.scavengersEnabled, false); assert.equal(initial.stormsEnabled, true);
assert.ok(initial.plants.length > 25, 'ecosystem starts with many plant patches');
assert.ok(initial.shelters.length >= 5, 'long world has distributed shelters');
assert.ok(initial.climbables.length >= 15, 'vines and pipes connect vertical routes');
assert.ok(initial.caverns.length >= 20, 'vast world includes connected underground rooms across three sectors');
assert.ok(initial.doors.length >= 6 && initial.doors.some(d => d.locked), 'underground routes include locked gates');
assert.ok(initial.levers.length >= 15 && initial.vaults.length >= 6, 'living Moss vaults are distributed throughout the vast world');
assert.ok(!Object.hasOwn(initial, 'keys') && !Object.hasOwn(initial.snapshot(), 'keys'), 'key mechanisms are absent');
for (const vault of initial.vaults) { const door = initial.doors.find(d => d.id === vault.doorId); assert.ok(door && door.vaultId === vault.id && door.locked, 'each vault has one initially sealed entrance'); assert.equal(initial.doors.filter(d => d.vaultId === vault.id).length, 1, 'vault has exactly one doorway'); for (let row = Math.floor(vault.top / C.TILE); row <= Math.floor(vault.bottom / C.TILE); row++) for (let col = Math.floor(vault.left / C.TILE); col <= Math.floor(vault.right / C.TILE) - 1; col++) { if (col === vault.entryCol && vault.entryRows.includes(row)) continue; if (col === Math.floor(vault.left / C.TILE) || col === Math.floor(vault.right / C.TILE) || row === Math.floor(vault.top / C.TILE) || row === Math.floor(vault.bottom / C.TILE)) assert.ok(initial.solids[row*C.COLS+col] !== 0 || (col === vault.entryCol && vault.entryRows.includes(row)), 'vault perimeter is solid except its single doorway'); } }
assert.ok(initial.predatorDens.length >= 4, 'predator dens are distributed between regions');
assert.ok(initial.flies.length >= 300, 'small prey scales with the larger ecosystem');
assert.equal(initial.weather().phase, 'calm');
const routeAudit = initial.auditTraversalConnectivity();
assert.equal(routeAudit.roomCount, routeAudit.reachableRooms, 'every cave has a clear, collider-width shaft to the surface');
assert.equal(routeAudit.connectedRoomPairs, routeAudit.roomCount - 1, 'cave route graph links every neighboring chamber');
assert.ok(initial.shelters.some(s=>s.x>C.WORLD_W*.75), 'shelters exist in the far world regions');
assert.ok(initial.plants.some(p=>p.x>C.WORLD_W*.75), 'plant ecology spans the far world regions');
const routeSim = new Simulation(422, {storms:false});
const deepRoom=routeSim.caverns[0], deepAgent=routeSim.spawnAgent('mossling',deepRoom.centerX,null,false,deepRoom.floorY);
const upperTargetX=routeSim.shelters[0].x, upperTargetY=routeSim.groundY(upperTargetX);
const climbWaypoint=routeSim.routeWaypoint(deepAgent,upperTargetX,upperTargetY);
assert.ok(climbWaypoint && /(climb|cave exit)/.test(climbWaypoint.mode), 'creatures in a cave route toward the full-height ladder to exit');
const surfaceRouteSim = new Simulation(423, {storms:false, startingMosslings:0});
const highVine = surfaceRouteSim.climbables.find(c=>c.type==='vine' && c.y1 < surfaceRouteSim.groundY(c.x)-48);
assert.ok(highVine,'world contains elevated vine routes from the surface');
const surfaceClimber = surfaceRouteSim.spawnAgent('mossling',highVine.x,null,false,surfaceRouteSim.groundY(highVine.x));
const ledgeWaypoint = surfaceRouteSim.routeWaypoint(surfaceClimber,highVine.x,highVine.y1);
assert.equal(ledgeWaypoint.mode,'climbing route','surface agents target an actual upward vine rather than trying to climb a down-only cave ladder');
assert.equal(ledgeWaypoint.climbX,highVine.x,'upward route locks onto its selected vine');
const descentRoom=routeSim.caverns[3], surfaceAgent=routeSim.spawnAgent('mossling',descentRoom.centerX-180);
const descentWaypoint=routeSim.routeWaypoint(surfaceAgent,descentRoom.centerX,descentRoom.floorY);
assert.ok(descentWaypoint && /descend/.test(descentWaypoint.mode), 'surface agents route to a clear shaft before entering a deep room');
// A remote destination must not cancel a ladder climb just because the destination is deeper.
const ladder = routeSim.climbables.find(c=>c.type==='ladder'&&c.roomId===deepRoom.id);
const midShaft = routeSim.spawnAgent('mossling',ladder.x,null,false,(ladder.y1+ladder.y2)/2);
const remoteRoom = routeSim.caverns[routeSim.caverns.length-1];
const midShaftWaypoint = routeSim.routeWaypoint(midShaft,remoteRoom.centerX,remoteRoom.floorY);
assert.equal(midShaftWaypoint.mode,'climbing cave exit','agent midway in its own ladder must finish exiting before traveling to a remote cave');
assert.equal(midShaftWaypoint.climbX,ladder.x,'ladder climb route remains latched to the current cave ladder');
// Once out, the route should hand control back to the surface-to-destination descent stage.
midShaft.y=ladder.y1; midShaft.x=ladder.x+14; midShaft.grounded=true;
const surfaceStage = routeSim.routeWaypoint(midShaft,remoteRoom.centerX,remoteRoom.floorY);
assert.ok(surfaceStage && /descent|climb|cave exit/.test(surfaceStage.mode),'surface stage provides a follow-on route toward the remote destination');
for(let roomIndex=0;roomIndex<routeSim.caverns.length;roomIndex++){
  const room=routeSim.caverns[roomIndex];
  const exit=routeSim.climbables.find(c=>c.type==='ladder'&&c.roomId===room.id);
  assert.ok(exit,'every room owns a route to the surface');
  assert.ok(Math.abs(exit.x-((room.col+3)*C.TILE+C.TILE/2))<1,'room ladder aligns with its clear shaft');
  const traveller=routeSim.spawnAgent('mossling',room.centerX,null,false,room.floorY);
  const destination=routeSim.caverns[(roomIndex+Math.max(1,Math.floor(routeSim.caverns.length/2)))%routeSim.caverns.length];
  if(destination.id!==room.id){
    const wp=routeSim.routeWaypoint(traveller,destination.centerX,destination.floorY);
    assert.ok(wp&&/cave exit/.test(wp.mode)&&Math.abs(wp.climbX-exit.x)<1,`cavern ${room.id} routes to its own exit before a remote cave`);
  }
}

const actions = [
  {tick: 20, type: 'plant', x: 400, y: 500},
  {tick: 60, type: 'predators', value: true},
  {tick: 80, type: 'scavengers', value: true},
  {tick: 125, type: 'rain', x: 800, y: 400},
  {tick: 180, type: 'storms', value: false},
  {tick: 240, type: 'storms', value: true},
  {tick: 310, type: 'flies', x: 820, y: 740},
  {tick: 380, type: 'fungus', x: 2500, y: 860},
];
const a = run(2026, 600, actions), b = run(2026, 600, actions);
assert.equal(a.stateHash(), b.stateHash(), 'same seed and player actions reproduce state');
assert.ok(a.metrics().learning > 0, 'agents adapt tendencies from outcomes');
assert.ok(a.events.some(e => e.type === 'unlock'), 'feature changes are observable');
assert.ok(a.metrics().activeFlies >= 0, 'fly ecology is observable');
assert.ok(a.plants.every(p => Number.isFinite(p.moisture) && Number.isFinite(p.nutrients)), 'plant physiology remains finite');

const story = new Simulation(11, {storms: false, startingMosslings: 1});
const uid = story.agents[0].uid;
story.recordStory(story.agents[0], 'ate', 'test meal');
assert.equal(story.getStory(uid).at(-1).type, 'ate');
story.kill(story.agents[0], 'test death');
assert.equal(story.getAgent(uid).alive, false, 'dead creature remains inspectable');
assert.equal(story.getStory(uid).at(-1).type, 'died', 'death remains in personal story');
const a2 = story.spawnAgent('mossling', 400);
assert.notEqual(a2.uid, uid, 'stable unique ID is not reused');

const manual = new Simulation(9, {storms:false});
const before = manual.count('glimmer'); manual.enableFeature('scavengers', true);
assert.equal(manual.count('glimmer'), before, 'enabling scavenging never auto-inserts Glimmers');
const glimmer = manual.spawnAgent('glimmer', 500);
manual.enableFeature('scavengers', false);
assert.equal(manual.count('glimmer'), 1, 'disabling scavenging does not delete manually introduced creatures');
assert.ok(glimmer.alive);

const feature = new Simulation(9, {storms: false});
feature.enableFeature('predators', true); assert.equal(feature.count('vineback'), 1, 'predator layer introduces a den predator');
assert.equal(feature.agents[0].state, 'denning');
feature.enableFeature('predators', false); assert.equal(feature.count('vineback'), 0);

const vertical = new Simulation(12, {storms:false});
const room = vertical.caverns[2];
const undergroundAgent = vertical.spawnAgent('mossling', room.centerX, null, false, room.y + 24);
assert.ok(undergroundAgent.y > vertical.groundY(undergroundAgent.x) + 60, 'observer can place agents in caves, not just on the surface');

const flyTest = new Simulation(42, {storms:false, startingMosslings:1});
const moss = flyTest.agents[0], fly = flyTest.flies[0];
moss.x=fly.x; moss.y=fly.y; const oldFlyMeals=flyTest.flyMeals;
flyTest.useEnvironmentTools(moss,fly,null,null,null);
assert.equal(fly.alive,false,'Mosslings can catch and eat glowflies');
assert.equal(flyTest.flyMeals,oldFlyMeals+1);

const gates = new Simulation(14,{storms:false});
const door = gates.doors.find(d=>d.vaultId); assert.ok(door);
gates.applyTool('toggle-gate',door.x,door.y);
assert.equal(door.locked,true,'observer cannot unlock a living Mossling seal'); assert.equal(door.open,false);
const vault=gates.vaults.find(v=>v.id===door.vaultId); const vaultMoss=gates.spawnAgent('mossling',vault.x,null,false,vault.top+2*C.TILE); vaultMoss.hunger=.82; vaultMoss.energy=45;
gates.useEnvironmentTools(vaultMoss,null,door,null,null,gates.weather());
assert.equal(door.locked,false,'Mossling can unlock a vault without a key'); assert.equal(door.open,true,'hungry Mossling releases the vault seal');
assert.ok(gates.gatesUsed > 0);
const fliesBefore=gates.flies.length; gates.applyTool('flies',door.x,door.y); assert.ok(gates.flies.length>fliesBefore,'observer can introduce food swarms');

// The reproduction gate demands maturity, adequate reserves, proximity and food.
const breeding = new Simulation(22,{storms:false});
const p1=breeding.spawnAgent('mossling',1200),p2=breeding.spawnAgent('mossling',1220);
p1.age=p2.age=1000;p1.energy=p2.energy=110;p1.hunger=p2.hunger=.1;p1.cooldown=p2.cooldown=0;p1.matingCooldown=p2.matingCooldown=0;
breeding.plants.push({id:9999,x:1210,y:breeding.groundY(1210),type:'fern',biomass:1,max:1,growth:.001,phase:0});
assert.equal(breeding.canReproduce(p1,p2),true,'well-fed mature compatible creatures with local food can mate');
p2.energy=20;assert.equal(breeding.canReproduce(p1,p2),false,'low energy prevents reproduction');

const actionsForTraversal=[];
const traversal = new Simulation(42,{storms:false});
for (let i = 0; i < 8; i++) traversal.spawnAgent('mossling', 130 + i * 32);
let climbingObservations = 0;
for (let tick = 0; tick < 800; tick++) {
  traversal.step();
  climbingObservations += traversal.agents.filter(agent => agent.alive && agent.state === 'climbing').length;
}
assert.ok(climbingObservations > 0, 'creatures use root-vines and pipes to reach elevated food');
assert.ok(traversal.metrics().learning > 0, 'adaptation counter remains observable');
const snapshot = traversal.snapshot();
assert.equal(snapshot.version, '1.3.0');
assert.ok(snapshot.archive.length >= snapshot.agents.length, 'snapshot preserves life archives');

for (let seed = 1; seed <= 20; seed++) { const s = run(seed, 80); assert.equal(s.tick, 80); assert.ok(s.metrics().population >= 0); }

// Mossling vault lifecycle: a fed creature seals itself in; hunger forces it out.
const vaultSim = new Simulation(904, { storms: false, startingMosslings: 0 });
const vaultObj = vaultSim.vaults[0], vaultDoor = vaultSim.doors.find(d => d.vaultId === vaultObj.id);
const resting = vaultSim.spawnAgent('mossling', vaultObj.x, null, false, (vaultObj.top + vaultObj.bottom) / 2);
resting.hunger = 0.1; resting.energy = 95; vaultDoor.open = true; vaultDoor.locked = false; vaultSim.setDoorSolid(vaultDoor);
vaultSim.useEnvironmentTools(resting, null, vaultDoor, null, {x: resting.x + 40, y: resting.y, alive:true}, {phase:'rain',label:'MONSOON BURST',intensity:1,next:30});
assert.equal(vaultDoor.locked, true, 'a Mossling can seal a safe vault from inside');
resting.hunger = 0.9; resting.toolCooldown = 0;
vaultSim.useEnvironmentTools(resting, null, vaultDoor, null, null, {phase:'calm',label:'SOFT DAYLIGHT',intensity:0,next:200});
assert.equal(vaultDoor.locked, false, 'hunger releases the vault lock'); assert.equal(vaultDoor.open, true, 'hunger opens the only exit');
assert.ok(vaultSim.getStory(resting.uid).some(e=>e.type==='vault-opened'), 'vault decisions enter the Mossling life story');

// A sealed vault immediately breaks line of sight; a predator abandons that target and searches another area.
const searchSim = new Simulation(904, {storms:false, startingMosslings:0});
searchSim.enableFeature('predators', true);
const sealed = searchSim.vaults[0], sealedDoor=searchSim.doors.find(d=>d.vaultId===sealed.id);
const vaultPrey=searchSim.spawnAgent('mossling',sealed.x,null,false,(sealed.top+sealed.bottom)/2);
vaultPrey.x=(sealed.left+sealed.right)/2;vaultPrey.y=(sealed.top+sealed.bottom)/2;vaultPrey.hidden=true;
searchSim.setDoorState(sealedDoor,{open:false,locked:true});
const searchHunter=searchSim.agents.find(a=>a.species==='vineback');
searchHunter.x=sealedDoor.x-100;searchHunter.y=sealed.bottom;searchHunter.targetUid=vaultPrey.uid;searchHunter.lastPreyX=vaultPrey.x;searchHunter.lastPreyY=vaultPrey.y;searchHunter.lastPreyTick=searchSim.tick;
assert.equal(searchSim.canSeeAgent(searchHunter,vaultPrey),false,'locked vault blocks even close-range predator sight');
searchSim.updateAgent(searchHunter,searchSim.weather());
assert.equal(searchHunter.targetUid,null,'predator drops the Mossling target hidden behind a sealed vault');
assert.ok(searchHunter.preySearchUntil>searchSim.tick,'lost prey creates an active new-search window');
assert.ok(searchHunter.state==='searching for new prey'||searchHunter.state==='route to climb'||searchHunter.state==='route to cave exit'||searchHunter.state==='climbing cave exit'||searchHunter.state==='route to descent'||searchHunter.state==='descending into cavern'||searchHunter.state==='climbing route','predator searches onward, using a traversal waypoint when needed');
assert.ok(Math.abs(searchHunter.searchTargetX-sealedDoor.x)>420,'new search target is away from the sealed vault instead of camping at its entrance');
assert.ok(searchSim.metrics().lostPreyEvents>0,'lost prey is observable in the telemetry');

// Hidden prey becomes harder to perceive beyond a short distance, while close contact reveals it.
const hideSim = new Simulation(905, { storms:false, startingMosslings:0 });
const hiddenMoss = hideSim.spawnAgent('mossling', 1500), hunter = hideSim.spawnAgent('vineback', 1580);
hiddenMoss.y = hunter.y = hideSim.groundY(1500); hiddenMoss.hidden = true;
assert.equal(hideSim.canSeeAgent(hunter, hiddenMoss), false, 'cover hides prey at range');
hunter.x = hiddenMoss.x + 36;
assert.equal(hideSim.canSeeAgent(hunter, hiddenMoss), true, 'very close predators can find hidden prey');
assert.ok(hideSim.nearestCover(hiddenMoss, 500), 'Mosslings can identify plant/shelter cover');

// Climate-aware plant ecology responds to rain, and seed dispersal can add patches.
const floraSim = new Simulation(906, { storms:true, startingMosslings:0 });
const flora = floraSim.plants[0]; flora.moisture=.2; flora.biomass=.25; flora.nextSeedTick=999999;
floraSim.tick=1000; const moistureBefore=flora.moisture; floraSim.step();
assert.ok(flora.moisture > moistureBefore, 'monsoon replenishes plant moisture');
const parentPatch = floraSim.plants.find(p=>p.biomass>.82); if(parentPatch){parentPatch.nextSeedTick=floraSim.tick;parentPatch.seedBank=1;}

// Glimmers enabled for scavenging consume remains and restore energy/hunger.
const scavSim = new Simulation(907, { storms:false, startingMosslings:0 }); scavSim.enableFeature('scavengers', true);
const scav = scavSim.spawnAgent('glimmer', 1800); const remains={x:scav.x,y:scav.y,biomass:.55,age:4,species:'mossling'};scavSim.carcasses.push(remains);scav.energy=40;scav.hunger=.8;
scavSim.step(); assert.ok(remains.biomass < .55, 'scavenger Glimmer eats a carcass');


// Hierarchy is implicit: nearby kin form groups and roles follow measured contribution.
const hierarchy = new Simulation(908, { storms:false, startingMosslings:0 });
const hierarchyAgents = [0,1,2,3].map((n)=>hierarchy.spawnAgent('mossling',1800+n*24));
for(let i=0;i<hierarchyAgents.length;i++){const a=hierarchyAgents[i];a.x=1800+i*24;a.y=hierarchy.groundY(a.x);a.age=1100+i*90;a.energy=88+i*6;a.foodEaten=i;a.offspring=i===3?2:0;a.toolUses=i;}
hierarchy.updateClansAndTerritories(true);
assert.equal(new Set(hierarchyAgents.map(a=>a.clanId)).size,1,'nearby Mosslings form an implicit clan');
assert.ok(hierarchyAgents.some(a=>a.clanRole==='leader'&&a.clanRank===1),'dominance scoring selects one clan leader');
assert.ok(hierarchyAgents.some(a=>a.clanRole==='scout'&&a.clanRank===2),'larger clans assign a scout role');
assert.equal(hierarchyAgents.slice().sort((a,b)=>a.clanRank-b.clanRank)[0].uid,hierarchyAgents.slice().sort((a,b)=>hierarchy.dominanceScore(b)-hierarchy.dominanceScore(a)||a.uid-b.uid)[0].uid,'rank order follows observed contribution');

// Hunger changes actual vault behaviour: Mosslings open a sealed single exit and leave.
const escapeSim = new Simulation(909, { storms:false, startingMosslings:0 });
const escapeVault = escapeSim.vaults[0], escapeDoor = escapeSim.doors.find(d=>d.vaultId===escapeVault.id);
const hungry = escapeSim.spawnAgent('mossling', escapeVault.x, null, false, (escapeVault.top+escapeVault.bottom)/2);
hungry.hunger=.9; hungry.energy=90;
let escaped=false;
for(let tick=0;tick<100;tick++){escapeSim.step();if(!escapeSim.vaultAt(hungry.x,hungry.y)){escaped=true;break;}}
assert.ok(escaped,'a hungry Mossling physically exits the vault to search for food');
assert.equal(escapeDoor.locked,false,'the vault stays unsealed after hungry exit');

// Seed dispersal adds new plant patches when the parent's local seed conditions are met.
const seedSim = new Simulation(910, { storms:false, startingMosslings:0 });
const seedParent = seedSim.plants.find(p=>p.id===1); seedParent.biomass=1; seedParent.seedBank=1; seedParent.nextSeedTick=0;
const seedBefore = seedSim.plants.length; seedSim.rng=()=>0; seedSim.tick=0; seedSim.step();
assert.equal(seedSim.plants.length,seedBefore+1,'mature plants spread a new seedling when local space is available');
assert.ok(seedSim.metrics().plantSeeds>0,'seed dispersal remains observable');

// Collision regressions: visual bounds and physical hitboxes are separate.
const physics = new Simulation(331, { storms: false });
const body = physics.spawnAgent('mossling', 700);
assert.ok(body.w > body.hitboxW, 'sprite footprint is not the collision box');
assert.ok(body.hitboxW >= 20 && body.hitboxH >= 22, 'collider covers the main creature body');
assert.equal(physics.collides(body.x, body.y, body.hitboxW, body.hitboxH), false, 'spawned agent begins outside solid terrain');
const spawnRepair = new Simulation(330, { storms: false });
const spawnRoom = spawnRepair.caverns[0], spawnCol = spawnRoom.col + 6, spawnRow = spawnRoom.top + 2;
spawnRepair.solids[spawnRow * C.COLS + spawnCol] = 1;
const repairedSpawn = spawnRepair.spawnAgent('mossling', spawnCol * C.TILE + C.TILE / 2, null, false, spawnRow * C.TILE);
assert.equal(spawnRepair.collides(repairedSpawn.x, repairedSpawn.y, repairedSpawn.hitboxW, repairedSpawn.hitboxH), false, 'spawn placement nudges creatures out of solid cells');

// One-way platforms support landing from above but do not block the underside.
const platform = physics.platforms.find(row => row[3] === 3);
const [platformCol, platformRow, platformWidth] = platform;
const platformX = (platformCol + Math.floor(platformWidth / 2)) * C.TILE + C.TILE / 2;
const platformTop = platformRow * C.TILE;
const testBox = { x: platformX, y: platformTop + 20, hitboxW: 20, hitboxH: 20 };
assert.equal(physics.collides(testBox.x, testBox.y, testBox.hitboxW, testBox.hitboxH), false, 'one-way ledge is passable from underneath');
assert.equal(physics.landingY(testBox, platformTop - 6, platformTop + 4), platformTop, 'downward movement catches the exact platform top');
assert.equal(physics.landingY(testBox, platformTop + 4, platformTop + 10), null, 'creature already beneath a ledge does not get snapped upward');

// Continuous pressure against a solid wall must not put a creature inside it.
const wallSim = new Simulation(332, { storms: false });
const roomForWall = wallSim.caverns[0];
const wallCol = roomForWall.col + 8, wallRow = roomForWall.top + 2;
wallSim.solids[wallRow * C.COLS + wallCol] = 1;
for (let col = wallCol - 4; col < wallCol; col++) wallSim.solids[(wallRow + 1) * C.COLS + col] = 1;
const blocker = wallSim.spawnAgent('mossling', wallCol * C.TILE - 40, null, false, (wallRow + 1) * C.TILE - 10);
blocker.x = wallCol * C.TILE - blocker.hitboxW / 2 - 2;
blocker.y = (wallRow + 1) * C.TILE; blocker.vx = 2; blocker.vy = 0; blocker.grounded = true;
for (let tick = 0; tick < 80; tick++) {
  if (!blocker.alive) break;
  blocker.vx = Math.min(2, Math.max(blocker.vx, 0) + .45);
  wallSim.advanceAgentPhysics(blocker);
  assert.equal(wallSim.collides(blocker.x, blocker.y, blocker.hitboxW, blocker.hitboxH), false, `wall collision keeps agent outside solids at ${tick}`);
}
assert.ok(wallSim.collisionStats.blockedMoves > 0, 'blocked movement is measured');

// Recovery from an overlap introduced by a terrain edit or forced gate close.
const embeddedSim = new Simulation(333, { storms: false });
const cave = embeddedSim.caverns[0];
const embedded = embeddedSim.spawnAgent('mossling', cave.centerX, null, false, cave.y + 24);
const embedCol = cave.col + 7, embedRow = cave.top + 2;
embeddedSim.solids[embedRow * C.COLS + embedCol] = 1;
embedded.x = embedCol * C.TILE + C.TILE / 2; embedded.y = (embedRow + 1) * C.TILE;
assert.equal(embeddedSim.collides(embedded.x, embedded.y, embedded.hitboxW, embedded.hitboxH), true, 'test fixture starts embedded');
assert.equal(embeddedSim.recoverEmbeddedAgent(embedded, 'collision regression recovery'), true);
assert.equal(embeddedSim.collides(embedded.x, embedded.y, embedded.hitboxW, embedded.hitboxH), false, 'recovery finds a safe position');
assert.equal(embeddedSim.collisionStats.recoveries, 1);

// A gate remains open while a live hitbox occupies its aperture.
const doorSim = new Simulation(334, { storms: false });
const doorAgent = doorSim.spawnAgent('mossling', 600);
const testDoor = doorSim.doors[0];
testDoor.open = true; testDoor.lastUsed = -10000; doorSim.setDoorSolid(testDoor);
doorAgent.x = testDoor.x; doorAgent.y = (Math.max(...testDoor.cells) + 1) * C.TILE - 2;
testDoor.lastUsed = doorSim.tick - 521;
assert.equal(doorSim.doorOccupied(testDoor), true, 'door recognizes a creature inside the opening');
doorSim.step();
assert.equal(testDoor.open, true, 'automatic closure waits while the collider occupies its aperture');
// A forced close (e.g. from observer manipulation) must relocate rather than trap the creature.
doorAgent.x = testDoor.x; doorAgent.y = (Math.max(...testDoor.cells) + 1) * C.TILE - 2;
testDoor.open = false; doorSim.setDoorSolid(testDoor);
assert.equal(doorSim.collides(doorAgent.x, doorAgent.y, doorAgent.hitboxW, doorAgent.hitboxH), false, 'forced gate closure triggers stuck recovery');

// Long-run multi-creature collision stress test under a changing world.
const stress = new Simulation(335, { storms: true });
stress.enableFeature('predators', true);
for (let i = 0; i < 10; i++) stress.spawnAgent(i % 3 === 0 ? 'glimmer' : 'mossling', 280 + i * 82);
for (let tick = 0; tick < 1000; tick++) {
  stress.step();
  for (const agent of stress.agents) if (agent.alive) {
    assert.equal(stress.collides(agent.x, agent.y, agent.hitboxW, agent.hitboxH), false, `no creature embedded in terrain at tick ${tick + 1}`);
  }
}
assert.ok(stress.metrics().collisionBlockedMoves >= 0);
console.log('Genesis shared-world regressions passed: perception, living vaults, hunger escape, plant physiology and spread, clan hierarchy, scavenging, neural adaptation, collision recovery, determinism and 20-seed smoke tests.');
