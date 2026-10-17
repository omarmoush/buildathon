import { Router } from "express";
import { ApiError } from "../db";
import type { Order, PaymentType } from "../../shared/contract";

export interface CheckoutResult { checkoutUrl: string; paymobRef: string }
/**
 * Stable provider boundary for the team. Paymob is not connected through the
 * supported payment setup. Fail explicitly; never fabricate a checkout or success.
 */
export async function createCheckout(_order: Order, _type: PaymentType): Promise<CheckoutResult> {
  throw new ApiError(503, "Payment checkout is unavailable: no supported provider is connected.", "PAYMENTS_UNAVAILABLE");
}
export const paymobRouter = Router();
paymobRouter.post("/paymob/webhook", (_req, _res) => {
  throw new ApiError(503, "No payment webhook provider is configured. No payment state was changed.", "PAYMENTS_UNAVAILABLE");
});
