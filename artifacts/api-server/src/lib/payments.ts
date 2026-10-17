import { randomUUID } from "node:crypto";

export type PaymentCurrency = "EGP" | "SAR" | "AED" | "USD";
export type PaymentKind = "deposit" | "balance";

export interface PaymentCharge {
  id: string;
  type: PaymentKind;
  amountDisplay: number;
  currency: PaymentCurrency;
  amountEgp: number;
  state: "held" | "released";
  createdAt: Date;
}

export interface PaymentProvider {
  collectDeposit(input: {
    amountDisplay: number;
    currency: PaymentCurrency;
    amountEgp: number;
    method: "card" | "wallet";
  }): Promise<PaymentCharge>;
  collectBalance(input: {
    amountDisplay: number;
    currency: PaymentCurrency;
    amountEgp: number;
    method: "card" | "wallet";
  }): Promise<PaymentCharge>;
}

/**
 * The adapter boundary for simulated checkout. A real provider can replace
 * this module without changing order routes or the buyer-facing contract.
 */
export const simulatedPaymentProvider: PaymentProvider = {
  async collectDeposit(input) {
    return {
      id: randomUUID(),
      type: "deposit",
      amountDisplay: input.amountDisplay,
      currency: input.currency,
      amountEgp: input.amountEgp,
      state: "held",
      createdAt: new Date(),
    };
  },
  async collectBalance(input) {
    return {
      id: randomUUID(),
      type: "balance",
      amountDisplay: input.amountDisplay,
      currency: input.currency,
      amountEgp: input.amountEgp,
      state: "released",
      createdAt: new Date(),
    };
  },
};
