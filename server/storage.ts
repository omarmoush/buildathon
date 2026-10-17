// Where uploaded images are saved: the local uploads/ folder under Node, R2 on Cloudflare.
export interface UploadStore {
  save(fileName: string, bytes: Uint8Array, mime: string): Promise<void>;
}

let store: UploadStore | null = null;
export function setUploadStore(next: UploadStore): void { store = next; }
export function uploadStore(): UploadStore {
  if (!store) throw new Error("No upload store is configured.");
  return store;
}
