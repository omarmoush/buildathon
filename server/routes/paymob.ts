import { Router } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ApiError, db, money } from "../db";
import { paymobConfig, type PaymobConfig } from "../lib/paymob-config";
import { settleVerifiedPayment } from "./payments";
import type { Order, PaymentType } from "../../shared/contract";

export interface CheckoutResult { checkoutUrl: string; paymobRef: string }

const PAYMOB = "https://accept.paymob.com";
// Orders do not collect an email, but Paymob requires a valid one. `.invalid` can never receive mail.
const PLACEHOLDER_EMAIL = "buyer@wasta.invalid";

/**
 * Creates a Paymob Unified Checkout intention for the exact EGP amount.
 * `paymobRef` is Paymob's order id, which every transaction callback carries.
 * Fails explicitly when Paymob is not configured; never fabricates a checkout or success.
 */
export async function createCheckout(order: Order, type: PaymentType, amountEgp: number, baseUrl: string): Promise<CheckoutResult> {
  const config = paymobConfig();
  if (!config) throw new ApiError(503, "Payment checkout is unavailable: Paymob is not configured.", "PAYMENTS_UNAVAILABLE");
  const amountCents = Math.round(money(amountEgp) * 100);
  if (amountCents <= 0) throw new ApiError(409, "There is nothing to pay.");
  const [firstName, ...rest] = order.buyerName.trim().split(/\s+/);
  const label = type === "deposit" ? "Deposit" : "Balance";
  const response = await fetch(`${PAYMOB}/v1/intention/`, {
    method: "POST",
    headers: { Authorization: `Token ${config.secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: amountCents, currency: "EGP", payment_methods: [config.integrationId],
      items: [{ name: `${label} · ${order.spec.productType}`.slice(0, 50), amount: amountCents, description: `Akshab order ${order.id.slice(0, 8)}`, quantity: 1 }],
      billing_data: {
        first_name: firstName || "Buyer", last_name: rest.join(" ") || "NA",
        phone_number: order.buyerPhone || "NA", email: PLACEHOLDER_EMAIL, country: order.buyerCountry || "NA",
      },
      special_reference: `wasta-${type}-${order.id}-${Date.now()}`,
      notification_url: `${baseUrl}/api/paymob/webhook`,
      redirection_url: `${baseUrl}/api/b/${encodeURIComponent(order.token)}/payment-return`,
    }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  const data = await response?.json().catch(() => null) as { client_secret?: string; intention_order_id?: number; detail?: string } | null;
  if (!response?.ok || !data?.client_secret || !data.intention_order_id) {
    console.error("Paymob intention failed", response?.status, data?.detail ?? data);
    throw new ApiError(502, "The payment provider could not start checkout. No amount was collected.", "PAYMENT_PROVIDER_ERROR");
  }
  const checkoutUrl = `${PAYMOB}/unifiedcheckout/?publicKey=${encodeURIComponent(config.publicKey)}&clientSecret=${encodeURIComponent(data.client_secret)}`;
  return { checkoutUrl, paymobRef: String(data.intention_order_id) };
}

// Paymob's HMAC fields, in the order its docs require. `id` and `order` are read from
// obj.id / obj.order.id in POST callbacks and from id / order (or order_id) in redirect queries.
const HMAC_FIELDS = [
  "amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction", "id", "integration_id",
  "is_3d_secure", "is_auth", "is_capture", "is_refunded", "is_standalone_payment", "is_voided", "order", "owner",
  "pending", "source_data.pan", "source_data.sub_type", "source_data.type", "success",
] as const;
export type PaymobTransaction = Record<(typeof HMAC_FIELDS)[number], string>;

const text = (value: unknown) => value === undefined || value === null ? "" : String(value);

export function transactionFromCallback(obj: Record<string, any>): PaymobTransaction {
  const source = obj.source_data ?? {};
  const read = (field: string) => field === "order" ? (typeof obj.order === "object" ? obj.order?.id : obj.order)
    : field.startsWith("source_data.") ? source[field.slice("source_data.".length)] : obj[field];
  return Object.fromEntries(HMAC_FIELDS.map(field => [field, text(read(field))])) as PaymobTransaction;
}

export function transactionFromRedirect(query: Record<string, unknown>): PaymobTransaction {
  const read = (field: string) => field === "order" ? query.order ?? query.order_id : query[field];
  return Object.fromEntries(HMAC_FIELDS.map(field => [field, text(read(field))])) as PaymobTransaction;
}

export function signTransaction(transaction: PaymobTransaction, secret: string): string {
  return createHmac("sha512", secret).update(HMAC_FIELDS.map(field => transaction[field]).join("")).digest("hex");
}

export function verifyTransaction(transaction: PaymobTransaction, hmac: string, secret: string): boolean {
  const expected = Buffer.from(signTransaction(transaction, secret));
  const received = Buffer.from(hmac.toLowerCase());
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Settles a payment from an HMAC-verified transaction. Failed or pending attempts change nothing. */
export async function settleTransaction(transaction: PaymobTransaction, config: PaymobConfig): Promise<"paid" | "not_paid"> {
  const failed = (["error_occured", "pending", "is_voided", "is_refunded"] as const).some(field => transaction[field] === "true");
  if (transaction.success !== "true" || failed) return "not_paid";
  if (transaction.currency !== "EGP") throw new ApiError(400, "Unexpected payment currency.");
  if (Number(transaction.integration_id) !== config.integrationId) throw new ApiError(400, "Unexpected payment integration.");
  const payment = await db.prepare("SELECT id FROM payments WHERE paymob_ref=?").get(transaction.order) as { id: string } | undefined;
  if (!payment) throw new ApiError(404, "No checkout matches this Paymob order.");
  await settleVerifiedPayment(payment.id, transaction.order, Number(transaction.amount_cents) / 100);
  return "paid";
}

export const paymobRouter = Router();
paymobRouter.post("/paymob/webhook", async (req, res) => {
  const config = paymobConfig();
  if (!config) throw new ApiError(503, "No payment webhook provider is configured. No payment state was changed.", "PAYMENTS_UNAVAILABLE");
  // Paymob also sends TOKEN and other callback types; only transactions move money.
  if (req.body?.type !== "TRANSACTION" || typeof req.body?.obj !== "object") { res.json({ received: true, ignored: true }); return; }
  const transaction = transactionFromCallback(req.body.obj);
  if (!verifyTransaction(transaction, String(req.query.hmac ?? ""), config.hmacSecret))
    throw new ApiError(401, "Invalid Paymob signature. No payment state was changed.", "INVALID_SIGNATURE");
  res.json({ received: true, result: await settleTransaction(transaction, config) });
});
