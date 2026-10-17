import { Router, type RequestHandler } from "express";
import { randomBytes, randomUUID, createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApiError, db, getOrder, listOrders, money, notifications, notify, transition } from "../db";
import type { OrderSpec } from "../../shared/contract";

export const ordersRouter = Router();
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) throw new Error("SESSION_SECRET is required for owner sessions.");
const sign = (payload: string) => createHmac("sha256", sessionSecret).update(payload).digest("base64url");
const safeEqual = (left: string, right: string) => {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
const ownerFromCookie = (cookie: unknown): string | null => {
  if (typeof cookie !== "string") return null;
  const [payload, signature] = cookie.split(".");
  if (!payload || !signature || !safeEqual(sign(payload), signature)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as { ownerId?: string; expiresAt?: number };
    return session.ownerId && (session.expiresAt ?? 0) > Date.now() ? session.ownerId : null;
  } catch { return null; }
};
export const requireOwner: RequestHandler = (req, res, next) => {
  const id = ownerFromCookie(req.cookies?.wasta_session);
  if (!id || !db.prepare("SELECT id FROM users WHERE id=?").get(id)) throw new ApiError(401, "Owner sign-in required.");
  res.locals.ownerId = id;
  next();
};
export function ownedOrder(id: string, ownerId: string) {
  const order = getOrder(id);
  if (order.ownerId !== ownerId) throw new ApiError(404, "Order not found.");
  return order;
}
const normalizePhone = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  return `+${digits.startsWith("0") ? `20${digits.slice(1)}` : digits}`;
};
const publicOwner = (id: string) => db.prepare(`SELECT id,name,phone,workshop_name workshopName,language
  FROM users WHERE id=?`).get(id);
// A bounded, per-IP window limits PIN guesses and public order creation.
const attempts = new Map<string, { count: number; until: number }>();
export function rateLimit(scope: string, limit: number, duration: number): RequestHandler {
  return (req, _res, next) => {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
    const key = `${scope}:${req.ip}`;
    const item = attempts.get(key) ?? { count: 0, until: now + duration };
    item.count++;
    attempts.set(key, item);
    if (item.count > limit) throw new ApiError(429, "Too many requests. Please try again later.");
    next();
  };
}
ordersRouter.post("/auth/login", rateLimit("login", 15, 15 * 60000), (req, res) => {
  const data = z.object({ phone: z.string().min(6), pin: z.string().regex(/^\d{4}$/) }).parse(req.body);
  const owner = db.prepare("SELECT id,pin_hash FROM users WHERE phone=?").get(normalizePhone(data.phone)) as { id: string; pin_hash: string } | undefined;
  const [salt, hash] = (owner?.pin_hash ?? "").split(":");
  if (!owner || !salt || !hash || !safeEqual(scryptSync(data.pin, salt, 64).toString("hex"), hash))
    throw new ApiError(401, "Phone number or PIN is incorrect.");
  const payload = Buffer.from(JSON.stringify({ ownerId: owner.id, expiresAt: Date.now() + 7 * 86400000 })).toString("base64url");
  res.cookie("wasta_session", `${payload}.${sign(payload)}`, {
    httpOnly: true, sameSite: "lax", secure: req.secure, path: "/", maxAge: 7 * 86400000,
  }).json(publicOwner(owner.id));
});
ordersRouter.get("/auth/session", requireOwner, (_req, res) => { res.json(publicOwner(res.locals.ownerId)); });
ordersRouter.post("/auth/logout", (_req, res) => { res.clearCookie("wasta_session", { path: "/" }).json({ message: "Signed out." }); });

