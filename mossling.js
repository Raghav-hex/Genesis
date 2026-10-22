/* Genesis Mossling character module v1.1
 * Original procedural creature rig inspired by broad soft-body/needs-driven AI principles.
 * No Rain World code, character artwork, or proprietary assets are used here.
 */
(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.GenesisMossling = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const approach = (value, target, amount) => value < target ? Math.min(target, value + amount) : Math.max(target, value - amount);
  const PERSONAS = [
    { key: 'lanternnose', name: 'Lanternnose', line: 'curious, bright-eyed, first to inspect a new sound', color: '#d5f6a5' },
    { key: 'fern-sneak', name: 'Fern-Sneak', line: 'careful, quiet, happiest beneath cover', color: '#9fdab1' },
    { key: 'pebble-bounce', name: 'Pebble-Bounce', line: 'springy, impulsive, quick to pounce then reconsider', color: '#d5c7a0' },
    { key: 'root-listener', name: 'Root-Listener', line: 'social, patient, always checking where its kin went', color: '#b7d8d6' },
    { key: 'drift-tail', name: 'Drift-Tail', line: 'restless, nimble, forever taking the longer route', color: '#c8b5ee' }
  ];
  const PERSONALITY_KEYS = ['curiosity','caution','playfulness','sociability','clinginess','patience','restlessness'];

  function createState(rng, parent = null, secondParent = null, uid = 1) {
    const personality = {};
    for (let i = 0; i < PERSONALITY_KEYS.length; i++) {
      const key = PERSONALITY_KEYS[i];
      const fresh = 0.25 + rng() * 0.5;
      let v = parent?.personality?.[key] ?? fresh;
      if (secondParent?.personality?.[key] != null) v = (v + secondParent.personality[key]) * 0.5;
      if (parent && rng() < 0.07) v += (rng() - 0.5) * 0.2;
      personality[key] = clamp(v, 0.05, 0.95);
    }
    // The persona label describes the leading disposition; the underlying continuous
    // traits still matter to decisions and can shift through inheritance/mutation.
    const personaScores = [
      { persona: PERSONAS[0], score: personality.curiosity + personality.restlessness * .08 },
      { persona: PERSONAS[1], score: personality.caution * .72 + (1 - personality.curiosity) * .22 + personality.patience * .06 },
      { persona: PERSONAS[2], score: personality.playfulness + personality.restlessness * .12 },
      { persona: PERSONAS[3], score: personality.sociability * .72 + personality.patience * .28 },
      { persona: PERSONAS[4], score: personality.restlessness * .72 + personality.clinginess * .12 + personality.curiosity * .16 }
    ].sort((a,b) => b.score - a.score || a.persona.key.localeCompare(b.persona.key));
    const persona = personaScores[0].persona;
    return {
      personality, persona: { key: persona.key, name: persona.name, line: persona.line, color: persona.color },
      mood: 'curious', posture: 'amble', gaitPhase: rng() * Math.PI * 2, breathPhase: rng() * Math.PI * 2,
      blinkSeed: Math.floor(rng() * 997), lastBlink: -999,
      squash: 0, stretch: 0, impact: 0, headDip: 0, pitch: 0,
      pounceCooldown: 20 + Math.floor(rng() * 40), jumpKind: 'ordinary',
      wallGripSide: 0, wallGripTicks: 0, wallGripCooldown: 0, wallGrips: 0, pounces: 0,
      sniffTicks: 0, lookingTicks: 0, lastState: 'wandering', stepCount: 0,
      rig: null
    };
  }

  function makePoint(x, y) { return { x, y, px: x, py: y }; }
  function initializeRig(agent) {
    const m = agent.mossling;
    if (!m || m.rig) return;
    const dir = agent.facing || 1, x = agent.x, y = agent.y;
    const head = makePoint(x + dir * 6, y - 18);
    const rump = makePoint(x - dir * 5, y - 14);
    const tail = [];
    for (let i = 0; i < 7; i++) tail.push(makePoint(x - dir * (10 + i * 5), y - 12 + i * 0.8));
    m.rig = { head, rump, tail, lastX: x, lastY: y, lastVx: 0, lastVy: 0 };
  }

  function desiredPosture(agent, state, sim) {
    const m = agent.mossling, p = m.personality;
    if (m.wallGripTicks > 0) return 'cling';
    if (/hiding|seeking cover|seeking refuge|stalking flies/.test(state)) return 'crouch';
    if (/eating|catching fly/.test(state)) return 'nibble';
    if (/fleeing|leaving vault hungry/.test(state)) return 'sprint';
    if (/climbing|route to climb|cave exit/.test(state)) return 'reach';
    if (/hunting flies/.test(state)) return 'pounce';
    if (/shelter|vault/.test(state)) return 'crouch';
    if (sim && sim.solidAt(agent.x, agent.y - Math.max(agent.hitboxH, 21) - 2)) return 'crouch';
    if (agent.hunger > 0.82 && p.curiosity > 0.5) return 'sniff';
    if (Math.abs(agent.vx) < 0.12 && agent.grounded) return 'loaf';
    return 'amble';
  }

  function prepareMovement(agent, sim, state, dx, jump, threatDistance = Infinity) {
    const m = agent.mossling;
    if (!m) return { dx, jump };
    m.posture = desiredPosture(agent, state, sim);
    if (m.pounceCooldown > 0) m.pounceCooldown--;
    if (m.wallGripCooldown > 0) m.wallGripCooldown--;
    if (m.sniffTicks > 0) m.sniffTicks--;
    if (m.lookingTicks > 0) m.lookingTicks--;

    // A small creature can fold its body to pass under low overhangs. Collision
    // height follows posture; artwork and body rig remain independent of the hitbox.
    const crouched = ['crouch','nibble','sniff'].includes(m.posture);
    const desiredH = crouched ? 18 : 26;
    if (desiredH <= agent.hitboxH) agent.hitboxH = desiredH;
    else if (!sim.collides(agent.x, agent.y, agent.hitboxW, desiredH)) agent.hitboxH = desiredH;
    else m.posture = 'crouch';

    // Panic pounce: when a predator has closed to striking distance, Mosslings
    // spend a burst of energy to leap away rather than making every escape a run.
    if (state === 'fleeing' && threatDistance < 154 && agent.grounded && m.pounceCooldown <= 0 && agent.energy > 12) {
      jump = true; m.jumpKind = 'escape-pounce'; m.pounceCooldown = 116; m.pounces = (m.pounces || 0) + 1; m.stretch = Math.max(m.stretch, 0.8);
      agent.state = 'fleeing';
    } else if (jump && state === 'hunting flies') {
      m.jumpKind = 'fly-pounce';
    } else if (jump) m.jumpKind = 'ordinary';

    // Curiosity is expressed as small hesitations and head turns instead of a
    // scripted animation loop. It only affects Mossling decisions and movement.
    if (state === 'wandering' && Math.abs(agent.vx) < 0.4 && m.lookingTicks <= 0 && m.personality.curiosity > 0.68) {
      m.lookingTicks = 26 + Math.floor(m.personality.curiosity * 28);
      m.sniffTicks = Math.max(m.sniffTicks, 5);
    }
    // Curious Mosslings genuinely pause to listen/sniff; this is a movement state,
    // not merely an idle animation that plays over uninterrupted travel.
    if (state === 'wandering' && m.lookingTicks > 0 && m.sniffTicks > 0 && m.personality.curiosity > 0.68) { dx = 0; jump = false; m.posture = 'sniff'; }
    return { dx, jump };
  }

  function moveTowards(agent, dx, jump) {
    const m = agent.mossling;
    if (!m) return false;
    const desired = Math.abs(dx) < 6 ? 0 : Math.sign(dx);
    if (m.wallGripTicks > 0 && jump && agent.jumpCooldown <= 0) {
      // Push away from the wall instead of jumping into it repeatedly.
      agent.vx = -m.wallGripSide * 2.65 * agent.traits.speed;
      agent.vy = -5.45 * agent.traits.jump;
      agent.grounded = false; agent.jumpCooldown = 30;
      m.wallGripTicks = 0; m.wallGripCooldown = 34; m.jumpKind = 'wall-kick';
      m.stretch = 1; m.squash = 0;
      return true;
    }
    if (m.wallGripTicks > 0 && desired === m.wallGripSide) {
      agent.vx *= 0.25;
    } else {
      if (desired) {
        let maxSpeed = 2.02 * agent.traits.speed * (0.91 + m.personality.restlessness * .20);
        let accel = 0.13 * agent.traits.speed * (0.9 + m.personality.restlessness * .20);
        if (m.posture === 'crouch' || m.posture === 'sniff') { maxSpeed = 1.05 * agent.traits.speed; accel = 0.075; }
        else if (m.posture === 'nibble' || m.posture === 'loaf') { maxSpeed = 0.6; accel = 0.06; }
        else if (m.posture === 'sprint' || m.jumpKind === 'escape-pounce') { maxSpeed = 3.12 * agent.traits.speed; accel = 0.19 * agent.traits.speed; }
        else if (m.posture === 'reach') { maxSpeed = 1.35 * agent.traits.speed; accel = 0.09; }
        if (agent.vx * desired < -0.18) agent.vx = approach(agent.vx, 0, accel * 1.65);
        else { agent.facing = desired; const waypointBrake = clamp(Math.abs(dx) / 34, 0.2, 1); agent.vx = clamp(agent.vx + desired * accel * waypointBrake, -maxSpeed * waypointBrake, maxSpeed * waypointBrake); }
      } else {
        agent.vx *= agent.grounded ? (m.posture === 'crouch' ? 0.67 : 0.76) : 0.985;
      }
    }
    if (jump && agent.grounded) {
      const kind = m.jumpKind;
      if (kind === 'fly-pounce') m.pounces = (m.pounces || 0) + 1;
      if (kind === 'escape-pounce') {
        agent.vy = -6.25 * agent.traits.jump;
        agent.vx = clamp(agent.vx + (desired || agent.facing) * 1.35, -3.5, 3.5);
        m.stretch = 1; m.squash = 0;
      } else if (kind === 'fly-pounce') {
        agent.vy = -5.9 * agent.traits.jump;
        agent.vx = clamp(agent.vx + (desired || agent.facing) * 0.85, -3.1, 3.1);
        m.stretch = 0.8; m.squash = 0;
      } else {
        agent.vy = -5.25 * agent.traits.jump;
        m.stretch = Math.max(m.stretch, 0.45); m.squash = 0;
      }
      agent.grounded = false;
    }
    return true;
  }

  function beforeVerticalPhysics(agent, sim, blockedX, attemptedVx, wasGrounded, oldVy) {
    const m = agent.mossling;
    if (!m) return false;
    if (m.wallGripTicks > 0) {
      const side = m.wallGripSide || agent.facing;
      const wx = agent.x + side * (agent.hitboxW * 0.5 + 2);
      const upper = sim.solidAt(wx, agent.y - agent.hitboxH * 0.72);
      const lower = sim.solidAt(wx, agent.y - agent.hitboxH * 0.25);
      if (upper || lower) {
        agent.vy = Math.min(agent.vy, 0.72);
        m.wallGripTicks--;
        m.posture = 'cling';
        return true;
      }
      m.wallGripTicks = 0;
    }
    if (blockedX && !wasGrounded && m.wallGripCooldown <= 0 && m.personality.clinginess > 0.28 && Math.abs(oldVy) < 3.2) {
      const side = Math.sign(attemptedVx) || agent.facing || 1;
      const wx = agent.x + side * (agent.hitboxW * 0.5 + 2);
      if (sim.solidAt(wx, agent.y - agent.hitboxH * 0.68) || sim.solidAt(wx, agent.y - agent.hitboxH * 0.28)) {
        m.wallGripSide = side; m.wallGripTicks = 9 + Math.round(m.personality.clinginess * 10);
        m.wallGrips++; m.posture = 'cling'; agent.vy = Math.min(agent.vy, 0.65);
        return true;
      }
    }
    return false;
  }

  function afterPhysics(agent, sim, impactSpeed, landed) {
    const m = agent.mossling;
    if (!m) return;
    if (landed && impactSpeed > 0.8) {
      m.impact = Math.max(m.impact, clamp((impactSpeed - 0.4) / 6, 0, 1));
      m.squash = Math.max(m.squash, clamp(impactSpeed / 9, 0.15, 0.9));
      m.stretch = 0;
    }
    if (m.wallGripTicks > 0) m.posture = 'cling';
  }

  function integratePoint(point, tx, ty, drag, gravity = 0) {
    const vx = (point.x - point.px) * drag, vy = (point.y - point.py) * drag;
    point.px = point.x; point.py = point.y;
    point.x += vx + (tx - point.x) * 0.22;
    point.y += vy + gravity + (ty - point.y) * 0.2;
  }
  function constrain(a, b, length, strength = 1) {
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx,dy) || 0.001;
    const move = (d - length) / d * 0.5 * strength;
    a.x += dx * move; a.y += dy * move;
    b.x -= dx * move; b.y -= dy * move;
  }

  function tick(agent, sim) {
    const m = agent.mossling;
    if (!m) return;
    initializeRig(agent);
    const rig = m.rig, dir = agent.facing || 1, speed = clamp(Math.abs(agent.vx) / 3.1, 0, 1);
    m.gaitPhase += 0.13 + speed * 0.38;
    m.breathPhase += 0.055 + speed * 0.02;
    m.squash *= 0.76; m.stretch *= 0.80; m.impact *= 0.72;
    const state = agent.state || 'wandering';
    m.mood = /fleeing|soaked/.test(state) ? 'alarmed' : /hiding|vault|seeking cover/.test(state) ? 'wary' : /eating|catching fly/.test(state) ? 'content' : /hunting flies|stalking flies/.test(state) ? 'intent' : /climbing|clinging/.test(state) ? 'focused' : m.personality.playfulness > .73 && speed > .35 ? 'playful' : m.personality.curiosity > .7 ? 'curious' : 'settled';
    if (state !== m.lastState) { m.lastState = state; if (state === 'fleeing') m.stretch = Math.max(m.stretch,0.35); if (state === 'eating') m.headDip = 1.6; }
    const crouch = ['crouch','nibble','sniff','cling'].includes(m.posture);
    const breathing = Math.sin(m.breathPhase) * (crouch ? 0.48 : 0.82);
    let dip = /eating|catching fly/.test(state) ? 2.6 : /fleeing/.test(state) ? -1.2 : /hiding/.test(state) ? 1.8 : 0;
    m.headDip += (dip - m.headDip) * 0.18;
    const centerY = agent.y - (crouch ? 12 : 14) - breathing + m.squash * 2.4 - m.stretch * 1.9;
    const hx = agent.x + dir * (6 + Math.min(2.5, agent.vx * dir * 0.65));
    const hy = centerY - 3.4 + m.headDip - m.stretch * 1.1;
    const rx = agent.x - dir * 5.4;
    const ry = centerY + 0.5 + m.squash * 1.5;
    integratePoint(rig.head, hx, hy, 0.55, 0.015);
    integratePoint(rig.rump, rx, ry, 0.64, 0.025);
    for(let i=0;i<3;i++) constrain(rig.head,rig.rump,12.6 + m.stretch*1.5 - m.squash*1.8,0.84);

    // A damped Verlet tail has its own inertia; it flicks while running and drapes
    // when falling or resting. It is visual anatomy, not another collider.
    const tail = rig.tail, baseX = rig.rump.x - dir * 7.2, baseY = rig.rump.y + 2.4;
    tail[0].x = baseX; tail[0].y = baseY; tail[0].px = baseX - agent.vx * 0.3; tail[0].py = baseY - agent.vy * 0.2;
    for(let i=1;i<tail.length;i++) {
      const p=tail[i], lag=i/tail.length;
      const wave=Math.sin(m.gaitPhase-i*0.78)*speed*(1.3+lag*2.0)*(0.78+m.personality.playfulness*.62);
      const tailLength=5.1*(0.92+m.personality.restlessness*.16);
      integratePoint(p, baseX-dir*i*tailLength+wave, baseY+lag*2.5+Math.max(0,agent.vy)*lag*1.7, 0.88, 0.055+lag*0.025);
      if(agent.grounded) p.y=Math.min(p.y,agent.y-1.1);
      if(sim && sim.solidAt(p.x,p.y)) { p.y=Math.min(p.y,agent.y-2.0); p.x += dir*0.4; }
    }
    for(let pass=0;pass<5;pass++) {
      tail[0].x=baseX;tail[0].y=baseY;
      for(let i=0;i<tail.length-1;i++) constrain(tail[i],tail[i+1],5.1*(0.92+m.personality.restlessness*.16),0.87);
      constrain(tail[1],tail[2],5.1*(0.92+m.personality.restlessness*.16),0.8);
    }
    // Deterministic blink cadence based on identity, with a short occasional double blink.
    const blinkCycle=(sim.tick + m.blinkSeed + agent.uid*23) % 181;
    m.blink = (blinkCycle < 4 || (blinkCycle > 6 && blinkCycle < 8 && agent.uid%4===0)) ? 1 : 0;
    m.stepCount++;
    rig.lastX=agent.x;rig.lastY=agent.y;rig.lastVx=agent.vx;rig.lastVy=agent.vy;
  }

  function worldToLocalX(agent, wx) { return (wx-agent.x) * (agent.facing || 1); }
  function solveKnee(a,b,l1,l2,bend) {
    const dx=b.x-a.x,dy=b.y-a.y,d=Math.max(0.001,Math.hypot(dx,dy));
    const clamped=Math.min(d,l1+l2-0.01),along=(l1*l1-l2*l2+clamped*clamped)/(2*clamped),h=Math.sqrt(Math.max(0,l1*l1-along*along));
    return {x:a.x+dx/d*along + (-dy/d)*h*bend, y:a.y+dy/d*along+(dx/d)*h*bend};
  }
  function drawLeg(ctx, shoulder, foot, l1, l2, bend, color, alpha, thickness) {
    const knee=solveKnee(shoulder,foot,l1,l2,bend);
    ctx.save();ctx.globalAlpha=alpha;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=color;ctx.lineWidth=thickness;
    ctx.beginPath();ctx.moveTo(shoulder.x,shoulder.y);ctx.quadraticCurveTo(knee.x-1,knee.y+1,foot.x,foot.y);ctx.stroke();
    ctx.fillStyle=color;ctx.beginPath();ctx.arc(knee.x,knee.y,1.8,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(foot.x+1.6,foot.y,3.3,1.75,0.05,0,Math.PI*2);ctx.fill();ctx.restore();
  }

  function draw(ctx, agent, tick, selected = false, rigDebug = false) {
    const m=agent.mossling;if(!m)return;
    initializeRig(agent);
    const rig=m.rig,dir=agent.facing||1,front=rig.head,back=rig.rump;
    const x=worldToLocalX(agent,front.x), y=front.y-agent.y;
    const rx=worldToLocalX(agent,back.x), ry=back.y-agent.y;
    const speed=clamp(Math.abs(agent.vx)/3.1,0,1),phase=m.gaitPhase;
    const crouch=['crouch','nibble','sniff','cling'].includes(m.posture);
    const breathing=Math.sin(m.breathPhase)*(crouch?.45:.75);
    const bodyScaleY=clamp(1-m.squash*.25+m.stretch*.18,0.72,1.16);
    const bodyScaleX=clamp(1+m.squash*.22-m.stretch*.10,0.88,1.22);
    const bodyX=(x+rx)*.5,bodyY=(y+ry)*.5+breathing;
    // Tail silhouette: round-ended multi-segment contour follows the Verlet chain.
    const pts=rig.tail.map(p=>({x:worldToLocalX(agent,p.x),y:p.y-agent.y}));
    // A subtle whole-body lean sells momentum without rotating the collision box.
    // The physics root remains authoritative; the visible body has its own inertia.
    const localSpeed=dir*agent.vx, lean=clamp(-localSpeed*.024+agent.vy*.018+Math.sin(phase)*speed*.025+(m.posture==='cling'?-m.wallGripSide*.045:0),-.24,.24);
    ctx.save();ctx.rotate(lean);ctx.lineCap='round';ctx.lineJoin='round';
    ctx.strokeStyle='#3f745c';ctx.lineWidth=5.1;ctx.beginPath();ctx.moveTo(rx-5,ry+2);ctx.quadraticCurveTo(pts[1]?.x,pts[1]?.y,pts[2]?.x,pts[2]?.y);for(let i=2;i<pts.length-1;i++)ctx.quadraticCurveTo(pts[i].x,pts[i].y,(pts[i].x+pts[i+1].x)*.5,(pts[i].y+pts[i+1].y)*.5);ctx.stroke();
    ctx.strokeStyle='#a6d89a';ctx.lineWidth=1.15;ctx.globalAlpha=.8;ctx.beginPath();ctx.moveTo(rx-4,ry+1);ctx.quadraticCurveTo(pts[1]?.x,pts[1]?.y,pts[2]?.x,pts[2]?.y);for(let i=2;i<pts.length-1;i++)ctx.quadraticCurveTo(pts[i].x,pts[i].y,(pts[i].x+pts[i+1].x)*.5,(pts[i].y+pts[i+1].y)*.5);ctx.stroke();ctx.globalAlpha=1;

    const stride=speed*5.2, lift=speed*4.2;
    const footY=agent.grounded ? -1.8 : clamp((agent.vy||0)*-.65,-5,5)-1.2;
    const foot=(isFront,side)=>({x:(isFront?7.2:-6.4)+Math.sin(phase+(isFront?0:Math.PI)+side*.28)*stride,y:footY-Math.max(0,Math.cos(phase+(isFront?0:Math.PI)+side*.28))*lift});
    const nearColor='#6d9970',farColor='#4c765d';
    drawLeg(ctx,{x:rx-1,y:ry+4},{...foot(false,-1),y:foot(false,-1).y},7,7,1.0,farColor,.48,2.7);
    drawLeg(ctx,{x:x-1,y:y+4},foot(true,-1),6.3,6.4,-1.0,farColor,.52,2.7);
    drawLeg(ctx,{x:rx-1,y:ry+3},foot(false,1),7.4,7,1.0,nearColor,.92,3.2);
    drawLeg(ctx,{x:x-1,y:y+3},foot(true,1),6.6,6.1,-1.0,nearColor,.98,3.0);

    // Core body is a deforming seed-pod silhouette, anchored by two linked chunks.
    ctx.save();ctx.translate(bodyX,bodyY);ctx.scale(bodyScaleX,bodyScaleY);
    const body=ctx.createLinearGradient(-14,-21,12,3);body.addColorStop(0,'#eff5c6');body.addColorStop(.25,'#d1e9aa');body.addColorStop(.58,'#9dcc8e');body.addColorStop(.86,'#5c9a77');body.addColorStop(1,'#345f55');
    ctx.fillStyle=body;ctx.beginPath();ctx.moveTo(-14,1);ctx.bezierCurveTo(-17,-5,-14,-14,-7,-17);ctx.bezierCurveTo(-2,-22,8,-21,13,-14);ctx.bezierCurveTo(19,-8,14,-1,9,2);ctx.bezierCurveTo(4,5,-9,5,-14,1);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#e7f2c3';ctx.lineWidth=1.1;ctx.stroke();
    // Soft belly patch with scattered dark speckles makes individuals read as living
    // cave fauna rather than a flat blob or a recolored slugcat.
    ctx.fillStyle='#9acb8f';ctx.beginPath();ctx.ellipse(-1,-2,8,3.6,.12,0,Math.PI*2);ctx.fill();
    for(let i=0;i<7;i++){const sx=-10+((i*37+agent.uid*13)%23),sy=-12+((i*11+agent.uid*5)%9);ctx.globalAlpha=.18+(i%3)*.07;ctx.fillStyle=i%2?'#2b644f':'#f6f7c8';ctx.beginPath();ctx.ellipse(sx,sy,1.15+(i%2)*.45,.7,0,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
    // Back fronds are small leaflets, animated by locomotion/wind and posture.
    const personaKey=m.persona.key, frondCount=personaKey==='fern-sneak'?5:personaKey==='pebble-bounce'?3:4;
    for(let i=0;i<frondCount;i++){const bx=-9+i*(18/Math.max(1,frondCount-1)),lean=Math.sin(phase*(personaKey==='drift-tail'?.62:.42)+i*1.8)*(.6+speed*2.1)+(m.posture==='sprint'?2:0);ctx.fillStyle=i%2?'#74b783':'#92cb8b';ctx.beginPath();ctx.moveTo(bx-2,-14);ctx.quadraticCurveTo(bx-4+lean,-22-i%2*2,bx+1+lean,-20-i%2*1.6);ctx.quadraticCurveTo(bx+3,-17,bx+3,-13);ctx.closePath();ctx.fill();ctx.strokeStyle='#d1e7ad82';ctx.lineWidth=.55;ctx.stroke();}
    if(personaKey==='pebble-bounce'){ctx.fillStyle='#b5d99a';for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(-6+i*6,-16-(i%2)*1.2,1.9,0,Math.PI*2);ctx.fill();}}
    if(personaKey==='fern-sneak'){ctx.fillStyle='#78b98a';ctx.beginPath();ctx.ellipse(-11,-14,3.5,1.8,-.6,0,Math.PI*2);ctx.ellipse(-13,-12,2.6,1.4,.55,0,Math.PI*2);ctx.fill();}
    // Tiny glowing spore freckles pulse with breath; subdued enough not to read as armor.
    ctx.globalAlpha=.38+.16*Math.sin(m.breathPhase*1.5);ctx.fillStyle=m.persona.color;for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(-7+i*6,-8-(i%2)*3,1.0,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
    ctx.restore();

    // Forward head chunk, soft cheek and little nose.
    const hx=x+3.8,hy=y-1.7+m.headDip*.2;
    ctx.fillStyle='#c4e4a2';ctx.beginPath();ctx.ellipse(hx,hy,6.4,5.5,.08,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#ecf5c6';ctx.lineWidth=.75;ctx.stroke();
    // Feelers/ears react to state: forward when curious, flat during flight, tucked when hiding.
    const fear=agent.state==='fleeing'?1:0,hidden=agent.hidden||/hiding|seeking cover/.test(agent.state||'');
    const earLean=fear?4:hidden?2:Math.sin(phase*.38)*1.5;
    const personaEar=personaKey==='lanternnose'?1.9:personaKey==='fern-sneak'?-1.5:personaKey==='pebble-bounce'?2.5:personaKey==='root-listener'?.5:1.2;
    for(const side of [-1,1]){
      const asym=personaKey==='drift-tail'&&side===-1?2.2:0;
      const sx=hx+side*2.8,sy=hy-3.2,ex=sx+side*(2.2+earLean*.25+personaEar*.35+asym*.2),ey=sy-(hidden?3.0:6.4+personaEar*1.25)+Math.sin(m.breathPhase+side)*1.3+asym;
      ctx.strokeStyle='#6ea57a';ctx.lineWidth=2;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(sx,sy);ctx.quadraticCurveTo(sx+side*3,sy-2,ex,ey);ctx.stroke();
      ctx.fillStyle=side===1?'#c9e5a6':'#acd69a';ctx.beginPath();ctx.ellipse(ex,ey,2.3,1.45,-.55*side,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#ecf5c8';ctx.beginPath();ctx.ellipse(ex+side*.15,ey,1.0,.55,-.55*side,0,Math.PI*2);ctx.fill();
    }
    const eyeX=hx+3.3,eyeY=hy-1.1;
    const eyeScale=agent.state==='fleeing'?1.22:1;
    ctx.fillStyle='#2b4b40';ctx.beginPath();ctx.ellipse(eyeX,eyeY,2.2*eyeScale,m.blink?0.32:2.1*eyeScale,0,0,Math.PI*2);ctx.fill();
    if(!m.blink){const gaze=clamp(((agent.targetX??agent.x)-agent.x)*dir/150,-.75,.75),pupil=agent.state==='fleeing'?'#172f2b':'#172a25';ctx.fillStyle=pupil;ctx.beginPath();ctx.arc(eyeX+.45+gaze,eyeY+.1,1.08*eyeScale,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffffdf';ctx.beginPath();ctx.arc(eyeX+.1+gaze,eyeY-.65,.47,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#dcab9a';ctx.globalAlpha=.55;ctx.beginPath();ctx.ellipse(hx+6.1,hy+1.7,1.45,.9,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    // Whiskers twitch and fan out to sample the world; they flatten while hiding.
    ctx.strokeStyle='#d5edb9';ctx.lineWidth=.65;ctx.globalAlpha=hidden?.45:.72;for(let i=0;i<3;i++){const sy=hy+1.2+i*1.25,reach=(hidden?4.1:7.2)+Math.sin(phase*.7+i+agent.uid)*.8;ctx.beginPath();ctx.moveTo(hx+4.2,sy);ctx.quadraticCurveTo(hx+7,sy-1.5,hx+reach,sy-2.3+i*.9);ctx.stroke();}ctx.globalAlpha=1;
    // Mouth changes into a tiny round nibble while feeding and a tight line when scared.
    ctx.strokeStyle='#52775d';ctx.lineWidth=.7;ctx.beginPath();if(agent.state==='eating'||agent.state==='catching fly'){ctx.ellipse(hx+4.7,hy+3.3,1.1,.8,0,0,Math.PI*2);ctx.stroke();}else{ctx.moveTo(hx+3.7,hy+3.2);ctx.quadraticCurveTo(hx+4.9,hy+3.9,hx+6.1,hy+3.2);ctx.stroke();}

    // Root-like back toe hooks help sell their grip-first climbing identity.
    ctx.strokeStyle='#78ad81';ctx.lineWidth=1.25;ctx.lineCap='round';for(let i=0;i<2;i++){const px=rx-2-i*3,py=ry+4;ctx.beginPath();ctx.moveTo(px,py);ctx.quadraticCurveTo(px-3,py+1.8,px-2.5,py+3.8);ctx.stroke();}

    if(m.posture==='cling'||m.wallGripTicks>0){const gripSide=(m.wallGripSide||-dir)*dir;ctx.strokeStyle='#a9d5ad';ctx.globalAlpha=.92;ctx.lineWidth=2.3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(gripSide*3,-4);ctx.quadraticCurveTo(gripSide*7,-7,gripSide*10,-10);ctx.quadraticCurveTo(gripSide*13,-12,gripSide*15,-9);ctx.stroke();ctx.strokeStyle='#d9f2c0';ctx.lineWidth=1;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(gripSide*(12+i),-10-i*.45);ctx.lineTo(gripSide*(14+i),-12-i*.45);ctx.stroke();}ctx.globalAlpha=1;}
    if(selected){ctx.save();ctx.strokeStyle='#eaffd6';ctx.lineWidth=1.1;ctx.setLineDash([3,3]);ctx.beginPath();ctx.ellipse(0,-12,21,17,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.restore();}
    if(rigDebug){ctx.save();ctx.strokeStyle='#7de8ff';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(worldToLocalX(agent,rig.head.x),rig.head.y-agent.y);ctx.lineTo(worldToLocalX(agent,rig.rump.x),rig.rump.y-agent.y);ctx.stroke();ctx.fillStyle='#7de8ff';for(const p of [rig.head,rig.rump,...rig.tail]){ctx.beginPath();ctx.arc(worldToLocalX(agent,p.x),p.y-agent.y,1.6,0,Math.PI*2);ctx.fill();}ctx.restore();}
    ctx.restore();
  }
  function profile(a) { const m=a?.mossling;if(!m)return null;return {persona:{...m.persona},personality:{...m.personality},mood:m.mood||'settled',posture:m.posture,wallGrips:m.wallGrips||0,wallGripTicks:m.wallGripTicks||0,pounces:m.pounces||0,stepCount:m.stepCount||0}; }
  return { PERSONAS, PERSONALITY_KEYS, createState, initializeRig, prepareMovement, moveTowards, beforeVerticalPhysics, afterPhysics, tick, draw, profile };
});
