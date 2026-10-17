import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  notificationsTable,
  orderImagesTable,
  ordersTable,
  paymentsTable,
  progressUpdatesTable,
  quotesTable,
  usersTable,
} from "@workspace/db";

export const FX_RATES_TO_EGP = {
  EGP: 1,
  SAR: 13.1,
  AED: 13.35,
  USD: 48.5,
} as const;

export type OrderStatus =
  | "draft"
  | "design_review"
  | "quoted"
  | "deposit_paid"
  | "in_production"
  | "ready"
  | "delivered"
  | "closed"
  | "cancelled"
  | "expired";

const transitions: Record<OrderStatus, OrderStatus[]> = {
  draft: ["design_review", "quoted", "cancelled"],
  design_review: ["quoted", "cancelled"],
  quoted: ["deposit_paid", "expired", "cancelled"],
  deposit_paid: ["in_production", "cancelled"],
  in_production: ["ready", "cancelled"],
  ready: ["delivered", "cancelled"],
  delivered: ["closed"],
  closed: [],
  cancelled: [],
  expired: [],
};

export function isOrderStatus(value: string): value is OrderStatus {
  return value in transitions;
}

export function assertTransition(current: string, next: OrderStatus): void {
  if (!isOrderStatus(current) || !transitions[current].includes(next)) {
    throw new Error(`Invalid order status transition: ${current} -> ${next}`);
  }
}

export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("20")) digits = `0${digits.slice(2)}`;
  return digits;
}

function hashPin(pin: string, salt = randomBytes(16).toString("hex")): string {
  return `${salt}:${scryptSync(pin, salt, 64).toString("hex")}`;
}

export function verifyPin(pin: string, storedHash: string): boolean {
  const [salt, expectedHex] = storedHash.split(":");
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(pin, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for owner sessions.");
  return secret;
}

export function createSession(ownerId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ ownerId, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 }),
  ).toString("base64url");
  const signature = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function getSessionOwnerId(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", sessionSecret()).update(payload).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      ownerId?: unknown;
      expiresAt?: unknown;
    };
    if (
      typeof parsed.ownerId !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Date.now()
    ) {
      return null;
    }
    return parsed.ownerId;
  } catch {
    return null;
  }
}

