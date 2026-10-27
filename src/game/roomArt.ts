import { PAL } from "./palette";
import type { Phase } from "./types";
import {
  CORKBOARD,
  OCTAGON,
  PENDANT,
  PHOTO_FRAMES,
  WINDOW,
  type PropSpec,
} from "./roomData";

type Ctx = CanvasRenderingContext2D;

function px(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function outline(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(x + 1, y, w - 2, 1);
  ctx.fillRect(x + 1, y + h - 1, w - 2, 1);
  ctx.fillRect(x, y + 1, 1, h - 2);
  ctx.fillRect(x + w - 1, y + 1, 1, h - 2);
}

function drawWall(ctx: Ctx) {
  px(ctx, 0, 0, 384, 64, PAL.cream);
  for (let x = 8; x < 384; x += 16) {
    px(ctx, x, 8, 1, 44, "rgba(194,133,105,0.16)");
  }
  for (let y = 16; y < 52; y += 16) {
    for (let x = 16; x < 384; x += 32) {
      px(ctx, x, y, 2, 2, "rgba(194,133,105,0.22)");
    }
  }
  px(ctx, 0, 54, 384, 2, "rgba(194,133,105,0.5)");
  px(ctx, 0, 56, 384, 2, PAL.clay);
  px(ctx, 0, 58, 384, 5, PAL.woodLight);
  px(ctx, 0, 58, 384, 1, PAL.sand);
  px(ctx, 0, 63, 384, 1, PAL.ink);
}

function drawFloor(ctx: Ctx) {
  for (let row = 0; row < 12; row += 1) {
    const y = 64 + row * 16;
    px(ctx, 0, y, 384, 16, row % 2 === 0 ? "#c97f52" : "#c0774b");
    px(ctx, 0, y, 384, 1, "rgba(234,212,170,0.10)");
    px(ctx, 0, y + 15, 384, 1, "rgba(122,72,49,0.55)");
    const offset = row % 2 === 0 ? 0 : 48;
    for (let x = offset; x < 384; x += 96) {
      px(ctx, x, y, 1, 16, "rgba(115,62,57,0.35)");
      px(ctx, x + 1, y + 1, 1, 14, "rgba(234,212,170,0.08)");
    }
    for (let grain = 0; grain < 3; grain += 1) {
      const gx = (row * 53 + grain * 71 + 17) % 340;
      px(ctx, gx, y + 5 + grain * 3, 10 + (grain % 2) * 6, 1, "rgba(115,62,57,0.14)");
    }
  }
  px(ctx, 0, 64, 384, 2, "rgba(24,20,37,0.30)");
  px(ctx, 0, 66, 384, 2, "rgba(24,20,37,0.15)");
  px(ctx, 0, 68, 384, 3, "rgba(24,20,37,0.06)");
}

type Point = { x: number; y: number };

function octagonPoints(cx: number, cy: number, rx: number, ry: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < 8; i += 1) {
    const angle = Math.PI / 8 + (i * Math.PI) / 4;
    points.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry });
  }
  return points;
}

function fillPolygon(ctx: Ctx, points: Point[], color: string) {
  const ys = points.map((point) => point.y);
  const top = Math.floor(Math.min(...ys));
  const bottom = Math.ceil(Math.max(...ys));
  ctx.fillStyle = color;
  for (let y = top; y <= bottom; y += 1) {
    const crossings: number[] = [];
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
        crossings.push(a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y));
      }
    }
    crossings.sort((m, n) => m - n);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const left = Math.round(crossings[i]);
      const right = Math.round(crossings[i + 1]);
      if (right > left) ctx.fillRect(left, y, right - left, 1);
    }
  }
}

const DIGITS: Record<string, string[]> = {
  "2": ["110", "001", "110", "100", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "7": ["111", "001", "010", "010", "010"],
};

function drawFightLogo(ctx: Ctx, cx: number, cy: number) {
  ctx.fillStyle = "rgba(234,212,170,0.30)";
  fillPolygon(ctx, octagonPoints(cx, cy, 27, 18), "rgba(234,212,170,0.30)");
  fillPolygon(ctx, octagonPoints(cx, cy, 25.5, 16.5), PAL.navy);

  const scale = 2;
  const glyphW = 3 * scale;
  const gap = 2;
  const text = "217";
  let cursor = Math.round(cx - (glyphW * text.length + gap * (text.length - 1)) / 2);
  const top = Math.round(cy - (5 * scale) / 2);
  for (const char of text) {
    const glyph = DIGITS[char];
    ctx.fillStyle = PAL.cream;
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        if (glyph[row][col] === "1") {
          ctx.fillRect(cursor + col * scale, top + row * scale, scale, scale);
        }
      }
    }
    cursor += glyphW + gap;
  }
}

