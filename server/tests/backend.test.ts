import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { app, logger, safeRequestPath } from "../index";
import { createDatabase, db, getOrder, listOrders, useDatabase, uploadDirectory } from "../db";
import { seed } from "../seed";
import { settleVerifiedPayment } from "../routes/payments";

logger.level = "silent";
beforeEach(() => { useDatabase(createDatabase(":memory:")); seed(); });
after(() => { db.close(); });
const spec = {
  productType: "Test chair", style: ["modern"], pieceSource: "customized",
  dimensions: { w: 50, d: 50, h: 90 }, wood: "Oak", finish: "Matte",
  budgetRange: "10000–40000 EGP", deliveryCountry: "Saudi Arabia", deliveryCity: "Riyadh",
  wantedBy: "", notes: "Integration test order",
};
async function owner() {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ phone: "01001234567", pin: "1234" }).expect(200);
  return agent;
}
async function createOrder() {
  const response = await request(app).post("/api/orders").send({
    buyerName: "Khaled", buyerPhone: "+966501234567", buyerCountry: "Saudi Arabia", spec,
  }).expect(201);
  return response.body as { orderId: string; token: string };
}
const quote = { materialsEgp: 20000, laborEgp: 10000, marginPercent: 20,
  displayCurrency: "SAR", fxRate: 13, expiresAt: new Date(Date.now() + 86400000).toISOString() };
