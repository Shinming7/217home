export const TANK_W = 960;
export const TANK_H = 540;
export const TANK_CAPACITY = 8;
export const NPC_COUNT = 10;
export const START_SIZE = 18;
export const MAX_SIZE = 90;
export const EAT_RATIO = 1.15;
export const RESPAWN_MS = 6_000;
export const NPC_RESPAWN_MIN_MS = 2_500;
export const NPC_RESPAWN_MAX_MS = 6_000;
export const DASH_MS = 320;
export const DASH_MULT = 2.6;
export const DASH_CD_MS = 2_600;
export const IDLE_MS = 45_000;

const LOG_LIMIT = 8;
const MAX_STEP_MS = 1_500;
const STEP_MS = 30;
const GROW_FACTOR = 0.45;
const NPC_CHASE_RANGE = 320;
const NPC_FLEE_RANGE = 260;
const WALL_AVOID_RANGE = 110;
const WALL_AVOID_PUSH = 1.7;
// NPC 只朝目标方向转，不瞬间掉头；180° 大约需要 1 秒
const NPC_TURN_RATE = 3.0;
// NPC 比同体型玩家慢一点，鱼群不会满缸乱窜，玩家也追得上小鱼
const NPC_SPEED_FACTOR = 0.72;
// 客户端会把自己的鱼预测到半个同步周期之后，NPC 按玩家的速度提前看一点，才不会追着旧位置跑
const REACTION_LEAD_SEC = 0.2;

export type TankPlayer = {
  memberId: string;
  nickname: string;
  hue: number;
  x: number;
  y: number;
  size: number;
  dirX: number;
  dirY: number;
  alive: boolean;
  respawnAt: number;
  eats: number;
  lastSeen: number;
  dashUntil: number;
  dashReadyAt: number;
  dashDirX: number;
  dashDirY: number;
};

export type TankNpc = {
  id: string;
  name: string;
  hue: number;
  x: number;
  y: number;
  size: number;
  baseSize: number;
  dirX: number;
  dirY: number;
  wishX: number;
  wishY: number;
  alive: boolean;
  respawnAt: number;
  eats: number;
  turnAt: number;
};

export type FishTankState = {
  players: TankPlayer[];
  npcs: TankNpc[];
  logs: string[];
  updatedAt: number;
};

export type TankFishView = {
  id: string;
  kind: "player" | "npc";
  nickname: string;
  x: number;
  y: number;
  size: number;
  dirX: number;
  dirY: number;
  speed: number;
  hue: number;
  eats: number;
  dashing: boolean;
};

export type FishTankMe = {
  memberId: string;
  inTank: boolean;
  alive: boolean;
  size: number;
  speed: number;
  eats: number;
  rank: number;
  respawnInMs: number;
  dashing: boolean;
  dashReadyInMs: number;
};

export type FishTankView = {
  width: number;
  height: number;
  capacity: number;
  count: number;
  serverNow: number;
  fish: TankFishView[];
  me: FishTankMe | null;
  logs: string[];
};

export class FishTankError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.name = "FishTankError";
    this.code = code;
  }
}

export type NpcTemplate = { name: string; size: number; hue: number };

export const NPC_TEMPLATES: NpcTemplate[] = [
  { name: "小孔雀", size: 10, hue: 188 },
  { name: "沙丁鱼", size: 14, hue: 214 },
  { name: "霓虹灯", size: 16, hue: 152 },
  { name: "小金鱼", size: 20, hue: 34 },
  { name: "虎皮鱼", size: 24, hue: 46 },
  { name: "蓝眼灯", size: 26, hue: 196 },
  { name: "神仙鱼", size: 32, hue: 278 },
  { name: "鲶鱼", size: 42, hue: 8 },
  { name: "大锦鲤", size: 58, hue: 348 },
  { name: "银龙鱼", size: 70, hue: 226 },
];

function templateWeight(template: NpcTemplate): number {
  return Math.pow(30 / template.size, 1.5);
}