function drawOctagon(ctx: Ctx) {
  const { x, y, w, h } = OCTAGON;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;

  fillPolygon(ctx, octagonPoints(cx, cy + 3, rx + 2, ry + 2), "rgba(24,20,37,0.25)");
  fillPolygon(ctx, octagonPoints(cx, cy, rx, ry), PAL.ink);
  fillPolygon(ctx, octagonPoints(cx, cy, rx - 2.5, ry - 2), PAL.clay);
  fillPolygon(ctx, octagonPoints(cx, cy, rx - 5, ry - 4), PAL.night);
  fillPolygon(ctx, octagonPoints(cx, cy, rx - 9, ry - 7.5), PAL.navy);
  fillPolygon(ctx, octagonPoints(cx, cy, rx - 10, ry - 8.5), PAL.steel);
  fillPolygon(ctx, octagonPoints(cx, cy, rx - 11, ry - 9.5), PAL.navy);
  drawFightLogo(ctx, cx, cy);

  const points = octagonPoints(cx, cy, rx - 4, ry - 3);
  const back = [4, 5, 6, 7];
  const fenceHeight = 18;

  const edgeY = (a: Point, b: Point, xx: number) =>
    a.y + ((b.y - a.y) * (xx - a.x)) / (b.x - a.x);
  for (let i = 0; i < back.length - 1; i += 1) {
    const a = points[back[i]];
    const b = points[back[i + 1]];
    const x1 = Math.round(Math.min(a.x, b.x));
    const x2 = Math.round(Math.max(a.x, b.x));
    for (let xx = x1; xx <= x2; xx += 1) {
      const baseY = Math.round(edgeY(a, b, xx));
      ctx.fillStyle = "rgba(139,155,180,0.13)";
      ctx.fillRect(xx, baseY - fenceHeight, 1, fenceHeight);
      ctx.fillStyle = "rgba(192,203,220,0.62)";
      ctx.fillRect(xx, baseY - fenceHeight, 1, 1);
      ctx.fillRect(xx, baseY - Math.round(fenceHeight * 0.5), 1, 1);
      ctx.fillRect(xx, baseY, 1, 1);
    }
    for (let xx = x1 + 2; xx <= x2 - 2; xx += 4) {
      const baseY = Math.round(edgeY(a, b, xx));
      ctx.fillStyle = "rgba(139,155,180,0.52)";
      ctx.fillRect(xx, baseY - fenceHeight + 1, 1, fenceHeight - 1);
    }
  }

  for (const index of back) {
    const post = points[index];
    const px0 = Math.round(post.x) - 2;
    const py0 = Math.round(post.y) - fenceHeight - 3;
    px(ctx, px0, py0, 5, fenceHeight + 4, PAL.ink);
    px(ctx, px0 + 1, py0 + 1, 3, fenceHeight + 2, PAL.steel);
    px(ctx, px0 + 1, py0 + 1, 1, fenceHeight + 2, PAL.silver);
    px(ctx, px0 + 1, py0, 3, 1, PAL.cream);
  }

  for (const index of [0, 1, 2, 3]) {
    const post = points[index];
    const px0 = Math.round(post.x) - 1;
    const py0 = Math.round(post.y) - 6;
    px(ctx, px0, py0, 3, 7, PAL.ink);
    px(ctx, px0 + 1, py0 + 1, 1, 5, PAL.steel);
  }

  const leftPad = points[4];
  const rightPad = points[7];
  for (const [pad, color] of [
    [leftPad, PAL.cherry],
    [rightPad, PAL.blue],
  ] as const) {
    const px0 = Math.round(pad.x) - 2;
    const py0 = Math.round(pad.y) - fenceHeight - 10;
    px(ctx, px0, py0, 5, 8, PAL.ink);
    px(ctx, px0 + 1, py0 + 1, 3, 6, color);
    px(ctx, px0 + 1, py0 + 3, 3, 1, PAL.cream);
  }

  const gateA = points[2];
  const gateB = points[1];
  for (let xx = Math.round(gateA.x) + 2; xx < Math.round(gateB.x) - 1; xx += 4) {
    px(ctx, xx, Math.round(gateA.y), 2, 1, PAL.cream);
  }
}

