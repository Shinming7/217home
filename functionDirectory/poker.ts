export type PokerPhase = "waiting" | "preflop" | "flop" | "turn" | "river" | "showdown";

export type PokerSeat = {
  memberId: string;
  nickname: string;
  chips: number;
  bet: number;
  totalBet: number;
  cards: string[];
  folded: boolean;
  allIn: boolean;
  acted: boolean;
  inHand: boolean;
  leaveAfterHand: boolean;
  lastAction: string;
};

export type PokerWinner = { seat: number; nickname: string; amount: number; hand: string };

export type PokerState = {
  phase: PokerPhase;
  handNo: number;
  dealer: number;
  turn: number;
  deadline: number;
  smallBlind: number;
  bigBlind: number;
  streetBet: number;
  minRaise: number;
  pot: number;
  board: string[];
  deck: string[];
  seats: (PokerSeat | null)[];
  logs: string[];
  result: { text: string; winners: PokerWinner[]; total: number } | null;
  updatedAt: number;
};

export type PokerAction = "fold" | "check" | "call" | "raise";

export class PokerError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.name = "PokerError";
    this.code = code;
  }
}

export const TABLE_SEATS = 8;
export const START_CHIPS = 1000;
export const TURN_MS = 30_000;
export const SHOWDOWN_MS = 9_000;
const RANKS = "23456789TJQKA";
const SUITS = "shdc";
const LOG_LIMIT = 12;

const RANK_NAME: Record<number, string> = {
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

export function createTable(): PokerState {
  return {
    phase: "waiting",
    handNo: 0,
    dealer: -1,
    turn: -1,
    deadline: 0,
    smallBlind: 10,
    bigBlind: 20,
    streetBet: 0,
    minRaise: 20,
    pot: 0,
    board: [],
    deck: [],
    seats: Array.from({ length: TABLE_SEATS }, () => null),
    logs: ["客厅的德州扑克桌已经摆好，坐下就能开局。"],
    result: null,
    updatedAt: Date.now(),
  };
}

function pushLog(state: PokerState, text: string) {
  state.logs.push(text);
  if (state.logs.length > LOG_LIMIT) state.logs = state.logs.slice(-LOG_LIMIT);
}

function newDeck(): string[] {
  const deck: string[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push(`${rank}${suit}`);
  }
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    const j = buffer[0] % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function rankOf(card: string): number {
  return RANKS.indexOf(card[0]) + 2;
}

function suitOf(card: string): string {
  return card[1];
}

type Evaluated = { score: number[]; name: string };

function eval5(cards: string[]): Evaluated {
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const suits = cards.map(suitOf);
  const flush = suits.every((suit) => suit === suits[0]);
  const counts = new Map<number, number>();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const unique = [...counts.keys()].sort((a, b) => b - a);

  let straightHigh = 0;
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) straightHigh = unique[0];
    else if (unique[0] === 14 && unique[1] === 5) straightHigh = 5;
  }

  if (flush && straightHigh) {
    return { score: [8, straightHigh], name: straightHigh === 14 ? "皇家同花顺" : "同花顺" };
  }
  if (groups[0][1] === 4) {
    const kicker = groups.find((group) => group[1] === 1)?.[0] ?? 0;
    return { score: [7, groups[0][0], kicker], name: `四条 ${RANK_NAME[groups[0][0]]}` };
  }
  if (groups[0][1] === 3 && groups[1]?.[1] === 2) {
    return {
      score: [6, groups[0][0], groups[1][0]],
      name: `葫芦 ${RANK_NAME[groups[0][0]]}带${RANK_NAME[groups[1][0]]}`,
    };
  }
  if (flush) {
    return { score: [5, ...ranks], name: `同花 ${RANK_NAME[ranks[0]]}高` };
  }
  if (straightHigh) {
    return { score: [4, straightHigh], name: `顺子 ${RANK_NAME[straightHigh]}高` };
  }
  if (groups[0][1] === 3) {
    const kickers = groups.filter((group) => group[1] === 1).map((group) => group[0]).sort((a, b) => b - a);
    return { score: [3, groups[0][0], ...kickers], name: `三条 ${RANK_NAME[groups[0][0]]}` };
  }
  if (groups[0][1] === 2 && groups[1]?.[1] === 2) {
    const high = Math.max(groups[0][0], groups[1][0]);
    const low = Math.min(groups[0][0], groups[1][0]);
    const kicker = groups.find((group) => group[1] === 1)?.[0] ?? 0;
    return { score: [2, high, low, kicker], name: `两对 ${RANK_NAME[high]}和${RANK_NAME[low]}` };
  }
  if (groups[0][1] === 2) {
    const kickers = groups.filter((group) => group[1] === 1).map((group) => group[0]).sort((a, b) => b - a);
    return { score: [1, groups[0][0], ...kickers], name: `一对 ${RANK_NAME[groups[0][0]]}` };
  }
  return { score: [0, ...ranks], name: `高牌 ${RANK_NAME[ranks[0]]}` };
}

