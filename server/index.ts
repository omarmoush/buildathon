import express, { type ErrorRequestHandler, type Router } from "express";
import cookieParser from "cookie-parser";
import pino from "pino";
import pinoHttp from "pino-http";
import { ZodError } from "zod";
import { MulterError } from "multer";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ApiError, projectDirectory, serverDirectory, uploadDirectory } from "./db";
import { seed } from "./seed";
import { ordersRouter } from "./routes/orders";
import { quotesRouter } from "./routes/quotes";
import { paymentsRouter } from "./routes/payments";
import { paymobRouter } from "./routes/paymob";
import { uploadsRouter } from "./routes/uploads";
import { fxRouter } from "./routes/fx";
import { estimatesRouter } from "./routes/estimates";
import { paymobConfig } from "./lib/paymob-config";

export const logger = pino({
  redact: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie"],
});
export const safeRequestPath = (url: string) =>
  url.split("?")[0]?.replace(/\/(b|buyer)\/[^/]+/g, "/$1/[private-token]") ?? "/";
export const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(pinoHttp({
  logger, wrapSerializers: false,
  serializers: {
    req: req => ({ id: req.id, method: req.method, path: safeRequestPath(String(req.url ?? "")) }),
    res: res => ({ statusCode: res.statusCode }),
  },
}));
app.use((_req, res, next) => { res.setHeader("X-Content-Type-Options", "nosniff"); next(); });
app.use(express.json({ limit: "12mb" }), cookieParser());
const demoImages = path.join(projectDirectory, "artifacts/api-server/uploads");
app.use(["/uploads", "/api/uploads"], express.static(uploadDirectory), express.static(demoImages));
app.get("/api/healthz", (_req, res) => {
  const paymob = paymobConfig();
  res.json({ status: "ok", database: "sqlite", payments: paymob ? `paymob-${paymob.mode}` : "unavailable" });
});
app.use("/api", fxRouter, ordersRouter, quotesRouter, paymentsRouter, uploadsRouter, paymobRouter, estimatesRouter);

// Person 2 retains ownership. New route files are mounted on restart, never rewritten.
for (const [name, exportName] of [["catalog", "catalogRouter"], ["meshy", "meshyRouter"]] as const) {
  const modulePath = path.join(serverDirectory, "routes", `${name}.ts`);
  if (existsSync(modulePath)) {
    const module = await import(pathToFileURL(modulePath).href) as Record<string, Router>;
    const router = module.default ?? module[exportName] ?? module.router;
    if (!router) throw new Error(`${name}.ts must export default, ${exportName}, or router.`);
    app.use("/api", router);
  } else {
    app.use(`/api/${name}`, (_req, res) => { res.status(501).json({ error: `${name} routes are owned by Person 2 and are not installed yet.`, code: "CONTRIBUTOR_ROUTE_PENDING" }); });
  }
}
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
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  seed();
  const port = Number(process.env.PORT ?? 8080);
  const server = app.listen(port, "0.0.0.0", () => logger.info({ port, database: "sqlite" }, "Wasta backend listening"));
  const close = () => server.close(() => process.exit(0));
  process.once("SIGTERM", close);
  process.once("SIGINT", close);
}
