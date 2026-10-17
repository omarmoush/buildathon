import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError, db, getOrder, money, transition } from "../db";
import { ownedOrder, requireOwner } from "./orders";
export const quotesRouter = Router();
const schema = z.object({
  materialsEgp: z.number().finite().nonnegative().max(100000000),
  laborEgp: z.number().finite().nonnegative().max(100000000),
  marginPercent: z.number().finite().min(0).max(1000),
  displayCurrency: z.enum(["EGP", "SAR", "AED", "USD"]),
  fxRate: z.number().finite().positive().max(1000000),
  expiresAt: z.string().refine(value => Number.isFinite(Date.parse(value)) && Date.parse(value) > Date.now(), "Expiry must be in the future."),
  depositPercent: z.number().finite().positive().max(1).optional(),
});
quotesRouter.post("/orders/:id/quote", requireOwner, async (req, res) => {
  const order = await ownedOrder(String(req.params.id), res.locals.ownerId);
  const body = req.body ?? {};
  const data = schema.parse({ ...body,
    materialsEgp: body.materialsEgp ?? body.materialsCostEgp,
    laborEgp: body.laborEgp ?? body.laborCostEgp,
    fxRate: body.fxRate ?? body.fxRateToEgp,
  });
  if (!order.designApproved || order.status !== "design_review") throw new ApiError(409, "The buyer must approve the design before quoting.");
  if (order.review?.decision === "changes_requested") throw new ApiError(409, "Accept the workshop review before sending a final quote.");
  if (order.quote) throw new ApiError(409, "Quotes are locked and cannot be overwritten.");
  if (order.payments.some(payment => payment.type === "deposit"))
    throw new ApiError(409, "The buyer already started paying the deposit on the estimate.");
  if (data.displayCurrency === "EGP" && data.fxRate !== 1) throw new ApiError(400, "The EGP exchange rate must be 1.");
  const totalEgp = money((data.materialsEgp + data.laborEgp) * (1 + data.marginPercent / 100));
  if (totalEgp <= 0) throw new ApiError(400, "Quote total must be positive.");
  const depositPercent = data.depositPercent ?? data.materialsEgp / totalEgp;
  const depositEgp = money(totalEgp * depositPercent);
  if (depositEgp <= 0 || depositPercent > 1) throw new ApiError(400, "The deposit must be greater than zero and no more than the total.");
  await db.transaction(async () => {
    await db.prepare("INSERT INTO quotes VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(randomUUID(), order.id,
      data.materialsEgp, data.laborEgp, data.marginPercent, totalEgp, data.displayCurrency, data.fxRate,
      money(totalEgp / data.fxRate), depositPercent, depositEgp, new Date(data.expiresAt).toISOString());
    await transition(order.id, "quoted", "The locked quote is ready for the buyer.");
  });
  res.json(await getOrder(order.id));
});
