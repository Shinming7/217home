import type { SelfMember } from "./types";

const KEY = "217-house-session-v2";
const NICKNAME_KEY = "217-house-nickname-v1";

export type StoredSession = { token: string; member: SelfMember };

export function loadStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed || typeof parsed.token !== "string" || !parsed.member || typeof parsed.member.id !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredSession(session: StoredSession) {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // 隐私模式下 localStorage 可能不可用，本次会话仍然可用
  }
}

export function updateStoredMember(member: SelfMember) {
  const current = loadStoredSession();
  if (current) saveStoredSession({ token: current.token, member });
}

export function clearStoredSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 忽略存储不可用
  }
}

export function loadStoredNickname(): string {
  try {
    return localStorage.getItem(NICKNAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveStoredNickname(nickname: string) {
  try {
    localStorage.setItem(NICKNAME_KEY, nickname);
  } catch {
    // 忽略存储不可用
  }
}
