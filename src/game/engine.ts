import { getCharacterSprite } from "./character";
import { PAL } from "./palette";
import { createPropCanvas, createRoomCanvas, drawWindow } from "./roomArt";
import {
  BOUNDS,
  DIALOGUE_LINES,
  NPC_SPECS,
  PLAYER_LOOK,
  PLAYER_START,
  PROPS,
  ROOM,
  SOLIDS,
  WINDOW,
} from "./roomData";
import type { CharacterLook, Dir, NpcSpec, Phase, Rect, WalkFrame } from "./types";

type Point = { x: number; y: number };

type Npc = {
  spec: NpcSpec;
  x: number;
  y: number;
  dir: Dir;
  frame: WalkFrame;
  path: Point[];
  wait: number;
  walkClock: number;
  moving: boolean;
};

type Renderable = { depth: number; draw: () => void };

type Bubble = { npcId: string; text: string; until: number };

export type RoomEngineOptions = { onSelectNpc?: (id: string) => void };

const COLS = ROOM.width / ROOM.tile;
const ROWS = ROOM.height / ROOM.tile;
const MOVE_KEYS = new Set(["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"]);

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export class RoomEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private opts: RoomEngineOptions;
  private roomCanvas: HTMLCanvasElement;
  private propCanvases = new Map<string, HTMLCanvasElement>();
  private lightCanvas: HTMLCanvasElement;
  private lightCtx: CanvasRenderingContext2D;
  private blocked: boolean[] = [];
  private walkable: Point[] = [];
  private keys = new Set<string>();
  private player = {
    x: PLAYER_START.x,
    y: PLAYER_START.y,
    dir: "up" as Dir,
    frame: "idle" as WalkFrame,
    walkClock: 0,
    moving: false,
  };
  private npcs: Npc[] = NPC_SPECS.map((spec) => ({
    spec,
    x: spec.x,
    y: spec.y,
    dir: "down" as Dir,
    frame: "idle" as WalkFrame,
    path: [],
    wait: 0.4 + Math.random() * 1.6,
    walkClock: 0,
    moving: false,
  }));
  private phase: Phase = "dusk";
  private bubble: Bubble | null = null;
  private hoverNpcId: string | null = null;
  private raf = 0;
  private last = 0;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement, opts: RoomEngineOptions = {}) {
    this.canvas = canvas;
    this.opts = opts;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context unavailable");
    this.ctx = ctx;
    this.roomCanvas = createRoomCanvas();
    for (const prop of PROPS) {
      this.propCanvases.set(prop.id, createPropCanvas(prop));
    }
    this.lightCanvas = document.createElement("canvas");
    this.lightCanvas.width = ROOM.width;
    this.lightCanvas.height = ROOM.height;
    this.lightCtx = this.lightCanvas.getContext("2d")!;
    this.buildGrid();
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    canvas.addEventListener("click", this.onClick);
    canvas.addEventListener("mousemove", this.onMouseMove);
    canvas.addEventListener("mouseleave", this.onMouseLeave);
  }

  start() {
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.canvas.removeEventListener("click", this.onClick);
    this.canvas.removeEventListener("mousemove", this.onMouseMove);
    this.canvas.removeEventListener("mouseleave", this.onMouseLeave);
  }

  setPhase(phase: Phase) {
    this.phase = phase;
  }

  say(npcId: string, text?: string) {
    const lines = DIALOGUE_LINES[npcId] ?? ["……"];
    const line = text ?? lines[Math.floor(Math.random() * lines.length)];
    this.bubble = { npcId, text: line, until: performance.now() + 5200 };
  }

  private tick = (now: number) => {
    if (this.destroyed) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.update(dt);
    this.render(now);
    this.raf = requestAnimationFrame(this.tick);
  };

  private buildGrid() {
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const cx = col * ROOM.tile + ROOM.tile / 2;
        const cy = row * ROOM.tile + 14;
        const box: Rect = { x: cx - 4, y: cy - 9, w: 8, h: 9 };
        const inBounds =
          cx >= BOUNDS.minX && cx <= BOUNDS.maxX && cy >= BOUNDS.minY && cy <= BOUNDS.maxY;
        const blocked = !inBounds || SOLIDS.some((solid) => rectsOverlap(box, solid));
        this.blocked[row * COLS + col] = blocked;
        if (!blocked) this.walkable.push({ x: cx, y: cy });
      }
    }
  }

  private cellOf(p: Point): { col: number; row: number } {
    return {
      col: Math.max(0, Math.min(COLS - 1, Math.floor(p.x / ROOM.tile))),
      row: Math.max(0, Math.min(ROWS - 1, Math.floor(p.y / ROOM.tile))),
    };
  }

  private findPath(from: Point, to: Point): Point[] {
    const start = this.cellOf(from);
    const goal = this.cellOf(to);
    const startIdx = start.row * COLS + start.col;
    const goalIdx = goal.row * COLS + goal.col;
    if (this.blocked[goalIdx] || this.blocked[startIdx]) return [];

    const prev = new Int32Array(COLS * ROWS).fill(-1);
    const seen = new Uint8Array(COLS * ROWS);
    const queue: number[] = [startIdx];
    seen[startIdx] = 1;
    const neighbors = [1, -1, COLS, -COLS];
    let head = 0;
    while (head < queue.length) {
      const idx = queue[head];
      head += 1;
      if (idx === goalIdx) break;
      const col = idx % COLS;
      const row = Math.floor(idx / COLS);
      for (let i = 0; i < 4; i += 1) {
        if (i === 0 && col === COLS - 1) continue;
        if (i === 1 && col === 0) continue;
        if (i === 2 && row === ROWS - 1) continue;
        if (i === 3 && row === 0) continue;
        const next = idx + neighbors[i];
        if (seen[next] || this.blocked[next]) continue;
        seen[next] = 1;
        prev[next] = idx;
        queue.push(next);
      }
    }

    if (!seen[goalIdx]) return [];
    const cells: number[] = [];
    let cursor = goalIdx;
    while (cursor !== startIdx) {
      cells.push(cursor);
      cursor = prev[cursor];
      if (cursor < 0) return [];
    }
    cells.reverse();
    return cells.map((idx) => ({
      x: (idx % COLS) * ROOM.tile + ROOM.tile / 2,
      y: Math.floor(idx / COLS) * ROOM.tile + 14,
    }));
  }

  private pickTarget(npc: Npc) {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const cell = this.walkable[Math.floor(Math.random() * this.walkable.length)];
      if (!cell) break;
      const dist = Math.hypot(cell.x - npc.x, cell.y - npc.y);
      if (dist < 44) continue;
      const path = this.findPath({ x: npc.x, y: npc.y }, cell);
      if (path.length) {
        npc.path = path;
        return;
      }
    }
    npc.wait = 1.2 + Math.random() * 2;
  }

  private collides(x: number, y: number): boolean {
    if (x < BOUNDS.minX || x > BOUNDS.maxX || y < BOUNDS.minY || y > BOUNDS.maxY) return true;
    const box: Rect = { x: x - 5, y: y - 9, w: 10, h: 9 };
    return SOLIDS.some((solid) => rectsOverlap(box, solid));
  }

  private update(dt: number) {
    const keys = this.keys;
    if (!isTypingTarget(document.activeElement)) {
      const right = keys.has("arrowright") || keys.has("d") ? 1 : 0;
      const left = keys.has("arrowleft") || keys.has("a") ? 1 : 0;
      const down = keys.has("arrowdown") || keys.has("s") ? 1 : 0;
      const up = keys.has("arrowup") || keys.has("w") ? 1 : 0;
      let dx = right - left;
      let dy = down - up;
      if (dx !== 0 && dy !== 0) {
        dx *= Math.SQRT1_2;
        dy *= Math.SQRT1_2;
      }
      const moving = dx !== 0 || dy !== 0;
      this.player.moving = moving;
      if (moving) {
        this.player.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down");
        const speed = 74;
        const nx = this.player.x + dx * speed * dt;
        if (!this.collides(nx, this.player.y)) this.player.x = nx;
        const ny = this.player.y + dy * speed * dt;
        if (!this.collides(this.player.x, ny)) this.player.y = ny;
        this.player.walkClock += dt;
        this.player.frame = Math.floor(this.player.walkClock / 0.17) % 2 === 0 ? "a" : "b";
      } else {
        this.player.frame = "idle";
        this.player.walkClock = 0;
      }
    }

    for (const npc of this.npcs) {
      if (npc.wait > 0) {
        npc.wait -= dt;
        npc.moving = false;
        npc.frame = "idle";
        if (npc.wait <= 0 && npc.path.length === 0) this.pickTarget(npc);
        continue;
      }
      const target = npc.path[0];
      if (!target) {
        npc.moving = false;
        npc.frame = "idle";
        if (npc.wait <= 0) npc.wait = 0.8 + Math.random() * 2.6;
        if (!npc.path.length && npc.wait <= 0) this.pickTarget(npc);
        continue;
      }
      const dx = target.x - npc.x;
      const dy = target.y - npc.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1.2) {
        npc.path.shift();
        if (npc.path.length === 0) npc.wait = 1.4 + Math.random() * 2.8;
        npc.frame = "idle";
        npc.moving = false;
        continue;
      }
      const step = Math.min(dist, 32 * dt);
      npc.x += (dx / dist) * step;
      npc.y += (dy / dist) * step;
      npc.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down");
      npc.walkClock += dt;
      npc.frame = Math.floor(npc.walkClock / 0.2) % 2 === 0 ? "a" : "b";
      npc.moving = true;
    }

    if (this.bubble && performance.now() > this.bubble.until) this.bubble = null;
  }

  private render(now: number) {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, ROOM.width, ROOM.height);
    ctx.drawImage(this.roomCanvas, 0, 0);
    drawWindow(ctx, this.phase, now / 1000);
    this.drawWindowBeam(ctx);

    const items: Renderable[] = [];
    for (const prop of PROPS) {
      const art = this.propCanvases.get(prop.id);
      if (!art) continue;
      items.push({
        depth: prop.y + prop.h,
        draw: () => ctx.drawImage(art, prop.x, prop.y),
      });
    }
    items.push({
      depth: this.player.y,
      draw: () =>
        this.drawCharacter(ctx, this.player.x, this.player.y, PLAYER_LOOK, this.player.dir, this.player.frame),
    });
    for (const npc of this.npcs) {
      items.push({
        depth: npc.y,
        draw: () => this.drawCharacter(ctx, npc.x, npc.y, npc.spec.look, npc.dir, npc.frame),
      });
    }
    items.sort((a, b) => a.depth - b.depth);
    for (const item of items) item.draw();

    this.drawLighting(ctx);
    this.drawVignette(ctx);
    this.drawLabels(ctx);
    this.drawBubble(ctx);
  }

  private drawWindowBeam(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalAlpha = this.phase === "night" ? 0.05 : this.phase === "dusk" ? 0.06 : 0.08;
    ctx.fillStyle = this.phase === "night" ? PAL.cyan : PAL.lemon;
    ctx.beginPath();
    ctx.moveTo(WINDOW.x + 6, 64);
    ctx.lineTo(WINDOW.x + WINDOW.w - 6, 64);
    ctx.lineTo(WINDOW.x + WINDOW.w + 24, 138);
    ctx.lineTo(WINDOW.x - 18, 138);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawCharacter(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    look: CharacterLook,
    dir: Dir,
    frame: WalkFrame,
  ) {
    const rx = Math.round(x);
    const ry = Math.round(y);
    ctx.fillStyle = "rgba(24,20,37,0.28)";
    ctx.fillRect(rx - 5, ry - 2, 10, 4);
    const sprite = getCharacterSprite(look, dir, frame);
    ctx.drawImage(sprite, rx - 8, ry - 24);
  }

  private drawLighting(ctx: CanvasRenderingContext2D) {
    if (this.phase === "day") return;
    const light = this.lightCtx;
    light.globalCompositeOperation = "source-over";
    light.clearRect(0, 0, ROOM.width, ROOM.height);
    light.fillStyle = this.phase === "night" ? "rgba(24,20,37,0.50)" : "rgba(58,52,86,0.22)";
    light.fillRect(0, 0, ROOM.width, ROOM.height);
    light.globalCompositeOperation = "destination-out";
    const night = this.phase === "night";
    this.cutGlow(light, 324, 88, night ? 96 : 78, night ? 0.95 : 0.7);
    this.cutGlow(light, 270, 34, night ? 74 : 58, night ? 0.85 : 0.5);
    this.cutGlow(light, WINDOW.x + WINDOW.w / 2, WINDOW.y + WINDOW.h / 2, night ? 92 : 68, night ? 0.5 : 0.35);
    light.globalCompositeOperation = "source-over";
    ctx.drawImage(this.lightCanvas, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const glow = ctx.createRadialGradient(324, 88, 2, 324, 88, 56);
    glow.addColorStop(0, this.phase === "night" ? "rgba(254,174,52,0.40)" : "rgba(254,174,52,0.24)");
    glow.addColorStop(1, "rgba(254,174,52,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(260, 24, 128, 132);

    const bulb = ctx.createRadialGradient(270, 34, 1, 270, 34, 40);
    bulb.addColorStop(0, this.phase === "night" ? "rgba(254,231,97,0.34)" : "rgba(254,231,97,0.18)");
    bulb.addColorStop(1, "rgba(254,231,97,0)");
    ctx.fillStyle = bulb;
    ctx.fillRect(222, 0, 96, 84);
    ctx.restore();
  }

  private cutGlow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, alpha: number) {
    const gradient = ctx.createRadialGradient(x, y, 2, x, y, radius);
    gradient.addColorStop(0, `rgba(0,0,0,${alpha})`);
    gradient.addColorStop(0.55, `rgba(0,0,0,${alpha * 0.5})`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  private drawVignette(ctx: CanvasRenderingContext2D) {
    const vignette = ctx.createRadialGradient(192, 128, 120, 192, 128, 240);
    vignette.addColorStop(0, "rgba(24,20,37,0)");
    vignette.addColorStop(1, "rgba(24,20,37,0.22)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, ROOM.width, ROOM.height);
  }

  private drawLabels(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.font = '10px "FusionPixel", monospace';
    ctx.textAlign = "center";
    const label = (text: string, x: number, y: number, fill: string) => {
      ctx.fillStyle = PAL.ink;
      ctx.fillText(text, Math.round(x) + 1, Math.round(y) + 1);
      ctx.fillStyle = fill;
      ctx.fillText(text, Math.round(x), Math.round(y));
    };
    label("你", this.player.x, this.player.y - 27, PAL.cyan);
    for (const npc of this.npcs) {
      const near = Math.hypot(npc.x - this.player.x, npc.y - this.player.y) < 58;
      if (!near && this.hoverNpcId !== npc.spec.id) continue;
      const crowded = Math.abs(npc.x - this.player.x) < 26 && Math.abs(npc.y - this.player.y) < 30;
      label(npc.spec.name, npc.x, npc.y - (crowded ? 40 : 27), PAL.cream);
    }
    ctx.restore();
  }

  private drawBubble(ctx: CanvasRenderingContext2D) {
    if (!this.bubble) return;
    const npc = this.npcs.find((entry) => entry.spec.id === this.bubble?.npcId);
    if (!npc) return;
    ctx.save();
    ctx.font = '10px "FusionPixel", monospace';
    const maxTextWidth = 108;
    const closers = new Set(["。", "，", "、", "！", "？", "…", "」", "》", "”"]);
    const lines: string[] = [];
    let current = "";
    for (const char of this.bubble.text) {
      const next = current + char;
      if (ctx.measureText(next).width > maxTextWidth && current && !closers.has(char)) {
        lines.push(current);
        current = char;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
    const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width), 24);
    const w = Math.ceil(textWidth) + 12;
    const h = lines.length * 11 + 10;
    let bx = Math.round(npc.x - w / 2);
    bx = Math.max(4, Math.min(ROOM.width - w - 4, bx));
    let by = Math.round(npc.y - 30 - h);
    by = Math.max(70, by);

    ctx.fillStyle = PAL.ink;
    this.blockRect(ctx, bx - 1, by - 1, w + 2, h + 2);
    ctx.fillStyle = PAL.cream;
    this.blockRect(ctx, bx + 1, by + 1, w - 2, h - 2);
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(Math.round(npc.x) - 3, by + h, 6, 2);
    ctx.fillRect(Math.round(npc.x) - 2, by + h + 2, 4, 2);

    ctx.fillStyle = PAL.ink;
    ctx.textAlign = "left";
    lines.forEach((line, index) => {
      ctx.fillText(line, bx + 6, by + 11 + index * 11);
    });
    ctx.restore();
  }

  private blockRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    ctx.fillRect(x + 2, y, w - 4, h);
    ctx.fillRect(x, y + 2, w, h - 4);
  }

  private hitNpc(x: number, y: number): Npc | null {
    const sorted = [...this.npcs].sort((a, b) => b.y - a.y);
    for (const npc of sorted) {
      if (x >= npc.x - 8 && x <= npc.x + 8 && y >= npc.y - 26 && y <= npc.y + 1) return npc;
    }
    return null;
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return;
    const key = event.key.toLowerCase();
    if (MOVE_KEYS.has(key)) {
      this.keys.add(key);
      if (key.startsWith("arrow")) event.preventDefault();
    }
    if (key === "escape") this.bubble = null;
  };

  private onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.key.toLowerCase());
  };

  private onBlur = () => {
    this.keys.clear();
  };

  private onMouseMove = (event: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * ROOM.width;
    const y = ((event.clientY - rect.top) / rect.height) * ROOM.height;
    const npc = this.hitNpc(x, y);
    this.hoverNpcId = npc ? npc.spec.id : null;
    this.canvas.style.cursor = npc ? "pointer" : "default";
  };

  private onMouseLeave = () => {
    this.hoverNpcId = null;
    this.canvas.style.cursor = "default";
  };

  private onClick = (event: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * ROOM.width;
    const y = ((event.clientY - rect.top) / rect.height) * ROOM.height;
    const npc = this.hitNpc(x, y);
    if (!npc) return;
    this.say(npc.spec.id);
    this.opts.onSelectNpc?.(npc.spec.id);
  };
}
