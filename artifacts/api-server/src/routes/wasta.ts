import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import {
  AddOrderImageBody,
  AddOrderImageParams,
  AddOrderImageResponse,
  ConfirmDeliveryBody,
  ConfirmDeliveryParams,
  ConfirmDeliveryResponse,
  CreateOrderBody,
  CreateOrderResponse,
  DecideOnDesignBody,
  DecideOnDesignParams,
  DecideOnDesignResponse,
  GetBuyerOrderParams,
  GetBuyerOrderResponse,
  GetDashboardResponse,
  GetOrderParams,
  GetOrderResponse,
  GetOwnerSessionResponse,
  ListNotificationsResponse,
  ListOrdersResponse,
  LoginOwnerBody,
  LoginOwnerResponse,
  LogoutOwnerResponse,
  MarkOrderReadyParams,
  MarkOrderReadyResponse,
  PayDepositBody,
  PayDepositParams,
  PayDepositResponse,
  PostProgressBody,
  PostProgressParams,
  PostProgressResponse,
  SaveQuoteBody,
  SaveQuoteParams,
  SaveQuoteResponse,
  SubmitDesignBody,
  SubmitDesignParams,
  SubmitDesignResponse,
  UploadImageBody,
  UploadImageResponse,
} from "@workspace/api-zod";
import {
  db,
  orderImagesTable,
  ordersTable,
  paymentsTable,
  progressUpdatesTable,
  quotesTable,
} from "@workspace/db";
import { Router, type IRouter, type Request, type RequestHandler } from "express";
import {
  addNotification,
  assertTransition,
  createSession,
  findOwnerByPhone,
  getDashboard,
  getOrderByToken,
  getOrderRecord,
  getOwner,
  getOwnerNotifications,
  getOwnerOrders,
  getSessionOwnerId,
  roundMoney,
  verifyPin,
} from "../lib/wasta";
import { getLocalUploadsDirectory } from "../lib/upload-path";
import { simulatedPaymentProvider, type PaymentCurrency } from "../lib/payments";

type AuthenticatedRequest = Request & { ownerId?: string };

function authenticatedOwnerId(req: Request): string {
  return (req as AuthenticatedRequest).ownerId!;
}

function validationMessage<T, U>(
  params: { success: boolean; error?: { message: string } },
  body: { success: boolean; error?: { message: string } },
): string | null {
  return params.error?.message ?? body.error?.message ?? null;
}

function paymentCurrency(value: string): PaymentCurrency {
  if (value === "EGP" || value === "SAR" || value === "AED" || value === "USD") {
    return value;
  }
  throw new Error("Unsupported payment currency.");
}

const router: IRouter = Router();
const cookieName = "wasta_session";
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
const requireOwner: RequestHandler = (req, res, next) => {
  const ownerId = getSessionOwnerId(req.cookies?.[cookieName]);
  if (!ownerId) {
    res.status(401).json({ error: "Please sign in to your workshop account." });
    return;
  }
  (req as AuthenticatedRequest).ownerId = ownerId;
  next();
};

function badRequest(res: Parameters<RequestHandler>[1], message: string): void {
  res.status(400).json({ error: message });
}

function conflict(res: Parameters<RequestHandler>[1], message: string): void {
  res.status(409).json({ error: message });
}

function ownerOrderId(req: Request): string {
  const params = GetOrderParams.safeParse(req.params);
  return params.success ? params.data.id : "";
}

async function orderForOwner(orderId: string, ownerId: string) {
  return getOrderRecord(orderId, ownerId);
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginOwnerBody.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error.message);
    return;
  }
  const owner = await findOwnerByPhone(parsed.data.phone);
  if (!owner || !verifyPin(parsed.data.pin, owner.pinHash)) {
    res.status(401).json({ error: "The phone number or PIN is incorrect." });
    return;
  }
  res.cookie(cookieName, createSession(owner.id), cookieOptions);
  res.json(
    LoginOwnerResponse.parse({
      id: owner.id,
      name: owner.name,
      phone: owner.phone,
      workshopName: owner.workshopName,
      language: owner.language,
    }),
  );
});

router.get("/auth/session", requireOwner, async (req, res): Promise<void> => {
  const owner = await getOwner(authenticatedOwnerId(req));
  if (!owner) {
    res.clearCookie(cookieName, cookieOptions);
    res.status(401).json({ error: "Owner account not found." });
    return;
  }
  res.json(
    GetOwnerSessionResponse.parse({
      id: owner.id,
      name: owner.name,
      phone: owner.phone,
      workshopName: owner.workshopName,
      language: owner.language,
    }),
  );
});

