import {
  DASH_CD_MS,
  DASH_MS,
  DASH_MULT,
  EAT_RATIO,
  FishTankError,
  IDLE_MS,
  NPC_COUNT,
  NPC_TEMPLATES,
  RESPAWN_MS,
  START_SIZE,
  TANK_CAPACITY,
  TANK_H,
  TANK_W,
  advance,
  createTank,
  ensureTankShape,
  joinTank,
  leaveTank,
  moveTank,
  pickNpcTemplate,
  respawnTank,
  speedOf,
  viewTank,
  type FishTankState,
  type TankNpc,
  type TankPlayer,
} from "./fishtank.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const T0 = 1_760_000_000_000;

function makePlayer(memberId: string, x: number, y: number, size: number, extra: Partial<TankPlayer> = {}): TankPlayer {
  return {
    memberId,
    nickname: `住户${memberId}`,
    hue: 200,
    x,
    y,
    size,
    dirX: 0,
    dirY: 0,
    alive: true,
    respawnAt: 0,
    eats: 0,
    lastSeen: T0,
    dashUntil: 0,
    dashReadyAt: 0,
    dashDirX: 0,
    dashDirY: 0,
    ...extra,
  };
}

function makeNpc(id: string, x: number, y: number, size: number, extra: Partial<TankNpc> = {}): TankNpc {
  return {
    id,
    name: `NPC${id}`,
    hue: 30,
    x,
    y,
    size,
    baseSize: size,
    dirX: 0,
    dirY: 0,
    wishX: 0,
    wishY: 0,
    alive: true,
    respawnAt: 0,
    eats: 0,
    turnAt: T0 + 60_000,
    ...extra,
  };
}

function makeTank(players: TankPlayer[], npcs: TankNpc[] = []): FishTankState {
  return { players, npcs, logs: [], updatedAt: T0 };
}

function inside(state: FishTankState, fish: { x: number; y: number; size: number }, label: string) {
  assert(fish.x >= fish.size && fish.x <= TANK_W - fish.size, `${label} 的 x 越界：${fish.x}`);
  assert(fish.y >= fish.size && fish.y <= TANK_H - fish.size, `${label} 的 y 越界：${fish.y}`);
}

Deno.test("新鱼缸默认有 10 条 NPC 鱼，玩家为空", () => {
  const state = createTank(T0);
  assert(state.players.length === 0, `初始玩家应为空，实际 ${state.players.length}`);
  assert(state.npcs.length === 10 && state.npcs.every((npc) => npc.alive), `应有 10 条活着的 NPC 鱼，实际 ${state.npcs.length}`);
  assert(new Set(state.npcs.map((npc) => npc.id)).size === 10, "NPC 的 id 不应重复");
  for (const npc of state.npcs) inside(state, npc, npc.id);
});

Deno.test("最多 8 人，第 9 人提示 tank_full，重复加入不占新位置", () => {
  const state = createTank(T0);
  for (let i = 1; i <= TANK_CAPACITY; i += 1) {
    joinTank(state, { id: `m${i}`, nickname: `住户${i}` }, T0 + i);
  }
  assert(state.players.length === TANK_CAPACITY, `应有 ${TANK_CAPACITY} 名玩家，实际 ${state.players.length}`);
  for (const player of state.players) inside(state, player, player.memberId);

  let full = false;
  try {
    joinTank(state, { id: "m9", nickname: "第九人" }, T0 + 9);
  } catch (error) {
    full = error instanceof FishTankError && error.code === "tank_full";
  }
  assert(full, "第 9 人加入应抛出 tank_full");

  joinTank(state, { id: "m1", nickname: "阿岚改名" }, T0 + 10);
  assert(state.players.length === TANK_CAPACITY, "重复加入不应多占位置");
  assert(state.players[0]!.nickname === "阿岚改名", "重复加入应刷新昵称");
});