export async function ensureSeedData(): Promise<void> {
  const phone = "+201001234567";
  const existingOwner = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  const owner =
    existingOwner[0] ??
    (
      await db
        .insert(usersTable)
        .values({
          id: "owner-reda",
          name: "Reda",
          phone,
          role: "owner",
          pinHash: hashPin("1234"),
          language: "ar",
          workshopName: "Reda Furniture, Damietta",
        })
        .returning()
    )[0];
  const existingOrders = await db.select({ id: ordersTable.id }).from(ordersTable).limit(1);
  if (existingOrders.length) return;

  const now = Date.now();
  const orderRows = [
    {
      id: "demo-bedroom",
      buyerName: "Maha Al-Salem",
      buyerPhone: "+966501234567",
      buyerCountry: "Riyadh",
      title: "Bedroom set",
      description: "Walnut bedroom set with a king bed, two nightstands, and a dresser.",
      dimensions: "King bed 200 × 180 cm",
      status: "in_production",
    },
    {
      id: "demo-dining",
      buyerName: "Omar Hassan",
      buyerPhone: "+201112345678",
      buyerCountry: "Cairo",
      title: "Dining table + 6 chairs",
      description: "Solid oak dining table with six matching upholstered chairs.",
      dimensions: "Table 220 × 100 × 76 cm",
      status: "quoted",
    },
    {
      id: "demo-wardrobe",
      buyerName: "Noura Al-Ketbi",
      buyerPhone: "+971501234567",
      buyerCountry: "Dubai",
      title: "Wardrobe",
      description: "Three-door wardrobe with a hanging rail and adjustable shelves.",
      dimensions: "240 × 220 × 60 cm",
      status: "ready",
    },
  ] as const;

  for (const [index, row] of orderRows.entries()) {
    const orderId = row.id;
    const createdAt = new Date(now - (index + 2) * 24 * 60 * 60 * 1000);
    await db.insert(ordersTable).values({
      ...row,
      ownerId: owner.id,
      magicToken: randomBytes(32).toString("hex"),
      createdAt,
    });
    const materials = index === 0 ? 18000 : index === 1 ? 24000 : 17000;
    const labor = index === 0 ? 12000 : index === 1 ? 18000 : 11000;
    const margin = 20;
    const totalEgp = roundMoney((materials + labor) * (1 + margin / 100));
    const currency = index === 1 ? "SAR" : index === 2 ? "AED" : "SAR";
    const fx = FX_RATES_TO_EGP[currency];
    const totalDisplay = roundMoney(totalEgp / fx);
    const depositPercent = roundMoney((materials / totalEgp) * 100);
    const depositAmountDisplay = roundMoney((totalDisplay * depositPercent) / 100);
    await db.insert(quotesTable).values({
      id: randomUUID(),
      orderId,
      materialsCostEgp: materials,
      laborCostEgp: labor,
      marginPercent: margin,
      totalEgp,
      displayCurrency: currency,
      fxRateToEgp: fx,
      totalDisplay,
      depositPercent,
      depositAmountDisplay,
      expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
    });
    await db.insert(orderImagesTable).values({
      id: randomUUID(),
      orderId,
      url: `/api/uploads/demo-reference-${index + 1}.svg`,
      kind: "reference",
    });
    if (index === 0 || index === 2) {
      await db.insert(paymentsTable).values({
        id: randomUUID(),
        orderId,
        type: "deposit",
        amountDisplay: depositAmountDisplay,
        currency,
        amountEgp: roundMoney((depositAmountDisplay * fx)),
        state: "held",
        createdAt,
      });
    }
    const stages =
      index === 0
        ? [
            ["Cutting", "The walnut panels are cut and ready for assembly.", "/api/uploads/demo-progress-1.svg"],
            ["Assembly", "The bed frame and nightstands are taking shape.", "/api/uploads/demo-progress-2.svg"],
            ["Finishing", "Sanding and the first coat of finish are underway.", "/api/uploads/demo-progress-3.svg"],
          ]
        : index === 2
          ? [["Ready", "Your wardrobe is ready for delivery.", "/api/uploads/demo-progress-3.svg"]]
          : [];
    for (const [step, [stage, note, photoUrl]] of stages.entries()) {
      await db.insert(progressUpdatesTable).values({
        id: randomUUID(),
        orderId,
        stage,
        note,
        photoUrl,
        createdAt: new Date(now - (stages.length - step) * 24 * 60 * 60 * 1000),
      });
    }
    await addNotification(orderId, "Your order was created.", createdAt);
  }
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function addNotification(
  orderId: string,
  message: string,
  createdAt = new Date(),
): Promise<void> {
  await db.insert(notificationsTable).values([
    { id: randomUUID(), orderId, audience: "owner", message, createdAt },
    { id: randomUUID(), orderId, audience: "buyer", message, createdAt },
  ]);
}

export async function getOwner(ownerId: string) {
  const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, ownerId)).limit(1);
  return owner;
}

export async function getOrderRecord(orderId: string, ownerId?: string) {
  const whereClause = ownerId
    ? and(eq(ordersTable.id, orderId), eq(ordersTable.ownerId, ownerId))
    : eq(ordersTable.id, orderId);
  const [order] = await db.select().from(ordersTable).where(whereClause).limit(1);
  if (!order) return null;
  const [owner, images, quoteRows, payments, progress] = await Promise.all([
    getOwner(order.ownerId),
    db.select().from(orderImagesTable).where(eq(orderImagesTable.orderId, order.id)),
    db.select().from(quotesTable).where(eq(quotesTable.orderId, order.id)).limit(1),
    db.select().from(paymentsTable).where(eq(paymentsTable.orderId, order.id)).orderBy(desc(paymentsTable.createdAt)),
    db
      .select()
      .from(progressUpdatesTable)
      .where(eq(progressUpdatesTable.orderId, order.id))
      .orderBy(desc(progressUpdatesTable.createdAt)),
  ]);
  if (!owner) return null;
  const quote = quoteRows[0];
  return {
    ...order,
    ownerName: owner.name,
    ownerPhone: owner.phone,
    workshopName: owner.workshopName,
    createdAt: order.createdAt.toISOString(),
    designApprovedAt: order.designApprovedAt?.toISOString() ?? null,
    images: images.map((image) => ({ ...image, createdAt: image.createdAt.toISOString() })),
    quote: quote
      ? {
          ...quote,
          expiresAt: quote.expiresAt.toISOString(),
          approvedAt: quote.approvedAt?.toISOString() ?? null,
        }
      : null,
    payments: payments.map((payment) => ({ ...payment, createdAt: payment.createdAt.toISOString() })),
    progress: progress.map((update) => ({
      ...update,
      createdAt: update.createdAt.toISOString(),
    })),
  };
}

