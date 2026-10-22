'use strict';
const assert = require('node:assert/strict');
const Simulation = require('../sim.js');
const Vineback = require('../vineback.js');
const Mossling = require('../mossling.js');

function near(a,b,tol=0.18){assert.ok(Math.abs(a-b)<=tol,`${a} should be within ${tol} of ${b}`);}

// 1. All five predator archetypes can emerge from a compact inherited trait genome.
const archetypes = new Set();
for(let seed=1;seed<=500;seed++) archetypes.add(Vineback.createState(Simulation.mulberry32(seed),null,null,seed).archetype.key);
assert.equal(archetypes.size,5,'all five Vineback archetypes can emerge from deterministic trait variation');
const parent={traits:{ferocity:.91,patience:.1,territoriality:.87,packAffinity:.72,climbing:.69,curiosity:.42,stealth:.31}};
const child=Vineback.createState(()=>.5,parent,null,900);
near(child.traits.ferocity,.91,.00001);near(child.traits.territoriality,.87,.00001);
for(const val of Object.values(child.traits))assert.ok(Number.isFinite(val)&&val>=.04&&val<=.98,'inherited predator traits stay bounded');

// 2. The articulated body + tail remain stable in a real simulation, independent of the Mossling rig.
const sim=new Simulation(712,{storms:false,startingMosslings:2});
const vb=sim.spawnAgent('vineback',1180);
assert.ok(vb.vineback && vb.vineback.rig,'Vinebacks receive their own procedural rig');
assert.equal(vb.vineback.rig.spine.length,6);assert.equal(vb.vineback.rig.tail.length,10);assert.equal(vb.vineback.rig.feet.length,4);
assert.ok(sim.agents.filter(a=>a.species==='mossling').every(a=>a.vineback===null),'Vineback mechanics remain isolated from Mosslings');
for(let t=0;t<240;t++){
  sim.step();
  for(const a of sim.agents) if(a.alive&&a.vineback){
    const v=a.vineback,r=v.rig;
    assert.ok([v.gaitPhase,v.breathPhase,v.tailPhase,v.jaw,v.frill,...r.spine.flatMap(p=>[p.x,p.y,p.px,p.py]),...r.tail.flatMap(p=>[p.x,p.y,p.px,p.py]),...r.feet.flatMap(f=>[f.x,f.y,f.kneeX,f.kneeY])].every(Number.isFinite),'procedural anatomy remains finite');
    for(let i=0;i<r.tail.length-1;i++)assert.ok(Math.hypot(r.tail[i+1].x-r.tail[i].x,r.tail[i+1].y-r.tail[i].y)<17,'tail constraints prevent runaway segments');
  }
}
assert.ok(vb.vineback.territoryTicks>=0);

// 3. A ferocious predator's pounce is a real movement impulse with a cooldown.
const pounceSim=new Simulation(713,{storms:false});
const hunter=pounceSim.spawnAgent('vineback',1600), prey=pounceSim.spawnAgent('mossling',1675);
hunter.grounded=true;hunter.energy=95;hunter.vineback.traits.ferocity=.96;hunter.vineback.pounceCooldown=0;
prey.y=hunter.y;prey.hidden=false;
const action=Vineback.prepareMovement(hunter,'stalking',prey.x-hunter.x,false,pounceSim,prey);
assert.equal(action.jump,true,'stalking Vineback launches a pounce when its prey is in strike range');
assert.equal(hunter.vineback.jumpKind,'predator-pounce');Vineback.moveTowards(hunter,prey.x-hunter.x,action.jump);
assert.ok(hunter.vy < -5.4,'pounce adds a strong upward impulse');assert.equal(hunter.grounded,false);assert.equal(hunter.vineback.pounces,1);

// 4. Motion must brake before reversing rather than snapping direction at route corrections.
const movement=new Simulation(714,{storms:false});
const fastPred=movement.spawnAgent('vineback',650);fastPred.vineback.posture='pursuit';fastPred.vx=2.35;
Vineback.moveTowards(fastPred,-200,false);assert.ok(fastPred.vx>0&&fastPred.vx<2.35,'Vineback braking removes forward momentum before reversing');
const moss=movement.spawnAgent('mossling',840);moss.mossling.posture='amble';moss.vx=2.1;
Mossling.moveTowards(moss,-180,false);assert.ok(moss.vx>0&&moss.vx<2.1,'Mossling motor brakes before a target-side reversal');
const glimmer=movement.spawnAgent('glimmer',1040);glimmer.vx=1.9;
movement.moveTowards(glimmer,-140,false);assert.ok(glimmer.vx>0&&glimmer.vx<1.9,'Glimmer motor brakes before a route-side reversal');

