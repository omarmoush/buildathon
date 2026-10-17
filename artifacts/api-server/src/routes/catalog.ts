import { Router, type IRouter } from "express";
import { furnitureSvg, hexToLinear, woodHex, type Category } from "../lib/furniture-art";

type Box = { p: number[]; s: number[]; m?: number };
type Dims = { w: number; d: number; h: number };
const WOODS = ["oak", "beech", "walnut", "pine"], FINISHES = ["natural", "matte", "white", "walnut"];
export const catalogItems = ([
  { id: "bed-oak", category: "bed", name: "Oak platform bed", nameAr: "سرير بلوط مودرن", defaultDims: { w: 180, d: 210, h: 105 }, woods: ["oak", "beech", "pine"], finishes: ["natural", "matte", "walnut"] },
  { id: "bed-walnut", category: "bed", name: "Walnut panel bed", nameAr: "سرير بألواح الجوز", defaultDims: { w: 160, d: 205, h: 110 }, woods: ["walnut", "oak", "beech"], finishes: ["natural", "matte", "walnut"] },
  { id: "nightstand", category: "nightstand", name: "Two-drawer nightstand", nameAr: "كومودينو بدرجين", defaultDims: { w: 50, d: 45, h: 55 }, woods: ["oak", "beech"], finishes: ["natural", "matte", "white"] },
  { id: "dresser", category: "dresser", name: "Six-drawer dresser", nameAr: "تسريحة بستة أدراج", defaultDims: { w: 140, d: 45, h: 85 }, woods: ["oak", "walnut"], finishes: ["natural", "matte", "white"] },
  { id: "wardrobe", category: "wardrobe", name: "Three-door wardrobe", nameAr: "دولاب بثلاثة أبواب", defaultDims: { w: 180, d: 60, h: 220 }, woods: ["oak", "beech"], finishes: ["natural", "matte", "white"] },
  { id: "dining-table", category: "dining-table", name: "Six-seat dining table", nameAr: "ترابيزة سفرة ٦ أفراد", defaultDims: { w: 180, d: 90, h: 75 }, woods: WOODS, finishes: FINISHES },
  { id: "dining-chair", category: "dining-chair", name: "Dining chair", nameAr: "كرسي سفرة", defaultDims: { w: 45, d: 50, h: 95 }, woods: WOODS, finishes: FINISHES },
  { id: "sofa", category: "sofa", name: "Three-seat sofa", nameAr: "كنبة ٣ مقاعد", defaultDims: { w: 210, d: 90, h: 85 }, woods: ["oak", "walnut", "beech"], finishes: ["natural", "matte", "walnut"] },
  { id: "coffee-table", category: "coffee-table", name: "Coffee table", nameAr: "ترابيزة قهوة", defaultDims: { w: 110, d: 60, h: 45 }, woods: WOODS, finishes: FINISHES },
] satisfies { id: string; category: Category; name: string; nameAr: string; defaultDims: Dims; woods: string[]; finishes: string[] }[]).map(item => ({
  ...item, thumbnailUrl: `/api/catalog/thumbnail/${item.id}.svg`,
  glbUrl: `/api/catalog/fallback/${item.id}.glb`,
}));

