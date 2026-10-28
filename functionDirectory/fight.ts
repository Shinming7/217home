export type FightMove = "jab" | "hook" | "block" | "dodge";
export type FightPhase = "waiting" | "fight" | "over";

export type FightLog = { text: string; by: string | null };

export type FightFighter = {
  memberId: string;
  nickname: string;
  look: Record<string, string> | null;
  hp: number;
  move: FightMove | null;
  moveRound: number;
  lastMove: FightMove | null;
  lastDealt: number;
  lastTaken: number;
  seenAt: number;
};

export type FightOutcome = {
  winnerId: string | null;
  winnerName: string | null;
  loserId: string | null;
  loserName: string | null;
  rounds: number;
  walkover: boolean;
  draw: boolean;
};

export type FightState = {
  phase: FightPhase;
  round: number;
  resolvedRound: number;
  deadline: number;
  fighters: FightFighter[];
  logs: FightLog[];
  over: FightOutcome | null;
  updatedAt: number;
};

export type FightSettlement = {
  winnerId: string;
  loserId: string;
  winnerName: string;
  loserName: string;
  rounds: number;
};

export class FightError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.name = "FightError";
    this.code = code;
  }
}

export const FIGHT_MAX_HP = 100;
export const FIGHT_ROUND_MS = 30_000;
export const FIGHT_OVER_MS = 20_000;
const STALE_MS = 30_000;
const WAIT_STALE_MS = 90_000;
const HEARTBEAT_MS = 5_000;
const LOG_LIMIT = 20;

const MOVE_LABEL: Record<FightMove, string> = { jab: "直拳", hook: "摆拳", block: "格挡", dodge: "闪避" };
const MOVES = new Set<FightMove>(["jab", "hook", "block", "dodge"]);

function rand(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] / 0x1_0000_0000;
}

export function createFightState(): FightState {
  return {
    phase: "waiting",
    round: 0,
    resolvedRound: 0,
    deadline: 0,
    fighters: [],
    logs: [{ text: "八角笼空着，门虚掩着等人。", by: null }],
    over: null,
    updatedAt: Date.now(),
  };
}

function pushLog(state: FightState, text: string, by: string | null = null) {
  state.logs.push({ text, by });
  if (state.logs.length > LOG_LIMIT) state.logs = state.logs.slice(-LOG_LIMIT);
}

function findFighter(state: FightState, memberId: string): FightFighter | null {
  return state.fighters.find((fighter) => fighter.memberId === memberId) ?? null;
}

function resetState(state: FightState, log: string, now: number) {
  const fresh = createFightState();
  fresh.logs = [{ text: log, by: null }];
  fresh.updatedAt = now;
  Object.assign(state, fresh);
}

type AttackResult = { damage: number; outcome: "hit" | "blocked" | "evaded" | "miss" };

function rollAttack(attack: FightMove, defender: FightMove): AttackResult {
  if (attack !== "jab" && attack !== "hook") return { damage: 0, outcome: "miss" };
  const accuracy = attack === "jab" ? 0.88 : 0.6;
  if (rand() > accuracy) return { damage: 0, outcome: "miss" };
  if (defender === "dodge" && rand() < 0.7) return { damage: 0, outcome: "evaded" };
  const base = attack === "jab" ? 10 + Math.floor(rand() * 4) : 18 + Math.floor(rand() * 7);
  if (defender === "block") return { damage: Math.max(1, Math.round(base * 0.3)), outcome: "blocked" };
  return { damage: base, outcome: "hit" };
}

function describe(attacker: FightFighter, defender: FightFighter, move: FightMove, result: AttackResult) {
  const label = MOVE_LABEL[move];
  if (result.outcome === "hit") {
    return { text: `${attacker.nickname} 的${label}正中 ${defender.nickname}，-${result.damage}。`, by: attacker.memberId };
  }
  if (result.outcome === "blocked") {
    return { text: `${attacker.nickname} 的${label}被 ${defender.nickname} 挡下，只擦到 ${result.damage} 点。`, by: attacker.memberId };
  }
  if (result.outcome === "evaded") {
    return { text: `${defender.nickname} 侧身闪过 ${attacker.nickname} 的${label}。`, by: defender.memberId };
  }
  return { text: `${attacker.nickname} 的${label}挥空了。`, by: attacker.memberId };
}

