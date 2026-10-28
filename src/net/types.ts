import type { CharacterLook, Dir, Phase } from "../game/types";

export type Role = "owner" | "member";

export type SelfMember = {
  id: string;
  nickname: string;
  role: Role;
  look: CharacterLook | null;
  pixel: string | null;
  intro: string;
  tags: string[];
  cosmetics: Record<string, string> | null;
  createdAt: string;
};

export type MemberSummary = {
  id: string;
  nickname: string;
  role: Role;
  look: CharacterLook | null;
  online: boolean;
  x: number;
  y: number;
  dir: Dir;
  lastSeen: string | null;
  createdAt: string;
  hearts?: number;
  isSelf?: boolean;
};

export type RecentMessage = { id: string; body: string; createdAt: string };

export type MemberDetail = {
  member: SelfMember;
  hearts: number;
  online: boolean;
  recentMessages: RecentMessage[];
};

export type WeatherKind = "clear" | "cloudy" | "rain" | "snow" | "storm" | "fog";

export type WeatherInfo = {
  kind: WeatherKind;
  temp: number | null;
  city: string;
  override?: boolean;
  available?: boolean;
  stale?: boolean;
};

export type PresencePayload = {
  serverTime: string;
  phase: Phase;
  day: string;
  weather: WeatherInfo;
  peers: MemberSummary[];
  onlineCount: number;
  memberCount: number;
};

export type PhotoAuthor = { id: string; nickname: string; look: CharacterLook | null };

export type PhotoItem = {
  id: string;
  caption: string;
  createdAt: string;
  author: PhotoAuthor;
  mine: boolean;
};

export type MessageItem = {
  id: string;
  body: string;
  createdAt: string;
  author: PhotoAuthor;
};

export type FishInfo = { id: string; name: string; rarity: string };

export type DexEntry = {
  fishId: string;
  count: number;
  firstAt?: string;
  lastAt?: string;
};

export type FishResult = {
  caught: boolean;
  fish: FishInfo | null;
  collection: { fishId: string; count: number }[];
};

export type RpsResult = {
  house: "rock" | "paper" | "scissors";
  result: "win" | "lose" | "draw";
  opponent?: { id: string; nickname: string };
};

export type CitySetting = { name: string; lat: number; lon: number };

export type PokerPhase = "waiting" | "preflop" | "flop" | "turn" | "river" | "showdown";

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

export type PokerWinner = { seat: number; nickname: string; amount: number; hand: string };

export type PokerTable = {
  phase: PokerPhase;
  handNo: number;
  dealer: number;
  turn: number;
  deadline: number;
  smallBlind: number;
  bigBlind: number;
  streetBet: number;
  pot: number;
  board: string[];
  seats: (PokerSeatView | null)[];
  logs: string[];
  result: { text: string; winners: PokerWinner[]; total: number } | null;
  updatedAt: number;
  serverNow: number;
  viewer: {
    seat: number | null;
    toCall: number;
    canCheck: boolean;
    minRaiseTo: number;
    maxRaiseTo: number;
    inHand: boolean;
    leaving: boolean;
    isTurn: boolean;
  };
};

export type FightMoveView = "jab" | "hook" | "block" | "dodge";

export type OnlineFightFighter = {
  id: string;
  nickname: string;
  look: CharacterLook | null;
  hp: number;
  submitted: boolean;
  move: FightMoveView | null;
  lastMove: FightMoveView | null;
  dealt: number;
  taken: number;
};

export type OnlineFightOutcome = {
  winnerId: string | null;
  winnerName: string | null;
  loserId: string | null;
  loserName: string | null;
  rounds: number;
  walkover: boolean;
  draw: boolean;
};

export type OnlineFightLog = { text: string; by: string | null };

export type OnlineFightView = {
  phase: "waiting" | "fight" | "over";
  round: number;
  resolvedRound: number;
  deadline: number;
  fighters: OnlineFightFighter[];
  logs: OnlineFightLog[];
  over: OnlineFightOutcome | null;
  updatedAt: number;
  serverNow: number;
  viewer: {
    inside: boolean;
    seat: number | null;
    submitted: boolean;
    move: FightMoveView | null;
    canMove: boolean;
  };
};

export type AdminOverview = {
  members: MemberSummary[];
  messageCount: number;
  photoCount: number;
  city: CitySetting;
  weatherOverride: WeatherKind | null;
  passcodeIsDefault: boolean;
  ownerKeyIsDefault: boolean;
};

export type JoinResult = { token: string; member: SelfMember };

export type ProfilePatch = {
  nickname?: string;
  intro?: string;
  tags?: string[];
  avatar?: { look: CharacterLook; pixel: string | null };
  cosmetics?: Record<string, string>;
};