Deno.test("moveTank 归一化方向、过滤非法值，并把鱼限制在缸内", () => {
  const state = makeTank([makePlayer("m1", 5, 5, START_SIZE)]);
  moveTank(state, "m1", 2, 2, T0 + 10);
  const player = state.players[0]!;
  assert(Math.abs(Math.hypot(player.dirX, player.dirY) - 1) < 1e-9, "斜向方向应归一化为单位长度");
  assert(Math.abs(player.dirX - Math.SQRT1_2) < 1e-9, "斜向 x 分量应为 0.7071");

  moveTank(state, "m1", Number.NaN, 5, T0 + 20);
  assert(player.dirX === 0 && player.dirY === 1, `非法输入应归零本次非法轴，实际 ${player.dirX}/${player.dirY}`);

  moveTank(state, "m1", -1, 0, T0 + 30);
  advance(state, T0 + 530);
  assert(player.x === player.size, `鱼应被挡在左边界，实际 x=${player.x}`);
  assert(player.y === player.size, `鱼应被限制在上边界，实际 y=${player.y}`);
  inside(state, player, "m1");
});

Deno.test("大鱼吞掉更小的 NPC：自己变大，NPC 进入冷却", () => {
  const state = makeTank(
    [makePlayer("m1", 310, 300, 30)],
    [makeNpc("npc-1", 300, 300, 12)],
  );
  advance(state, T0 + 20);
  const player = state.players[0]!;
  const npc = state.npcs[0]!;
  assert(player.eats === 1, `玩家应吞掉 1 条，实际 ${player.eats}`);
  assert(player.size > 30, `吞鱼后应变大，实际 ${player.size}`);
  assert(npc.alive === false, "被吞的 NPC 应消失");
  const wait = npc.respawnAt - (T0 + 20);
  assert(wait >= 2_500 && wait <= 6_000, `NPC 应在几秒后重生，实际冷却 ${wait}ms`);
  assert(state.logs.some((line) => line.includes("NPCnpc-1")), "日志应记录吞鱼事件");
});

Deno.test("体型差距不够就吃不了", () => {
  const state = makeTank(
    [makePlayer("m1", 300, 300, 20)],
    [makeNpc("npc-1", 360, 300, 24)],
  );
  advance(state, T0 + 20);
  const player = state.players[0]!;
  assert(player.eats === 0, "差距不足 1.15 倍时不应吞掉对方");
  assert(state.npcs[0]!.alive === true, "大鱼不应被小鱼吞掉");
  assert(player.alive === true, "保持安全距离时玩家不应被吃掉");
});

Deno.test("大玩家吞掉小玩家，被吞者进入观战并等待冷却", () => {
  const state = makeTank([
    makePlayer("a", 400, 300, 30),
    makePlayer("b", 410, 300, 20),
  ]);
  advance(state, T0 + 20);
  const eater = state.players[0]!;
  const victim = state.players[1]!;
  assert(eater.eats === 1, "大玩家应吞掉小玩家");
  assert(eater.size > 30, `大玩家应变大，实际 ${eater.size}`);
  assert(victim.alive === false, "小玩家应被淘汰");
  assert(victim.respawnAt === T0 + 20 + RESPAWN_MS, `复活冷却不对：${victim.respawnAt}`);

  const view = viewTank(state, "b", T0 + 30);
  assert(view.count === 2, "被吞的玩家仍占位观战");
  assert(view.me !== null && view.me.alive === false, "被吞者视角应为观战");
  assert(view.me !== null && view.me.respawnInMs === RESPAWN_MS - 10, `复活倒计时不对：${view.me?.respawnInMs}`);
  assert(!view.fish.some((fish) => fish.id === "b"), "观战者的鱼不应出现在画面里");
});

