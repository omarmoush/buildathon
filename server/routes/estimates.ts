import { Router } from "express";
import { z } from "zod";
import { ApiError, db, getOrder, money, notify, transition } from "../db";
import { ownedOrder, rateLimit, requireOwner } from "./orders";
import { calculateEstimate } from "../lib/estimates";
import type { FurnitureEstimate } from "../../shared/contract";

export const estimatesRouter = Router();
const previewSchema = z.object({
  spec: z.object({
    productType: z.enum(["bedroom-set", "dining-set", "living-room", "wardrobe", "other"]),
    pieceSource: z.enum(["catalog", "customized", "generated"]),
    catalogItemId: z.string().max(200).optional(),
    dimensions: z.object({ w: z.number().finite().min(10).max(600), d: z.number().finite().min(10).max(600), h: z.number().finite().min(10).max(600) }),
    wood: z.string().max(100).optional(), finish: z.string().max(100).optional(),
    bedroomPieces: z.array(z.enum(["bed", "nightstands", "wardrobe", "dresser"])).min(1).max(4).optional(),
  }),
});
estimatesRouter.post("/estimates", rateLimit("estimates", 120, 60000), async (req, res) => {
  const { spec } = previewSchema.parse(req.body);
  res.setHeader("Cache-Control", "no-store");
  res.json(calculateEstimate(spec));
});

// An indicative estimate is editable until a final quote is sent. It never
// modifies a locked quote, payment amount, approval or provider state.
estimatesRouter.post("/orders/:id/estimate", requireOwner, async (req, res) => {
  const order = await ownedOrder(String(req.params.id), res.locals.ownerId);
  if (!["requested", "design_review"].includes(order.status) || order.quote)
    throw new ApiError(409, "An estimate cannot change after a final quote or payment.");
  const body = req.body ?? {};
  const data = z.object({
    materialsEgp: z.number().finite().nonnegative().max(100000000),
    laborEgp: z.number().finite().nonnegative().max(100000000),
    marginPercent: z.number().finite().min(0).max(1000),
    depositPercent: z.number().finite().positive().max(1).default(.5),
  }).parse({ ...body, materialsEgp: body.materialsEgp ?? body.materialsCostEgp,
    laborEgp: body.laborEgp ?? body.laborCostEgp });
  const totalEgp = money((data.materialsEgp + data.laborEgp) * (1 + data.marginPercent / 100));
  if (totalEgp <= 0) throw new ApiError(400, "Estimate total must be positive.");
  const estimate: FurnitureEstimate = { ...calculateEstimate(order.spec), ...data, totalEgp,
    lowEgp: totalEgp, highEgp: totalEgp, depositEgp: money(totalEgp * data.depositPercent),
    pricingVersion: "workshop-estimate", createdAt: new Date().toISOString(),
    items: [{ key: "workshop", label: "Workshop furniture estimate", labelAr: "تقدير الورشة للأثاث", quantity: 1, amountEgp: totalEgp }] };
  await db.transaction(async () => {
    await db.prepare(`INSERT INTO order_estimates (order_id,estimate_json) VALUES (?,?)
      ON CONFLICT(order_id) DO UPDATE SET estimate_json=excluded.estimate_json`).run(order.id, JSON.stringify(estimate));
    await notify(order.id, "The workshop updated the indicative estimate. A final approved quote is still required before any payment.");
  });
  res.json(await getOrder(order.id));
});

estimatesRouter.post("/orders/:id/review", requireOwner, async (req, res) => {
  const order = await ownedOrder(String(req.params.id), res.locals.ownerId);
  if (!["requested", "design_review", "deposit_paid"].includes(order.status))
    throw new ApiError(409, "This order is not awaiting workshop review.");
  const data = z.object({
    decision: z.enum(["accepted", "changes_requested"]), note: z.string().trim().max(2000).default(""),
  }).parse(req.body);
  if (data.decision === "changes_requested" && !data.note)
    throw new ApiError(400, "Describe the changes needed.", "REVIEW_NOTE_REQUIRED");
  const phase = order.status === "deposit_paid" ? "deposit" : "request";
  if (phase === "deposit" && !order.payments.some(payment => payment.type === "deposit" && payment.state !== "pending"))
    throw new ApiError(409, "A verified deposit is required for deposit review.");
  await db.transaction(async () => {
    const current = order.review;
    if (current?.decision === data.decision && current.note === data.note) return;
    await db.prepare(`INSERT INTO order_reviews (order_id,phase,decision,note,reviewed_at) VALUES (?,?,?,?,?)
      ON CONFLICT(order_id,phase) DO UPDATE SET decision=excluded.decision,note=excluded.note,reviewed_at=excluded.reviewed_at`)
      .run(order.id, phase, data.decision, data.note, new Date().toISOString());
    if (data.decision === "accepted" && order.status === "requested")
      await transition(order.id, "design_review", "The workshop accepted the request. The buyer can review the selected design.");
    if (phase === "request" && data.decision === "changes_requested")
      await db.prepare("UPDATE orders SET design_approved=0,design_approved_at=NULL WHERE id=?").run(order.id);
    await notify(order.id, `Workshop ${phase} review: ${data.decision === "accepted" ? "accepted" : "changes requested"}.${data.note ? ` ${data.note}` : ""}`);
  });
  res.json(await getOrder(order.id));
});
