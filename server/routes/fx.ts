import { Router } from "express";
import type { FxRates } from "../../shared/contract";
export const DEMO_FX: Readonly<FxRates> = Object.freeze({ SAR: 13, AED: 13.5, USD: 49 });
export const fxRouter = Router();
fxRouter.get("/fx", (_req, res) => {
  res.setHeader("X-Wasta-FX-Mode", "demo");
  res.json(DEMO_FX);
});