router.post("/auth/logout", (_req, res): void => {
  res.clearCookie(cookieName, cookieOptions);
  res.json(LogoutOwnerResponse.parse({ message: "Signed out." }));
});

router.get("/dashboard", requireOwner, async (req, res): Promise<void> => {
  res.json(GetDashboardResponse.parse(await getDashboard(authenticatedOwnerId(req))));
});

router.get("/orders", requireOwner, async (req, res): Promise<void> => {
  res.json(ListOrdersResponse.parse(await getOwnerOrders(authenticatedOwnerId(req))));
});

router.post("/orders", requireOwner, async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error.message);
    return;
  }
  const orderId = randomUUID();
  await db.insert(ordersTable).values({
    id: orderId,
    ownerId: authenticatedOwnerId(req),
    ...parsed.data,
    status: "draft",
    magicToken: randomBytes(32).toString("hex"),
  });
  await addNotification(orderId, "A new custom order was created.");
  const order = await orderForOwner(orderId, authenticatedOwnerId(req));
  res.status(201).json(CreateOrderResponse.parse(order));
});

router.post("/uploads", requireOwner, async (req, res): Promise<void> => {
  const parsed = UploadImageBody.safeParse(req.body);
  if (!parsed.success) {
    badRequest(res, parsed.error.message);
    return;
  }
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(
    parsed.data.dataUrl,
  );
  if (!match) {
    badRequest(res, "Upload a JPEG, PNG, WebP, or GIF image.");
    return;
  }
  const extensionByMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > 8 * 1024 * 1024) {
    badRequest(res, "Images must be smaller than 8 MB.");
    return;
  }
  const directory = getLocalUploadsDirectory();
  await mkdir(directory, { recursive: true });
  const fileName = `${randomUUID()}.${extensionByMime[match[1]]}`;
  await writeFile(path.join(directory, fileName), bytes, { flag: "wx" });
  res.status(201).json(UploadImageResponse.parse({ url: `/api/uploads/${fileName}` }));
});

router.get("/orders/:id", requireOwner, async (req, res): Promise<void> => {
  const id = ownerOrderId(req);
  if (!id) {
    badRequest(res, "Invalid order ID.");
    return;
  }
  const order = await orderForOwner(id, authenticatedOwnerId(req));
  if (!order) {
    res.status(404).json({ error: "Order not found." });
    return;
  }
  res.json(GetOrderResponse.parse(order));
});

router.post("/orders/:id/images", requireOwner, async (req, res): Promise<void> => {
  const params = AddOrderImageParams.safeParse(req.params);
  const parsed = AddOrderImageBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    badRequest(res, validationMessage(params, parsed) ?? "Invalid request.");
    return;
  }
  const order = await orderForOwner(params.data.id, authenticatedOwnerId(req));
  if (!order) {
    res.status(404).json({ error: "Order not found." });
    return;
  }
  const [image] = await db
    .insert(orderImagesTable)
    .values({ id: randomUUID(), orderId: order.id, ...parsed.data })
    .returning();
  res.status(201).json(
    AddOrderImageResponse.parse({
      ...image,
      createdAt: image.createdAt.toISOString(),
    }),
  );
});

router.post("/orders/:id/design", requireOwner, async (req, res): Promise<void> => {
  const params = SubmitDesignParams.safeParse(req.params);
  const parsed = SubmitDesignBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    badRequest(res, validationMessage(params, parsed) ?? "Invalid request.");
    return;
  }
  const order = await orderForOwner(params.data.id, authenticatedOwnerId(req));
  if (!order) {
    res.status(404).json({ error: "Order not found." });
    return;
  }
  if (!["draft", "design_review"].includes(order.status)) {
    conflict(res, "A design can only be shared before the quote is paid.");
    return;
  }
  if (parsed.data.note.trim()) {
    await addNotification(order.id, `A design or sketch is ready for buyer review: ${parsed.data.note.trim()}`);
  } else {
    await addNotification(order.id, "A design or sketch is ready for buyer review.");
  }
  await db.insert(orderImagesTable).values({
    id: randomUUID(),
    orderId: order.id,
    url: parsed.data.imageUrl,
    kind: "design",
  });
  await db
    .update(ordersTable)
    .set({
      status: order.status === "draft" ? "design_review" : order.status,
      designApprovedAt: null,
      designChangeNote: null,
    })
    .where(eq(ordersTable.id, order.id));
  const updated = await orderForOwner(order.id, authenticatedOwnerId(req));
  res.json(SubmitDesignResponse.parse(updated));
});