function drawPhoto(ctx: Ctx, frame: (typeof PHOTO_FRAMES)[number]) {
  const { x, y, w, h, variant } = frame;
  px(ctx, x - 2, y - 2, w + 4, h + 4, "rgba(24,20,37,0.35)");
  px(ctx, x, y, w, h, PAL.ink);
  px(ctx, x + 1, y + 1, w - 2, h - 2, PAL.wood);
  px(ctx, x + 1, y + 1, w - 2, 1, PAL.woodLight);
  const ix = x + 4;
  const iy = y + 4;
  const iw = w - 8;
  const ih = h - 8;

  if (variant === "sunset") {
    px(ctx, ix, iy, iw, ih, PAL.orange);
    px(ctx, ix, iy + Math.floor(ih / 2), iw, Math.ceil(ih / 2), PAL.plum);
    px(ctx, ix, iy + ih - 4, iw, 4, PAL.navy);
    px(ctx, ix + 3, iy + 3, 4, 4, PAL.lemon);
    px(ctx, ix + 1, iy + ih - 8, 6, 4, PAL.grape);
    px(ctx, ix + 8, iy + ih - 6, 8, 2, PAL.grape);
  } else if (variant === "friends") {
    px(ctx, ix, iy, iw, ih, PAL.cream);
    px(ctx, ix + 2, iy + 2, iw - 4, ih - 4, PAL.teal);
    px(ctx, ix + 3, iy + 5, 4, 4, PAL.peach);
    px(ctx, ix + 2, iy + 9, 6, 5, PAL.cherry);
    px(ctx, ix + iw - 7, iy + 5, 4, 4, PAL.peach);
    px(ctx, ix + iw - 8, iy + 9, 6, 5, PAL.grass);
    px(ctx, ix + Math.floor(iw / 2) - 1, iy + 3, 2, 2, PAL.lemon);
  } else {
    px(ctx, ix, iy, iw, ih, PAL.ink);
    px(ctx, ix, iy, iw, 3, PAL.night);
    px(ctx, ix + iw - 7, iy + 3, 4, 4, PAL.cream);
    px(ctx, ix + 2, iy + 4, 1, 1, PAL.white);
    px(ctx, ix + 6, iy + 8, 1, 1, PAL.white);
    px(ctx, ix + 11, iy + 3, 1, 1, PAL.white);
    px(ctx, ix, iy + ih - 3, iw, 3, PAL.navy);
  }
}

function drawCorkboard(ctx: Ctx) {
  const { x, y, w, h } = CORKBOARD;
  px(ctx, x - 2, y - 2, w + 4, h + 4, "rgba(24,20,37,0.35)");
  px(ctx, x, y, w, h, PAL.ink);
  px(ctx, x + 1, y + 1, w - 2, h - 2, PAL.clay);
  px(ctx, x + 3, y + 3, w - 6, h - 6, PAL.sand);
  const notes = [
    { x: x + 6, y: y + 7, w: 15, h: 11, color: PAL.lemon, pin: PAL.cherry },
    { x: x + 25, y: y + 9, w: 12, h: 9, color: PAL.coral, pin: PAL.blue },
    { x: x + 42, y: y + 6, w: 14, h: 12, color: PAL.lime, pin: PAL.cherry },
    { x: x + 10, y: y + 22, w: 13, h: 10, color: PAL.white, pin: PAL.blue },
    { x: x + 30, y: y + 24, w: 20, h: 8, color: PAL.cyan, pin: PAL.cherry },
  ];
  for (const note of notes) {
    px(ctx, note.x, note.y, note.w, note.h, note.color);
    px(ctx, note.x, note.y, note.w, 1, "rgba(255,255,255,0.45)");
    px(ctx, note.x + Math.floor(note.w / 2) - 1, note.y - 1, 2, 2, note.pin);
    for (let line = 0; line < 3; line += 1) {
      px(ctx, note.x + 2, note.y + 4 + line * 3, Math.max(4, note.w - 5), 1, "rgba(24,20,37,0.32)");
    }
  }
}

