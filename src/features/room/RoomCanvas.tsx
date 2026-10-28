import { useEffect, useRef, useState } from "react";
import { RoomEngine } from "../../game/engine";
import type { CharacterLook, Phase, PeerInput, WeatherKind } from "../../game/types";

type RoomCanvasProps = {
  selfLook: CharacterLook;
  start: { x: number; y: number };
  peers: PeerInput[];
  phase: Phase;
  weather: WeatherKind;
  photoPreviews?: (HTMLImageElement | null)[];
  paused?: boolean;
  onSelectMember: (id: string) => void;
  onEnterCage?: () => void;
  onOpenPhotos?: () => void;
  onOpenBoard?: () => void;
  onOpenPoker?: () => void;
  onOpenTank?: () => void;
  onEngine?: (engine: RoomEngine | null) => void;
};

type Dir = "up" | "down" | "left" | "right";

const DIRS: { dir: Dir; glyph: string; label: string }[] = [
  { dir: "up", glyph: "▲", label: "向上走" },
  { dir: "down", glyph: "▼", label: "向下走" },
  { dir: "left", glyph: "◀", label: "向左走" },
  { dir: "right", glyph: "▶", label: "向右走" },
];

export function RoomCanvas({
  selfLook,
  start,
  peers,
  phase,
  weather,
  photoPreviews,
  paused = false,
  onSelectMember,
  onEnterCage,
  onOpenPhotos,
  onOpenBoard,
  onOpenPoker,
  onOpenTank,
  onEngine,
}: RoomCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<RoomEngine | null>(null);
  const selectRef = useRef(onSelectMember);
  const engineCbRef = useRef(onEngine);
  const cageRef = useRef(onEnterCage);
  const photosRef = useRef(onOpenPhotos);
  const boardRef = useRef(onOpenBoard);
  const pokerRef = useRef(onOpenPoker);
  const tankRef = useRef(onOpenTank);
  const pausedRef = useRef(paused);
  const initialRef = useRef({ selfLook, start, phase, weather, peers, photoPreviews });
  const heldDirs = useRef<Set<Dir>>(new Set());
  const [held, setHeld] = useState<Dir[]>([]);

  useEffect(() => {
    selectRef.current = onSelectMember;
    engineCbRef.current = onEngine;
    cageRef.current = onEnterCage;
    photosRef.current = onOpenPhotos;
    boardRef.current = onOpenBoard;
    pokerRef.current = onOpenPoker;
    tankRef.current = onOpenTank;
    pausedRef.current = paused;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const initial = initialRef.current;
    const engine = new RoomEngine(canvas, {
      selfLook: initial.selfLook,
      start: initial.start,
      phase: initial.phase,
      weather: initial.weather,
      onSelectMember: (id) => selectRef.current(id),
      onEnterCage: () => cageRef.current?.(),
      onOpenPhotos: () => photosRef.current?.(),
      onOpenBoard: () => boardRef.current?.(),
      onOpenPoker: () => pokerRef.current?.(),
      onOpenTank: () => tankRef.current?.(),
    });
    engine.setPeers(initial.peers);
    engine.setPhotoPreviews(initial.photoPreviews ?? []);
    engine.setPaused(pausedRef.current);
    engineRef.current = engine;
    engine.start();
    engineCbRef.current?.(engine);

    const fit = () => {
      const stage = canvas.closest(".stage") as HTMLElement | null;
      const style = stage ? getComputedStyle(stage) : null;
      const padX = style ? parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) : 0;
      const padY = style ? parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) : 0;
      // clientWidth/clientHeight 是布局尺寸，不受强制横屏的 rotate 影响
      const stageW = stage?.clientWidth ?? window.innerWidth;
      const stageH = stage?.clientHeight ?? window.innerHeight - 180;
      const maxW = Math.min(stageW - padX - 24, 1600);
      const maxH = Math.max(220, stageH - padY - 16);
      const raw = Math.min(maxW / 384, maxH / 256);
      const scale = raw >= 2 ? Math.min(4, Math.floor(raw)) : Math.max(0.6, raw);
      canvas.style.width = `${Math.round(384 * scale)}px`;
      canvas.style.height = `${Math.round(256 * scale)}px`;
    };
    fit();
    const stage = canvas.closest(".stage");
    const observer = stage ? new ResizeObserver(fit) : null;
    if (stage && observer) observer.observe(stage);
    window.addEventListener("resize", fit);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", fit);
      engineCbRef.current?.(null);
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setSelfLook(selfLook);
  }, [selfLook]);

  useEffect(() => {
    engineRef.current?.setPhase(phase);
  }, [phase]);

  useEffect(() => {
    engineRef.current?.setWeather(weather);
  }, [weather]);

  useEffect(() => {
    engineRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    engineRef.current?.setPeers(peers);
  }, [peers]);

  useEffect(() => {
    engineRef.current?.setPhotoPreviews(photoPreviews ?? []);
  }, [photoPreviews]);

  const syncDirs = () => {
    const dirs = heldDirs.current;
    const x = (dirs.has("right") ? 1 : 0) - (dirs.has("left") ? 1 : 0);
    const y = (dirs.has("down") ? 1 : 0) - (dirs.has("up") ? 1 : 0);
    engineRef.current?.setJoystick(x, y);
    setHeld([...dirs]);
  };

  const pressDir = (dir: Dir) => {
    heldDirs.current.add(dir);
    syncDirs();
  };

  const releaseDir = (dir: Dir) => {
    if (heldDirs.current.delete(dir)) syncDirs();
  };

  const releaseAllDirs = () => {
    if (heldDirs.current.size) {
      heldDirs.current.clear();
      syncDirs();
    }
  };

  useEffect(() => {
    if (paused) releaseAllDirs();
  }, [paused]);

  return (
    <div className="room-canvas-wrap">
      <canvas
        ref={canvasRef}
        width={384}
        height={256}
        aria-label="217之家像素小屋。使用方向键、WASD 或左侧方向按钮走动，点击住户查看档案，点击房间中央的八角笼进入对打。"
      />
      <div className="dpad" role="group" aria-label="移动方向键">
        {DIRS.map(({ dir, glyph, label }) => (
          <button
            key={dir}
            type="button"
            className={`dpad-btn dpad-${dir}${held.includes(dir) ? " pressed" : ""}`}
            aria-label={label}
            onPointerDown={(event) => {
              event.preventDefault();
              pressDir(dir);
            }}
            onPointerUp={() => releaseDir(dir)}
            onPointerCancel={() => releaseDir(dir)}
            onPointerLeave={() => releaseDir(dir)}
            onLostPointerCapture={() => releaseDir(dir)}
            onContextMenu={(event) => event.preventDefault()}
          >
            {glyph}
          </button>
        ))}
      </div>
    </div>
  );
}
