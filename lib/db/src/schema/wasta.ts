import {
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    role: text("role").notNull().default("owner"),
    pinHash: text("pin_hash").notNull(),
    language: text("language").notNull().default("ar"),
    workshopName: text("workshop_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_phone_unique").on(table.phone)],
);

export const ordersTable = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    buyerName: text("buyer_name").notNull(),
    buyerPhone: text("buyer_phone").notNull(),
    buyerCountry: text("buyer_country").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    dimensions: text("dimensions").notNull().default(""),
    status: text("status").notNull().default("draft"),
    magicToken: text("magic_token").notNull(),
    designApprovedAt: timestamp("design_approved_at", { withTimezone: true }),
    designChangeNote: text("design_change_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("orders_magic_token_unique").on(table.magicToken),
    index("orders_owner_created_idx").on(table.ownerId, table.createdAt),
  ],
);

export const orderImagesTable = pgTable(
  "order_images",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    kind: text("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("order_images_order_idx").on(table.orderId)],
);

export const quotesTable = pgTable("quotes", {
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => ordersTable.id, { onDelete: "cascade" }),
  materialsCostEgp: doublePrecision("materials_cost_egp").notNull(),
  laborCostEgp: doublePrecision("labor_cost_egp").notNull(),
  marginPercent: doublePrecision("margin_percent").notNull(),
  totalEgp: doublePrecision("total_egp").notNull(),
  displayCurrency: text("display_currency").notNull(),
  fxRateToEgp: doublePrecision("fx_rate_to_egp").notNull(),
  totalDisplay: doublePrecision("total_display").notNull(),
  depositPercent: doublePrecision("deposit_percent").notNull(),
  depositAmountDisplay: doublePrecision("deposit_amount_display").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
});

export const paymentsTable = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    amountDisplay: doublePrecision("amount_display").notNull(),
    currency: text("currency").notNull(),
    amountEgp: doublePrecision("amount_egp").notNull(),
    state: text("state").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("payments_order_state_idx").on(table.orderId, table.state)],
);

export const progressUpdatesTable = pgTable(
  "progress_updates",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    note: text("note").notNull().default(""),
    photoUrl: text("photo_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("progress_order_created_idx").on(table.orderId, table.createdAt)],
);

export const notificationsTable = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    audience: text("audience").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("notifications_created_idx").on(table.createdAt)],
);
