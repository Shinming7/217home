import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorText } from "../../net/api";
import type { FishTankView } from "../../net/types";
import { Panel } from "../../ui/Panel";

type FishTankGameProps = { onClose: () => void };

type Bubble = { x: number; phase: number; speed: number; r: number };

type Visual = {
  id: string;
  kind: "player" | "npc";
  nickname: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  pastX: number;
  pastY: number;
  pastAt: number;
  nowX: number;
  nowY: number;
  nowAt: number;
  dirX: number;
  dirY: number;
  angle: number;
  speed: number;
  size: number;
  hue: number;
  eats: number;
  dashing: boolean;
  serverAt: number;
};

type Dir = "up" | "down" | "left" | "right";

const TANK_W = 960;
const TANK_H = 540;
const POLL_MS = 200;
// 自己的鱼按方向预测，预测窗口略长于轮询间隔，两帧快照之间才不会停住
const PREDICT_SEC = 0.24;
const CATCHUP_SPEED = 1.45;
// 其他鱼按前后两份快照插值；延迟越小越跟手，代价是快照来晚时要靠短时外推补上
const INTERP_DELAY_MS = 120;
const STARVE_SEC = 0.2;

const PAD_DIRS: { dir: Dir; glyph: string; label: string }[] = [
  { dir: "up", glyph: "▲", label: "向上游" },
  { dir: "left", glyph: "◀", label: "向左游" },
  { dir: "down", glyph: "▼", label: "向下游" },
  { dir: "right", glyph: "▶", label: "向右游" },
];

const KEY_DIRS: Record<string, Dir> = {
  arrowup: "up",
  w: "up",
  arrowdown: "down",
  s: "down",
  arrowleft: "left",
  a: "left",
  arrowright: "right",
  d: "right",
};

const PAD_AREAS: Record<Dir, string> = {
  up: "1 / 2 / 2 / 3",
  left: "2 / 1 / 3 / 2",
  down: "3 / 2 / 4 / 3",
  right: "2 / 3 / 3 / 4",
};

const PEBBLES = [
  { x: 72, y: 498, r: 7 },
  { x: 132, y: 512, r: 4 },
  { x: 206, y: 496, r: 5 },
  { x: 338, y: 508, r: 6 },
  { x: 472, y: 500, r: 4 },
  { x: 604, y: 510, r: 7 },
  { x: 688, y: 496, r: 5 },
  { x: 812, y: 506, r: 6 },
  { x: 886, y: 498, r: 4 },
];

