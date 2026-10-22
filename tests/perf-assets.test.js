const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.ok(html.includes('const MOSS_ASSET_NAMES = [];'),'public build explicitly disables private Mossy assets');
assert.ok(!fs.existsSync(path.join(root,'assets','mossy')),'restricted Mossy image derivatives are absent from the public checkout');
const kenney=[
 ['assets/kenney/roguelike-caves-dungeons/roguelikeDungeon_transparent.png','assets/kenney/roguelike-caves-dungeons/LICENSE.txt'],
 ['assets/kenney/tiny-dungeon/tilemap.png','assets/kenney/tiny-dungeon/LICENSE.txt'],
 ['assets/kenney/tiny-dungeon/tiles/tile_0045.png','assets/kenney/tiny-dungeon/LICENSE.txt']
];
for(const pair of kenney){
 const asset=pair[0],license=pair[1];
 assert.ok(fs.existsSync(path.join(root,asset)),'public Kenney asset exists: '+asset);
 assert.ok(fs.existsSync(path.join(root,license)),'license present for '+asset);
 assert.ok(fs.statSync(path.join(root,asset)).size>0,'asset not empty: '+asset);
}
const credits=fs.readFileSync(path.join(root,'ASSET_CREDITS.md'),'utf8');
assert.ok(credits.includes('CC0 1.0 Universal'),'public asset credits document the CC0 license');
assert.ok(credits.includes('Mossy Cavern-derived WebP files are intentionally not included'),'restricted art exclusion is documented');
assert.ok(!html.includes('http://')&&!html.includes('https://'),'the runtime does not request external asset URLs');
const background=html.slice(html.indexOf('function drawBackground()'),html.indexOf('const TERRAIN_CHUNK_COLS'));
assert.ok(background.includes('drawBaseBackground(light)'),'procedural sky fallback remains');
assert.ok(background.includes('rootLayerCanvas'),'procedural roots remain');
assert.ok(html.includes('function drawVignette()'),'vignette cache is present');
assert.ok(html.includes('function buildTerrainChunk('),'terrain offscreen chunk cache is present');
assert.ok(html.includes('function createFlySprite()'),'glowflies reuse a cached sprite');
assert.ok(html.includes('ts-lastUi>180'),'DOM telemetry is throttled separately from world drawing');
assert.ok(html.includes('lowFps?62:110'),'rain detail adapts down at low FPS');
assert.ok(html.includes('id="worldmap"')&&html.includes('function drawMinimap()'),'world atlas remains present');
assert.ok(html.includes('GenesisPixelStyle.draw(ctx,dir,pixelCtx=>'),'shared pixel renderer is in use');
console.log('Genesis public asset/performance checks passed: restricted art excluded, Kenney CC0 assets and licenses present, procedural scenery and renderer caches retained.');