function compareScore(a: number[], b: number[]): number {
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    if (left !== right) return left > right ? 1 : -1;
  }
  return 0;
}

function combinations(cards: string[], pick: number): string[][] {
  const result: string[][] = [];
  const walk = (start: number, chosen: string[]) => {
    if (chosen.length === pick) {
      result.push([...chosen]);
      return;
    }
    for (let index = start; index < cards.length; index += 1) {
      chosen.push(cards[index]);
      walk(index + 1, chosen);
      chosen.pop();
    }
  };
  walk(0, []);
  return result;
}

export function bestHand(cards: string[]): Evaluated {
  let best: Evaluated = { score: [-1], name: "" };
  for (const combo of combinations(cards, 5)) {
    const evaluated = eval5(combo);
    if (compareScore(evaluated.score, best.score) > 0) best = evaluated;
  }
  return best;
}

function readySeatIndices(state: PokerState): number[] {
  const result: number[] = [];
  state.seats.forEach((seat, index) => {
    if (seat && seat.chips > 0) result.push(index);
  });
  return result;
}

function nextIndex(state: PokerState, from: number, predicate: (seat: PokerSeat, index: number) => boolean): number {
  for (let step = 1; step <= TABLE_SEATS; step += 1) {
    const index = (from + step + TABLE_SEATS) % TABLE_SEATS;
    const seat = state.seats[index];
    if (seat && predicate(seat, index)) return index;
  }
  return -1;
}

function nextActive(state: PokerState, from: number): number {
  return nextIndex(state, from, (seat) => seat.inHand && !seat.folded && !seat.allIn && seat.chips > 0);
}

function inHandSeats(state: PokerState): { seat: PokerSeat; index: number }[] {
  const result: { seat: PokerSeat; index: number }[] = [];
  state.seats.forEach((seat, index) => {
    if (seat && seat.inHand && !seat.folded) result.push({ seat, index });
  });
  return result;
}

function collectBets(state: PokerState) {
  for (const seat of state.seats) {
    if (!seat) continue;
    state.pot += seat.bet;
    seat.bet = 0;
  }
}

function totalPot(state: PokerState): number {
  return state.pot + state.seats.reduce((sum, seat) => sum + (seat?.bet ?? 0), 0);
}

function bettingComplete(state: PokerState): boolean {
  const contenders = inHandSeats(state);
  if (contenders.length <= 1) return true;
  const active = contenders.filter(({ seat }) => !seat.allIn && seat.chips > 0);
  if (active.length === 0) return true;
  if (active.length === 1) return active[0].seat.bet >= state.streetBet;
  return active.every(({ seat }) => seat.acted && seat.bet === state.streetBet);
}

