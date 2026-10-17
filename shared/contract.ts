/** Shared Person 1/2/3 wire contract. Money charged to a provider is always EGP. */
export type OrderStatus = "requested" | "design_review" | "quoted" | "deposit_paid" |
  "in_production" | "ready" | "delivered" | "closed" | "cancelled" | "expired";
export type Currency = "EGP" | "SAR" | "AED" | "USD";
export type PaymentType = "deposit" | "balance";
export interface Dimensions { w: number; d: number; h: number }
export interface FurnitureEstimate {
  currency: "EGP";
  totalEgp: number;
  lowEgp: number;
  highEgp: number;
  depositPercent: number;
  depositEgp: number;
  materialsEgp: number;
  laborEgp: number;
  marginPercent: number;
  items: { key: string; label: string; labelAr: string; quantity: number; amountEgp: number }[];
  pricingVersion: string;
  createdAt: string;
  indicative: true;
  excludes: string[];
}
export interface OrderReview {
  phase: "request" | "deposit";
  decision: "accepted" | "changes_requested";
  note: string;
  reviewedAt: string;
}
export interface OrderSpec {
  productType: string;
  style: string[];
  pieceSource: "catalog" | "customized" | "generated";
  catalogItemId?: string;
  prompt?: string;
  glbUrl?: string;
  usdzUrl?: string;
  thumbnailUrl?: string;
  dimensions: Dimensions;
  wood: string;
  finish: string;
  budgetRange: string;
  deliveryCountry: string;
  deliveryCity: string;
  wantedBy: string;
  notes: string;
  referencePhotos?: string[];
  bedroomPieces?: string[];
  generationTaskId?: string;
}
export interface Quote {
  materialsEgp: number;
  laborEgp: number;
  marginPercent: number;
  totalEgp: number;
  displayCurrency: Currency;
  fxRate: number;
  totalDisplay: number;
  /** Fraction in [0, 1], not percentage points: 0.5 means 50%. */
  depositPercent: number;
  depositEgp: number;
  expiresAt: string;
}
export interface Payment {
  id: string; orderId: string; type: PaymentType; amountEgp: number;
  state: "pending" | "held" | "released"; paymobRef: string | null;
  createdAt: string;
}
export interface ProgressUpdate {
  id: string; orderId: string; stage: string; note: string;
  photoUrl: string | null; createdAt: string;
}
export interface OrderImage {
  id: string; orderId: string; url: string; kind: "reference" | "design"; createdAt: string;
}
export interface Notification {
  id: string; orderId: string; audience: "owner" | "buyer"; message: string; createdAt: string;
}
export interface Order {
  id: string; ownerId: string; buyerName: string; buyerPhone: string; buyerCountry: string;
  spec: OrderSpec; status: OrderStatus; designApproved: boolean;
  token: string; createdAt: string; quote: Quote | null;
  payments: Payment[]; updates: ProgressUpdate[]; images: OrderImage[];
  estimate?: FurnitureEstimate | null;
  review?: OrderReview | null;
}
export interface CreateOrderInput {
  buyerName: string; buyerPhone: string; buyerCountry: string; spec: OrderSpec;
}
export interface CreateOrderResponse { orderId: string; token: string }
export type QuoteInput = Pick<Quote, "materialsEgp" | "laborEgp" | "marginPercent" |
  "displayCurrency" | "fxRate" | "expiresAt"> & { depositPercent?: number };
export interface CheckoutResponse { checkoutUrl: string }
export interface UploadResponse { url: string }
export interface FxRates { SAR: number; AED: number; USD: number }
export interface CatalogItem {
  id: string; name: string; nameAr?: string; thumbnailUrl: string; glbUrl: string; usdzUrl?: string;
  defaultDims: Dimensions; woods: string[]; finishes: string[];
}
export interface MeshyTask {
  status: "pending" | "processing" | "done" | "failed"; progress: number;
  glbUrl?: string; usdzUrl?: string; thumbnailUrl?: string;
}
