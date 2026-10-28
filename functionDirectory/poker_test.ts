import { advance, createTable, joinTable, leaveTable, type PokerState } from "./poker.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// 线上 2026-10-28 14:56 UTC 卡死的真实牌局：单挑，大盲丢丢没轮到就离桌，小盲奶宏超时后无人结算。
const STUCK_HAND: PokerState = {
  phase: "preflop",
  handNo: 1,
  dealer: 0,
  turn: 0,
  deadline: 1_793_199_391_379,
  smallBlind: 10,
  bigBlind: 20,
  streetBet: 20,
  minRaise: 20,
  pot: 0,
  board: [],
  deck: [],
  seats: [
    {
      memberId: "cddeb26e-6e9f-46dc-bbcb-c2e49bdff4a6",
      nickname: "奶宏",
      chips: 990,
      bet: 10,
      totalBet: 10,
      cards: ["9s", "8c"],
      folded: false,
      allIn: false,
      acted: false,
      inHand: true,
      leaveAfterHand: false,
      lastAction: "",
    },
    {
      memberId: "1edd6a4f-ccc3-48d3-8db0-0d0aba9b649c",
      nickname: "丢丢",
      chips: 980,
      bet: 20,
      totalBet: 20,
      cards: ["6h", "Qh"],
      folded: true,
      allIn: false,
      acted: true,
      inHand: true,
      leaveAfterHand: true,
      lastAction: "离开",
    },
    null,
    null,
    null,
    null,
    null,
    null,
  ],
  logs: ["第 1 手开始 · 盲注 10/20", "奶宏 小盲 10，丢丢 大盲 20", "丢丢 起身离开，这手牌弃掉"],
  result: null,
  updatedAt: 1_793_199_384_804,
};

Deno.test("advance 在只剩一名在手玩家时结算给他，而不是超时弃牌", () => {
  const state = structuredClone(STUCK_HAND);
  advance(state, Date.now());
  assert(state.phase === "showdown", `phase 应为 showdown，实际 ${state.phase}`);
  assert(state.seats[0]!.folded === false, "奶宏不应被超时弃牌");
  assert(state.seats[0]!.chips === 1020, `奶宏筹码应为 1020，实际 ${state.seats[0]!.chips}`);
  assert(state.result?.winners[0]?.nickname === "奶宏", "奶宏应赢下底池");
});

Deno.test("非本人回合离桌、只剩一人时立即结算", () => {
  const state = createTable();
  joinTable(state, "a", "奶宏", 1_000);
  joinTable(state, "b", "丢丢", 1_001);
  const opened: string = state.phase;
  assert(opened === "preflop" && state.turn === 0, "开局后应由 0 号位行动");
  leaveTable(state, "b", 1_002);
  const settled: string = state.phase;
  assert(settled === "showdown", `离桌后应直接摊牌结算，实际 ${state.phase}`);
  assert(state.seats[0]!.chips === 1020, `奶宏筹码应为 1020，实际 ${state.seats[0]!.chips}`);
  assert(state.seats[1]!.leaveAfterHand === true, "丢丢应在摊牌后离桌");
});

Deno.test("全员弃牌的历史状态退回下注而不是抛错", () => {
  const state = createTable();
  joinTable(state, "a", "奶宏", 1_000);
  joinTable(state, "b", "丢丢", 1_001);
  state.seats[0]!.folded = true;
  state.seats[1]!.folded = true;
  state.deadline = 0;
  advance(state, 2_000);
  assert(state.phase === "showdown", `phase 应为 showdown，实际 ${state.phase}`);
  assert(state.seats[0]!.chips === 1000, `奶宏筹码应退回 1000，实际 ${state.seats[0]!.chips}`);
  assert(state.seats[1]!.chips === 1000, `丢丢筹码应退回 1000，实际 ${state.seats[1]!.chips}`);
  assert(state.pot === 0, `底池应清空，实际 ${state.pot}`);
});
