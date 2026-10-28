import {
  SESSION_TTL_MS,
  hashPasscode,
  randomToken,
  sha256Hex,
  verifyPasscode,
  type PasscodeRecord,
} from "./auth.ts";
import {
  applyAction,
  advance,
  createTable,
  joinTable,
  leaveTable,
  PokerError,
  publicTable,
  rebuy,
  startNextHand,
  type PokerState,
} from "./poker.ts";
import {
  advanceFight,
  createFightState,
  joinArena,
  leaveArena,
  FightError,
  publicFight,
  submitMove,
  touchFight,
  type FightSettlement,
  type FightState,
} from "./fight.ts";

const DEFAULT_PASSCODE = "217217";
const DEFAULT_OWNER_KEY = "0217";
const ROOM_BOUNDS = { minX: 0, maxX: 384, minY: 0, maxY: 256 };
const ONLINE_WINDOW_MS = 12_000;
const PHOTO_ORIG_MAX = 2 * 1024 * 1024;
const PHOTO_PIXEL_MAX = 160_000;
const PHOTO_WALL_LIMIT = 30;
const LOOK_KEYS = [
  "hair",
  "hairDark",
  "skin",
  "skinDark",
  "shirt",
  "shirtDark",
  "pants",
  "pantsDark",
  "shoes",
  "accent",
  "outline",
] as const;
const DEFAULT_CITY = { name: "上海", lat: 31.2304, lon: 121.4737 };
const WEATHER_KINDS = ["clear", "cloudy", "rain", "snow", "storm", "fog"] as const;
const FISH = [
  { id: "guppy", name: "小孔雀", rarity: "普通", weight: 30 },
  { id: "sardine", name: "沙丁鱼", rarity: "普通", weight: 24 },
  { id: "goldfish", name: "小金鱼", rarity: "常见", weight: 16 },
  { id: "catfish", name: "鲶鱼", rarity: "少见", weight: 12 },
  { id: "angelfish", name: "神仙鱼", rarity: "少见", weight: 8 },
  { id: "koi", name: "锦鲤", rarity: "稀有", weight: 5 },
  { id: "eel", name: "青鳗", rarity: "稀有", weight: 3 },
  { id: "star", name: "星斑鱼", rarity: "传说", weight: 2 },
] as const;

type Db = any;
type Storage = any;

class AppError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const limitBuckets = new Map<string, number[]>();

function allowedByLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  if (limitBuckets.size > 800) {
    for (const [bucketKey, stamps] of limitBuckets) {
      if (!stamps.some((stamp) => now - stamp < 120_000)) limitBuckets.delete(bucketKey);
    }
  }
  const recent = (limitBuckets.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= max) {
    limitBuckets.set(key, recent);
    return false;
  }
  recent.push(now);
  limitBuckets.set(key, recent);
  return true;
}

function shanghaiClock(now = new Date()): { day: string; hour: number; phase: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(read("hour"));
  const day = `${read("year")}-${read("month")}-${read("day")}`;
  const phase = hour >= 6 && hour < 10
    ? "morning"
    : hour >= 10 && hour < 17
      ? "day"
      : hour >= 17 && hour < 20
        ? "dusk"
        : "night";
  return { day, hour, phase };
}

function iso(value = Date.now()): string {
  return new Date(value).toISOString();
}

function text(value: unknown, max: number, label: string): string {
  if (typeof value !== "string") throw new AppError(`invalid_${label}`, 400);
  const trimmed = value.trim();
  const length = [...trimmed].length;
  if (length < 1 || length > max) throw new AppError(`invalid_${label}`, 400);
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) throw new AppError(`invalid_${label}`, 400);
  return trimmed;
}

function optionalText(value: unknown, max: number, label: string): string {
  if (value == null) return "";
  if (typeof value !== "string") throw new AppError(`invalid_${label}`, 400);
  const trimmed = value.trim();
  if ([...trimmed].length > max) throw new AppError(`invalid_${label}`, 400);
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) throw new AppError(`invalid_${label}`, 400);
  return trimmed;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}

function validHex(value: unknown): string | null {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : null;
}

function sanitizeLook(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const look: Record<string, string> = {};
  for (const key of LOOK_KEYS) {
    const color = validHex(source[key]);
    if (!color) return null;
    look[key] = color;
  }
  return look;
}

function sanitizeTags(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 3) throw new AppError("invalid_tags", 400);
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of value) {
    const tag = text(item, 8, "tags");
    if (!seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  }
  return tags;
}

function decodeBase64(raw: unknown, maxBytes: number): Uint8Array {
  if (typeof raw !== "string" || raw.length === 0) throw new AppError("invalid_photo", 400);
  const cleaned = raw.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) throw new AppError("invalid_photo", 400);
  let binary: string;
  try {
    binary = atob(cleaned);
  } catch {
    throw new AppError("invalid_photo", 400);
  }
  if (binary.length === 0 || binary.length > maxBytes) throw new AppError("photo_too_large", 413);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function imageKind(bytes: Uint8Array): "image/jpeg" | "image/png" | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

function weatherKind(code: unknown): string {
  const number = Number(code);
  if (!Number.isFinite(number)) return "clear";
  if (number === 0) return "clear";
  if ([1, 2, 3].includes(number)) return "cloudy";
  if ([45, 48].includes(number)) return "fog";
  if ((number >= 51 && number <= 67) || (number >= 80 && number <= 82)) return "rain";
  if ((number >= 71 && number <= 77) || (number >= 85 && number <= 86)) return "snow";
  if (number >= 95) return "storm";
  return "clear";
}

