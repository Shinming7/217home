import { PAL } from "./palette";
import type { CharacterLook, NpcSpec, Rect } from "./types";

export const ROOM = { width: 384, height: 256, tile: 16 } as const;

export const BOUNDS = { minX: 9, maxX: 375, minY: 78, maxY: 250 } as const;

export const WINDOW = { x: 152, y: 10, w: 80, h: 46 } as const;
export const RUG = { x: 128, y: 140, w: 120, h: 76 } as const;
export const PENDANT = { x: 260, y: 0, shadeY: 18, glowX: 270, glowY: 30 } as const;
export const CORKBOARD = { x: 288, y: 12, w: 64, h: 42 } as const;
export const PHOTO_FRAMES = [
  { x: 34, y: 14, w: 28, h: 22, variant: "sunset" as const },
  { x: 68, y: 20, w: 34, h: 26, variant: "friends" as const },
  { x: 108, y: 12, w: 24, h: 20, variant: "moon" as const },
];

export type PropKind = "bed" | "desk" | "chair" | "sofa" | "table" | "plant" | "tank";
export type PropSpec = { id: string; kind: PropKind; x: number; y: number; w: number; h: number };

export const PROPS: PropSpec[] = [
  { id: "bed", kind: "bed", x: 16, y: 70, w: 64, h: 56 },
  { id: "desk", kind: "desk", x: 280, y: 58, w: 64, h: 66 },
  { id: "chair", kind: "chair", x: 304, y: 124, w: 22, h: 20 },
  { id: "sofa", kind: "sofa", x: 32, y: 180, w: 88, h: 40 },
  { id: "table", kind: "table", x: 168, y: 156, w: 48, h: 28 },
  { id: "plant", kind: "plant", x: 126, y: 206, w: 26, h: 38 },
  { id: "tank", kind: "tank", x: 326, y: 184, w: 50, h: 46 },
];

export const SOLIDS: Rect[] = [
  { x: 0, y: 0, w: ROOM.width, h: 74 },
  { x: 16, y: 70, w: 64, h: 56 },
  { x: 280, y: 84, w: 64, h: 38 },
  { x: 304, y: 124, w: 22, h: 20 },
  { x: 32, y: 180, w: 88, h: 40 },
  { x: 168, y: 156, w: 48, h: 28 },
  { x: 126, y: 206, w: 26, h: 38 },
  { x: 326, y: 184, w: 50, h: 46 },
];

export const PLAYER_START = { x: 196, y: 214 };

export const PLAYER_LOOK: CharacterLook = {
  hair: PAL.navy,
  hairDark: PAL.ink,
  skin: PAL.peach,
  skinDark: PAL.clay,
  shirt: PAL.blue,
  shirtDark: PAL.teal,
  pants: PAL.navy,
  pantsDark: PAL.ink,
  shoes: PAL.ink,
  accent: PAL.cyan,
  outline: PAL.ink,
};

export const NPC_SPECS: NpcSpec[] = [
  {
    id: "alan",
    name: "阿岚",
    x: 250,
    y: 222,
    look: {
      hair: PAL.plum,
      hairDark: PAL.grape,
      skin: PAL.peach,
      skinDark: PAL.clay,
      shirt: PAL.grass,
      shirtDark: PAL.forest,
      pants: PAL.clay,
      pantsDark: PAL.wood,
      shoes: PAL.ink,
      accent: PAL.lemon,
      outline: PAL.ink,
    },
    profile: {
      intro: "住进 217 的第 3 天。喜欢在窗边发呆，负责把大家的合照挂上墙。",
      tags: ["夜猫子", "咖啡续命", "挂照片担当"],
      hearts: 4,
      joined: "第 3 天",
    },
  },
  {
    id: "xiaoman",
    name: "小满",
    x: 96,
    y: 166,
    look: {
      hair: PAL.orange,
      hairDark: PAL.rust,
      skin: PAL.peach,
      skinDark: PAL.clay,
      shirt: PAL.coral,
      shirtDark: PAL.brick,
      pants: PAL.navy,
      pantsDark: PAL.ink,
      shoes: PAL.ink,
      accent: PAL.lemon,
      outline: PAL.ink,
    },
    profile: {
      intro: "隔壁房间的常客，进门从不敲门。最近沉迷鱼缸，号称要集齐 8 种鱼。",
      tags: ["钓鱼佬", "话很多", "会做饭"],
      hearts: 3,
      joined: "第 5 天",
    },
  },
];

export const DIALOGUE_LINES: Record<string, string[]> = {
  alan: [
    "你回来啦，今天过得怎么样？",
    "窗外的天气好像要变了。",
    "要不要一起看上次的合照？",
    "台灯开着的时候，屋子最舒服。",
  ],
  xiaoman: [
    "鱼缸里好像又多了一条！",
    "猜拳吗？输的人去泡咖啡。",
    "今天想吃什么，我下厨。",
    "别站在门口啦，进来坐。",
  ],
};