Deno.test("复活有冷却，冷却结束后回到初始体型", () => {
  const state = makeTank([
    makePlayer("m1", 300, 300, 40, { alive: false, respawnAt: T0 + 5_000 }),
  ]);
  let locked = false;
  try {
    respawnTank(state, "m1", T0 + 4_000);
  } catch (error) {
    locked = error instanceof FishTankError && error.code === "respawn_wait";
  }
  assert(locked, "冷却未结束时应抛出 respawn_wait");

  respawnTank(state, "m1", T0 + 5_001);
  const player = state.players[0]!;
  assert(player.alive === true, "冷却结束后应复活");
  assert(player.size === START_SIZE, `复活体型应为 ${START_SIZE}，实际 ${player.size}`);
  assert(player.respawnAt === 0, "复活后应清空冷却时间");
  inside(state, player, "m1");
});

Deno.test("离缸会移除玩家并腾出位置", () => {
  const state = createTank(T0);
  for (let i = 1; i <= TANK_CAPACITY; i += 1) {
    joinTank(state, { id: `m${i}`, nickname: `住户${i}` }, T0 + i);
  }
  assert(leaveTank(state, "m1", T0 + 20) === true, "离缸应返回 true");
  assert(state.players.length === TANK_CAPACITY - 1, "离缸后人数应减一");
  assert(leaveTank(state, "m1", T0 + 21) === false, "重复离缸应返回 false");

  joinTank(state, { id: "m9", nickname: "第九人" }, T0 + 22);
  assert(state.players.length === TANK_CAPACITY, "空出的位置应允许新人加入");
});

Deno.test("45 秒没有请求的玩家会被自动清理", () => {
  const state = makeTank([
    makePlayer("stale", 300, 300, 20, { lastSeen: T0 }),
    makePlayer("fresh", 500, 300, 20, { lastSeen: T0 + IDLE_MS }),
  ]);
  advance(state, T0 + IDLE_MS + 1);
  assert(state.players.length === 1 && state.players[0]!.memberId === "fresh", "只有超时的玩家应被清理");
});

Deno.test("被吃掉的 NPC 几秒后在随机位置以随机鱼种重生", () => {
  const state = makeTank(
    [makePlayer("m1", 100, 450, 18)],
    [makeNpc("npc-3", 480, 270, 30, { alive: false, respawnAt: T0 + 3_000 })],
  );
  advance(state, T0 + 3_000);
  const npc = state.npcs[0]!;
  assert(npc.alive === true, "冷却结束后 NPC 应重生");
  assert([10, 14, 16, 20, 24, 26, 32, 42, 58, 70].includes(npc.size), `重生体型应来自鱼种模板，实际 ${npc.size}`);
  assert(npc.baseSize === npc.size, `重生后的基础体型应同步，实际 ${npc.baseSize}/${npc.size}`);
  assert(npc.respawnAt === 0, "重生后应清空冷却时间");
  assert(npc.turnAt >= T0 + 3_000, "重生后应重新安排转向，避免立即贴墙");
  inside(state, npc, "npc-3");
});

Deno.test("NPC 贴到缸壁会转向游开，不会卡死在角落", () => {
  const state = makeTank(
    [makePlayer("m1", 900, 60, 18)],
    [
      makeNpc("npc-1", 40, 500, 40, { turnAt: T0 }),
      makeNpc("npc-2", 10, 530, 10),
    ],
  );
  advance(state, T0 + 2_000);
  const npc = state.npcs[0]!;
  const moved = Math.hypot(npc.x - 40, npc.y - 500);
  assert(moved > 30, `贴墙的 NPC 应游走，实际只移动了 ${moved.toFixed(1)}px`);
  inside(state, npc, "npc-1");
});

