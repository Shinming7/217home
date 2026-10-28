import { PAL } from "./palette";
import type { Dir } from "./types";

export type DogFrame = "idle" | "a" | "b" | "sit" | "wag";

const cache = new Map<string, HTMLCanvasElement>();

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function drawRight(ctx: CanvasRenderingContext2D, frame: DogFrame) {
  const sitting = frame === "sit" || frame === "wag";

  if (sitting) {
    px(ctx, 0, 8, 4, 1, PAL.rust);
    px(ctx, 1, 6, 2, 3, PAL.amber);
  } else {
    px(ctx, 0, 2, 2, 2, PAL.rust);
    px(ctx, 1, 4, 2, 2, PAL.amber);
  }

  px(ctx, 3, 4, 9, 5, PAL.amber);
  px(ctx, 4, 4, 7, 1, PAL.cream);
  px(ctx, 4, 8, 6, 1, PAL.cream);
  px(ctx, 3, 5, 3, 4, PAL.wood);

  px(ctx, 10, 1, 5, 6, PAL.amber);
  px(ctx, 11, 1, 2, 3, PAL.wood);
  px(ctx, 12, 3, 1, 1, PAL.ink);
  px(ctx, 13, 4, 2, 2, PAL.cream);
  px(ctx, 15, 4, 1, 1, PAL.ink);
  px(ctx, 13, 6, 2, 1, PAL.wood);
  px(ctx, 10, 6, 2, 1, PAL.cherry);
  px(ctx, 11, 7, 1, 1, PAL.lemon);

  if (sitting) {
    px(ctx, 2, 8, 5, 3, PAL.wood);
    px(ctx, 3, 8, 4, 2, PAL.amber);
    px(ctx, 9, 8, 2, 3, PAL.amber);
    px(ctx, 9, 11, 2, 1, PAL.cream);
    px(ctx, 4, 11, 3, 1, PAL.cream);
    if (frame === "wag") {
      px(ctx, 0, 5, 3, 2, PAL.amber);
      px(ctx, 0, 4, 1, 2, PAL.rust);
    }
    return;
  }

  if (frame === "a") {
    px(ctx, 9, 9, 2, 2, PAL.amber);
    px(ctx, 5, 9, 2, 2, PAL.wood);
    px(ctx, 9, 11, 2, 1, PAL.cream);
    px(ctx, 5, 11, 2, 1, PAL.cream);
  } else if (frame === "b") {
    px(ctx, 8, 9, 2, 2, PAL.amber);
    px(ctx, 4, 9, 2, 2, PAL.wood);
    px(ctx, 8, 11, 2, 1, PAL.cream);
    px(ctx, 4, 11, 2, 1, PAL.cream);
  } else {
    px(ctx, 9, 9, 2, 2, PAL.amber);
    px(ctx, 4, 9, 2, 2, PAL.wood);
    px(ctx, 9, 11, 2, 1, PAL.cream);
    px(ctx, 4, 11, 2, 1, PAL.cream);
  }
}