function startHand(state: PokerState, now: number) {
  const ready = readySeatIndices(state);
  if (ready.length < 2) throw new PokerError("not_enough_players");

  state.handNo += 1;
  state.phase = "preflop";
  state.board = [];
  state.pot = 0;
  state.streetBet = 0;
  state.minRaise = state.bigBlind;
  state.deck = newDeck();
  state.result = null;
  state.updatedAt = now;

  for (const seat of state.seats) {
    if (!seat) continue;
    const playing = seat.chips > 0 && !seat.leaveAfterHand;
    seat.bet = 0;
    seat.totalBet = 0;
    seat.cards = [];
    seat.folded = !playing;
    seat.allIn = false;
    seat.acted = false;
    seat.inHand = playing;
    seat.lastAction = playing ? "" : "旁观";
  }

  const dealer = nextIndex(state, state.dealer, (seat) => seat.chips > 0 && seat.inHand);
  if (dealer < 0) throw new PokerError("not_enough_players");
  state.dealer = dealer;

  const headsUp = ready.length === 2;
  const smallBlindIndex = headsUp ? dealer : nextIndex(state, dealer, (seat) => seat.inHand);
  const bigBlindIndex = nextIndex(state, smallBlindIndex, (seat) => seat.inHand);
  const smallBlindSeat = state.seats[smallBlindIndex]!;
  const bigBlindSeat = state.seats[bigBlindIndex]!;

  const post = (seat: PokerSeat, amount: number) => {
    const paid = Math.min(amount, seat.chips);
    seat.chips -= paid;
    seat.bet += paid;
    seat.totalBet += paid;
    if (seat.chips === 0) seat.allIn = true;
    return paid;
  };

  const smallPaid = post(smallBlindSeat, state.smallBlind);
  const bigPaid = post(bigBlindSeat, state.bigBlind);
  state.streetBet = state.bigBlind;

  const order: number[] = [];
  let cursor = state.dealer;
  for (let step = 0; step < TABLE_SEATS; step += 1) {
    cursor = (cursor + 1) % TABLE_SEATS;
    if (state.seats[cursor]?.inHand) order.push(cursor);
  }
  for (let round = 0; round < 2; round += 1) {
    for (const index of order) state.seats[index]!.cards.push(state.deck.pop()!);
  }

  state.logs = state.logs.slice(-4);
  pushLog(state, `第 ${state.handNo} 手开始 · 盲注 ${state.smallBlind}/${state.bigBlind}`);
  pushLog(state, `${smallBlindSeat.nickname} 小盲 ${smallPaid}，${bigBlindSeat.nickname} 大盲 ${bigPaid}`);

  state.turn = headsUp ? smallBlindIndex : nextActive(state, bigBlindIndex);
  state.deadline = now + TURN_MS;

  if (bettingComplete(state)) {
    advanceStreet(state, now);
  }
}

function finishHand(state: PokerState, now: number) {
  collectBets(state);
  const finalPot = state.pot;
  const contenders = inHandSeats(state);
  const winners: PokerWinner[] = [];
  let text = "";

  if (!contenders.length) {
    for (const seat of state.seats) {
      if (!seat) continue;
      seat.chips += seat.totalBet;
      seat.totalBet = 0;
      seat.bet = 0;
    }
    state.phase = "showdown";
    state.turn = -1;
    state.deadline = now + SHOWDOWN_MS;
    state.streetBet = 0;
    state.pot = 0;
    state.result = { text: "本手作废，下注退回", winners: [], total: finalPot };
    state.updatedAt = now;
    pushLog(state, "本手作废，下注退回");
    return;
  }

  if (contenders.length === 1) {
    const winner = contenders[0];
    winner.seat.chips += state.pot;
    winners.push({ seat: winner.index, nickname: winner.seat.nickname, amount: state.pot, hand: "其他人都弃牌了" });
    text = `${winner.seat.nickname} 收下底池 ${finalPot}`;
  } else {
    const levels = [...new Set(contenders.map(({ seat }) => seat.totalBet))].sort((a, b) => a - b);
    const payouts = new Map<number, number>();
    let previous = 0;
    let lastLevel = 0;
    for (const level of levels) {
      let amount = 0;
      for (const seat of state.seats) {
        if (!seat) continue;
        amount += Math.min(seat.totalBet, level) - Math.min(seat.totalBet, previous);
      }
      previous = level;
      lastLevel = level;
      if (amount <= 0) continue;
      const eligible = contenders.filter(({ seat }) => seat.totalBet >= level);
      if (!eligible.length) continue;
      const ranked = eligible.map((entry) => ({ ...entry, hand: bestHand([...state.board, ...entry.seat.cards]) }));
      let bestScore = ranked[0].hand.score;
      for (const entry of ranked) {
        if (compareScore(entry.hand.score, bestScore) > 0) bestScore = entry.hand.score;
      }
      const roundWinners = ranked.filter((entry) => compareScore(entry.hand.score, bestScore) === 0);
      const share = Math.floor(amount / roundWinners.length);
      let remainder = amount - share * roundWinners.length;
      for (const entry of roundWinners) {
        const extra = remainder > 0 ? 1 : 0;
        if (remainder > 0) remainder -= 1;
        const gain = share + extra;
        payouts.set(entry.index, (payouts.get(entry.index) ?? 0) + gain);
        entry.seat.chips += gain;
        const existing = winners.find((winner) => winner.seat === entry.index);
        if (existing) existing.amount += gain;
        else winners.push({ seat: entry.index, nickname: entry.seat.nickname, amount: gain, hand: entry.hand.name });
      }
    }
    let dead = 0;
    for (const seat of state.seats) {
      if (!seat) continue;
      dead += Math.max(0, seat.totalBet - lastLevel);
    }
    if (dead > 0) {
      const top = contenders.reduce((best, entry) =>
        compareScore(bestHand([...state.board, ...entry.seat.cards]).score, bestHand([...state.board, ...best.seat.cards]).score) > 0
          ? entry
          : best,
      );
      top.seat.chips += dead;
      const existing = winners.find((winner) => winner.seat === top.index);
      if (existing) existing.amount += dead;
    }
    const shown = winners
      .map((winner) => `${winner.nickname} 用 ${winner.hand} 赢下 ${winner.amount}`)
      .join("；");
    text = shown || "这一手没有人赢";
    for (const entry of contenders) {
      pushLog(state, `${entry.seat.nickname} 亮牌 ${entry.seat.cards.join(" ")} · ${bestHand([...state.board, ...entry.seat.cards]).name}`);
    }
  }

  state.phase = "showdown";
  state.turn = -1;
  state.deadline = now + SHOWDOWN_MS;
  state.streetBet = 0;
  state.pot = 0;
  state.result = { text, winners, total: finalPot };
  state.updatedAt = now;
  pushLog(state, text);
}

