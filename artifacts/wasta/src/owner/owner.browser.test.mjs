// Mocked-API UI smoke checks. No database, real payments, or external accounts.
// See DEMO.md for the pnpm dlx command; no app dependencies are added.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.OWNER_TEST_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  // Verify the viewer integration without downloading a third-party renderer.
  customElements.define('model-viewer', class extends HTMLElement {});
});
const now = '2026-10-17T12:00:00Z';
const owner = { id: 'owner-reda', name: 'Reda', workshopName: 'Reda Furniture', phone: '+201001234567', language: 'ar' };
const quote = {
  materialsCostEgp: 24000, laborCostEgp: 18000, marginPercent: 20,
  totalEgp: 50400, displayCurrency: 'SAR', fxRateToEgp: 13.1, totalDisplay: 3847.33,
  depositPercent: 47.62, depositAmountDisplay: 1832.1, expiresAt: '2099-01-01T00:00:00Z',
};
const makeOrder = (id, status) => ({
  id, status, ownerId: owner.id, ownerName: owner.name, ownerPhone: owner.phone,
  workshopName: owner.workshopName, buyerName: 'Khaled', buyerPhone: '0501234567',
  buyerCountry: 'Saudi Arabia', title: id, description: 'Walnut furniture',
  dimensions: '200 × 180 cm', magicToken: `test-token-${id}`, createdAt: now,
  designApprovedAt: status === 'design_review' ? now : null, designChangeNote: null,
  images: [], quote: ['draft', 'design_review'].includes(status) ? null : { ...quote },
  payments: [], progress: [],
});
const orders = [
  makeOrder('demo-dining', 'quoted'),
  makeOrder('demo-bedroom', 'in_production'),
  makeOrder('new-request', 'draft'),
  makeOrder('approved-design', 'design_review'),
  makeOrder('finished', 'closed'),
];
orders[4].payments = [
  { id: 'p1', type: 'deposit', amountEgp: 10000, amountDisplay: 10000, currency: 'EGP', state: 'released', createdAt: now },
  { id: 'p2', type: 'balance', amountEgp: 5000, amountDisplay: 5000, currency: 'EGP', state: 'released', createdAt: now },
];
orders[3].spec = {
  productType: 'bedroom', style: ['modern'], dimensions: { w: 200, d: 180, h: 100 },
  wood: 'Walnut', finish: 'Matte', budgetRange: '30000–50000 EGP',
  wantedBy: '2026-12-01', deliveryCity: 'Riyadh',
  glbUrl: '/test-model.glb', usdzUrl: '/test-model.usdz',
};
let session = true;
let failQuote = true;
let failProgress = true;
let failReady = true;
let quotePayload;
let progressPayload;
let uploadPayload;
await page.route('**/api/**', async route => {
  const url = new URL(route.request().url());
  const path = url.pathname;
  const method = route.request().method();
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (path === '/api/auth/session') return session ? json(owner) : json({ error: 'Not signed in' }, 401);
  if (path === '/api/auth/login') return json({ error: 'Invalid PIN' }, 401);
  if (path === '/api/dashboard') return json({ openOrders: 4, depositsCollectedEgp: 10000, balancesDueEgp: 30000, orders, notifications: [] });
  if (path === '/api/orders') return json(orders);
  if (path === '/api/notifications') return json([]);
  if (path === '/api/uploads') {
    uploadPayload = route.request().postDataJSON();
    return json({ url: '/api/uploads/test-progress.png' }, 201);
  }
  const match = path.match(/^\/api\/orders\/([^/]+)(?:\/([^/]+))?$/);
  const order = orders.find(order => order.id === match?.[1]);
  if (order && method === 'GET') return json(order);
  if (order && match[2] === 'quote') {
    quotePayload = route.request().postDataJSON();
    if (failQuote) { failQuote = false; return json({ error: 'Try again' }, 500); }
    order.quote = { ...quote, ...quotePayload };
    order.status = 'quoted';
    return json(order);
  }
  if (order && match[2] === 'progress') {
    if (failProgress) { failProgress = false; return json({ error: 'Try again' }, 500); }
    progressPayload = route.request().postDataJSON();
    order.progress.push({ id: 'progress-1', ...progressPayload, createdAt: now });
    return json(order);
  }
  if (order && match[2] === 'ready') {
    if (failReady) { failReady = false; return json({ error: 'Try again' }, 500); }
    order.status = 'ready';
    return json(order);
  }
  return json({ error: `Unhandled mocked endpoint ${method} ${path}` }, 404);
});