function resolveRound(state: FightState, now: number, settlements: FightSettlement[]) {
  if (state.phase !== "fight" || state.fighters.length !== 2) return;
  const [first, second] = state.fighters;
  const firstMove = first.move ?? "block";
  const secondMove = second.move ?? "block";
  const firstStrike = rollAttack(firstMove, secondMove);
  const secondStrike = rollAttack(secondMove, firstMove);

  first.lastMove = firstMove;
  second.lastMove = secondMove;
  first.lastDealt = firstStrike.damage;
  second.lastDealt = secondStrike.damage;
  first.lastTaken = secondStrike.damage;
  second.lastTaken = firstStrike.damage;
  first.hp = Math.max(0, first.hp - secondStrike.damage);
  second.hp = Math.max(0, second.hp - firstStrike.damage);
  first.move = null;
  second.move = null;
  first.moveRound = 0;
  second.moveRound = 0;
  state.resolvedRound = state.round;

  if (firstMove === "block" && secondMove === "block") {
    pushLog(state, `第 ${state.round} 回合 · 两人同时抱拳格挡，裁判都看困了。`);
  } else if (firstMove === "dodge" && secondMove === "dodge") {
    pushLog(state, `第 ${state.round} 回合 · 两人同时闪开，台上只剩风声。`);
  } else if (firstMove !== "jab" && firstMove !== "hook" && secondMove !== "jab" && secondMove !== "hook") {
    pushLog(
      state,
      `第 ${state.round} 回合 · ${first.nickname} 出${MOVE_LABEL[firstMove]}，${second.nickname} 出${MOVE_LABEL[secondMove]}，谁也没碰到谁。`,
    );
  } else {
    pushLog(state, `第 ${state.round} 回合 · ${first.nickname} 出${MOVE_LABEL[firstMove]}，${second.nickname} 出${MOVE_LABEL[secondMove]}。`);
    if (firstMove === "jab" || firstMove === "hook") {
      const firstLine = describe(first, second, firstMove, firstStrike);
      pushLog(state, firstLine.text, firstLine.by);
    }
    if (secondMove === "jab" || secondMove === "hook") {
      const secondLine = describe(second, first, secondMove, secondStrike);
      pushLog(state, secondLine.text, secondLine.by);
    }
  }

  const firstDown = first.hp <= 0;
  const secondDown = second.hp <= 0;
  if (firstDown || secondDown) {
    state.phase = "over";
    state.deadline = now + FIGHT_OVER_MS;
    if (firstDown && secondDown) {
      state.over = {
        winnerId: null,
        winnerName: null,
        loserId: null,
        loserName: null,
        rounds: state.round,
        walkover: false,
        draw: true,
      };
      pushLog(state, "两人同时倒下，裁判判平局。");
    } else {
      const winner = firstDown ? second : first;
      const loser = firstDown ? first : second;
      state.over = {
        winnerId: winner.memberId,
        winnerName: winner.nickname,
        loserId: loser.memberId,
        loserName: loser.nickname,
        rounds: state.round,
        walkover: false,
        draw: false,
      };
      pushLog(state, `K.O.！${winner.nickname} 赢下这场对决。`);
      settlements.push({
        winnerId: winner.memberId,
        loserId: loser.memberId,
        winnerName: winner.nickname,
        loserName: loser.nickname,
        rounds: state.round,
      });
    }
  } else {
    state.round += 1;
    state.deadline = now + FIGHT_ROUND_MS;
  }
  state.updatedAt = now;
}

function declareWalkover(
  state: FightState,
  winner: FightFighter,
  loser: FightFighter | null,
  reason: string,
  now: number,
) {
  state.phase = "over";
  state.deadline = now + FIGHT_OVER_MS;
  state.over = {
    winnerId: winner.memberId,
    winnerName: winner.nickname,
    loserId: loser?.memberId ?? null,
    loserName: loser?.nickname ?? null,
    rounds: state.round,
    walkover: true,
    draw: false,
  };
  pushLog(state, reason);
  state.updatedAt = now;
}

export function touchFight(state: FightState, memberId: string, now: number) {
  const fighter = findFighter(state, memberId);
  if (!fighter) return;
  if (now - fighter.seenAt < HEARTBEAT_MS) return;
  fighter.seenAt = now;
  state.updatedAt = now;
}

export function advanceFight(state: FightState, now: number, settlements: FightSettlement[]) {
  if (state.phase === "waiting") {
    if (state.fighters.length === 1 && now - state.fighters[0].seenAt > WAIT_STALE_MS) {
      resetState(state, "笼子里的人等太久，先走了，八角笼重新空出来。", now);
    }
    return;
  }

  if (state.phase === "fight") {
    const stale = state.fighters.filter((fighter) => now - fighter.seenAt > STALE_MS);
    if (stale.length >= 2) {
      resetState(state, "两人都掉线了，八角笼重新空出来。", now);
      return;
    }
    if (stale.length === 1) {
      const winner = state.fighters.find((fighter) => fighter !== stale[0]);
      if (winner) {
        declareWalkover(state, winner, stale[0], `${stale[0].nickname} 掉线了，${winner.nickname} 获胜。`, now);
        return;
      }
    }
    if (now >= state.deadline) {
      for (const fighter of state.fighters) {
        if (fighter.move && fighter.moveRound === state.round) continue;
        fighter.move = "block";
        fighter.moveRound = state.round;
        pushLog(state, `${fighter.nickname} 没来得及出招，抱头防守。`, fighter.memberId);
      }
      resolveRound(state, now, settlements);
    }
    return;
  }

  if (state.phase === "over" && now >= state.deadline) {
    resetState(state, "裁判收场，八角笼又空了出来。", now);
  }
}

