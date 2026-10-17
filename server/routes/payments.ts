import { Router, type Request } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError, db, getOrder, money, notify, transition } from "../db";
import { createCheckout, settleTransaction, transactionFromRedirect, verifyTransaction } from "./paymob";
import { paymobConfig } from "../lib/paymob-config";
import type { Payment, PaymentType } from "../../shared/contract";
export const paymentsRouter = Router();

// Where Paymob sends the buyer back and posts webhooks. Webhooks need a public HTTPS URL.
const publicBaseUrl = (req: Request) => (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");

async function requestCheckout(token: string, type: PaymentType, baseUrl: string) {
  const order = await getOrder(token, true);
  if (!order.quote) throw new ApiError(409, "The order has no quote.");
  const expected = type === "deposit" ? "quoted" : "ready";
  if (order.status !== expected) throw new ApiError(409, `A ${type} payment is not allowed in ${order.status}.`);
  const existing = order.payments.find(payment => payment.type === type);
  if (existing) throw new ApiError(409, existing.state === "pending" ? "A checkout is already pending." : "This payment has already been received.");
  if (type === "balance" && !order.payments.some(payment => payment.type === "deposit" && payment.state === "held"))
    throw new ApiError(409, "A held deposit is required before balance payment.");
  const amountEgp = type === "deposit" ? order.quote.depositEgp : money(order.quote.totalEgp - order.quote.depositEgp);
  // The adapter must succeed before any pending payment is recorded.
  const checkout = await createCheckout(order, type, amountEgp, baseUrl);
  await db.prepare("INSERT INTO payments VALUES (?,?,?,?,?,?,?)").run(randomUUID(), order.id, type, amountEgp,
    "pending", checkout.paymobRef, new Date().toISOString());
  return { checkoutUrl: checkout.checkoutUrl };
}
paymentsRouter.post("/b/:token/pay", async (req, res) => {
  const input = z.object({ type: z.enum(["deposit", "balance"]) }).parse(req.body);
  res.json(await requestCheckout(String(req.params.token), input.type, publicBaseUrl(req)));
});
paymentsRouter.post(["/b/:token/confirm-delivery", "/buyer/:token/delivery"], async (req, res) => {
  res.json(await requestCheckout(String(req.params.token), "balance", publicBaseUrl(req)));
});
paymentsRouter.post("/buyer/:token/deposit", async (req, res) => {
  res.json(await requestCheckout(String(req.params.token), "deposit", publicBaseUrl(req)));
});
paymentsRouter.get("/b/:token/payment-return", async (req, res) => {
  const token = String(req.params.token);
  await getOrder(token, true);
  // A redirect alone is not proof of payment. Paymob signs its redirect with the same HMAC
  // as its webhook, so only a verified signature may settle here (this also works locally,
  // where Paymob cannot reach the webhook).
  const config = paymobConfig();
  const hmac = typeof req.query.hmac === "string" ? req.query.hmac : "";
  if (config && hmac) {
    const transaction = transactionFromRedirect(req.query as Record<string, unknown>);
    if (verifyTransaction(transaction, hmac, config.hmacSecret)) {
      try { await settleTransaction(transaction, config); } catch (error) { req.log.warn({ err: error }, "Verified Paymob redirect could not settle"); }
    } else req.log.warn("Ignored Paymob redirect with an invalid signature");
  }
  const order = await getOrder(token, true);
  const paid = order.payments.some(payment => payment.state !== "pending");
  res.redirect(303, `/b/${encodeURIComponent(order.token)}?payment=${order.status === "closed" ? "complete" : paid ? "received" : "pending"}`);
});

/**
 * Internal-only settlement boundary. The Paymob adapter (routes/paymob.ts) verifies the
 * HMAC signature, success flags, currency and integration before calling; this re-checks
 * the reference and EGP amount against the locked quote.
 * There is deliberately no public "mark paid" route or HMAC bypass.
 */
export async function settleVerifiedPayment(paymentId: string, verifiedReference: string, amountEgp: number): Promise<void> {
  await db.transaction(async () => {
    const payment = await db.prepare(`SELECT id,order_id orderId,type,amount_egp amountEgp,state,paymob_ref paymobRef,
      created_at createdAt FROM payments WHERE id=?`).get(paymentId) as Payment | undefined;
    if (!payment) throw new ApiError(404, "Payment not found.");
    if (!verifiedReference || payment.paymobRef !== verifiedReference || money(amountEgp) !== payment.amountEgp)
      throw new ApiError(400, "Payment verification does not match the expected charge.");
    if (payment.state !== "pending") return; // Idempotent duplicate delivery of the same verified event.
    const order = await getOrder(payment.orderId);
    if (!order.quote) throw new ApiError(409, "The order has no payable quote.");
    const expectedAmount = payment.type === "deposit" ? order.quote.depositEgp : money(order.quote.totalEgp - order.quote.depositEgp);
    if (payment.amountEgp !== expectedAmount) throw new ApiError(400, "Payment amount does not match the locked quote.");
    if (payment.type === "deposit") {
      if (order.status !== "quoted") throw new ApiError(409, "The order cannot receive a deposit now.");
      await db.prepare("UPDATE payments SET state='held' WHERE id=?").run(payment.id);
      await transition(order.id, "deposit_paid", "The verified deposit was received and is recorded as held.");
    } else {
      if (order.status !== "ready") throw new ApiError(409, "Delivery is not ready to be confirmed.");
      if (!order.payments.some(item => item.type === "deposit" && item.state === "held"))
        throw new ApiError(409, "A verified held deposit is required.");
      await db.prepare("UPDATE payments SET state='released' WHERE order_id=?").run(order.id);
      await transition(order.id, "delivered", "The buyer confirmed delivery and the balance was received.");
      await transition(order.id, "closed", "The order is closed and payment records are marked released.");
      await notify(order.id, "Payment state labels are bookkeeping only, not a claim of provider escrow.");
    }
  });
}
