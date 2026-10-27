import { PAL } from "./palette";
import { buildSpriteRows, SPRITE_HEIGHT, SPRITE_WIDTH, type SpriteDir } from "./spriteData";
import type { CharacterLook, Dir, WalkFrame } from "./types";

const spriteCache = new Map<string, HTMLCanvasElement>();
const portraitCache = new Map<string, HTMLCanvasElement>();

function mixHex(a: string, b: string, t: number): string {
  const pa = a.replace("#", "");
  const pb = b.replace("#", "");
  const channels = [0, 2, 4].map((offset) => {
    const ca = parseInt(pa.slice(offset, offset + 2), 16);
    const cb = parseInt(pb.slice(offset, offset + 2), 16);
    return Math.round(ca + (cb - ca) * t)
      .toString(16)
      .padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

function colorMap(look: CharacterLook): Record<string, string> {
  return {
    o: look.outline,
    h: look.hair,
    H: mixHex(look.hair, "#ffffff", 0.28),
    a: look.accent,
    s: look.skin,
    S: look.skinDark,
    r: mixHex(look.skin, PAL.coral, 0.38),
    e: look.outline,
    w: "#ffffff",
    m: mixHex(look.skin, look.outline, 0.55),
    c: look.shirt,
    C: look.shirtDark,
    p: look.pants,
    P: look.pantsDark,
    b: look.shoes,
  };
}

function lookKey(look: CharacterLook): string {
  return [
    look.hair,
    look.hairDark,
    look.skin,
    look.skinDark,
    look.shirt,
    look.shirtDark,
    look.pants,
    look.pantsDark,
    look.shoes,
    look.accent,
    look.outline,
  ].join("|");
}

function makeSprite(look: CharacterLook, dir: SpriteDir, frame: WalkFrame): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = SPRITE_WIDTH;
  canvas.height = SPRITE_HEIGHT;
  const ctx = canvas.getContext("2d")!;
  const colors = colorMap(look);
  const rows = buildSpriteRows(dir, frame);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const color = colors[row[x]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  return canvas;
}

export function getCharacterSprite(
  look: CharacterLook,
  dir: Dir,
  frame: WalkFrame,
): HTMLCanvasElement {
  const spriteDir: SpriteDir = dir === "left" ? "right" : dir;
  const key = `${lookKey(look)}|${spriteDir}|${frame}`;
  const cached = spriteCache.get(key);
  if (cached) {
    if (dir !== "left") return cached;
    return flipSprite(cached, key);
  }
  const sprite = makeSprite(look, spriteDir, frame);
  spriteCache.set(key, sprite);
  return dir === "left" ? flipSprite(sprite, key) : sprite;
}

const flipCache = new Map<string, HTMLCanvasElement>();

function flipSprite(sprite: HTMLCanvasElement, key: string): HTMLCanvasElement {
  const cached = flipCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = SPRITE_WIDTH;
  canvas.height = SPRITE_HEIGHT;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.translate(SPRITE_WIDTH, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(sprite, 0, 0);
  flipCache.set(key, canvas);
  return canvas;
}

export function getCharacterPortrait(look: CharacterLook): HTMLCanvasElement {
  const key = `portrait|${lookKey(look)}`;
  const cached = portraitCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = PAL.plum;
  ctx.fillRect(0, 0, 64, 32);
  ctx.fillStyle = PAL.grape;
  ctx.fillRect(0, 32, 64, 32);
  ctx.fillStyle = PAL.amber;
  ctx.fillRect(44, 8, 10, 10);
  ctx.fillStyle = PAL.lemon;
  ctx.fillRect(46, 10, 6, 6);

  ctx.fillStyle = PAL.navy;
  ctx.fillRect(0, 52, 64, 12);
  ctx.fillStyle = PAL.teal;
  ctx.fillRect(0, 56, 64, 8);

  const sprite = getCharacterSprite(look, "down", "idle");
  ctx.drawImage(sprite, 2, 0, 12, 13, 8, 6, 48, 52);

  portraitCache.set(key, canvas);
  return canvas;
}
