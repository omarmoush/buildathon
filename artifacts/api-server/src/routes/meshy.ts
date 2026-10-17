import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { catalogItems } from "./catalog";

// Port of supplied Furniture3D server client + allowlisted asset proxy.
// Contract explicitly requests preview-only for the buildathon.
const MESHY = "https://api.meshy.ai/openapi/v2/text-to-3d";
type Task = {
  status?: string; progress?: number;
  model_urls?: { glb?: string; usdz?: string }; thumbnail_url?: string;
};
export type MeshyTaskEntry = { upstreamId?: string; started: number; demo: boolean };
type Entry = MeshyTaskEntry;
/** Where generation tasks live. In-memory by default; the Wasta server plugs in its database
 *  so tasks survive restarts and work across Cloudflare Worker instances. */
export interface MeshyTaskStore {
  get(id: string): Promise<Entry | undefined>;
  add(id: string, entry: Entry): Promise<void>;
  /** Drops tasks started before `before` and returns how many remain. */
  prune(before: number): Promise<number>;
}
const memory = new Map<string, Entry>();
let tasks: MeshyTaskStore = {
  get: async id => memory.get(id),
  add: async (id, entry) => { memory.set(id, entry); },
  prune: async before => {
    for (const [id, entry] of memory) if (entry.started < before) memory.delete(id);
    return memory.size;
  },
};
export function setMeshyTaskStore(store: MeshyTaskStore): void { tasks = store; }
const limits = new Map<string, { count: number; reset: number }>();
const TTL = 24 * 60 * 60 * 1000;
const router: IRouter = Router();

async function meshy(method: string, suffix: string, body?: unknown): Promise<Task & { result?: string }> {
  const response = await fetch(`${MESHY}${suffix}`, {
    method, headers: { Authorization: `Bearer ${process.env.MESHY_API_KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error("3D provider unavailable");
  return response.json() as Promise<Task & { result?: string }>;
}
async function prune() {
  for (const [ip, entry] of limits) if (entry.reset < Date.now()) limits.delete(ip);
  return tasks.prune(Date.now() - TTL);
}
async function entryFor(id: string) {
  const entry = await tasks.get(id);
  return entry && Date.now() - entry.started <= TTL ? entry : undefined;
}
async function getTask(entry: Entry): Promise<Task> {
  if (entry.demo) {
    const progress = Math.min(100, Math.round((Date.now() - entry.started) / 60));
    return { status: progress === 100 ? "SUCCEEDED" : "IN_PROGRESS", progress };
  }
  return meshy("GET", `/${encodeURIComponent(entry.upstreamId!)}`);
}
export function normalizedStatus(status?: string) {
  if (status === "SUCCEEDED") return "done";
  if (["FAILED", "CANCELED", "CANCELLED", "EXPIRED"].includes(status || "")) return "failed";
  return status === "IN_PROGRESS" ? "processing" : "pending";
}
export function isAllowedAsset(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "assets.meshy.ai"
      && !url.username && !url.password && (!url.port || url.port === "443");
  } catch { return false; }
}

router.post("/meshy/generate", async (req, res) => {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt || prompt.length > 800) { res.status(400).json({ error: "Prompt must be 1–800 characters" }); return; }
  const activeTasks = await prune();
  const ip = req.ip || "unknown";
  const limit = limits.get(ip) || { count: 0, reset: Date.now() + 60_000 };
  if (limit.count >= 3 || activeTasks >= 200) {
    res.set("Retry-After", "60").status(429).json({ error: "Please wait before generating again" }); return;
  }
  limit.count++; limits.set(ip, limit);
  const demo = process.env.MESHY_DEMO === "true" || !process.env.MESHY_API_KEY;
  try {
    const upstream = demo ? undefined : await meshy("POST", "", {
      mode: "preview", prompt, ai_model: "latest", should_remesh: true,
      target_polycount: 50000, auto_size: true, origin_at: "bottom", target_formats: ["glb", "usdz"],
    });
    if (!demo && !upstream?.result) throw new Error("Missing task id");
    const taskId = randomUUID();
    await tasks.add(taskId, { demo, upstreamId: upstream?.result, started: Date.now() });
    res.status(202).json({ taskId, demo });
  } catch { res.status(502).json({ error: "Could not start generation. Use a catalog model or try later." }); }
});

// Proxy URLs are based on an opaque task ID, never a user-supplied upstream URL.
router.get("/meshy/:taskId/asset/:format", async (req, res) => {
  const entry = await entryFor(String(req.params.taskId));
  const format = String(req.params.format);
  if (!entry || !["glb", "usdz", "thumbnail"].includes(format)) { res.sendStatus(404); return; }
  if (entry.demo) {
    if (format === "usdz") { res.sendStatus(404); return; }
    res.redirect(format === "thumbnail" ? catalogItems[0].thumbnailUrl : catalogItems[0].glbUrl!); return;
  }
  try {
    // Re-fetch to refresh Meshy's expiring signed model URLs.
    const task = await getTask(entry);
    const target = format === "thumbnail" ? task.thumbnail_url : task.model_urls?.[format as "glb" | "usdz"];
    if (!target || !isAllowedAsset(target)) { res.sendStatus(404); return; }
    // Never follow redirects off the allowlisted host. Cloudflare Workers reject redirect: "error",
    // so use "manual": a redirect comes back as a 3xx and fails the ok check below.
    const upstream = await fetch(target, { redirect: "manual", signal: AbortSignal.timeout(60_000) });
    if (!upstream.ok) { res.sendStatus(502); return; }
    res.set({
      "Content-Type": format === "glb" ? "model/gltf-binary" : format === "usdz" ? "model/vnd.usdz+zip" : "image/png",
      "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff",
    });
    // Buffered like the Worker's R2 upload handler; Node stream piping is not reliable behind httpServerHandler.
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    if (!res.headersSent) res.status(502).json({ error: "Model unavailable; select a fallback" });
    else res.destroy();
  }
});
router.get("/meshy/:taskId", async (req, res) => {
  const taskId = String(req.params.taskId);
  const entry = await entryFor(taskId);
  if (!entry) { res.status(404).json({ error: "Task expired or not found" }); return; }
  res.set("Cache-Control", "no-store");
  try {
    const task = await getTask(entry);
    const status = normalizedStatus(task.status);
    const base = `/api/meshy/${encodeURIComponent(taskId)}/asset`;
    res.json({
      status, progress: Math.max(0, Math.min(100, task.progress || 0)), demo: entry.demo,
      ...(status === "done" ? {
        glbUrl: entry.demo ? catalogItems[0].glbUrl : task.model_urls?.glb ? `${base}/glb` : undefined,
        usdzUrl: task.model_urls?.usdz ? `${base}/usdz` : undefined,
        thumbnailUrl: entry.demo ? catalogItems[0].thumbnailUrl : task.thumbnail_url ? `${base}/thumbnail` : undefined,
      } : {}),
    });
  } catch { res.status(502).json({ error: "Could not check generation status" }); }
});
export default router;
