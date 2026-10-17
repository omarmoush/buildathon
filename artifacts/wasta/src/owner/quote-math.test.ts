import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Order, Payment } from '@workspace/api-client-react';
import { DEMO_USD_RATE, needsAttention, quotePreview, quoteRisk, rateImpact, releasedMoney, requestsFirst } from './quote-math.ts';

const quote = {
  materialsCostEgp: 24000, laborCostEgp: 18000, totalEgp: 50400,
  marginPercent: 20, displayCurrency: 'SAR' as const, fxRateToEgp: 13.1,
  totalDisplay: 3847.33, depositPercent: 47.62, depositAmountDisplay: 1832.1,
  expiresAt: '2099-01-01T00:00:00Z',
};

test('preview matches the server cost-markup and rounded deposit formula', () => {
  const preview = quotePreview(24000, 18000, 20, 13.1);
  assert.equal(preview.totalEgp, 50400);
  assert.equal(preview.totalDisplay, 3847.33);
  assert.equal(preview.depositPercent, 47.62);
  assert.equal(preview.depositDisplay, 1832.1);
});
test('zero costs and an invalid preview rate never produce NaN', () => {
  assert.deepEqual(quotePreview(0, 0, 0, 0), { totalEgp: 0, totalDisplay: 0, depositPercent: 0, depositDisplay: 0 });
});
test('20% markup is 16.67% profit margin, not 20%', () => {
  const impact = rateImpact(quote, 0);
  assert.equal(impact.profitEgp, 8400);
  assert.ok(Math.abs(impact.marginPercent - 16.6666667) < .00001);
});
test('20% USD rise raises materials, not labor or locked revenue', () => {
  const impact = rateImpact(quote, 20);
  assert.equal(impact.materialsEgp, 28800);
  assert.equal(impact.costEgp, 46800);
  assert.equal(impact.profitEgp, 3600);
  assert.ok(impact.marginPercent < 15);
  assert.equal(quote.totalEgp, 50400);
});
test('a 10% rate drop increases projected profit', () => {
  assert.equal(rateImpact(quote, -10).profitEgp, 10800);
});
test('zero selling price has a safe zero margin', () => {
  assert.equal(rateImpact({ ...quote, totalEgp: 0 }, 0).marginPercent, 0);
});
test('unpaid quotes cross the 15% warning threshold at the demo rate', () => {
  assert.equal(quoteRisk({ status: 'quoted', quote }, DEMO_USD_RATE, 15)?.belowTarget, false);
  assert.equal(quoteRisk({ status: 'quoted', quote }, DEMO_USD_RATE * 1.2, 15)?.belowTarget, true);
});
test('target margin is adjustable', () => {
  assert.equal(quoteRisk({ status: 'quoted', quote }, DEMO_USD_RATE, 20)?.belowTarget, true);
});
test('paid, cancelled, closed, and ready orders never warn', () => {
  for (const status of ['deposit_paid', 'in_production', 'ready', 'closed', 'cancelled', 'expired'] as const) {
    assert.equal(quoteRisk({ status, quote }, DEMO_USD_RATE * 1.2, 15), null);
  }
});
test('missing quotes and expired quotes never warn', () => {
  assert.equal(quoteRisk({ status: 'quoted', quote: null }, DEMO_USD_RATE, 15), null);
  assert.equal(quoteRisk({ status: 'quoted', quote: { ...quote, expiresAt: '2000-01-01' } }, DEMO_USD_RATE, 15), null);
});
test('invalid expiry and invalid USD rates do not produce misleading warnings', () => {
  assert.equal(quoteRisk({ status: 'quoted', quote: { ...quote, expiresAt: 'not-a-date' } }, DEMO_USD_RATE, 15), null);
  assert.equal(quoteRisk({ status: 'quoted', quote }, Number.NaN, 15), null);
  assert.equal(quoteRisk({ status: 'quoted', quote }, 0, 15), null);
});
test('warnings use the USD demo baseline, not the SAR display rate', () => {
  const original = quoteRisk({ status: 'quoted', quote }, DEMO_USD_RATE * 1.1, 15);
  const egp = quoteRisk({ status: 'quoted', quote: { ...quote, displayCurrency: 'EGP', fxRateToEgp: 1 } }, DEMO_USD_RATE * 1.1, 15);
  assert.equal(original?.profitEgp, egp?.profitEgp);
});
test('requests are pinned without mutating query-cache arrays', () => {
  const orders = [{ status: 'quoted', id: 'a' }, { status: 'draft', id: 'b' }, { status: 'ready', id: 'c' }] as Order[];
  assert.deepEqual(requestsFirst(orders).map(order => order.id), ['b', 'a', 'c']);
  assert.deepEqual(orders.map(order => order.id), ['a', 'b', 'c']);
  assert.equal(needsAttention({ status: 'draft' }), true);
});
test('released money includes both released deposit and balance, not held or pending', () => {
  const payments = [
    { state: 'released', type: 'deposit', amountEgp: 10000 },
    { state: 'released', type: 'balance', amountEgp: 5000.25 },
    { state: 'held', type: 'deposit', amountEgp: 9000 },
    { state: 'pending', type: 'balance', amountEgp: 1000 },
  ] as Payment[];
  assert.equal(releasedMoney([{ payments }]), 15000.25);
  assert.equal(releasedMoney([]), 0);
});
