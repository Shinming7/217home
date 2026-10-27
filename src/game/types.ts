export type Dir = "down" | "up" | "left" | "right";

export type WalkFrame = "idle" | "a" | "b";

export type Phase = "day" | "dusk" | "night";

export type CharacterLook = {
  hair: string;
  hairDark: string;
  skin: string;
  skinDark: string;
  shirt: string;
  shirtDark: string;
  pants: string;
  pantsDark: string;
  shoes: string;
  accent: string;
  outline: string;
};

export type Rect = { x: number; y: number; w: number; h: number };

export type Profile = {
  intro: string;
  tags: string[];
  hearts: number;
  joined: string;
};

export type NpcSpec = {
  id: string;
  name: string;
  look: CharacterLook;
  x: number;
  y: number;
  profile: Profile;
};
