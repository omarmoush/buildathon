import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import cookieParser from "cookie-parser";
import pino from "pino";
import { ZodError } from "zod";
import { MulterError } from "multer";
import { ApiError } from "./db";
import { ordersRouter } from "./routes/orders";
import { quotesRouter } from "./routes/quotes";
import { paymentsRouter } from "./routes/payments";
import { paymobRouter } from "./routes/paymob";
import { uploadsRouter } from "./routes/uploads";
import { fxRouter } from "./routes/fx";
import { estimatesRouter } from "./routes/estimates";
import catalogRouter from "./routes/catalog";
import meshyRouter from "./routes/meshy";
import { setMeshyTaskStore } from "../artifacts/api-server/src/routes/meshy";
import { meshyTaskStore } from "./lib/meshy-tasks";
import { paymobConfig } from "./lib/paymob-config";

export const logger = pino({
  redact: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie"],
});
export const safeRequestPath = (url: string) =>
  url.split("?")[0]?.replace(/\/(b|buyer)\/[^/]+/g, "/$1/[private-token]") ?? "/";

/**
 * Builds the API shared by the Node entry (server/index.ts) and the Cloudflare Worker (server/worker.ts).
 * `requestLogger` sets req.log (pino-http under Node; Workers get pino's console build, which pino-http can't use).
 * `uploadHandlers` serve /uploads and /api/uploads: local folders under Node, R2 on Cloudflare.
 */
export function createApp(options: { database: "sqlite" | "d1"; requestLogger: RequestHandler; uploadHandlers: RequestHandler[] }) {
  const { database, requestLogger, uploadHandlers } = options;
  setMeshyTaskStore(meshyTaskStore);
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(requestLogger);
  app.use((_req, res, next) => { res.setHeader("X-Content-Type-Options", "nosniff"); next(); });
  app.use(express.json({ limit: "12mb" }), cookieParser());
  app.use(["/uploads", "/api/uploads"], ...uploadHandlers);
  app.get("/api/healthz", (_req, res) => {
    const paymob = paymobConfig();
    res.json({ status: "ok", database, payments: paymob ? `paymob-${paymob.mode}` : "unavailable" });
  });
  app.use("/api", fxRouter, ordersRouter, quotesRouter, paymentsRouter, uploadsRouter, paymobRouter, estimatesRouter);
  // Person 2's catalog and Meshy routes (server/routes/catalog.ts, meshy.ts).
  app.use("/api", catalogRouter, meshyRouter);
  app.use((_req, res) => { res.status(404).json({ error: "API route not found." }); });
  const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
    if (error instanceof ZodError) { res.status(400).json({ error: "Invalid request.", details: error.issues.map(issue => ({ path: issue.path, message: issue.message })) }); return; }
    if (error instanceof ApiError) { res.status(error.status).json({ error: error.message, code: error.code }); return; }
    if (error instanceof MulterError) { res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: error.message }); return; }
    if (error?.type === "entity.too.large") { res.status(413).json({ error: "Request is too large." }); return; }
    if (error instanceof SyntaxError && "body" in error) { res.status(400).json({ error: "Invalid JSON body." }); return; }
    req.log.error({ err: error }, "API request failed");
    res.status(500).json({ error: "Unexpected server error." });
  };
  app.use(errorHandler);
  return app;
}
