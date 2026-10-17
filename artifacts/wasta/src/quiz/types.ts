import type { Dimensions as SharedDimensions, OrderSpec, MeshyTask } from "../../../../shared/contract";
// Use Person 1's wire contract, rather than maintaining a competing spec shape.
export type Language = "ar" | "en";
export type Dimensions = SharedDimensions;
export type Model = { glbUrl?: string; usdzUrl?: string; thumbnailUrl?: string };
export type CatalogItem = Model & {
  id: string; name: string; nameAr?: string; defaultDims: Dimensions;
  woods: string[]; finishes: string[];
};
export type Spec = OrderSpec;
export type Generation = MeshyTask & { demo?: boolean };
export type BuyerOrder = {
  id: string; buyerName: string; buyerPhone?: string; status: string;
  designApproved: boolean; spec: Spec;
  workshopName?: string; ownerPhone?: string; designChangeNote?: string | null;
  paymentMode?: "unavailable" | "live";
  quote?: {
    materialsEgp: number; laborEgp: number; marginPercent: number;
    totalEgp: number; displayCurrency: "EGP" | "SAR" | "AED" | "USD";
    fxRate: number; totalDisplay: number; depositPercent: number;
    depositEgp: number; expiresAt: string;
  } | null;
  payments: { id: string; type: "deposit" | "balance"; amountEgp: number; state: string }[];
  updates: { id?: string; stage: string; note: string; photoUrl?: string; createdAt?: string }[];
  images?: { url: string; kind?: string; id?: string }[];
};