function drawDown(ctx: CanvasRenderingContext2D, frame: DogFrame) {
  const sitting = frame === "sit" || frame === "wag";

  px(ctx, 12, sitting ? (frame === "wag" ? 7 : 10) : 4, 2, sitting ? 3 : 4, PAL.wood);
  px(ctx, 13, sitting ? (frame === "wag" ? 6 : 9) : 3, 2, 1, PAL.rust);

  px(ctx, 4, 6, 7, 4, PAL.amber);
  px(ctx, 5, 9, 5, 1, PAL.cream);

  px(ctx, 4, 1, 7, 6, PAL.amber);
  px(ctx, 3, 2, 2, 3, PAL.wood);
  px(ctx, 10, 2, 2, 3, PAL.wood);
  px(ctx, 5, 3, 1, 1, PAL.ink);
  px(ctx, 9, 3, 1, 1, PAL.ink);
  px(ctx, 6, 4, 3, 2, PAL.cream);
  px(ctx, 7, 4, 1, 1, PAL.ink);
  px(ctx, 7, 6, 1, 1, PAL.wood);
  px(ctx, 5, 6, 5, 1, PAL.cherry);
  px(ctx, 7, 7, 1, 1, PAL.lemon);

  if (sitting) {
    px(ctx, 3, 8, 10, 3, PAL.wood);
    px(ctx, 4, 8, 8, 2, PAL.amber);
    px(ctx, 5, 9, 2, 3, PAL.amber);
    px(ctx, 9, 9, 2, 3, PAL.amber);
    px(ctx, 5, 11, 2, 1, PAL.cream);
    px(ctx, 9, 11, 2, 1, PAL.cream);
    return;
  }

  if (frame === "a") {
    px(ctx, 4, 10, 2, 2, PAL.amber);
    px(ctx, 9, 10, 2, 2, PAL.amber);
    px(ctx, 4, 11, 2, 1, PAL.cream);
    px(ctx, 9, 11, 2, 1, PAL.cream);
  } else if (frame === "b") {
    px(ctx, 5, 10, 2, 2, PAL.amber);
    px(ctx, 10, 10, 2, 2, PAL.amber);
    px(ctx, 5, 11, 2, 1, PAL.cream);
    px(ctx, 10, 11, 2, 1, PAL.cream);
  } else {
    px(ctx, 4, 10, 2, 2, PAL.amber);
    px(ctx, 10, 10, 2, 2, PAL.amber);
    px(ctx, 4, 11, 2, 1, PAL.cream);
    px(ctx, 10, 11, 2, 1, PAL.cream);
  }
}

function drawUp(ctx: CanvasRenderingContext2D, frame: DogFrame) {
  const sitting = frame === "sit" || frame === "wag";

  px(ctx, 7, sitting ? (frame === "wag" ? 8 : 10) : 0, 2, sitting ? 2 : 3, PAL.amber);
  px(ctx, 7, sitting ? (frame === "wag" ? 8 : 10) : 0, 2, 1, PAL.rust);

  px(ctx, 4, 5, 7, 5, PAL.amber);
  px(ctx, 5, 6, 5, 1, PAL.cream);

  px(ctx, 4, 1, 7, 5, PAL.amber);
  px(ctx, 3, 2, 2, 3, PAL.wood);
  px(ctx, 10, 2, 2, 3, PAL.wood);
  px(ctx, 6, 4, 3, 1, PAL.wood);

  if (sitting) {
    px(ctx, 3, 8, 10, 3, PAL.wood);
    px(ctx, 4, 8, 8, 2, PAL.amber);
    px(ctx, 4, 11, 3, 1, PAL.cream);
    px(ctx, 9, 11, 3, 1, PAL.cream);
    return;
  }

  if (frame === "a") {
    px(ctx, 4, 10, 2, 2, PAL.amber);
    px(ctx, 10, 10, 2, 2, PAL.wood);
    px(ctx, 4, 11, 2, 1, PAL.cream);
    px(ctx, 10, 11, 2, 1, PAL.cream);
  } else if (frame === "b") {
    px(ctx, 5, 10, 2, 2, PAL.amber);
    px(ctx, 9, 10, 2, 2, PAL.wood);
    px(ctx, 5, 11, 2, 1, PAL.cream);
    px(ctx, 9, 11, 2, 1, PAL.cream);
  } else {
    px(ctx, 4, 10, 2, 2, PAL.amber);
    px(ctx, 10, 10, 2, 2, PAL.wood);
    px(ctx, 4, 11, 2, 1, PAL.cream);
    px(ctx, 10, 11, 2, 1, PAL.cream);
  }
}

function flip(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.translate(source.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(source, 0, 0);
  return canvas;
}

export function getDogSprite(dir: Dir, frame: DogFrame): HTMLCanvasElement {
  const key = `${dir}|${frame}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 12;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  if (dir === "down") drawDown(ctx, frame);
  else if (dir === "up") drawUp(ctx, frame);
  else drawRight(ctx, frame);
  const sprite = dir === "left" ? flip(canvas) : canvas;
  cache.set(key, sprite);
  return sprite;
}
