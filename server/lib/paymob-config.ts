// Read lazily so values loaded from .env at startup (or Replit Secrets) are picked up.
export interface PaymobConfig {
  secretKey: string; publicKey: string; hmacSecret: string; integrationId: number; mode: "test" | "live";
}

export function paymobConfig(): PaymobConfig | null {
  const env = process.env;
  const integrationId = Number(env.PAYMOB_INTEGRATION_ID);
  if (!env.PAYMOB_SECRET_KEY || !env.PAYMOB_PUBLIC_KEY || !env.PAYMOB_HMAC_SECRET) return null;
  if (!Number.isInteger(integrationId) || integrationId <= 0) return null;
  return {
    secretKey: env.PAYMOB_SECRET_KEY, publicKey: env.PAYMOB_PUBLIC_KEY, hmacSecret: env.PAYMOB_HMAC_SECRET, integrationId,
    mode: env.PAYMOB_SECRET_KEY.includes("_test_") ? "test" : "live",
  };
}

export const paymentsEnabled = (): boolean => paymobConfig() !== null;
