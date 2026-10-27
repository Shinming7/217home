import { useEffect, useRef } from "react";
import { RoomEngine } from "../../game/engine";
import type { Phase } from "../../game/types";

type RoomCanvasProps = {
  phase: Phase;
  onSelectNpc: (id: string) => void;
  onEngine?: (engine: RoomEngine | null) => void;
  onEnterCage?: () => void;
  paused?: boolean;
};

export function RoomCanvas({ phase, onSelectNpc, onEngine, onEnterCage, paused = false }: RoomCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<RoomEngine | null>(null);
  const selectRef = useRef(onSelectNpc);
  const engineCbRef = useRef(onEngine);
  const cageRef = useRef(onEnterCage);
  const pausedRef = useRef(paused);

  useEffect(() => {
    selectRef.current = onSelectNpc;
    engineCbRef.current = onEngine;
    cageRef.current = onEnterCage;
    pausedRef.current = paused;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new RoomEngine(canvas, {
      onSelectNpc: (id) => selectRef.current(id),
      onEnterCage: () => cageRef.current?.(),
    });
    engine.setPaused(pausedRef.current);
    engineRef.current = engine;
    engine.start();
    engineCbRef.current?.(engine);

    const fit = () => {
      const maxW = Math.min(window.innerWidth - 40, 1536);
      const maxH = Math.max(220, window.innerHeight - 136);
      const raw = Math.min(maxW / 384, maxH / 256);
      const scale = raw >= 2 ? Math.min(4, Math.floor(raw)) : Math.max(0.5, raw);
      canvas.style.width = `${Math.round(384 * scale)}px`;
      canvas.style.height = `${Math.round(256 * scale)}px`;
    };
    fit();
    window.addEventListener("resize", fit);

    return () => {
      window.removeEventListener("resize", fit);
      engineCbRef.current?.(null);
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setPhase(phase);
  }, [phase]);

  useEffect(() => {
    engineRef.current?.setPaused(paused);
  }, [paused]);

  return (
    <canvas
      ref={canvasRef}
      width={384}
      height={256}
      aria-label="217之家像素小屋。使用方向键或 WASD 走动，点击小人查看档案，点击房间中央的八角笼进入对打。"
    />
  );
}
