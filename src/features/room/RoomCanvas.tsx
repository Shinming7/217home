import { useEffect, useRef, useState } from "react";
import { RoomEngine } from "../../game/engine";
import type { CharacterLook, Phase, PeerInput, WeatherKind } from "../../game/types";

type RoomCanvasProps = {
  selfLook: CharacterLook;
  start: { x: number; y: number };
  peers: PeerInput[];
  phase: Phase;
  weather: WeatherKind;
  paused?: boolean;
  onSelectMember: (id: string) => void;
  onEnterCage?: () => void;
  onEngine?: (engine: RoomEngine | null) => void;
};

export function RoomCanvas({
  selfLook,
  start,
  peers,
  phase,
  weather,
  paused = false,
  onSelectMember,
  onEnterCage,
  onEngine,
}: RoomCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<RoomEngine | null>(null);
  const selectRef = useRef(onSelectMember);
  const engineCbRef = useRef(onEngine);
  const cageRef = useRef(onEnterCage);
  const pausedRef = useRef(paused);
  const initialRef = useRef({ selfLook, start, phase, weather, peers });
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);

  useEffect(() => {
    selectRef.current = onSelectMember;
    engineCbRef.current = onEngine;
    cageRef.current = onEnterCage;
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
    });
    engine.setPeers(initial.peers);
    engine.setPaused(pausedRef.current);
    engineRef.current = engine;
    engine.start();
    engineCbRef.current?.(engine);

    const fit = () => {
      const stage = canvas.closest(".stage") as HTMLElement | null;
      const rect = stage?.getBoundingClientRect();
      const maxW = Math.min((rect?.width ?? window.innerWidth) - 36, 1600);
      const maxH = Math.max(220, (rect?.height ?? window.innerHeight - 180) - 16);
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

  const applyStick = (clientX: number, clientY: number) => {
    const pad = document.getElementById("room-joystick");
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = (clientX - cx) / (rect.width / 2);
    let dy = (clientY - cy) / (rect.height / 2);
    const length = Math.hypot(dx, dy);
    if (length > 1) {
      dx /= length;
      dy /= length;
    }
    engineRef.current?.setJoystick(dx, dy);
    setKnob({ x: dx * 16, y: dy * 16 });
  };

  const releaseStick = () => {
    dragging.current = false;
    engineRef.current?.setJoystick(0, 0);
    setKnob({ x: 0, y: 0 });
  };

  return (
    <div className="room-canvas-wrap">
      <canvas
        ref={canvasRef}
        width={384}
        height={256}
        aria-label="217之家像素小屋。使用方向键、WASD 或左下角摇杆走动，点击住户查看档案，点击房间中央的八角笼进入对打。"
      />
      <div
        id="room-joystick"
        className="joystick"
        role="presentation"
        onPointerDown={(event) => {
          event.preventDefault();
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          applyStick(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (dragging.current) applyStick(event.clientX, event.clientY);
        }}
        onPointerUp={releaseStick}
        onPointerCancel={releaseStick}
        onPointerLeave={() => {
          if (dragging.current) releaseStick();
        }}
      >
        <span className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>
    </div>
  );
}
