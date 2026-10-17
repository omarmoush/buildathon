import type { BuyerOrder, CatalogItem, Spec } from "./types";
export const demoCatalog: CatalogItem[] = [
  ["bed-oak", "Oak platform bed", "سرير بلوط مودرن", 180, 210, 105],
  ["bed-walnut", "Walnut panel bed", "سرير بألواح الجوز", 160, 205, 110],
  ["nightstand", "Two-drawer nightstand", "كومودينو بدرجين", 50, 45, 55],
  ["dresser", "Six-drawer dresser", "تسريحة بستة أدراج", 140, 45, 85],
  ["wardrobe", "Three-door wardrobe", "دولاب بثلاثة أبواب", 180, 60, 220],
].map(([id, name, nameAr, w, d, h]) => ({
  id: String(id), category: String(id).startsWith("bed-") ? "bed" : String(id), name: String(name), nameAr: String(nameAr),
  defaultDims: { w: Number(w), d: Number(d), h: Number(h) },
  woods: ["oak", "beech", "walnut"], finishes: ["natural", "matte", "white"],
  glbUrl: `/api/catalog/fallback/${id}.glb`, thumbnailUrl: `/api/catalog/thumbnail/${id}.svg`,
}));
export const initialSpec: Spec = {
  productType: "bedroom-set", style: [], pieceSource: "catalog",
  dimensions: { w: 180, d: 210, h: 105 }, wood: "oak", finish: "natural",
  budgetRange: "30000-60000", deliveryCountry: "SA", deliveryCity: "",
  wantedBy: "", notes: "", pieces: ["bed", "nightstand", "wardrobe"],
};
export function demoOrder(): BuyerOrder {
  return {
    id: "demo-person2", buyerName: "خالد", status: "design_review", designApproved: false,
    spec: { ...initialSpec, style: ["modern"], deliveryCity: "الرياض", ...demoCatalog[0], dimensions: demoCatalog[0].defaultDims, catalogItemId: "bed-oak" },
    quote: {
      materialsEgp: 30000, laborEgp: 10000, marginPercent: 20, totalEgp: 50000,
      displayCurrency: "SAR", fxRate: 13, totalDisplay: 50000 / 13, depositPercent: .6,
      depositEgp: 30000, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    },
    payments: [], updates: [],
  };
}