export function pickNpcTemplate(roll = Math.random()): NpcTemplate {
  const total = NPC_TEMPLATES.reduce((sum, template) => sum + templateWeight(template), 0);
  let value = roll * total;
  for (const template of NPC_TEMPLATES) {
    value -= templateWeight(template);
    if (value <= 0) return template;
  }
  return NPC_TEMPLATES[NPC_TEMPLATES.length - 1]!;
}

const PLAYER_SPAWNS = [
  { x: 0.1, y: 0.16 },
  { x: 0.5, y: 0.1 },
  { x: 0.9, y: 0.16 },
  { x: 0.14, y: 0.5 },
  { x: 0.86, y: 0.5 },
  { x: 0.1, y: 0.84 },
  { x: 0.5, y: 0.9 },
  { x: 0.9, y: 0.84 },
];

type Target =
  | { kind: "player"; ref: TankPlayer }
  | { kind: "npc"; ref: TankNpc };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function speedOf(size: number): number {
  return Math.max(55, 210 - size * 1.9);
}

function npcSpeedOf(size: number): number {
  return round1(speedOf(size) * NPC_SPEED_FACTOR);
}

function hueOf(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) % 360;
  return hash;
}

function pushLog(state: FishTankState, text: string) {
  state.logs.push(text);
  if (state.logs.length > LOG_LIMIT) state.logs = state.logs.slice(-LOG_LIMIT);
}

function chooseNpcSpawn(state: FishTankState, size: number, rng: () => number): { x: number; y: number } {
  const margin = size + 8;
  const spanX = Math.max(0, TANK_W - margin * 2);
  const spanY = Math.max(0, TANK_H - margin * 2);
  const others = targets(state).map((target) => target.ref);
  let best = { x: round1(margin + spanX / 2), y: round1(margin + spanY / 2) };
  let bestScore = -1;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const x = round1(margin + rng() * spanX);
    const y = round1(margin + rng() * spanY);
    let score = Number.POSITIVE_INFINITY;
    for (const other of others) {
      score = Math.min(score, Math.hypot(other.x - x, other.y - y));
    }
    if (!Number.isFinite(score)) score = TANK_W;
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
    if (bestScore >= 260) break;
  }
  return best;
}

function createNpc(
  id: string,
  template: NpcTemplate,
  state: FishTankState,
  now: number,
  rng: () => number,
): TankNpc {
  const spawn = chooseNpcSpawn(state, template.size, rng);
  return {
    id,
    name: template.name,
    hue: template.hue,
    x: spawn.x,
    y: spawn.y,
    size: template.size,
    baseSize: template.size,
    dirX: 0,
    dirY: 0,
    wishX: 0,
    wishY: 0,
    alive: true,
    respawnAt: 0,
    eats: 0,
    turnAt: now + 300 + Math.floor(rng() * 700),
  };
}

function nextNpcId(state: FishTankState): string {
  let index = state.npcs.length + 1;
  while (state.npcs.some((npc) => npc.id === `npc-${index}`)) index += 1;
  return `npc-${index}`;
}

export function ensureTankShape(state: FishTankState, now: number, rng: () => number = Math.random): void {
  for (const player of state.players) {
    if (!Number.isFinite(player.dashUntil)) player.dashUntil = 0;
    if (!Number.isFinite(player.dashReadyAt)) player.dashReadyAt = 0;
    if (!Number.isFinite(player.dashDirX)) player.dashDirX = 0;
    if (!Number.isFinite(player.dashDirY)) player.dashDirY = 0;
  }
  for (const npc of state.npcs) {
    if (!Number.isFinite(npc.wishX)) npc.wishX = npc.dirX;
    if (!Number.isFinite(npc.wishY)) npc.wishY = npc.dirY;
  }
  while (state.npcs.length < NPC_COUNT) {
    const template = pickNpcTemplate(rng());
    state.npcs.push(createNpc(nextNpcId(state), template, state, now, rng));
  }
}

export function createTank(now = Date.now(), rng: () => number = Math.random): FishTankState {
  const state: FishTankState = {
    players: [],
    npcs: [],
    logs: [`鱼缸里的水刚换过，${NPC_COUNT} 条小鱼正在打转。`],
    updatedAt: now,
  };
  for (let index = 0; index < NPC_COUNT; index += 1) {
    const template = NPC_TEMPLATES[index % NPC_TEMPLATES.length]!;
    state.npcs.push(createNpc(`npc-${index + 1}`, template, state, now, rng));
  }
  return state;
}