function advanceStreet(state: PokerState, now: number) {
  collectBets(state);
  state.streetBet = 0;
  state.minRaise = state.bigBlind;
  for (const seat of state.seats) {
    if (!seat) continue;
    seat.acted = false;
    seat.lastAction = "";
  }
  if (inHandSeats(state).length <= 1) {
    finishHand(state, now);
    return;
  }

  if (state.phase === "preflop") {
    state.phase = "flop";
    state.deck.pop();
    state.board.push(state.deck.pop()!, state.deck.pop()!, state.deck.pop()!);
    pushLog(state, `翻牌 ${state.board.join(" ")}`);
  } else if (state.phase === "flop") {
    state.phase = "turn";
    state.deck.pop();
    state.board.push(state.deck.pop()!);
    pushLog(state, `转牌 ${state.board[state.board.length - 1]}`);
  } else if (state.phase === "turn") {
    state.phase = "river";
    state.deck.pop();
    state.board.push(state.deck.pop()!);
    pushLog(state, `河牌 ${state.board[state.board.length - 1]}`);
  } else if (state.phase === "river") {
    finishHand(state, now);
    return;
  }

  const active = inHandSeats(state).filter(({ seat }) => !seat.allIn && seat.chips > 0);
  if (active.length <= 1) {
    while (state.board.length < 5) {
      state.deck.pop();
      state.board.push(state.deck.pop()!);
    }
    finishHand(state, now);
    return;
  }

  state.turn = nextActive(state, state.dealer);
  state.deadline = now + TURN_MS;
  state.updatedAt = now;
}

function afterAction(state: PokerState, now: number) {
  if (inHandSeats(state).length <= 1) {
    finishHand(state, now);
    return;
  }
  if (bettingComplete(state)) {
    advanceStreet(state, now);
    return;
  }
  state.turn = nextActive(state, state.turn);
  state.deadline = now + TURN_MS;
  state.updatedAt = now;
}

export function joinTable(state: PokerState, memberId: string, nickname: string, now: number) {
  if (state.seats.some((seat) => seat?.memberId === memberId)) return;
  const free = state.seats.findIndex((seat) => seat === null);
  if (free < 0) throw new PokerError("table_full");
  state.seats[free] = {
    memberId,
    nickname,
    chips: START_CHIPS,
    bet: 0,
    totalBet: 0,
    cards: [],
    folded: false,
    allIn: false,
    acted: false,
    inHand: false,
    leaveAfterHand: false,
    lastAction: "刚坐下",
  };
  state.updatedAt = now;
  pushLog(state, `${nickname} 在 ${free + 1} 号位坐下`);
  if (state.phase === "waiting" && readySeatIndices(state).length >= 2) startHand(state, now);
}