// Geometry per category, in metres with the origin at floor centre.
function boxesFor(category: string, { w: wc, d: dc, h: hc }: Dims): Box[] {
  const w = wc / 100, d = dc / 100, h = hc / 100;
  const legs = (height: number, inset = .05, size = .05): Box[] => [-1, 1].flatMap(x => [-1, 1].map(z =>
    ({ p: [x * (w / 2 - inset), height / 2, z * (d / 2 - inset)], s: [size, height, size] })));
  switch (category) {
    case "bed": return [
      { p: [0, .25, 0], s: [w, .24, d] },
      { p: [0, .46, .04], s: [w * .93, .18, d * .88], m: 1 },
      { p: [0, h / 2, -d / 2 + .04], s: [w, h, .08] },
      ...[-1, 1].map(sign => ({ p: [sign * w * .23, .60, -d * .29], s: [w * .40, .10, .4], m: 1 })),
    ];
    case "dining-table": return [{ p: [0, h - .02, 0], s: [w, .04, d] }, ...legs(h - .04, .08, .07)];
    case "coffee-table": return [{ p: [0, h - .025, 0], s: [w, .05, d] }, { p: [0, .12, 0], s: [w - .12, .02, d - .12] }, ...legs(h - .05, .06, .05)];
    case "dining-chair": return [
      { p: [0, .45, 0], s: [w, .04, d] }, { p: [0, (.47 + h) / 2, -d / 2 + .02], s: [w, h - .47, .03] }, ...legs(.43, .03, .035),
    ];
    case "sofa": return [
      { p: [0, .27, 0], s: [w, .22, d], m: 1 }, { p: [0, .42, .05], s: [w - .32, .1, d - .2], m: 1 },
      { p: [0, .62, -d / 2 + .1], s: [w - .1, .45, .2], m: 1 },
      ...[-1, 1].map(x => ({ p: [x * (w / 2 - .08), .5, 0], s: [.16, .36, d], m: 1 })), ...legs(.16, .1, .05),
    ];
    default: {
      const boxes: Box[] = [{ p: [0, h / 2, 0], s: [w, h, d] }];
      const rows = category === "wardrobe" ? 1 : category === "dresser" ? 3 : 2;
      const columns = category === "wardrobe" ? 3 : category === "dresser" ? 2 : 1;
      for (let col = 0; col < columns; col++) for (let row = 0; row < rows; row++) {
        const x = -w / 2 + (col + .5) * w / columns;
        const y = .08 + (row + .5) * (h - .1) / rows;
        boxes.push({ p: [x, y, d / 2 + .006], s: [w / columns - .015, (h - .1) / rows - .015, .015] });
        boxes.push({ p: [x, y, d / 2 + .024], s: [.07, .018, .018], m: 2 });
      }
      return boxes;
    }
  }
}

// Locally authored, deterministic pre-generated furniture assets. No third-party
// downloads, missing public files, API credits, or additional package required.
// The body colour follows the chosen wood and finish so previews match the selection.
export function furnitureGlbFor(category: string, dims: Dims, wood = "oak", finish = "natural"): Buffer {
  const boxes = boxesFor(category, dims);
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
  const colors = [hexToLinear(woodHex(wood, finish)), [.88,.83,.70,1], [.12,.10,.08,1]];
  const gltf = {
    asset: { version: "2.0", generator: "Akshab local furniture demo" },
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

export function furnitureGlb(id: string, wood?: string, finish?: string): Buffer {
  const item = catalogItems.find(item => item.id === id);
  if (!item) throw new Error("Unknown furniture");
  return furnitureGlbFor(item.category, item.defaultDims, wood ?? item.woods[0], finish ?? item.finishes[0]);
}
const query = (value: unknown) => typeof value === "string" ? value.slice(0, 30) : undefined;

const router: IRouter = Router();
router.get("/catalog", (_req, res) => { res.json(catalogItems); });
// ?wood=&finish= recolour the model, so the 3D preview follows the buyer's material choice.
router.get("/catalog/fallback/:file", (req, res) => {
  const item = catalogItems.find(item => `${item.id}.glb` === req.params.file);
  if (!item) { res.status(404).json({ error: "Model not found" }); return; }
  res.set({ "Content-Type": "model/gltf-binary", "Cache-Control": "public, max-age=86400" })
    .send(furnitureGlb(item.id, query(req.query.wood), query(req.query.finish)));
});
router.get("/catalog/thumbnail/:file", (req, res) => {
  const item = catalogItems.find(item => `${item.id}.svg` === req.params.file);
  if (!item) { res.sendStatus(404); return; }
  res.type("image/svg+xml").set("Cache-Control", "public, max-age=86400").send(furnitureSvg({
    category: item.category, style: query(req.query.style) ?? (item.id === "bed-walnut" ? "classic" : "modern"),
    wood: query(req.query.wood) ?? item.woods[0], finish: query(req.query.finish) ?? item.finishes[0],
  }));
});
// Illustration of any category in a style and material: /api/catalog/art/sofa.svg?style=classic&wood=walnut
router.get("/catalog/art/:file", (req, res) => {
  const category = String(req.params.file).replace(/\.svg$/, "");
  res.type("image/svg+xml").set("Cache-Control", "public, max-age=86400").send(furnitureSvg({
    category, style: query(req.query.style), wood: query(req.query.wood), finish: query(req.query.finish),
  }));
});
export default router;
