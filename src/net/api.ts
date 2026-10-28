import type {
  AdminOverview,
  DexEntry,
  FishInfo,
  FishResult,
  JoinResult,
  MemberDetail,
  MemberSummary,
  MessageItem,
  PhotoItem,
  PokerTable,
  OnlineFightView,
  PresencePayload,
  ProfilePatch,
  RpsResult,
  SelfMember,
  WeatherInfo,
  WeatherKind,
  CitySetting,
} from "./types";
import type { Dir } from "../game/types";

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body != null) headers.set("content-type", "application/json");
  if (authToken) headers.set("authorization", `Bearer ${authToken}`);
  let response: Response;
  try {
    response = await fetch(`/functions/v1/app${path}`, { ...init, headers });
  } catch {
    throw new ApiError("network_unavailable", 0);
  }
  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new ApiError(typeof payload?.error === "string" ? payload.error : `http_${response.status}`, response.status);
  }
  return payload as T;
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
const patch = (body: unknown): RequestInit => ({ method: "PATCH", body: JSON.stringify(body) });

export const api = {
  join: (nickname: string, passcode: string, password: string) =>
    request<JoinResult>("/session/join", post({ nickname, passcode, password })),
  logout: () => request<{ ok: true }>("/session/logout", { method: "POST" }),
  me: () => request<{ member: SelfMember }>("/me"),
  updateMe: (patchBody: ProfilePatch) => request<{ member: SelfMember }>("/me", patch(patchBody)),
  members: () => request<{ members: MemberSummary[] }>("/members"),
  memberDetail: (id: string) => request<MemberDetail>(`/members/${id}`),
  presence: (x: number, y: number, dir: Dir) =>
    request<PresencePayload>("/presence", post({ x, y, dir })),
  touchAffinity: (targetId: string) =>
    request<{ added: boolean; hearts: number }>("/affinity/touch", post({ targetId })),
  messages: () => request<MessageItem[]>("/messages"),
  postMessage: (body: string) => request<{ message: MessageItem }>("/messages", post({ body })),
  photos: () => request<PhotoItem[]>("/photos"),
  photoUrl: (id: string, kind: "pixel" | "orig") =>
    request<{ url: string; expiresIn: number }>(`/photos/${id}/url?kind=${kind}`),
  uploadPhoto: (payload: { orig: string; pixel: string; caption: string }) =>
    request<{ photo: { id: string } }>("/photos", post(payload)),
  rps: (move: "rock" | "paper" | "scissors", targetId: string) =>
    request<RpsResult>("/games/rps", post({ move, targetId })),
  fish: () => request<FishResult>("/games/fish", { method: "POST" }),
  dex: () => request<{ fish: FishInfo[]; collection: DexEntry[] }>("/fish/dex"),
  fight: (targetId: string, result: "win" | "lose", rounds: number) =>
    request<{ ok: true; added: boolean; hearts: number }>("/games/fight", post({ targetId, result, rounds })),
  pokerState: () => request<{ table: PokerTable }>("/games/poker/state"),
  pokerJoin: () => request<{ table: PokerTable }>("/games/poker/join", { method: "POST" }),
  pokerLeave: () => request<{ table: PokerTable }>("/games/poker/leave", { method: "POST" }),
  pokerStart: () => request<{ table: PokerTable }>("/games/poker/start", { method: "POST" }),
  pokerAction: (action: "fold" | "check" | "call" | "raise", amount?: number) =>
    request<{ table: PokerTable }>("/games/poker/action", post({ action, amount })),
  pokerRebuy: () => request<{ table: PokerTable }>("/games/poker/rebuy", { method: "POST" }),
  fightOnlineState: () => request<{ fight: OnlineFightView }>("/games/fight/online/state"),
  fightOnlineJoin: () => request<{ fight: OnlineFightView }>("/games/fight/online/join", { method: "POST" }),
  fightOnlineLeave: () => request<{ fight: OnlineFightView }>("/games/fight/online/leave", { method: "POST" }),
  fightOnlineMove: (move: "jab" | "hook" | "block" | "dodge") =>
    request<{ fight: OnlineFightView }>("/games/fight/online/move", post({ move })),
  weather: () => request<WeatherInfo>("/weather"),
  adminOverview: () => request<AdminOverview>("/admin/overview"),
  claimOwner: (key: string) => request<{ member: SelfMember }>("/admin/claim", post({ key })),
  abdicateOwner: () => request<{ member: SelfMember }>("/admin/abdicate", { method: "POST" }),
  adminSettings: (body: {
    city?: CitySetting;
    weatherOverride?: WeatherKind | null;
    newPasscode?: string;
    newOwnerKey?: string;
  }) => request<{ ok: true }>("/admin/settings", patch(body)),
  adminDeleteMessage: (id: string) =>
    request<{ ok: true }>(`/admin/messages/${id}`, { method: "DELETE" }),
  adminDeletePhoto: (id: string) => request<{ ok: true }>(`/admin/photos/${id}`, { method: "DELETE" }),
  adminDeleteMember: (id: string) => request<{ ok: true }>(`/admin/members/${id}`, { method: "DELETE" }),
};