Deno.test("重生鱼种偏向小鱼：小鱼刷新概率明显高于大鱼", () => {
  const counts = new Map<number, number>();
  const samples = 10_000;
  for (let index = 0; index < samples; index += 1) {
    const template = pickNpcTemplate((index + 0.5) / samples);
    counts.set(template.size, (counts.get(template.size) ?? 0) + 1);
  }
  const small = (counts.get(10) ?? 0) + (counts.get(14) ?? 0) + (counts.get(16) ?? 0);
  const big = (counts.get(42) ?? 0) + (counts.get(58) ?? 0) + (counts.get(70) ?? 0);
  assert(small > big * 3, `小鱼刷新次数（${small}）应明显多于大鱼（${big}）`);
  assert((counts.get(10) ?? 0) > (counts.get(70) ?? 0), "最小的鱼应比最大的鱼更容易刷出");
  assert(NPC_TEMPLATES.length >= NPC_COUNT, "鱼种模板应够铺满鱼缸");
});

Deno.test("旧鱼缸状态会补齐到 10 条 NPC", () => {
  const npcs = Array.from({ length: 6 }, (_, index) =>
    makeNpc(`npc-${index + 1}`, 100 + index * 100, 200, 20),
  );
  const state = makeTank([], npcs);
  ensureTankShape(state, T0);
  assert(state.npcs.length === NPC_COUNT, `应补齐到 ${NPC_COUNT} 条，实际 ${state.npcs.length}`);
  assert(new Set(state.npcs.map((npc) => npc.id)).size === NPC_COUNT, "补齐后 id 不应重复");
  for (const npc of state.npcs) inside(state, npc, npc.id);
});

Deno.test("突进：短时加速、方向锁定并进入冷却", () => {
  const state = makeTank([makePlayer("m1", 300, 270, START_SIZE)]);
  assert(moveTank(state, "m1", 1, 0, T0, true), "突进请求应被处理");
  const player = state.players[0]!;
  assert(player.dashUntil === T0 + DASH_MS, `突进持续时间不对：${player.dashUntil - T0}`);
  assert(player.dashReadyAt === T0 + DASH_CD_MS, `突进冷却不对：${player.dashReadyAt - T0}`);
  assert(player.dashDirX === 1 && player.dashDirY === 0, "突进方向应锁定为触发时的方向");

  advance(state, T0 + DASH_MS);
  const moved = player.x - 300;
  const normal = (speedOf(START_SIZE) * DASH_MS) / 1000;
  assert(moved > normal * 1.6, `突进位移应明显超过普通游动，实际 ${moved.toFixed(1)}px，普通约 ${normal.toFixed(1)}px`);
  inside(state, player, "m1");

  moveTank(state, "m1", 0, 1, T0 + DASH_MS + 100, true);
  assert(player.dashUntil === T0 + DASH_MS, "冷却期间不应再次突进");
  assert(player.dirY === 1, "冷却期间仍可正常转向");
  moveTank(state, "m1", 1, 0, T0 + DASH_CD_MS, true);
  assert(player.dashUntil === T0 + DASH_CD_MS + DASH_MS, "冷却结束后应能再次突进");
});

Deno.test("视角显示突进状态与冷却，死鱼不能突进", () => {
  const state = makeTank([makePlayer("m1", 300, 270, START_SIZE)]);
  moveTank(state, "m1", 1, 0, T0, true);
  const during = viewTank(state, "m1", T0 + 100);
  assert(during.me?.dashing === true, "突进期间视角应标记 dashing");
  assert(during.me?.dashReadyInMs === DASH_CD_MS - 100, `冷却倒计时应剩 ${DASH_CD_MS - 100}ms`);
  const dashSpeed = Math.round(speedOf(START_SIZE) * DASH_MULT * 10) / 10;
  assert(during.me?.speed === dashSpeed, `突进速度应为 ${dashSpeed}，实际 ${during.me?.speed}`);
  const mine = during.fish.find((fish) => fish.id === "m1");
  assert(mine?.dashing === true && mine.speed === dashSpeed, "画面里的鱼应同步突进速度与状态");
  const after = viewTank(state, "m1", T0 + DASH_MS);
  assert(after.me?.dashing === false, "突进结束后应解除标记");

  const dead = makePlayer("dead", 400, 300, START_SIZE, { alive: false, respawnAt: T0 + 1_000 });
  const deadState = makeTank([dead]);
  moveTank(deadState, "dead", 1, 0, T0, true);
  assert(dead.dashUntil === 0, "死鱼不能突进");
});

