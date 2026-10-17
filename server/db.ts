import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { Order, OrderStatus, OrderSpec, Quote, Payment, ProgressUpdate, OrderImage, Notification } from "../shared/contract";

// Both index.ts and bundled dist/index.js resolve to the same server directory.
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const serverDirectory = path.basename(moduleDirectory) === "dist" ? path.dirname(moduleDirectory) : moduleDirectory;
export const projectDirectory = path.dirname(serverDirectory);
export const uploadDirectory = path.join(projectDirectory, "uploads");
export const sqlitePath = path.join(serverDirectory, "data", "wasta.sqlite");
mkdirSync(path.dirname(sqlitePath), { recursive: true });
mkdirSync(uploadDirectory, { recursive: true });

export function createDatabase(filename: string): Database.Database {
  const connection = new Database(filename);
  connection.pragma("foreign_keys = ON");
  connection.pragma("journal_mode = WAL");
  connection.pragma("busy_timeout = 5000");
  connection.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL DEFAULT 'owner', pin_hash TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'ar', workshop_name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id),
      buyer_name TEXT NOT NULL, buyer_phone TEXT NOT NULL, buyer_country TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', dimensions TEXT NOT NULL DEFAULT '',
      spec_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN
        ('requested','design_review','quoted','deposit_paid','in_production','ready','delivered','closed','cancelled','expired')),
      design_approved INTEGER NOT NULL DEFAULT 0 CHECK(design_approved IN (0,1)),
      design_approved_at TEXT, design_change_note TEXT, token TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY, order_id TEXT UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      materials_egp REAL NOT NULL CHECK(materials_egp >= 0), labor_egp REAL NOT NULL CHECK(labor_egp >= 0),
      margin_percent REAL NOT NULL CHECK(margin_percent >= 0), total_egp REAL NOT NULL CHECK(total_egp > 0),
      display_currency TEXT NOT NULL, fx_rate REAL NOT NULL CHECK(fx_rate > 0), total_display REAL NOT NULL,
      deposit_percent REAL NOT NULL CHECK(deposit_percent > 0 AND deposit_percent <= 1),
      deposit_egp REAL NOT NULL, expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('deposit','balance')), amount_egp REAL NOT NULL CHECK(amount_egp >= 0),
      state TEXT NOT NULL CHECK(state IN ('pending','held','released')),
      paymob_ref TEXT UNIQUE, created_at TEXT NOT NULL, UNIQUE(order_id,type)
    );
    CREATE TABLE IF NOT EXISTS progress_updates (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      stage TEXT NOT NULL, note TEXT NOT NULL, photo_url TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS order_images (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      url TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('reference','design')), created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      audience TEXT NOT NULL CHECK(audience IN ('owner','buyer')), message TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS orders_owner_created ON orders(owner_id,created_at);
    CREATE INDEX IF NOT EXISTS progress_order ON progress_updates(order_id,created_at);
    CREATE INDEX IF NOT EXISTS notifications_created ON notifications(created_at);
  `);
  return connection;
}
export let db = createDatabase(sqlitePath);
/** Dependency injection for isolated server tests; never exposed over HTTP. */
export function useDatabase(connection: Database.Database): void { db.close(); db = connection; }

export class ApiError extends Error {
  constructor(public status: number, message: string, public code = "REQUEST_FAILED") { super(message); }
}
export const money = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const nextStatuses: Record<OrderStatus, OrderStatus[]> = {
  requested: ["design_review", "cancelled"],
  design_review: ["quoted", "cancelled"], quoted: ["deposit_paid", "expired", "cancelled"],
  deposit_paid: ["in_production"], in_production: ["ready"],
  ready: ["delivered"], delivered: ["closed"], closed: [], expired: [], cancelled: [],
};
export function assertTransition(current: OrderStatus, next: OrderStatus): void {
  if (!nextStatuses[current]?.includes(next)) throw new ApiError(409, `Invalid order transition: ${current} -> ${next}`, "INVALID_TRANSITION");
}
export function notify(orderId: string, message: string): void {
  const statement = db.prepare("INSERT INTO notifications VALUES (?,?,?,?,?)");
  const createdAt = new Date().toISOString();
  for (const audience of ["owner", "buyer"]) statement.run(randomUUID(), orderId, audience, message, createdAt);
}
export function transition(orderId: string, next: OrderStatus, message: string): void {
  const row = db.prepare("SELECT status FROM orders WHERE id=?").get(orderId) as { status: OrderStatus } | undefined;
  if (!row) throw new ApiError(404, "Order not found.");
  assertTransition(row.status, next);
  db.prepare("UPDATE orders SET status=? WHERE id=?").run(next, orderId);
  notify(orderId, message);
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
export function getOrder(identifier: string, byToken = false) {
  const row = db.prepare(`SELECT o.*, u.name owner_name, u.phone owner_phone, u.workshop_name
    FROM orders o JOIN users u ON u.id=o.owner_id WHERE o.${byToken ? "token" : "id"}=?`).get(identifier) as OrderRow | undefined;
  if (!row) throw new ApiError(404, "Order not found.");
  const qr = db.prepare("SELECT * FROM quotes WHERE order_id=?").get(row.id) as QuoteRow | undefined;
  if (row.status === "quoted" && qr && Date.parse(qr.expires_at) <= Date.now()) {
    db.transaction(() => transition(row.id, "expired", "The quote expired before the deposit was paid."))();
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
  const payments = db.prepare(`SELECT id,order_id orderId,type,amount_egp amountEgp,state,
    paymob_ref paymobRef,created_at createdAt FROM payments WHERE order_id=? ORDER BY created_at,id`).all(row.id) as Payment[];
  const updates = db.prepare(`SELECT id,order_id orderId,stage,note,photo_url photoUrl,
    created_at createdAt FROM progress_updates WHERE order_id=? ORDER BY created_at,id`).all(row.id) as ProgressUpdate[];
  const images = db.prepare(`SELECT id,order_id orderId,url,kind,created_at createdAt FROM order_images
    WHERE order_id=? ORDER BY created_at,id`).all(row.id) as OrderImage[];
  const result: Order = {
    id: row.id, ownerId: row.owner_id, buyerName: row.buyer_name, buyerPhone: row.buyer_phone,
    buyerCountry: row.buyer_country, spec: JSON.parse(row.spec_json) as OrderSpec,
    status: row.status, designApproved: !!row.design_approved, token: row.token, createdAt: row.created_at,
    quote, payments, updates, images,
  };
  return {
    ...result, quote, payments: payments.map(payment => ({
      ...payment, currency: qr?.display_currency ?? "EGP",
      amountDisplay: money(payment.amountEgp / (qr?.fx_rate ?? 1)),
    })),
    ownerName: row.owner_name, ownerPhone: row.owner_phone, workshopName: row.workshop_name,
    title: row.title, description: row.description, dimensions: row.dimensions, magicToken: row.token,
    designApprovedAt: row.design_approved_at, designChangeNote: row.design_change_note, progress: updates,
  };
}
export function listOrders(ownerId = "reda") {
  return (db.prepare("SELECT id FROM orders WHERE owner_id=? ORDER BY created_at DESC,id").all(ownerId) as { id: string }[])
    .map(row => getOrder(row.id));
}
export function notifications(ownerId = "reda"): Notification[] {
  return db.prepare(`SELECT n.id,n.order_id orderId,n.audience,n.message,n.created_at createdAt
    FROM notifications n JOIN orders o ON o.id=n.order_id WHERE o.owner_id=? AND n.audience='owner'
    ORDER BY n.created_at DESC,n.rowid DESC LIMIT 30`).all(ownerId) as Notification[];
}
