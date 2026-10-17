import type { Order, Quote } from '@workspace/api-client-react';

// The current API's marginPercent is a cost markup, not profit / sale price.
// Keep its pricing formula unchanged; risk warnings use the actual sales margin.
export const DEMO_USD_RATE = 48.5;
export const DEFAULT_TARGET_MARGIN = 15;
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function quotePreview(materials: number, labor: number, markup: number, fx: number) {
  const totalEgp = round((materials + labor) * (1 + markup / 100));
  const totalDisplay = fx > 0 ? round(totalEgp / fx) : 0;
  const depositPercent = totalEgp > 0 ? round(materials / totalEgp * 100) : 0;
  const depositDisplay = round(totalDisplay * depositPercent / 100);
  return { totalEgp, totalDisplay, depositPercent, depositDisplay };
}

type CostQuote = Pick<Quote, 'materialsCostEgp' | 'laborCostEgp' | 'totalEgp'>;

export function rateImpact(quote: CostQuote, changePercent: number) {
  // Scenario assumption: all materials are imported; labor and the locked EGP
  // selling price do not change. This never updates a quote or payment.
  const materialsEgp = round(quote.materialsCostEgp * (1 + changePercent / 100));
  const costEgp = round(materialsEgp + quote.laborCostEgp);
  const profitEgp = round(quote.totalEgp - costEgp);
  const marginPercent = quote.totalEgp > 0 ? profitEgp / quote.totalEgp * 100 : 0;
  return { materialsEgp, costEgp, profitEgp, marginPercent };
}

export function quoteRisk(
  order: Pick<Order, 'status' | 'quote'>,
  usdRate: number,
  targetMargin: number,
  now = Date.now(),
) {
  if (order.status !== 'quoted' || !order.quote) return null;
  const expiry = new Date(order.quote.expiresAt).getTime();
  if (!Number.isFinite(expiry) || expiry <= now || !Number.isFinite(usdRate) || usdRate <= 0) return null;
  const impact = rateImpact(order.quote, (usdRate / DEMO_USD_RATE - 1) * 100);
  return { ...impact, belowTarget: impact.marginPercent < targetMargin };
}

export function needsAttention(order: Pick<Order, 'status'>) {
  // "draft" is the current server's equivalent of the brief's "requested".
  return ['draft', 'requested'].includes(String(order.status));
}

export function requestsFirst<T extends Pick<Order, 'status'>>(orders: T[]): T[] {
  return [...orders].sort((a, b) => Number(needsAttention(b)) - Number(needsAttention(a)));
}

export function releasedMoney(orders: Pick<Order, 'payments'>[]): number {
  return round(orders.reduce((sum, order) => sum + (order.payments || []).reduce(
    (subtotal, payment) => subtotal + (payment.state === 'released' ? payment.amountEgp : 0), 0,
  ), 0));
}
