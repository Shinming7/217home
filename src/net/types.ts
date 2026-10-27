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

export type RpsResult = { house: "rock" | "paper" | "scissors"; result: "win" | "lose" | "draw" };

export type CitySetting = { name: string; lat: number; lon: number };

export type AdminOverview = {
  members: MemberSummary[];
  messageCount: number;
  photoCount: number;
  city: CitySetting;
  weatherOverride: WeatherKind | null;
  passcodeIsDefault: boolean;
};

export type JoinResult = { token: string; member: SelfMember };

export type ProfilePatch = {
  nickname?: string;
  intro?: string;
  tags?: string[];
  avatar?: { look: CharacterLook; pixel: string | null };
  cosmetics?: Record<string, string>;
};
