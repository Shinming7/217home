import { PAL } from "./palette";
import type { CharacterLook } from "./types";

export const HAIR_CHOICES = [
  PAL.ink, PAL.navy, PAL.grape, PAL.plum, PAL.rust, PAL.orange, PAL.lemon, PAL.cream, PAL.slate, PAL.cyan,
];
export const SHIRT_CHOICES = [
  PAL.blue, PAL.teal, PAL.grass, PAL.forest, PAL.coral, PAL.cherry, PAL.amber, PAL.plum, PAL.steel, PAL.cream,
];
export const PANTS_CHOICES = [
  PAL.navy, PAL.ink, PAL.slate, PAL.teal, PAL.wood, PAL.grape, PAL.steel, PAL.pine, PAL.rust, PAL.silver,
];
export const ACCENT_CHOICES = [
  PAL.lemon, PAL.cyan, PAL.coral, PAL.lime, PAL.amber, PAL.white, PAL.plum, PAL.orange, PAL.cream, PAL.blue,
];
export const SKIN_CHOICES = ["#f2c9a5", "#e8b796", "#d9a066", "#c28569", "#9c6b4f", "#70472f"];

export function makeLook(
  hair: string,
  shirt: string,
  pants: string,
  accent: string,
  skin: string = PAL.peach,
): CharacterLook {
  return {
    hair,
    hairDark: darken(hair, 0.3),
    skin,
    skinDark: darken(skin, 0.22),
    shirt,
    shirtDark: darken(shirt, 0.3),
    pants,
    pantsDark: darken(pants, 0.3),
    shoes: PAL.ink,
    accent,
    outline: PAL.ink,
  };
}

function darken(hex: string, amount: number): string {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((offset) => {
    const channel = parseInt(value.slice(offset, offset + 2), 16);
    return Math.max(0, Math.round(channel * (1 - amount)))
      .toString(16)
      .padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function fallbackLook(id: string): CharacterLook {
  const seed = hash(id);
  return makeLook(
    HAIR_CHOICES[seed % HAIR_CHOICES.length],
    SHIRT_CHOICES[Math.floor(seed / 7) % SHIRT_CHOICES.length],
    PANTS_CHOICES[Math.floor(seed / 13) % PANTS_CHOICES.length],
    ACCENT_CHOICES[Math.floor(seed / 17) % ACCENT_CHOICES.length],
    SKIN_CHOICES[Math.floor(seed / 23) % SKIN_CHOICES.length],
  );
}

export function randomLook(): CharacterLook {
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
  return makeLook(pick(HAIR_CHOICES), pick(SHIRT_CHOICES), pick(PANTS_CHOICES), pick(ACCENT_CHOICES), pick(SKIN_CHOICES));
}

export function lookFromCosmetics(base: CharacterLook, cosmetics: Record<string, string> | null): CharacterLook {
  if (!cosmetics) return base;
  const look = { ...base };
  if (cosmetics.hair) {
    look.hair = cosmetics.hair;
    look.hairDark = darken(cosmetics.hair, 0.3);
  }
  if (cosmetics.shirt) {
    look.shirt = cosmetics.shirt;
    look.shirtDark = darken(cosmetics.shirt, 0.3);
  }
  if (cosmetics.pants) {
    look.pants = cosmetics.pants;
    look.pantsDark = darken(cosmetics.pants, 0.3);
  }
  if (cosmetics.skin) {
    look.skin = cosmetics.skin;
    look.skinDark = darken(cosmetics.skin, 0.22);
  }
  if (cosmetics.accent) look.accent = cosmetics.accent;
  return look;
}

export const DIALOGUE_BY_HEARTS: string[][] = [
  [
    "嗨，今天也来啦。",
    "屋子里的灯一直给你留着。",
    "要不要在窗边坐一会儿？",
    "你看起来今天有点累，歇歇吧。",
  ],
  [
    "你又来啦，我记得你。",
    "上次说的那件事，后来怎么样了？",
    "窗外的天气好像要变了。",
    "要不要一起去看看照片墙？",
  ],
  [
    "跟你聊天挺舒服的。",
    "给你留了半块饼干，在桌上。",
    "今晚的八角笼，要不要练两招？",
    "你一来，屋子就热闹了。",
  ],
  [
    "有你在，217 才像个家。",
    "下次一起拍张照，挂在墙上。",
    "鱼缸里那条锦鲤，我替你盯着呢。",
    "累了就回来，门没锁。",
  ],
];

export function dialogueFor(hearts: number): string[] {
  const tier = Math.min(DIALOGUE_BY_HEARTS.length - 1, Math.floor(Math.max(0, hearts) / 2));
  return DIALOGUE_BY_HEARTS[tier];
}