function drawPendant(ctx: Ctx) {
  px(ctx, PENDANT.x + 9, 0, 2, 18, PAL.ink);
  px(ctx, PENDANT.x + 1, 18, 18, 4, PAL.ink);
  px(ctx, PENDANT.x + 2, 19, 16, 2, PAL.brick);
  px(ctx, PENDANT.x + 3, 22, 14, 3, PAL.rust);
  px(ctx, PENDANT.x + 5, 25, 10, 3, PAL.orange);
  px(ctx, PENDANT.x + 8, 28, 4, 2, PAL.lemon);
  px(ctx, PENDANT.x + 5, 19, 4, 1, PAL.coral);
  px(ctx, PENDANT.x + 4, 30, 12, 4, "rgba(254,174,52,0.18)");
}

export function createRoomCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  drawWall(ctx);
  drawFloor(ctx);
  drawOctagon(ctx);
  PHOTO_FRAMES.forEach((frame) => drawPhoto(ctx, frame));
  drawCorkboard(ctx);
  drawPendant(ctx);
  return canvas;
}

function drawBed(ctx: Ctx) {
  // 地面投影
  px(ctx, 4, 40, 74, 4, "rgba(24,20,37,0.18)");
  px(ctx, 10, 43, 62, 2, "rgba(24,20,37,0.10)");

  // 床腿
  px(ctx, 14, 39, 7, 6, PAL.ink);
  px(ctx, 15, 40, 5, 4, PAL.wood);
  px(ctx, 64, 39, 7, 6, PAL.ink);
  px(ctx, 65, 40, 5, 4, PAL.wood);

  // 床头板（左端，高）
  px(ctx, 0, 0, 12, 44, PAL.ink);
  px(ctx, 1, 1, 10, 42, PAL.wood);
  px(ctx, 1, 1, 10, 2, PAL.woodLight);
  px(ctx, 1, 7, 10, 1, "rgba(24,20,37,0.30)");
  for (const sy of [13, 21, 29]) px(ctx, 4, sy, 1, 5, "rgba(24,20,37,0.24)");
  px(ctx, 9, 3, 1, 40, "rgba(24,20,37,0.28)");
  px(ctx, 2, 0, 6, 1, PAL.sand);

  // 床架前沿与床脚
  px(ctx, 9, 32, 68, 8, PAL.ink);
  px(ctx, 10, 33, 66, 6, PAL.wood);
  px(ctx, 10, 33, 66, 1, PAL.woodLight);
  px(ctx, 10, 38, 66, 1, "rgba(24,20,37,0.30)");

  // 床垫
  px(ctx, 10, 7, 66, 26, PAL.ink);
  px(ctx, 11, 8, 64, 24, PAL.cream);
  px(ctx, 11, 8, 64, 1, "rgba(255,255,255,0.30)");
  px(ctx, 11, 29, 64, 3, "rgba(194,133,105,0.30)");

  // 枕头
  px(ctx, 15, 11, 22, 1, "rgba(24,20,37,0.12)");
  px(ctx, 14, 12, 24, 14, PAL.white);
  px(ctx, 14, 12, 1, 1, PAL.cream);
  px(ctx, 37, 12, 1, 1, PAL.cream);
  px(ctx, 14, 25, 1, 1, PAL.cream);
  px(ctx, 37, 25, 1, 1, PAL.cream);
  px(ctx, 14, 25, 24, 1, "rgba(139,155,180,0.40)");
  px(ctx, 27, 13, 1, 11, "rgba(139,155,180,0.28)");
  px(ctx, 36, 13, 1, 12, "rgba(139,155,180,0.30)");
  px(ctx, 16, 24, 20, 1, "rgba(139,155,180,0.18)");

  // 折回的床单
  px(ctx, 39, 8, 1, 25, "rgba(24,20,37,0.20)");
  px(ctx, 40, 9, 5, 24, PAL.cream);
  px(ctx, 40, 9, 1, 24, "rgba(255,255,255,0.50)");
  px(ctx, 45, 9, 1, 24, "rgba(194,133,105,0.55)");
  px(ctx, 39, 9, 1, 2, PAL.cream);

  // 被子
  px(ctx, 44, 6, 30, 28, PAL.ink);
  px(ctx, 45, 7, 28, 26, PAL.teal);
  px(ctx, 45, 7, 28, 1, "rgba(139,155,180,0.38)");
  px(ctx, 72, 9, 1, 24, "rgba(24,20,37,0.28)");
  // 褶皱
  px(ctx, 53, 8, 1, 19, "rgba(24,20,37,0.18)");
  px(ctx, 61, 8, 1, 15, "rgba(24,20,37,0.14)");
  px(ctx, 48, 18, 24, 1, "rgba(192,203,220,0.14)");
  px(ctx, 55, 25, 15, 1, "rgba(24,20,37,0.12)");
  // 被子垂在床沿的两道褶
  px(ctx, 49, 31, 5, 2, PAL.teal);
  px(ctx, 58, 31, 7, 2, PAL.teal);
  px(ctx, 68, 31, 4, 2, PAL.teal);

  // 小熊（靠在床尾板前）
  px(ctx, 59, 14, 3, 3, PAL.ink);
  px(ctx, 60, 15, 1, 1, PAL.amber);
  px(ctx, 66, 14, 3, 3, PAL.ink);
  px(ctx, 67, 15, 1, 1, PAL.amber);
  px(ctx, 59, 17, 10, 7, PAL.ink);
  px(ctx, 60, 18, 8, 5, PAL.amber);
  px(ctx, 60, 18, 8, 1, PAL.lemon);
  px(ctx, 61, 19, 1, 1, PAL.ink);
  px(ctx, 66, 19, 1, 1, PAL.ink);
  px(ctx, 62, 21, 4, 2, PAL.cream);
  px(ctx, 63, 21, 1, 1, PAL.ink);
  px(ctx, 58, 24, 12, 5, PAL.ink);
  px(ctx, 59, 25, 10, 3, PAL.amber);
  px(ctx, 59, 27, 10, 1, "rgba(190,74,47,0.25)");

  // 床尾板（右端，矮）
  px(ctx, 74, 15, 10, 29, PAL.ink);
  px(ctx, 75, 16, 8, 26, PAL.wood);
  px(ctx, 75, 16, 8, 2, PAL.woodLight);
  px(ctx, 76, 21, 6, 1, "rgba(24,20,37,0.28)");
  px(ctx, 76, 27, 6, 1, "rgba(24,20,37,0.28)");
  px(ctx, 82, 18, 1, 24, "rgba(24,20,37,0.25)");
}

