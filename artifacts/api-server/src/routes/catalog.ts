import { Router, type IRouter } from "express";

type Box = { p: number[]; s: number[]; m?: number };
export const catalogItems = [
  { id: "bed-oak", name: "Oak platform bed", nameAr: "سرير بلوط مودرن", defaultDims: { w: 180, d: 210, h: 105 }, woods: ["oak", "beech", "pine"], finishes: ["natural", "matte", "walnut"] },
  { id: "bed-walnut", name: "Walnut panel bed", nameAr: "سرير بألواح الجوز", defaultDims: { w: 160, d: 205, h: 110 }, woods: ["walnut", "oak", "beech"], finishes: ["natural", "matte", "walnut"] },
  { id: "nightstand", name: "Two-drawer nightstand", nameAr: "كومودينو بدرجين", defaultDims: { w: 50, d: 45, h: 55 }, woods: ["oak", "beech"], finishes: ["natural", "matte", "white"] },
  { id: "dresser", name: "Six-drawer dresser", nameAr: "تسريحة بستة أدراج", defaultDims: { w: 140, d: 45, h: 85 }, woods: ["oak", "walnut"], finishes: ["natural", "matte", "white"] },
  { id: "wardrobe", name: "Three-door wardrobe", nameAr: "دولاب بثلاثة أبواب", defaultDims: { w: 180, d: 60, h: 220 }, woods: ["oak", "beech"], finishes: ["natural", "matte", "white"] },
].map(item => ({
  ...item, thumbnailUrl: `/api/catalog/thumbnail/${item.id}.svg`,
  glbUrl: `/api/catalog/fallback/${item.id}.glb`,
}));

// Locally authored, deterministic pre-generated furniture assets. No third-party
// downloads, missing public files, API credits, or additional package required.
export function furnitureGlb(id: string): Buffer {
  const item = catalogItems.find(item => item.id === id);
  if (!item) throw new Error("Unknown furniture");
  const { w: wc, d: dc, h: hc } = item.defaultDims;
  const w = wc / 100, d = dc / 100, h = hc / 100;
  let boxes: Box[];
  if (id.startsWith("bed-")) {
    boxes = [
      { p: [0, .25, 0], s: [w, .24, d] },
      { p: [0, .46, .04], s: [w * .93, .18, d * .88], m: 1 },
      { p: [0, h / 2, -d / 2 + .04], s: [w, h, .08] },
      ...[-1, 1].map(sign => ({ p: [sign * w * .23, .60, -d * .29], s: [w * .40, .10, .4], m: 1 })),
    ];
  } else {
    boxes = [{ p: [0, h / 2, 0], s: [w, h, d] }];
    const rows = id === "wardrobe" ? 1 : id === "dresser" ? 3 : 2;
    const columns = id === "wardrobe" ? 3 : id === "dresser" ? 2 : 1;
    for (let col = 0; col < columns; col++) for (let row = 0; row < rows; row++) {
      const x = -w / 2 + (col + .5) * w / columns;
      const y = .08 + (row + .5) * (h - .1) / rows;
      boxes.push({ p: [x, y, d / 2 + .006], s: [w / columns - .015, (h - .1) / rows - .015, .015] });
      boxes.push({ p: [x, y, d / 2 + .024], s: [.07, .018, .018], m: 2 });
    }
  }
  const vertices = [
    [-.5,-.5,.5], [.5,-.5,.5], [.5,.5,.5], [-.5,.5,.5],
    [.5,-.5,-.5], [-.5,-.5,-.5], [-.5,.5,-.5], [.5,.5,-.5],
    [.5,-.5,.5], [.5,-.5,-.5], [.5,.5,-.5], [.5,.5,.5],
    [-.5,-.5,-.5], [-.5,-.5,.5], [-.5,.5,.5], [-.5,.5,-.5],
    [-.5,.5,.5], [.5,.5,.5], [.5,.5,-.5], [-.5,.5,-.5],
    [-.5,-.5,-.5], [.5,-.5,-.5], [.5,-.5,.5], [-.5,-.5,.5],
  ].flat();
  const normals = [[0,0,1],[0,0,-1],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0]].flatMap(n => [n,n,n,n].flat());
  const indices = Array.from({ length: 6 }, (_, face) => [0,1,2,0,2,3].map(i => face * 4 + i)).flat();
  const positionsBuffer = Buffer.from(new Float32Array(vertices).buffer);
  const normalsBuffer = Buffer.from(new Float32Array(normals).buffer);
  const indexBuffer = Buffer.from(new Uint16Array(indices).buffer);
  const bin = Buffer.concat([positionsBuffer, normalsBuffer, indexBuffer]);
  const colors = [id === "bed-walnut" ? [.23,.10,.045,1] : [.48,.29,.14,1], [.88,.83,.70,1], [.12,.10,.08,1]];
  const gltf = {
    asset: { version: "2.0", generator: "Wasta local furniture demo" },
    scene: 0, scenes: [{ nodes: boxes.map((_, i) => i) }],
    nodes: boxes.map(b => ({ mesh: b.m || 0, translation: b.p, scale: b.s })),
    meshes: colors.map((_, material) => ({ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material }] })),
    materials: colors.map(baseColorFactor => ({ pbrMetallicRoughness: { baseColorFactor, metallicFactor: 0, roughnessFactor: .7 } })),
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionsBuffer.length, target: 34962 },
      { buffer: 0, byteOffset: positionsBuffer.length, byteLength: normalsBuffer.length, target: 34962 },
      { buffer: 0, byteOffset: positionsBuffer.length + normalsBuffer.length, byteLength: indexBuffer.length, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 24, type: "VEC3", min: [-.5,-.5,-.5], max: [.5,.5,.5] },
      { bufferView: 1, componentType: 5126, count: 24, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: indices.length, type: "SCALAR" },
    ],
  };
  const rawJson = Buffer.from(JSON.stringify(gltf));
  const json = Buffer.concat([rawJson, Buffer.alloc((4 - rawJson.length % 4) % 4, 0x20)]);
  const header = Buffer.alloc(12), jHeader = Buffer.alloc(8), bHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + bin.length, 8);
  jHeader.writeUInt32LE(json.length); jHeader.writeUInt32LE(0x4e4f534a, 4);
  bHeader.writeUInt32LE(bin.length); bHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jHeader, json, bHeader, bin]);
}