function nameOf(target: Target): string {
  return target.kind === "player" ? target.ref.nickname : target.ref.name;
}

function idOf(target: Target): string {
  return target.kind === "player" ? target.ref.memberId : target.ref.id;
}

function sizeOf(target: Target): number {
  return target.ref.size;
}

function targets(state: FishTankState, aliveOnly = true): Target[] {
  const list: Target[] = [];
  for (const player of state.players) {
    if (aliveOnly && !player.alive) continue;
    list.push({ kind: "player", ref: player });
  }
  for (const npc of state.npcs) {
    if (aliveOnly && !npc.alive) continue;
    list.push({ kind: "npc", ref: npc });
  }
  return list;
}

function chooseSpawn(state: FishTankState, size: number): { x: number; y: number } {
  let best = { x: TANK_W / 2, y: TANK_H / 2 };
  let bestScore = -1;
  const others = targets(state);
  for (const point of PLAYER_SPAWNS) {
    const x = clamp(point.x * TANK_W, size, TANK_W - size);
    const y = clamp(point.y * TANK_H, size, TANK_H - size);
    let score = Number.POSITIVE_INFINITY;
    for (const other of others) {
      score = Math.min(score, Math.hypot(other.ref.x - x, other.ref.y - y));
    }
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }
  return { x: round1(best.x), y: round1(best.y) };
}

export function joinTank(state: FishTankState, member: { id: string; nickname: string }, now: number): TankPlayer {
  const existing = state.players.find((player) => player.memberId === member.id);
  if (existing) {
    existing.nickname = member.nickname;
    existing.lastSeen = now;
    return existing;
  }
  if (state.players.length >= TANK_CAPACITY) throw new FishTankError("tank_full");
  const spawn = chooseSpawn(state, START_SIZE);
  const player: TankPlayer = {
    memberId: member.id,
    nickname: member.nickname,
    hue: hueOf(member.id),
    x: spawn.x,
    y: spawn.y,
    size: START_SIZE,
    dirX: 0,
    dirY: 0,
    alive: true,
    respawnAt: 0,
    eats: 0,
    lastSeen: now,
    dashUntil: 0,
    dashReadyAt: 0,
    dashDirX: 0,
    dashDirY: 0,
  };
  state.players.push(player);
  state.updatedAt = now;
  pushLog(state, `${member.nickname} 下缸了`);
  return player;
}

export function leaveTank(state: FishTankState, memberId: string, _now: number): boolean {
  const before = state.players.length;
  state.players = state.players.filter((player) => player.memberId !== memberId);
  return state.players.length !== before;
}

function startDash(player: TankPlayer, now: number): void {
  if (now < (player.dashReadyAt ?? 0)) return;
  let dirX = player.dirX;
  let dirY = player.dirY;
  let len = Math.hypot(dirX, dirY);
  if (len < 0.01) {
    dirX = 1;
    dirY = 0;
    len = 1;
  }
  player.dashDirX = dirX / len;
  player.dashDirY = dirY / len;
  player.dashUntil = now + DASH_MS;
  player.dashReadyAt = now + DASH_CD_MS;
}

export function moveTank(
  state: FishTankState,
  memberId: string,
  dx: number,
  dy: number,
  now: number,
  dash = false,
): boolean {
  const player = state.players.find((item) => item.memberId === memberId);
  if (!player) return false;
  player.lastSeen = now;
  if (!player.alive) {
    player.dirX = 0;
    player.dirY = 0;
    player.dashUntil = 0;
    return true;
  }
  let x = Number.isFinite(dx) ? clamp(dx, -1, 1) : 0;
  let y = Number.isFinite(dy) ? clamp(dy, -1, 1) : 0;
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  player.dirX = x;
  player.dirY = y;
  if (dash) startDash(player, now);
  return true;
}