function drawDesk(ctx: Ctx) {
  px(ctx, 2, 62, 60, 4, "rgba(24,20,37,0.22)");
  px(ctx, 31, 8, 2, 14, PAL.ink);
  px(ctx, 21, 3, 22, 1, PAL.ink);
  px(ctx, 20, 4, 24, 5, PAL.rust);
  px(ctx, 21, 4, 22, 1, PAL.orange);
  px(ctx, 21, 9, 22, 3, PAL.orange);
  px(ctx, 23, 12, 18, 2, PAL.amber);
  px(ctx, 26, 14, 12, 2, PAL.lemon);
  px(ctx, 27, 16, 10, 4, PAL.ink);
  px(ctx, 28, 16, 8, 3, PAL.grape);
  px(ctx, 2, 20, 60, 8, PAL.ink);
  px(ctx, 3, 21, 58, 6, PAL.woodLight);
  px(ctx, 3, 21, 58, 1, PAL.sand);
  px(ctx, 4, 28, 56, 26, PAL.ink);
  px(ctx, 5, 29, 54, 24, PAL.wood);
  px(ctx, 7, 31, 24, 8, PAL.sand);
  px(ctx, 7, 31, 24, 1, PAL.cream);
  px(ctx, 7, 39, 24, 10, PAL.woodLight);
  px(ctx, 7, 39, 24, 1, PAL.sand);
  px(ctx, 9, 42, 20, 1, PAL.wood);
  px(ctx, 35, 31, 20, 8, PAL.sand);
  px(ctx, 35, 31, 20, 1, PAL.cream);
  px(ctx, 35, 39, 20, 10, PAL.woodLight);
  px(ctx, 35, 39, 20, 1, PAL.sand);
  px(ctx, 37, 42, 16, 1, PAL.wood);
  px(ctx, 39, 34, 12, 2, PAL.amber);
  px(ctx, 41, 36, 8, 1, PAL.ink);
  px(ctx, 5, 54, 6, 12, PAL.ink);
  px(ctx, 6, 54, 4, 12, PAL.grape);
  px(ctx, 53, 54, 6, 12, PAL.ink);
  px(ctx, 54, 54, 4, 12, PAL.grape);
  px(ctx, 12, 15, 12, 5, PAL.ink);
  px(ctx, 13, 16, 10, 3, PAL.cream);
  px(ctx, 14, 17, 8, 1, PAL.slate);
  px(ctx, 44, 14, 7, 6, PAL.ink);
  px(ctx, 45, 15, 5, 4, PAL.cherry);
  px(ctx, 45, 15, 5, 1, PAL.coral);
  px(ctx, 51, 16, 2, 2, PAL.cherry);
}