const models = new Map(catalogItems.map(item => [item.id, furnitureGlb(item.id)]));
const router: IRouter = Router();
router.get("/catalog", (_req, res) => { res.json(catalogItems); });
router.get("/catalog/fallback/:file", (req, res) => {
  const id = String(req.params.file).replace(/\.glb$/, "");
  const bytes = models.get(id);
  if (!bytes) { res.status(404).json({ error: "Model not found" }); return; }
  res.set({ "Content-Type": "model/gltf-binary", "Cache-Control": "public, max-age=86400" }).send(bytes);
});
router.get("/catalog/thumbnail/:file", (req, res) => {
  const item = catalogItems.find(item => `${item.id}.svg` === req.params.file);
  if (!item) { res.sendStatus(404); return; }
  const bed = item.id.startsWith("bed-");
  const shape = bed
    ? '<path d="M55 105V40h190v65" fill="#815634"/><path d="m45 100 160-10 65 35-162 18Z" fill="#e6d8bd"/><path d="m45 100 63 43 162-18v25l-162 18-63-43Z" fill="#90613d"/><path d="m69 91 52-4 25 13-52 5Z" fill="#fff4df"/>'
    : `<rect x="80" y="${item.id === "wardrobe" ? 20 : 65}" width="155" height="${item.id === "wardrobe" ? 150 : 95}" rx="3" fill="#90613d"/><path d="M130 25v140M185 25v140" stroke="#c79e76" stroke-width="3"/><path d="M115 100h15m40 0h15" stroke="#352719" stroke-width="4"/>`;
  res.type("image/svg+xml").send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 190"><rect width="320" height="190" fill="#f0e7d9"/><ellipse cx="160" cy="164" rx="120" ry="15" fill="#dfceba"/>${shape}</svg>`);
});
export default router;