export function application({ db, storage }: { db: Db; storage: Storage }) {
  const rows = (result: any): any[] => {
    if (result?.error) {
      console.error("db_error", result.error.code ?? "", result.error.message ?? "", result.error.details ?? "");
      throw new AppError("database_unavailable", 503);
    }
    return Array.isArray(result?.data) ? result.data : [];
  };

  const json = (body: unknown, status = 200): Response =>
    Response.json(body, {
      status,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      },
    });

  async function readJson(request: Request, maxBytes = 16_384): Promise<any> {
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
      throw new AppError("invalid_input", 400);
    }
    const reader = request.body?.getReader();
    if (!reader) throw new AppError("invalid_input", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new AppError("payload_too_large", 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      throw new AppError("invalid_input", 400);
    }
  }

  async function readSetting(key: string): Promise<any | null> {
    const found = rows(await db.from("settings").select("key,value,updated_at").eq("key", key).limit(1));
    return found.length ? found[0].value : null;
  }

  async function writeSetting(key: string, value: any): Promise<void> {
    const stamp = iso();
    const updated = rows(
      await db.from("settings").update({ value, updated_at: stamp }).eq("key", key).select("key"),
    );
    if (updated.length) return;
    const inserted = rows(
      await db.from("settings")
        .insertIfAbsent({ key, value, updated_at: stamp }, { onConflict: "key" })
        .select("key"),
    );
    if (!inserted.length) {
      rows(await db.from("settings").update({ value, updated_at: stamp }).eq("key", key).select("key"));
    }
  }

  async function ensureHashedSetting(key: string, fallback: string): Promise<PasscodeRecord> {
    const existing = await readSetting(key);
    if (existing && typeof existing.hash === "string") return existing as PasscodeRecord;
    const record = await hashPasscode(fallback);
    const inserted = rows(
      await db.from("settings")
        .insertIfAbsent({ key, value: record, updated_at: iso() }, { onConflict: "key" })
        .select("key"),
    );
    if (inserted.length) return record;
    const again = await readSetting(key);
    if (!again || typeof again.hash !== "string") throw new AppError("settings_unavailable", 503);
    return again as PasscodeRecord;
  }

  async function ensurePasscodeSetting(): Promise<PasscodeRecord> {
    return await ensureHashedSetting("passcode", DEFAULT_PASSCODE);
  }

  async function ensureOwnerKeySetting(): Promise<PasscodeRecord> {
    return await ensureHashedSetting("owner_key", DEFAULT_OWNER_KEY);
  }

  async function requireMember(request: Request): Promise<{ member: any; session: any }> {
    const header = request.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AppError("login_required", 401);
    const digest = await sha256Hex(token);
    const sessions = rows(
      await db.from("sessions")
        .select("id,member_id,expires_at,last_used_at")
        .eq("token_hash", digest)
        .limit(1),
    );
    if (sessions.length !== 1) throw new AppError("login_required", 401);
    const session = sessions[0];
    const expiresAt = Date.parse(session.expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new AppError("login_required", 401);
    const members = rows(
      await db.from("members")
        .select("id,nickname,role,avatar,cosmetics,intro,tags,last_x,last_y,last_dir,last_seen,created_at")
        .eq("id", session.member_id)
        .limit(1),
    );
    if (members.length !== 1) throw new AppError("login_required", 401);
    if (!session.last_used_at || Date.now() - Date.parse(session.last_used_at) > 3_600_000) {
      try {
        await db.from("sessions")
          .update({ last_used_at: iso(), expires_at: iso(Date.now() + SESSION_TTL_MS) })
          .eq("id", session.id);
      } catch {
        // Session renewal is best-effort; the current request is already verified.
      }
    }
    return { member: members[0], session };
  }

  function requireOwner(member: any): void {
    if (member?.role !== "owner") throw new AppError("forbidden", 403);
  }

  function publicMember(row: any, options: { self?: boolean; full?: boolean } = {}): any {
    const avatar = row?.avatar && typeof row.avatar === "object" ? row.avatar : null;
    const look = sanitizeLook(avatar?.look);
    const pixel = options.self || options.full ? (typeof avatar?.pixel === "string" ? avatar.pixel : null) : null;
    return {
      id: row.id,
      nickname: row.nickname,
      role: row.role === "owner" ? "owner" : "member",
      look,
      pixel,
      intro: typeof row.intro === "string" ? row.intro : "",
      tags: Array.isArray(row.tags) ? row.tags : [],
      cosmetics: row.cosmetics && typeof row.cosmetics === "object" ? row.cosmetics : null,
      createdAt: row.created_at,
    };
  }

  function summaryMember(row: any, now = Date.now()): any {
    const seen = row.last_seen ? Date.parse(row.last_seen) : 0;
    const base = publicMember(row);
    return {
      id: base.id,
      nickname: base.nickname,
      role: base.role,
      look: base.look,
      online: Number.isFinite(seen) && now - seen < ONLINE_WINDOW_MS,
      x: Number.isFinite(row.last_x) ? row.last_x : 196,
      y: Number.isFinite(row.last_y) ? row.last_y : 228,
      dir: typeof row.last_dir === "string" ? row.last_dir : "down",
      lastSeen: row.last_seen ?? null,
      createdAt: base.createdAt,
    };
  }

  async function allMembers(limit = 100): Promise<any[]> {
    return rows(
      await db.from("members")
        .select("id,nickname,role,avatar,cosmetics,intro,tags,last_x,last_y,last_dir,last_seen,created_at")
        .order("created_at", { ascending: true })
        .limit(limit),
    );
  }

  async function heartCount(memberId: string, targetId: string): Promise<number> {
    const result = await db.from("affinity")
      .select("id", { count: "exact" })
      .eq("member_id", memberId)
      .eq("target_id", targetId)
      .limit(1);
    if (result?.error || !Number.isSafeInteger(result?.count) || result.count < 0) {
      if (result?.error) console.error("db_error", result.error.code ?? "");
      throw new AppError("database_unavailable", 503);
    }
    return result.count;
  }

  async function addAffinity(memberId: string, targetId: string): Promise<{ added: boolean; hearts: number }> {
    const { day } = shanghaiClock();
    const inserted = rows(
      await db.from("affinity")
        .insertIfAbsent(
          {
            id: crypto.randomUUID(),
            member_id: memberId,
            target_id: targetId,
            day,
            created_at: iso(),
          },
          { onConflict: "member_id,target_id,day" },
        )
        .select("id"),
    );
    const hearts = await heartCount(memberId, targetId);
    return { added: inserted.length > 0, hearts };
  }

  let weatherCache: { key: string; at: number; data: any } | null = null;

  function roomSettings(raw: any): { city: typeof DEFAULT_CITY; weatherOverride: string | null } {
    const city = raw?.city && Number.isFinite(raw.city.lat) && Number.isFinite(raw.city.lon)
      ? { name: typeof raw.city.name === "string" ? raw.city.name : DEFAULT_CITY.name, lat: raw.city.lat, lon: raw.city.lon }
      : DEFAULT_CITY;
    const override = typeof raw?.weatherOverride === "string" && (WEATHER_KINDS as readonly string[]).includes(raw.weatherOverride)
      ? raw.weatherOverride
      : null;
    return { city, weatherOverride: override };
  }

  async function weatherFor(): Promise<any> {
    const room = roomSettings(await readSetting("room"));
    if (room.weatherOverride) {
      return { kind: room.weatherOverride, temp: null, city: room.city.name, override: true, available: true };
    }
    const key = `${room.city.lat},${room.city.lon}`;
    if (weatherCache && weatherCache.key === key && Date.now() - weatherCache.at < 10 * 60_000) {
      return weatherCache.data;
    }
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${room.city.lat}&longitude=${room.city.lon}&current=temperature_2m,weather_code,is_day&timezone=Asia%2FShanghai`;
      const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!response.ok) throw new Error("weather upstream");
      const payload = await response.json();
      const current = payload?.current ?? {};
      const data = {
        kind: weatherKind(current.weather_code),
        temp: Number.isFinite(current.temperature_2m) ? Math.round(current.temperature_2m) : null,
        code: Number.isFinite(current.weather_code) ? current.weather_code : null,
        isDay: current.is_day === 1,
        city: room.city.name,
        override: false,
        available: true,
      };
      weatherCache = { key, at: Date.now(), data };
      return data;
    } catch {
      if (weatherCache?.key === key) return { ...weatherCache.data, stale: true };
      return { kind: "clear", temp: null, code: null, city: room.city.name, override: false, available: false };
    }
  }

  function personalPassword(value: unknown): string {
    if (typeof value !== "string") throw new AppError("invalid_password", 400);
    const length = [...value].length;
    if (length < 4 || length > 64) throw new AppError("invalid_password", 400);
    if (/[\u0000-\u001f\u007f]/.test(value)) throw new AppError("invalid_password", 400);
    return value;
  }

  async function findMemberByNickname(nickname: string): Promise<any | null> {
    const key = nickname.trim().toLowerCase();
    const list = rows(
      await db.from("members")
        .select("id,nickname,role,avatar,cosmetics,intro,tags,last_x,last_y,last_dir,last_seen,created_at,password")
        .order("created_at", { ascending: true })
        .limit(100),
    );
    return list.find((row) => row.nickname?.trim().toLowerCase() === key) ?? null;
  }

  async function issueSession(memberId: string): Promise<string> {
    const token = randomToken();
    rows(
      await db.from("sessions")
        .insert({
          id: crypto.randomUUID(),
          member_id: memberId,
          token_hash: await sha256Hex(token),
          expires_at: iso(Date.now() + SESSION_TTL_MS),
          last_used_at: iso(),
        })
        .select("id"),
    );
    return token;
  }

  async function join(request: Request): Promise<Response> {
    const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip") ?? "unknown";
    if (!allowedByLimit("join:global", 24, 60_000) || !allowedByLimit(`join:${ip}`, 8, 60_000)) {
      throw new AppError("rate_limited", 429);
    }
    const body = await readJson(request, 4096);
    const nickname = text(body?.nickname, 12, "nickname");
    if (typeof body?.passcode !== "string" || body.passcode.length < 1 || body.passcode.length > 64) {
      throw new AppError("invalid_passcode", 400);
    }
    const password = personalPassword(body?.password);
    const passcode = await ensurePasscodeSetting();
    if (!(await verifyPasscode(body.passcode, passcode))) {
      await new Promise((resolve) => setTimeout(resolve, 260));
      throw new AppError("invalid_passcode", 401);
    }
    const existing = await findMemberByNickname(nickname);
    if (existing) {
      const record = existing.password;
      if (record && typeof record === "object" && typeof record.hash === "string") {
        if (!(await verifyPasscode(password, record))) {
          await new Promise((resolve) => setTimeout(resolve, 260));
          throw new AppError("wrong_password", 401);
        }
      } else {
        // 个人密码上线前入住的老住户，第一次带密码回来时补绑定
        rows(
          await db.from("members")
            .update({ password: await hashPasscode(password) })
            .eq("id", existing.id)
            .select("id"),
        );
      }
      const token = await issueSession(existing.id);
      return json({ token, member: publicMember(existing, { self: true }) });
    }
    const id = crypto.randomUUID();
    rows(
      await db.from("members")
        .insert({
          id,
          nickname,
          role: "member",
          avatar: null,
          cosmetics: null,
          intro: "",
          tags: [],
          last_x: 196,
          last_y: 228,
          last_dir: "up",
          last_seen: null,
          password: await hashPasscode(password),
          created_at: iso(),
        })
        .select("id"),
    );
    const token = await issueSession(id);
    const member = {
      id,
      nickname,
      role: "member",
      avatar: null,
      cosmetics: null,
      intro: "",
      tags: [],
      last_x: 196,
      last_y: 228,
      last_dir: "up",
      last_seen: null,
      created_at: iso(),
    };
    return json({ token, member: publicMember(member, { self: true }) }, 201);
  }

  async function mePatch(request: Request, member: any): Promise<Response> {
    if (!allowedByLimit(`profile:${member.id}`, 20, 60_000)) throw new AppError("rate_limited", 429);
    const body = await readJson(request, 300_000);
    const update: Record<string, any> = {};
    if (body?.nickname != null) {
      const nickname = text(body.nickname, 12, "nickname");
      const others = await allMembers(100);
      if (others.some((row) => row.id !== member.id && row.nickname?.trim().toLowerCase() === nickname.toLowerCase())) {
        throw new AppError("nickname_taken", 409);
      }
      update.nickname = nickname;
    }
    if (body?.intro != null) update.intro = optionalText(body.intro, 120, "intro");
    if (body?.tags != null) update.tags = sanitizeTags(body.tags);
    if (body?.avatar != null) {
      const look = sanitizeLook(body.avatar?.look);
      if (!look) throw new AppError("invalid_avatar", 400);
      const pixel = body.avatar?.pixel;
      if (pixel != null) {
        if (typeof pixel !== "string" || !pixel.startsWith("data:image/png;base64,") || pixel.length > 180_000) {
          throw new AppError("invalid_avatar", 400);
        }
      }
      update.avatar = { look, pixel: typeof pixel === "string" ? pixel : null };
    }
    if (body?.cosmetics != null) {
      if (typeof body.cosmetics !== "object") throw new AppError("invalid_cosmetics", 400);
      const cosmetics: Record<string, string> = {};
      for (const key of ["hair", "shirt", "pants", "skin", "accent"]) {
        const color = validHex(body.cosmetics[key]);
        if (color) cosmetics[key] = color;
      }
      update.cosmetics = cosmetics;
    }
    if (!Object.keys(update).length) throw new AppError("invalid_input", 400);
    const updated = rows(
      await db.from("members")
        .update(update)
        .eq("id", member.id)
        .select("id,nickname,role,avatar,cosmetics,intro,tags,last_x,last_y,last_dir,last_seen,created_at"),
    );
    if (updated.length !== 1) throw new AppError("write_failed", 503);
    return json({ member: publicMember(updated[0], { self: true }) });
  }

  async function memberDetail(member: any, targetId: string): Promise<Response> {
    const found = rows(
      await db.from("members")
        .select("id,nickname,role,avatar,cosmetics,intro,tags,last_x,last_y,last_dir,last_seen,created_at")
        .eq("id", targetId)
        .limit(1),
    );
    if (found.length !== 1) throw new AppError("not_found", 404);
    const hearts = await heartCount(member.id, targetId);
    const recent = rows(
      await db.from("messages")
        .select("id,body,created_at")
        .eq("member_id", targetId)
        .order("created_at", { ascending: false })
        .limit(3),
    );
    return json({
      member: publicMember(found[0], { full: true }),
      hearts,
      online: summaryMember(found[0]).online,
      recentMessages: recent.map((row) => ({ id: row.id, body: row.body, createdAt: row.created_at })),
    });
  }

  async function presence(request: Request, member: any): Promise<Response> {
    const body = await readJson(request, 4096);
    const x = Number(body?.x);
    const y = Number(body?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new AppError("invalid_position", 400);
    const dir = ["down", "up", "left", "right"].includes(body?.dir) ? body.dir : "down";
    const now = Date.now();
    const updates: Record<string, any> = {
      last_x: Math.max(ROOM_BOUNDS.minX, Math.min(ROOM_BOUNDS.maxX, Math.round(x))),
      last_y: Math.max(ROOM_BOUNDS.minY, Math.min(ROOM_BOUNDS.maxY, Math.round(y))),
      last_dir: dir,
      last_seen: iso(now),
    };
    rows(await db.from("members").update(updates).eq("id", member.id).select("id"));
    const members = await allMembers(100);
    const weather = await weatherFor();
    const clock = shanghaiClock();
    const peers = members
      .filter((row) => row.id !== member.id)
      .map((row) => summaryMember(row, now));
    return json({
      serverTime: iso(now),
      phase: clock.phase,
      day: clock.day,
      weather,
      peers,
      onlineCount: peers.filter((peer) => peer.online).length + 1,
      memberCount: members.length,
    });
  }

  async function photosList(member: any): Promise<Response> {
    const list = rows(
      await db.from("photos")
        .select("id,member_id,caption,created_at")
        .order("created_at", { ascending: false })
        .limit(PHOTO_WALL_LIMIT),
    );
    const members = await allMembers(100);
    const byId = new Map(members.map((row) => [row.id, row]));
    return json(
      list.map((row) => {
        const author = byId.get(row.member_id);
        return {
          id: row.id,
          caption: typeof row.caption === "string" ? row.caption : "",
          createdAt: row.created_at,
          author: author
            ? { id: author.id, nickname: author.nickname, look: publicMember(author).look }
            : { id: row.member_id, nickname: "旧住户", look: null },
          mine: row.member_id === member.id,
        };
      }),
    );
  }

  async function photoCount(): Promise<number> {
    const result = await db.from("photos").select("id", { count: "exact" }).limit(1);
    if (result?.error || !Number.isSafeInteger(result?.count) || result.count < 0) {
      if (result?.error) console.error("db_error", result.error.code ?? "");
      throw new AppError("database_unavailable", 503);
    }
    return result.count;
  }

  async function photosCreate(request: Request, member: any): Promise<Response> {
    if (!allowedByLimit(`photo:${member.id}`, 6, 60_000)) throw new AppError("rate_limited", 429);
    if ((await photoCount()) >= PHOTO_WALL_LIMIT) throw new AppError("photo_limit_reached", 409);
    const body = await readJson(request, 3_400_000);
    const caption = optionalText(body?.caption, 80, "caption");
    const orig = decodeBase64(body?.orig, PHOTO_ORIG_MAX);
    const pixel = decodeBase64(body?.pixel, PHOTO_PIXEL_MAX);
    const origType = imageKind(orig);
    if (!origType) throw new AppError("invalid_photo", 400);
    if (imageKind(pixel) !== "image/png") throw new AppError("invalid_photo", 400);
    const id = crypto.randomUUID();
    const ext = origType === "image/png" ? "png" : "jpg";
    const origKey = `room/orig/${id}.${ext}`;
    const pixelKey = `room/pixel/${id}.png`;
    try {
      await storage.upload(origKey, orig, { contentType: origType, upsert: false });
      await storage.upload(pixelKey, pixel, { contentType: "image/png", upsert: false });
    } catch {
      throw new AppError("storage_unavailable", 503);
    }
    try {
      rows(
        await db.from("photos")
          .insert({
            id,
            member_id: member.id,
            orig_key: origKey,
            pixel_key: pixelKey,
            caption,
            created_at: iso(),
          })
          .select("id"),
      );
    } catch (error) {
      try {
        await storage.remove([origKey, pixelKey]);
      } catch {
        // Orphan cleanup is best-effort; the record was never committed.
      }
      throw error;
    }
    return json({ photo: { id, caption, createdAt: iso(), mine: true } }, 201);
  }

  async function photoUrl(member: any, photoId: string, request: Request): Promise<Response> {
    if (!isUuid(photoId)) throw new AppError("not_found", 404);
    const kind = new URL(request.url).searchParams.get("kind") === "orig" ? "orig" : "pixel";
    const found = rows(
      await db.from("photos").select("id,orig_key,pixel_key").eq("id", photoId).limit(1),
    );
    if (found.length !== 1) throw new AppError("not_found", 404);
    const key = kind === "orig" ? found[0].orig_key : found[0].pixel_key;
    try {
      const signed = await storage.createSignedUrl(key, 600);
      if (!signed?.signedUrl) throw new Error("no url");
      return json({ url: signed.signedUrl, expiresIn: 600 });
    } catch {
      throw new AppError("storage_unavailable", 503);
    }
  }

  async function messagesList(): Promise<Response> {
    const list = rows(
      await db.from("messages")
        .select("id,member_id,body,created_at")
        .order("created_at", { ascending: false })
        .limit(50),
    );
    const members = await allMembers(100);
    const byId = new Map(members.map((row) => [row.id, row]));
    return json(
      list.map((row) => {
        const author = byId.get(row.member_id);
        return {
          id: row.id,
          body: row.body,
          createdAt: row.created_at,
          author: author
            ? { id: author.id, nickname: author.nickname, look: publicMember(author).look }
            : { id: row.member_id, nickname: "旧住户", look: null },
        };
      }),
    );
  }

  async function messagesCreate(request: Request, member: any): Promise<Response> {
    if (!allowedByLimit(`message:${member.id}`, 6, 60_000)) throw new AppError("rate_limited", 429);
    const body = await readJson(request, 4096);
    const message = text(body?.body, 160, "message");
    const id = crypto.randomUUID();
    const createdAt = iso();
    rows(
      await db.from("messages")
        .insert({ id, member_id: member.id, body: message, created_at: createdAt })
        .select("id"),
    );
    return json(
      {
        message: {
          id,
          body: message,
          createdAt,
          author: { id: member.id, nickname: member.nickname, look: publicMember(member).look },
        },
      },
      201,
    );
  }

  async function fishCast(member: any): Promise<Response> {
    if (!allowedByLimit(`game:${member.id}`, 40, 60_000)) throw new AppError("rate_limited", 429);
    const roll = Math.random();
    let caught = roll < 0.72;
    let fish: (typeof FISH)[number] | null = null;
    if (caught) {
      const total = FISH.reduce((sum, item) => sum + item.weight, 0);
      let ticket = Math.random() * total;
      for (const item of FISH) {
        ticket -= item.weight;
        if (ticket <= 0) {
          fish = item;
          break;
        }
      }
      fish = fish ?? FISH[0];
    }
    const now = iso();
    if (fish) {
      const existing = rows(
        await db.from("fish_collection")
          .select("id,cnt")
          .eq("member_id", member.id)
          .eq("fish_id", fish.id)
          .limit(1),
      );
      if (existing.length) {
        rows(
          await db.from("fish_collection")
            .update({ cnt: Number(existing[0].cnt) + 1, last_at: now })
            .eq("id", existing[0].id)
            .select("id"),
        );
      } else {
        const inserted = rows(
          await db.from("fish_collection")
            .insertIfAbsent(
              {
                id: crypto.randomUUID(),
                member_id: member.id,
                fish_id: fish.id,
                cnt: 1,
                first_at: now,
                last_at: now,
              },
              { onConflict: "member_id,fish_id" },
            )
            .select("id"),
        );
        if (!inserted.length) {
          await db.from("fish_collection")
            .update({ cnt: 1, last_at: now })
            .eq("member_id", member.id)
            .eq("fish_id", fish.id);
        }
      }
    }
    rows(
      await db.from("game_records")
        .insert({
          id: crypto.randomUUID(),
          member_id: member.id,
          game: "fish",
          payload: { caught, fish: fish?.id ?? null },
          created_at: now,
        })
        .select("id"),
    );
    const dex = rows(
      await db.from("fish_collection").select("fish_id,cnt").eq("member_id", member.id).limit(50),
    );
    return json({
      caught,
      fish,
      collection: dex.map((row) => ({ fishId: row.fish_id, count: row.cnt })),
    });
  }

  async function rpsPlay(request: Request, member: any): Promise<Response> {
    if (!allowedByLimit(`game:${member.id}`, 40, 60_000)) throw new AppError("rate_limited", 429);
    const body = await readJson(request, 2048);
    const move = body?.move;
    if (!["rock", "paper", "scissors"].includes(move)) throw new AppError("invalid_move", 400);
    if (!isUuid(body?.targetId) || body.targetId === member.id) throw new AppError("invalid_target", 400);
    const target = rows(await db.from("members").select("id,nickname").eq("id", body.targetId).limit(1));
    if (target.length !== 1) throw new AppError("not_found", 404);
    const options = ["rock", "paper", "scissors"];
    const house = options[Math.floor(Math.random() * 3)];
    const wins: Record<string, string> = { rock: "scissors", paper: "rock", scissors: "paper" };
    const result = move === house ? "draw" : wins[move] === house ? "win" : "lose";
    rows(
      await db.from("game_records")
        .insert({
          id: crypto.randomUUID(),
          member_id: member.id,
          game: "rps",
          payload: { move, house, result, targetId: body.targetId },
          created_at: iso(),
        })
        .select("id"),
    );
    return json({ house, result, opponent: { id: target[0].id, nickname: target[0].nickname } });
  }

  async function fightRecord(request: Request, member: any): Promise<Response> {
    if (!allowedByLimit(`game:${member.id}`, 40, 60_000)) throw new AppError("rate_limited", 429);
    const body = await readJson(request, 2048);
    if (!isUuid(body?.targetId) || body.targetId === member.id) throw new AppError("invalid_target", 400);
    if (!["win", "lose"].includes(body?.result)) throw new AppError("invalid_result", 400);
    const rounds = Number(body?.rounds);
    if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds > 99) throw new AppError("invalid_rounds", 400);
    const target = rows(await db.from("members").select("id").eq("id", body.targetId).limit(1));
    if (target.length !== 1) throw new AppError("not_found", 404);
    rows(
      await db.from("game_records")
        .insert({
          id: crypto.randomUUID(),
          member_id: member.id,
          game: "fight",
          payload: { targetId: body.targetId, result: body.result, rounds },
          created_at: iso(),
        })
        .select("id"),
    );
    const hearts = await addAffinity(member.id, body.targetId);
    return json({ ok: true, ...hearts });
  }

  async function withPokerState<T>(mutate: (state: PokerState, now: number) => T): Promise<T> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const found = rows(await db.from("game_state").select("key,state,version").eq("key", "poker").limit(1));
      let state: PokerState;
      let version: number;
      if (!found.length) {
        state = createTable();
        const created = rows(
          await db.from("game_state")
            .insertIfAbsent(
              { key: "poker", state, version: 1, updated_at: iso() },
              { onConflict: "key" },
            )
            .select("key"),
        );
        if (!created.length) continue;
        version = 1;
      } else {
        const stored = found[0].state;
        state = stored && Array.isArray(stored.seats) ? (stored as PokerState) : createTable();
        version = Number(found[0].version);
        if (!Number.isSafeInteger(version) || version < 1) version = 1;
      }
      const before = JSON.stringify(state);
      const now = Date.now();
      advance(state, now);
      const outcome = mutate(state, now);
      if (JSON.stringify(state) === before) return outcome;
      const updated = rows(
        await db.from("game_state")
          .update({ state, version: version + 1, updated_at: iso(now) })
          .eq("key", "poker")
          .eq("version", version)
          .select("key"),
      );
      if (updated.length) return outcome;
    }
    throw new AppError("game_busy", 409);
  }

  async function pokerRun<T>(member: any, mutate: (state: PokerState, now: number) => T): Promise<Response> {
    try {
      const table = await withPokerState((state, now) => {
        const outcome = mutate(state, now);
        return outcome ?? publicTable(state, member.id);
      });
      return json({ table });
    } catch (error) {
      if (error instanceof PokerError) throw new AppError(error.code, 409);
      throw error;
    }
  }

  async function pokerState(member: any): Promise<Response> {
    if (!allowedByLimit(`poker:poll:${member.id}`, 240, 60_000)) throw new AppError("rate_limited", 429);
    return pokerRun(member, () => null);
  }

  async function pokerJoin(member: any): Promise<Response> {
    if (!allowedByLimit(`poker:join:${member.id}`, 30, 60_000)) throw new AppError("rate_limited", 429);
    return pokerRun(member, (state, now) => {
      joinTable(state, member.id, member.nickname, now);
      return null;
    });
  }

  async function pokerLeave(member: any): Promise<Response> {
    if (!allowedByLimit(`poker:join:${member.id}`, 30, 60_000)) throw new AppError("rate_limited", 429);
    return pokerRun(member, (state, now) => {
      leaveTable(state, member.id, now);
      return null;
    });
  }

  async function pokerStart(member: any): Promise<Response> {
    if (!allowedByLimit(`poker:action:${member.id}`, 120, 60_000)) throw new AppError("rate_limited", 429);
    return pokerRun(member, (state, now) => {
      startNextHand(state, member.id, now);
      return null;
    });
  }

  async function pokerAction(request: Request, member: any): Promise<Response> {
    if (!allowedByLimit(`poker:action:${member.id}`, 120, 60_000)) throw new AppError("rate_limited", 429);
    const body = await readJson(request, 1024);
    const action = body?.action;
    if (!["fold", "check", "call", "raise"].includes(action)) throw new AppError("invalid_action", 400);
    const amount = body?.amount == null ? undefined : Number(body.amount);
    return pokerRun(member, (state, now) => {
      applyAction(state, member.id, action, amount, now);
      return null;
    });
  }

  async function pokerRebuy(member: any): Promise<Response> {
    if (!allowedByLimit(`poker:action:${member.id}`, 120, 60_000)) throw new AppError("rate_limited", 429);
    return pokerRun(member, (state, now) => {
      rebuy(state, member.id, now);
      return null;
    });
  }

  async function settleFights(settlements: FightSettlement[]): Promise<void> {
    for (const entry of settlements) {
      try {
        const stamp = iso();
        rows(
          await db.from("game_records")
            .insert({
              id: crypto.randomUUID(),
              member_id: entry.winnerId,
              game: "fight_online",
              payload: { targetId: entry.loserId, result: "win", rounds: entry.rounds },
              created_at: stamp,
            })
            .select("id"),
        );
        rows(
          await db.from("game_records")
            .insert({
              id: crypto.randomUUID(),
              member_id: entry.loserId,
              game: "fight_online",
              payload: { targetId: entry.winnerId, result: "lose", rounds: entry.rounds },
              created_at: stamp,
            })
            .select("id"),
        );
        await addAffinity(entry.winnerId, entry.loserId);
        await addAffinity(entry.loserId, entry.winnerId);
      } catch (error) {
        console.error("fight_settle_failed", error instanceof Error ? error.message : "unknown");
      }
    }
  }

  async function withFightState<T>(
    viewerId: string,
    mutate: (state: FightState, now: number, settlements: FightSettlement[]) => T,
  ): Promise<T> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const found = rows(await db.from("game_state").select("key,state,version").eq("key", "fight").limit(1));
      let state: FightState;
      let version: number;
      if (!found.length) {
        state = createFightState();
        const created = rows(
          await db.from("game_state")
            .insertIfAbsent(
              { key: "fight", state, version: 1, updated_at: iso() },
              { onConflict: "key" },
            )
            .select("key"),
        );
        if (!created.length) continue;
        version = 1;
      } else {
        const stored = found[0].state;
        state = stored && Array.isArray(stored.fighters) ? (stored as FightState) : createFightState();
        version = Number(found[0].version);
        if (!Number.isSafeInteger(version) || version < 1) version = 1;
      }
      const before = JSON.stringify(state);
      const now = Date.now();
      touchFight(state, viewerId, now);
      const settlements: FightSettlement[] = [];
      advanceFight(state, now, settlements);
      const outcome = mutate(state, now, settlements);
      if (JSON.stringify(state) === before) return outcome;
      const updated = rows(
        await db.from("game_state")
          .update({ state, version: version + 1, updated_at: iso(now) })
          .eq("key", "fight")
          .eq("version", version)
          .select("key"),
      );
      if (updated.length) {
        await settleFights(settlements);
        return outcome;
      }
    }
    throw new AppError("game_busy", 409);
  }

  async function fightRun<T>(
    member: any,
    mutate: (state: FightState, now: number, settlements: FightSettlement[]) => T,
  ): Promise<Response> {
    try {
      const fight = await withFightState(member.id, (state, now, settlements) => {
        const outcome = mutate(state, now, settlements);
        return outcome ?? publicFight(state, member.id);
      });
      return json({ fight });
    } catch (error) {
      if (error instanceof FightError) throw new AppError(error.code, 409);
      throw error;
    }
  }

  async function fightOnlineState(member: any): Promise<Response> {
    if (!allowedByLimit(`fight:poll:${member.id}`, 240, 60_000)) throw new AppError("rate_limited", 429);
    return fightRun(member, () => null);
  }

  async function fightOnlineJoin(member: any): Promise<Response> {
    if (!allowedByLimit(`fight:join:${member.id}`, 30, 60_000)) throw new AppError("rate_limited", 429);
    return fightRun(member, (state, now) => {
      joinArena(state, { id: member.id, nickname: member.nickname, look: sanitizeLook(member.avatar?.look) }, now);
      return null;
    });
  }

  async function fightOnlineLeave(member: any): Promise<Response> {
    if (!allowedByLimit(`fight:join:${member.id}`, 30, 60_000)) throw new AppError("rate_limited", 429);
    return fightRun(member, (state, now) => {
      leaveArena(state, member.id, now);
      return null;
    });
  }

  async function fightOnlineMove(request: Request, member: any): Promise<Response> {
    if (!allowedByLimit(`fight:move:${member.id}`, 120, 60_000)) throw new AppError("rate_limited", 429);
    const body = await readJson(request, 512);
    const move = body?.move;
    return fightRun(member, (state, now, settlements) => {
      submitMove(state, member.id, move, now, settlements);
      return null;
    });
  }

  async function currentOwner(): Promise<any | null> {
    const list = rows(
      await db.from("members").select("id,nickname,role").eq("role", "owner").limit(1),
    );
    return list[0] ?? null;
  }

  async function claimOwner(request: Request, member: any): Promise<Response> {
    if (!allowedByLimit(`owner-claim:${member.id}`, 6, 10 * 60_000) || !allowedByLimit("owner-claim:global", 30, 10 * 60_000)) {
      throw new AppError("rate_limited", 429);
    }
    const body = await readJson(request, 1024);
    const key = typeof body?.key === "string" ? body.key.trim() : "";
    if (!/^\d{4}$/.test(key)) throw new AppError("invalid_owner_key", 400);
    const record = await ensureOwnerKeySetting();
    if (!(await verifyPasscode(key, record))) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      throw new AppError("invalid_owner_key", 401);
    }
    if (member.role === "owner") {
      return json({ member: publicMember(member, { self: true }) });
    }
    if (await currentOwner()) throw new AppError("owner_exists", 409);

    // owner_id 是上任的原子锁：先清掉没有站长身份的旧记录，再抢占。
    const claimSetting = rows(
      await db.from("settings").select("key,value").eq("key", "owner_id").limit(1),
    );
    if (claimSetting.length && claimSetting[0].value?.id !== member.id) {
      rows(await db.from("settings").delete().eq("key", "owner_id").select("key"));
    }
    const inserted = rows(
      await db.from("settings")
        .insertIfAbsent({ key: "owner_id", value: { id: member.id }, updated_at: iso() }, { onConflict: "key" })
        .select("key"),
    );
    if (!inserted.length) {
      const again = await readSetting("owner_id");
      if (again?.id !== member.id) throw new AppError("owner_exists", 409);
    }
    rows(await db.from("members").update({ role: "member" }).eq("role", "owner").select("id"));
    rows(await db.from("members").update({ role: "owner" }).eq("id", member.id).select("id"));
    const refreshed = rows(
      await db.from("members")
        .select("id,nickname,role,avatar,cosmetics,intro,tags,last_x,last_y,last_dir,last_seen,created_at")
        .eq("id", member.id)
        .limit(1),
    );
    return json({ member: publicMember(refreshed[0] ?? { ...member, role: "owner" }, { self: true }) });
  }

  async function abdicateOwner(member: any): Promise<Response> {
    requireOwner(member);
    rows(await db.from("members").update({ role: "member" }).eq("id", member.id).select("id"));
    rows(await db.from("members").update({ role: "member" }).eq("role", "owner").select("id"));
    rows(await db.from("settings").delete().eq("key", "owner_id").select("key"));
    const refreshed = rows(
      await db.from("members")
        .select("id,nickname,role,avatar,cosmetics,intro,tags,last_x,last_y,last_dir,last_seen,created_at")
        .eq("id", member.id)
        .limit(1),
    );
    return json({ member: publicMember(refreshed[0] ?? { ...member, role: "member" }, { self: true }) });
  }

  async function adminOverview(member: any): Promise<Response> {
    requireOwner(member);
    const members = await allMembers(100);
    const now = Date.now();
    const messages = rows(await db.from("messages").select("id").limit(1000));
    const photos = rows(await db.from("photos").select("id").limit(1000));
    const room = roomSettings(await readSetting("room"));
    const passcode = await ensurePasscodeSetting();
    const ownerKey = await ensureOwnerKeySetting();
    return json({
      members: members.map((row) => summaryMember(row, now)),
      messageCount: messages.length,
      photoCount: photos.length,
      city: room.city,
      weatherOverride: room.weatherOverride,
      passcodeIsDefault: await verifyPasscode(DEFAULT_PASSCODE, passcode),
      ownerKeyIsDefault: await verifyPasscode(DEFAULT_OWNER_KEY, ownerKey),
    });
  }

  async function adminSettings(request: Request, member: any): Promise<Response> {
    requireOwner(member);
    const body = await readJson(request, 8192);
    let changed = false;
    if (body?.city != null) {
      const city = body.city;
      if (
        typeof city.name !== "string" || city.name.length > 20 ||
        !Number.isFinite(city.lat) || city.lat < -90 || city.lat > 90 ||
        !Number.isFinite(city.lon) || city.lon < -180 || city.lon > 180
      ) {
        throw new AppError("invalid_city", 400);
      }
      const room = roomSettings(await readSetting("room"));
      await writeSetting("room", {
        city: { name: city.name.trim(), lat: city.lat, lon: city.lon },
        weatherOverride: room.weatherOverride,
      });
      weatherCache = null;
      changed = true;
    }
    if (body?.weatherOverride !== undefined) {
      if (body.weatherOverride !== null && !(WEATHER_KINDS as readonly string[]).includes(body.weatherOverride)) {
        throw new AppError("invalid_weather", 400);
      }
      const room = roomSettings(await readSetting("room"));
      await writeSetting("room", { city: room.city, weatherOverride: body.weatherOverride });
      weatherCache = null;
      changed = true;
    }
    if (body?.newPasscode != null) {
      const passcode = text(body.newPasscode, 32, "passcode");
      if ([...passcode].length < 4) throw new AppError("invalid_passcode", 400);
      const record = await hashPasscode(passcode);
      const updated = rows(
        await db.from("settings").update({ value: record, updated_at: iso() }).eq("key", "passcode").select("key"),
      );
      if (!updated.length) {
        await writeSetting("passcode", record);
      }
      changed = true;
    }
    if (body?.newOwnerKey != null) {
      const ownerKey = typeof body.newOwnerKey === "string" ? body.newOwnerKey.trim() : "";
      if (!/^\d{4}$/.test(ownerKey)) throw new AppError("invalid_owner_key", 400);
      await writeSetting("owner_key", await hashPasscode(ownerKey));
      changed = true;
    }
    if (!changed) throw new AppError("invalid_input", 400);
    return json({ ok: true });
  }

  async function adminDeleteMessage(member: any, id: string): Promise<Response> {
    requireOwner(member);
    if (!isUuid(id)) throw new AppError("not_found", 404);
    const deleted = rows(await db.from("messages").delete().eq("id", id).select("id"));
    if (!deleted.length) throw new AppError("not_found", 404);
    return json({ ok: true });
  }

  async function adminDeletePhoto(member: any, id: string): Promise<Response> {
    requireOwner(member);
    if (!isUuid(id)) throw new AppError("not_found", 404);
    const found = rows(await db.from("photos").select("id,orig_key,pixel_key").eq("id", id).limit(1));
    if (!found.length) throw new AppError("not_found", 404);
    const deleted = rows(await db.from("photos").delete().eq("id", id).select("id"));
    if (!deleted.length) throw new AppError("not_found", 404);
    try {
      await storage.remove([found[0].orig_key, found[0].pixel_key]);
    } catch {
      // The record is gone; storage cleanup is best-effort.
    }
    return json({ ok: true });
  }

  async function adminDeleteMember(member: any, id: string): Promise<Response> {
    requireOwner(member);
    if (!isUuid(id)) throw new AppError("not_found", 404);
    if (id === member.id) throw new AppError("cannot_remove_self", 400);
    const found = rows(await db.from("members").select("id,role").eq("id", id).limit(1));
    if (!found.length) throw new AppError("not_found", 404);
    if (found[0].role === "owner") throw new AppError("cannot_remove_owner", 400);
    rows(await db.from("sessions").delete().eq("member_id", id).select("id"));
    rows(await db.from("affinity").delete().eq("member_id", id).select("id"));
    rows(await db.from("affinity").delete().eq("target_id", id).select("id"));
    rows(await db.from("members").delete().eq("id", id).select("id"));
    return json({ ok: true });
  }

  async function route(ctx: any): Promise<Response> {
    const request: Request = ctx.request;
    const pathname = new URL(request.url).pathname;
    const match = pathname.match(/^\/(?:functions\/v1\/)?(?:app|app-d[0-9a-f]{32})(\/.*)?$/);
    if (!match) throw new AppError("not_found", 404);
    const path = match[1] || "/";
    const method = request.method;

    if (path === "/health" && method === "GET") {
      return json({ ok: true, service: "217-house", time: iso() });
    }
    if (path === "/session/join" && method === "POST") return await join(request);
    if (path === "/weather" && method === "GET") return json(await weatherFor());

    const auth = await requireMember(request);

    if (path === "/session/logout" && method === "POST") {
      rows(await db.from("sessions").delete().eq("id", auth.session.id).select("id"));
      return json({ ok: true });
    }
    if (path === "/me" && method === "GET") {
      return json({ member: publicMember(auth.member, { self: true }) });
    }
    if (path === "/me" && method === "PATCH") return await mePatch(request, auth.member);
    if (path === "/members" && method === "GET") {
      const members = await allMembers(100);
      const now = Date.now();
      const hearts = await Promise.all(
        members.map((row) => (row.id === auth.member.id ? 0 : heartCount(auth.member.id, row.id))),
      );
      return json({
        members: members.map((row, index) => ({
          ...summaryMember(row, now),
          hearts: hearts[index],
          isSelf: row.id === auth.member.id,
        })),
      });
    }
    const memberMatch = path.match(/^\/members\/([0-9a-f-]{36})$/);
    if (memberMatch && method === "GET") return await memberDetail(auth.member, memberMatch[1]);
    if (path === "/presence" && method === "POST") return await presence(request, auth.member);
    if (path === "/affinity/touch" && method === "POST") {
      if (!allowedByLimit(`affinity:${auth.member.id}`, 40, 60_000)) throw new AppError("rate_limited", 429);
      const body = await readJson(request, 2048);
      if (!isUuid(body?.targetId) || body.targetId === auth.member.id) throw new AppError("invalid_target", 400);
      const target = rows(await db.from("members").select("id").eq("id", body.targetId).limit(1));
      if (target.length !== 1) throw new AppError("not_found", 404);
      return json(await addAffinity(auth.member.id, body.targetId));
    }
    if (path === "/photos" && method === "GET") return await photosList(auth.member);
    if (path === "/photos" && method === "POST") return await photosCreate(request, auth.member);
    const photoMatch = path.match(/^\/photos\/([0-9a-f-]{36})\/url$/);
    if (photoMatch && method === "GET") return await photoUrl(auth.member, photoMatch[1], request);
    if (path === "/messages" && method === "GET") return await messagesList();
    if (path === "/messages" && method === "POST") return await messagesCreate(request, auth.member);
    if (path === "/games/rps" && method === "POST") return await rpsPlay(request, auth.member);
    if (path === "/games/fish" && method === "POST") return await fishCast(auth.member);
    if (path === "/games/fight" && method === "POST") return await fightRecord(request, auth.member);
    if (path === "/games/poker/state" && method === "GET") return await pokerState(auth.member);
    if (path === "/games/poker/join" && method === "POST") return await pokerJoin(auth.member);
    if (path === "/games/poker/leave" && method === "POST") return await pokerLeave(auth.member);
    if (path === "/games/poker/start" && method === "POST") return await pokerStart(auth.member);
    if (path === "/games/poker/action" && method === "POST") return await pokerAction(request, auth.member);
    if (path === "/games/poker/rebuy" && method === "POST") return await pokerRebuy(auth.member);
    if (path === "/games/fight/online/state" && method === "GET") return await fightOnlineState(auth.member);
    if (path === "/games/fight/online/join" && method === "POST") return await fightOnlineJoin(auth.member);
    if (path === "/games/fight/online/leave" && method === "POST") return await fightOnlineLeave(auth.member);
    if (path === "/games/fight/online/move" && method === "POST") return await fightOnlineMove(request, auth.member);
    if (path === "/fish/dex" && method === "GET") {
      const collection = rows(
        await db.from("fish_collection").select("fish_id,cnt,first_at,last_at").eq("member_id", auth.member.id).limit(50),
      );
      return json({
        fish: FISH.map((fish) => ({ id: fish.id, name: fish.name, rarity: fish.rarity })),
        collection: collection.map((row) => ({
          fishId: row.fish_id,
          count: row.cnt,
          firstAt: row.first_at,
          lastAt: row.last_at,
        })),
      });
    }
    if (path === "/admin/claim" && method === "POST") return await claimOwner(request, auth.member);
    if (path === "/admin/abdicate" && method === "POST") return await abdicateOwner(auth.member);
    if (path === "/admin/overview" && method === "GET") return await adminOverview(auth.member);
    if (path === "/admin/settings" && method === "PATCH") return await adminSettings(request, auth.member);
    const adminMessage = path.match(/^\/admin\/messages\/([0-9a-f-]{36})$/);
    if (adminMessage && method === "DELETE") return await adminDeleteMessage(auth.member, adminMessage[1]);
    const adminPhoto = path.match(/^\/admin\/photos\/([0-9a-f-]{36})$/);
    if (adminPhoto && method === "DELETE") return await adminDeletePhoto(auth.member, adminPhoto[1]);
    const adminMember = path.match(/^\/admin\/members\/([0-9a-f-]{36})$/);
    if (adminMember && method === "DELETE") return await adminDeleteMember(auth.member, adminMember[1]);

    throw new AppError("not_found", 404);
  }

  return async function handle(ctx: any): Promise<Response> {
    try {
      return await route(ctx);
    } catch (error) {
      if (error instanceof AppError) return json({ error: error.code }, error.status);
      return json({ error: "service_unavailable" }, 503);
    }
  };
}
