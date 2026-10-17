import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { db, money, notify } from "./db";
import type { Currency, OrderSpec, OrderStatus } from "../shared/contract";
import { DEMO_FX } from "./routes/fx";

export function seed(): void {
  db.transaction(() => {
    if (!db.prepare("SELECT id FROM users WHERE id='reda'").get()) {
      const salt = randomBytes(16).toString("hex");
      const pinHash = `${salt}:${scryptSync("1234", salt, 64).toString("hex")}`;
      db.prepare("INSERT INTO users VALUES (?,?,?,?,?,?,?)")
        .run("reda", "Reda", "+201001234567", "owner", pinHash, "ar", "Reda Furniture, Damietta");
    }
    const samples: { id: string; title: string; buyer: string; phone: string; country: string; city: string;
      status: OrderStatus; currency: Currency; materials: number; labor: number }[] = [
      { id: "demo-bedroom", title: "Bedroom set", buyer: "Khaled", phone: "+966501234567", country: "Saudi Arabia", city: "Riyadh", status: "in_production", currency: "SAR", materials: 26000, labor: 10000 },
      { id: "demo-dining", title: "Dining table + 6 chairs", buyer: "Omar", phone: "+201012345678", country: "Egypt", city: "Cairo", status: "quoted", currency: "EGP", materials: 18000, labor: 7000 },
      { id: "demo-wardrobe", title: "Wardrobe", buyer: "Noura", phone: "+971501234567", country: "United Arab Emirates", city: "Dubai", status: "ready", currency: "AED", materials: 22000, labor: 8000 },
    ];
    samples.forEach((sample, index) => {
      if (db.prepare("SELECT id FROM orders WHERE id=?").get(sample.id)) return;
      const createdAt = new Date(Date.now() - (6 - index) * 86400000).toISOString();
      const spec: OrderSpec = {
        productType: sample.title, style: ["modern"], pieceSource: "customized",
        dimensions: { w: 200, d: 60, h: 180 }, wood: "Walnut", finish: "Natural matte",
        budgetRange: "25000–50000 EGP", deliveryCountry: sample.country, deliveryCity: sample.city,
        wantedBy: "", notes: "Handmade furniture with a warm natural finish.",
        thumbnailUrl: `/uploads/demo-reference-${index + 1}.svg`,
      };
      db.prepare(`INSERT INTO orders (id,owner_id,buyer_name,buyer_phone,buyer_country,title,
        description,dimensions,spec_json,status,design_approved,design_approved_at,token,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(sample.id, "reda", sample.buyer, sample.phone,
        sample.country, sample.title, spec.notes, "200 × 60 × 180 cm", JSON.stringify(spec), sample.status,
        1, createdAt, randomBytes(32).toString("hex"), createdAt);
      db.prepare("INSERT INTO order_images VALUES (?,?,?,?,?)")
        .run(randomUUID(), sample.id, spec.thumbnailUrl, "design", createdAt);
      const totalEgp = money((sample.materials + sample.labor) * 1.2);
      const fxRate = sample.currency === "EGP" ? 1 : DEMO_FX[sample.currency];
      db.prepare("INSERT INTO quotes VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(randomUUID(), sample.id,
        sample.materials, sample.labor, 20, totalEgp, sample.currency, fxRate, money(totalEgp / fxRate),
        sample.materials / totalEgp, sample.materials, new Date(Date.now() + 7 * 86400000).toISOString());
      if (index !== 1) db.prepare("INSERT INTO payments VALUES (?,?,?,?,?,?,?)")
        .run(randomUUID(), sample.id, "deposit", sample.materials, "held", `seed-${sample.id}`, createdAt);
      const stages = index === 0 ? ["Cut wood", "Assembly", "Finishing"] : index === 2 ? ["Ready"] : [];
      stages.forEach((stage, step) => db.prepare("INSERT INTO progress_updates VALUES (?,?,?,?,?,?)")
        .run(randomUUID(), sample.id, stage, `${stage} milestone completed.`,
          `/uploads/demo-progress-${Math.min(step + 1, 3)}.svg`,
          new Date(Date.now() - (stages.length - step) * 86400000).toISOString()));
      notify(sample.id, `Demo order created: ${sample.title}. Current stage: ${sample.status}.`);
    });
  })();
}
