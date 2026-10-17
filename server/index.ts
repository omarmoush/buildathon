// Local Node entry: SQLite file via better-sqlite3 and uploads on disk. Cloudflare uses server/worker.ts.
import express from "express";
import pinoHttp from "pino-http";
import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp, logger, safeRequestPath } from "./app";
import { ensureOrderCodes, useDatabase } from "./db";
import { createDatabase } from "./sqlite";
import { setUploadStore } from "./storage";
import { seed } from "./seed";

export { logger, safeRequestPath };

// Both index.ts and bundled dist/index.js resolve to the same server directory.
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const serverDirectory = path.basename(moduleDirectory) === "dist" ? path.dirname(moduleDirectory) : moduleDirectory;
export const projectDirectory = path.dirname(serverDirectory);
export const uploadDirectory = path.join(projectDirectory, "uploads");
export const sqlitePath = path.join(serverDirectory, "data", "wasta.sqlite");
mkdirSync(path.dirname(sqlitePath), { recursive: true });
mkdirSync(uploadDirectory, { recursive: true });

useDatabase(createDatabase(sqlitePath));
setUploadStore({ save: (fileName, bytes) => writeFile(path.join(uploadDirectory, fileName), bytes, { flag: "wx" }) });

const demoImages = path.join(projectDirectory, "artifacts/api-server/uploads");
export const app = createApp({
  database: "sqlite",
  requestLogger: pinoHttp({
    logger, wrapSerializers: false,
    serializers: {
      req: req => ({ id: req.id, method: req.method, path: safeRequestPath(String(req.url ?? "")) }),
      res: res => ({ statusCode: res.statusCode }),
    },
  }),
  uploadHandlers: [express.static(uploadDirectory), express.static(demoImages)],
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await seed();
  await ensureOrderCodes();
  const port = Number(process.env.PORT ?? 8080);
  const server = app.listen(port, "0.0.0.0", () => logger.info({ port, database: "sqlite" }, "Wasta backend listening"));
  const close = () => server.close(() => process.exit(0));
  process.once("SIGTERM", close);
  process.once("SIGINT", close);
}
