import type { FurnitureEstimate, OrderSpec } from "../../shared/contract";
import { catalogItems } from "../../artifacts/api-server/src/routes/catalog";

// Illustrative planning rates, not supplier prices or a binding workshop quote.
// The workshop can replace an order's planning estimate with its own breakdown.
const prices: Record<string, { price: number; label: string; labelAr: string; quantity?: number }> = {
  "bed-oak": { price: 14500, label: "Platform bed", labelAr: "سرير مودرن" },
  "bed-walnut": { price: 18000, label: "Panel bed", labelAr: "سرير بألواح" },
  nightstand: { price: 3800, label: "Nightstand", labelAr: "كومودينو" },
  nightstands: { price: 3800, label: "Nightstands", labelAr: "كومودينو", quantity: 2 },
  wardrobe: { price: 24000, label: "Wardrobe", labelAr: "دولاب ملابس" },
  dresser: { price: 11000, label: "Dresser", labelAr: "تسريحة" },
  "dining-set": { price: 26000, label: "Dining set", labelAr: "غرفة سفرة" },
  "living-room": { price: 28000, label: "Living room furniture", labelAr: "أثاث غرفة معيشة" },
  other: { price: 16000, label: "Custom furniture piece", labelAr: "قطعة أثاث خاصة" },
};
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
type EstimateSpec = Pick<OrderSpec, "productType" | "pieceSource" | "dimensions"> & Partial<OrderSpec>;
export function calculateEstimate(spec: EstimateSpec): FurnitureEstimate {
  const item = catalogItems.find(item => item.id === spec.catalogItemId);
  const woodFactor = ({ oak: 1, walnut: 1.25, beech: .9, pine: .75 } as Record<string, number>)[spec.wood?.toLowerCase() ?? ""] ?? 1;
  const finishFactor = ({ natural: 1, matte: 1.06, white: 1.1, walnut: 1.08 } as Record<string, number>)[spec.finish?.toLowerCase() ?? ""] ?? 1;
  const sourceFactor = spec.pieceSource === "generated" ? 1.25 : spec.pieceSource === "customized" ? 1.1 : 1;
  const base = item?.defaultDims ?? { w: 180, d: 90, h: 100 };
  // A bounded surface-area ratio avoids implausible cubic growth for furniture.
  const area = ({ w, d, h }: typeof base) => w * d + w * h + d * h;
  const sizeFactor = spec.pieceSource === "catalog" ? 1 : Math.max(.4, Math.min(6, area(spec.dimensions) / area(base)));
  let keys: string[];
  if (spec.productType === "bedroom-set") {
    const pieces = [...new Set(spec.bedroomPieces?.length ? spec.bedroomPieces : ["bed", "nightstands", "wardrobe", "dresser"])];
    keys = pieces.map(key => key === "bed" ? (item?.id.startsWith("bed-") ? item.id : "bed-oak") : key);
  } else keys = [item?.id ?? (prices[spec.productType] ? spec.productType : "other")];
  const items = keys.map(key => {
    const rate = prices[key] ?? prices.other!;
    const quantity = rate.quantity ?? 1;
    const matchesSelected = key === item?.id || (key === "nightstands" && item?.id === "nightstand");
    const scale = spec.productType !== "bedroom-set" || matchesSelected ? sizeFactor : 1;
    return { key, label: rate.label, labelAr: rate.labelAr, quantity,
      amountEgp: round(rate.price * quantity * woodFactor * finishFactor * sourceFactor * scale) };
  });
  const totalEgp = round(items.reduce((sum, item) => sum + item.amountEgp, 0));
  // Break down the planning total using the same cost-plus formula as final quotes.
  const cost = totalEgp / 1.25;
  const materialsEgp = round(cost * .7);
  const laborEgp = round(cost - materialsEgp);
  return {
    currency: "EGP", totalEgp, lowEgp: round(totalEgp * .85), highEgp: round(totalEgp * 1.2),
    depositPercent: .5, depositEgp: round(totalEgp * .5), materialsEgp, laborEgp, marginPercent: 25,
    items, pricingVersion: "illustrative-planning-2026-10", createdAt: new Date().toISOString(),
    indicative: true, excludes: ["delivery", "installation", "taxes", "mattress", "accessories"],
  };
}
