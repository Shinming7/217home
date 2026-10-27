import { useEffect, useRef } from "react";
import { getCharacterPortrait } from "../game/character";
import type { CharacterLook } from "../game/types";

type PixelPortraitProps = {
  look: CharacterLook;
  label?: string;
  size?: number;
};

export function PixelPortrait({ look, label, size }: PixelPortraitProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 64, 64);
    ctx.drawImage(getCharacterPortrait(look), 0, 0);
  }, [look]);

  return (
    <canvas
      ref={ref}
      width={64}
      height={64}
      aria-label={label}
      role={label ? "img" : undefined}
      style={size ? { width: size, height: size } : undefined}
    />
  );
}
