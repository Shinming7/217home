import type { WalkFrame } from "./types";

export const SPRITE_WIDTH = 16;
export const SPRITE_HEIGHT = 24;

const HEAD_DOWN = [
  ".....oooooo.....",
  "....ohhhhhho....",
  "...ohhhhhhhho...",
  "...ohhhhhhhho...",
  "...ohhhhhhhho...",
  "...ohssssssho...",
  "...ohssssssho...",
  "...ohsessesh" + String.fromCharCode(111) + "...",
  "...ohssssssho...",
  "....osssssso....",
  ".....oooooo.....",
];

const HEAD_UP = [
  ".....oooooo.....",
  "....ohhhhhho....",
  "...ohhhhhhhho...",
  "...ohhhhhhhho...",
  "...ohhhhhhhho...",
  "...ohhhhhhhho...",
  "...ohhhhhhhho...",
  "...ohhhhhhhho...",
  "...ohhhhhhhho...",
  "....ohhhhhho....",
  ".....oooooo.....",
];

const HEAD_SIDE = [
  ".....oooooo.....",
  "....ohhhhhho....",
  "...ohhhhhhhho...",
  "...ohhhhhhhho...",
  "...ohhhhhhhho...",
  "...ohhhsssssso..",
  "...ohhhsssssso..",
  "...ohhhhssseo...",
  "...ohhhsssssso..",
  "....ohhhssso....",
  ".....oooooo.....",
];

const BODY = [
  "....occcccco....",
  "...occcccccco...",
  "...occcccccco...",
  "...osccccccso...",
  "...osccccccso...",
  "....occcccco....",
  "....oppppppo....",
];

const LEGS: Record<WalkFrame, string[]> = {
  idle: [
    "....oppppppo....",
    "....opp..ppo....",
    "....opp..ppo....",
    "...obbo.obbo....",
    "...oooo.oooo....",
  ],
  a: [
    "....oppppppo....",
    "....opp..ppo....",
    "....opp..ppo....",
    "...obbo..ppo....",
    "...oooo.........",
  ],
  b: [
    "....oppppppo....",
    "....opp..ppo....",
    "....opp..ppo....",
    "....opp..obbo...",
    ".........oooo...",
  ],
};

const HEADS = { down: HEAD_DOWN, up: HEAD_UP, right: HEAD_SIDE } as const;

export type SpriteDir = keyof typeof HEADS;

export function buildSpriteRows(dir: SpriteDir, frame: WalkFrame): string[] {
  const rows = ["................", ...HEADS[dir], ...BODY, ...LEGS[frame]];
  if (rows.length !== SPRITE_HEIGHT) {
    throw new Error(`sprite rows: expected ${SPRITE_HEIGHT}, got ${rows.length}`);
  }
  for (const row of rows) {
    if (row.length !== SPRITE_WIDTH) {
      throw new Error(`sprite row width: expected ${SPRITE_WIDTH}, got ${row.length} (${row})`);
    }
  }
  return rows;
}