export const ERROR_TEXT: Record<string, string> = {
  invalid_passcode: "暗号不对，再想想？",
  invalid_password: "个人密码需要 4～64 个字符",
  wrong_password: "这个名字的个人密码不对，再想想？",
  nickname_taken: "这个名字已经被屋里的人用了",
  rate_limited: "操作太频繁了，歇一会儿再来",
  invalid_nickname: "昵称需要 1～12 个字",
  invalid_intro: "介绍最多 120 个字",
  invalid_tags: "标签最多 3 个，每个不超过 8 个字",
  invalid_avatar: "立绘数据不完整，请重新生成",
  invalid_photo: "图片格式不支持，请换一张 JPG 或 PNG",
  photo_too_large: "照片压缩后还是超过 2MB，请换一张",
  photo_limit_reached: "照片墙最多挂 30 张，先取下一张吧",
  payload_too_large: "照片太大，请压缩后再试",
  storage_unavailable: "储藏室（对象存储）暂时打不开，稍后再试",
  database_unavailable: "屋里的记录本暂时翻不开，稍后再试",
  network_unavailable: "连不上小屋，检查一下网络？",
  login_required: "登录已失效，请重新输入暗号",
  forbidden: "只有站长能做这件事",
  invalid_move: "这一手不算，换一个",
  invalid_target: "找不到这位对手",
  not_enough_players: "至少两位住户坐下才能开局",
  table_full: "牌桌坐满 8 位了，先等一等",
  not_seated: "先在牌桌坐下才能出牌",
  still_has_chips: "筹码还没输光，不用重新买入",
  hand_in_progress: "这一手还没结束，稍等片刻",
  hand_inactive: "这手牌还没开始",
  not_in_hand: "你不在这一手牌里",
  not_your_turn: "还没轮到你行动",
  cannot_check: "前面有人下注，只能跟、加或弃牌",
  invalid_amount: "这个加注金额不算数",
  not_enough_chips: "筹码不够这么多",
  raise_too_small: "加注太少，至少要够最小加注",
  invalid_action: "这一步不算，换一个",
  game_busy: "牌桌正忙，再点一次试试",
  arena_busy: "八角笼正在使用中，稍等一会儿",
  not_in_arena: "先走进八角笼才能出招",
  move_locked: "这一回合已经出过招了",
  fight_inactive: "现在还不能出招",
  cannot_remove_self: "不能把自己移出房间",
  cannot_remove_owner: "不能移出站长",
  owner_exists: "屋里已经有站长了，等现任站长退位后再来",
  invalid_owner_key: "站长密匙不对，需要 4 位数字",
  limiter_busy: "手速太快，稍等片刻",
  service_unavailable: "小屋服务暂时打盹了",
};

export function errorText(error: unknown): string {
  if (error instanceof ApiError) return ERROR_TEXT[error.code] ?? `出了点小状况（${error.code}）`;
  if (error instanceof Error && error.message) return error.message;
  return "出了点小状况，再试一次？";
}