router.post("/orders/:id/quote", requireOwner, async (req, res): Promise<void> => {
  const params = SaveQuoteParams.safeParse(req.params);
  const parsed = SaveQuoteBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    badRequest(res, validationMessage(params, parsed) ?? "Invalid request.");
    return;
  }
  const order = await orderForOwner(params.data.id, authenticatedOwnerId(req));
  if (!order) {
    res.status(404).json({ error: "Order not found." });
    return;
  }
  if (order.status !== "design_review" || !order.designApprovedAt || order.quote) {
    conflict(res, "The buyer must approve the current design before you can send a quote.");
    return;
  }
  const expiresAt = new Date(parsed.data.expiresAt);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    badRequest(res, "The quote expiry must be in the future.");
    return;
  }
  const costs = parsed.data.materialsCostEgp + parsed.data.laborCostEgp;
  const totalEgp = roundMoney(costs * (1 + parsed.data.marginPercent / 100));
  const totalDisplay = roundMoney(totalEgp / parsed.data.fxRateToEgp);
  const depositPercent = totalEgp > 0 ? roundMoney((parsed.data.materialsCostEgp / totalEgp) * 100) : 0;
  const depositAmountDisplay = roundMoney((totalDisplay * depositPercent) / 100);
  await db.insert(quotesTable).values({
    id: randomUUID(),
    orderId: order.id,
    materialsCostEgp: parsed.data.materialsCostEgp,
    laborCostEgp: parsed.data.laborCostEgp,
    marginPercent: parsed.data.marginPercent,
    totalEgp,
    displayCurrency: parsed.data.displayCurrency,
    fxRateToEgp: parsed.data.fxRateToEgp,
    totalDisplay,
    depositPercent,
    depositAmountDisplay,
    expiresAt,
  });
  assertTransition(order.status, "quoted");
  await db.update(ordersTable).set({ status: "quoted" }).where(eq(ordersTable.id, order.id));
  await addNotification(order.id, "A quote is ready for the buyer.");
  const updated = await orderForOwner(order.id, authenticatedOwnerId(req));
  res.json(SaveQuoteResponse.parse(updated));
});

router.post("/orders/:id/progress", requireOwner, async (req, res): Promise<void> => {
  const params = PostProgressParams.safeParse(req.params);
  const parsed = PostProgressBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    badRequest(res, validationMessage(params, parsed) ?? "Invalid request.");
    return;
  }
  const order = await orderForOwner(params.data.id, authenticatedOwnerId(req));
  if (!order) {
    res.status(404).json({ error: "Order not found." });
    return;
  }
  if (order.status !== "deposit_paid" && order.status !== "in_production") {
    conflict(res, "Progress updates require a paid deposit.");
    return;
  }
  if (order.status === "deposit_paid") {
    assertTransition(order.status, "in_production");
    await db.update(ordersTable).set({ status: "in_production" }).where(eq(ordersTable.id, order.id));
    await addNotification(order.id, "Production has started.");
  }
  await db.insert(progressUpdatesTable).values({
    id: randomUUID(),
    orderId: order.id,
    ...parsed.data,
  });
  await addNotification(order.id, `A progress update was posted: ${parsed.data.stage}.`);
  const updated = await orderForOwner(order.id, authenticatedOwnerId(req));
  res.status(201).json(PostProgressResponse.parse(updated));
});

router.post("/orders/:id/ready", requireOwner, async (req, res): Promise<void> => {
  const params = MarkOrderReadyParams.safeParse(req.params);
  if (!params.success) {
    badRequest(res, params.error.message);
    return;
  }
  const order = await orderForOwner(params.data.id, authenticatedOwnerId(req));
  if (!order) {
    res.status(404).json({ error: "Order not found." });
    return;
  }
  try {
    assertTransition(order.status, "ready");
  } catch {
    conflict(res, "Only an order in production can be marked ready.");
    return;
  }
  await db.update(ordersTable).set({ status: "ready" }).where(eq(ordersTable.id, order.id));
  await addNotification(order.id, "The order is ready for buyer confirmation.");
  const updated = await orderForOwner(order.id, authenticatedOwnerId(req));
  res.json(MarkOrderReadyResponse.parse(updated));
});

router.get("/notifications", requireOwner, async (req, res): Promise<void> => {
  res.json(ListNotificationsResponse.parse(await getOwnerNotifications(authenticatedOwnerId(req))));
});

router.get("/buyer/:token", async (req, res): Promise<void> => {
  const params = GetBuyerOrderParams.safeParse(req.params);
  if (!params.success) {
    badRequest(res, params.error.message);
    return;
  }
  const order = await getOrderByToken(params.data.token);
  if (!order) {
    res.status(404).json({ error: "This buyer link is not valid." });
    return;
  }
  res.json(GetBuyerOrderResponse.parse(order));
});