function pending(orderId: string, type: "deposit" | "balance", amount: number) {
  const id = randomUUID(); const ref = randomUUID();
  db.prepare("INSERT INTO payments VALUES (?,?,?,?,?,?,?)").run(id, orderId, type, amount, "pending", ref, new Date().toISOString());
  return { id, ref };
}
test("seed is idempotent, with exact states, Khaled in Riyadh, and local photo placeholders", () => {
  seed();
  const orders = listOrders();
  assert.equal(orders.length, 3);
  assert.equal(getOrder("demo-bedroom").buyerName, "Khaled");
  assert.equal(getOrder("demo-bedroom").updates.length, 3);
  assert.equal(getOrder("demo-bedroom").status, "in_production");
  assert.equal(getOrder("demo-bedroom").payments[0]?.state, "held");
  assert.equal(getOrder("demo-dining").status, "quoted");
  assert.equal(getOrder("demo-wardrobe").status, "ready");
});
test("public quiz order preserves spec and random token; owner listing is protected", async () => {
  await request(app).get("/api/orders").expect(401);
  const created = await createOrder();
  assert.match(created.token, /^[0-9a-f]{64}$/);
  const result = await request(app).get(`/api/b/${created.token}`).expect(200);
  assert.deepEqual(result.body.spec, spec);
  assert.equal(result.body.status, "requested");
  assert.equal(result.body.designApproved, false);
  await request(app).get("/api/b/not-a-token").expect(404);
});
test("design approval gates quotes; FX, margin, deposit and quote locking are correct", async () => {
  const agent = await owner(); const order = await createOrder();
  await agent.post(`/api/orders/${order.orderId}/quote`).send(quote).expect(409);
  await agent.post(`/api/orders/${order.orderId}/start-design`).send({}).expect(200);
  await request(app).post(`/api/b/${order.token}/request-changes`).send({ comment: "" }).expect(400);
  await request(app).post(`/api/b/${order.token}/request-changes`).send({ comment: "Wider seat" }).expect(200);
  assert.equal(getOrder(order.orderId).designChangeNote, "Wider seat");
  await agent.post(`/api/orders/${order.orderId}/quote`).send(quote).expect(409);
  await request(app).post(`/api/b/${order.token}/approve-design`).send({}).expect(200);
  const response = await agent.post(`/api/orders/${order.orderId}/quote`).send(quote).expect(200);
  assert.equal(response.body.quote.totalEgp, 36000);
  assert.equal(response.body.quote.depositEgp, 20000);
  assert.equal(response.body.quote.depositPercent, 20000 / 36000);
  assert.equal(response.body.quote.totalDisplay, 2769.23);
  assert.equal(response.body.quote.fxRate, 13);
  assert.equal(response.body.status, "quoted");
  await agent.post(`/api/orders/${order.orderId}/quote`).send({ ...quote, fxRate: 15 }).expect(409);
  await agent.post(`/api/orders/${order.orderId}/ready`).send({}).expect(409);
});
test("verified settlement is idempotent; two progress photos, delivery and balances update atomically", async () => {
  const agent = await owner(); const created = await createOrder();
  const baseline = (await agent.get("/api/dashboard").expect(200)).body;
  await agent.post(`/api/orders/${created.orderId}/start-design`).send({}).expect(200);
  await request(app).post(`/api/b/${created.token}/approve-design`).send({}).expect(200);
  await agent.post(`/api/orders/${created.orderId}/quote`).send(quote).expect(200);
  const deposit = pending(created.orderId, "deposit", 20000);
  assert.throws(() => settleVerifiedPayment(deposit.id, deposit.ref, 1));
  assert.equal(getOrder(created.orderId).status, "quoted");
  settleVerifiedPayment(deposit.id, deposit.ref, 20000);
  const notificationsBefore = db.prepare("SELECT COUNT(*) count FROM notifications").get() as { count: number };
  settleVerifiedPayment(deposit.id, deposit.ref, 20000);
  assert.deepEqual(db.prepare("SELECT COUNT(*) count FROM notifications").get(), notificationsBefore);
  assert.equal(getOrder(created.orderId).status, "deposit_paid");
  for (const stage of ["Assembly", "Finishing"]) {
    await agent.post(`/api/orders/${created.orderId}/progress`).send({
      stage, note: "Finished this step", photoUrl: "/uploads/demo-progress-1.svg",
    }).expect(200);
  }
  assert.equal(getOrder(created.orderId).updates.length, 2);
  assert.equal(getOrder(created.orderId).status, "in_production");
  await agent.post(`/api/orders/${created.orderId}/ready`).send({}).expect(200);
  const balance = pending(created.orderId, "balance", 16000);
  settleVerifiedPayment(balance.id, balance.ref, 16000);
  const closed = getOrder(created.orderId);
  assert.equal(closed.status, "closed");
  assert.deepEqual(closed.payments.map(payment => payment.state), ["released", "released"]);
  const dashboard = (await agent.get("/api/dashboard").expect(200)).body;
  assert.equal(dashboard.depositsCollectedEgp, baseline.depositsCollectedEgp + 20000);
  assert.equal(dashboard.balancesDueEgp, baseline.balancesDueEgp);
});
test("unconfigured checkout fails explicitly; return URLs and webhooks cannot fake payment", async () => {
  const order = getOrder("demo-dining");
  const checkout = await request(app).post(`/api/b/${order.token}/pay`).send({ type: "deposit" }).expect(503);
  assert.equal(checkout.body.code, "PAYMENTS_UNAVAILABLE");
  assert.equal(getOrder(order.id).payments.length, 0);
  const charge = pending(order.id, "deposit", order.quote!.depositEgp);
  await request(app).get(`/api/b/${order.token}/payment-return?success=true`).expect(303);
  await request(app).post("/api/paymob/webhook").send({ success: true }).expect(503);
  assert.equal(getOrder(order.id).payments.find(payment => payment.id === charge.id)?.state, "pending");
  assert.equal(getOrder(order.id).status, "quoted");
});
test("unpaid quotes expire and demo FX endpoint returns exact contract rates", async () => {
  const order = getOrder("demo-dining");
  db.prepare("UPDATE quotes SET expires_at=? WHERE order_id=?").run(new Date(0).toISOString(), order.id);
  const response = await request(app).get(`/api/b/${order.token}`).expect(200);
  assert.equal(response.body.status, "expired");
  await request(app).post(`/api/b/${order.token}/pay`).send({ type: "deposit" }).expect(409);
  const rates = await request(app).get("/api/fx").expect(200);
  assert.deepEqual(rates.body, { SAR: 13, AED: 13.5, USD: 49 });
  assert.equal(rates.headers["x-wasta-fx-mode"], "demo");
});
test("multipart uploads validate image signatures and are served locally", async () => {
  await request(app).post("/api/uploads").attach("file", Buffer.from("<script>bad</script>"), {
    filename: "fake.png", contentType: "image/png",
  }).expect(400);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7WQAAAAASUVORK5CYII=", "base64");
  const uploaded = await request(app).post("/api/uploads").attach("file", png, { filename: "../../photo.png", contentType: "image/png" }).expect(201);
  assert.match(uploaded.body.url, /^\/uploads\/[0-9a-f-]+\.png$/);
  try {
    const served = await request(app).get(uploaded.body.url).expect(200);
    assert.match(served.headers["content-type"], /^image\/png/);
  } finally { await unlink(path.join(uploadDirectory, path.basename(uploaded.body.url))); }
});
test("invalid requests get client errors and contributor endpoints are explicitly reserved", async () => {
  await request(app).post("/api/orders").send({ buyerName: "X" }).expect(400);
  await request(app).post("/api/auth/login").send({ phone: "01001234567", pin: "9999" }).expect(401);
  await request(app).get("/api/catalog").expect(501);
  await request(app).post("/api/meshy/generate").send({ prompt: "chair" }).expect(501);
  assert.equal(safeRequestPath("/api/b/private-value/payment-return?success=true"), "/api/b/[private-token]/payment-return");
  assert.equal(safeRequestPath("/api/buyer/private-value"), "/api/buyer/[private-token]");
});