// 5. Every surface climbing route must open through its platform, not point into a solid tile.
const traversal=new Simulation(715,{storms:false});
const surfaceClimbs=traversal.climbables.filter(c=>c.type==='vine'||c.type==='pipe');assert.ok(surfaceClimbs.length>=20);
for(const c of surfaceClimbs){const row=Math.floor(c.y1/Simulation.constants.TILE),col=Math.floor(c.x/Simulation.constants.TILE);for(let x=col-1;x<=col+1;x++)assert.equal(traversal.solids[row*Simulation.constants.COLS+x],0,`climb ${c.id||c.label} has a clear collider-width platform mouth`);}
const room=traversal.caverns[0],ladder=traversal.climbables.find(c=>c.type==='ladder'&&c.roomId===room.id);
const traveller=traversal.spawnAgent('vineback',ladder.x,null,false,(ladder.y1+ladder.y2)/2);
const remote=traversal.caverns[traversal.caverns.length-1];
const wp=traversal.routeWaypoint(traveller,remote.centerX,remote.floorY);assert.equal(wp.mode,'climbing cave exit');assert.equal(wp.climbableId,ladder.id,'route stage stays latched to the current ladder');

// 6. Hierarchy is rank-based but not frozen: earned territory/display history changes dominance.
const social=new Simulation(716,{storms:false});
const group=[];for(let i=0;i<6;i++)group.push(social.spawnAgent('vineback',2000+i*22));
social.updateClansAndTerritories(true);
assert.equal(new Set(group.map(a=>a.clanId)).size,1,'nearby Vinebacks can form an implicit clan');
assert.ok(group.some(a=>a.clanRole==='leader')&&group.some(a=>a.clanRole==='scout'),'clans distinguish leader and scout ranks');
const formerLeader=group.find(a=>a.clanRole==='leader'), challenger=group.find(a=>a.clanRole==='member');
const initialScore=social.dominanceScore(challenger);challenger.vineback.displayWins+=15;challenger.vineback.territoryTicks+=8000;
assert.ok(social.dominanceScore(challenger)>initialScore+1,'display success and territory tenure affect dominance score');
social.updateClansAndTerritories(true);assert.equal(group.slice().sort((a,b)=>social.dominanceScore(b)-social.dominanceScore(a))[0].clanRole,'leader');
assert.ok(formerLeader && challenger.clanRank>=1);

// A subordinate can actually challenge a weak alpha at a shared den, win a display,
// and make the former leader yield rather than only changing an abstract rank value.
const duelSim=new Simulation(717,{storms:false});
const den=duelSim.predatorDens[0];
const alpha=duelSim.spawnAgent('vineback',den.x-12,null,true,den.y);
const aspirant=duelSim.spawnAgent('vineback',den.x+12,null,true,den.y);
const witness=duelSim.spawnAgent('vineback',den.x+25,null,true,den.y);
for(const [i,agent] of [alpha,aspirant,witness].entries()){
  agent.x=den.x+(i-1)*15;agent.y=den.y;agent.clanId=77;agent.clanRank=i===0?1:2;
  agent.clanRole=i===0?'leader':'member';agent.vineback.traits.territoriality=.98;
  agent.vineback.traits.ferocity=.98;agent.memory.challengeUntil=0;
}
alpha.energy=15;alpha.vineback.displayWins=0;alpha.vineback.territoryTicks=10;alpha.hunts=0;
aspirant.energy=110;aspirant.vineback.displayWins=20;aspirant.vineback.territoryTicks=9000;aspirant.hunts=20;
witness.vineback.traits.territoriality=.3;
duelSim.updateAgent(aspirant,duelSim.weather());
assert.ok(aspirant.vineback.displayWins>20,'successful dominance challenge increments real display history');
assert.equal(alpha.memory.yieldFromUid,aspirant.uid,'losing alpha records the winner it must yield to');
assert.ok(alpha.memory.yieldUntil>duelSim.tick,'losing alpha receives a real temporary yield interval');
assert.ok(duelSim.events.some(e=>e.type==='dominance-display'||String(e.message).includes('held the den approach')),'dominance change produces a life-story event');

// 7. Same-seed full creature simulation remains repeatable with both articulated species.
function replay(){const s=new Simulation(718,{storms:false,startingMosslings:4});s.spawnAgent('vineback',5200);s.spawnAgent('vineback',5250);for(let i=0;i<220;i++)s.step();return s;}
const runA=replay(),runB=replay();assert.equal(runA.stateHash(),runB.stateHash(),'Vineback rig, movement, social state and Mossling behavior are deterministic');

// 8. Browser renderer contract: draw() should not require a real DOM or canvas.
const gradient={addColorStop(){}};
const ctx=new Proxy({createLinearGradient:()=>gradient}, {get(target,key){if(key in target)return target[key];return (...args)=>key==='measureText'?{width:0}:undefined;},set(target,key,value){target[key]=value;return true;}});
Vineback.draw(ctx,vb,sim.tick,true,true);
console.log('Vineback character tests passed: five archetypes, inherited traits, soft-body rig, pounce impulse, braking, climb openings, route latching, hierarchy, deterministic replay and renderer smoke test.');