const specSchema = z.object({
  productType: z.string().trim().min(1).max(200), style: z.array(z.string().max(100)).max(20).default([]),
  pieceSource: z.enum(["catalog", "customized", "generated"]),
  catalogItemId: z.string().max(200).optional(), prompt: z.string().max(10000).optional(),
  glbUrl: z.string().max(2000).optional(), usdzUrl: z.string().max(2000).optional(),
  thumbnailUrl: z.string().max(2000).optional(),
  dimensions: z.object({ w: z.number().positive().max(10000), d: z.number().positive().max(10000), h: z.number().positive().max(10000) }),
  wood: z.string().max(100).default(""), finish: z.string().max(100).default(""),
  budgetRange: z.string().max(200).default(""), deliveryCountry: z.string().max(100).default(""),
  deliveryCity: z.string().max(100).default(""), wantedBy: z.string().max(100).default(""),
  notes: z.string().max(10000).default(""),
});
ordersRouter.post("/orders", rateLimit("create-order", 40, 3600000), (req, res) => {
  const legacy = !req.body?.spec && typeof req.body?.title === "string";
  const body = legacy ? { ...req.body, spec: {
    productType: req.body.title, pieceSource: "customized", dimensions: { w: 1, d: 1, h: 1 },
    notes: req.body.description ?? "", deliveryCountry: req.body.buyerCountry,
  } } : req.body;
  const data = z.object({ buyerName: z.string().trim().min(1).max(200),
    buyerPhone: z.string().trim().min(6).max(40), buyerCountry: z.string().trim().min(1).max(100),
    spec: specSchema }).parse(body);
  const id = randomUUID(); const token = randomBytes(32).toString("hex");
  db.transaction(() => {
    db.prepare(`INSERT INTO orders (id,owner_id,buyer_name,buyer_phone,buyer_country,title,description,
      dimensions,spec_json,status,token,created_at) VALUES (?,?,?,?,?,?,?,?,?,'requested',?,?)`)
      .run(id, "reda", data.buyerName, data.buyerPhone, data.buyerCountry, data.spec.productType,
        data.spec.notes, legacy ? String(req.body.dimensions ?? "") :
          `${data.spec.dimensions.w} × ${data.spec.dimensions.d} × ${data.spec.dimensions.h} cm`,
        JSON.stringify(data.spec satisfies OrderSpec), token, new Date().toISOString());
    notify(id, "A new custom order was requested.");
    if (data.spec.thumbnailUrl) db.prepare("INSERT INTO order_images VALUES (?,?,?,?,?)")
      .run(randomUUID(), id, data.spec.thumbnailUrl, "reference", new Date().toISOString());
  })();
  res.status(201).json(legacy ? { ...getOrder(id), orderId: id, token } : { orderId: id, token });
});
ordersRouter.get("/orders", requireOwner, (_req, res) => { res.json(listOrders(res.locals.ownerId)); });
ordersRouter.get("/orders/:id", requireOwner, (req, res) => { res.json(ownedOrder(String(req.params.id), res.locals.ownerId)); });
ordersRouter.get(["/b/:token", "/buyer/:token"], (req, res) => { res.json(getOrder(String(req.params.token), true)); });
ordersRouter.post("/orders/:id/start-design", requireOwner, (req, res) => {
  const order = ownedOrder(String(req.params.id), res.locals.ownerId);
  db.transaction(() => {
    transition(order.id, "design_review", "The design is ready for buyer review.");
    if (order.spec.thumbnailUrl && !order.images.some(image => image.kind === "design"))
      db.prepare("INSERT INTO order_images VALUES (?,?,?,?,?)")
        .run(randomUUID(), order.id, order.spec.thumbnailUrl, "design", new Date().toISOString());
  })();
  res.json(getOrder(order.id));
});
ordersRouter.post("/orders/:id/images", requireOwner, (req, res) => {
  const order = ownedOrder(String(req.params.id), res.locals.ownerId);
  if (!["requested", "design_review"].includes(order.status)) throw new ApiError(409, "Order images are locked after quoting.");
  const data = z.object({ url: z.string().min(1).max(2000), kind: z.enum(["reference", "design"]) }).parse(req.body);
  if (data.kind === "design") throw new ApiError(400, "Use the design route to share a design.");
  db.prepare("INSERT INTO order_images VALUES (?,?,?,?,?)").run(randomUUID(), order.id, data.url, data.kind, new Date().toISOString());
  res.json(getOrder(order.id));
});
ordersRouter.post("/orders/:id/design", requireOwner, (req, res) => {
  const order = ownedOrder(String(req.params.id), res.locals.ownerId);
  const data = z.object({ imageUrl: z.string().min(1).max(2000), note: z.string().max(10000).default("") }).parse(req.body);
  if (!["requested", "design_review"].includes(order.status)) throw new ApiError(409, "The design is locked after quoting.");
  db.transaction(() => {
    db.prepare("INSERT INTO order_images VALUES (?,?,?,?,?)").run(randomUUID(), order.id, data.imageUrl, "design", new Date().toISOString());
    db.prepare("UPDATE orders SET design_approved=0,design_approved_at=NULL,design_change_note=NULL WHERE id=?").run(order.id);
    if (order.status === "requested") transition(order.id, "design_review", "A design is ready for buyer review.");
    else notify(order.id, "An updated design is ready for buyer review.");
    if (data.note) notify(order.id, `Workshop design note: ${data.note}`);
  })();
  res.json(getOrder(order.id));
});
function decideDesign(token: string, approved: boolean, comment = "") {
  const order = getOrder(token, true);
  if (order.status !== "design_review") throw new ApiError(409, "No design is waiting for review.");
  if (!approved && !comment.trim()) throw new ApiError(400, "Add a comment to request changes.");
  db.transaction(() => {
    db.prepare("UPDATE orders SET design_approved=?,design_approved_at=?,design_change_note=? WHERE id=?")
      .run(approved ? 1 : 0, approved ? new Date().toISOString() : null, approved ? null : comment.trim(), order.id);
    notify(order.id, approved ? "The buyer approved the design." : `The buyer requested changes: ${comment.trim()}`);
  })();
  return getOrder(order.id);
}
ordersRouter.post("/b/:token/approve-design", (req, res) => { res.json(decideDesign(String(req.params.token), true)); });
ordersRouter.post("/b/:token/request-changes", (req, res) => {
  const data = z.object({ comment: z.string().trim().min(1).max(10000) }).parse(req.body);
  res.json(decideDesign(String(req.params.token), false, data.comment));
});
ordersRouter.post("/buyer/:token/design-decision", (req, res) => {
  const data = z.object({ decision: z.enum(["approve", "request_changes"]), comment: z.string().max(10000).default("") }).parse(req.body);
  res.json(decideDesign(String(req.params.token), data.decision === "approve", data.comment));
});
ordersRouter.post("/orders/:id/progress", requireOwner, (req, res) => {
  const order = ownedOrder(String(req.params.id), res.locals.ownerId);
  if (!["deposit_paid", "in_production"].includes(order.status)) throw new ApiError(409, "A deposit must be paid before production updates.");
  const data = z.object({ stage: z.string().trim().min(1).max(100), note: z.string().max(10000).default(""),
    photoUrl: z.string().max(2000).nullable().optional() }).parse(req.body);
  db.transaction(() => {
    if (order.status === "deposit_paid") transition(order.id, "in_production", "Production has started.");
    db.prepare("INSERT INTO progress_updates VALUES (?,?,?,?,?,?)").run(randomUUID(), order.id, data.stage,
      data.note, data.photoUrl ?? null, new Date().toISOString());
    notify(order.id, `Progress posted: ${data.stage}.`);
  })();
  res.json(getOrder(order.id));
});
ordersRouter.post("/orders/:id/ready", requireOwner, (req, res) => {
  const order = ownedOrder(String(req.params.id), res.locals.ownerId);
  db.transaction(() => transition(order.id, "ready", "The order is ready for delivery."))();
  res.json(getOrder(order.id));
});
ordersRouter.get("/notifications", requireOwner, (_req, res) => { res.json(notifications(res.locals.ownerId)); });
ordersRouter.get("/dashboard", requireOwner, (_req, res) => {
  const orders = listOrders(res.locals.ownerId);
  res.json({
    openOrders: orders.filter(order => !["closed", "expired", "cancelled"].includes(order.status)).length,
    depositsCollectedEgp: money(orders.reduce((total, order) => total +
      order.payments.filter(payment => payment.type === "deposit" && payment.state !== "pending")
        .reduce((sum, payment) => sum + payment.amountEgp, 0), 0)),
    balancesDueEgp: money(orders.filter(order => ["deposit_paid", "in_production", "ready", "delivered"].includes(order.status))
      .reduce((total, order) => total + Math.max(0, (order.quote?.totalEgp ?? 0) -
        order.payments.filter(payment => payment.state !== "pending").reduce((sum, payment) => sum + payment.amountEgp, 0)), 0)),
    orders, notifications: notifications(res.locals.ownerId),
  });
});