export async function getOrderByToken(token: string) {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.magicToken, token)).limit(1);
  if (!order) return null;
  if (order.status === "quoted") {
    const [quote] = await db.select().from(quotesTable).where(eq(quotesTable.orderId, order.id)).limit(1);
    if (quote && quote.expiresAt.getTime() <= Date.now()) {
      assertTransition(order.status, "expired");
      await db.update(ordersTable).set({ status: "expired" }).where(eq(ordersTable.id, order.id));
      await addNotification(order.id, "The quote expired before the deposit was paid.");
    }
  }
  return getOrderRecord(order.id);
}

export async function transitionOrder(
  orderId: string,
  ownerId: string,
  next: OrderStatus,
): Promise<boolean> {
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.ownerId, ownerId)))
    .limit(1);
  if (!order) return false;
  assertTransition(order.status, next);
  await db.update(ordersTable).set({ status: next }).where(eq(ordersTable.id, order.id));
  return true;
}

export async function getOwnerOrders(ownerId: string) {
  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.ownerId, ownerId))
    .orderBy(desc(ordersTable.createdAt));
  const results = await Promise.all(orders.map((order) => getOrderRecord(order.id, ownerId)));
  return results.filter((order): order is NonNullable<typeof order> => order !== null);
}

export async function getOwnerNotifications(ownerId: string) {
  const ownerOrders = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(eq(ordersTable.ownerId, ownerId));
  const orderIds = new Set(ownerOrders.map((order) => order.id));
  if (orderIds.size === 0) return [];
  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.audience, "owner"))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(40);
  return notifications
    .filter((notification) => orderIds.has(notification.orderId))
    .map((notification) => ({
      ...notification,
      createdAt: notification.createdAt.toISOString(),
    }));
}

export async function getDashboard(ownerId: string) {
  const [orders, notifications] = await Promise.all([
    getOwnerOrders(ownerId),
    getOwnerNotifications(ownerId),
  ]);
  const openStatuses = new Set<OrderStatus>([
    "draft",
    "design_review",
    "quoted",
    "deposit_paid",
    "in_production",
    "ready",
    "delivered",
  ]);
  let depositsCollectedEgp = 0;
  let balancesDueEgp = 0;
  for (const order of orders) {
    for (const payment of order.payments) {
      if (payment.type === "deposit" && payment.state !== "pending") {
        depositsCollectedEgp += payment.amountEgp;
      }
    }
    if (
      order.quote &&
      ["deposit_paid", "in_production", "ready", "delivered"].includes(order.status)
    ) {
      const paidEgp = order.payments
        .filter((payment) => payment.state !== "pending")
        .reduce((sum, payment) => sum + payment.amountEgp, 0);
      balancesDueEgp += Math.max(0, order.quote.totalEgp - paidEgp);
    }
  }
  return {
    openOrders: orders.filter((order) => openStatuses.has(order.status as OrderStatus)).length,
    depositsCollectedEgp: roundMoney(depositsCollectedEgp),
    balancesDueEgp: roundMoney(balancesDueEgp),
    orders,
    notifications,
  };
}

export async function findOwnerByPhone(phone: string) {
  const owners = await db.select().from(usersTable).where(eq(usersTable.role, "owner"));
  const normalized = normalizePhone(phone);
  return owners.find((owner) => normalizePhone(owner.phone) === normalized) ?? null;
}