router.post("/buyer/:token/design-decision", async (req, res): Promise<void> => {
  const params = DecideOnDesignParams.safeParse(req.params);
  const parsed = DecideOnDesignBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    badRequest(res, validationMessage(params, parsed) ?? "Invalid request.");
    return;
  }
  const order = await getOrderByToken(params.data.token);
  if (!order) {
    res.status(404).json({ error: "This buyer link is not valid." });
    return;
  }
  if (order.status !== "design_review") {
    conflict(res, "There is no design waiting for review.");
    return;
  }
  if (parsed.data.decision === "request_changes" && !parsed.data.comment?.trim()) {
    badRequest(res, "Add a comment when requesting design changes.");
    return;
  }
  const note =
    parsed.data.decision === "approve"
      ? `The buyer approved the design.${parsed.data.comment ? ` ${parsed.data.comment}` : ""}`
      : `The buyer requested design changes: ${parsed.data.comment!.trim()}`;
  await db
    .update(ordersTable)
    .set({
      designApprovedAt: parsed.data.decision === "approve" ? new Date() : null,
      designChangeNote:
        parsed.data.decision === "request_changes"
          ? parsed.data.comment!.trim()
          : null,
    })
    .where(eq(ordersTable.id, order.id));
  await addNotification(order.id, note);
  const updated = await getOrderByToken(params.data.token);
  res.json(DecideOnDesignResponse.parse(updated));
});

router.post("/buyer/:token/deposit", async (req, res): Promise<void> => {
  const params = PayDepositParams.safeParse(req.params);
  const parsed = PayDepositBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    badRequest(res, validationMessage(params, parsed) ?? "Invalid request.");
    return;
  }
  const order = await getOrderByToken(params.data.token);
  if (!order) {
    res.status(404).json({ error: "This buyer link is not valid." });
    return;
  }
  if (order.status !== "quoted" || !order.quote) {
    conflict(res, "This order has no payable deposit.");
    return;
  }
  const payment = await simulatedPaymentProvider.collectDeposit({
    amountDisplay: order.quote.depositAmountDisplay,
    currency: paymentCurrency(order.quote.displayCurrency),
    amountEgp: roundMoney(order.quote.depositAmountDisplay * order.quote.fxRateToEgp),
    method: parsed.data.method,
  });
  assertTransition(order.status, "deposit_paid");
  await db.transaction(async (tx) => {
    await tx.insert(paymentsTable).values({ ...payment, orderId: order.id });
    await tx.update(ordersTable).set({ status: "deposit_paid" }).where(eq(ordersTable.id, order.id));
  });
  await addNotification(order.id, "The buyer's deposit is held for delivery protection.");
  const updated = await getOrderByToken(params.data.token);
  res.json(PayDepositResponse.parse(updated));
});

router.post("/buyer/:token/delivery", async (req, res): Promise<void> => {
  const params = ConfirmDeliveryParams.safeParse(req.params);
  const parsed = ConfirmDeliveryBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    badRequest(res, validationMessage(params, parsed) ?? "Invalid request.");
    return;
  }
  const order = await getOrderByToken(params.data.token);
  if (!order) {
    res.status(404).json({ error: "This buyer link is not valid." });
    return;
  }
  if (order.status !== "ready" || !order.quote) {
    conflict(res, "The order is not ready for delivery confirmation.");
    return;
  }
  const balanceDisplay = roundMoney(order.quote.totalDisplay - order.quote.depositAmountDisplay);
  const balanceEgp = roundMoney(order.quote.totalEgp - balanceDisplay * order.quote.fxRateToEgp);
  const payment = await simulatedPaymentProvider.collectBalance({
    amountDisplay: balanceDisplay,
    currency: paymentCurrency(order.quote.displayCurrency),
    amountEgp: balanceEgp,
    method: parsed.data.method,
  });
  assertTransition(order.status, "delivered");
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(ordersTable).where(eq(ordersTable.id, order.id)).limit(1);
    if (!current || current.status !== "ready") throw new Error("Order is no longer ready.");
    await tx.insert(paymentsTable).values({ ...payment, orderId: order.id });
    await tx
      .update(paymentsTable)
      .set({ state: "released" })
      .where(and(eq(paymentsTable.orderId, order.id), eq(paymentsTable.state, "held")));
    await tx.update(ordersTable).set({ status: "delivered" }).where(eq(ordersTable.id, order.id));
    assertTransition("delivered", "closed");
    await tx.update(ordersTable).set({ status: "closed" }).where(eq(ordersTable.id, order.id));
  });
  await addNotification(order.id, "The buyer confirmed delivery.");
  await addNotification(order.id, "The order is closed and payments have been released.");
  const updated = await getOrderByToken(params.data.token);
  res.json(ConfirmDeliveryResponse.parse(updated));
});

export default router;