export function leaveTable(state: PokerState, memberId: string, now: number) {
  const index = state.seats.findIndex((seat) => seat?.memberId === memberId);
  if (index < 0) throw new PokerError("not_seated");
  const seat = state.seats[index]!;
  const activeHand = state.phase === "preflop" || state.phase === "flop" || state.phase === "turn" || state.phase === "river";
  if (activeHand && seat.inHand) {
    const wasTurn = state.turn === index;
    seat.folded = true;
    seat.acted = true;
    seat.leaveAfterHand = true;
    seat.lastAction = "离开";
    pushLog(state, `${seat.nickname} 起身离开，这手牌弃掉`);
    if (wasTurn) afterAction(state, now);
    else if (inHandSeats(state).length <= 1) finishHand(state, now);
  } else {
    state.seats[index] = null;
    pushLog(state, `${seat.nickname} 离开了牌桌`);
    if (state.phase === "waiting" && readySeatIndices(state).length < 2) {
      state.deadline = 0;
    }
    if (state.seats.every((candidate) => candidate === null)) {
      const fresh = createTable();
      Object.assign(state, fresh);
    }
  }
  state.updatedAt = now;
}

export function rebuy(state: PokerState, memberId: string, now: number) {
  const seat = state.seats.find((candidate) => candidate?.memberId === memberId);
  if (!seat) throw new PokerError("not_seated");
  if (seat.chips > 0) throw new PokerError("still_has_chips");
  if (seat.inHand) throw new PokerError("hand_in_progress");
  seat.chips = START_CHIPS;
  seat.lastAction = "重新买入";
  seat.folded = false;
  pushLog(state, `${seat.nickname} 重新买入 ${START_CHIPS} 筹码`);
  state.updatedAt = now;
  if (state.phase === "waiting" && readySeatIndices(state).length >= 2) startHand(state, now);
}

export function startNextHand(state: PokerState, memberId: string, now: number) {
  const seat = state.seats.find((candidate) => candidate?.memberId === memberId);
  if (!seat) throw new PokerError("not_seated");
  if (state.phase !== "waiting") throw new PokerError("hand_in_progress");
  if (readySeatIndices(state).length < 2) throw new PokerError("not_enough_players");
  startHand(state, now);
}

export function applyAction(
  state: PokerState,
  memberId: string,
  action: PokerAction,
  amount: number | undefined,
  now: number,
) {
  const index = state.seats.findIndex((seat) => seat?.memberId === memberId);
  if (index < 0) throw new PokerError("not_seated");
  if (state.phase !== "preflop" && state.phase !== "flop" && state.phase !== "turn" && state.phase !== "river") {
    throw new PokerError("hand_inactive");
  }
  const seat = state.seats[index]!;
  if (!seat.inHand || seat.folded) throw new PokerError("not_in_hand");
  if (state.turn !== index) throw new PokerError("not_your_turn");
  const toCall = Math.max(0, state.streetBet - seat.bet);

  if (action === "fold") {
    seat.folded = true;
    seat.acted = true;
    seat.lastAction = "弃牌";
    pushLog(state, `${seat.nickname} 弃牌`);
  } else if (action === "check") {
    if (toCall > 0) throw new PokerError("cannot_check");
    seat.acted = true;
    seat.lastAction = "过牌";
  } else if (action === "call") {
    const paid = Math.min(toCall, seat.chips);
    seat.chips -= paid;
    seat.bet += paid;
    seat.totalBet += paid;
    if (seat.chips === 0) seat.allIn = true;
    seat.acted = true;
    seat.lastAction = paid === 0 ? "过牌" : `跟注 ${paid}`;
    pushLog(state, `${seat.nickname} ${seat.lastAction}`);
  } else if (action === "raise") {
    const target = Math.floor(Number(amount));
    if (!Number.isSafeInteger(target)) throw new PokerError("invalid_amount");
    const maxTo = seat.bet + seat.chips;
    const minTo = state.streetBet === 0 ? state.bigBlind : state.streetBet + state.minRaise;
    if (target <= state.streetBet) throw new PokerError("invalid_amount");
    if (target > maxTo) throw new PokerError("not_enough_chips");
    if (target < minTo && target !== maxTo) throw new PokerError("raise_too_small");
    const add = target - seat.bet;
    seat.chips -= add;
    seat.bet = target;
    seat.totalBet += add;
    if (seat.chips === 0) seat.allIn = true;
    seat.acted = true;
    const raiseSize = target - state.streetBet;
    state.minRaise = Math.max(state.minRaise, raiseSize);
    state.streetBet = target;
    for (const other of state.seats) {
      if (!other || other.memberId === memberId) continue;
      if (other.inHand && !other.folded && !other.allIn) other.acted = false;
    }
    seat.lastAction = `加注到 ${target}`;
    pushLog(state, `${seat.nickname} 加注到 ${target}`);
  } else {
    throw new PokerError("invalid_action");
  }

  afterAction(state, now);
}

