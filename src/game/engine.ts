import { getCharacterSprite, getSitSprite } from "./character";
import { getDogSprite, type DogFrame } from "./dog";
import { fallbackLook } from "./looks";
import { PAL } from "./palette";
import { createPropCanvas, createRoomCanvas, createSofaLayers, drawWindow } from "./roomArt";
import {
  BOUNDS,
  CORKBOARD,
  DOG_LINES,
  DOG_START,
  OCTAGON,
  PHOTO_FRAMES,
  PLAYER_LOOK,
  PLAYER_START,
  POKER_TABLE,
  PROPS,
  ROOM,
  SOFA_APPROACH,
  SOFA_SEAT,
  SOLIDS,
  WINDOW,
} from "./roomData";
import type { CharacterLook, Dir, PeerInput, Phase, Rect, WalkFrame, WeatherKind } from "./types";

type Point = { x: number; y: number };

type Peer = {
  id: string;
  nickname: string;
  look: CharacterLook;
  x: number;
  y: number;
  dir: Dir;
  frame: WalkFrame;
  target: Point;
  path: Point[];
  wait: number;
  walkClock: number;
  moving: boolean;
  online: boolean;
};

type Dog = {
  x: number;
  y: number;
  dir: Dir;
  frame: DogFrame;
  target: Point;
  path: Point[];
  wait: number;
  walkClock: number;
  moving: boolean;
  pettedUntil: number;
};

type Heart = { x: number; y: number; drift: number; until: number };

type Renderable = { depth: number; draw: () => void };

type Bubble = { id: string; text: string; until: number };

type Drop = { x: number; y: number; len: number; speed: number };
type Flake = { x: number; y: number; size: number; speed: number; phase: number };

export type RoomEngineOptions = {
  selfLook?: CharacterLook;
  start?: Point;
  phase?: Phase;
  weather?: WeatherKind;
  onSelectMember?: (id: string) => void;
  onEnterCage?: () => void;
  onOpenPhotos?: () => void;
  onOpenBoard?: () => void;
  onOpenPoker?: () => void;
};

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

