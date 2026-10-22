'use strict';
const MosslingCharacter = (typeof module !== 'undefined' && module.exports) ? require('./mossling.js') : globalThis.GenesisMossling;
const VinebackCharacter = (typeof module !== 'undefined' && module.exports) ? require('./vineback.js') : globalThis.GenesisVineback;
if (!MosslingCharacter) throw new Error('Mossling character module must load before the simulation.');
if (!VinebackCharacter) throw new Error('Vineback character module must load before the simulation.');

const GenesisSimulation = (() => {
  const TILE = 24, SECTOR_COLS = 320, SECTORS = 3, COLS = SECTOR_COLS * SECTORS, ROWS = 42, WORLD_W = COLS * TILE, WORLD_H = ROWS * TILE, MAX = 280;
  const BRAIN_INPUTS = 16, BRAIN_HIDDEN = 12, BRAIN_OUTPUTS = 8;
  const SPECIES = { mossling: 0, vineback: 1, glimmer: 2 };
  const SPECIES_NAMES = ['Mossling', 'Vineback', 'Glimmer'];
  const POLICY_NAMES = ['Explore', 'Forage', 'Flee', 'Shelter', 'Hunt', 'Investigate'];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const approachVineback = (v, target, amount) => v < target ? Math.min(target, v + amount) : Math.max(target, v - amount);
  function mulberry32(seed) { let a = seed | 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hash(seed, n) { let x = (seed ^ Math.imul(n + 1, 0x9E3779B1)) | 0; x = Math.imul(x ^ x >>> 16, 0x45D9F3B); x = Math.imul(x ^ x >>> 16, 0x45D9F3B); return ((x ^ x >>> 16) >>> 0) / 4294967296; }

  class Simulation {
    constructor(seed = 42, options = {}) {
      this.options = { maxPopulation: MAX, startingMosslings: 0, startingVinebacks: 0, startingGlimmers: 0, predators: false, scavengers: false, storms: true, ...options };
      this.reset(seed);
    }
    reset(seed = 42) {
      this.seed = seed | 0;
      this.rng = mulberry32(this.seed ^ 0x15a4e35d);
      this.geneticsRng = mulberry32(this.seed ^ 0x67bc901f);
      this.weatherRng = mulberry32(this.seed ^ 0x2ab9c402);
      this.playerRng = mulberry32(this.seed ^ 0x713a9e17);
      this.tick = 0; this.nextUid = 1; this.births = 0; this.deaths = 0; this.meals = 0; this.hunts = 0; this.learningTotal = 0; this.lostPreyEvents = 0;
      this.collisionStats = { blockedMoves: 0, recoveries: 0, obstacleAvoidances: 0 };
      this.predatorsEnabled = !!this.options.predators; this.scavengersEnabled = !!this.options.scavengers; this.stormsEnabled = !!this.options.storms;
      this.solids = new Uint8Array(COLS * ROWS); this.surface = new Int16Array(COLS); this.platforms = []; this.climbables = []; this.caverns = []; this.doors = []; this.levers = []; this.vaults = []; this.predatorDens = []; this.territories = []; this.clans = []; this.nextClanId = 1; this.previousClanByUid = new Map(); this.lastTerritoryUpdate = -1; this.flies = []; this.nextFlyUid = 1; this.flyMeals = 0; this.toolEvents = 0; this.territoryEvents = 0; this.denVisits = 0; this.gatesUsed = 0; this.hiddenTicks = 0; this.vaultEntries = 0; this.vaultExits = 0; this.plantSeeds = 0; this.plants = []; this.carcasses = []; this.shelters = []; this.agents = []; this.archive = new Map(); this.events = []; this.history = [];
      this.camera = { x: 0, y: WORLD_H - 560 }; this.selectedUid = null; this.followUid = null; this.pins = []; this.worldRouteAudit = null;
      this.buildTerrain(); this.buildUnderground(); this.climbables.forEach((c, i) => { c.id = i + 1; }); this.buildVaults(); this.buildPlants(); this.buildShelters(); this.openClimbMouths(); this.buildPredatorDens(); this.buildFlies();
      for (let i = 0; i < (this.options.startingMosslings ?? 0); i++) this.spawnAgent('mossling', 130 + i * 32, null, true);
      for (let i = 0; i < (this.options.startingVinebacks || 0); i++) this.spawnAgent('vineback', 1000 + i * 140, null, true);
      for (let i = 0; i < (this.options.startingGlimmers || 0); i++) this.spawnAgent('glimmer', 750 + i * 130, null, true);
      this.updateClansAndTerritories(true);
      this.log('world', 'The Underdeep is ready. Introduce the creatures you want to observe. Moss vaults have one entrance and living seals; hungry Mosslings can unlock them without keys. Flora now responds to moisture, light, nutrients and temperature.');
      return this;
    }
    buildTerrain() {
      // Three broad connected sectors make a genuinely long traversable region.
      // Surface remains a continuous fallback route while ledges and caves add depth.
      let level = 26;
      for (let x = 0; x < COLS; x++) {
        if (x % 7 === 0) level += Math.round((hash(this.seed, x) - 0.5) * 2);
        level = clamp(level, 23, 28); this.surface[x] = level;
        for (let y = level; y < ROWS; y++) this.solids[y * COLS + x] = y >= ROWS - 2 ? 1 : (y > level + 1 && hash(this.seed + 11, x * ROWS + y) > 0.955 ? 2 : 1);
      }
      const template = [
        [9,21,8,3],[22,18,9,2],[37,22,11,3],[52,19,9,2],[68,16,12,3],
        [82,21,8,2],[96,18,13,3],[116,22,9,2],[130,17,10,3],[146,20,12,2],
        [164,16,10,3],[181,21,11,2],[199,18,10,3],[207,22,8,2],
        [224,20,12,3],[241,17,11,2],[257,22,10,3],[274,18,12,2],[294,21,13,3],[309,17,8,2]
      ];
      this.platforms = [];
      for (let sector = 0; sector < SECTORS; sector++) for (const [x,y,w,type] of template) {
        const nx=x+sector*SECTOR_COLS;
        if(nx>=COLS) continue;
        const variation=sector===0?0:Math.round((hash(this.seed, sector*1000+x)-0.5)*2);
        const ny=clamp(y+variation,15,23), nw=Math.min(w,COLS-nx);
        this.platforms.push([nx,ny,nw,type]);
      }
      for (const [x,y,w,type] of this.platforms) for(let dx=0;dx<w;dx++) if(x+dx<COLS) this.solids[y*COLS+x+dx]=type;
      this.climbables = this.platforms.map(([col,row,width,type],i)=>({x:col*TILE+Math.min(width-2,Math.max(1,Math.floor(width*.25)))*TILE,y1:row*TILE,y2:this.surface[col]*TILE,type:i%4===0?'pipe':'vine',label:i%4===0?'old pipe':'root vine'}));
      const pillars=[[34,22,3],[61,21,4],[89,23,2],[109,22,3],[154,22,3],[193,23,2],[233,22,3],[265,22,3],[300,22,3]];
      for(let sector=0;sector<SECTORS;sector++) for(const [x,top,h] of pillars){const col=x+sector*SECTOR_COLS;if(col>=COLS)continue;for(let y=top;y<top+h;y++)this.solids[y*COLS+col]=2;}
      // Each climbable must pass through the ledge it connects to. Place most
      // routes near an edge, then carve a collider-width opening after all terrain
      // solids are laid down, so decorative pillars cannot silently reseal it.
      for (const climb of this.climbables) {
        const row = clamp(Math.floor(climb.y1 / TILE), 0, ROWS - 1), center = clamp(Math.floor(climb.x / TILE), 1, COLS - 2);
        for (let col = center - 1; col <= center + 1; col++) this.solids[row * COLS + col] = 0;
      }
    }
    buildUnderground() {
      const template = [
        {col:14,width:17,top:29,bottom:35,name:'Fern Crypt',glow:'#7fdaa7'},
        {col:52,width:20,top:31,bottom:37,name:'The Rootworks',glow:'#8cb7ff'},
        {col:94,width:17,top:30,bottom:36,name:'Glowcap Grotto',glow:'#b4a2ff'},
        {col:139,width:22,top:32,bottom:38,name:'The Silt Vault',glow:'#85cbd6'},
        {col:192,width:20,top:30,bottom:36,name:'Moss Cathedral',glow:'#87db9d'},
        {col:245,width:21,top:32,bottom:38,name:'Blackwater Hollows',glow:'#77b6e8'},
        {col:291,width:17,top:30,bottom:36,name:'Amber Ossuary',glow:'#e4b778'}
      ];
      const specs=[];
      for(let sector=0;sector<SECTORS;sector++) for(let i=0;i<template.length;i++) {
        const r=template[i],col=r.col+sector*SECTOR_COLS;
        if(col+r.width>=COLS-1) continue;
        const depthShift=sector===0?0:((i+sector)%3===0?1:0);
        specs.push({...r,col,top:Math.min(33,r.top+depthShift),bottom:Math.min(39,r.bottom+depthShift),name:sector===0?r.name:`${r.name} · ${['Eastern Reach','Moss Frontier'][sector-1]||'Outer Reach'}`});
      }
      this.caverns=specs.map((r,i)=>({id:i+1,...r,x:r.col*TILE,y:r.top*TILE,widthPx:r.width*TILE,heightPx:(r.bottom-r.top)*TILE,centerX:(r.col+r.width/2)*TILE,floorY:r.bottom*TILE,kind:i%3===0?'root chamber':i%3===1?'ruin chamber':'fungal chamber',sector:Math.floor(r.col/SECTOR_COLS)}));
      for(const room of this.caverns){
        for(let col=room.col+1;col<room.col+room.width-1;col++){for(let row=room.top;row<room.bottom;row++)this.solids[row*COLS+col]=0;this.solids[room.bottom*COLS+col]=2;}
        const shaft=room.col+3,surface=this.surface[shaft];
        // Three cells wide leaves clearance around the largest creature hitbox.
        for(let row=surface;row<room.bottom;row++)for(let dx=-1;dx<=1;dx++)if(shaft+dx>=0&&shaft+dx<COLS)this.solids[row*COLS+shaft+dx]=0;
        // A ladder spans the whole shaft down to the cave floor, not only the room roof.
        this.climbables.push({x:shaft*TILE+TILE/2,y1:surface*TILE,y2:room.bottom*TILE,type:'ladder',label:'cavern ladder',roomId:room.id});
      }
      // Connect every neighboring cavern in sequence. Rooms remain individually
      // accessible by their shaft even when a corridor gate is shut.
      for(let i=0;i<this.caverns.length-1;i++){
        const left=this.caverns[i],right=this.caverns[i+1];
        const row=clamp(Math.max(left.bottom,right.bottom),34,ROWS-3);
        const gateCol=clamp(Math.floor((left.col+left.width+right.col)/2),left.col+left.width-1,right.col);
        const from=left.col+left.width-2,to=right.col+1;
        for(let col=from;col<=to;col++){
          for(let r=row-1;r<=row;r++)this.solids[r*COLS+col]=0;
          this.solids[(row+1)*COLS+col]=2;
        }
        // Step shafts through the edge of each chamber let agents enter/leave a
        // connector even when two rooms have different floor heights.
        for(const edge of [{room:left,cols:[left.col+left.width-3,left.col+left.width-2]},{room:right,cols:[right.col+1,right.col+2]}]){
          for(const col of edge.cols)if(col>=0&&col<COLS){
            for(let r=Math.max(0,edge.room.bottom-1);r<=row;r++)this.solids[r*COLS+col]=0;
            this.solids[(row+1)*COLS+col]=2;
          }
        }
        const door={id:this.doors.length+1,col:gateCol,row:row-1,x:gateCol*TILE+TILE/2,y:(row-1)*TILE,cells:[row-1,row],open:false,locked:i%3===1,name:`Passage Seal ${i+1}`,type:'corridor',vaultId:null,work:0,roomA:left.id,roomB:right.id,lastUsed:-9999,useCount:0};
        this.doors.push(door);this.setDoorSolid(door);
        const leverCol=clamp(gateCol+(gateCol<(left.col+left.width+right.col)/2?-3:3),1,COLS-2);
        this.levers.push({id:this.levers.length+1,x:leverCol*TILE+TILE/2,y:row*TILE,doorId:door.id,used:false,name:`Passage lever ${this.levers.length+1}`});
      }
    }
    buildVaults() {
      // Moss vaults are compact chambers carved inside existing caverns. Each has
      // solid roof/floor/walls and exactly one two-cell doorway. The doorway is a
      // living seal: only Mosslings can lock or unlock it; no item/key is required.
      const roomIndices = this.caverns.map((_,i)=>i).filter(i=>i%3===0);
      for (let i = 0; i < roomIndices.length; i++) {
        const room = this.caverns[roomIndices[i]];
        const left = room.col + room.width - 7;
        const right = room.col + room.width - 2;
        const roof = room.top + 1;
        const floor = room.bottom - 1;
        for (let col = left; col <= right; col++) {
          this.solids[roof * COLS + col] = 1;
          this.solids[floor * COLS + col] = 1;
        }
        for (let row = roof; row <= floor; row++) {
          this.solids[row * COLS + left] = 1;
          this.solids[row * COLS + right] = 1;
        }
        // Restore the only doorway in the left wall. Everything else around the
        // chamber remains solid, including its connection to the parent cavern.
        const doorRows = [floor - 2, floor - 1];
        for (const row of doorRows) this.solids[row * COLS + left] = 0;
        for (let col = left + 1; col < right; col++) {
          for (let row = roof + 1; row < floor; row++) this.solids[row * COLS + col] = 0;
        }
        const baseName = ['Fern Vault', 'Silt Vault', 'Amber Vault'][i % 3];
        const vault = { id: i + 1, roomId: room.id, name: room.sector ? `${baseName} ${room.sector + 1}` : baseName,
          left: left * TILE, right: (right + 1) * TILE, top: roof * TILE, bottom: floor * TILE,
          x: (left + right + 1) * TILE / 2, y: floor * TILE, entryCol: left, entryRows: doorRows.slice(),
          entranceX: left * TILE + TILE / 2, exitX: left * TILE - TILE * 1.4, lockedBy: 'mossling', occupied: false,
          biomassReserve: 0, seed: this.seed ^ (i + 1) * 0x173A };
        const door = { id: this.doors.length + 1, col: left, row: doorRows[0], x: left * TILE + TILE / 2, y: doorRows[0] * TILE,
          cells: doorRows.slice(), open: false, locked: true, name: vault.name, type: 'vault', vaultId: vault.id,
          roomA: room.id, roomB: null, lastUsed: -9999, useCount: 0, work: 0 };
        vault.doorId = door.id; this.vaults.push(vault); this.doors.push(door); this.setDoorSolid(door);
      }
    }
    setDoorSolid(door) {
      const c = door.col;
      for (const row of door.cells) this.solids[row * COLS + c] = door.open ? 0 : 4;
      if (!door.open && this.agents) {
        for (const a of this.agents) if (a.alive && this.collides(a.x, a.y, a.hitboxW, a.hitboxH)) this.recoverEmbeddedAgent(a, `was moved clear when ${door.name} closed`);
      }
    }
    doorOccupied(door) {
      const left = door.col * TILE, right = left + TILE;
      const top = Math.min(...door.cells) * TILE, bottom = (Math.max(...door.cells) + 1) * TILE;
      return this.agents.some(a => a.alive && a.x + a.hitboxW / 2 > left && a.x - a.hitboxW / 2 < right && a.y > top && a.y - a.hitboxH < bottom);
    }
    setDoorState(door, { open = door.open, locked = door.locked } = {}) {
      if (!door) return false;
      door.open = !!open; door.locked = !!locked; this.setDoorSolid(door); return true;
    }
    buildPredatorDens() {
      const rooms = this.caverns.filter((room,i)=>i%4===2);
      this.predatorDens = rooms.map((room, i) => ({ id: i + 1, x: room.centerX, y: room.floorY, roomId: room.id, label: ['Glowcap Lair','Blackwater Den','Root Maw','Outer Reach Den'][i%4] + (room.sector ? ` ${room.sector+1}` : ''), radius: 145, cooldown: 0, occupied: false, lastEmergence: -1 }));
    }
    buildFlies() {
      for (let i = 0; i < 118 * SECTORS; i++) {
        const p = this.plants[Math.floor(this.rng() * this.plants.length)] || { x: 420 + i * 20, y: this.groundY(420 + i * 20) };
        this.flies.push({ id: this.nextFlyUid++, x: p.x + (this.rng() - .5) * 160, y: p.y - 12 - this.rng() * 55, vx: (this.rng() - .5) * 1.2, vy: (this.rng() - .5) * .7, age: this.rng() * 120, energy: .4 + this.rng() * .6, wing: this.rng() * 6.28, alive: true });
      }
    }
    buildPlants() {
      const types = ['fern', 'fruit', 'glowbud'];
      for (let x = 95; x < WORLD_W - 60; x += 105 + Math.floor(this.rng() * 95)) {
        const col = clamp(Math.floor(x / TILE), 0, COLS - 1), surfaceY = this.surface[col] * TILE;
        this.plants.push({ id: this.plants.length + 1, x, y: surfaceY, type: types[Math.floor(this.rng() * types.length)], biomass: 0.45 + this.rng() * 0.55, max: 1, growth: 0.00045 + this.rng() * 0.0004, phase: this.rng() * Math.PI * 2, color: Math.floor(this.rng() * 3), perch: false });
      }
      // Some food grows on elevated ledges, giving creatures a reason to traverse vertically.
      for (let i = 1; i < this.platforms.length; i += 3) {
        const [col, row, width] = this.platforms[i], x = (col + Math.floor(width * 0.63)) * TILE;
        this.plants.push({ id: this.plants.length + 1, x, y: row * TILE, type: i % 2 ? 'glowbud' : 'fruit', biomass: 0.35 + this.rng() * 0.6, max: 1, growth: 0.00038 + this.rng() * 0.0003, phase: this.rng() * Math.PI * 2, color: Math.floor(this.rng() * 3), perch: true, zone: 'ledge' });
      }
      // Fungal gardens in the underdeep provide a second food source after surface patches are depleted.
      for (let i = 0; i < this.caverns.length; i++) {
        const room = this.caverns[i];
        for (let j = 0; j < 3; j++) {
          const x = (room.col + 3 + j * Math.max(3, Math.floor((room.width - 6) / 3))) * TILE;
          const type = j === 1 ? 'glowbud' : 'fungus';
          this.plants.push({ id: this.plants.length + 1, x, y: room.floorY, type, biomass: 0.45 + this.rng() * 0.5, max: 1, growth: 0.00055 + this.rng() * 0.0005, phase: this.rng() * Math.PI * 2, color: i % 3, perch: false, zone: 'underground' });
        }
      }
      // Plant physiology is stored per patch, so rainfall and local conditions can
      // create genuinely different growth patterns instead of one global timer.
      for (const p of this.plants) {
        p.moisture = p.zone === 'underground' ? 0.62 + this.rng() * 0.28 : 0.34 + this.rng() * 0.4;
        p.nutrients = 0.42 + this.rng() * 0.5;
        p.lightExposure = p.type === 'fungus' ? 0.12 : p.zone === 'underground' ? 0.22 : p.perch ? 0.92 : 0.8;
        p.age = 0; p.seedBank = 0.4 + this.rng() * 0.6; p.nextSeedTick = 500 + Math.floor(this.rng() * 850);
      }
    }
    buildShelters() {
      const cols = []; for(let sector=0;sector<SECTORS;sector++) for(let col=14;col<SECTOR_COLS;col+=32) if(col+sector*SECTOR_COLS<COLS-4) cols.push(col+sector*SECTOR_COLS);
      for (const col of cols) {
        const roofY = Math.max(16, this.surface[col] - 4);
        for (let dx = -3; dx <= 3; dx++) if (col + dx >= 0 && col + dx < COLS) this.solids[roofY * COLS + col + dx] = 3;
        // Entrance pillars; the center remains open and agents can walk under the roof.
        this.solids[(roofY + 1) * COLS + col - 3] = 3;
        this.solids[(roofY + 1) * COLS + col + 3] = 3;
        this.shelters.push({ id: this.shelters.length + 1, x: col * TILE, y: roofY * TILE, radius: 82, label: ['Fern Nook', 'Moss Hall', 'Blueglass Rest', 'Root Hollow', 'Echo Shelter', 'Rain Cup', 'Last Lantern'][this.shelters.length % 7] + (Math.floor(this.shelters.length / 7) ? ` ${Math.floor(this.shelters.length / 7) + 1}` : '') });
      }
    }
    openClimbMouths() {
      // Shelters and roof dressing are authored after the raw terrain; run a final
      // connectivity pass so no later roof tile reseals a vine/pipe access point.
      for (const climb of this.climbables) {
        if (climb.type === 'ladder') continue; // cave shafts are already clear and wider
        const row = clamp(Math.floor(climb.y1 / TILE), 0, ROWS - 1), center = clamp(Math.floor(climb.x / TILE), 1, COLS - 2);
        for (let col = center - 1; col <= center + 1; col++) this.solids[row * COLS + col] = 0;
      }
    }
    log(type, message, uid = null, x = null, y = null) {
      const e = { tick: this.tick, type, message: String(message), uid, x, y };
      this.events.push(e); if (this.events.length > 180) this.events.shift();
      if (uid != null) {
        const rec = this.archive.get(uid);
        if (rec) { rec.story.push(e); if (rec.story.length > 70) rec.story.shift(); }
      }
      return e;
    }
    recordStory(a, type, message) { this.log(type, `${a.name}: ${message}`, a.uid, a.x, a.y); }
    groundY(x) { return this.surface[clamp(Math.floor(x / TILE), 0, COLS - 1)] * TILE; }
    solidAt(x, y) {
      if (x < 0 || x >= WORLD_W || y < 0 || y >= WORLD_H) return y >= WORLD_H;
      const c = Math.floor(x / TILE), r = Math.floor(y / TILE);
      return !!this.solids[r * COLS + c];
    }
    // Physical collision is independent of sprite artwork. Tile type 3 is a
    // one-way platform: it supports downward landings, but is not a wall or ceiling.
    collisionTileAt(col, row) {
      if (col < 0 || col >= COLS || row < 0) return 0;
      if (row >= ROWS) return 1;
      return this.solids[row * COLS + col] || 0;
    }
    isFullSolidTile(tile) { return tile === 1 || tile === 2 || tile === 4; }
    collides(x, y, w = 25, h = 26) {
      const skin = 1.25;
      const left = x - w / 2 + skin, right = x + w / 2 - skin;
      const top = y - h + skin, bottom = y - skin;
      if (left < 0 || right >= WORLD_W || top < 0 || bottom >= WORLD_H) return true;
      const c0 = Math.floor(left / TILE), c1 = Math.floor((right - 0.001) / TILE);
      const r0 = Math.floor(top / TILE), r1 = Math.floor((bottom - 0.001) / TILE);
      for (let row = r0; row <= r1; row++) {
        for (let col = c0; col <= c1; col++) {
          if (this.isFullSolidTile(this.collisionTileAt(col, row))) return true;
        }
      }
      return false;
    }
    landingY(a, fromY, toY) {
      if (toY <= fromY) return null;
      const skin = 1.25;
      const left = a.x - a.hitboxW / 2 + skin, right = a.x + a.hitboxW / 2 - skin;
      const c0 = Math.max(0, Math.floor(left / TILE));
      const c1 = Math.min(COLS - 1, Math.floor((right - 0.001) / TILE));
      const r0 = Math.max(0, Math.floor((fromY + 0.001) / TILE));
      const r1 = Math.min(ROWS - 1, Math.floor((toY + 0.001) / TILE));
      let best = null;
      for (let row = r0; row <= r1; row++) {
        const top = row * TILE;
        if (top < fromY - 0.01 || top > toY + 0.01) continue;
        for (let col = c0; col <= c1; col++) {
          const tile = this.collisionTileAt(col, row);
          if (this.isFullSolidTile(tile) || tile === 3) { if (best == null || top < best) best = top; break; }
        }
      }
      return best;
    }
    hasFloorContact(a) {
      const skin = 1.25, footRow = Math.floor((a.y + 0.01) / TILE), top = footRow * TILE;
      if (Math.abs(a.y - top) > 2.4) return false;
      const left = a.x - a.hitboxW / 2 + skin, right = a.x + a.hitboxW / 2 - skin;
      const c0 = Math.max(0, Math.floor(left / TILE)), c1 = Math.min(COLS - 1, Math.floor((right - 0.001) / TILE));
      for (let col = c0; col <= c1; col++) {
        const tile = this.collisionTileAt(col, footRow);
        if (this.isFullSolidTile(tile) || tile === 3) return true;
      }
      return false;
    }
    findSafePosition(x, y, w, h, maxRadius = TILE * 10) {
      if (!this.collides(x, y, w, h)) return { x, y };
      // Search concentric rings. This only runs for an embedded spawn or rare recovery,
      // so a slightly more expensive search is preferable to leaving a creature trapped.
      for (let radius = 4; radius <= maxRadius; radius += 4) {
        const count = Math.max(12, Math.ceil((Math.PI * 2 * radius) / 8));
        for (let i = 0; i < count; i++) {
          const angle = i * Math.PI * 2 / count;
          const nx = x + Math.cos(angle) * radius, ny = y + Math.sin(angle) * radius;
          if (nx < w / 2 || nx > WORLD_W - w / 2 || ny < h || ny > WORLD_H - TILE) continue;
          if (!this.collides(nx, ny, w, h)) return { x: nx, y: ny };
        }
      }
      // Deterministic last resort: scan nearby floor columns for a clear standing spot.
      const centerCol = clamp(Math.floor(x / TILE), 0, COLS - 1);
      for (let d = 0; d < COLS; d++) for (const col of [centerCol - d, centerCol + d]) {
        if (col < 0 || col >= COLS) continue;
        const foot = this.surface[col] * TILE;
        const nx = col * TILE + TILE / 2;
        if (!this.collides(nx, foot, w, h)) return { x: nx, y: foot };
      }
      return null;
    }
    recoverEmbeddedAgent(a, reason = 'was freed from a collision') {
      if (!this.collides(a.x, a.y, a.hitboxW, a.hitboxH)) return false;
      const safe = this.findSafePosition(a.x, a.y, a.hitboxW, a.hitboxH);
      if (safe) {
        a.x = safe.x; a.y = safe.y;
      } else {
        a.x = clamp(a.x, a.hitboxW / 2, WORLD_W - a.hitboxW / 2);
        a.y = this.groundY(a.x);
      }
      a.vx = 0; a.vy = 0; a.grounded = this.hasFloorContact(a);
      a.blockedTicks = 0; a.obstacleAvoidTicks = 18; a.avoidDirection = a.facing ? -a.facing : 1;
      a.stuckRecoveries = (a.stuckRecoveries || 0) + 1;
      this.collisionStats.recoveries++;
      if (a.stuckRecoveries === 1 || a.stuckRecoveries % 4 === 0) this.recordStory(a, 'unstuck', reason);
      return true;
    }
    advanceAgentPhysics(a) {
      // First recover an agent that was overlapped by a newly closed gate or terrain edit.
      if (this.recoverEmbeddedAgent(a)) return { blockedX: true, blockedY: true, recovered: true };
      const mossWasGrounded = a.grounded, mossOldVy = a.vy;
      let blockedX = false, blockedY = false;
      const dx = a.vx, xSteps = Math.max(1, Math.ceil(Math.abs(dx) / 4));
      if (Math.abs(dx) > 0) {
        const inc = dx / xSteps;
        for (let step = 0; step < xSteps; step++) {
          const nx = a.x + inc;
          if (this.collides(nx, a.y, a.hitboxW, a.hitboxH)) { blockedX = true; a.vx = 0; break; }
          a.x = nx;
        }
      }
      // Hitting a low wall should prompt a jump only when the body can move upward.
      if (blockedX && a.grounded && a.jumpCooldown <= 0 && !this.collides(a.x, a.y - 4, a.hitboxW, a.hitboxH)) {
        a.vy = (a.species === 'mossling' ? -5.15 : -4.6) * a.traits.jump; a.grounded = false; a.jumpCooldown = 28;
      }
      if (a.species === 'mossling' && a.mossling) {
        MosslingCharacter.beforeVerticalPhysics(a, this, blockedX, dx, mossWasGrounded, mossOldVy);
      }
      a.vy = Math.min(6.5, a.vy + 0.18);
      const fromY = a.y, toY = a.y + a.vy;
      if (a.vy > 0) {
        const landing = this.landingY(a, fromY, toY);
        if (landing != null) { a.y = landing; a.vy = 0; a.grounded = true; blockedY = true; }
        else {
          const n = Math.max(1, Math.ceil(Math.abs(a.vy) / 4)), inc = a.vy / n;
          for (let i = 0; i < n; i++) {
            const ny = a.y + inc;
            if (this.collides(a.x, ny, a.hitboxW, a.hitboxH)) { blockedY = true; a.vy = 0; break; }
            a.y = ny;
          }
          a.grounded = false;
        }
      } else if (a.vy < 0) {
        const n = Math.max(1, Math.ceil(Math.abs(a.vy) / 4)), inc = a.vy / n;
        for (let i = 0; i < n; i++) {
          const ny = a.y + inc;
          if (this.collides(a.x, ny, a.hitboxW, a.hitboxH)) { blockedY = true; a.vy = 0; break; }
          a.y = ny;
        }
        a.grounded = false;
      } else {
        a.grounded = this.hasFloorContact(a);
      }
      if (!a.grounded && a.vy >= 0 && this.hasFloorContact(a)) { a.y = Math.round(a.y / TILE) * TILE; a.vy = 0; a.grounded = true; }
      a.x = clamp(a.x, a.hitboxW / 2, WORLD_W - a.hitboxW / 2);
      if (a.y > WORLD_H - a.hitboxH) { a.y = this.groundY(a.x); a.vy = 0; a.grounded = true; }
      if (blockedX) {
        this.collisionStats.blockedMoves++;
        a.blockedTicks = (a.blockedTicks || 0) + 1;
        if (a.blockedTicks >= 26) {
          a.obstacleAvoidTicks = 44; a.avoidDirection = -a.facing || 1; a.blockedTicks = 0;
          a.targetX = clamp(a.x + a.avoidDirection * 180, 35, WORLD_W - 35);
          a.stateTicks = 0; this.collisionStats.obstacleAvoidances++;
          if ((a.obstacleAvoidances = (a.obstacleAvoidances || 0) + 1) === 1 || a.obstacleAvoidances % 4 === 0) this.recordStory(a, 'avoided-obstacle', 'backed away from a blocked passage to find another route');
        }
      } else a.blockedTicks = Math.max(0, (a.blockedTicks || 0) - 2);
      if (this.collides(a.x, a.y, a.hitboxW, a.hitboxH)) this.recoverEmbeddedAgent(a);
      if (a.species === 'mossling' && a.mossling) MosslingCharacter.afterPhysics(a, this, Math.max(0, mossOldVy) + 0.18, !mossWasGrounded && a.grounded && mossOldVy > 0.6);
      return { blockedX, blockedY, recovered: false };
    }
    auditTraversalConnectivity() {
      const rooms = this.caverns.map(room => {
        const shaft = room.col + 3, surface = this.surface[shaft];
        let clear = true;
        for (let row = surface; row < room.bottom; row++) for (let dx = -1; dx <= 1; dx++) {
          if (this.solids[row * COLS + shaft + dx] !== 0) clear = false;
        }
        return { roomId: room.id, name: room.name, shaftCol: shaft, clearShaft: clear };
      });
      return { worldWidth: WORLD_W, sectors: SECTORS, roomCount: rooms.length, reachableRooms: rooms.filter(r => r.clearShaft).length, rooms, connectedRoomPairs: Math.max(0, rooms.length - 1), sealedVaults: this.vaults.filter(v => this.doors.find(d => d.id === v.doorId)?.locked).length };
    }
    weather() {
      if (!this.stormsEnabled) return { phase: 'calm', label: 'CLEAR SKIES', intensity: 0, next: Infinity };
      const cycle = this.tick % 1800;
      if (cycle < 760) return { phase: 'calm', label: 'SOFT DAYLIGHT', intensity: 0, next: 760 - cycle };
      if (cycle < 1000) { const approach = (cycle - 760) / 240; return { phase: 'warning', label: 'RAIN APPROACHING', intensity: 0.08 + 0.18 * Math.sin(approach * Math.PI / 2), next: 1000 - cycle }; }
      if (cycle < 1370) return { phase: 'rain', label: 'MONSOON BURST', intensity: 0.45 + 0.55 * Math.sin((cycle - 1000) / 370 * Math.PI), next: 1370 - cycle };
      return { phase: 'after', label: 'WET SEASON / REGROWTH', intensity: 0.12, next: 1800 - cycle };
    }
    daylight() { return 0.5 + 0.5 * Math.sin((this.tick % 1200) / 1200 * Math.PI * 2 - Math.PI / 2); }
    nearestAgent(a, predicate, range = Infinity) {
      let best = null, bd = range;
      for (const b of this.agents) if (b.alive && b.uid !== a.uid && predicate(b)) { const d = Math.hypot(b.x - a.x, b.y - a.y); if (d < bd) { bd = d; best = b; } }
      return best;
    }
    nearestPlant(a, edible = true) {
      let best = null, bd = Infinity;
      for (const p of this.plants) if (!edible || p.biomass > 0.09) { const d = Math.hypot(p.x - a.x, p.y - a.y); if (d < bd) { bd = d; best = p; } }
      return best;
    }
    nearestShelter(a) {
      let best = this.shelters[0], bd = Infinity;
      for (const s of this.shelters) { const d = Math.abs(s.x - a.x); if (d < bd) { bd = d; best = s; } }
      return best;
    }
    inShelter(a) { return this.shelters.some(s => Math.abs(a.x - s.x) < s.radius && a.y > s.y + 8 && a.y <= this.groundY(a.x) + 5); }
    vaultAt(x, y) { return this.vaults.find(v => x > v.left + 5 && x < v.right - 5 && y >= v.top + 5 && y <= v.bottom + 6) || null; }
    nearestVault(a, range = Infinity) {
      let best = null, bd = range;
      for (const vault of this.vaults) {
        const door = this.doors.find(d => d.vaultId === vault.id); if (!door) continue;
        const d = Math.hypot(door.x - a.x, (door.y - a.y) * 0.7);
        if (d < bd) { bd = d; best = { ...vault, ref: vault, door, dist: d }; }
      }
      return best;
    }
    nearestCover(a, range = 220) {
      let best = null, bestScore = Infinity;
      for (const p of this.plants) {
        if (p.biomass < 0.36 || Math.abs(p.y - a.y) > 105) continue;
        const d = Math.hypot(p.x - a.x, (p.y - a.y) * 0.62);
        if (d < range && d < bestScore) bestScore = d, best = { x: p.x, y: p.y, id: p.id, kind: p.type === 'fungus' ? 'fungal cover' : 'vegetation', dist: d, concealment: p.type === 'fungus' ? 0.66 : 0.56 };
      }
      for (const v of this.vaults) {
        const x = (v.left + v.right) / 2, y = v.bottom;
        const d = Math.hypot(x - a.x, (y - a.y) * 0.65);
        if (d < range && d < bestScore) bestScore = d, best = { x, y, id: `vault-${v.id}`, kind: 'vault alcove', dist: d, concealment: 0.95 };
      }
      for (const s of this.shelters) {
        const y = this.groundY(s.x), d = Math.hypot(s.x-a.x,(y-a.y)*.65);
        if (d < range && d < bestScore) bestScore = d, best = { x: s.x, y, id: `shelter-${s.id}`, kind: 'shelter', dist: d, concealment: 0.78 };
      }
      return best;
    }
    canSeeAgent(observer, target) {
      if (!observer || !target || !observer.alive || !target.alive) return false;
      const dx = target.x - observer.x, dy = (target.y - target.h * 0.52) - (observer.y - observer.h * 0.52);
      const dist = Math.hypot(dx, dy);
      const hiddenVault = this.vaultAt(target.x, target.y);
      if (hiddenVault) {
        const seal = this.doors.find(d => d.vaultId === hiddenVault.id);
        if (seal && seal.locked && !this.vaultAt(observer.x, observer.y)) return false;
      }
      if (target.hidden && dist > 48) return false;
      // Close-contact discovery pierces vegetation/camouflage, but the sealed-vault
      // guard above always wins, so predators cannot see through a closed Moss vault.
      if (target.hidden && dist <= 48) return true;
      // Solid masonry and closed vaults occlude ordinary sightlines.
      const steps = Math.max(2, Math.ceil(dist / 22));
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        if (this.solidAt(observer.x + dx * t, observer.y - observer.h * 0.52 + dy * t)) return false;
      }
      // Close-contact discovery overrides ordinary vegetation concealment only
      // when no masonry or closed vault seal blocks the line of sight.
      return true;
    }
    nearestFly(a, range = 900) {
      let best = null, bd = range;
      for (const f of this.flies) if (f.alive) { const d = Math.hypot(f.x-a.x, (f.y-a.y)*0.72); if (d < bd) { bd=d; best=f; } }
      return best;
    }
    nearestDoor(a, range = 160) { let best=null,bd=range; for (const d of this.doors) { const dist=Math.hypot(d.x-a.x,(d.y-a.y)*.7); if(dist<bd){bd=dist;best=d;} } return best; }
    nearbyAgents(a, predicate, range) { const out=[]; for(const b of this.agents) if(b.alive&&b.uid!==a.uid&&predicate(b)){const d=Math.hypot(b.x-a.x,(b.y-a.y)*.75);if(d<range)out.push({agent:b,d});} return out; }
    dominanceScore(a) {
      const age = a.age / Math.max(1, a.lifespan), energy = a.energy / 120;
      if (a.species === 'vineback' && a.vineback) { const v = a.vineback, t = v.traits; return age*.07 + energy*.12 + (a.hunts||0)*.095 + (a.offspring||0)*.055 + (a.learningEvents||0)*.009 + (v.displayWins||0)*.055 + (v.territoryTicks||0)*.000025 + t.territoriality*.12 + t.ferocity*.08 + t.packAffinity*.035 + t.patience*.025; }
      return age * 0.16 + energy * 0.26 + (a.hunts || 0) * 0.045 + (a.foodEaten || 0) * 0.018 + (a.offspring || 0) * 0.075 + (a.toolUses || 0) * 0.025 + (a.learningEvents || 0) * 0.008;
    }
    updateClansAndTerritories(force = false) {
      if (!force && this.tick - this.lastTerritoryUpdate < 36) return;
      this.lastTerritoryUpdate = this.tick;
      const living=this.agents.filter(a=>a.alive), oldMembers=new Map();
      for(const clan of this.clans) for(const uid of clan.members) oldMembers.set(uid,clan.id);
      const parent = new Map(living.map(a=>[a.uid,a.uid]));
      const root = uid => { let p=parent.get(uid); if(p===undefined)return uid; while(p!==parent.get(p))p=parent.get(p); let cur=uid;while(parent.get(cur)!==p){const nxt=parent.get(cur);parent.set(cur,p);cur=nxt;}return p; };
      const union=(a,b)=>{const ra=root(a.uid),rb=root(b.uid);if(ra!==rb)parent.set(Math.max(ra,rb),Math.min(ra,rb));};
      for(let i=0;i<living.length;i++) for(let j=i+1;j<living.length;j++) {
        const a=living[i],b=living[j]; if(a.species!==b.species)continue;
        const d=Math.hypot(a.x-b.x,(a.y-b.y)*.65);
        const kin=a.parentUid===b.uid||b.parentUid===a.uid||(a.siblingGroup!=null&&a.siblingGroup===b.siblingGroup);
        const vinebackRange = a.species === 'vineback' ? 150 + (((a.vineback?.traits.packAffinity || .4) + (b.vineback?.traits.packAffinity || .4)) * 72) : 195;
        if(d<(kin?(a.species==='vineback'?420:360):vinebackRange)) union(a,b);
      }
      const groups=new Map();for(const a of living){const r=root(a.uid);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(a);}
      const next=[],usedOld=new Set();
      for(const members of groups.values()) {
        if(members.length<2){members[0].clanId=null;members[0].territoryId=null;members[0].clanRank=1;members[0].clanRole='solo';continue;}
        const counts=new Map();for(const a of members){const id=oldMembers.get(a.uid);if(id)counts.set(id,(counts.get(id)||0)+1);}
        let clanId=null,bestCount=0;for(const [id,count] of counts)if(count>bestCount&&!usedOld.has(id)){clanId=id;bestCount=count;}
        if(clanId==null)clanId=this.nextClanId++;usedOld.add(clanId);
        const cx=members.reduce((s,a)=>s+a.x,0)/members.length,cy=members.reduce((s,a)=>s+a.y,0)/members.length;
        const radius=clamp(Math.max(...members.map(a=>Math.hypot(a.x-cx,(a.y-cy)*.65)))+92,120,420);
        const ranked = members.slice().sort((a,b)=>this.dominanceScore(b)-this.dominanceScore(a) || a.uid-b.uid);
        for(let rank=0;rank<ranked.length;rank++){
          const a=ranked[rank]; a.clanId=clanId; a.territoryId=clanId; a.clanRank=rank+1;
          a.clanRole=rank===0?'leader':rank===1&&ranked.length>=4?'scout':'member';
        }
        next.push({id:clanId,species:members[0].species,members:members.map(a=>a.uid),leaderUid:ranked[0].uid,x:cx,y:cy,radius,cohesion:members.length/(1+Math.max(1,radius)/150),foodPressure:0,formedTick:this.clans.find(c=>c.id===clanId)?.formedTick??this.tick});
      }
      for(const a of living) if(!next.some(c=>c.id===a.clanId)){a.clanId=null;a.territoryId=null;}
      for(const clan of next){let food=0,count=0;for(const p of this.plants)if(Math.hypot(p.x-clan.x,p.y-clan.y)<clan.radius){food+=p.biomass;count++;}clan.foodPressure=count?clamp(1-food/Math.max(1,count*.58),0,1):1;}
      this.clans=next;
      this.territories=next.map(c=>({id:c.id,clanId:c.id,species:c.species,x:c.x,y:c.y,radius:c.radius,foodPressure:c.foodPressure,members:c.members.length}));
      if(!force&&this.tick%180===0) for(const c of next){const prev=this.previousClanByUid.get(c.members[0]);if(!prev){this.territoryEvents++;this.log('clan',`${SPECIES_NAMES[c.species]} group ${c.id} now shares a territory (${c.members.length} members).`,null,c.x,c.y);}}
      this.previousClanByUid=new Map();for(const c of next)for(const uid of c.members)this.previousClanByUid.set(uid,c.id);
    }
    bestLocalPlant(x,y,range=360){let best=null,score=-Infinity;for(const p of this.plants){const d=Math.hypot(p.x-x,(p.y-y)*.8);if(d>range||p.biomass<.08)continue;const v=p.biomass*1.7-d/range;if(v>score){score=v;best=p;}}return best;}
    useEnvironmentTools(a, fly, door, lever, threat = null, weather = this.weather()) {
      const isMoss = a && a.species === 'mossling';
      const inside = isMoss ? this.vaultAt(a.x, a.y) : null;
      // Inside a vault, the relevant door remains available even when the agent is
      // far from the entrance. This is a one-entry chamber, not a key hunt.
      let controlledDoor = inside ? this.doors.find(d => d.vaultId === inside.id) : null;
      if (!controlledDoor) controlledDoor = this.nearestDoor(a, 42);
      const threatDistance = threat ? Math.hypot(threat.x - a.x, (threat.y - a.y) * 0.7) : Infinity;
      const danger = threatDistance < 230;
      const needsShelter = weather.phase === 'warning' || weather.phase === 'rain';
      const distanceToDoor = controlledDoor ? Math.hypot(controlledDoor.x-a.x,(controlledDoor.y-a.y)*0.7) : Infinity;

      // Mosslings alone can operate living vault seals. They seal themselves in
      // when calm and fed, and hunger forces them to reopen the only exit.
      if (isMoss && inside && controlledDoor && a.toolCooldown <= 0) {
        if (a.hunger >= 0.46 || a.energy < 31) {
          if (controlledDoor.locked || !controlledDoor.open) {
            this.setDoorState(controlledDoor, { open: true, locked: false });
            controlledDoor.lastUsed = this.tick; controlledDoor.useCount++; this.gatesUsed++; this.vaultExits++;
            a.toolUses++; a.gatesOpened++; a.memory.vaultId = inside.id; a.toolCooldown = 75;
            this.recordStory(a, 'vault-opened', `hunger drove it to release the seal of ${inside.name} and search for food`);
            this.learn(a, 'Forage', 0.65, 'leaving a vault to find food');
          }
          a.hidden = false; a.hideTicks = 0; a.state = 'leaving vault hungry';
        } else if ((needsShelter || danger || a.energy < 46) && distanceToDoor > 38 && controlledDoor.open && !this.doorOccupied(controlledDoor)) {
          this.setDoorState(controlledDoor, { open: false, locked: true });
          controlledDoor.lastUsed = this.tick; controlledDoor.useCount++; this.gatesUsed++;
          a.toolUses++; a.toolCooldown = 95; a.hidden = true; a.hideTicks = Math.max(a.hideTicks || 0, 50);
          this.recordStory(a, 'vault-sealed', `sealed ${inside.name} from inside to rest and avoid danger`);
          this.learn(a, 'Shelter', 0.45, 'sealing a vault safely');
        }
      } else if (isMoss && controlledDoor && distanceToDoor < 44 && a.toolCooldown <= 0) {
        const v = controlledDoor.vaultId ? this.vaults.find(q => q.id === controlledDoor.vaultId) : null;
        const wantsVault = !!v && (needsShelter || danger || a.hunger < 0.38 || a.energy < 40);
        const wantsRoute = !v && (a.hunger > 0.52 || (a.memory.foodX != null && Math.abs(a.memory.foodX-a.x) > 150));
        if (controlledDoor.locked && (wantsVault || wantsRoute)) {
          this.setDoorState(controlledDoor, { open: true, locked: false });
          controlledDoor.lastUsed = this.tick; controlledDoor.useCount++; this.gatesUsed++; a.toolUses++; a.gatesOpened++; a.toolCooldown = 72;
          this.recordStory(a, 'vault-opened', `released the living seal of ${controlledDoor.name} without a key`);
          this.learn(a, wantsVault ? 'Shelter' : 'Investigate', 0.65, 'operating a living door seal');
        } else if (v && wantsVault && !controlledDoor.open && !controlledDoor.locked) {
          this.setDoorState(controlledDoor, { open: true, locked: false }); controlledDoor.lastUsed = this.tick; controlledDoor.useCount++;
          this.gatesUsed++; a.toolUses++; a.toolCooldown = 64; this.recordStory(a, 'vault-entered', `opened ${v.name} to take cover`); this.vaultEntries++;
        }
      }
      // Non-Mosslings may traverse already-unlocked doors or pull simple levers,
      // but can never change a lock state.
      if (!isMoss && lever && Math.hypot(lever.x-a.x,lever.y-a.y)<22 && a.toolCooldown<=0) {
        const d=this.doors.find(x=>x.id===lever.doorId);
        if(d&&!d.locked){d.open=!d.open;d.lastUsed=this.tick;d.useCount++;a.toolUses++;a.toolCooldown=100;this.gatesUsed++;this.setDoorSolid(d);this.recordStory(a,'used-tool',`${d.open?'opened':'closed'} ${d.name} with ${lever.name}`);this.learn(a,'Investigate',.5,'operating an unlocked gate');}
      }
      if (fly && isMoss && Math.hypot(fly.x-a.x,fly.y-a.y)<26) {
        fly.alive=false;fly.energy=0;a.flyMeals++;this.flyMeals++;a.energy=Math.min(120,a.energy+8.5);a.hunger=Math.max(0,a.hunger-.24);a.state='catching fly';
        this.recordStory(a,'ate-fly','snatched a glowfly from the air');this.learn(a,'Forage',.95,'catching a fly');
      }
    }
    makePolicy(parent, species, secondParent = null) {
      const base = species === 'vineback' ? [0.1, -0.2, -0.3, 0.15, 0.65, 0.1] : species === 'glimmer' ? [0.2, 0.45, 0.2, 0.15, -0.35, 0.5] : [0.15, 0.55, 0.55, 0.3, -0.8, 0.15];
      if (parent && parent.policy) return parent.policy.map((v, i) => {
        const inherited = secondParent?.policy ? (v + secondParent.policy[i]) * 0.5 : v;
        return clamp(inherited + (this.geneticsRng() < 0.045 ? (this.geneticsRng() - 0.5) * 0.22 : 0), -1, 1);
      });
      return base.map(v => clamp(v + (this.rng() - 0.5) * 0.28, -1, 1));
    }
    makeBrain(parent, species, secondParent = null) {
      const n1 = BRAIN_INPUTS * BRAIN_HIDDEN, n2 = BRAIN_HIDDEN, n3 = BRAIN_HIDDEN * BRAIN_OUTPUTS, n4 = BRAIN_OUTPUTS;
      const fresh = () => (this.geneticsRng() + this.geneticsRng() + this.geneticsRng() - 1.5) * 0.9;
      const combine = (key, size, scale = 1) => {
        const out = new Array(size);
        for (let i = 0; i < size; i++) {
          let v = parent?.brain?.[key] ? parent.brain[key][i] : fresh();
          if (secondParent?.brain?.[key]) v = (v + secondParent.brain[key][i]) * .5;
          if (parent && this.geneticsRng() < .035) v += (this.geneticsRng() - .5) * .34;
          out[i] = clamp(v * scale, -2.5, 2.5);
        }
        return out;
      };
      const brain = { w1: combine('w1', n1), b1: combine('b1', n2), w2: combine('w2', n3), b2: combine('b2', n4), lastInputs: Array(BRAIN_INPUTS).fill(0), lastHidden: Array(BRAIN_HIDDEN).fill(0), lastOutputs: Array(BRAIN_OUTPUTS).fill(0) };
      if (!parent) {
        const bias = species === 'vineback' ? [0.08, -0.05, -0.2, -0.15, 0.62, 0.12, 0.15, 0.08] : species === 'glimmer' ? [0.12, 0.42, 0.05, 0.08, -0.3, 0.35, 0.18, 0.08] : [0.18, 0.48, 0.45, 0.12, -0.72, 0.25, 0.18, 0.1];
        for (let i = 0; i < BRAIN_OUTPUTS; i++) brain.b2[i] = clamp(brain.b2[i] + bias[i], -2.5, 2.5);
      }
      return brain;
    }
    inferBrain(a, inputs) {
      const brain = a.brain, hidden = new Array(BRAIN_HIDDEN), outputs = new Array(BRAIN_OUTPUTS);
      for (let h = 0; h < BRAIN_HIDDEN; h++) {
        let s = brain.b1[h]; for (let i = 0; i < BRAIN_INPUTS; i++) s += inputs[i] * brain.w1[h * BRAIN_INPUTS + i];
        hidden[h] = Math.tanh(s);
      }
      for (let o = 0; o < BRAIN_OUTPUTS; o++) {
        let s = brain.b2[o]; for (let h = 0; h < BRAIN_HIDDEN; h++) s += hidden[h] * brain.w2[o * BRAIN_HIDDEN + h];
        outputs[o] = Math.tanh(s);
      }
      brain.lastInputs = inputs.slice(); brain.lastHidden = hidden; brain.lastOutputs = outputs;
      return outputs;
    }
    spawnAgent(species = 'mossling', x = null, parent = null, quiet = false, spawnY = null, secondParent = null) {
      if (!Object.hasOwn(SPECIES, species) || this.agents.filter(a => a.alive).length >= this.options.maxPopulation) return null;
      x = x == null ? 80 + this.playerRng() * (WORLD_W - 160) : clamp(x, 30, WORLD_W - 30);
      let foot = spawnY == null ? this.groundY(x) : clamp(spawnY + 10, TILE, WORLD_H - 8); const uid = this.nextUid++;
      const traitKeys = ['speed','vision','metabolism','jump','size'];
      const traits = Object.fromEntries(traitKeys.map(key => {
        const fresh = key==='speed'?1+(this.geneticsRng()-.5)*.34:key==='vision'?0.9+this.geneticsRng()*.35:key==='metabolism'?0.88+this.geneticsRng()*.24:key==='jump'?0.92+this.geneticsRng()*.25:1+(this.geneticsRng()-.5)*.14;
        const inherited = parent ? parent.traits[key] : fresh;
        const blended = secondParent?.traits ? (inherited + secondParent.traits[key])*.5 : inherited;
        const mutated = parent && this.geneticsRng() < .055 ? blended + (this.geneticsRng()-.5)*(key==='metabolism'?.12:.18) : blended;
        return [key, clamp(mutated, key==='metabolism'?.65:.65, key==='vision'?1.8:1.55)];
      }));
      const baseHitbox = species === 'vineback' ? { w: 28, h: 27 } : species === 'glimmer' ? { w: 23, h: 25 } : { w: 26, h: 26 };
      const hitboxW = baseHitbox.w * traits.size, hitboxH = baseHitbox.h * traits.size;
      const safeSpawn = this.findSafePosition(x, foot, hitboxW, hitboxH);
      if (safeSpawn) { x = safeSpawn.x; foot = safeSpawn.y; }
      const a = {
        uid, name: `${species === 'mossling' ? 'Mossling' : species === 'vineback' ? 'Vineback' : 'Glimmer'}-${String(uid).padStart(3, '0')}`,
        species, alive: true, traits, x, y: foot, vx: 0, vy: 0,
        // w/h describe the visual footprint; hitboxW/hitboxH are collision dimensions.
        w: (species === 'glimmer' ? 34 : 39) * traits.size, h: 30 * traits.size, hitboxW, hitboxH,
        facing: this.rng() < 0.5 ? -1 : 1, grounded: this.hasFloorContact({ x, y: foot, hitboxW, hitboxH }),
        blockedTicks: 0, jumpCooldown: 0, obstacleAvoidTicks: 0, avoidDirection: 1, stuckRecoveries: 0, obstacleAvoidances: 0,
        age: 0, lifespan: 4000 + Math.floor(this.rng() * 3000), energy: 78 + this.rng() * 18, hunger: 0.15 + this.rng() * 0.2,
        state: 'wandering', stateTicks: 0, targetUid: null, lastPreyX: null, lastPreyY: null, lastPreyTick: -9999, preySearchUntil: -1, searchTargetX: null, targetX: x, targetPlant: null, shelteredTicks: 0, shelterRewardedCycle: -1, cooldown: 0, decisionDue: 0, matingCooldown: 0, toolCooldown: 0, hidden: false, hideTicks: 0, coverX: null, coverY: null, clanRank: 1, clanRole: 'solo', vaultId: null,
        navigation: { climbableId: null, climbDirection: 0, climbCommitted: false, lastX: x, lastY: foot, noProgressTicks: 0, patrolX: null, patrolDirection: 1, obstacleJumpCooldown: 0 },
        mossling: species === 'mossling' ? MosslingCharacter.createState(this.geneticsRng, parent?.mossling, secondParent?.mossling, uid) : null,
        vineback: species === 'vineback' ? VinebackCharacter.createState(this.geneticsRng, parent?.vineback, secondParent?.vineback, uid) : null,
        policy: this.makePolicy(parent, species, secondParent), brain: this.makeBrain(parent, species, secondParent), memory: { foodX: null, foodY: null, threatUid: null, threatX: null, threatY: null, safeShelterId: null, vaultId: null, recentFoodTick: -9999, recentThreatTick: -9999 },
        rewardTotal: 0, learningEvents: 0, foodEaten: 0, flyMeals: 0, hunts: 0, offspring: 0, toolUses: 0, gatesOpened: 0, socialActs: 0, bornTick: this.tick,
        clanId: null, territoryId: null, parentUid: parent ? parent.uid : null, siblingGroup: parent ? (parent.siblingGroup ?? parent.uid) : uid,
        trail: [], colorSeed: this.rng(),
      };
      if (a.mossling) MosslingCharacter.initializeRig(a);
      if (a.vineback) VinebackCharacter.initializeRig(a);
      this.agents.push(a);
      this.archive.set(uid, { uid, name: a.name, species, alive: true, x, y: foot, bornTick: this.tick, diedTick: null, policy: a.policy.slice(), mossling: MosslingCharacter.profile(a), vineback: VinebackCharacter.profile(a), summary: { foodEaten: 0, flyMeals: 0, hunts: 0, offspring: 0, rewardTotal: 0, learningEvents: 0, toolUses: 0, gatesOpened: 0, socialActs: 0 }, story: [] });
      this.recordStory(a, 'born', parent ? `was born to ${parent.name}` : 'entered the valley');
      this.births++;
      return a;
    }
    getAgent(uid) {
      const a = this.agents.find(x => x.uid === uid && x.alive);
      if (a) return { ...this.publicAgent(a), alive: true, policy: a.policy.slice(), traits: { ...a.traits } };
      const r = this.archive.get(uid); return r ? { uid: r.uid, name: r.name, species: r.species, alive: false, diedTick: r.diedTick, bornTick: r.bornTick, policy: r.policy.slice(), mossling: r.mossling ? JSON.parse(JSON.stringify(r.mossling)) : null, vineback: r.vineback ? JSON.parse(JSON.stringify(r.vineback)) : null, summary: { ...r.summary } } : null;
    }
    publicAgent(a) { return { uid: a.uid, name: a.name, species: a.species, x: a.x, y: a.y, w: a.w, h: a.h, hitbox: { width: a.hitboxW, height: a.hitboxH }, blockedTicks: a.blockedTicks || 0, stuckRecoveries: a.stuckRecoveries || 0, energy: a.energy, hunger: a.hunger, state: a.state, age: a.age, facing: a.facing, targetUid: a.targetUid, preySearchUntil: a.preySearchUntil, searchTargetX: a.searchTargetX, rewardTotal: a.rewardTotal, learningEvents: a.learningEvents, foodEaten: a.foodEaten, flyMeals: a.flyMeals, hunts: a.hunts, offspring: a.offspring, toolUses: a.toolUses, gatesOpened: a.gatesOpened, hidden: !!a.hidden, clanRank: a.clanRank || 1, clanRole: a.clanRole || 'solo', vaultId: a.vaultId || null, clanId: a.clanId, territoryId: a.territoryId, traits: { ...a.traits }, mossling: MosslingCharacter.profile(a), vineback: VinebackCharacter.profile(a) }; }
    getStory(uid) { const r = this.archive.get(uid); return r ? r.story.slice() : []; }
    learn(a, key, reward, reason) {
      const i = POLICY_NAMES.indexOf(key); if (i < 0) return;
      const change = clamp(reward * 0.025, -0.035, 0.035);
      a.policy[i] = clamp(a.policy[i] + change, -1, 1); a.rewardTotal += reward; a.learningEvents++; this.learningTotal++;
      const rec = this.archive.get(a.uid); if (rec) { rec.policy = a.policy.slice(); rec.summary = { foodEaten: a.foodEaten, hunts: a.hunts, offspring: a.offspring, rewardTotal: a.rewardTotal, learningEvents: a.learningEvents }; }
      if (a.learningEvents === 1 || a.learningEvents % 4 === 0) this.recordStory(a, 'learn', `adapted its ${key.toLowerCase()} tendency after ${reason} (reward ${reward > 0 ? '+' : ''}${reward.toFixed(1)})`);
    }
    kill(a, reason = 'died') {
      if (!a || !a.alive) return;
      a.alive = false; this.deaths++; this.carcasses.push({ x: a.x, y: a.y, biomass: 1, age: 0, species: a.species });
      const rec = this.archive.get(a.uid); if (rec) { rec.alive = false; rec.diedTick = this.tick; rec.x = a.x; rec.y = a.y; rec.policy = a.policy.slice(); rec.vineback = VinebackCharacter.profile(a); rec.mossling = MosslingCharacter.profile(a); rec.summary = { foodEaten: a.foodEaten, hunts: a.hunts, offspring: a.offspring, rewardTotal: a.rewardTotal, learningEvents: a.learningEvents }; }
      this.recordStory(a, 'died', reason);
      if (this.selectedUid === a.uid) this.followUid = null;
    }
    routeWaypoint(a, targetX, targetY) {
      const dy = targetY - a.y;
      const nav = a.navigation || (a.navigation = { climbableId:null, climbDirection:0, climbCommitted:false, lastX:a.x, lastY:a.y, noProgressTicks:0, patrolX:null });
      const currentRoom = this.caverns.find(r => a.x >= r.col*TILE && a.x <= (r.col+r.width)*TILE && a.y >= r.top*TILE-10 && a.y <= r.floorY+TILE);
      const targetRoom = this.caverns.find(r => targetX >= r.col*TILE && targetX <= (r.col+r.width)*TILE && targetY >= r.top*TILE-8);
      const targetIsCurrentRoom = !!(currentRoom && targetRoom && currentRoom.id === targetRoom.id);
      // Once a creature commits to a climb, keep that route stage latched until it
      // reaches the top. Moving prey and changing local goals must not flip it
      // between neighbouring vines every few ticks.
      const latched = nav.climbableId == null ? null : this.climbables.find(c => c.id === nav.climbableId);
      if (latched) {
        const top = Math.min(latched.y1, latched.y2), bottom = Math.max(latched.y1, latched.y2);
        const stillInReach = a.y >= top - 20 && a.y <= bottom + a.hitboxH + 28;
        const shouldContinue = nav.climbCommitted ? a.y > top + 2 : (dy < -42 || (currentRoom && !targetIsCurrentRoom));
        if (stillInReach && shouldContinue && a.y > top + 2) {
          const near = Math.abs(latched.x-a.x) <= 3;
          const mode = near ? (latched.type==='ladder'?'climbing cave exit':'climbing route') : (latched.type==='ladder'?'route to cave exit':'route to climb');
          return {x:latched.x,y:top,mode,climbX:latched.x,climbableId:latched.id};
        }
        if (a.y <= top + 2 || !stillInReach || !shouldContinue) { nav.climbableId=null; nav.climbDirection=0; nav.climbCommitted=false; }
      }
      // If the agent is already in a ladder shaft and is traveling to the surface
      // or a different cavern, keep the exit climb as a latched route stage. Without
      // this check, a deeper destination can override upward motion half way up.
      const activeLadder = this.climbables.find(c => c.type === 'ladder' && a.y >= Math.min(c.y1,c.y2)-14 && a.y <= Math.max(c.y1,c.y2)+a.hitboxH+16 && Math.abs(c.x-a.x) <= 30);
      const targetMatchesLadder = !!(activeLadder && targetRoom && targetRoom.id === activeLadder.roomId);
      if (activeLadder && !targetIsCurrentRoom && !targetMatchesLadder && a.y > Math.min(activeLadder.y1,activeLadder.y2)+2) {
        nav.climbableId=activeLadder.id; nav.climbDirection=1; nav.climbCommitted=true;
        return {x:activeLadder.x,y:Math.min(activeLadder.y1,activeLadder.y2),mode:Math.abs(activeLadder.x-a.x)>3?'route to cave exit':'climbing cave exit',climbX:activeLadder.x,climbableId:activeLadder.id};
      }
      // Inter-cave routes deliberately return to the surface before crossing to a
      // different chamber. The ladder is an explicit navigation action, even when
      // the final destination is lower than the creature's current position.
      if (currentRoom && !targetIsCurrentRoom) {
        const ladder = this.climbables.find(c => c.type === 'ladder' && c.roomId === currentRoom.id);
        if (ladder && a.y > this.groundY(a.x)+20) {
          nav.climbableId=ladder.id; nav.climbDirection=1;
          if (Math.abs(ladder.x-a.x)>3) return {x:ladder.x,y:a.y,mode:'route to cave exit',climbX:ladder.x,climbableId:ladder.id};
          return {x:ladder.x,y:Math.min(ladder.y1,ladder.y2),mode:'climbing cave exit',climbX:ladder.x,climbableId:ladder.id};
        }
      }
      // For targets at a higher elevation, use a full-height ladder to surface first
      // when the creature is deep in a chamber, then select a ledge vine/pipe.
      if (dy < -42) {
        const candidates = this.climbables.filter(c => {
          const top = Math.min(c.y1, c.y2), bottom = Math.max(c.y1, c.y2);
          const bodyWithin = a.y >= top - 18 && a.y <= bottom + a.hitboxH + 14;
          const targetCanReach = targetY >= top - TILE * 1.5 && targetY <= bottom + TILE;
          const ladderNeededForCaveExit = c.type === 'ladder' && currentRoom && !targetIsCurrentRoom;
          return bodyWithin && (targetCanReach || ladderNeededForCaveExit);
        }).map(c => ({ c, top: Math.min(c.y1,c.y2), bottom: Math.max(c.y1,c.y2), cost: Math.abs(c.x-a.x) + Math.abs(c.x-targetX)*0.16 }))
          .sort((p,q)=>p.cost-q.cost);
        if (candidates.length) {
          const chosen=candidates[0].c; nav.climbableId=chosen.id; nav.climbDirection=1;
          const far=Math.abs(chosen.x-a.x)>30;
          return { x: chosen.x, y: candidates[0].top, mode: far ? (chosen.type==='ladder'?'route to cave exit':'route to climb') : (chosen.type==='ladder'?'climbing cave exit':'climbing route'), climbX: chosen.x, climbableId:chosen.id };
        }
      }
      // Targets inside a chamber need an intentional drop into its widened shaft.
      // The shaft itself is open and wide enough for every physical collider.
      if (dy > 70 && a.y <= this.groundY(a.x) + 18) {
        const room = this.caverns.find(r => targetX >= r.col*TILE && targetX <= (r.col+r.width)*TILE && targetY >= r.top*TILE - 8);
        if (room) {
          const shaftX = (room.col + 3) * TILE + TILE / 2;
          if (Math.abs(shaftX-a.x) > 24) return { x: shaftX, y: targetY, mode: 'route to descent' };
          if (a.y <= this.groundY(a.x) + 30) return { x: a.x, y: targetY, mode: 'descending into cavern' };
        }
      }
      return null;
    }
    moveTowards(a, dx, jump = false) {
      // Each species has its own locomotion character; the fallback uses damped
      // velocity steering so small target changes don't create abrupt direction snaps.
      if (a.species === 'mossling' && a.mossling) { MosslingCharacter.moveTowards(a, dx, jump); return; }
      if (a.species === 'vineback' && a.vineback) { VinebackCharacter.moveTowards(a, dx, jump); return; }
      const dir = Math.abs(dx) < 7 ? 0 : Math.sign(dx);
      const topSpeed = (a.species === 'glimmer' ? 1.78 : 2.05) * a.traits.speed;
      const desired = dir * topSpeed * clamp(Math.abs(dx) / 54, 0.16, 1);
      const accel = dir ? 0.17 * a.traits.speed : 0.26;
      if (dir && a.vx * dir < -0.18) a.vx = a.vx < 0 ? Math.min(0, a.vx + accel * 1.6) : Math.max(0, a.vx - accel * 1.6);
      else a.vx += clamp(desired - a.vx, -accel, accel);
      if (!dir && Math.abs(a.vx) < 0.035) a.vx = 0;
      if (dir) a.facing = dir;
      if (jump && a.grounded) { a.vy = -4.75 * a.traits.jump; a.grounded = false; }
    }
    updateAgent(a, weather) {
      a.age++; a.stateTicks++; a.cooldown = Math.max(0, a.cooldown - 1); a.toolCooldown = Math.max(0, (a.toolCooldown || 0) - 1); a.jumpCooldown = Math.max(0, (a.jumpCooldown || 0) - 1); a.obstacleAvoidTicks = Math.max(0, (a.obstacleAvoidTicks || 0) - 1); if (a.navigation) a.navigation.obstacleJumpCooldown = Math.max(0, (a.navigation.obstacleJumpCooldown || 0) - 1);
      a.hunger = clamp(a.hunger + 0.00012 * a.traits.metabolism, 0, 1.4);
      a.energy -= 0.008 * a.traits.metabolism + Math.abs(a.vx) * 0.0007;
      if (a.age > a.lifespan) { this.kill(a, 'old age'); return; }
      if (a.energy <= 0) { this.kill(a, 'exhaustion'); return; }
      const isMoss = a.species === 'mossling', isPred = a.species === 'vineback', isScav = a.species === 'glimmer' && this.scavengersEnabled;
      let threat = isPred ? null : this.nearestAgent(a, b => b.species === 'vineback' && b.alive && this.canSeeAgent(b, a), 300 * a.traits.vision);
      if (threat) { a.memory.threatUid = threat.uid; a.memory.threatX = threat.x; a.memory.threatY = threat.y; a.memory.recentThreatTick = this.tick; }
      if (!isPred && !threat && a.clanId) {
        const alarm = this.nearestAgent(a, b => b.species === a.species && b.clanId === a.clanId && b.memory.recentThreatTick >= this.tick - 110, 300);
        if (alarm && alarm.memory.threatX != null) threat = { uid: alarm.memory.threatUid, x: alarm.memory.threatX, y: alarm.memory.threatY, alive: true, inferred: true };
      }
      const prey = isPred ? this.nearestAgent(a, b => b.species === 'mossling' && b.alive && this.canSeeAgent(a, b), 1050 * a.traits.vision) : null;
      // If a tracked Mossling seals into a vault or becomes fully concealed, drop
      // that target rather than camping at its entrance. Search a new sector instead.
      if (isPred) {
        const tracked = a.targetUid == null ? null : this.agents.find(b => b.uid === a.targetUid && b.alive && b.species === 'mossling');
        if (prey) {
          a.targetUid = prey.uid; a.lastPreyX = prey.x; a.lastPreyY = prey.y; a.lastPreyTick = this.tick; a.preySearchUntil = -1; a.searchTargetX = null;
        } else if (tracked) {
          const trackedVault = this.vaultAt(tracked.x, tracked.y);
          const trackedDoor = trackedVault && this.doors.find(d => d.vaultId === trackedVault.id);
          const sealedAway = !!(trackedVault && trackedDoor && trackedDoor.locked) || (tracked.hidden && Math.hypot(tracked.x-a.x, tracked.y-a.y) > 48);
          const staleTrack = this.tick - (a.lastPreyTick ?? -9999) > 96;
          if (sealedAway || staleTrack) {
            const oldTarget = a.targetUid;
            a.targetUid = null; a.preySearchUntil = this.tick + 360;
            const away = a.x < tracked.x ? -1 : 1;
            let candidate = a.x + away * (520 + this.rng() * 520);
            if (Math.abs(candidate - tracked.x) < 420) candidate = tracked.x + away * (640 + this.rng() * 320);
            a.searchTargetX = clamp(candidate, 45, WORLD_W - 45); a.stateTicks = 0;
            this.lostPreyEvents = (this.lostPreyEvents || 0) + 1;
            this.recordStory(a, 'lost-prey', `lost track of Mossling ${oldTarget} behind cover or a sealed vault and moved on to search for new prey`);
            this.learn(a, 'Hunt', 0.25, 'switching from a lost trail to a new search area');
          }
        } else if (a.targetUid != null) {
          // A target removed from the world (death/despawn) is no longer valid.
          a.targetUid = null; a.preySearchUntil = this.tick + 240; a.searchTargetX = clamp(a.x + (this.rng()<.5?-1:1)*(420+this.rng()*430),45,WORLD_W-45);
        }
      }
      const plant = this.nearestPlant(a, true);
      const localPlant = this.bestLocalPlant(a.x,a.y,420);
      const fly = isMoss ? this.nearestFly(a, 580*a.traits.vision) : null;
      const currentVault = isMoss ? this.vaultAt(a.x, a.y) : null;
      a.vaultId = currentVault ? currentVault.id : null;
      const vaultTarget = isMoss && !currentVault ? this.nearestVault(a, 1200) : null;
      const cover = isMoss ? this.nearestCover(a, 260) : null;
      const threatDistance = threat ? Math.hypot(threat.x-a.x,(threat.y-a.y)*.7) : Infinity;
      if (isMoss && !currentVault && a.hidden && (a.hunger >= 0.75 || threatDistance < 64)) { a.hidden = false; a.hideTicks = 0; }
      const door = currentVault ? this.doors.find(d=>d.vaultId===currentVault.id) : this.nearestDoor(a, 170), lever = this.levers.reduce((best,l)=>{const d=Math.hypot(l.x-a.x,(l.y-a.y)*.7);return d<110&&(best==null||d<best.d)?{...l,d,ref:l}:best;},null)?.ref || null;
      const social = this.nearbyAgents(a,b=>b.species===a.species,340);
      const hostileTerritory = this.territories.some(t=>t.species!==SPECIES[a.species]&&Math.hypot(t.x-a.x,(t.y-a.y)*.6)<t.radius);
      const den = this.predatorDens.reduce((best,d)=>{const dist=Math.hypot(d.x-a.x,(d.y-a.y)*.7);return dist<(best?.dist??Infinity)?{...d,dist,ref:d}:best;},null);
      // Vinebacks use a short-lived scent/roar memory to share last-known prey
      // locations with compatible clanmates. This is not omniscient tracking:
      // allies receive a noisy last-seen position and still need to search.
      if (isPred && prey && a.clanId && a.vineback?.traits.packAffinity > .34 && this.tick % 12 === a.uid % 12) {
        for (const q of social) if (q.agent.alive && q.agent.species === 'vineback' && q.agent.clanId === a.clanId && q.agent.uid !== a.uid && (q.agent.vineback?.traits.packAffinity || 0) > .3) {
          q.agent.memory.packPreyUid = prey.uid; q.agent.memory.packPreyX = prey.x + (this.rng() - .5) * 28; q.agent.memory.packPreyY = prey.y; q.agent.memory.packPreyUntil = this.tick + 88;
        }
        a.vineback.packCalls++;
        if (this.tick % 60 === a.uid % 60) this.recordStory(a, 'pack-call', 'sent a low hunting call to its clan');
      }
      // Two rival clan leaders can settle a den approach with a display rather
      // than overlapping indefinitely. Dominance depends on condition, hunts,
      // learned outcomes and evolved temperament; the loser gives the approach up.
      const rival = isPred ? social.filter(q => {
        const b=q.agent, sameClan=a.clanId!=null&&b.clanId===a.clanId;
        const challengesAlpha=sameClan&&a.clanRole!=='leader'&&a.clanRank<=3&&(a.vineback?.traits.territoriality||0)>.62&&this.dominanceScore(a)>this.dominanceScore(b)*.8;
        const rivalClan=a.clanId!==b.clanId&&a.clanRole==='leader';
        return b.alive&&b.species==='vineback'&&b.clanRole==='leader'&&b.uid!==a.uid&&q.d<72&&(challengesAlpha||rivalClan);
      }).sort((x,y)=>x.d-y.d)[0] : null;
      const sameClanRival=!!(rival&&a.clanId!=null&&rival.agent.clanId===a.clanId);
      if (rival && den && den.dist < 128 && !prey && (sameClanRival || a.uid < rival.agent.uid) && (a.memory.challengeUntil || 0) <= this.tick && (rival.agent.memory.challengeUntil || 0) <= this.tick && a.vineback.traits.territoriality > .52 && rival.agent.vineback?.traits.territoriality > .42) {
        const other = rival.agent, scoreA = this.dominanceScore(a), scoreB = this.dominanceScore(other);
        const winner = scoreA === scoreB ? (a.uid < other.uid ? a : other) : scoreA > scoreB ? a : other;
        const loser = winner === a ? other : a; a.memory.challengeUntil=this.tick+190;other.memory.challengeUntil=this.tick+190;
        winner.memory.displayUntil = this.tick + 54; loser.memory.yieldUntil = this.tick + 138; loser.memory.yieldFromUid = winner.uid;
        winner.vineback.displayWins++; winner.vineback.displays++;
        this.recordStory(winner, 'dominance-display', `held the den approach after a size-up against ${loser.name}`);
        this.recordStory(loser, 'yielded-territory', `yielded the den approach to ${winner.name}`);
      }
      const carcass = isScav ? this.carcasses.reduce((best, c) => { const d = Math.hypot(c.x - a.x, c.y - a.y); return c.biomass > 0.08 && d < (best?.d ?? Infinity) ? { ...c, d, ref: c } : best; }, null) : null;
      const shelter = this.nearestShelter(a), inShelter = this.inShelter(a);
      const needsShelter = weather.phase === 'warning' || weather.phase === 'rain';
      const inputs = [a.hunger/1.4,a.energy/120,localPlant?1-Math.min(1,Math.hypot(localPlant.x-a.x,(localPlant.y-a.y)*.8)/420):0,threat?1-Math.min(1,Math.hypot(threat.x-a.x,(threat.y-a.y)*.7)/(260*a.traits.vision)):0,prey?1-Math.min(1,Math.hypot(prey.x-a.x,(prey.y-a.y)*.7)/(1050*a.traits.vision)):0,needsShelter?1:0,1-Math.min(1,Math.abs(shelter.x-a.x)/900),clamp(social.length/5,0,1),a.parentUid?1:0,fly?1-Math.min(1,Math.hypot(fly.x-a.x,fly.y-a.y)/(580*a.traits.vision)):0,door&&!door.open?1:0,door&&door.locked?1:0,den&&den.dist<den.radius?1:0,hostileTerritory?1:0,this.daylight(),1];
      const neural=this.inferBrain(a,inputs);
      // Neural outputs bias interpretable utilities; they never override survival constraints.
      const mossPersonality = isMoss && a.mossling ? a.mossling.personality : null;
      const shelterDrive = (a.policy[3] + 1) / 2 + neural[3]*.12 + (mossPersonality ? mossPersonality.caution * .14 : 0);
      const forageDrive = a.hunger + a.policy[1] * 0.4 + neural[1]*.14 + (mossPersonality ? mossPersonality.curiosity * .16 : 0);
      const fleeDrive = a.policy[2] + neural[2]*.16 + (mossPersonality ? mossPersonality.caution * .20 - mossPersonality.playfulness * .08 : 0);
      const huntDrive = a.hunger + clamp((85 - a.energy) / 85, 0, 1) * 0.45 + a.policy[4] * 0.22 + neural[4]*.12;
      let dx = 0, jump = false, state = 'wandering', targetX = a.x, targetY = a.y;
      if (isMoss && currentVault && a.hunger >= 0.46) {
        const vaultDoor = this.doors.find(d => d.vaultId === currentVault.id);
        targetX = vaultDoor ? vaultDoor.x - TILE * 1.2 : currentVault.exitX; targetY = a.y; dx = targetX - a.x; state = 'leaving vault hungry'; a.hidden = false; a.hideTicks = 0;
      } else if (isMoss && currentVault && a.hunger < 0.46 && (needsShelter || threatDistance < 230 || a.energy < 46)) {
        dx = 0; state = 'hiding in vault'; a.hidden = true; a.hideTicks = Math.max(a.hideTicks || 0, 40); targetX = a.x; targetY = a.y;
      } else if (isMoss && !currentVault && vaultTarget && (needsShelter || threatDistance < 145) && vaultTarget.dist < 760 && Math.abs(vaultTarget.door.x - a.x) < Math.abs(shelter.x - a.x) + 140) {
        targetX = vaultTarget.door.x + 28; targetY = vaultTarget.door.y + TILE * 2; dx = targetX - a.x; state = needsShelter ? 'seeking vault' : 'seeking refuge'; a.hidden = false; a.hideTicks = 0; jump = a.grounded && Math.abs(targetY-a.y)>34;
      } else if (isMoss && threat && threatDistance < 240 && threatDistance > 42 && cover && cover.dist < 160 && a.hunger < 0.82) {
        targetX = cover.x; targetY = cover.y; dx = targetX - a.x; a.coverX = cover.x; a.coverY = cover.y;
        if (cover.dist < 28 && Math.abs(cover.y-a.y)<38) { dx = 0; state = 'hiding'; a.hidden = true; a.hideTicks = Math.max(a.hideTicks || 0, 72); }
        else { state = 'seeking cover'; a.hidden = false; a.hideTicks = 0; jump = a.grounded && Math.abs(cover.y-a.y)>34; }
      } else if (isMoss && a.hidden && (a.hideTicks || 0) > 0 && a.hunger < 0.75 && threatDistance > 95) {
        a.hideTicks--; if (a.hideTicks > 0) { dx = 0; state = 'hiding'; targetX = a.x; targetY = a.y; } else { a.hidden = false; state = 'wandering'; }
      } else if (needsShelter && !inShelter && (weather.phase === 'rain' || shelterDrive > 0.24)) {
        targetX = shelter.x; targetY = this.groundY(shelter.x); dx = targetX - a.x; state = weather.phase === 'rain' ? 'sheltering' : 'seeking shelter';
        if (Math.abs(dx) > 35) jump = a.grounded && this.solidAt(a.x + Math.sign(dx) * 24, a.y - a.h + 8);
      } else if (threat && !isPred && (fleeDrive > -0.6 || Math.hypot(threat.x-a.x, threat.y-a.y) < 82)) {
        dx = a.x - threat.x; state = 'fleeing'; jump = a.grounded && (Math.abs(threat.y - a.y) > 18 || Math.abs(dx) < 95);
      } else if (isPred && prey && (huntDrive > 0.46 || Math.hypot(prey.x-a.x,prey.y-a.y) < 28 && huntDrive > 0.34)) {
        dx = prey.x - a.x; targetY = prey.y; state = Math.abs(dx) < 28 && Math.abs(prey.y - a.y) < 34 ? 'hunting' : 'stalking';
        jump = a.grounded && (Math.abs(prey.y - a.y) > 32 || Math.abs(dx) < 80);
        a.targetUid = prey.uid;
      } else if (isPred && !prey && (a.memory.yieldUntil || 0) > this.tick) {
        const alpha = this.agents.find(b => b.alive && b.uid === a.memory.yieldFromUid);
        const away = alpha ? Math.sign(a.x - alpha.x || (a.uid % 2 ? 1 : -1)) : (a.uid % 2 ? 1 : -1);
        targetX = clamp(a.x + away * 210, 40, WORLD_W - 40); targetY = this.groundY(targetX); dx = targetX-a.x; state = 'yielding den'; jump = a.grounded && this.solidAt(a.x + Math.sign(dx)*22, a.y-a.h+8);
      } else if (isPred && !prey && (a.memory.displayUntil || 0) > this.tick) {
        targetX = a.x; targetY = a.y; dx = 0; jump = false; state = 'displaying dominance';
      } else if (isPred && !prey && a.vineback && (a.memory.packPreyUntil || 0) > this.tick && a.vineback.traits.packAffinity > .32) {
        targetX = clamp(a.memory.packPreyX ?? a.x, 40, WORLD_W-40); targetY = a.memory.packPreyY ?? this.groundY(targetX); dx = targetX-a.x; state = 'following pack signal'; jump = a.grounded && Math.abs(targetY-a.y)>35;
        if (Math.hypot(targetX-a.x,(targetY-a.y)*.7)<46) a.memory.packPreyUntil = 0;
      } else if (isPred && !prey && a.preySearchUntil > this.tick) {
        if (a.searchTargetX == null || Math.abs(a.searchTargetX - a.x) < 80) {
          const direction = a.x < WORLD_W * 0.5 ? 1 : -1;
          let candidate = a.x + direction * (460 + this.rng() * 620);
          if (Math.abs(candidate - (a.lastPreyX ?? a.x)) < 420) candidate += direction * 480;
          a.searchTargetX = clamp(candidate,45,WORLD_W-45);
        }
        targetX = a.searchTargetX; targetY = this.groundY(targetX); dx = targetX-a.x;
        state = 'searching for new prey'; jump = a.grounded && (this.solidAt(a.x+Math.sign(dx)*22,a.y-a.h+8) || Math.abs(targetY-a.y)>42);
        if (this.tick % 65 === a.uid % 65) this.recordStory(a,'searching','moved through a new hunting ground after losing the trail');
      } else if (isScav && carcass) {
        dx = carcass.x - a.x; targetY = carcass.y; state = Math.abs(dx) < 25 ? 'feeding' : 'scavenging'; targetX = carcass.x; jump = a.grounded && Math.abs(carcass.y - a.y) > 32;
      } else if (isMoss && fly && (forageDrive > .22 || neural[1]>.15)) {
        targetX=fly.x;targetY=fly.y;dx=targetX-a.x;state=Math.hypot(dx,fly.y-a.y)<32?'stalking flies':'hunting flies';jump=a.grounded&&fly.y<a.y-34&&Math.abs(dx)<100;
      } else if ((isMoss || isScav) && (localPlant || plant) && (forageDrive > 0.32 || (isScav && a.policy[5] > 0.3) || neural[1] > .08)) {
        const foodTarget=localPlant||plant;targetX = foodTarget.x; targetY = foodTarget.y; dx = targetX - a.x; state = a.hunger > 0.68 ? 'hungry' : 'foraging'; jump = a.grounded && Math.abs(foodTarget.y - a.y) > 34 && Math.abs(dx) < 100; a.targetPlant = foodTarget.id;a.memory.foodX=foodTarget.x;a.memory.foodY=foodTarget.y;a.memory.recentFoodTick=this.tick;
      } else if (isPred && den && den.dist > 90 && a.energy<76 && neural[3]>.02) {
        targetX=den.x;targetY=den.y;dx=targetX-a.x;state='returning to den';jump=a.grounded&&Math.abs(targetY-a.y)>32;
      } else if (isPred && a.vineback && a.clanRole === 'leader' && den && a.hunger < .78 && a.energy > 58) {
        const nav=a.navigation||(a.navigation={climbableId:null,climbDirection:0,climbCommitted:false,lastX:a.x,lastY:a.y,noProgressTicks:0,patrolX:null,patrolDirection:1,obstacleJumpCooldown:0});
        if (nav.patrolX == null || Math.abs(nav.patrolX-a.x)<42) { nav.patrolDirection = nav.patrolX == null ? (a.uid%2?1:-1) : -nav.patrolDirection; nav.patrolX = clamp(den.x + nav.patrolDirection * (105 + (a.uid%5)*17), 40, WORLD_W-40); }
        targetX=nav.patrolX;targetY=den.y;dx=targetX-a.x;state='patrolling territory';jump=a.grounded&&Math.abs(targetY-a.y)>42; a.vineback.patrolTicks++;
      } else if (isPred && a.vineback && a.clanRole !== 'leader' && a.clanId && a.vineback.traits.packAffinity > .43 && a.hunger < .9) {
        const alpha=this.nearestAgent(a,b=>b.species==='vineback'&&b.clanId===a.clanId&&b.clanRole==='leader',660);
        if (alpha && Math.hypot(alpha.x-a.x,(alpha.y-a.y)*.7)>105) {
          const advance = a.clanRole==='scout' ? 55 : -58;
          targetX=clamp(alpha.x+(alpha.facing||1)*advance,40,WORLD_W-40);targetY=alpha.y;dx=targetX-a.x;state=a.clanRole==='scout'?'scouting ahead':'shadowing alpha';jump=a.grounded&&Math.abs(targetY-a.y)>38;
        } else {
          if (a.stateTicks > 90 || Math.abs(a.targetX - a.x) < 20) { a.targetX = clamp(a.x + (this.rng() - 0.5) * (260 + (a.policy[0] + 1) * 110 + a.policy[5] * 80), 35, WORLD_W - 35); a.stateTicks = 0; }
          dx=a.targetX-a.x;jump=a.grounded&&this.solidAt(a.x+Math.sign(dx)*20,a.y-a.h+8)&&(a.navigation.obstacleJumpCooldown||0)<=0;if(jump)a.navigation.obstacleJumpCooldown=32;
        }
      } else {
        if (a.stateTicks > 90 || Math.abs(a.targetX - a.x) < 20) { a.targetX = clamp(a.x + (this.rng() - 0.5) * (260 + (a.policy[0] + 1) * 110 + a.policy[5] * 80) * (isMoss && a.mossling ? 0.72 + a.mossling.personality.restlessness * 0.8 : 1), 35, WORLD_W - 35); a.stateTicks = 0; }
        dx = a.targetX - a.x; jump = a.grounded && this.solidAt(a.x + Math.sign(dx) * 20, a.y - a.h + 8) && (a.navigation?.obstacleJumpCooldown || 0) <= 0; if (jump) a.navigation.obstacleJumpCooldown=32;
      }
      // If an elevated food source or target is nearby, climb an attached root-vine/pipe.
      // Short reverse step when a target is unreachable through a wall/gate. This
      // gives agents room to turn, jump, or choose another target rather than pushing forever.
      if (isPred && a.clanRole !== 'leader' && den && den.dist < 100 && !prey && a.state !== 'following pack signal' && a.state !== 'shadowing alpha' && a.state !== 'scouting ahead') {
        const alpha = this.nearestAgent(a, b => b.species === 'vineback' && b.clanId === a.clanId && b.clanRole === 'leader', 150);
        if (alpha) { dx = a.x < alpha.x ? -95 : 95; state = 'yielding den'; a.hidden = false; }
      }
      if ((a.obstacleAvoidTicks || 0) > 0) {
        dx = (a.avoidDirection || -a.facing || 1) * 145; targetY = a.y; jump = false; state = 'avoiding obstacle';
      }
      const waypoint = this.routeWaypoint(a, targetX, targetY);
      if (waypoint) { dx = waypoint.x - a.x; jump = false; state = waypoint.mode; }
      if (isMoss && a.mossling) {
        const motor = MosslingCharacter.prepareMovement(a, this, state, dx, jump, threatDistance);
        dx = motor.dx; jump = motor.jump;
      } else if (isPred && a.vineback) {
        const motor = VinebackCharacter.prepareMovement(a, state, dx, jump, this, prey);
        dx = motor.dx; jump = motor.jump;
      }
      const climbRoute = waypoint && waypoint.climbX != null ? this.climbables.find(c => (waypoint.climbableId != null && c.id===waypoint.climbableId) || (waypoint.climbableId == null && Math.abs(c.x-waypoint.climbX)<1)) : null;
      // The climb route is approached horizontally first. Do not snap an entire
      // hitbox sideways onto a vine: align over several collision-checked steps.
      const heuristicClimb = targetY < a.y - 38 && Math.abs(dx) < 230
        ? this.climbables.find(c => Math.abs(c.x-a.x)<27 && a.y>=Math.min(c.y1,c.y2)-12 && a.y<=Math.max(c.y1,c.y2)+36 && targetY>=Math.min(c.y1,c.y2)-10 && targetY<=Math.max(c.y1,c.y2)+TILE)
        : null;
      const climbCandidate = (climbRoute && Math.abs(climbRoute.x-a.x)<34 && a.y>=Math.min(climbRoute.y1,climbRoute.y2)-14 && a.y<=Math.max(climbRoute.y1,climbRoute.y2)+a.hitboxH+18) ? climbRoute : heuristicClimb;
      const climb = climbCandidate && a.y > Math.min(climbCandidate.y1,climbCandidate.y2)+2 ? climbCandidate : null;
      if (climb) {
        const nav=a.navigation||(a.navigation={climbableId:null,climbDirection:0,climbCommitted:false,lastX:a.x,lastY:a.y,noProgressTicks:0,patrolX:null});
        const top=Math.min(climb.y1,climb.y2), align=climb.x-a.x;
        nav.climbableId=climb.id; nav.climbDirection=1;
        if (Math.abs(align)>2.4) {
          const shift=clamp(align,-1.45,1.45),nextX=a.x+shift;
          if (!this.collides(nextX,a.y,a.hitboxW,a.hitboxH)) { a.x=nextX; a.vx=approachVineback(a.vx,shift,.22); nav.noProgressTicks=0; }
          else { nav.noProgressTicks=(nav.noProgressTicks||0)+1; a.vx=0; }
          a.vy=0; a.grounded=this.hasFloorContact(a); state='aligning to climb'; a.state=state;
          if(nav.noProgressTicks>24){nav.climbableId=null;nav.climbDirection=0;nav.climbCommitted=false;nav.noProgressTicks=0;a.obstacleAvoidTicks=20;a.avoidDirection=-(a.facing||1);this.collisionStats.obstacleAvoidances++;}
        } else {
          nav.climbCommitted=true; nav.noProgressTicks=0;
          a.x += align*.42; a.vx=approachVineback(a.vx,0,.48);
          const climbRate=(climb.type==='ladder'?1.55:1.12)*a.traits.speed*(isPred?1.0:1.0);
          a.y=Math.max(top,a.y-climbRate);a.vy=0;a.grounded=false;state='climbing';a.state=state;
          if(a.y<=top+0.05){a.y=top;nav.climbableId=null;nav.climbDirection=0;nav.climbCommitted=false;a.vx=0;a.grounded=this.hasFloorContact(a);}
        }
      } else {
        if (Math.abs(dx) > 7 || jump) this.moveTowards(a, dx, jump); else this.moveTowards(a, 0, false);
        a.state = state;
        this.advanceAgentPhysics(a);
      }
      if (Math.abs(a.vx) > 0.2 && this.tick % 3 === a.uid % 3) { a.trail.push({ x: a.x, y: a.y, life: 1 }); if (a.trail.length > 9) a.trail.shift(); }
      for (const t of a.trail) t.life -= 0.075; a.trail = a.trail.filter(t => t.life > 0);
      // Feeding and reward-based adaptation.
      if ((isMoss || isScav) && plant && Math.hypot(plant.x - a.x, plant.y - a.y) < 26 && Math.abs(plant.y - a.y) < 38 && plant.biomass > 0.06) {
        const bite = Math.min(0.12, plant.biomass); plant.biomass -= bite; a.energy = Math.min(115, a.energy + bite * 120); a.hunger = Math.max(0, a.hunger - bite * 2.7);
        if (bite > 0.055 && this.tick % 11 === a.uid % 11) { a.foodEaten++; this.meals++; this.recordStory(a, 'ate', `ate from a ${plant.type} patch`); this.learn(a, 'Forage', 0.8, 'finding food'); }
        a.state = 'eating';
      }
      if (isScav && carcass && carcass.ref && Math.hypot(carcass.x - a.x, carcass.y - a.y) < 28 && carcass.ref.biomass > 0.03) {
        const bite = Math.min(0.045, carcass.ref.biomass); carcass.ref.biomass -= bite; a.energy = Math.min(115, a.energy + bite * 95); a.hunger = Math.max(0, a.hunger - bite * 2.0);
        if (bite > 0.02 && this.tick % 13 === a.uid % 13) this.recordStory(a, 'scavenged', 'fed on remains left in the valley');
      }
      if (threat && a.state === 'fleeing' && Math.hypot(threat.x - a.x, threat.y - a.y) > 180 && this.tick % 18 === a.uid % 18) this.learn(a, 'Flee', 0.45, 'escaping danger');
      if (needsShelter && inShelter) { a.shelteredTicks++; const stormCycle = Math.floor(this.tick / 1800); if (weather.phase === 'rain' && a.shelterRewardedCycle !== stormCycle) { a.shelterRewardedCycle = stormCycle; this.recordStory(a, 'sheltered', `reached ${shelter.label} and weathered the downpour`); this.learn(a, 'Shelter', 1.4, 'surviving a storm'); } }
      else if (weather.phase !== 'rain') a.shelteredTicks = 0;
      if (isPred && prey && Math.hypot(prey.x - a.x, prey.y - a.y) < 23 && Math.abs(prey.y - a.y) < 34 && (huntDrive > 0.46 || a.hunger > 0.78 || a.energy < 38)) {
        const oldName = prey.name; this.kill(prey, `was caught by ${a.name}`); a.energy = Math.min(125, a.energy + 45); a.hunger = Math.max(0, a.hunger - 0.7); a.hunts++; this.hunts++; if (a.vineback && a.vineback.jumpKind === 'predator-pounce') a.vineback.successfulPounces++; this.recordStory(a, 'hunted', `caught ${oldName}`); this.learn(a, 'Hunt', 1.2, 'a successful hunt');
      }
      if (weather.phase === 'rain' && !inShelter && this.tick % 9 === a.uid % 9) { a.energy -= 0.9 + weather.intensity * 1.6; a.state = 'soaked'; if (a.energy < 15 && this.tick % 45 === a.uid % 45) this.recordStory(a, 'danger', 'is weakened by the monsoon'); }
      this.useEnvironmentTools(a, fly, door, lever, threat, weather);
      if (a.species === 'vineback' && den && den.dist < 80 && a.hunger < .45 && a.state !== 'hunting' && a.state !== 'stalking') {
        den.ref.occupied=true;den.ref.lastEmergence=this.tick;
        if(a.state!=='denning') { a.state='denning'; if(this.tick%90===a.uid%90)this.recordStory(a,'rested',`rested inside ${den.ref.label}`); }
        a.energy=Math.min(120,a.energy+.014);a.hunger=Math.max(0,a.hunger-.00015);
      } else if (a.species === 'vineback' && den?.ref) den.ref.occupied=false;
      if (a.clanId && social.length) {
        const ally=social.find(q=>q.agent.clanId===a.clanId&&q.d<70);
        if(ally && a.hunger<.55 && a.energy>48 && this.tick%80===a.uid%80){a.socialActs++;this.recordStory(a,'social',`stayed near clanmate ${ally.agent.name}`);this.learn(a,'Investigate',.2,'social contact');}
      }
      // The Mossling's soft-body rig advances once per simulation tick, not once
      // per rendered frame, so animation remains reproducible at any playback speed.
      if (isMoss && a.mossling) MosslingCharacter.tick(a, this);
      if (isPred && a.vineback) VinebackCharacter.tick(a, this);
    }
    canReproduce(a,b,weather=this.weather()) {
      if(!a||!b||!a.alive||!b.alive||a.uid===b.uid||a.species!==b.species)return false;
      if(a.age<800||b.age<800||a.energy<78||b.energy<78||a.hunger>.53||b.hunger>.53||a.cooldown>0||b.cooldown>0||a.matingCooldown>0||b.matingCooldown>0)return false;
      if(weather.phase==='rain'||Math.abs(a.y-b.y)>50||Math.hypot(a.x-b.x,(a.y-b.y)*.7)>62)return false;
      if(a.parentUid!=null&&a.parentUid===b.uid||b.parentUid!=null&&b.parentUid===a.uid)return false;
      if(a.siblingGroup!=null&&a.siblingGroup===b.siblingGroup)return false;
      const localFood=this.plants.some(p=>p.biomass>.35&&Math.hypot(p.x-(a.x+b.x)/2,p.y-(a.y+b.y)/2)<230)||this.flies.some(f=>f.alive&&Math.hypot(f.x-(a.x+b.x)/2,f.y-(a.y+b.y)/2)<150);
      return localFood && (a.clanId==null||b.clanId==null||a.clanId===b.clanId);
    }
    processReproduction(weather) {
      if(this.tick%7!==0||this.agents.filter(a=>a.alive).length>=this.options.maxPopulation)return;
      const used=new Set();
      for(const a of this.agents){if(!a.alive||used.has(a.uid)||a.energy<78||a.age<800||a.cooldown>0)continue;
        const mates=this.nearbyAgents(a,b=>this.canReproduce(a,b,weather),62).sort((p,q)=>p.d-q.d);
        if(!mates.length)continue;const b=mates[0].agent;if(used.has(b.uid))continue;
        const drive=.45+Math.max(0,a.brain.lastOutputs[7]||0)*.25+Math.max(0,b.brain.lastOutputs[7]||0)*.25;
        if(this.geneticsRng()>.095*drive)continue;
        const baby=this.spawnAgent(a.species,(a.x+b.x)/2,a,true,null,b);
        if(!baby)continue;
        const cost=24;a.energy-=cost;b.energy-=cost;a.cooldown=b.cooldown=1150;a.matingCooldown=b.matingCooldown=750;a.offspring++;b.offspring++;used.add(a.uid);used.add(b.uid);
        this.recordStory(a,'bred',`paired with ${b.name}; offspring inherited mixed traits and neural weights`);this.recordStory(b,'bred',`paired with ${a.name}; parental traits were combined`);this.recordStory(baby,'born',`was born to ${a.name} and ${b.name}`);this.learn(a,'Explore',.35,'successful reproduction');this.learn(b,'Investigate',.25,'successful reproduction');
        if(this.agents.filter(a=>a.alive).length>=this.options.maxPopulation)break;
      }
    }
    updatePlantEcology(weather, light) {
      const warm = 0.5 + 0.5 * Math.sin((this.tick % 2400) / 2400 * Math.PI * 2 - Math.PI / 2);
      for (const p of this.plants) {
        p.age = (p.age || 0) + 1;
        if (p.moisture == null) p.moisture = p.zone === 'underground' ? 0.68 : 0.46;
        if (p.nutrients == null) p.nutrients = 0.55;
        if (p.lightExposure == null) p.lightExposure = p.type === 'fungus' ? 0.12 : p.zone === 'underground' ? 0.22 : 0.82;
        if (p.seedBank == null) p.seedBank = 0.5;
        if (p.nextSeedTick == null) p.nextSeedTick = this.tick + 600;
        const underground = p.zone === 'underground' || this.vaults.some(v => p.x > v.left && p.x < v.right && p.y >= v.top && p.y <= v.bottom);
        const evap = underground ? 0.000055 : 0.00014 + light * p.lightExposure * 0.00034;
        const rainGain = weather.phase === 'rain' ? (underground ? 0.0012 : 0.0032) : weather.phase === 'after' ? 0.00045 : weather.phase === 'warning' ? 0.00018 : 0;
        p.moisture = clamp(p.moisture + rainGain - evap, 0.02, 1);
        const effectiveLight = clamp(p.lightExposure * (0.14 + light * 0.86), 0.02, 1);
        const lightFactor = p.type === 'fungus' ? 0.72 + effectiveLight * 0.28 : 0.18 + effectiveLight * 0.9;
        const waterFactor = 0.12 + p.moisture * 1.06;
        const nutrientFactor = 0.42 + p.nutrients * 0.72;
        const temperatureFactor = clamp(0.52 + warm * 0.65, 0.45, 1.2);
        const stress = p.moisture < 0.12 ? 0.22 : p.nutrients < 0.08 ? 0.4 : 1;
        const weatherBoost = weather.phase === 'rain' ? 1.45 : weather.phase === 'after' ? 1.18 : 1;
        const growth = p.growth * lightFactor * waterFactor * nutrientFactor * temperatureFactor * stress * weatherBoost;
        p.biomass = clamp(p.biomass + growth, 0, p.max || 1);
        p.nutrients = clamp(p.nutrients - growth * 0.045, 0.02, 1);
        // Seed spread creates new colonies over time. Dense existing patches inhibit
        // nearby germination, while cave fungi prefer shaded, humid chamber floors.
        if (p.biomass > 0.82 && this.tick >= p.nextSeedTick && this.tick % 32 === p.id % 32 && this.plants.length < 180 * SECTORS && this.rng() < 0.16 * p.seedBank) {
          let nx, ny, zone = underground ? 'underground' : 'surface', perch = false;
          if (underground) {
            const room = this.caverns.reduce((best, r) => { const d = Math.abs((r.col + r.width / 2) * TILE - p.x); return d < (best?.d ?? Infinity) ? { r, d } : best; }, null)?.r;
            if (!room) continue;
            nx = (room.col + 2 + this.rng() * Math.max(1, room.width - 4)) * TILE; ny = room.floorY;
          } else {
            nx = clamp(p.x + (this.rng() - 0.5) * 240, 40, WORLD_W - 40); ny = this.groundY(nx);
            if (this.rng() < 0.22) {
              const ledge = this.platforms[Math.floor(this.rng() * this.platforms.length)];
              if (ledge) { nx = (ledge[0] + 1 + this.rng() * Math.max(1, ledge[2] - 2)) * TILE; ny = ledge[1] * TILE; perch = true; zone = 'ledge'; }
            }
          }
          const closePatch = this.plants.some(q => Math.hypot(q.x - nx, (q.y - ny) * 0.6) < 52);
          if (!closePatch) {
            const type = p.type === 'fungus' ? 'fungus' : this.rng() < 0.35 ? 'fruit' : this.rng() < 0.55 ? 'glowbud' : 'fern';
            this.plants.push({ id: this.plants.length + 1, x: nx, y: ny, type, biomass: 0.08 + this.rng() * 0.08, max: 1, growth: p.growth * (0.86 + this.rng() * 0.32), phase: this.rng() * Math.PI * 2, color: Math.floor(this.rng() * 3), perch, zone, moisture: clamp(p.moisture + (this.rng() - 0.5) * 0.14, 0.12, 1), nutrients: clamp(p.nutrients * (0.72 + this.rng() * 0.2), 0.08, 1), lightExposure: type === 'fungus' ? 0.12 : zone === 'underground' ? 0.22 : perch ? 0.92 : 0.8, age: 0, seedBank: 0.65 + this.rng() * 0.3, nextSeedTick: this.tick + 900 + Math.floor(this.rng() * 800) });
            p.seedBank = Math.max(0.12, p.seedBank * 0.91); p.nextSeedTick = this.tick + 550 + Math.floor(this.rng() * 650); this.plantSeeds++;
            if (this.plantSeeds <= 12 || this.plantSeeds % 10 === 0) this.log('plant-seed', `A new ${type} seedling took root in the ${zone === 'underground' ? 'underdeep' : zone}.`, null, nx, ny);
          } else p.nextSeedTick = this.tick + 180 + Math.floor(this.rng() * 280);
        }
      }
    }
    updateFlyEcology(weather) {
      for(const f of this.flies){if(!f.alive)continue;f.age++;f.wing+=.18;const plant=this.nearestPlant({x:f.x,y:f.y},true);if(plant&&Math.hypot(plant.x-f.x,plant.y-f.y)<220){f.vx+=Math.sign(plant.x-f.x)*.018;f.vy+=Math.sign((plant.y-18)-f.y)*.012;f.energy=Math.min(1.4,f.energy+.0008*plant.biomass);}f.vx=clamp(f.vx*.97+(this.rng()-.5)*.1,-1.8,1.8);f.vy=clamp(f.vy*.96+(this.rng()-.5)*.08,-1.25,1.25);f.x=clamp(f.x+f.vx,0,WORLD_W);f.y=clamp(f.y+f.vy,40,WORLD_H-35);f.energy-=.00012*(weather.phase==='rain'?1.8:1);if(f.age>1150||f.energy<=0)f.alive=false;}
      this.flies=this.flies.filter(f=>f.alive);
      if(this.flies.length<165*SECTORS&&this.tick%25===0){const nursery=this.plants.filter(p=>p.biomass>.55).sort((a,b)=>b.biomass-a.biomass).slice(0,18);if(nursery.length){const p=nursery[this.rng()*nursery.length|0];if(this.rng()<.62){this.flies.push({id:this.nextFlyUid++,x:p.x+(this.rng()-.5)*70,y:p.y-14-this.rng()*70,vx:(this.rng()-.5)*1.2,vy:(this.rng()-.5)*.8,age:0,energy:.55,wing:this.rng()*6.28,alive:true});}}}
    }
    step() {
      this.tick++;
      const weather = this.weather(), light = this.daylight();
      this.updatePlantEcology(weather, light);
      this.updateFlyEcology(weather);
      for (const den of this.predatorDens) den.occupied=false;
      for (const d of this.doors) if (d.open && !d.vaultId && this.tick - d.lastUsed > 520 && !this.doorOccupied(d)) { d.open = false; this.setDoorSolid(d); }
      for (const c of this.carcasses) {
        c.age++; c.biomass = Math.max(0, c.biomass - (weather.phase === 'rain' ? 0.00062 : 0.0004));
        if (c.age % 24 === 0 && c.biomass > 0.02) { const plant = this.nearestPlant({ x: c.x, y: c.y }, false); if (plant && Math.hypot(plant.x-c.x, plant.y-c.y) < 190) plant.nutrients = clamp((plant.nutrients ?? 0.5) + c.biomass * 0.013, 0.02, 1); }
      }
      this.carcasses = this.carcasses.filter(c => c.biomass > 0.01 && c.age < 2600);
      if (this.tick % 90 === 0) {
        if (weather.phase === 'rain') this.log('weather', 'The monsoon sweeps through the valley. Exposed creatures race for shelter.');
        else if (weather.phase === 'after') this.log('weather', 'Rainwater gathers in the old stone channels. Plants begin to regrow.');
        else if (weather.phase === 'warning') this.log('weather', 'A low rumble travels through the canopy. Rain is approaching.');
      }
      // Predator numbers arise from player placement, hunting success and reproduction; no automatic replenishment.
      for (const a of this.agents) if (a.alive) this.updateAgent(a, weather);
      this.processReproduction(weather);
      this.updateClansAndTerritories();
      // Dead individuals are fully preserved in archive/story storage; remove their live actors from hot loops.
      this.agents = this.agents.filter(a => a.alive);
      if (this.tick % 8 === 0) this.history.push({ tick: this.tick, mosslings: this.count('mossling'), vinebacks: this.count('vineback'), glimmers: this.count('glimmer'), flies: this.flies.length, clans: this.clans.length, plants: this.plants.reduce((s, p) => s + p.biomass, 0), rain: weather.phase });
      if (this.history.length > 800) this.history.shift();
      return this.metrics();
    }
    count(species = null) { return this.agents.filter(a => a.alive && (!species || a.species === species)).length; }
    metrics() { return { tick: this.tick, population: this.count(), mosslings: this.count('mossling'), vinebacks: this.count('vineback'), glimmers: this.count('glimmer'), plants: this.plants.reduce((s, p) => s + p.biomass, 0), plantPatches: this.plants.length, seedlingCount: this.plants.filter(p => p.biomass < 0.2).length, meanMoisture: this.plants.length ? this.plants.reduce((s,p)=>s+(p.moisture ?? 0.5),0)/this.plants.length : 0, flies: this.flies.filter(f=>f.alive).length, flyMeals: this.flyMeals, clans: this.clans.length, territories: this.territories.length, doorsOpen: this.doors.filter(d=>d.open).length, doorsLocked: this.doors.filter(d=>d.locked).length, vaults: this.vaults.length, vaultsLocked: this.vaults.filter(v=>this.doors.find(d=>d.id===v.doorId)?.locked).length, vaultOccupants: this.agents.filter(a=>a.alive && this.vaultAt(a.x,a.y)).length, hiddenMosslings: this.agents.filter(a=>a.alive && a.species==='mossling' && a.hidden).length, plantSeeds: this.plantSeeds, gatesUsed: this.gatesUsed, denVisits: this.denVisits, food: this.meals, births: this.births, deaths: this.deaths, hunts: this.hunts, weather: this.weather().phase, learning: this.learningTotal, activeFlies:this.flies.filter(f=>f.alive).length, liveDens:this.predatorDens.filter(d=>d.occupied).length, toolEvents:this.toolEvents, clansFormed:this.clans.length, clanLeaders:this.agents.filter(a=>a.alive&&a.clanRole==='leader').length, carcassBiomass:this.carcasses.reduce((s,c)=>s+c.biomass,0), lostPreyEvents:this.lostPreyEvents||0,searchingPredators:this.agents.filter(a=>a.alive&&a.species==='vineback'&&a.preySearchUntil>this.tick).length,collisionBlockedMoves:this.collisionStats.blockedMoves, collisionRecoveries:this.collisionStats.recoveries, obstacleAvoidances:this.collisionStats.obstacleAvoidances }; }
    enableFeature(feature, value = true) {
      if (feature === 'predators') { this.predatorsEnabled = value; if (value && !this.count('vineback')) { const den=this.predatorDens[0]; const predator=this.spawnAgent('vineback', den?.x ?? 1180); if(predator&&den){predator.y=den.y;predator.state='denning';den.occupied=true;den.lastEmergence=this.tick;this.recordStory(predator,'den','emerged from '+den.label);} } if (!value) for (const a of this.agents) if (a.alive && a.species === 'vineback') this.kill(a, 'the predator layer was disabled'); this.log('unlock', `Predators ${value ? 'unlocked' : 'disabled'}.`); }
      else if (feature === 'scavengers') { this.scavengersEnabled = value; this.log('unlock', `Scavenging behaviour ${value ? 'enabled' : 'disabled'}. Existing and manually placed Glimmers are not auto-created or removed.`); }
      else if (feature === 'storms') { this.stormsEnabled = value; this.log('unlock', `Weather cycles ${value ? 'enabled' : 'disabled'}.`); }
    }
    applyTool(tool, x, y) {
      x = clamp(x, 0, WORLD_W); y = clamp(y, 0, WORLD_H); this.toolEvents++;
      if (tool === 'plant' || tool === 'fungus') { const type=tool==='fungus'?'fungus':'fern'; this.plants.push({ id: this.plants.length + 1, x, y: y>this.surface[clamp(Math.floor(x/TILE),0,COLS-1)]*TILE ? y : this.groundY(x), type, biomass: 0.8, max: 1, growth: type==='fungus'?.0011:.00075, phase: this.rng() * 6, color: type==='fungus'?2:0, zone: y>this.surface[clamp(Math.floor(x/TILE),0,COLS-1)]*TILE?'underground':'surface' }); this.log('plant', `New ${type} colony rooted in the world.`,null,x,y); }
      else if (tool === 'flies') { for(let i=0;i<18&&this.flies.length<180*SECTORS;i++)this.flies.push({id:this.nextFlyUid++,x:x+(this.rng()-.5)*100,y:y+(this.rng()-.5)*75,vx:(this.rng()-.5)*1.1,vy:(this.rng()-.5)*.8,age:0,energy:.7,wing:this.rng()*6.28,alive:true});this.log('flies','A new glowfly swarm drifts into the chamber.',null,x,y); }
      else if (tool === 'toggle-gate') { let best=null,bd=210;for(const d of this.doors){const dist=Math.hypot(d.x-x,(d.y-y)*.7);if(dist<bd){bd=dist;best=d;}}if(best){if(best.locked){this.log('gate','The living seal resists observer control. Only a Mossling can lock or unlock this door.',null,best.x,best.y);}else{best.open=!best.open;best.lastUsed=this.tick;best.useCount=(best.useCount||0)+1;this.gatesUsed++;this.setDoorSolid(best);this.log('gate',`${best.name} ${best.open?'opened':'closed'} by the observer. Lock state unchanged.`,null,best.x,best.y);}}else this.log('gate','No gate close enough to the selected point.',null,x,y); }
      else if (tool === 'mossling' || tool === 'vineback' || tool === 'glimmer') { const a = this.spawnAgent(tool, x); if (a) this.log('spawn', `${a.name} was introduced into the valley.`, a.uid, a.x, a.y); }
      else if (tool === 'rain') { this.stormsEnabled = true; this.tick = Math.floor(this.tick / 1800) * 1800 + 1000; this.log('weather', 'You called the monsoon early. Find shelter.'); }
    }
    stateHash() { let h = 2166136261; const mix = v => { h ^= v | 0; h = Math.imul(h, 16777619); }; mix(this.seed); mix(this.tick); mix(+this.predatorsEnabled); mix(+this.scavengersEnabled); mix(+this.stormsEnabled);mix(this.lostPreyEvents||0);mix(this.flies.length);mix(this.gatesUsed);mix(this.nextClanId);for(const d of this.doors){mix(+d.open);mix(+d.locked);mix(d.useCount||0);}for(const f of this.flies)if(f.alive){mix(f.id);mix(f.x|0);mix(f.y|0);mix(f.age);}for (const p of this.plants) { mix(Math.round(p.biomass * 10000)); mix(p.x|0); mix(p.y|0); mix(Math.round((p.moisture ?? 0)*10000)); mix(Math.round((p.nutrients ?? 0)*10000)); mix(Math.round((p.seedBank ?? 0)*10000)); mix(p.age||0); mix(p.nextSeedTick||0); } for (const c of this.carcasses) { mix(c.x|0); mix(c.y|0); mix(Math.round(c.biomass*10000)); mix(c.age); } for (const a of this.agents) { if (!a.alive) continue; mix(a.uid); mix(SPECIES[a.species]); mix(a.x|0); mix(a.y|0); mix(Math.round(a.energy*100)); mix(Math.round(a.hunger*1000)); mix(a.age); mix(Math.round(a.traits.speed*1000)); mix(Math.round(a.traits.vision*1000)); mix(Math.round(a.traits.metabolism*1000)); for (const w of a.policy) mix(Math.round(w*10000));for(const w of a.brain.w1)mix(Math.round(w*10000));for(const w of a.brain.w2)mix(Math.round(w*10000));mix(a.clanId||0);mix(a.hidden?1:0);mix(a.clanRank||1);mix(a.clanRole==='leader'?1:a.clanRole==='scout'?2:a.clanRole==='member'?3:0);mix(a.vaultId||0);mix(a.targetUid||0);mix(a.preySearchUntil||0);mix(a.searchTargetX||0);mix(a.blockedTicks||0);mix(a.jumpCooldown||0);mix(a.obstacleAvoidTicks||0);mix(a.stuckRecoveries||0); if (a.vineback) { const v=a.vineback; for(const k of VinebackCharacter.TRAITS) mix(Math.round((v.traits[k]||0)*10000)); for(const n of ['pounceCooldown','pounces','successfulPounces','wallContacts','displayWins','displays','patrolTicks','packCalls','territoryTicks']) mix(v[n]||0); for(const ch of String(v.posture||'')+'|'+String(v.mood||'')+'|'+String(v.lastState||'')) mix(ch.charCodeAt(0)); if(v.rig) for(const p of [...v.rig.spine,...v.rig.tail,...v.rig.feet]) for(const n of ['x','y','px','py','kneeX','kneeY']) if(p[n]!=null) mix(Math.round(p[n]*100)); } if (a.navigation) { mix(a.navigation.climbableId||0);mix(a.navigation.climbDirection||0);mix(+!!a.navigation.climbCommitted);mix(a.navigation.noProgressTicks||0);mix(a.navigation.patrolX||0); } if (a.mossling) { for (const k of MosslingCharacter.PERSONALITY_KEYS) mix(Math.round((a.mossling.personality[k]||0)*10000)); mix(a.mossling.pounceCooldown||0); mix(a.mossling.pounces||0); mix(a.mossling.wallGripSide||0); mix(a.mossling.wallGripTicks||0); mix(a.mossling.wallGripCooldown||0); mix(a.mossling.wallGrips||0); mix(a.hitboxH||0); mix(Math.round((a.mossling.gaitPhase||0)*10000)); mix(Math.round((a.mossling.breathPhase||0)*10000)); mix(Math.round((a.mossling.squash||0)*1000)); mix(Math.round((a.mossling.stretch||0)*1000)); for(const ch of (a.mossling.posture||'').concat('|',(a.mossling.mood||''),(a.mossling.lastState||''))) mix(ch.charCodeAt(0)); if(a.mossling.rig){ for(const point of [a.mossling.rig.head,a.mossling.rig.rump,...a.mossling.rig.tail]) for(const val of [point.x,point.y,point.px,point.py]) mix(Math.round(val*100)); } } } return (h >>> 0).toString(16).padStart(8, '0'); }
    snapshot() { return { version: '1.3.0', seed: this.seed, tick: this.tick, features: { predators: this.predatorsEnabled, scavengers: this.scavengersEnabled, storms: this.stormsEnabled }, metrics: this.metrics(), agents: this.agents.map(a => ({ ...this.publicAgent(a), alive: !!a.alive, policy: a.policy.slice(), brain:{w1:a.brain.w1.slice(),b1:a.brain.b1.slice(),w2:a.brain.w2.slice(),b2:a.brain.b2.slice()}, memory:{...a.memory}, story: this.getStory(a.uid) })), archive: Array.from(this.archive.values(), r => ({ ...r, policy: r.policy.slice(), summary: { ...r.summary }, story: r.story.slice() })), plants: this.plants.map(p => ({ ...p })), flies: this.flies.map(f=>({...f})), doors:this.doors.map(d=>({...d,cells:d.cells.slice()})), vaults:this.vaults.map(v=>({...v,entryRows:v.entryRows.slice()})), clans:this.clans.map(c=>({...c,members:c.members.slice()})), territories:this.territories.map(t=>({...t})), predatorDens:this.predatorDens.map(d=>({...d})), carcasses: this.carcasses.map(c => ({ ...c })), climbables: this.climbables.map(c => ({ ...c })), shelters: this.shelters.map(s => ({ ...s })) }; }
  }
  Simulation.constants = { TILE, SECTOR_COLS, SECTORS, COLS, ROWS, WORLD_W, WORLD_H, MAX, SPECIES, SPECIES_NAMES, POLICY_NAMES, BRAIN_INPUTS, BRAIN_HIDDEN, BRAIN_OUTPUTS };
  Simulation.mulberry32 = mulberry32;
  return Simulation;
})();
if (typeof module !== 'undefined' && module.exports) module.exports = GenesisSimulation;
if (typeof globalThis !== 'undefined') globalThis.GenesisSimulation = GenesisSimulation;