Deno.test("视角：场外人没有 me，在场者有排名，死鱼不出现在画面里", () => {
  const state = makeTank(
    [
      makePlayer("big", 200, 200, 40),
      makePlayer("small", 700, 400, 18, { alive: false, respawnAt: T0 + 3_000 }),
    ],
    [makeNpc("npc-1", 480, 270, 12)],
  );
  const outsider = viewTank(state, "stranger", T0);
  assert(outsider.me === null, "未下缸的人不应有 me");
  assert(outsider.count === 2 && outsider.capacity === TANK_CAPACITY, "人数与容量应正确");
  assert(outsider.fish.length === 2, `画面应有 1 名玩家 + 1 条 NPC，实际 ${outsider.fish.length}`);
  assert(outsider.fish.every((fish) => fish.id !== "small"), "死鱼不应出现在画面里");

  const me = viewTank(state, "big", T0).me;
  assert(me !== null && me.alive === true && me.rank === 1, "最大的玩家应排第 1");
  assert(me !== null && me.speed === speedOf(40), "视角里的速度应与体型公式一致");
});

Deno.test("越大的鱼游得越慢", () => {
  assert(speedOf(12) > speedOf(30), "小鱼应比中等鱼快");
  assert(speedOf(30) > speedOf(58), "中等鱼应比大鱼快");
  assert(speedOf(88) > 0, "速度应保持为正数");
  assert(EAT_RATIO > 1, "吞食所需体型比例应大于 1");
});

Deno.test("NPC 发现附近的威胁会立刻转向逃走", () => {
  const state = makeTank(
    [makePlayer("hunter", 300, 380, 30)],
    [makeNpc("prey", 300, 300, 12, { turnAt: T0 + 60_000 })],
  );
  advance(state, T0 + 200);
  const npc = state.npcs[0]!;
  const hunter = state.players[0]!;
  assert(npc.dirY < -0.5, `NPC 应向上逃离下方的威胁，实际方向 ${npc.dirX.toFixed(2)}/${npc.dirY.toFixed(2)}`);
  assert(npc.y < 300, `NPC 应远离威胁，实际 y=${npc.y}`);
  assert(
    Math.hypot(npc.x - hunter.x, npc.y - hunter.y) > 80,
    "逃离后与威胁的距离应变大",
  );
});

Deno.test("NPC 发现附近的猎物会主动追上去", () => {
  const state = makeTank(
    [makePlayer("prey", 300, 380, 12)],
    [makeNpc("hunter", 300, 300, 30, { turnAt: T0 + 60_000 })],
  );
  advance(state, T0 + 200);
  const npc = state.npcs[0]!;
  assert(npc.dirY > 0.5, `NPC 应朝下方的猎物游去，实际方向 ${npc.dirX.toFixed(2)}/${npc.dirY.toFixed(2)}`);
  assert(npc.y > 300, `NPC 应靠近猎物，实际 y=${npc.y}`);
});

Deno.test("没有威胁和猎物时，NPC 保持原方向直到转向时刻", () => {
  const state = makeTank(
    [makePlayer("me", 900, 500, 18)],
    [makeNpc("npc-1", 200, 200, 20, { dirX: 1, dirY: 0, wishX: 1, wishY: 0, turnAt: T0 + 60_000 })],
  );
  advance(state, T0 + 200);
  const npc = state.npcs[0]!;
  assert(npc.dirX > 0.99 && Math.abs(npc.dirY) < 0.01, "没有目标时不应频繁改向");
  assert(npc.x > 200, "应继续沿原方向游动");
});