function dirOf(dx: number, dy: number, fallback: Dir): Dir {
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return fallback;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "up" : "down";
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
  private joystick = { x: 0, y: 0 };
  private selfLook: CharacterLook;
  private player = {
    x: PLAYER_START.x,
    y: PLAYER_START.y,
    dir: "up" as Dir,
    frame: "idle" as WalkFrame,
    walkClock: 0,
    moving: false,
  };
  private peers = new Map<string, Peer>();
  private dog: Dog = {
    x: DOG_START.x,
    y: DOG_START.y,
    dir: "left",
    frame: "idle",
    target: { x: DOG_START.x, y: DOG_START.y },
    path: [],
    wait: 1.2,
    walkClock: 0,
    moving: false,
    pettedUntil: 0,
  };
  private hearts: Heart[] = [];
  private sitting = false;
  private autoWalk: Point[] = [];
  private photoPreviews: (HTMLImageElement | null)[] = [];
  private sofaBack: HTMLCanvasElement;
  private sofaFront: HTMLCanvasElement;
  private phase: Phase = "dusk";
  private weather: WeatherKind = "clear";
  private paused = false;
  private bubble: Bubble | null = null;
  private hoverPeerId: string | null = null;
  private hoverCage = false;
  private hoverPhotos = false;
  private hoverBoard = false;
  private hoverSofa = false;
  private hoverDog = false;
  private hoverPoker = false;
  private raf = 0;
  private last = 0;
  private destroyed = false;
  private drops: Drop[] = [];
  private flakes: Flake[] = [];

  constructor(canvas: HTMLCanvasElement, opts: RoomEngineOptions = {}) {
    this.canvas = canvas;
    this.opts = opts;
    this.selfLook = opts.selfLook ?? PLAYER_LOOK;
    if (opts.start) {
      this.player.x = opts.start.x;
      this.player.y = opts.start.y;
    }
    if (opts.phase) this.phase = opts.phase;
    if (opts.weather) this.weather = opts.weather;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context unavailable");
    this.ctx = ctx;
    this.roomCanvas = createRoomCanvas();
    for (const prop of PROPS) {
      this.propCanvases.set(prop.id, createPropCanvas(prop));
    }
    const sofa = createSofaLayers();
    this.sofaBack = sofa.back;
    this.sofaFront = sofa.front;
    this.lightCanvas = document.createElement("canvas");
    this.lightCanvas.width = ROOM.width;
    this.lightCanvas.height = ROOM.height;
    this.lightCtx = this.lightCanvas.getContext("2d")!;
    this.buildGrid();
    this.buildParticles();
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

  setSelfLook(look: CharacterLook) {
    this.selfLook = look;
  }

  setPhase(phase: Phase) {
    this.phase = phase;
  }

  setWeather(weather: WeatherKind) {
    this.weather = weather;
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) {
      this.keys.clear();
      this.joystick = { x: 0, y: 0 };
      this.player.moving = false;
      this.player.frame = "idle";
      this.player.walkClock = 0;
    }
  }

  setJoystick(x: number, y: number) {
    this.joystick = { x, y };
  }

  setPeers(peers: PeerInput[]) {
    const seen = new Set<string>();
    for (const input of peers) {
      seen.add(input.id);
      const existing = this.peers.get(input.id);
      if (!existing) {
        this.peers.set(input.id, {
          id: input.id,
          nickname: input.nickname,
          look: input.look ?? fallbackLook(input.id),
          x: input.x,
          y: input.y,
          dir: input.dir,
          frame: "idle",
          target: { x: input.x, y: input.y },
          path: [],
          wait: 0.4 + Math.random() * 1.4,
          walkClock: 0,
          moving: false,
          online: input.online,
        });
        continue;
      }
      const wasOnline = existing.online;
      existing.nickname = input.nickname;
      existing.look = input.look ?? fallbackLook(input.id);
      existing.online = input.online;
      if (input.online) {
        existing.target = { x: input.x, y: input.y };
        if (!wasOnline) {
          existing.x = input.x;
          existing.y = input.y;
          existing.path = [];
        }
      } else if (wasOnline) {
        existing.target = { x: existing.x, y: existing.y };
        existing.path = [];
        existing.wait = 0.8 + Math.random() * 1.6;
      }
    }
    for (const id of [...this.peers.keys()]) {
      if (!seen.has(id)) this.peers.delete(id);
    }
  }

  setPhotoPreviews(images: (HTMLImageElement | null)[]) {
    this.photoPreviews = images.slice(0, PHOTO_FRAMES.length);
  }

  getPlayer(): { x: number; y: number; dir: Dir } {
    return { x: Math.round(this.player.x), y: Math.round(this.player.y), dir: this.player.dir };
  }

  say(id: string, text: string) {
    this.bubble = { id, text, until: performance.now() + 5600 };
  }

  private buildParticles() {
    const innerW = WINDOW.w - 12;
    const innerH = WINDOW.h - 12;
    this.drops = Array.from({ length: 60 }, () => ({
      x: Math.random() * innerW,
      y: Math.random() * innerH,
      len: 3 + Math.random() * 5,
      speed: 26 + Math.random() * 44,
    }));
    this.flakes = Array.from({ length: 40 }, () => ({
      x: Math.random() * innerW,
      y: Math.random() * innerH,
      size: Math.random() < 0.4 ? 2 : 1,
      speed: 5 + Math.random() * 9,
      phase: Math.random() * Math.PI * 2,
    }));
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

  private pickTarget(peer: Peer) {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const cell = this.walkable[Math.floor(Math.random() * this.walkable.length)];
      if (!cell) break;
      const dist = Math.hypot(cell.x - peer.x, cell.y - peer.y);
      if (dist < 44) continue;
      const path = this.findPath({ x: peer.x, y: peer.y }, cell);
      if (path.length) {
        peer.path = path;
        return;
      }
    }
    peer.wait = 1.2 + Math.random() * 2;
  }

  private pickDogTarget() {
    const dog = this.dog;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const cell = this.walkable[Math.floor(Math.random() * this.walkable.length)];
      if (!cell) break;
      const nx = (cell.x - (OCTAGON.x + OCTAGON.w / 2)) / (OCTAGON.w / 2 + 10);
      const ny = (cell.y - (OCTAGON.y + OCTAGON.h / 2)) / (OCTAGON.h / 2 + 10);
      if (nx * nx + ny * ny < 1.4) continue;
      if (Math.hypot(cell.x - dog.x, cell.y - dog.y) < 36) continue;
      const path = this.findPath({ x: dog.x, y: dog.y }, cell);
      if (path.length) {
        dog.path = path;
        return;
      }
    }
    dog.wait = 1.8 + Math.random() * 2.4;
  }

  private sitDown() {
    this.sitting = true;
    this.player.x = SOFA_SEAT.x;
    this.player.y = SOFA_SEAT.y;
    this.player.dir = "down";
    this.player.frame = "idle";
    this.player.moving = false;
    this.player.walkClock = 0;
  }

  private standUp() {
    this.sitting = false;
    this.autoWalk = [];
    this.player.x = SOFA_APPROACH.x;
    this.player.y = SOFA_APPROACH.y;
    this.player.frame = "idle";
    this.player.moving = false;
  }

  private petDog() {
    const now = performance.now();
    const dog = this.dog;
    dog.pettedUntil = now + 2600;
    dog.path = [];
    dog.wait = 2.6;
    dog.dir = dirOf(this.player.x - dog.x, this.player.y - dog.y, dog.dir);
    this.bubble = {
      id: "dog",
      text: DOG_LINES[Math.floor(Math.random() * DOG_LINES.length)],
      until: now + 3200,
    };
    for (let index = 0; index < 3; index += 1) {
      this.hearts.push({
        x: dog.x + (index - 1) * 5 + Math.random() * 2,
        y: dog.y - 13 - index * 2,
        drift: (Math.random() - 0.5) * 8,
        until: now + 1400 + index * 240,
      });
    }
  }

  private collides(x: number, y: number): boolean {
    if (x < BOUNDS.minX || x > BOUNDS.maxX || y < BOUNDS.minY || y > BOUNDS.maxY) return true;
    const box: Rect = { x: x - 5, y: y - 9, w: 10, h: 9 };
    return SOLIDS.some((solid) => rectsOverlap(box, solid));
  }

  private update(dt: number) {
    const keys = this.keys;
    const now = performance.now();
    if (!this.paused && !isTypingTarget(document.activeElement)) {
      const right = keys.has("arrowright") || keys.has("d") ? 1 : 0;
      const left = keys.has("arrowleft") || keys.has("a") ? 1 : 0;
      const down = keys.has("arrowdown") || keys.has("s") ? 1 : 0;
      const up = keys.has("arrowup") || keys.has("w") ? 1 : 0;
      let dx = right - left + this.joystick.x;
      let dy = down - up + this.joystick.y;
      const magnitude = Math.hypot(dx, dy);
      if (magnitude > 1) {
        dx /= magnitude;
        dy /= magnitude;
      }
      const moving = Math.abs(dx) > 0.08 || Math.abs(dy) > 0.08;

      if (this.sitting) {
        if (moving) {
          this.sitting = false;
          this.player.x = SOFA_APPROACH.x;
          this.player.y = SOFA_APPROACH.y;
        } else {
          this.player.frame = "idle";
          this.player.moving = false;
        }
      }

      if (!this.sitting) {
        this.player.moving = moving;
        if (moving) {
          this.autoWalk = [];
          this.player.dir = dirOf(dx, dy, this.player.dir);
          const speed = 74;
          const nx = this.player.x + dx * speed * dt;
          if (!this.collides(nx, this.player.y)) this.player.x = nx;
          const ny = this.player.y + dy * speed * dt;
          if (!this.collides(this.player.x, ny)) this.player.y = ny;
          this.player.walkClock += dt;
          this.player.frame = Math.floor(this.player.walkClock / 0.17) % 2 === 0 ? "a" : "b";
        } else if (this.autoWalk.length) {
          const target = this.autoWalk[0];
          const adx = target.x - this.player.x;
          const ady = target.y - this.player.y;
          const dist = Math.hypot(adx, ady);
          if (dist < 1.2) {
            this.autoWalk.shift();
            if (!this.autoWalk.length) this.sitDown();
          } else {
            const step = Math.min(dist, 74 * dt);
            this.player.x += (adx / dist) * step;
            this.player.y += (ady / dist) * step;
            this.player.dir = dirOf(adx, ady, this.player.dir);
            this.player.walkClock += dt;
            this.player.frame = Math.floor(this.player.walkClock / 0.17) % 2 === 0 ? "a" : "b";
            this.player.moving = true;
          }
        } else {
          this.player.frame = "idle";
          this.player.walkClock = 0;
        }
      }
    }

    for (const peer of this.peers.values()) {
      if (peer.online) {
        const dx = peer.target.x - peer.x;
        const dy = peer.target.y - peer.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 160) {
          peer.x = peer.target.x;
          peer.y = peer.target.y;
          peer.frame = "idle";
          peer.moving = false;
          continue;
        }
        if (dist > 1.5) {
          const step = Math.min(dist, Math.max(46, dist * 3.2) * dt);
          peer.x += (dx / dist) * step;
          peer.y += (dy / dist) * step;
          peer.dir = dirOf(dx, dy, peer.dir);
          peer.walkClock += dt;
          peer.frame = Math.floor(peer.walkClock / 0.18) % 2 === 0 ? "a" : "b";
          peer.moving = true;
        } else {
          peer.x = peer.target.x;
          peer.y = peer.target.y;
          peer.moving = false;
          peer.frame = "idle";
        }
        continue;
      }

      if (peer.wait > 0) {
        peer.wait -= dt;
        peer.moving = false;
        peer.frame = "idle";
        if (peer.wait <= 0 && peer.path.length === 0) this.pickTarget(peer);
        continue;
      }
      const target = peer.path[0];
      if (!target) {
        peer.moving = false;
        peer.frame = "idle";
        peer.wait = 0.8 + Math.random() * 2.6;
        continue;
      }
      const dx = target.x - peer.x;
      const dy = target.y - peer.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1.2) {
        peer.path.shift();
        if (peer.path.length === 0) peer.wait = 1.4 + Math.random() * 2.8;
        peer.frame = "idle";
        peer.moving = false;
        continue;
      }
      const step = Math.min(dist, 32 * dt);
      peer.x += (dx / dist) * step;
      peer.y += (dy / dist) * step;
      peer.dir = dirOf(dx, dy, peer.dir);
      peer.walkClock += dt;
      peer.frame = Math.floor(peer.walkClock / 0.2) % 2 === 0 ? "a" : "b";
      peer.moving = true;
    }

    const dog = this.dog;
    if (now < dog.pettedUntil) {
      dog.path = [];
      dog.moving = false;
      dog.dir = dirOf(this.player.x - dog.x, this.player.y - dog.y, dog.dir);
      dog.frame = Math.floor(now / 220) % 2 === 0 ? "sit" : "wag";
    } else if (dog.wait > 0) {
      dog.wait -= dt;
      dog.moving = false;
      dog.frame = "idle";
      if (dog.wait <= 0 && dog.path.length === 0) this.pickDogTarget();
    } else {
      const target = dog.path[0];
      if (!target) {
        dog.moving = false;
        dog.frame = "idle";
        dog.wait = 1.6 + Math.random() * 2.4;
      } else {
        const ddx = target.x - dog.x;
        const ddy = target.y - dog.y;
        const dist = Math.hypot(ddx, ddy);
        if (dist < 1.2) {
          dog.path.shift();
          if (!dog.path.length) dog.wait = 1.8 + Math.random() * 3;
          dog.frame = "idle";
          dog.moving = false;
        } else {
          const step = Math.min(dist, 22 * dt);
          dog.x += (ddx / dist) * step;
          dog.y += (ddy / dist) * step;
          dog.dir = dirOf(ddx, ddy, dog.dir);
          dog.walkClock += dt;
          dog.frame = Math.floor(dog.walkClock / 0.24) % 2 === 0 ? "a" : "b";
          dog.moving = true;
        }
      }
    }

    for (const heart of this.hearts) heart.y -= 9 * dt;
    this.hearts = this.hearts.filter((heart) => now < heart.until);

    if (this.bubble && now > this.bubble.until) this.bubble = null;
  }

  private render(now: number) {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, ROOM.width, ROOM.height);
    ctx.drawImage(this.roomCanvas, 0, 0);
    this.drawPhotoPreviews(ctx);
    drawWindow(ctx, this.phase, now / 1000);
    this.drawWeather(ctx, now / 1000);
    this.drawWindowBeam(ctx);

    const items: Renderable[] = [];
    for (const prop of PROPS) {
      if (prop.kind === "sofa") {
        items.push({ depth: prop.y + 18, draw: () => ctx.drawImage(this.sofaBack, prop.x, prop.y) });
        items.push({ depth: prop.y + prop.h, draw: () => ctx.drawImage(this.sofaFront, prop.x, prop.y) });
        continue;
      }
      const art = this.propCanvases.get(prop.id);
      if (!art) continue;
      items.push({ depth: prop.y + prop.h, draw: () => ctx.drawImage(art, prop.x, prop.y) });
    }
    items.push({
      depth: this.player.y,
      draw: () =>
        this.sitting
          ? this.drawSitting(ctx)
          : this.drawCharacter(ctx, this.player.x, this.player.y, this.selfLook, this.player.dir, this.player.frame),
    });
    items.push({ depth: this.dog.y, draw: () => this.drawDog(ctx) });
    for (const peer of this.peers.values()) {
      items.push({
        depth: peer.y,
        draw: () => this.drawCharacter(ctx, peer.x, peer.y, peer.look, peer.dir, peer.frame),
      });
    }
    items.sort((a, b) => a.depth - b.depth);
    for (const item of items) item.draw();

    this.drawLighting(ctx);
    this.drawVignette(ctx);
    this.drawHearts(ctx);
    this.drawLabels(ctx);
    this.drawBubble(ctx);
    if (this.hoverPhotos) {
      ctx.save();
      ctx.strokeStyle = PAL.lemon;
      ctx.lineWidth = 1;
      for (const frame of PHOTO_FRAMES) {
        ctx.strokeRect(frame.x - 2.5, frame.y - 2.5, frame.w + 5, frame.h + 5);
      }
      ctx.restore();
    }
    if (this.hoverBoard) {
      ctx.save();
      ctx.strokeStyle = PAL.lemon;
      ctx.lineWidth = 1;
      ctx.strokeRect(CORKBOARD.x - 3.5, CORKBOARD.y - 3.5, CORKBOARD.w + 7, CORKBOARD.h + 7);
      ctx.restore();
    }
    if (this.hoverSofa) {
      const sofa = PROPS.find((prop) => prop.kind === "sofa");
      if (sofa) {
        ctx.save();
        ctx.strokeStyle = PAL.lemon;
        ctx.lineWidth = 1;
        ctx.strokeRect(sofa.x - 3.5, sofa.y - 3.5, sofa.w + 7, sofa.h + 7);
        ctx.restore();
      }
    }
    if (this.hoverPoker) {
      ctx.save();
      ctx.strokeStyle = PAL.lemon;
      ctx.lineWidth = 1;
      ctx.strokeRect(POKER_TABLE.x - 3.5, POKER_TABLE.y - 3.5, POKER_TABLE.w + 7, POKER_TABLE.h + 7);
      ctx.restore();
    }
  }

  private drawWeather(ctx: CanvasRenderingContext2D, time: number) {
    const inner = { x: WINDOW.x + 5, y: WINDOW.y + 5, w: WINDOW.w - 10, h: WINDOW.h - 10 };
    if (this.weather === "cloudy" || this.weather === "fog") {
      ctx.save();
      ctx.globalAlpha = this.weather === "fog" ? 0.24 : 0.12;
      ctx.fillStyle = PAL.slate;
      ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
      ctx.restore();
    }
    if (this.weather === "clear") return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(inner.x, inner.y, inner.w, inner.h);
    ctx.clip();

    if (this.weather === "rain" || this.weather === "storm") {
      const multiplier = this.weather === "storm" ? 1.7 : 1;
      ctx.fillStyle = "rgba(139,171,205,0.8)";
      for (const drop of this.drops) {
        const y = (drop.y + time * drop.speed * multiplier) % inner.h;
        ctx.fillRect(inner.x + drop.x, inner.y + y, 1, drop.len);
      }
      if (this.weather === "storm" && (time % 7) < 0.16) {
        ctx.fillStyle = "rgba(234,212,170,0.55)";
        ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
      }
    } else if (this.weather === "snow") {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      for (const flake of this.flakes) {
        const y = (flake.y + time * flake.speed) % inner.h;
        const x = flake.x + Math.sin(time * 0.9 + flake.phase) * 3;
        ctx.fillRect(inner.x + Math.max(0, Math.min(inner.w - flake.size, x)), inner.y + y, flake.size, flake.size);
      }
    } else if (this.weather === "fog") {
      ctx.fillStyle = "rgba(192,203,220,0.5)";
      for (let index = 0; index < 5; index += 1) {
        const offset = Math.sin(time * 0.4 + index) * 6;
        ctx.fillRect(inner.x, inner.y + 6 + index * 7 + offset, inner.w, 2);
      }
    }
    ctx.restore();
  }

  private drawWindowBeam(ctx: CanvasRenderingContext2D) {
    ctx.save();
    const alpha = this.phase === "night" ? 0.05 : this.phase === "dusk" ? 0.06 : 0.08;
    ctx.globalAlpha = alpha;
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
    const bob = frame === "a" ? 1 : 0;
    ctx.drawImage(sprite, rx - 8, ry - 24 - bob);
  }

  private drawSitting(ctx: CanvasRenderingContext2D) {
    const rx = Math.round(this.player.x);
    const ry = Math.round(this.player.y);
    const sprite = getSitSprite(this.selfLook);
    ctx.drawImage(sprite, rx - 8, ry - 18);
  }

  private drawDog(ctx: CanvasRenderingContext2D) {
    const rx = Math.round(this.dog.x);
    const ry = Math.round(this.dog.y);
    ctx.fillStyle = "rgba(24,20,37,0.24)";
    ctx.fillRect(rx - 6, ry - 2, 12, 4);
    ctx.fillRect(rx - 4, ry + 2, 8, 1);
    const sprite = getDogSprite(this.dog.dir, this.dog.frame);
    ctx.drawImage(sprite, rx - 8, ry - 12);
  }

  private drawPhotoPreviews(ctx: CanvasRenderingContext2D) {
    for (let index = 0; index < PHOTO_FRAMES.length; index += 1) {
      const image = this.photoPreviews[index];
      if (!image || !image.complete || !image.naturalWidth) continue;
      const frame = PHOTO_FRAMES[index];
      const ix = frame.x + 4;
      const iy = frame.y + 4;
      const iw = frame.w - 8;
      const ih = frame.h - 8;
      const scale = Math.max(iw / image.naturalWidth, ih / image.naturalHeight);
      const sw = iw / scale;
      const sh = ih / scale;
      const sx = (image.naturalWidth - sw) / 2;
      const sy = (image.naturalHeight - sh) / 2;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, sx, sy, sw, sh, ix, iy, iw, ih);
    }
  }

  private drawHearts(ctx: CanvasRenderingContext2D) {
    const now = performance.now();
    for (const heart of this.hearts) {
      const x = Math.round(heart.x + Math.sin(now / 190 + heart.drift) * 2);
      const y = Math.round(heart.y);
      ctx.fillStyle = PAL.cherry;
      ctx.fillRect(x - 3, y - 4, 2, 2);
      ctx.fillRect(x + 1, y - 4, 2, 2);
      ctx.fillRect(x - 3, y - 2, 6, 2);
      ctx.fillRect(x - 2, y, 4, 1);
      ctx.fillRect(x - 1, y + 1, 2, 1);
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.fillRect(x - 3, y - 4, 1, 1);
    }
  }

  private drawLighting(ctx: CanvasRenderingContext2D) {
    if (this.phase === "day") return;
    if (this.phase === "morning") {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const glow = ctx.createRadialGradient(192, 120, 40, 192, 120, 210);
      glow.addColorStop(0, "rgba(254,231,97,0.10)");
      glow.addColorStop(1, "rgba(254,231,97,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, ROOM.width, ROOM.height);
      ctx.restore();
      return;
    }
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
    glow.addColorStop(0, night ? "rgba(254,174,52,0.40)" : "rgba(254,174,52,0.24)");
    glow.addColorStop(1, "rgba(254,174,52,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(260, 24, 128, 132);

    const bulb = ctx.createRadialGradient(270, 34, 1, 270, 34, 40);
    bulb.addColorStop(0, night ? "rgba(254,231,97,0.34)" : "rgba(254,231,97,0.18)");
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
    label("你", this.player.x, this.player.y - (this.sitting ? 20 : 27), PAL.cyan);
    for (const peer of this.peers.values()) {
      const near = Math.hypot(peer.x - this.player.x, peer.y - this.player.y) < 58;
      if (!near && this.hoverPeerId !== peer.id) continue;
      const crowded = Math.abs(peer.x - this.player.x) < 26 && Math.abs(peer.y - this.player.y) < 30;
      label(peer.nickname, peer.x, peer.y - (crowded ? 40 : 27), peer.online ? PAL.cream : PAL.steel);
    }
    if (this.hoverDog) {
      label("小狗", this.dog.x, this.dog.y - 17, PAL.amber);
      this.drawHint(ctx, this.dog.x, this.dog.y - 34, "摸摸小狗");
    }
    if (this.hoverSofa) {
      const sofa = PROPS.find((prop) => prop.kind === "sofa");
      if (sofa) {
        this.drawHint(
          ctx,
          sofa.x + sofa.w / 2,
          sofa.y - (this.sitting ? 34 : 20),
          this.sitting ? "点击起身" : "点击坐下",
        );
      }
    }
    if (this.hoverPhotos) {
      this.drawHint(ctx, PHOTO_FRAMES[1].x + PHOTO_FRAMES[1].w / 2, 48, "点击看照片墙");
    }
    if (this.hoverBoard) {
      this.drawHint(ctx, CORKBOARD.x + CORKBOARD.w / 2, 56, "点击看留言板");
    }
    if (this.hoverCage) {
      this.drawHint(ctx, OCTAGON.x + OCTAGON.w / 2, OCTAGON.y - 36, "点击进入八角笼");
    }
    ctx.restore();
  }

  private drawHint(ctx: CanvasRenderingContext2D, cx: number, topY: number, text: string) {
    ctx.font = '10px "FusionPixel", monospace';
    ctx.textAlign = "center";
    const width = Math.ceil(ctx.measureText(text).width) + 12;
    const x = Math.max(4, Math.min(ROOM.width - width - 4, Math.round(cx - width / 2)));
    const y = Math.max(2, Math.round(topY));
    ctx.fillStyle = PAL.ink;
    this.blockRect(ctx, x - 1, y - 1, width + 2, 16);
    ctx.fillStyle = PAL.cream;
    this.blockRect(ctx, x + 1, y + 1, width - 2, 12);
    ctx.fillStyle = PAL.ink;
    ctx.fillText(text, x + width / 2, y + 11);
  }

  private drawBubble(ctx: CanvasRenderingContext2D) {
    if (!this.bubble) return;
    const anchor =
      this.bubble.id === "self"
        ? { x: this.player.x, y: this.player.y }
        : this.bubble.id === "dog"
          ? { x: this.dog.x, y: this.dog.y }
          : (() => {
              const peer = this.peers.get(this.bubble!.id);
              return peer ? { x: peer.x, y: peer.y } : null;
            })();
    if (!anchor) return;
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
    let bx = Math.round(anchor.x - w / 2);
    bx = Math.max(4, Math.min(ROOM.width - w - 4, bx));
    let by = Math.round(anchor.y - 30 - h);
    by = Math.max(70, by);

    ctx.fillStyle = PAL.ink;
    this.blockRect(ctx, bx - 1, by - 1, w + 2, h + 2);
    ctx.fillStyle = PAL.cream;
    this.blockRect(ctx, bx + 1, by + 1, w - 2, h - 2);
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(Math.round(anchor.x) - 3, by + h, 6, 2);
    ctx.fillRect(Math.round(anchor.x) - 2, by + h + 2, 4, 2);

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

  private roomPoint(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const width = this.canvas.offsetWidth || ROOM.width;
    const height = this.canvas.offsetHeight || ROOM.height;
    let lx: number;
    let ly: number;
    // Phones in portrait run the whole app rotated 90°; the bounding rect swaps
    // width/height, so client coords must be un-rotated before mapping to room space.
    if (Math.abs(rect.width - height) < 2 && Math.abs(rect.height - width) < 2) {
      const dx = clientX - (rect.left + rect.width / 2);
      const dy = clientY - (rect.top + rect.height / 2);
      lx = width / 2 + dy;
      ly = height / 2 - dx;
    } else {
      lx = ((clientX - rect.left) / rect.width) * width;
      ly = ((clientY - rect.top) / rect.height) * height;
    }
    return { x: (lx / width) * ROOM.width, y: (ly / height) * ROOM.height };
  }

  private hitPeer(x: number, y: number): Peer | null {
    const sorted = [...this.peers.values()].sort((a, b) => b.y - a.y);
    for (const peer of sorted) {
      if (x >= peer.x - 8 && x <= peer.x + 8 && y >= peer.y - 26 && y <= peer.y + 1) return peer;
    }
    return null;
  }

  private cageAt(x: number, y: number): boolean {
    const cx = OCTAGON.x + OCTAGON.w / 2;
    const cy = OCTAGON.y + OCTAGON.h / 2;
    const nx = (x - cx) / (OCTAGON.w / 2);
    const ny = (y - cy) / (OCTAGON.h / 2);
    return nx * nx + ny * ny <= 0.92;
  }

  private photoWallAt(x: number, y: number): boolean {
    return PHOTO_FRAMES.some(
      (frame) =>
        x >= frame.x - 4 &&
        x <= frame.x + frame.w + 4 &&
        y >= frame.y - 4 &&
        y <= frame.y + frame.h + 4,
    );
  }

  private boardAt(x: number, y: number): boolean {
    return x >= CORKBOARD.x - 4 && x <= CORKBOARD.x + CORKBOARD.w + 4 && y >= CORKBOARD.y - 4 && y <= CORKBOARD.y + CORKBOARD.h + 4;
  }

  private sofaAt(x: number, y: number): boolean {
    const sofa = PROPS.find((prop) => prop.kind === "sofa");
    if (!sofa) return false;
    return x >= sofa.x - 4 && x <= sofa.x + sofa.w + 4 && y >= sofa.y - 6 && y <= sofa.y + sofa.h + 4;
  }

  private dogAt(x: number, y: number): boolean {
    return x >= this.dog.x - 9 && x <= this.dog.x + 9 && y >= this.dog.y - 13 && y <= this.dog.y + 1;
  }

  private pokerAt(x: number, y: number): boolean {
    return x >= POKER_TABLE.x - 4 && x <= POKER_TABLE.x + POKER_TABLE.w + 4 && y >= POKER_TABLE.y - 6 && y <= POKER_TABLE.y + POKER_TABLE.h + 4;
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
    this.joystick = { x: 0, y: 0 };
  };

  private onMouseMove = (event: MouseEvent) => {
    const { x, y } = this.roomPoint(event.clientX, event.clientY);
    const peer = this.hitPeer(x, y);
    this.hoverPeerId = peer ? peer.id : null;
    this.hoverDog = !peer && this.dogAt(x, y);
    this.hoverSofa = !peer && !this.hoverDog && this.sofaAt(x, y);
    this.hoverPhotos = !peer && !this.hoverDog && !this.hoverSofa && this.photoWallAt(x, y);
    this.hoverBoard =
      !peer && !this.hoverDog && !this.hoverSofa && !this.hoverPhotos && this.boardAt(x, y);
    this.hoverPoker =
      !peer &&
      !this.hoverDog &&
      !this.hoverSofa &&
      !this.hoverPhotos &&
      !this.hoverBoard &&
      this.pokerAt(x, y);
    this.hoverCage =
      !peer &&
      !this.hoverDog &&
      !this.hoverSofa &&
      !this.hoverPhotos &&
      !this.hoverBoard &&
      !this.hoverPoker &&
      this.cageAt(x, y);
    const interactive =
      peer ||
      this.hoverDog ||
      this.hoverSofa ||
      this.hoverPhotos ||
      this.hoverBoard ||
      this.hoverPoker ||
      this.hoverCage;
    this.canvas.style.cursor = interactive ? "pointer" : "default";
  };

  private onMouseLeave = () => {
    this.hoverPeerId = null;
    this.hoverDog = false;
    this.hoverSofa = false;
    this.hoverPhotos = false;
    this.hoverBoard = false;
    this.hoverPoker = false;
    this.hoverCage = false;
    this.canvas.style.cursor = "default";
  };

  private onClick = (event: MouseEvent) => {
    const { x, y } = this.roomPoint(event.clientX, event.clientY);
    const peer = this.hitPeer(x, y);
    if (peer) {
      this.autoWalk = [];
      this.opts.onSelectMember?.(peer.id);
      return;
    }
    if (this.dogAt(x, y)) {
      this.autoWalk = [];
      this.petDog();
      return;
    }
    if (this.sofaAt(x, y)) {
      if (this.sitting) {
        this.standUp();
        return;
      }
      const path = this.findPath({ x: this.player.x, y: this.player.y }, SOFA_APPROACH);
      this.autoWalk = path.length ? path : [{ x: SOFA_APPROACH.x, y: SOFA_APPROACH.y }];
      return;
    }
    this.autoWalk = [];
    if (this.photoWallAt(x, y)) {
      this.opts.onOpenPhotos?.();
      return;
    }
    if (this.boardAt(x, y)) {
      this.opts.onOpenBoard?.();
      return;
    }
    if (this.pokerAt(x, y)) {
      this.opts.onOpenPoker?.();
      return;
    }
    if (this.cageAt(x, y)) this.opts.onEnterCage?.();
  };
}
