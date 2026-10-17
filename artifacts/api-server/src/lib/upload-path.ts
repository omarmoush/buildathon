import path from "node:path";

export function getLocalUploadsDirectory(): string {
  const currentDirectory = process.cwd();
  const apiDirectory =
    path.basename(currentDirectory) === "api-server"
      ? currentDirectory
      : path.resolve(currentDirectory, "artifacts/api-server");
  return path.join(apiDirectory, "uploads");
}
