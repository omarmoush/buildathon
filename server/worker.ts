// Cloudflare Worker entry: the same Express app on D1 (database) and R2 (uploaded images).
// The built web app is served as static assets (see wrangler.jsonc); /api/* and /uploads/* reach this Worker.
import { httpServerHandler } from "cloudflare:node";
import type { RequestHandler } from "express";
import { createApp, logger } from "./app";
import { useDatabase } from "./db";
import { applySchema, d1Database, type D1Binding } from "./d1";
import { seed } from "./seed";
import { setUploadStore } from "./storage";

interface Env {
  DB: D1Binding;
  UPLOADS: {
    put(key: string, value: Uint8Array, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
    get(key: string): Promise<{ httpMetadata?: { contentType?: string }; arrayBuffer(): Promise<ArrayBuffer> } | null>;
  };
  ASSETS: { fetch(request: Request): Promise<Response> };
}

let bindings: Env;

// Uploaded images live in R2; the bundled demo images ship as static assets under /uploads/.
const uploadsFromR2: RequestHandler = async (req, res, next) => {
  const name = req.path.replace(/^\//, "");
  if (!/^[\w-]+\.(png|jpe?g|gif|webp|svg)$/.test(name)) { next(); return; }
  const object = await bindings.UPLOADS.get(name);
  if (object) {
    res.type(object.httpMetadata?.contentType ?? "application/octet-stream")
      .set("Cache-Control", "public, max-age=31536000, immutable")
      .send(Buffer.from(await object.arrayBuffer()));
    return;
  }
  const asset = await bindings.ASSETS.fetch(new Request(`https://assets.invalid/uploads/${name}`));
  if (!asset.ok) { next(); return; }
  res.type(asset.headers.get("content-type") ?? "application/octet-stream").send(Buffer.from(await asset.arrayBuffer()));
};

const PORT = 8080;
// Cloudflare's observability already records each request, so only attach the logger routes use.
const attachLogger: RequestHandler = (req, _res, next) => { req.log = logger; next(); };
createApp({ database: "d1", requestLogger: attachLogger, uploadHandlers: [uploadsFromR2] }).listen(PORT);
const server = httpServerHandler({ port: PORT });

// Once per Worker instance: bind D1/R2, create missing tables, and add the demo data if it is absent.
let ready: Promise<void> | undefined;
function setup(env: Env): Promise<void> {
  bindings = env;
  ready ??= (async () => {
    useDatabase(d1Database(env.DB));
    setUploadStore({
      save: async (fileName, bytes, mime) => { await env.UPLOADS.put(fileName, bytes, { httpMetadata: { contentType: mime } }); },
    });
    await applySchema(env.DB);
    await seed();
  })().catch(error => { ready = undefined; throw error; });
  return ready;
}

export default {
  async fetch(request: Request, env: Env, ctx: unknown): Promise<Response> {
    await setup(env);
    return server.fetch!(request, env, ctx);
  },
};
