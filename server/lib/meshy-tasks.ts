import { db } from "../db";
import type { MeshyTaskEntry, MeshyTaskStore } from "../../artifacts/api-server/src/routes/meshy";

// Persists Meshy generation tasks in the active database (SQLite locally, D1 on Cloudflare).
export const meshyTaskStore: MeshyTaskStore = {
  async get(id) {
    const row = await db.prepare("SELECT upstream_id upstreamId, demo, started FROM meshy_tasks WHERE id=?")
      .get<{ upstreamId: string | null; demo: number; started: number }>(id);
    return row ? { upstreamId: row.upstreamId ?? undefined, demo: !!row.demo, started: row.started } : undefined;
  },
  async add(id, entry: MeshyTaskEntry) {
    await db.prepare("INSERT INTO meshy_tasks (id,upstream_id,demo,started) VALUES (?,?,?,?)")
      .run(id, entry.upstreamId ?? null, entry.demo ? 1 : 0, entry.started);
  },
  async prune(before) {
    await db.prepare("DELETE FROM meshy_tasks WHERE started < ?").run(before);
    const row = await db.prepare("SELECT COUNT(*) count FROM meshy_tasks").get<{ count: number }>();
    return row?.count ?? 0;
  },
};
