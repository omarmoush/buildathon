// Person 2's boundary types mirror the buildathon contract; do not replace shared types.
export type Language = "ar" | "en";
export type Dimensions = { w: number; d: number; h: number };
export type Model = { glbUrl?: string; usdzUrl?: string; thumbnailUrl?: string };
export type CatalogItem = Model & {
  id: string; name: string; nameAr?: string; defaultDims: Dimensions;
  woods: string[]; finishes: string[];
};
export type Spec = Model & {
  productType: string; style: string[];
  pieceSource: "catalog" | "customized" | "generated";
  catalogItemId?: string; prompt?: string; generationTaskId?: string;
  dimensions: Dimensions; wood: string; finish: string; budgetRange: string;
  deliveryCountry: string; deliveryCity: string; wantedBy: string; notes: string;
  referencePhotos?: string[]; bedroomPieces?: string[];
};
export type Generation = Model & {
  status: "pending" | "processing" | "done" | "failed";
  progress: number; demo?: boolean;
};
export type BuyerOrder = {
  id: string; buyerName: string; buyerPhone?: string; status: string;
  designApproved: boolean; spec: Spec;
  quote?: {
    materialsEgp: number; laborEgp: number; marginPercent: number;
    totalEgp: number; displayCurrency: "EGP" | "SAR" | "AED" | "USD";
    fxRate: number; totalDisplay: number; depositPercent: number;
    depositEgp: number; expiresAt: string;
  } | null;
  payments: { id: string; type: "deposit" | "balance"; amountEgp: number; state: string }[];
  updates: { id?: string; stage: string; note: string; photoUrl?: string; createdAt?: string }[];
  images?: { url: string }[];
};