export function advance(state: PokerState, now: number) {
  if (state.phase === "preflop" || state.phase === "flop" || state.phase === "turn" || state.phase === "river") {
    if (state.turn < 0) return;
    if (now < state.deadline) return;
    const seat = state.seats[state.turn];
    if (!seat || seat.folded || !seat.inHand) {
      if (inHandSeats(state).length === 0) {
        finishHand(state, now);
        return;
      }
      state.turn = nextActive(state, state.turn);
      state.deadline = now + TURN_MS;
      return;
    }
    if (inHandSeats(state).length <= 1) {
      finishHand(state, now);
      return;
    }
    const toCall = Math.max(0, state.streetBet - seat.bet);
    if (toCall > 0) {
      seat.folded = true;
      seat.acted = true;
      seat.lastAction = "超时弃牌";
      pushLog(state, `${seat.nickname} 超时，自动弃牌`);
    } else {
      seat.acted = true;
      seat.lastAction = "超时过牌";
      pushLog(state, `${seat.nickname} 超时，自动过牌`);
    }
    afterAction(state, now);
    return;
  }
  if (state.phase === "showdown" && now >= state.deadline) {
    for (const seat of state.seats) {
      if (seat && seat.leaveAfterHand) {
        const index = state.seats.findIndex((candidate) => candidate === seat);
        if (index >= 0) state.seats[index] = null;
        pushLog(state, `${seat.nickname} 离开了牌桌`);
      }
    }
    state.result = null;
    if (readySeatIndices(state).length >= 2) startHand(state, now);
    else {
      state.phase = "waiting";
      state.turn = -1;
      state.deadline = 0;
      state.updatedAt = now;
    }
  }
}

export type PokerSeatView = {
  seat: number;
  id: string;
  nickname: string;
  chips: number;
  bet: number;
  folded: boolean;
  allIn: boolean;
  inHand: boolean;
  acted: boolean;
  leaving: boolean;
  lastAction: string;
  cards: string[];
};

export function publicTable(state: PokerState, viewerId: string) {
  const showdown = state.phase === "showdown";
  const seats: (PokerSeatView | null)[] = state.seats.map((seat, index) => {
    if (!seat) return null;
    const reveal = seat.memberId === viewerId || (showdown && seat.inHand && !seat.folded);
    return {
      seat: index,
      id: seat.memberId,
      nickname: seat.nickname,
      chips: seat.chips,
      bet: seat.bet,
      folded: seat.folded,
      allIn: seat.allIn,
      inHand: seat.inHand,
      acted: seat.acted,
      leaving: seat.leaveAfterHand,
      lastAction: seat.lastAction,
      cards: seat.inHand ? (reveal ? seat.cards : ["??", "??"]) : [],
    };
  });
  const mine = state.seats.findIndex((seat) => seat?.memberId === viewerId);
  const mySeat = mine >= 0 ? state.seats[mine]! : null;
  const street = state.phase === "preflop" || state.phase === "flop" || state.phase === "turn" || state.phase === "river";
  const toCall = mySeat && street ? Math.max(0, state.streetBet - mySeat.bet) : 0;
  return {
    phase: state.phase,
    handNo: state.handNo,
    dealer: state.dealer,
    turn: state.turn,
    deadline: state.deadline,
    smallBlind: state.smallBlind,
    bigBlind: state.bigBlind,
    streetBet: state.streetBet,
    pot: totalPot(state),
    board: state.board,
    seats,
    logs: state.logs,
    result: state.result,
    updatedAt: state.updatedAt,
    serverNow: Date.now(),
    viewer: {
      seat: mine < 0 ? null : mine,
      toCall,
      canCheck: Boolean(mySeat && street && state.turn === mine && toCall === 0),
      minRaiseTo: state.streetBet === 0 ? state.bigBlind : state.streetBet + state.minRaise,
      maxRaiseTo: mySeat ? mySeat.bet + mySeat.chips : 0,
      inHand: Boolean(mySeat?.inHand && !mySeat.folded),
      leaving: Boolean(mySeat?.leaveAfterHand),
      isTurn: Boolean(mySeat && street && state.turn === mine),
    },
  };
}

export type PublicTable = ReturnType<typeof publicTable>;
