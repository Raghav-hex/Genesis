/* Genesis shared pixel-art renderer v1.4
 * Low-resolution offscreen rendering + one shared, limited palette.
 * The simulation remains full precision; only the visual pass is quantized.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.GenesisPixelStyle = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCALE = 3;           // one sprite pixel becomes a 3x3 world-pixel block
  const WIDTH = 80;          // world footprint 240 × 144
  const HEIGHT = 48;
  const ORIGIN_X = 40;
  const ORIGIN_Y = 24;
  const PALETTE = [
    "#0C1412", "#18211C", "#29382F", "#425345",
    "#425B31", "#79974A", "#B4CC70",
    "#9A825B", "#D3C093", "#F1E2B8",
    "#60764A", "#9CAD65", "#D77760",
    "#D8F18D", "#5B8984", "#D8DEC8"
  ];

  let surface = null;
  let surfaceCtx = null;
  let colorLut = null;
  let drawCount = 0;

  function rgb(hex) {
    const h = hex.slice(1);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const RGB_PALETTE = PALETTE.map(rgb);

  // A 5-bit/channel lookup avoids doing a 16-colour nearest match for every
  // pixel on every frame. It keeps per-creature palette mapping inexpensive.
  function getColorLut() {
    if (colorLut) return colorLut;
    colorLut = new Uint8Array(32768 * 3);
    for (let r5 = 0; r5 < 32; r5++) for (let g5 = 0; g5 < 32; g5++) for (let b5 = 0; b5 < 32; b5++) {
      const r = r5 * 8 + 4, g = g5 * 8 + 4, b = b5 * 8 + 4;
      let best = 0, bestDistance = Infinity;
      for (let i = 0; i < RGB_PALETTE.length; i++) {
        const p = RGB_PALETTE[i];
        const dr = (r - p[0]) * 0.88, dg = (g - p[1]) * 1.0, db = (b - p[2]) * 0.72;
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDistance) { bestDistance = dist; best = i; }
      }
      const p = RGB_PALETTE[best], at = ((r5 << 10) | (g5 << 5) | b5) * 3;
      colorLut[at] = p[0]; colorLut[at + 1] = p[1]; colorLut[at + 2] = p[2];
    }
    return colorLut;
  }

  function ensureSurface() {
    if (surface) return;
    if (typeof OffscreenCanvas !== "undefined") surface = new OffscreenCanvas(WIDTH, HEIGHT);
    else if (typeof document !== "undefined") {
      surface = document.createElement("canvas");
      surface.width = WIDTH; surface.height = HEIGHT;
    } else throw new Error("GenesisPixelStyle.draw requires a browser canvas environment.");
    surfaceCtx = surface.getContext("2d", { willReadFrequently: true, alpha: true });
    surfaceCtx.imageSmoothingEnabled = false;
    getColorLut();
  }

  function quantize() {
    const image = surfaceCtx.getImageData(0, 0, WIDTH, HEIGHT);
    const data = image.data, lut = colorLut;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 64) { data[i + 3] = 0; continue; }
      const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
      const at = key * 3;
      data[i] = lut[at]; data[i + 1] = lut[at + 1]; data[i + 2] = lut[at + 2]; data[i + 3] = 255;
    }
    surfaceCtx.putImageData(image, 0, 0);
  }

  function draw(targetCtx, facing, painter) {
    if (typeof painter !== "function") throw new TypeError("Pixel painter must be a function.");
    ensureSurface();
    surfaceCtx.setTransform(1, 0, 0, 1, 0, 0);
    surfaceCtx.clearRect(0, 0, WIDTH, HEIGHT);
    surfaceCtx.imageSmoothingEnabled = false;
    surfaceCtx.setTransform(1 / SCALE, 0, 0, 1 / SCALE, ORIGIN_X, ORIGIN_Y);
    surfaceCtx.scale((facing || 1) < 0 ? -1 : 1, 1);
    painter(surfaceCtx);
    quantize();

    targetCtx.save();
    targetCtx.imageSmoothingEnabled = false;
    targetCtx.drawImage(surface, -ORIGIN_X * SCALE, -ORIGIN_Y * SCALE, WIDTH * SCALE, HEIGHT * SCALE);
    targetCtx.restore();
    drawCount++;
  }

  function stats() {
    return { scale: SCALE, width: WIDTH, height: HEIGHT, paletteSize: PALETTE.length, draws: drawCount, palette: PALETTE.slice() };
  }

  return { draw, stats, constants: { SCALE, WIDTH, HEIGHT, ORIGIN_X, ORIGIN_Y, PALETTE: PALETTE.slice() } };
});