export function joinArena(
  state: FightState,
  member: { id: string; nickname: string; look: Record<string, string> | null },
  now: number,
) {
  if (findFighter(state, member.id)) {
    touchFight(state, member.id, now);
    return;
  }
  if (state.phase !== "waiting") throw new FightError("arena_busy");
  if (state.fighters.length >= 2) throw new FightError("arena_busy");

  state.fighters.push({
    memberId: member.id,
    nickname: member.nickname,
    look: member.look,
    hp: FIGHT_MAX_HP,
    move: null,
    moveRound: 0,
    lastMove: null,
    lastDealt: 0,
    lastTaken: 0,
    seenAt: now,
  });
  state.updatedAt = now;

  if (state.fighters.length === 1) {
    state.phase = "waiting";
    state.round = 0;
    state.resolvedRound = 0;
    state.deadline = 0;
    state.over = null;
    pushLog(state, `${member.nickname} 走进八角笼，等着对手。`);
    return;
  }

  const [first, second] = state.fighters;
  state.phase = "fight";
  state.round = 1;
  state.resolvedRound = 0;
  state.deadline = now + FIGHT_ROUND_MS;
  state.over = null;
  first.seenAt = now;
  second.seenAt = now;
  pushLog(state, `裁判挥手：${first.nickname} 对阵 ${second.nickname}，开打！`);
}

export function leaveArena(state: FightState, memberId: string, now: number) {
  const index = state.fighters.findIndex((fighter) => fighter.memberId === memberId);
  if (index < 0) return;
  const leaver = state.fighters[index];

  if (state.phase === "fight") {
    const winner = state.fighters.find((fighter) => fighter.memberId !== memberId);
    if (winner) declareWalkover(state, winner, leaver, `${leaver.nickname} 认输离场，${winner.nickname} 获胜。`, now);
  }

  state.fighters.splice(index, 1);
  if (state.fighters.length === 0) {
    resetState(state, "八角笼空了，门还开着。", now);
    return;
  }
  if (state.phase === "waiting") pushLog(state, `${leaver.nickname} 离开了八角笼。`);
  state.updatedAt = now;
}

export function submitMove(
  state: FightState,
  memberId: string,
  move: string,
  now: number,
  settlements: FightSettlement[],
) {
  if (!MOVES.has(move as FightMove)) throw new FightError("invalid_move");
  if (state.phase !== "fight") throw new FightError("fight_inactive");
  const fighter = findFighter(state, memberId);
  if (!fighter) throw new FightError("not_in_arena");
  if (fighter.move && fighter.moveRound === state.round) throw new FightError("move_locked");

  fighter.move = move as FightMove;
  fighter.moveRound = state.round;
  fighter.seenAt = now;
  state.updatedAt = now;

  const ready = state.fighters.every((entry) => entry.move && entry.moveRound === state.round);
  if (ready) resolveRound(state, now, settlements);
}

export type FightFighterView = {
  id: string;
  nickname: string;
  look: Record<string, string> | null;
  hp: number;
  submitted: boolean;
  move: FightMove | null;
  lastMove: FightMove | null;
  dealt: number;
  taken: number;
};

export function publicFight(state: FightState, viewerId: string) {
  const me = findFighter(state, viewerId);
  const inFight = state.phase === "fight" && state.round > 0;
  const fighters: FightFighterView[] = state.fighters.map((fighter) => ({
    id: fighter.memberId,
    nickname: fighter.nickname,
    look: fighter.look,
    hp: fighter.hp,
    submitted: Boolean(inFight && fighter.move && fighter.moveRound === state.round),
    move: fighter.memberId === viewerId && inFight ? fighter.move : null,
    lastMove: fighter.lastMove,
    dealt: fighter.lastDealt,
    taken: fighter.lastTaken,
  }));
  return {
    phase: state.phase,
    round: state.round,
    resolvedRound: state.resolvedRound,
    deadline: state.deadline,
    fighters,
    logs: state.logs,
    over: state.over,
    updatedAt: state.updatedAt,
    serverNow: Date.now(),
    viewer: {
      inside: Boolean(me),
      seat: me ? state.fighters.indexOf(me) : null,
      submitted: Boolean(me && inFight && me.move && me.moveRound === state.round),
      move: me && inFight ? me.move : null,
      canMove: Boolean(me && inFight && !(me.move && me.moveRound === state.round)),
    },
  };
}

export type PublicFight = ReturnType<typeof publicFight>;