function drawChair(ctx: Ctx) {
  px(ctx, 2, 16, 18, 4, "rgba(24,20,37,0.25)");
  px(ctx, 3, 0, 16, 12, PAL.ink);
  px(ctx, 4, 1, 14, 9, PAL.woodLight);
  px(ctx, 4, 1, 14, 1, PAL.sand);
  px(ctx, 6, 3, 10, 5, PAL.wood);
  px(ctx, 1, 11, 20, 7, PAL.ink);
  px(ctx, 2, 12, 18, 4, PAL.wood);
  px(ctx, 2, 12, 18, 1, PAL.woodLight);
  px(ctx, 3, 17, 3, 3, PAL.grape);
  px(ctx, 16, 17, 3, 3, PAL.grape);
}

function drawSofa(ctx: Ctx) {
  px(ctx, 4, 34, 80, 5, "rgba(24,20,37,0.25)");
  px(ctx, 4, 0, 80, 18, PAL.ink);
  px(ctx, 5, 1, 78, 16, PAL.plum);
  px(ctx, 5, 1, 78, 1, PAL.coral);
  px(ctx, 8, 4, 32, 12, PAL.coral);
  px(ctx, 8, 4, 32, 1, "rgba(255,255,255,0.35)");
  px(ctx, 48, 4, 32, 12, PAL.coral);
  px(ctx, 48, 4, 32, 1, "rgba(255,255,255,0.35)");
  px(ctx, 0, 14, 10, 22, PAL.ink);
  px(ctx, 1, 15, 8, 20, PAL.grape);
  px(ctx, 78, 14, 10, 22, PAL.ink);
  px(ctx, 79, 15, 8, 20, PAL.grape);
  px(ctx, 5, 18, 78, 15, PAL.ink);
  px(ctx, 6, 19, 76, 13, PAL.plum);
  px(ctx, 8, 19, 34, 12, PAL.coral);
  px(ctx, 46, 19, 34, 12, PAL.coral);
  px(ctx, 8, 19, 34, 1, "rgba(255,255,255,0.3)");
  px(ctx, 46, 19, 34, 1, "rgba(255,255,255,0.3)");
  px(ctx, 0, 32, 88, 5, PAL.ink);
  px(ctx, 1, 33, 86, 3, PAL.grape);
  px(ctx, 8, 36, 6, 4, PAL.ink);
  px(ctx, 74, 36, 6, 4, PAL.ink);
  px(ctx, 12, 14, 10, 6, PAL.lemon);
  px(ctx, 66, 14, 10, 6, PAL.cyan);
}

function drawShelf(ctx: Ctx) {
  px(ctx, 3, 40, 22, 4, "rgba(24,20,37,0.25)");
  px(ctx, 0, 0, 28, 44, PAL.ink);
  px(ctx, 1, 1, 26, 42, PAL.wood);
  px(ctx, 1, 1, 26, 1, PAL.woodLight);
  px(ctx, 2, 2, 24, 2, PAL.clay);

  const shelfRows = [13, 26, 38];
  for (const shelfY of shelfRows) {
    px(ctx, 2, shelfY, 24, 2, PAL.ink);
    px(ctx, 2, shelfY, 24, 1, PAL.woodLight);
  }

  const books = [
    { x: 4, y: 5, w: 3, h: 8, color: PAL.cherry },
    { x: 8, y: 4, w: 2, h: 9, color: PAL.blue },
    { x: 11, y: 6, w: 4, h: 7, color: PAL.grass },
    { x: 16, y: 4, w: 2, h: 9, color: PAL.amber },
    { x: 19, y: 7, w: 3, h: 6, color: PAL.plum },
    { x: 6, y: 16, w: 2, h: 10, color: PAL.cyan },
    { x: 9, y: 18, w: 4, h: 8, color: PAL.clay },
    { x: 14, y: 16, w: 3, h: 10, color: PAL.lemon },
    { x: 18, y: 19, w: 2, h: 7, color: PAL.coral },
    { x: 21, y: 17, w: 3, h: 9, color: PAL.navy },
    { x: 4, y: 29, w: 4, h: 9, color: PAL.steel },
    { x: 9, y: 30, w: 2, h: 8, color: PAL.rust },
    { x: 12, y: 28, w: 3, h: 10, color: PAL.teal },
    { x: 16, y: 31, w: 4, h: 7, color: PAL.sand },
  ];
  for (const book of books) {
    const inset = book.w >= 3 ? 1 : 0;
    px(ctx, book.x, book.y, book.w, book.h, PAL.ink);
    px(ctx, book.x + inset, book.y + 1, book.w - inset * 2, book.h - 2, book.color);
    px(ctx, book.x + inset, book.y + 1, 1, book.h - 2, "rgba(255,255,255,0.20)");
  }

}

