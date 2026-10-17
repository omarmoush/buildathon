import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError, db } from "../db";
import { requireOwner } from "./orders";
import { allCatalog, findCatalogItem } from "../lib/catalog";
import { CATEGORIES } from "../../artifacts/api-server/src/lib/furniture-art";
import { furnitureGlbFor } from "../../artifacts/api-server/src/routes/catalog";

// Workshop-managed products. Mounted before Person 2's catalog router so GET /catalog includes them.
export const productsRouter = Router();
const WOODS = ["oak", "beech", "walnut", "pine"] as const;
const FINISHES = ["natural", "matte", "white", "walnut"] as const;
const query = (value: unknown) => typeof value === "string" ? value.slice(0, 30) : undefined;

productsRouter.get("/catalog", async (_req, res) => { res.json(await allCatalog()); });

productsRouter.get("/catalog/custom/:file", async (req, res) => {
  const item = await findCatalogItem(String(req.params.file).replace(/\.glb$/, ""));
  if (!item?.custom) { res.status(404).json({ error: "Model not found" }); return; }
  res.set({ "Content-Type": "model/gltf-binary", "Cache-Control": "public, max-age=3600" })
    .send(furnitureGlbFor(item.category, item.defaultDims, query(req.query.wood) ?? item.woods[0], query(req.query.finish) ?? item.finishes[0]));
});

const productSchema = z.object({
  category: z.enum(CATEGORIES),
  name: z.string().trim().min(1).max(120), nameAr: z.string().trim().max(120).default(""),
  dimensions: z.object({ w: z.number().finite().min(10).max(600), d: z.number().finite().min(10).max(600), h: z.number().finite().min(10).max(600) }),
  woods: z.array(z.enum(WOODS)).min(1).max(4), finishes: z.array(z.enum(FINISHES)).min(1).max(4),
  imageUrl: z.string().max(2000).regex(/^\/(?:api\/)?uploads\/[a-f0-9-]+\.(?:jpg|png|webp|gif)$/).optional(),
});
productsRouter.post("/catalog/products", requireOwner, async (req, res) => {
  const data = productSchema.parse(req.body);
  const id = `custom-${randomUUID().slice(0, 8)}`;
  await db.prepare(`INSERT INTO catalog_products (id,owner_id,category,name,name_ar,w,d,h,woods_json,finishes_json,image_url,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, res.locals.ownerId, data.category, data.name, data.nameAr,
    data.dimensions.w, data.dimensions.d, data.dimensions.h, JSON.stringify([...new Set(data.woods)]),
    JSON.stringify([...new Set(data.finishes)]), data.imageUrl ?? null, new Date().toISOString());
  res.status(201).json(await findCatalogItem(id));
});
productsRouter.delete("/catalog/products/:id", requireOwner, async (req, res) => {
  const { changes } = await db.prepare("DELETE FROM catalog_products WHERE id=? AND owner_id=?").run(String(req.params.id), res.locals.ownerId);
  if (!changes) throw new ApiError(404, "Product not found.");
  res.json({ deleted: true });
});
