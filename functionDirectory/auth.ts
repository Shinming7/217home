const encoder = new TextEncoder();

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const PASSCODE_ITERATIONS = 210_000;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function derive(passcode: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey("raw", encoder.encode(passcode), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations, hash: "SHA-256" },
    material,
    256,
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

export type PasscodeRecord = { salt: string; hash: string; iterations: number };

export async function hashPasscode(passcode: string): Promise<PasscodeRecord> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const derived = await derive(passcode, salt, PASSCODE_ITERATIONS);
  return { salt: toBase64(salt), hash: toBase64(derived), iterations: PASSCODE_ITERATIONS };
}

export async function verifyPasscode(passcode: string, record: unknown): Promise<boolean> {
  const value = record as Partial<PasscodeRecord> | null;
  if (!value || typeof value.salt !== "string" || typeof value.hash !== "string") return false;
  const iterations = Number.isSafeInteger(value.iterations) ? (value.iterations as number) : PASSCODE_ITERATIONS;
  if (iterations < 10_000 || iterations > 1_000_000) return false;
  try {
    const derived = await derive(passcode, fromBase64(value.salt), iterations);
    return timingSafeEqual(toBase64(derived), value.hash);
  } catch {
    return false;
  }
}
