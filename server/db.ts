import { randomUUID } from "node:crypto";
import { paymentsEnabled } from "./lib/paymob-config";
import type { Database } from "./sql";
import type { Order, OrderStatus, OrderSpec, Quote, Payment, ProgressUpdate, OrderImage, Notification, FurnitureEstimate, OrderReview } from "../shared/contract";

export type { Database } from "./sql";
// Set at startup: better-sqlite3 locally (server/index.ts), D1 on Cloudflare (server/worker.ts).
const uninitialized = new Proxy({} as Database, {
  get() { throw new Error("Database not initialized: call useDatabase() at startup."); },
});
export let db: Database = uninitialized;
/** Selects the backend at startup; also used for isolated server tests. Never exposed over HTTP. */
export function useDatabase(connection: Database): void {
  if (db !== uninitialized) db.close();
  db = connection;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public code = "REQUEST_FAILED") { super(message); }
}
export const money = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const nextStatuses: Record<OrderStatus, OrderStatus[]> = {
  // An upfront deposit (paid on the saved estimate right after the quiz) moves a request straight to deposit_paid.
  requested: ["design_review", "deposit_paid", "cancelled"],
  design_review: ["quoted", "deposit_paid", "cancelled"], quoted: ["deposit_paid", "expired", "cancelled"],
  deposit_paid: ["in_production"], in_production: ["ready"],
  ready: ["delivered"], delivered: ["closed"], closed: [], expired: [], cancelled: [],
};
export function assertTransition(current: OrderStatus, next: OrderStatus): void {
  if (!nextStatuses[current]?.includes(next)) throw new ApiError(409, `Invalid order transition: ${current} -> ${next}`, "INVALID_TRANSITION");
}
/** What payments are charged against: the locked quote, or the saved estimate when the deposit is paid upfront. */
export function payableTotals(order: { quote: { totalEgp: number; depositEgp: number } | null; estimate?: FurnitureEstimate | null }) {
  const source = order.quote ?? order.estimate;
  return source && source.depositEgp > 0 ? { totalEgp: source.totalEgp, depositEgp: source.depositEgp, upfront: !order.quote } : null;
}
export async function notify(orderId: string, message: string): Promise<void> {
  const statement = db.prepare("INSERT INTO notifications VALUES (?,?,?,?,?)");
  const createdAt = new Date().toISOString();
  for (const audience of ["owner", "buyer"]) await statement.run(randomUUID(), orderId, audience, message, createdAt);
}
export async function transition(orderId: string, next: OrderStatus, message: string): Promise<void> {
  const row = await db.prepare("SELECT status FROM orders WHERE id=?").get<{ status: OrderStatus }>(orderId);
  if (!row) throw new ApiError(404, "Order not found.");
  assertTransition(row.status, next);
  await db.prepare("UPDATE orders SET status=? WHERE id=?").run(next, orderId);
  await notify(orderId, message);
}
type OrderRow = {
  id: string; owner_id: string; buyer_name: string; buyer_phone: string; buyer_country: string;
  title: string; description: string; dimensions: string; spec_json: string; status: OrderStatus;
  design_approved: number; design_approved_at: string | null; design_change_note: string | null;
  token: string; created_at: string; owner_name: string; owner_phone: string; workshop_name: string;
};
type QuoteRow = {
  materials_egp: number; labor_egp: number; margin_percent: number; total_egp: number;
  display_currency: Quote["displayCurrency"]; fx_rate: number; total_display: number;
  deposit_percent: number; deposit_egp: number; expires_at: string;
};
export async function getOrder(identifier: string, byToken = false) {
  const row = await db.prepare(`SELECT o.*, u.name owner_name, u.phone owner_phone, u.workshop_name
    FROM orders o JOIN users u ON u.id=o.owner_id WHERE o.${byToken ? "token" : "id"}=?`).get<OrderRow>(identifier);
  if (!row) throw new ApiError(404, "Order not found.");
  const qr = await db.prepare("SELECT * FROM quotes WHERE order_id=?").get<QuoteRow>(row.id);
  if (row.status === "quoted" && qr && Date.parse(qr.expires_at) <= Date.now()) {
    await db.transaction(() => transition(row.id, "expired", "The quote expired before the deposit was paid."));
    row.status = "expired";
  }
  const quote = qr ? {
    materialsEgp: qr.materials_egp, laborEgp: qr.labor_egp, marginPercent: qr.margin_percent,
    totalEgp: qr.total_egp, displayCurrency: qr.display_currency, fxRate: qr.fx_rate,
    totalDisplay: qr.total_display, depositPercent: qr.deposit_percent, depositEgp: qr.deposit_egp,
    expiresAt: qr.expires_at,
    // Read-only aliases keep the pre-existing demo UI usable during the team handoff.
    materialsCostEgp: qr.materials_egp, laborCostEgp: qr.labor_egp, fxRateToEgp: qr.fx_rate,
    depositAmountDisplay: money(qr.deposit_egp / qr.fx_rate), approvedAt: row.design_approved_at,
  } : null;
  const payments = await db.prepare(`SELECT id,order_id orderId,type,amount_egp amountEgp,state,
    paymob_ref paymobRef,created_at createdAt FROM payments WHERE order_id=? ORDER BY created_at,id`).all<Payment>(row.id);
  const updates = await db.prepare(`SELECT id,order_id orderId,stage,note,photo_url photoUrl,
    created_at createdAt FROM progress_updates WHERE order_id=? ORDER BY created_at,id`).all<ProgressUpdate>(row.id);
  const images = await db.prepare(`SELECT id,order_id orderId,url,kind,created_at createdAt FROM order_images
    WHERE order_id=? ORDER BY created_at,id`).all<OrderImage>(row.id);
  const estimateRow = await db.prepare("SELECT estimate_json FROM order_estimates WHERE order_id=?")
    .get<{ estimate_json: string }>(row.id);
  const estimate = estimateRow ? JSON.parse(estimateRow.estimate_json) as FurnitureEstimate : null;
  const hasDeposit = payments.some(payment => payment.type === "deposit" && payment.state !== "pending");
  const review = (await db.prepare(`SELECT phase,decision,note,reviewed_at reviewedAt FROM order_reviews
    WHERE order_id=? AND phase=?`).get<OrderReview>(row.id, hasDeposit ? "deposit" : "request")) ?? null;
  const result: Order = {
    id: row.id, ownerId: row.owner_id, buyerName: row.buyer_name, buyerPhone: row.buyer_phone,
    buyerCountry: row.buyer_country, spec: JSON.parse(row.spec_json) as OrderSpec,
    status: row.status, designApproved: !!row.design_approved, token: row.token, createdAt: row.created_at,
    quote, payments, updates, images, estimate, review,
  };
  return {
    ...result, quote, payments: payments.map(payment => ({
      ...payment, currency: qr?.display_currency ?? "EGP",
      amountDisplay: money(payment.amountEgp / (qr?.fx_rate ?? 1)),
    })),
    ownerName: row.owner_name, ownerPhone: row.owner_phone, workshopName: row.workshop_name,
    title: row.title, description: row.description, dimensions: row.dimensions, magicToken: row.token,
    designApprovedAt: row.design_approved_at, designChangeNote: row.design_change_note, progress: updates,
    paymentMode: paymentsEnabled() ? "live" as const : "unavailable" as const,
    depositReviewPending: row.status === "deposit_paid" && hasDeposit && review?.decision !== "accepted",
  };
}
export async function listOrders(ownerId = "reda") {
  const rows = await db.prepare("SELECT id FROM orders WHERE owner_id=? ORDER BY created_at DESC,id").all<{ id: string }>(ownerId);
  return Promise.all(rows.map(row => getOrder(row.id)));
}
export function notifications(ownerId = "reda"): Promise<Notification[]> {
  return db.prepare(`SELECT n.id,n.order_id orderId,n.audience,n.message,n.created_at createdAt
    FROM notifications n JOIN orders o ON o.id=n.order_id WHERE o.owner_id=? AND n.audience='owner'
    ORDER BY n.created_at DESC,n.rowid DESC LIMIT 30`).all<Notification>(ownerId);
}
