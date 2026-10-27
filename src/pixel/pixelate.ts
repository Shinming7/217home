import { PAL } from "../game/palette";
import type { CharacterLook } from "../game/types";
import {
  dominantColor,
  EDG32,
  hexToRgb,
  medianCut,
  mostSaturated,
  nearestColor,
  saturation,
  shade,
  type RGB,
} from "./colors";

const GRID = 32;
const OUT = 64;

export type PixelateResult = {
  pixelDataUrl: string;
  swatches: string[];
  look: CharacterLook;
};

function regionDominant(grid: string[], x0: number, y0: number, x1: number, y1: number): string {
  const pixels: string[] = [];
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      pixels.push(grid[y * GRID + x]);
    }
  }
  return dominantColor(pixels);
}

function brighten(hex: string, amount: number): string {
  return shade(hex, amount);
}

function deriveLook(grid: string[], swatches: string[]): CharacterLook {
  let skin = regionDominant(grid, 12, 12, 20, 20);
  if (saturation(skin) < 0.05) skin = regionDominant(grid, 10, 10, 22, 22);
  const hair = regionDominant(grid, 8, 0, 24, 8);
  const shirt = regionDominant(grid, 6, 21, 26, 29);
  const accent = mostSaturated(swatches, [hair, skin, shirt]);
  let pants = nearestColor(hexToRgb(shade(shirt, -0.45)));
  if (pants === shirt) pants = PAL.navy;
  if (pants === skin) pants = PAL.navy;
  return {
    hair,
    hairDark: brighten(hair, -0.32),
    skin,
    skinDark: brighten(skin, -0.22),
    shirt,
    shirtDark: brighten(shirt, -0.3),
    pants,
    pantsDark: brighten(pants, -0.3),
    shoes: PAL.ink,
    accent,
    outline: PAL.ink,
  };
}

export async function pixelateBitmap(bitmap: ImageBitmap): Promise<PixelateResult> {
  const source = document.createElement("canvas");
  source.width = GRID;
  source.height = GRID;
  const ctx = source.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas_unavailable");
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, GRID, GRID);

  const data = ctx.getImageData(0, 0, GRID, GRID).data;
  const raw: RGB[] = [];
  for (let i = 0; i < data.length; i += 4) {
    raw.push([data[i], data[i + 1], data[i + 2]]);
  }
  const swatches = medianCut(raw, 12).map((color) => nearestColor(hexToRgb(color)));
  const grid: string[] = raw.map((pixel) => nearestColor(pixel));

  const out = document.createElement("canvas");
  out.width = OUT;
  out.height = OUT;
  const outCtx = out.getContext("2d");
  if (!outCtx) throw new Error("canvas_unavailable");
  outCtx.imageSmoothingEnabled = false;
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      outCtx.fillStyle = grid[y * GRID + x];
      outCtx.fillRect(x * 2, y * 2, 2, 2);
    }
  }

  return {
    pixelDataUrl: out.toDataURL("image/png"),
    swatches: Array.from(new Set(swatches)).slice(0, 12),
    look: deriveLook(grid, swatches),
  };
}

export async function pixelateFile(file: File): Promise<PixelateResult> {
  const bitmap = await createImageBitmap(file);
  try {
    return await pixelateBitmap(bitmap);
  } finally {
    bitmap.close();
  }
}

export const DEFAULT_SWATCHES = EDG32;
