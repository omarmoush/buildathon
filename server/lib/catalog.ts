import { catalogItems } from "../../artifacts/api-server/src/routes/catalog";
import { db } from "../db";
import type { CatalogItem } from "../../shared/contract";

// The built-in catalog plus products the workshop added (catalog_products).
type ProductRow = {
  id: string; category: string; name: string; name_ar: string; w: number; d: number; h: number;
  woods_json: string; finishes_json: string; image_url: string | null;
};
export type CatalogEntry = CatalogItem & { category: string };

function fromRow(row: ProductRow): CatalogEntry {
  const woods = JSON.parse(row.woods_json) as string[], finishes = JSON.parse(row.finishes_json) as string[];
  return {
    id: row.id, category: row.category, custom: true, name: row.name, nameAr: row.name_ar || undefined,
    defaultDims: { w: row.w, d: row.d, h: row.h }, woods, finishes,
    thumbnailUrl: row.image_url || `/api/catalog/art/${row.category}.svg?wood=${woods[0]}&finish=${finishes[0]}`,
    glbUrl: `/api/catalog/custom/${row.id}.glb`,
  };
}

export async function customProducts(): Promise<CatalogEntry[]> {
  const rows = await db.prepare("SELECT * FROM catalog_products ORDER BY created_at DESC").all<ProductRow>();
  return rows.map(fromRow);
}
export async function allCatalog(): Promise<CatalogEntry[]> {
  return [...catalogItems, ...await customProducts()];
}
export async function findCatalogItem(id: string): Promise<CatalogEntry | undefined> {
  const builtIn = catalogItems.find(item => item.id === id);
  if (builtIn) return builtIn;
  const row = await db.prepare("SELECT * FROM catalog_products WHERE id=?").get<ProductRow>(id);
  return row ? fromRow(row) : undefined;
}