function drawPlant(ctx: Ctx) {
  px(ctx, 2, 34, 22, 4, "rgba(24,20,37,0.22)");
  px(ctx, 8, 16, 2, 10, PAL.ink);
  px(ctx, 14, 12, 2, 12, PAL.ink);
  px(ctx, 4, 5, 9, 9, PAL.ink);
  px(ctx, 5, 6, 7, 7, PAL.grass);
  px(ctx, 6, 7, 4, 4, PAL.lime);
  px(ctx, 11, 1, 9, 10, PAL.ink);
  px(ctx, 12, 2, 7, 8, PAL.grass);
  px(ctx, 13, 3, 4, 4, PAL.lime);
  px(ctx, 8, 10, 8, 8, PAL.ink);
  px(ctx, 9, 11, 6, 6, PAL.grass);
  px(ctx, 11, 12, 3, 3, PAL.lime);
  px(ctx, 1, 19, 24, 6, PAL.ink);
  px(ctx, 2, 20, 22, 4, PAL.rust);
  px(ctx, 4, 24, 18, 13, PAL.ink);
  px(ctx, 5, 24, 16, 11, PAL.brick);
  px(ctx, 5, 24, 16, 1, PAL.coral);
  px(ctx, 7, 29, 12, 2, PAL.rust);
  px(ctx, 9, 34, 8, 2, PAL.rust);
}

function drawTank(ctx: Ctx) {
  px(ctx, 4, 42, 42, 3, "rgba(24,20,37,0.25)");
  px(ctx, 6, 30, 38, 14, PAL.ink);
  px(ctx, 7, 31, 36, 12, PAL.wood);
  px(ctx, 7, 31, 36, 1, PAL.woodLight);
  px(ctx, 9, 36, 32, 2, PAL.grape);
  px(ctx, 8, 7, 34, 23, PAL.ink);
  px(ctx, 9, 8, 32, 21, "rgba(0,153,219,0.32)");
  px(ctx, 9, 8, 32, 1, PAL.cyan);
  px(ctx, 9, 8, 1, 21, PAL.silver);
  px(ctx, 40, 8, 1, 21, PAL.silver);
  px(ctx, 9, 28, 32, 1, PAL.silver);
  px(ctx, 8, 3, 34, 5, PAL.ink);
  px(ctx, 9, 4, 32, 3, PAL.grape);
  px(ctx, 9, 4, 32, 1, PAL.slate);
  px(ctx, 14, 24, 1, 4, PAL.grass);
  px(ctx, 16, 22, 3, 2, PAL.lime);
  px(ctx, 24, 16, 5, 2, PAL.orange);
  px(ctx, 24, 16, 2, 1, PAL.lemon);
  px(ctx, 29, 15, 2, 4, PAL.orange);
  px(ctx, 34, 24, 3, 2, PAL.coral);
  px(ctx, 35, 22, 1, 2, PAL.coral);
  px(ctx, 12, 12, 2, 2, PAL.silver);
  px(ctx, 36, 10, 1, 1, PAL.silver);
  px(ctx, 20, 11, 1, 1, PAL.silver);
}

export function createPropCanvas(spec: PropSpec): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = spec.w;
  canvas.height = spec.h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  if (spec.kind === "bed") drawBed(ctx);
  if (spec.kind === "desk") drawDesk(ctx);
  if (spec.kind === "chair") drawChair(ctx);
  if (spec.kind === "sofa") drawSofa(ctx);
  if (spec.kind === "shelf") drawShelf(ctx);
  if (spec.kind === "plant") drawPlant(ctx);
  if (spec.kind === "tank") drawTank(ctx);
  return canvas;
}

