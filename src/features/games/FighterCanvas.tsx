import { useEffect, useRef } from "react";
import { getCharacterSprite } from "../../game/character";
import type { CharacterLook, Dir } from "../../game/types";

export function FighterCanvas({ look, dir }: { look: CharacterLook; dir: Dir }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 48, 72);
    ctx.drawImage(getCharacterSprite(look, dir, "idle"), 0, 0, 16, 24, 0, 0, 48, 72);
  }, [look, dir]);

  return <canvas ref={ref} width={48} height={72} aria-hidden="true" />;
}
