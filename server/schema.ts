// SQLite schema shared by better-sqlite3 (local) and D1 (Cloudflare). Every statement is idempotent,
// so it is applied on startup instead of through a migration tool.
export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'owner', pin_hash TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'ar', workshop_name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id),
    buyer_name TEXT NOT NULL, buyer_phone TEXT NOT NULL, buyer_country TEXT NOT NULL,
    title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', dimensions TEXT NOT NULL DEFAULT '',
    spec_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN
      ('requested','design_review','quoted','deposit_paid','in_production','ready','delivered','closed','cancelled','expired')),
    design_approved INTEGER NOT NULL DEFAULT 0 CHECK(design_approved IN (0,1)),
    design_approved_at TEXT, design_change_note TEXT, token TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS quotes (
    id TEXT PRIMARY KEY, order_id TEXT UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    materials_egp REAL NOT NULL CHECK(materials_egp >= 0), labor_egp REAL NOT NULL CHECK(labor_egp >= 0),
    margin_percent REAL NOT NULL CHECK(margin_percent >= 0), total_egp REAL NOT NULL CHECK(total_egp > 0),
    display_currency TEXT NOT NULL, fx_rate REAL NOT NULL CHECK(fx_rate > 0), total_display REAL NOT NULL,
    deposit_percent REAL NOT NULL CHECK(deposit_percent > 0 AND deposit_percent <= 1),
    deposit_egp REAL NOT NULL, expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('deposit','balance')), amount_egp REAL NOT NULL CHECK(amount_egp >= 0),
    state TEXT NOT NULL CHECK(state IN ('pending','held','released')),
    paymob_ref TEXT UNIQUE, created_at TEXT NOT NULL, UNIQUE(order_id,type)
  );
  CREATE TABLE IF NOT EXISTS progress_updates (
    id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    stage TEXT NOT NULL, note TEXT NOT NULL, photo_url TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS order_images (
    id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    url TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('reference','design')), created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    audience TEXT NOT NULL CHECK(audience IN ('owner','buyer')), message TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS order_estimates (
    order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
    estimate_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS order_reviews (
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    phase TEXT NOT NULL CHECK(phase IN ('request','deposit')),
    decision TEXT NOT NULL CHECK(decision IN ('accepted','changes_requested')),
    note TEXT NOT NULL DEFAULT '', reviewed_at TEXT NOT NULL,
    PRIMARY KEY(order_id,phase)
  );
  CREATE TABLE IF NOT EXISTS catalog_products (
    id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), category TEXT NOT NULL,
    name TEXT NOT NULL, name_ar TEXT NOT NULL DEFAULT '', w REAL NOT NULL, d REAL NOT NULL, h REAL NOT NULL,
    woods_json TEXT NOT NULL, finishes_json TEXT NOT NULL, image_url TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS meshy_tasks (
    id TEXT PRIMARY KEY, upstream_id TEXT, demo INTEGER NOT NULL, started INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS orders_owner_created ON orders(owner_id,created_at);
  CREATE INDEX IF NOT EXISTS progress_order ON progress_updates(order_id,created_at);
  CREATE INDEX IF NOT EXISTS notifications_created ON notifications(created_at);
  CREATE INDEX IF NOT EXISTS meshy_tasks_started ON meshy_tasks(started);
`;

// Columns added after the first deploy. Each is applied once; "duplicate column" errors mean it already ran.
export const MIGRATIONS = [
  "ALTER TABLE orders ADD COLUMN code TEXT",
  "CREATE UNIQUE INDEX IF NOT EXISTS orders_code ON orders(code)",
  "ALTER TABLE meshy_tasks ADD COLUMN refine_id TEXT",
];

export const isAppliedMigrationError = (error: unknown) => /duplicate column/i.test(String(error));

export const schemaStatements = () => SCHEMA.split(";").map(statement => statement.trim()).filter(Boolean);