function drawSky(ctx: Ctx, phase: Phase, time: number, ix: number, iy: number, iw: number, ih: number) {
  const band = Math.ceil(ih / 3);
  if (phase === "day") {
    px(ctx, ix, iy, iw, band, PAL.blue);
    px(ctx, ix, iy + band, iw, band, PAL.cyan);
    px(ctx, ix, iy + band * 2, iw, ih - band * 2, PAL.silver);
    px(ctx, ix + 42, iy + 3, 8, 8, PAL.lemon);
    px(ctx, ix + 40, iy + 5, 12, 4, PAL.lemon);
    const drift = Math.floor((time * 3) % 40);
    px(ctx, ix + 8 + drift, iy + 16, 14, 3, PAL.white);
    px(ctx, ix + 12 + drift, iy + 14, 7, 2, PAL.white);
    px(ctx, ix + 26 - drift, iy + 24, 10, 2, PAL.white);
  } else if (phase === "dusk") {
    px(ctx, ix, iy, iw, band, PAL.grape);
    px(ctx, ix, iy + band, iw, band, PAL.rust);
    px(ctx, ix, iy + band * 2, iw, ih - band * 2, PAL.orange);
    px(ctx, ix, iy + band * 2, iw, 2, PAL.amber);
    px(ctx, ix + 8, iy + 22, 8, 8, PAL.lemon);
    px(ctx, ix + 6, iy + 24, 12, 4, PAL.lemon);
    px(ctx, ix + 4, iy + 5, 16, 2, PAL.coral);
    px(ctx, ix + 24, iy + 9, 12, 2, PAL.plum);
    px(ctx, ix + 44, iy + 13, 8, 2, PAL.coral);
  } else {
    px(ctx, ix, iy, iw, band, PAL.ink);
    px(ctx, ix, iy + band, iw, band, PAL.night);
    px(ctx, ix, iy + band * 2, iw, ih - band * 2, PAL.teal);
    px(ctx, ix + 46, iy + 4, 9, 9, PAL.cream);
    px(ctx, ix + 48, iy + 6, 5, 5, PAL.sand);
    px(ctx, ix + 8, iy + 6, 1, 1, PAL.white);
    px(ctx, ix + 20, iy + 10, 1, 1, PAL.white);
    px(ctx, ix + 34, iy + 5, 1, 1, PAL.white);
    px(ctx, ix + 14, iy + 18, 1, 1, PAL.white);
    px(ctx, ix + 30, iy + 22, 1, 1, PAL.white);
  }
}

export function drawWindow(ctx: Ctx, phase: Phase, time: number) {
  const { x, y, w, h } = WINDOW;
  const ix = x + 5;
  const iy = y + 5;
  const iw = w - 10;
  const ih = h - 10;

  px(ctx, x - 2, y - 2, w + 4, h + 4, "rgba(24,20,37,0.35)");
  px(ctx, x, y, w, h, PAL.ink);
  px(ctx, x + 1, y + 1, w - 2, h - 2, PAL.wood);
  px(ctx, x + 1, y + 1, w - 2, 1, PAL.woodLight);
  px(ctx, ix - 2, iy - 2, iw + 4, ih + 4, PAL.ink);
  ctx.clearRect(ix, iy, iw, ih);
  drawSky(ctx, phase, time, ix, iy, iw, ih);

  px(ctx, x + Math.floor(w / 2) - 1, y + 1, 2, h - 2, PAL.ink);
  px(ctx, x + 1, y + Math.floor(h / 2) - 1, w - 2, 2, PAL.ink);
  px(ctx, x + 1, y + Math.floor(h / 2) - 2, w - 2, 1, PAL.woodLight);
  px(ctx, x - 5, y + h - 2, w + 10, 5, PAL.ink);
  px(ctx, x - 4, y + h - 2, w + 8, 3, PAL.clay);
  px(ctx, x - 4, y + h - 2, w + 8, 1, PAL.sand);

  px(ctx, x - 8, y - 3, 8, h + 4, PAL.ink);
  px(ctx, x - 7, y - 2, 6, h + 2, PAL.plum);
  px(ctx, x - 6, y - 2, 1, h + 2, PAL.grape);
  px(ctx, x - 4, y + 6, 2, h - 10, PAL.grape);
  px(ctx, x + w, y - 3, 8, h + 4, PAL.ink);
  px(ctx, x + w + 1, y - 2, 6, h + 2, PAL.plum);
  px(ctx, x + w + 2, y - 2, 1, h + 2, PAL.grape);
  px(ctx, x + w + 3, y + 6, 2, h - 10, PAL.grape);
  px(ctx, x - 8, y + 20, 8, 3, PAL.amber);
  px(ctx, x + w, y + 20, 8, 3, PAL.amber);
}
