import type { WalkFrame } from "./types";

export const SPRITE_WIDTH = 16;
export const SPRITE_HEIGHT = 24;

// 图层字符：o 描边 / h 头发 / H 发丝高光 / a 装饰色 / s 皮肤 / S 皮肤阴影
// r 腮红 / e 眼睛 / w 眼白 / m 嘴 / c 上衣 / C 上衣阴影 / p 裤子 / P 裤子阴影 / b 鞋
const HEAD_DOWN = [
  "....oooooooo....",
  "...ohhhhhhhho...",
  "...ohhHHaaHho...",
  "...ohHhhhhHho...",
  "...ohhhhhhhho...",
  "...ohssssssho...",
  "...ohssssssho...",
  "...ohsessesho...",
  "...ohrsmmsrho...",
  "....osSSSSso....",
  ".....oooooo.....",
];

const HEAD_UP = [
  "....oooooooo....",
  "...ohhhhhhhho...",
  "...ohhHHaaHho...",
  "...ohHhhhHHho...",
  "...ohhhhhhhho...",
  "...ohhhhhhhho...",
  "...ohhhhhhhho...",
  "...ohhhhhhhho...",
  "...ohhhhhhhho...",
  "....ohhhhhho....",
  ".....oooooo.....",
];

const HEAD_SIDE = [
  "....oooooooo....",
  "...ohhhhhhhho...",
  "...ohHHhhhhho...",
  "...ohhaahhhho...",
  "...ohhhhhhhho...",
  "...ohhhssssso...",
  "...ohhhssssso...",
  "...ohhhssesso...",
  "...ohhhssmsso...",
  "....ohhssssso...",
  ".....oooooo.....",
];

const BODY_COMMON = [
  "....occaacco....",
  "...occcccccco...",
  "...ocCccccCco...",
];

const BODY_ARMS: Record<WalkFrame, string[]> = {
  idle: ["...occcccccco...", "...osccccccso...", "....occcccco...."],
  a: ["...osccccccco...", "...occcccccco...", "....occcccco...."],
  b: ["...occcccccco...", "...occcccccso...", "....occcccco...."],
};

const BODY_WAIST = "....oppppppo....";

const LEGS: Record<WalkFrame, string[]> = {
  idle: [
    "....oPppppPo....",
    "....opp..pPo....",
    "....opp..pPo....",
    "...obbo.obbo....",
    "...oooo.oooo....",
  ],
  a: [
    "....oPppppPo....",
    "....opp..pPo....",
    "....opp..pPo....",
    "...obbo..pPo....",
    "...oooo.........",
  ],
  b: [
    "....oPppppPo....",
    "....opp..pPo....",
    "....opp..pPo....",
    "....opp..obbo...",
    ".........oooo...",
  ],
};

const HEADS = { down: HEAD_DOWN, up: HEAD_UP, right: HEAD_SIDE } as const;

export type SpriteDir = keyof typeof HEADS;

export function buildSpriteRows(dir: SpriteDir, frame: WalkFrame): string[] {
  const rows = [
    "................",
    ...HEADS[dir],
    ...BODY_COMMON,
    ...BODY_ARMS[frame],
    BODY_WAIST,
    ...LEGS[frame],
  ];
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
