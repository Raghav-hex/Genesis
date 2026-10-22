/* Genesis Vineback character module v1.2
 * Original procedural predator design: soft linked body, articulated feet, a dynamic spine-tail,
 * inherited temperament, and state-driven hunting/display movement. No Rain World source or assets.
 */
(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.GenesisVineback = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const approach = (value, target, amount) => value < target ? Math.min(target, value + amount) : Math.max(target, value - amount);
  const TRAITS = ['ferocity','patience','territoriality','packAffinity','climbing','curiosity','stealth'];
  const ARCHETYPES = [
    { key:'cindermaw', name:'Cindermaw', line:'blunt-headed, explosive and difficult to drive from a den', color:'#f08c75' },
    { key:'rootstalker', name:'Rootstalker', line:'patient, sure-footed, strikes after closing every escape', color:'#9ec9a1' },
    { key:'rattleback', name:'Rattleback', line:'territorial, loud in a challenge, holds its ground', color:'#dfb17d' },
    { key:'duskcoil', name:'Duskcoil', line:'quiet, long-tailed, prefers to shadow prey from cover', color:'#b0a1db' },
    { key:'packshade', name:'Packshade', line:'social hunter, listens for clan signals and joins a coordinated chase', color:'#8dc8d4' }
  ];
  function createState(rng, parent = null, secondParent = null, uid = 1) {
    const traits = {};
    for (const k of TRAITS) {
      const fresh = 0.22 + rng() * 0.62;
      let v = parent?.traits?.[k] ?? fresh;
      if (secondParent?.traits?.[k] != null) v = (v + secondParent.traits[k]) * 0.5;
      if (parent && rng() < 0.075) v += (rng() - 0.5) * 0.2;
      traits[k] = clamp(v, 0.04, 0.98);
    }
    const scores = [
      traits.ferocity * .8 + (1-traits.patience) * .15,
      traits.patience * .45 + traits.climbing * .38 + traits.stealth * .18,
      traits.territoriality * .75 + traits.ferocity * .18,
      traits.stealth * .64 + traits.patience * .26,
      traits.packAffinity * .78 + traits.curiosity * .12
    ];
    const archetype = ARCHETYPES[scores.indexOf(Math.max(...scores))];
    return {
      traits, archetype: { ...archetype }, mood:'alert', posture:'prowl', gaitPhase:rng()*Math.PI*2,
      breathPhase:rng()*Math.PI*2, tailPhase:rng()*Math.PI*2, jaw:0, frill:0, squash:0, stretch:0,
      pounceCooldown:45 + Math.floor(rng()*90), pounces:0, successfulPounces:0,
      wallContacts:0, displayWins:0, displays:0, patrolTicks:0, packCalls:0, territoryTicks:0,
      lastState:'wandering', rig:null, lastX:null, lastY:null, stuckVisualTicks:0
    };
  }
  function point(x,y){return{x,y,px:x,py:y};}
  function initializeRig(agent) {
    const v=agent.vineback;if(!v||v.rig)return;
    const d=agent.facing||1,x=agent.x,y=agent.y;
    const spine=[]; for(let i=0;i<6;i++) spine.push(point(x+d*(12-i*5.2),y-15+Math.sin(i/5*Math.PI)*1.2));
    const tail=[]; for(let i=0;i<10;i++) tail.push(point(x-d*(16+i*5.6),y-12+i*.55));
    const feet=[]; for(let i=0;i<4;i++) feet.push({x:x+d*(i<2?7:-9),y:y-1,px:x,py:y-1,kneeX:x,kneeY:y-6,phase:i%2?Math.PI:0});
    v.rig={spine,tail,feet,lastRootX:x,lastRootY:y,lastVx:0,lastVy:0};
  }
  function prepareMovement(agent,state,dx,jump,sim,prey=null) {
    const v=agent.vineback;if(!v)return{dx,jump};
    if(v.pounceCooldown>0)v.pounceCooldown--;
    v.posture=/climbing|aligning to climb|route to climb|cave exit|descending|route to descent/.test(state)?'clamber':
      /denning|returning to den/.test(state)?'curl':
      /stalking/.test(state)?'stalk':/hunting|searching for new prey|following pack signal/.test(state)?'lunge':
      /displaying dominance|challenging/.test(state)?'flare':/yielding den/.test(state)?'submissive':
      /soaked|fleeing/.test(state)?'braced':Math.abs(agent.vx)>.35?'pursuit':'prowl';
    const dist=prey&&prey.alive?Math.hypot(prey.x-agent.x,(prey.y-agent.y)*.72):Infinity;
    // A short, cooldown-gated burst creates a readable ambush rather than constant bunny-hopping.
    if((state==='stalking'||state==='hunting')&&dist>36&&dist<118&&agent.grounded&&v.pounceCooldown<=0&&agent.energy>22&&v.traits.ferocity>.32){
      jump=true;v.jumpKind='predator-pounce';v.pounceCooldown=105+Math.round((1-v.traits.ferocity)*100);v.pounces++;v.stretch=.85;
    } else if(jump && v.jumpKind!=='predator-pounce') v.jumpKind='ordinary';
    if(state!==v.lastState){if(state==='hunting'||state==='stalking')v.stretch=Math.max(v.stretch,.18);if(state==='displaying dominance')v.displays++;v.lastState=state;}
    return{dx,jump};
  }
  function moveTowards(agent,dx,jump=false) {
    const v=agent.vineback;if(!v)return false;
    const dir=Math.abs(dx)<7?0:Math.sign(dx);
    const t=v.traits;
    let speed=(1.62+t.ferocity*.42+t.climbing*.12)*agent.traits.speed;
    let accel=.15+t.ferocity*.075;
    if(v.posture==='stalk'){speed*=.62;accel*=.72;}
    else if(v.posture==='curl'||v.posture==='submissive'){speed*=.45;accel*=.68;}
    else if(v.posture==='clamber'){speed*=.72;accel*=.72;}
    else if(v.posture==='lunge'){speed*=1.18;accel*=1.3;}
    else if(v.posture==='flare'){speed*=.52;accel*=.7;}
    const desired=dir*speed;
    // Brake before reversing, so a moving prey or route update doesn't make the body snap left/right.
    if(dir && agent.vx*dir < -.18) agent.vx=approach(agent.vx,0,accel*1.65);
    else agent.vx=approach(agent.vx,desired,accel*(dir?1:1.7));
    if(!dir && Math.abs(agent.vx)<.04)agent.vx=0;
    if(dir)agent.facing=dir;
    if(jump&&agent.grounded){
      if(v.jumpKind==='predator-pounce'){
        agent.vy=-(5.1+t.ferocity*1.0)*agent.traits.jump;
        agent.vx=clamp(agent.vx+dir*(1.05+t.ferocity*.75),-3.5,3.5);
        v.stretch=1;v.squash=0;
      }else{agent.vy=-(4.45+t.climbing*.75)*agent.traits.jump;v.stretch=Math.max(v.stretch,.38);}
      agent.grounded=false;
    }
    return true;
  }
  function integrate(p,tx,ty,drag,gravity=0){const vx=(p.x-p.px)*drag,vy=(p.y-p.py)*drag;p.px=p.x;p.py=p.y;p.x+=vx+(tx-p.x)*.24;p.y+=vy+gravity+(ty-p.y)*.2;}
  function constrain(a,b,length,strength=.88){const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||.001,move=(d-length)/d*.5*strength;a.x+=dx*move;a.y+=dy*move;b.x-=dx*move;b.y-=dy*move;}
  function tick(agent,sim){
    const v=agent.vineback;if(!v)return;initializeRig(agent);
    const r=v.rig,d=agent.facing||1,speed=clamp(Math.abs(agent.vx)/3.2,0,1),t=v.traits;
    v.gaitPhase+=.075+speed*(.24+t.ferocity*.08);v.breathPhase+=.045+speed*.015;v.tailPhase+=.045+speed*.1;
    v.squash*=.76;v.stretch*=.81;
    const st=agent.state||'wandering';
    v.mood=/hunting|following pack signal/.test(st)?'blood-hot':/stalking/.test(st)?'intent':/displaying dominance|challenging/.test(st)?'defiant':/yielding/.test(st)?'submissive':/denning|returning to den/.test(st)?'guarded':/climbing|route to climb|cave exit/.test(st)?'focused':/searching/.test(st)?'searching':/shadowing alpha|scouting ahead/.test(st)?'pack-aware':speed>.45?'agitated':'watchful';
    const jawTarget=/hunting|following pack signal/.test(st)?(.48+t.ferocity*.48):/stalking/.test(st)?.12:/displaying dominance/.test(st)?.34:0;
    v.jaw=approach(v.jaw,jawTarget,/hunting|following pack signal/.test(st)?.22:.095);
    const frillTarget=/displaying dominance|challenging|fleeing|yielding den/.test(st)?1:/hunting|stalking|patrolling territory/.test(st)?.72:.2;
    v.frill=approach(v.frill,frillTarget,.12);
    if(st==='patrolling territory'||st==='denning')v.territoryTicks++;
    if(st==='climbing'&&Math.abs(agent.vy)<.15)v.wallContacts++;
    const b=Math.sin(v.breathPhase)*(.44+(.25*(1-speed)));
    let bodyDrop=v.posture==='stalk'?2.2:v.posture==='flare'?-1.5:v.posture==='lunge'?-2.4:v.posture==='curl'?1.7:0;
    const centerY=agent.y-16+b+bodyDrop+v.squash*2-v.stretch*1.5;
    const targets=r.spine;
    for(let i=0;i<targets.length;i++){
      const q=i/(targets.length-1),x=agent.x+d*(11-q*28),y=centerY+Math.sin(q*Math.PI)*(.8+Math.abs(agent.vy)*.16)+q*q*1.6;
      integrate(targets[i],x,y,.66,.008);
    }
    for(let pass=0;pass<3;pass++)for(let i=0;i<targets.length-1;i++)constrain(targets[i],targets[i+1],5.8,.82);
    // Tail momentum is a low-frequency counter-swing, restrained by a Verlet chain.
    const tail=r.tail,base=targets[targets.length-1];tail[0].x=base.x-d*3;tail[0].y=base.y+1;tail[0].px=tail[0].x-agent.vx*.36;tail[0].py=tail[0].y-agent.vy*.22;
    for(let i=1;i<tail.length;i++){
      const q=i/(tail.length-1),wave=Math.sin(v.tailPhase-i*.48)*speed*(1+q*4.6)*(1+t.curiosity*.18);
      integrate(tail[i],base.x-d*(3+i*5.4)+wave,base.y+q*(5+Math.max(0,agent.vy)*.75),.9,.035+q*.045);
      if(sim&&sim.solidAt(tail[i].x,tail[i].y)){tail[i].y=Math.min(tail[i].y,agent.y-2);tail[i].x+=d*.45;}
    }
    for(let pass=0;pass<4;pass++){tail[0].x=base.x-d*3;tail[0].y=base.y+1;for(let i=0;i<tail.length-1;i++)constrain(tail[i],tail[i+1],5.8,.88);}
    // Four spring-following feet use alternating phases. Their feet react to real ground contact.
    for(let i=0;i<r.feet.length;i++){
      const f=r.feet[i],front=i<2,side=i%2?1:-1,phase=v.gaitPhase+(i===0||i===3?0:Math.PI),amp=4+speed*7;
      let fx=agent.x+d*((front?7:-9)+Math.sin(phase)*amp),fy=agent.y-(agent.grounded?Math.max(0,Math.cos(phase))*2.8:clamp(agent.vy*1.8,-4,7));
      const floorY=sim?sim.groundY(clamp(fx,0,sim.constructor.constants.WORLD_W-1)):agent.y;
      if(agent.grounded&&fy>floorY)fy=floorY;
      f.x+=(fx-f.x)*.36;f.y+=(fy-f.y)*.42;
      f.kneeX=agent.x+d*((front?5:-7)+Math.sin(phase+side*.45)*amp*.35);f.kneeY=agent.y-8-Math.max(0,Math.cos(phase))*2;
    }
    if(!agent.grounded&&agent.vy>1.8)v.stretch=Math.max(v.stretch,.16);
    if(v.lastX!=null&&Math.hypot(agent.x-v.lastX,agent.y-v.lastY)<.2&&Math.abs(agent.vx)>.5)v.stuckVisualTicks++;else v.stuckVisualTicks=0;
    v.lastX=agent.x;v.lastY=agent.y;
  }
  function local(p,agent){return[(p.x-agent.x)*(agent.facing||1),p.y-agent.y];}
  function draw(ctx,agent,tick,selected=false,debug=false){
    const v=agent.vineback;if(!v)return;initializeRig(agent);const r=v.rig,t=v.traits,d=agent.facing||1,spine=r.spine.map(p=>local(p,agent)),tail=r.tail.map(p=>local(p,agent)),feet=r.feet;
    const speed=clamp(Math.abs(agent.vx)/3.2,0,1),phase=v.gaitPhase,st=v.posture;
    const forwardLean=clamp(agent.vx*d*.45,-2.2,2.2),breath=Math.sin(v.breathPhase)*.7;
    // Shadow and a soft belly silhouette.
    ctx.fillStyle='#03090ab0';ctx.beginPath();ctx.ellipse(-4,1,27,5,0,0,Math.PI*2);ctx.fill();
    // Articulated legs first, so the torso visibly rests above them.
    ctx.lineCap='round';ctx.lineJoin='round';
    for(let i=0;i<feet.length;i++){
      const f=feet[i],front=i<2,[fx,fy]=local(f,agent),[kx,ky]=local({x:f.kneeX,y:f.kneeY},agent),sx=front?spine[0][0]-3:spine[4][0]+3,sy=front?spine[1][1]+3:spine[4][1]+2;
      ctx.strokeStyle='#18211c';ctx.lineWidth=5.2;ctx.beginPath();ctx.moveTo(sx,sy);ctx.quadraticCurveTo(kx,ky,fx,fy-1);ctx.stroke();
      ctx.strokeStyle=front?'#60764a':'#425b31';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(sx,sy);ctx.quadraticCurveTo(kx,ky,fx,fy-1);ctx.stroke();
      ctx.strokeStyle='#d3c093';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(fx,fy);ctx.lineTo(fx+2.8,fy+.7);ctx.lineTo(fx+4.1,fy-.1);ctx.stroke();
    }
    // Long low torso, shaded in connected ellipses so the back can compress and twist.
    for(let i=spine.length-1;i>=0;i--){
      const [x,y]=spine[i],q=i/(spine.length-1),rx=5.9+(1-q)*2.1,ry=5.9+Math.sin(q*Math.PI)*1.3;
      const g=ctx.createLinearGradient(x,y-ry,x,y+ry);g.addColorStop(0,'#d3c093');g.addColorStop(.32,'#9cad65');g.addColorStop(.76,'#425b31');g.addColorStop(1,'#18211c');
      ctx.fillStyle='#18211c';ctx.beginPath();ctx.ellipse(x,y+1,rx+1.3,ry+1.5,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(x,y,rx,ry,clamp(forwardLean*.025,-.08,.08),0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#b4cc7070';ctx.lineWidth=.65;ctx.beginPath();ctx.ellipse(x-.35,y-.8,rx*.8,ry*.52,-.05,Math.PI*1.08,Math.PI*1.86);ctx.stroke();
    }
    // Raised dorsal plates flare during a challenge or bite; low plates lie flat while stalking.
    const raised=st==='flare'||st==='lunge'||st==='pursuit'||st==='braced'?Math.max(.92,v.frill):st==='stalk'?.30:st==='clamber'?.54:.42+v.frill*.36;
    for(let i=0;i<8;i++){
      const q=(i+1)/9,index=Math.min(spine.length-1,Math.floor(q*(spine.length-1))),[x,y]=spine[index],height=(4+Math.sin(q*Math.PI)*4+ t.territoriality*2)*raised*(1+v.stretch*.18);
      ctx.fillStyle=i%2?'#29382f':'#425b31';ctx.beginPath();ctx.moveTo(x-3.5,y-2);ctx.quadraticCurveTo(x-1,y-height-1,x+2,y-height);ctx.lineTo(x+3.5,y-1);ctx.closePath();ctx.fill();
      ctx.strokeStyle='#d7776080';ctx.lineWidth=.65;ctx.beginPath();ctx.moveTo(x-1,y-height*.66);ctx.lineTo(x+1,y-2);ctx.stroke();
    }
    // Tail is visibly continuous, tapered and allowed to swing beyond the sprite's body bounds.
    ctx.lineCap='round';for(let i=0;i<tail.length-1;i++){
      const q=i/(tail.length-1),p=tail[i],n=tail[i+1];ctx.strokeStyle='#18211c';ctx.lineWidth=5.1*(1-q)+.7;ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.quadraticCurveTo((p[0]+n[0])*.5,(p[1]+n[1])*.5+Math.sin(phase-i*.4)*1.1,n[0],n[1]);ctx.stroke();
      ctx.strokeStyle=i%2?'#60764a':'#9cad65';ctx.lineWidth=2.5*(1-q)+.35;ctx.beginPath();ctx.moveTo(p[0],p[1]-.7);ctx.lineTo(n[0],n[1]-.7);ctx.stroke();
      if(i>3&&i%2===0){ctx.fillStyle='#d77760';ctx.beginPath();ctx.moveTo(n[0],n[1]-1.3);ctx.lineTo(n[0]-2.2,n[1]-4-q);ctx.lineTo(n[0]+2,n[1]-1);ctx.closePath();ctx.fill();}
    }
    const head=spine[0],hx=head[0]+4,hy=head[1]-1.2-v.stretch*1.4,headScale=1+v.stretch*.1;
    ctx.save();ctx.translate(hx,hy);ctx.scale(headScale,1);
    const hg=ctx.createLinearGradient(-3,-5,9,5);hg.addColorStop(0,'#b4cc70');hg.addColorStop(.48,'#79974a');hg.addColorStop(1,'#425b31');ctx.fillStyle=hg;ctx.beginPath();ctx.moveTo(-5,-4);ctx.quadraticCurveTo(1,-7.8,7,-4.2);ctx.lineTo(11,-1.2);ctx.quadraticCurveTo(9,2.8,3,2.5);ctx.lineTo(-3,1.5);ctx.closePath();ctx.fill();
    // Bite is a visible jaw opening, not a static triangular mouth.
    const jawOpen=v.jaw*(1.5+t.ferocity*2.4);ctx.fillStyle='#18211c';ctx.beginPath();ctx.moveTo(4,.2);ctx.lineTo(11,1.2+jawOpen);ctx.lineTo(6,3.2+jawOpen);ctx.closePath();ctx.fill();
    ctx.fillStyle='#f1e2b8';for(let i=0;i<3;i++){const tx=5+i*1.6;ctx.beginPath();ctx.moveTo(tx,1.1+jawOpen*.4);ctx.lineTo(tx+.7,3+jawOpen*.5);ctx.lineTo(tx+1.05,1.3+jawOpen*.4);ctx.closePath();ctx.fill();}
    const eyeGlow=st==='hunting'||st==='lunge'||st==='following pack signal'?'#d8f18d':'#d8f18d';ctx.shadowBlur=st==='hunting'||st==='lunge'?9:3;ctx.shadowColor=eyeGlow;ctx.fillStyle=eyeGlow;ctx.beginPath();ctx.ellipse(4.2,-2.6,1.7,1.3,-.1,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#18211c';ctx.beginPath();ctx.ellipse(4.7,-2.6,.6,1.1,0,0,Math.PI*2);ctx.fill();
    // Whisker/spine feelers twitch with curiosity; the silhouette stays original.
    for(let i=0;i<2;i++){ctx.strokeStyle='#d3c093';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(7,-2+i*1.5);ctx.quadraticCurveTo(10,Math.sin(tick*.13+i+agent.uid)*1.7,12,1+i*2);ctx.stroke();}
    ctx.restore();
    // State cues: a flare raises a throat fan; stalking lays it flat; hunting opens the jaw.
    if(st==='flare'||st==='braced'){
      ctx.strokeStyle='#d77760';ctx.lineWidth=1.6;for(let i=0;i<4;i++){const yy=-12-i*1.4;ctx.beginPath();ctx.moveTo(-5,yy);ctx.quadraticCurveTo(-10-i*.8,yy-5,-6-i*.9,yy-9);ctx.stroke();}
    }
    if(selected){ctx.strokeStyle='#ffe9d1';ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.beginPath();ctx.ellipse(-3,-13,34,19,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
    if(debug){ctx.save();ctx.strokeStyle='#78f2f0';ctx.lineWidth=.8;for(const p of spine){ctx.beginPath();ctx.arc(p[0],p[1],1.8,0,Math.PI*2);ctx.stroke();}for(const p of tail){ctx.beginPath();ctx.arc(p[0],p[1],1.4,0,Math.PI*2);ctx.stroke();}for(const f of feet){const [x,y]=local(f,agent);ctx.strokeRect(x-2,y-2,4,4);}ctx.restore();}
  }
  function profile(agent){const v=agent?.vineback;if(!v)return null;return{archetype:{...v.archetype},traits:{...v.traits},mood:v.mood,posture:v.posture,pounces:v.pounces,successfulPounces:v.successfulPounces,wallContacts:v.wallContacts,displayWins:v.displayWins,displays:v.displays,patrolTicks:v.patrolTicks,packCalls:v.packCalls,territoryTicks:v.territoryTicks,clanRole:agent.clanRole||'solo',clanRank:agent.clanRank||1};}
  return { TRAITS, ARCHETYPES, createState, initializeRig, prepareMovement, moveTowards, tick, draw, profile };
});
