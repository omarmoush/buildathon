import { db } from "../db";
import type { MeshyTaskEntry, MeshyTaskStore } from "../../artifacts/api-server/src/routes/meshy";

// Persists Meshy generation tasks in the active database (SQLite locally, D1 on Cloudflare).
export const meshyTaskStore: MeshyTaskStore = {
  async get(id) {
    const row = await db.prepare("SELECT upstream_id upstreamId, refine_id refineId, demo, started FROM meshy_tasks WHERE id=?")
      .get<{ upstreamId: string | null; refineId: string | null; demo: number; started: number }>(id);
    return row ? { upstreamId: row.upstreamId ?? undefined, refineId: row.refineId ?? undefined, demo: !!row.demo, started: row.started } : undefined;
  },
  async claimRefine(id, value) {
    const result = await db.prepare("UPDATE meshy_tasks SET refine_id=? WHERE id=? AND refine_id IS NULL").run(value, id);
    return result.changes === 1;
  },
  async setRefine(id, value) {
    await db.prepare("UPDATE meshy_tasks SET refine_id=? WHERE id=?").run(value, id);
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