Deno.test("NPC 转向有过渡：一次同步内不会瞬间掉头", () => {
  const state = makeTank(
    [makePlayer("hunter", 540, 300, 30)],
    [makeNpc("npc-1", 300, 300, 12, { dirX: 1, dirY: 0, wishX: 1, wishY: 0, turnAt: T0 + 60_000 })],
  );
  advance(state, T0 + 100);
  const npc = state.npcs[0]!;
  assert(npc.dirX > -0.2, `100 毫秒内不应完成 180° 掉头，实际 dirX=${npc.dirX.toFixed(2)}`);
  assert(Math.abs(npc.dirY) > 0.2, `应已开始转向，实际 dirY=${npc.dirY.toFixed(2)}`);
  advance(state, T0 + 900);
  assert(npc.dirX < -0.8, `900 毫秒内应转过来，实际 dirX=${npc.dirX.toFixed(2)}`);
});

Deno.test("NPC 转向更平缓：300 毫秒内不会转过 90°", () => {
  const state = makeTank(
    [makePlayer("hunter", 540, 300, 30)],
    [makeNpc("npc-1", 300, 300, 12, { dirX: 1, dirY: 0, wishX: 1, wishY: 0, turnAt: T0 + 60_000 })],
  );
  advance(state, T0 + 300);
  const npc = state.npcs[0]!;
  assert(npc.dirX > 0.4, `300 毫秒内不应转过 90°，实际 dirX=${npc.dirX.toFixed(2)}`);
});

Deno.test("NPC 游速比同体型玩家慢一些，鱼缸更从容", () => {
  const state = makeTank(
    [makePlayer("me", 300, 300, 20, { dirX: 1, dirY: 0 })],
    [makeNpc("npc-1", 300, 100, 20, { dirX: 1, dirY: 0, wishX: 1, wishY: 0, turnAt: T0 + 60_000 })],
  );
  advance(state, T0 + 1_000);
  const playerMoved = state.players[0]!.x - 300;
  const npcMoved = state.npcs[0]!.x - 300;
  assert(playerMoved > 150, `玩家应正常游动，实际位移 ${playerMoved.toFixed(1)}`);
  assert(npcMoved < playerMoved * 0.8, `NPC 应比同体型玩家慢，实际 ${npcMoved.toFixed(1)} / ${playerMoved.toFixed(1)}`);
  assert(npcMoved > playerMoved * 0.6, `NPC 也不应慢得过分，实际 ${npcMoved.toFixed(1)} / ${playerMoved.toFixed(1)}`);
  const npcSpeed = viewTank(state, "me", T0 + 1_000).fish.find((fish) => fish.kind === "npc")!.speed;
  assert(npcSpeed < speedOf(20), `视角里的 NPC 速度也应低于同体型玩家，实际 ${npcSpeed} / ${speedOf(20)}`);
});

Deno.test("NPC 之间的互动按自己的节拍，玩家靠近才即时反应", () => {
  const state = makeTank(
    [makePlayer("me", 900, 500, 18)],
    [
      makeNpc("big", 500, 300, 40, { dirX: 1, dirY: 0, wishX: 1, wishY: 0, turnAt: T0 + 60_000 }),
      makeNpc("small", 300, 300, 12, { dirX: 0, dirY: 1, wishX: 0, wishY: 1, turnAt: T0 + 60_000 }),
    ],
  );
  advance(state, T0 + 200);
  const small = state.npcs[1]!;
  assert(small.dirY > 0.9, `大鱼在旁边但还没到小鱼的节拍，小鱼应继续原方向，实际 dirY=${small.dirY.toFixed(2)}`);
  assert(small.wishY > 0.9, "没有玩家靠近时，小鱼的期望方向不应被大鱼带走");

  state.players.push(makePlayer("hunter", 300, 520, 30));
  advance(state, T0 + 300);
  assert(small.wishY < -0.9, `玩家靠近后应立即掉头，实际 wishY=${small.wishY.toFixed(2)}`);
  assert(Math.abs(small.dirX) > 0.2, "转向应开始过渡，而不是瞬间反向");
});