export function respawnTank(state: FishTankState, memberId: string, now: number): void {
  const player = state.players.find((item) => item.memberId === memberId);
  if (!player) throw new FishTankError("not_in_tank");
  if (player.alive) return;
  if (now < player.respawnAt) throw new FishTankError("respawn_wait");
  const spawn = chooseSpawn(state, START_SIZE);
  player.x = spawn.x;
  player.y = spawn.y;
  player.size = START_SIZE;
  player.alive = true;
  player.respawnAt = 0;
  player.dirX = 0;
  player.dirY = 0;
  player.dashUntil = 0;
  player.dashDirX = 0;
  player.dashDirY = 0;
  player.dashReadyAt = 0;
  player.lastSeen = now;
  pushLog(state, `${player.nickname} 又游回了鱼缸`);
}

function reviveNpc(state: FishTankState, npc: TankNpc, now: number, rng: () => number): void {
  const template = pickNpcTemplate(rng());
  npc.name = template.name;
  npc.hue = template.hue;
  npc.baseSize = template.size;
  npc.size = template.size;
  const spawn = chooseNpcSpawn(state, template.size, rng);
  npc.x = spawn.x;
  npc.y = spawn.y;
  npc.dirX = 0;
  npc.dirY = 0;
  npc.wishX = 0;
  npc.wishY = 0;
  npc.eats = 0;
  npc.alive = true;
  npc.respawnAt = 0;
  npc.turnAt = now + 300 + Math.floor(rng() * 500);
}

function steer(npc: TankNpc, x: number, y: number): void {
  const len = Math.hypot(x, y);
  if (len < 1e-6) return;
  npc.wishX = x / len;
  npc.wishY = y / len;
}

function avoidWalls(npc: TankNpc): void {
  const range = WALL_AVOID_RANGE + npc.size * 0.5;
  const pushX =
    (1 - clamp((npc.x - npc.size) / range, 0, 1)) -
    (1 - clamp((TANK_W - npc.size - npc.x) / range, 0, 1));
  const pushY =
    (1 - clamp((npc.y - npc.size) / range, 0, 1)) -
    (1 - clamp((TANK_H - npc.size - npc.y) / range, 0, 1));
  steer(npc, npc.wishX + pushX * WALL_AVOID_PUSH, npc.wishY + pushY * WALL_AVOID_PUSH);
}

function aimPoint(target: Target, now: number): { x: number; y: number } {
  if (target.kind !== "player") return { x: target.ref.x, y: target.ref.y };
  const player = target.ref;
  const speed = speedOf(player.size) * (now < (player.dashUntil ?? 0) ? DASH_MULT : 1);
  return {
    x: clamp(player.x + player.dirX * speed * REACTION_LEAD_SEC, player.size, TANK_W - player.size),
    y: clamp(player.y + player.dirY * speed * REACTION_LEAD_SEC, player.size, TANK_H - player.size),
  };
}

type Reaction = {
  threat: Target | null;
  threatAt: { x: number; y: number };
  threatDist: number;
  prey: Target | null;
  preyAt: { x: number; y: number };
  preyDist: number;
};

function pickReaction(npc: TankNpc, pool: Target[], aims: Map<Target, { x: number; y: number }>): Reaction {
  let threat: Target | null = null;
  let threatDist = NPC_FLEE_RANGE;
  let threatAt = { x: 0, y: 0 };
  let prey: Target | null = null;
  let preyDist = NPC_CHASE_RANGE;
  let preyAt = { x: 0, y: 0 };
  for (const other of pool) {
    if (other.kind === "npc" && other.ref === npc) continue;
    const aim = aims.get(other)!;
    const dist = Math.hypot(aim.x - npc.x, aim.y - npc.y);
    if (other.ref.size >= npc.size * EAT_RATIO && dist < threatDist) {
      threat = other;
      threatDist = dist;
      threatAt = aim;
    } else if (npc.size >= other.ref.size * EAT_RATIO && dist < preyDist) {
      prey = other;
      preyDist = dist;
      preyAt = aim;
    }
  }
  return { threat, threatAt, threatDist, prey, preyAt, preyDist };
}

