import type { ImageIn } from "../../ipc/claude";

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
export const MAX_IMAGES = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // the core refuses more (contracts/ipc.md §1)

export type Attachment = ImageIn & { id: number; name: string; bytes: number };

/** Which of the pasted files can be attached, and the French reason for the first one refused. */
export function pickImages(files: File[], already: number): { ok: File[]; problem: string | null } {
  const ok: File[] = [];
  let problem: string | null = null;
  for (const f of files) {
    if (!f.type.startsWith("image/")) continue; // not a picture: not our business
    if (!IMAGE_TYPES.includes(f.type)) problem ??= "Format d'image non pris en charge (PNG, JPEG, GIF ou WebP).";
    else if (f.size > MAX_IMAGE_BYTES) problem ??= "Image trop lourde (5 Mo au plus).";
    else if (already + ok.length >= MAX_IMAGES) problem ??= `${MAX_IMAGES} images au plus par message.`;
    else ok.push(f);
  }
  return { ok, problem };
}

/** Reads a picture as base64 (no `data:` prefix), the form `session_send` takes. */
export function toAttachment(file: File, id: number): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Image illisible."));
    r.onload = () => {
      const url = String(r.result);
      resolve({ id, name: file.name || `Image ${id}`, bytes: file.size, mediaType: file.type, data: url.slice(url.indexOf(",") + 1) });
    };
    r.readAsDataURL(file);
  });
}

export const sizeLabel = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`);
