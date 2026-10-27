import type { CharacterLook } from "../game/types";
import { pixelateBitmap } from "./pixelate";

export type PreparedPhoto = {
  origBase64: string;
  origDataUrl: string;
  pixelBase64: string;
  pixelDataUrl: string;
  swatches: string[];
  look: CharacterLook;
};

const MAX_EDGE = 1280;
const TARGET_BYTES = 820_000;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(blob);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("encode_failed"))),
      "image/jpeg",
      quality,
    );
  });
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) throw new Error("invalid_photo");
  if (file.size > 20 * 1024 * 1024) throw new Error("photo_too_large");

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_unavailable");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);

    let quality = 0.84;
    let blob = await canvasToBlob(canvas, quality);
    while (blob.size > TARGET_BYTES && quality > 0.42) {
      quality -= 0.08;
      blob = await canvasToBlob(canvas, quality);
    }
    if (blob.size > 900_000) throw new Error("photo_too_large");

    const origBase64 = await blobToBase64(blob);
    const pixel = await pixelateBitmap(bitmap);
    return {
      origBase64,
      origDataUrl: `data:image/jpeg;base64,${origBase64}`,
      pixelBase64: pixel.pixelDataUrl.slice(pixel.pixelDataUrl.indexOf(",") + 1),
      pixelDataUrl: pixel.pixelDataUrl,
      swatches: pixel.swatches,
      look: pixel.look,
    };
  } finally {
    bitmap.close();
  }
}

export function dataUrlBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}