async function visible(testId) { await page.getByTestId(testId).waitFor({ state: 'visible' }); }
async function waitFor(check) {
  const deadline = Date.now() + 8000;
  while (!await check()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for UI assertion');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
async function slider(testId, value) {
  await page.getByTestId(testId).evaluate((element, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, String(value));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
async function noOverflow() {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '390px layout must not scroll horizontally');
}

try {
  await page.goto(`${base}/owner`);
  await visible('text-released-money');
  assert.equal(await page.locator('main').getAttribute('dir'), 'rtl');
  assert.equal(await page.getByTestId('text-released-money').textContent(), '15,000 EGP');
  assert.equal(await page.locator('[data-testid^="link-order-"]').first().getAttribute('data-testid'), 'link-order-new-request');
  assert.equal(await page.getByTestId('badge-margin-warning').count(), 0);
  await noOverflow();
  await slider('slider-demo-usd-rate', 20);
  await visible('badge-margin-warning');
  assert.equal(await page.getByTestId('badge-margin-warning').count(), 1);
  await noOverflow();
  await page.getByTestId('button-reset-demo-rate').click();
  await waitFor(async () => await page.getByTestId('badge-margin-warning').count() === 0);
  await page.getByTestId('input-target-margin').fill('20');
  await visible('badge-margin-warning');
  await page.getByTestId('button-language-toggle').click();
  assert.equal(await page.locator('main').getAttribute('dir'), 'ltr');
  console.log('PASS dashboard: RTL/English, request pinning, released total, FX warning/reset/target, 390px layout');

  await page.goto(`${base}/owner/orders/approved-design`);
  await visible('button-edit-quote');
  await visible('owner-order-spec');
  assert.match(await page.getByTestId('owner-order-spec').textContent(), /Walnut/);
  assert.match(await page.getByTestId('link-whatsapp').getAttribute('href'), /wa\.me\/966501234567/);
  assert.equal(await page.locator('model-viewer').evaluate(element => element.hasAttribute('camera-controls')), true);
  await page.getByTestId('button-edit-quote').click();
  await page.getByTestId('input-materials-cost').fill('24000');
  await page.getByTestId('input-labor-cost').fill('18000');
  assert.equal(await page.getByTestId('text-quote-total').textContent(), '3,847.33 SAR');
  assert.match(await page.getByTestId('text-quote-deposit').textContent(), /1,832.10 SAR/);
  await slider('slider-quote-rate', 20);
  assert.equal(await page.getByTestId('text-projected-profit').textContent(), '3,600 EGP');
  assert.equal(await page.getByTestId('text-projected-margin').textContent(), '7.1%');
  await noOverflow();
  await page.getByTestId('select-quote-currency').selectOption('EGP');
  assert.equal(await page.getByTestId('input-exchange-rate').inputValue(), '1');
  assert.equal(await page.getByTestId('input-exchange-rate').isDisabled(), true);
  await page.getByTestId('select-quote-currency').selectOption('SAR');
  await page.getByTestId('button-save-quote').click();
  await page.getByRole('dialog').getByRole('alert').waitFor();
  assert.match(await page.getByRole('dialog').getByRole('alert').textContent(), /Quote could not be saved/);
  await page.getByTestId('button-save-quote').click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(quotePayload.materialsCostEgp, 24000, 'scenario must not mutate the saved material cost');
  assert.equal(quotePayload.fxRateToEgp, 13.1);
  assert.equal(quotePayload.marginPercent, 20);
  console.log('PASS quote: preview, profit simulation, EGP lock, error/retry, original prices saved; optional spec/model + Saudi WhatsApp');

  await page.goto(`${base}/owner/orders/demo-bedroom`);
  await visible('button-add-progress');
  await page.getByTestId('button-add-progress').click();
  await page.getByTestId('input-progress-stage').selectOption('finishing');
  await page.getByTestId('input-progress-note').fill('Finishing complete');
  await page.getByTestId('input-progress-photo').setInputFiles({
    name: 'progress.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH1cAAAAASUVORK5CYII=', 'base64'),
  });
  await page.getByTestId('button-submit-progress').click();
  await page.getByRole('dialog').getByRole('alert').waitFor();
  await page.getByTestId('button-submit-progress').click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(progressPayload.stage, 'finishing');
  assert.equal(progressPayload.photoUrl, '/api/uploads/test-progress.png');
  assert.match(uploadPayload.dataUrl, /^data:image\/png;base64,/);
  await page.getByTestId('button-mark-delivered').click();
  await page.getByRole('alert').waitFor();
  await page.getByTestId('button-mark-delivered').click();
  await page.getByTestId('button-mark-delivered').waitFor({ state: 'hidden' });
  console.log('PASS progress: stage picker, photo upload, error/retry, mark-ready error/retry');

  await page.goto(`${base}/owner/orders/new-request`);
  await page.getByTestId('input-design-image').waitFor({ state: 'attached' });
  await page.goto(`${base}/owner`);
  session = false;
  await page.reload();
  await visible('button-owner-login');
  await page.getByTestId('button-owner-login').click();
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').textContent(), /did not match/);
  console.log('PASS owner aliases and failed PIN login stay functional');
  assert.deepEqual(errors, [], 'no uncaught browser exceptions');
  console.log('ALL OWNER UI SMOKE CHECKS PASSED (mocked APIs, not a live backend test)');
} finally {
  await browser.close();
}
