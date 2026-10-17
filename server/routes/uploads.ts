import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ApiError, uploadDirectory } from "../db";
import { rateLimit } from "./orders";
export const uploadsRouter = Router();
const maxSize = 8 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxSize, files: 1, fields: 2 } });
function imageType(bytes: Buffer): { extension: string; mime: string } | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { extension: "png", mime: "image/png" };
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { extension: "jpg", mime: "image/jpeg" };
  if (["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) return { extension: "gif", mime: "image/gif" };
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP")
    return { extension: "webp", mime: "image/webp" };
  return null;
}
uploadsRouter.post("/uploads", rateLimit("uploads", 50, 3600000), upload.single("file"), async (req, res) => {
  let bytes: Buffer; let mime: string;
  if (req.file) { bytes = req.file.buffer; mime = req.file.mimetype; }
  else {
    // Compatibility for the existing owner's JSON upload form.
    const data = z.object({ dataUrl: z.string().max(12 * 1024 * 1024) }).parse(req.body);
    const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(data.dataUrl);
    if (!match) throw new ApiError(400, "Upload a PNG, JPEG, GIF, or WebP image.");
    mime = match[1]!; bytes = Buffer.from(match[2]!, "base64");
  }
  if (!bytes.length || bytes.length > maxSize) throw new ApiError(413, "The image must be smaller than 8 MB.");
  const detected = imageType(bytes);
  if (!detected || detected.mime !== mime) throw new ApiError(400, "The file contents do not match an allowed image type.");
  const fileName = `${randomUUID()}.${detected.extension}`;
  await writeFile(path.join(uploadDirectory, fileName), bytes, { flag: "wx" });
  res.status(201).json({ url: `/uploads/${fileName}` });
});