function applyReaction(npc: TankNpc, reaction: Reaction): boolean {
  if (reaction.threat) {
    steer(npc, npc.x - reaction.threatAt.x, npc.y - reaction.threatAt.y);
    avoidWalls(npc);
    return true;
  }
  if (reaction.prey) {
    steer(npc, reaction.preyAt.x - npc.x, reaction.preyAt.y - npc.y);
    avoidWalls(npc);
    return true;
  }
  return false;
}

function turnNpcs(state: FishTankState, now: number, rng: () => number) {
  const all = targets(state);
  const aims = new Map<Target, { x: number; y: number }>();
  for (const target of all) aims.set(target, aimPoint(target, now));
  const playersOnly = all.filter((target) => target.kind === "player");
  for (const npc of state.npcs) {
    if (!npc.alive) continue;
    // 玩家靠近要马上反应；NPC 之间的追逐仍按自己的转向节拍，避免一群鱼每帧互相掉头
    if (applyReaction(npc, pickReaction(npc, playersOnly, aims))) continue;
    if (now < npc.turnAt) continue;
    if (!applyReaction(npc, pickReaction(npc, all, aims))) {
      const angle = rng() * Math.PI * 2;
      steer(npc, Math.cos(angle), Math.sin(angle));
      avoidWalls(npc);
    }
    npc.turnAt = now + 500 + Math.floor(rng() * 900);
  }
}

function turnNpc(npc: TankNpc, dtSec: number): void {
  const wishLen = Math.hypot(npc.wishX, npc.wishY);
  if (wishLen < 1e-6) return;
  const tx = npc.wishX / wishLen;
  const ty = npc.wishY / wishLen;
  const len = Math.hypot(npc.dirX, npc.dirY);
  if (len < 1e-6) {
    npc.dirX = tx;
    npc.dirY = ty;
    return;
  }
  const cx = npc.dirX / len;
  const cy = npc.dirY / len;
  const dot = clamp(cx * tx + cy * ty, -1, 1);
  const angle = Math.acos(dot);
  const maxTurn = NPC_TURN_RATE * dtSec;
  if (angle <= maxTurn) {
    npc.dirX = tx;
    npc.dirY = ty;
    return;
  }
  const sign = cx * ty - cy * tx >= 0 ? 1 : -1;
  const rot = maxTurn * sign;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  npc.dirX = cx * cos - cy * sin;
  npc.dirY = cx * sin + cy * cos;
}

function swim(target: Target, dtSec: number, at: number) {
  const ref = target.ref;
  let dirX = ref.dirX;
  let dirY = ref.dirY;
  let speed = target.kind === "npc" ? npcSpeedOf(ref.size) : speedOf(ref.size);
  if (target.kind === "player" && at < (target.ref.dashUntil ?? 0)) {
    const player = target.ref;
    dirX = player.dashDirX ?? 0;
    dirY = player.dashDirY ?? 0;
    speed *= DASH_MULT;
  } else if (target.kind === "npc") {
    turnNpc(target.ref, dtSec);
    dirX = ref.dirX;
    dirY = ref.dirY;
  }
  const margin = ref.size;
  ref.x = round1(clamp(ref.x + dirX * speed * dtSec, margin, TANK_W - margin));
  ref.y = round1(clamp(ref.y + dirY * speed * dtSec, margin, TANK_H - margin));
}

function eat(state: FishTankState, eater: Target, victim: Target, now: number, rng: () => number) {
  eater.ref.size = Math.min(MAX_SIZE, round1(eater.ref.size + victim.ref.size * GROW_FACTOR));
  eater.ref.eats += 1;
  pushLog(state, `${nameOf(eater)} 吞掉了 ${nameOf(victim)}`);
  victim.ref.alive = false;
  victim.ref.dirX = 0;
  victim.ref.dirY = 0;
  if (victim.kind === "player") {
    victim.ref.dashUntil = 0;
    victim.ref.respawnAt = now + RESPAWN_MS;
  } else {
    const wait = NPC_RESPAWN_MIN_MS + Math.floor(rng() * (NPC_RESPAWN_MAX_MS - NPC_RESPAWN_MIN_MS + 1));
    victim.ref.respawnAt = now + wait;
  }
}