const SEAWEED = [
  { x: 126, h: 78, phase: 0.4 },
  { x: 164, h: 54, phase: 1.7 },
  { x: 742, h: 88, phase: 2.6 },
  { x: 782, h: 60, phase: 4.1 },
  { x: 858, h: 44, phase: 5.2 },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function headingOf(dirX: number, dirY: number): number {
  return Math.hypot(dirX, dirY) > 0.01 ? Math.atan2(dirY, dirX) : 0;
}

function shortestAngle(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function hueColor(hue: number, lightness: number, saturation = 62): string {
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function drawBackdrop(ctx: CanvasRenderingContext2D, time: number, bubbles: Bubble[]) {
  const water = ctx.createLinearGradient(0, 0, 0, TANK_H);
  water.addColorStop(0, "#0b2c4e");
  water.addColorStop(0.55, "#11425b");
  water.addColorStop(1, "#0c3234");
  ctx.fillStyle = water;
  ctx.fillRect(0, 0, TANK_W, TANK_H);

  ctx.save();
  ctx.globalAlpha = 0.055;
  ctx.fillStyle = "#bfe9ff";
  for (let i = 0; i < 3; i += 1) {
    const shift = Math.sin(time * 0.18 + i * 1.4) * 46;
    ctx.beginPath();
    ctx.moveTo(130 + i * 300 + shift, 0);
    ctx.lineTo(230 + i * 300 + shift, 0);
    ctx.lineTo(360 + i * 300 + shift, TANK_H);
    ctx.lineTo(190 + i * 300 + shift, TANK_H);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  ctx.strokeStyle = "rgba(178, 226, 255, 0.28)";
  ctx.lineWidth = 1.5;
  for (const bubble of bubbles) {
    const travel = (time * bubble.speed + bubble.phase * 90) % (TANK_H + 40);
    const y = TANK_H + 16 - travel;
    const x = bubble.x + Math.sin(time * 0.9 + bubble.phase) * 7;
    ctx.beginPath();
    ctx.arc(x, y, bubble.r, 0, Math.PI * 2);
    ctx.stroke();
  }

  const sandTop = TANK_H - 58;
  ctx.fillStyle = "#c9a86a";
  ctx.beginPath();
  ctx.moveTo(0, TANK_H);
  ctx.lineTo(0, sandTop + 12);
  ctx.quadraticCurveTo(140, sandTop - 8, 300, sandTop + 6);
  ctx.quadraticCurveTo(470, sandTop + 18, 620, sandTop + 2);
  ctx.quadraticCurveTo(790, sandTop - 12, TANK_W, sandTop + 10);
  ctx.lineTo(TANK_W, TANK_H);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#a8875a";
  for (const pebble of PEBBLES) {
    ctx.beginPath();
    ctx.ellipse(pebble.x, pebble.y, pebble.r, pebble.r * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const weed of SEAWEED) {
    const sway = Math.sin(time * 1.1 + weed.phase) * 10;
    ctx.strokeStyle = "#2f7a52";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(weed.x, sandTop + 16);
    ctx.bezierCurveTo(weed.x - 8 + sway, sandTop + 16 - weed.h * 0.4, weed.x + 10 + sway, sandTop + 16 - weed.h * 0.75, weed.x + sway, sandTop + 16 - weed.h);
    ctx.stroke();
    ctx.strokeStyle = "#3f9a63";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(weed.x + 2, sandTop + 14);
    ctx.bezierCurveTo(weed.x - 4 + sway * 0.7, sandTop + 16 - weed.h * 0.35, weed.x + 12 + sway * 0.7, sandTop + 16 - weed.h * 0.7, weed.x + 4 + sway, sandTop + 16 - weed.h * 0.92);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
  ctx.fillRect(0, 0, TANK_W, 6);
  ctx.strokeStyle = "#181425";
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, TANK_W - 10, TANK_H - 10);
  ctx.strokeStyle = "rgba(160, 220, 255, 0.14)";
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, TANK_W - 28, TANK_H - 28);
}

function drawFish(ctx: CanvasRenderingContext2D, fish: Visual, time: number, isMe: boolean, idlePhase: number) {
  const size = fish.size;
  const wobble = Math.sin(time * 6 + idlePhase) * 0.16;

  ctx.save();
  ctx.translate(fish.x, fish.y);
  ctx.rotate(fish.angle);

  const dark = hueColor(fish.hue, 32, 55);
  const body = hueColor(fish.hue, 56);
  const light = hueColor(fish.hue, 74, 70);

  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-size * 0.58, 0);
  ctx.lineTo(-size * 1.08, -size * 0.42 + wobble * size * 0.3);
  ctx.lineTo(-size * 1.0, size * 0.06 + wobble * size * 0.3);
  ctx.lineTo(-size * 1.08, size * 0.46 + wobble * size * 0.3);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(size * 0.02, -size * 0.45);
  ctx.lineTo(-size * 0.2, -size * 0.85 - wobble * size * 0.2);
  ctx.lineTo(-size * 0.4, -size * 0.38);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.8, size * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = dark;
  ctx.lineWidth = Math.max(1.5, size * 0.06);
  ctx.stroke();

  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(size * 0.04, size * 0.17, size * 0.52, size * 0.24, 0, 0, Math.PI);
  ctx.fill();

  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(size * 0.1, size * 0.3);
  ctx.lineTo(-size * 0.14, size * 0.76);
  ctx.lineTo(-size * 0.3, size * 0.26);
  ctx.closePath();
  ctx.fill();

  const eyeX = size * 0.44;
  const eyeY = -size * 0.12;
  ctx.fillStyle = "#f5f2e8";
  ctx.beginPath();
  ctx.arc(eyeX, eyeY, Math.max(2.4, size * 0.14), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#181425";
  ctx.beginPath();
  ctx.arc(eyeX + Math.max(0.6, size * 0.03), eyeY, Math.max(1.2, size * 0.07), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  if (isMe) {
    ctx.strokeStyle = "rgba(254, 231, 97, 0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(fish.x, fish.y, size * 0.95, size * 0.72, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawDashTrail(ctx: CanvasRenderingContext2D, fish: Visual, time: number, phase: number) {
  const len = Math.hypot(fish.dirX, fish.dirY) || 1;
  const dirX = fish.dirX / len;
  const dirY = fish.dirY / len;
  for (let index = 1; index <= 3; index += 1) {
    ctx.save();
    ctx.globalAlpha = 0.18 / index;
    drawFish(
      ctx,
      {
        ...fish,
        x: fish.x - dirX * fish.size * 0.85 * index,
        y: fish.y - dirY * fish.size * 0.85 * index,
        dashing: false,
      },
      time,
      false,
      phase,
    );
    ctx.restore();
  }
}

function drawName(ctx: CanvasRenderingContext2D, fish: Visual, isMe: boolean) {
  const label = isMe ? `你 · ${fish.nickname}` : fish.nickname;
  ctx.font = '12px "FusionPixel", monospace';
  const width = Math.ceil(ctx.measureText(label).width) + 10;
  const x = Math.round(fish.x - width / 2);
  const y = Math.round(fish.y - fish.size * 0.9 - 20);
  ctx.fillStyle = "rgba(24, 20, 37, 0.78)";
  ctx.fillRect(x, y, width, 16);
  ctx.fillStyle = isMe ? "#fee761" : "#ead4aa";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, fish.x, y + 8.5);
}

export function FishTankGame({ onClose }: FishTankGameProps) {
  const [tank, setTank] = useState<FishTankView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [held, setHeld] = useState<Dir[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tankRef = useRef<FishTankView | null>(null);
  const visualsRef = useRef<Map<string, Visual>>(new Map());
  const dirRef = useRef({ x: 0, y: 0 });
  const keyDirs = useRef<Set<Dir>>(new Set());
  const padDirs = useRef<Set<Dir>>(new Set());
  const insideRef = useRef(false);
  const nudgeAt = useRef(0);
  const inFlight = useRef(false);
  const pendingLoad = useRef(false);
  const mounted = useRef(true);

  const apply = useCallback((next: FishTankView) => {
    tankRef.current = next;
    insideRef.current = Boolean(next.me?.inTank);
    setTank(next);
    const now = performance.now();
    const visuals = visualsRef.current;
    const alive = new Set<string>();
    for (const fish of next.fish) {
      alive.add(fish.id);
      const existing = visuals.get(fish.id);
      if (existing) {
        existing.pastX = existing.nowX;
        existing.pastY = existing.nowY;
        existing.pastAt = existing.nowAt;
        existing.nowX = fish.x;
        existing.nowY = fish.y;
        existing.nowAt = now;
        existing.tx = fish.x;
        existing.ty = fish.y;
        existing.dirX = fish.dirX;
        existing.dirY = fish.dirY;
        existing.speed = fish.speed;
        existing.size = fish.size;
        existing.hue = fish.hue;
        existing.eats = fish.eats;
        existing.dashing = fish.dashing;
        existing.serverAt = now;
      } else {
        visuals.set(fish.id, {
          id: fish.id,
          kind: fish.kind,
          nickname: fish.nickname,
          x: fish.x,
          y: fish.y,
          tx: fish.x,
          ty: fish.y,
          pastX: fish.x,
          pastY: fish.y,
          pastAt: now - POLL_MS,
          nowX: fish.x,
          nowY: fish.y,
          nowAt: now,
          dirX: fish.dirX,
          dirY: fish.dirY,
          angle: headingOf(fish.dirX, fish.dirY),
          speed: fish.speed,
          size: fish.size,
          hue: fish.hue,
          eats: fish.eats,
          dashing: fish.dashing,
          serverAt: now,
        });
      }
    }
    for (const key of [...visuals.keys()]) {
      if (!alive.has(key)) visuals.delete(key);
    }
  }, []);

  const load = useCallback(async () => {
    if (inFlight.current) {
      pendingLoad.current = true;
      return;
    }
    inFlight.current = true;
    pendingLoad.current = false;
    try {
      const { tank: next } = await api.tankState(dirRef.current.x, dirRef.current.y);
      if (mounted.current) {
        apply(next);
        setError("");
      }
    } catch (caught) {
      if (mounted.current) setError(errorText(caught));
    } finally {
      inFlight.current = false;
      if (pendingLoad.current && mounted.current) {
        pendingLoad.current = false;
        void load();
      }
    }
  }, [apply]);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    let timer = 0;
    const loop = async () => {
      await load();
      if (cancelled) return;
      timer = window.setTimeout(() => void loop(), document.hidden ? 2000 : POLL_MS);
    };
    void loop();
    return () => {
      cancelled = true;
      mounted.current = false;
      window.clearTimeout(timer);
      if (insideRef.current) {
        insideRef.current = false;
        void api.tankLeave().catch(() => {});
      }
    };
  }, [load]);

  const nudge = useCallback(() => {
    const now = Date.now();
    if (now - nudgeAt.current < 80) return;
    nudgeAt.current = now;
    void load();
  }, [load]);

  const dash = useCallback(async () => {
    if (!insideRef.current || inFlight.current) return;
    const me = tankRef.current?.me;
    if (!me?.alive || me.dashReadyInMs > 0) return;
    inFlight.current = true;
    try {
      const { tank: next } = await api.tankState(dirRef.current.x, dirRef.current.y, true);
      if (mounted.current) {
        apply(next);
        setError("");
      }
    } catch (caught) {
      if (mounted.current) setError(errorText(caught));
    } finally {
      inFlight.current = false;
    }
  }, [apply]);

  const syncDir = useCallback(() => {
    const dirs = new Set<Dir>([...keyDirs.current, ...padDirs.current]);
    const x = (dirs.has("right") ? 1 : 0) - (dirs.has("left") ? 1 : 0);
    const y = (dirs.has("down") ? 1 : 0) - (dirs.has("up") ? 1 : 0);
    setHeld([...dirs]);
    if (dirRef.current.x === x && dirRef.current.y === y) return;
    dirRef.current = { x, y };
    if (insideRef.current && tankRef.current?.me?.alive) nudge();
  }, [nudge]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === " " || event.key === "Shift") {
        event.preventDefault();
        if (!event.repeat) void dash();
        return;
      }
      const dir = KEY_DIRS[event.key.toLowerCase()];
      if (!dir) return;
      event.preventDefault();
      keyDirs.current.add(dir);
      syncDir();
    };
    const up = (event: KeyboardEvent) => {
      const dir = KEY_DIRS[event.key.toLowerCase()];
      if (!dir) return;
      keyDirs.current.delete(dir);
      syncDir();
    };
    const blur = () => {
      keyDirs.current.clear();
      padDirs.current.clear();
      syncDir();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [dash, syncDir]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const bubbles: Bubble[] = Array.from({ length: 18 }, () => ({
      x: Math.random() * TANK_W,
      phase: Math.random() * Math.PI * 2,
      speed: 14 + Math.random() * 26,
      r: 1.4 + Math.random() * 2.8,
    }));
    let raf = 0;
    let last = performance.now();
    const draw = (frame: number) => {
      const dt = Math.min(0.05, (frame - last) / 1000);
      last = frame;
      const time = frame / 1000;
      const current = tankRef.current;
      const visuals = visualsRef.current;
      const meId = current?.me?.memberId ?? null;
      for (const fish of visuals.values()) {
        const targetAngle = Math.hypot(fish.dirX, fish.dirY) > 0.01 ? Math.atan2(fish.dirY, fish.dirX) : fish.angle;
        if (fish.kind === "npc") {
          // NPC 的朝向在两次快照之间逐帧追上目标角度，转向不会一跳一跳
          fish.angle += shortestAngle(fish.angle, targetAngle) * Math.min(1, dt * 7);
        } else {
          fish.angle = targetAngle;
        }
        if (fish.id === meId) {
          const elapsed = Math.min(PREDICT_SEC, (frame - fish.serverAt) / 1000);
          const targetX = clamp(fish.tx + fish.dirX * fish.speed * elapsed, fish.size, TANK_W - fish.size);
          const targetY = clamp(fish.ty + fish.dirY * fish.speed * elapsed, fish.size, TANK_H - fish.size);
          const ease = Math.min(1, dt * 13);
          let stepX = (targetX - fish.x) * ease;
          let stepY = (targetY - fish.y) * ease;
          // 方向翻转时限制追赶速度，避免出现数倍于服务端的瞬移观感
          const maxStep = Math.max(fish.speed * CATCHUP_SPEED, 40) * dt;
          const stepLen = Math.hypot(stepX, stepY);
          if (stepLen > maxStep) {
            const scale = maxStep / stepLen;
            stepX *= scale;
            stepY *= scale;
          }
          fish.x += stepX;
          fish.y += stepY;
          continue;
        }
        const span = Math.max(1, fish.nowAt - fish.pastAt);
        const renderAt = frame - INTERP_DELAY_MS;
        const t = (renderAt - fish.pastAt) / span;
        if (t <= 1) {
          const k = clamp(t, 0, 1);
          fish.x = fish.pastX + (fish.nowX - fish.pastX) * k;
          fish.y = fish.pastY + (fish.nowY - fish.pastY) * k;
        } else {
          const extra = Math.min(STARVE_SEC, (renderAt - fish.nowAt) / 1000);
          fish.x = clamp(fish.nowX + fish.dirX * fish.speed * extra, fish.size, TANK_W - fish.size);
          fish.y = clamp(fish.nowY + fish.dirY * fish.speed * extra, fish.size, TANK_H - fish.size);
        }
      }

      drawBackdrop(ctx, time, bubbles);
      const list = [...visuals.values()].sort((a, b) => a.size - b.size);
      const idle = (current?.count ?? 0) === 0;
      let index = 0;
      for (const fish of list) {
        index += 1;
        const drift = idle && fish.kind === "npc" ? Math.sin(time * 0.8 + index * 1.7) * 12 : 0;
        const bob = idle && fish.kind === "npc" ? Math.cos(time * 0.6 + index) * 6 : 0;
        const placed = drift || bob ? { ...fish, x: fish.x + drift, y: fish.y + bob } : fish;
        if (placed.dashing) drawDashTrail(ctx, placed, time, index);
        if (fish.id !== meId) drawFish(ctx, placed, time, false, index);
      }
      const meVisual = meId ? visuals.get(meId) : undefined;
      if (meVisual) drawFish(ctx, meVisual, time, true, 0);
      for (const fish of list) {
        if (fish.kind === "player") drawName(ctx, fish, fish.id === meId);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const act = async (action: () => Promise<{ tank: FishTankView }>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { tank: next } = await action();
      if (mounted.current) apply(next);
    } catch (caught) {
      if (mounted.current) setError(errorText(caught));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const join = () => void act(api.tankJoin);
  const respawn = () => void act(api.tankRespawn);

  const leave = async () => {
    if (busy) return;
    setBusy(true);
    insideRef.current = false;
    dirRef.current = { x: 0, y: 0 };
    keyDirs.current.clear();
    padDirs.current.clear();
    setHeld([]);
    try {
      const { tank: next } = await api.tankLeave();
      if (mounted.current) {
        apply(next);
        setError("");
      }
    } catch (caught) {
      if (mounted.current) setError(errorText(caught));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const handleClose = () => {
    if (insideRef.current) {
      insideRef.current = false;
      void api.tankLeave().catch(() => {});
    }
    onClose();
  };

  const players = tank ? tank.fish.filter((fish) => fish.kind === "player") : [];
  const me = tank?.me ?? null;
  const meAlive = Boolean(me?.alive);
  const respawnLeft = me && !me.alive ? Math.max(0, Math.ceil(me.respawnInMs / 1000)) : 0;
  const dashLeft = me && me.alive ? Math.max(0, Math.ceil(me.dashReadyInMs / 1000)) : 0;
  const logs = tank ? [...tank.logs].reverse() : [];

  return (
    <Panel kicker="FISH TANK · 217" title="鱼缸 · 大鱼吃小鱼" wide onClose={handleClose}>
      <div className="tank-layout">
        <div className="tank-stage">
          <canvas
            ref={canvasRef}
            width={TANK_W}
            height={TANK_H}
            className="tank-canvas"
            aria-label="鱼缸游戏画面。方向键或 WASD 游动，空格或 Shift 突进，吞掉比自己小的鱼，躲开更大的鱼。"
          />
          <div className="tank-hud">
            <span className="tank-chip">
              {tank ? `${tank.count} / ${tank.capacity} 在缸里` : "连接鱼缸…"}
            </span>
            {me && me.alive ? (
              <span className="tank-chip">
                体型 {Math.round(me.size)} · 第 {me.rank} 名
              </span>
            ) : null}
          </div>

          {me === null ? (
            <div className="tank-overlay">
              <span className="tank-overlay-kicker">MAX 8 · 无尽局</span>
              <h3>下缸一起玩</h3>
              <p>方向键 / WASD 游动，空格或 Shift 突进，吞掉比自己小的鱼慢慢变大。被更大的鱼吃掉就只能先观战。</p>
              <button className="pixel-btn primary" onClick={join} disabled={busy || (tank ? tank.count >= tank.capacity : true)}>
                {tank && tank.count >= tank.capacity ? "鱼缸满了" : busy ? "下水…" : "下缸"}
              </button>
              <p className="fineprint">没有其他住户时，会先和缸里的 10 条 NPC 鱼一起玩。</p>
            </div>
          ) : null}

          {me && !me.alive ? (
            <div className="tank-overlay spectator">
              <span className="tank-overlay-kicker">SPECTATING</span>
              <h3>你被更大的鱼吞掉了</h3>
              <p>先漂在水面上看一会儿，等体型重新长回来再下缸。</p>
              <button className="pixel-btn primary" onClick={respawn} disabled={busy || respawnLeft > 0}>
                {respawnLeft > 0 ? `${respawnLeft} 秒后复活` : busy ? "重新下水…" : "再下缸"}
              </button>
            </div>
          ) : null}

          {meAlive ? (
            <div className="tank-controls">
              <div className="tank-pad" role="group" aria-label="鱼缸方向键">
                {PAD_DIRS.map(({ dir, glyph, label }) => (
                  <button
                    key={dir}
                    type="button"
                    className={held.includes(dir) ? "tank-pad-btn pressed" : "tank-pad-btn"}
                    style={{ gridArea: PAD_AREAS[dir] }}
                    aria-label={label}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      padDirs.current.add(dir);
                      syncDir();
                    }}
                    onPointerUp={() => {
                      padDirs.current.delete(dir);
                      syncDir();
                    }}
                    onPointerCancel={() => {
                      padDirs.current.delete(dir);
                      syncDir();
                    }}
                    onPointerLeave={() => {
                      padDirs.current.delete(dir);
                      syncDir();
                    }}
                    onLostPointerCapture={() => {
                      padDirs.current.delete(dir);
                      syncDir();
                    }}
                    onContextMenu={(event) => event.preventDefault()}
                  >
                    {glyph}
                  </button>
                ))}
              </div>
              <div className="tank-actions">
                <button
                  type="button"
                  className={dashLeft > 0 ? "tank-dash cooling" : "tank-dash"}
                  onClick={() => void dash()}
                  disabled={dashLeft > 0}
                  aria-label={dashLeft > 0 ? `突进冷却 ${dashLeft} 秒` : "突进"}
                >
                  <span>突进</span>
                  <small>{dashLeft > 0 ? `${dashLeft}s` : "空格"}</small>
                </button>
                <button className="pixel-btn tank-leave" onClick={() => void leave()} disabled={busy}>
                  上岸
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="tank-side">
          <div className="tank-card">
            <h3>体型排行</h3>
            {players.length ? (
              <ol className="tank-rank">
                {players.map((fish, index) => (
                  <li key={fish.id} className={fish.id === me?.memberId ? "me" : ""}>
                    <span className="rank-no">{index + 1}</span>
                    <span className="rank-name">{fish.id === me?.memberId ? `你（${fish.nickname}）` : fish.nickname}</span>
                    <span className="rank-size">{Math.round(fish.size)}</span>
                  </li>
                ))}
              </ol>
            ) : me ? null : (
              <p className="fineprint">还没有住户下缸，你可以先来。</p>
            )}
            {me && !me.alive ? <p className="tank-dead-note">你正在观战，复活后体型会回到最小。</p> : null}
            {me && me.alive ? <p className="tank-dead-note">已经吞掉 {me.eats} 条鱼。</p> : null}
          </div>

          <div className="tank-card tank-log">
            <h3>鱼缸动态</h3>
            {logs.length ? (
              <ul aria-live="polite">
                {logs.map((line, index) => (
                  <li key={`${index}-${line}`}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="fineprint">水面很平静。</p>
            )}
          </div>

          <p className="fineprint">
            吞掉比自己小 15% 以上的鱼才能长大；空格或 Shift 突进，冷却 2.6 秒。NPC 被吞后几秒会在随机位置刷新，小鱼比大鱼更容易刷出。离开面板会自动上岸，鱼缸最多 8 位住户。
          </p>
        </aside>
      </div>
      {error ? (
        <p className="online-warning" role="alert">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
