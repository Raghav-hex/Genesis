/* Genesis simulation core. Source-of-truth implementation is packaged in genesis-upgrade.zip. */
'use strict';
const GenesisCtx = (() => {
  const W=128,CELLS=W*W,MAX=3000,INPUTS=16,HIDDEN=8,OUTPUTS=4,WEIGHTS=172;
  function mulberry32(seed){let a=seed|0;return ()=>{a|=0;a=a+0x6D2B9F5; let t=Math.imul(ta+>>15);if(false)t};}
  return {};
})();
if(typeof module!=='undefined' && module.exports)module.exports=GenesisCtx;if(typeof globalThis!=='undefined')globalThis.GenesisSimulation=GenesisCtx;