function resolveEating(state: FishTankState, now: number, rng: () => number) {
  const all = targets(state).sort((a, b) => sizeOf(b) - sizeOf(a));
  const eaten = new Set<string>();
  for (const eater of all) {
    if (eaten.has(idOf(eater))) continue;
    let victim: Target | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const other of all) {
      if (other === eater || eaten.has(idOf(other))) continue;
      if (sizeOf(eater) < sizeOf(other) * EAT_RATIO) continue;
      const dist = Math.hypot(eater.ref.x - other.ref.x, eater.ref.y - other.ref.y);
      if (dist > (sizeOf(eater) + sizeOf(other)) * 0.5) continue;
      if (dist < bestDist) {
        bestDist = dist;
        victim = other;
      }
    }
    if (victim) {
      eat(state, eater, victim, now, rng);
      eaten.add(idOf(victim));
    }
  }
}

export function advance(state: FishTankState, now: number, rng: () => number = Math.random): void {
  const elapsed = Math.max(0, Math.min(now - state.updatedAt, MAX_STEP_MS));
  if (state.players.length) {
    state.players = state.players.filter((player) => now - player.lastSeen <= IDLE_MS);
  }
  for (const npc of state.npcs) {
    if (!npc.alive && npc.respawnAt <= now) reviveNpc(state, npc, now, rng);
  }
  // 没人在缸里时保持静止，避免空鱼缸也被反复写入数据库
  if (!state.players.length) return;
  const steps = Math.max(1, Math.ceil(elapsed / STEP_MS));
  const dtSec = elapsed / steps / 1000;
  const start = now - elapsed;
  // 转向按同步周期判定一次即可；有威胁或猎物时不看 turnAt，马上反应
  turnNpcs(state, now, rng);
  for (let step = 0; step < steps; step += 1) {
    const at = start + ((step + 1) * elapsed) / steps;
    const all = targets(state);
    for (const target of all) swim(target, dtSec, at);
    resolveEating(state, now, rng);
  }
  state.updatedAt = now;
}

export function viewTank(state: FishTankState, memberId: string, now: number): FishTankView {
  const alivePlayers = state.players.filter((player) => player.alive).sort((a, b) => b.size - a.size);
  const fish: TankFishView[] = [];
  for (const player of alivePlayers) {
    const dashing = now < (player.dashUntil ?? 0);
    fish.push({
      id: player.memberId,
      kind: "player",
      nickname: player.nickname,
      x: player.x,
      y: player.y,
      size: player.size,
      dirX: dashing ? player.dashDirX ?? 0 : player.dirX,
      dirY: dashing ? player.dashDirY ?? 0 : player.dirY,
      speed: round1(speedOf(player.size) * (dashing ? DASH_MULT : 1)),
      hue: player.hue,
      eats: player.eats,
      dashing,
    });
  }
  for (const npc of state.npcs) {
    if (!npc.alive) continue;
    fish.push({
      id: npc.id,
      kind: "npc",
      nickname: npc.name,
      x: npc.x,
      y: npc.y,
      size: npc.size,
      dirX: npc.dirX,
      dirY: npc.dirY,
      speed: npcSpeedOf(npc.size),
      hue: npc.hue,
      eats: npc.eats,
      dashing: false,
    });
  }
  const me = state.players.find((player) => player.memberId === memberId);
  const meDashing = me ? now < (me.dashUntil ?? 0) : false;
  return {
    width: TANK_W,
    height: TANK_H,
    capacity: TANK_CAPACITY,
    count: state.players.length,
    serverNow: now,
    fish,
    me: me
      ? {
          memberId: me.memberId,
          inTank: true,
          alive: me.alive,
          size: me.size,
          speed: round1(speedOf(me.size) * (meDashing ? DASH_MULT : 1)),
          eats: me.eats,
          rank: me.alive ? alivePlayers.indexOf(me) + 1 : 0,
          respawnInMs: me.alive ? 0 : Math.max(0, me.respawnAt - now),
          dashing: meDashing,
          dashReadyInMs: Math.max(0, (me.dashReadyAt ?? 0) - now),
        }
      : null,
    logs: state.logs.slice(-LOG_LIMIT),
  };
}
