import { useCallback, useState } from "react";
import { RoomCanvas } from "./features/room/RoomCanvas";
import { ProfileCard } from "./features/profile/ProfileCard";
import { FightModal } from "./features/games/FightModal";
import { NPC_SPECS } from "./game/roomData";
import type { RoomEngine } from "./game/engine";
import type { Phase } from "./game/types";

const PHASE_LABEL: Record<Phase, string> = { day: "白天", dusk: "黄昏", night: "夜晚" };
const PHASE_ORDER: Phase[] = ["day", "dusk", "night"];

export default function App() {
  const [phase, setPhase] = useState<Phase>("dusk");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [engine, setEngine] = useState<RoomEngine | null>(null);
  const [fightOpen, setFightOpen] = useState(false);
  const [fightFoeId, setFightFoeId] = useState<string | null>(null);

  const selected = selectedId ? (NPC_SPECS.find((npc) => npc.id === selectedId) ?? null) : null;

  const handleSelect = useCallback((id: string) => setSelectedId(id), []);
  const handleClose = useCallback(() => setSelectedId(null), []);
  const handleEngine = useCallback((instance: RoomEngine | null) => setEngine(instance), []);
  const handleChat = useCallback(() => {
    if (!selectedId) return;
    engine?.say(selectedId);
    setSelectedId(null);
  }, [engine, selectedId]);

  const handleEnterCage = useCallback(() => {
    setFightFoeId(null);
    setFightOpen(true);
  }, []);

  const handleFightClose = useCallback(() => {
    setFightOpen(false);
    setFightFoeId(null);
  }, []);

  const handleProfileFight = useCallback(() => {
    if (!selectedId) return;
    setFightFoeId(selectedId);
    setFightOpen(true);
    setSelectedId(null);
  }, [selectedId]);

  const cyclePhase = () => {
    setPhase((current) => PHASE_ORDER[(PHASE_ORDER.indexOf(current) + 1) % PHASE_ORDER.length]);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-badge" aria-hidden="true">
            217
          </span>
          <div className="brand-text">
            <h1>217之家</h1>
            <p>A TINY ROOM FOR US</p>
          </div>
        </div>
        <div className="topbar-right">
          <span className="status">
            <span className="status-dot" aria-hidden="true" />5 位住户 · 在线 3
          </span>
          <button className="pixel-btn" onClick={cyclePhase} aria-label="切换房间光照">
            光照 · {PHASE_LABEL[phase]}
          </button>
        </div>
      </header>

      <main className="stage">
        <div className="room-frame">
          <RoomCanvas
            phase={phase}
            onSelectNpc={handleSelect}
            onEngine={handleEngine}
            onEnterCage={handleEnterCage}
            paused={Boolean(selected) || fightOpen}
          />
        </div>
      </main>

      <footer className="hintbar">
        <p>
          <span className="key">WASD</span> / <span className="key">方向键</span> 移动 · 点击小人打开档案 · 点击中间八角笼开打
        </p>
        <p className="fineprint">M0.5 风格样张 · 新小人、家具与八角笼对打 · 后续加入照片像素化、照片墙与留言板</p>
      </footer>

      {selected ? (
        <ProfileCard spec={selected} onClose={handleClose} onChat={handleChat} onFight={handleProfileFight} />
      ) : null}
      {fightOpen ? <FightModal initialFoeId={fightFoeId} onClose={handleFightClose} /> : null}
    </div>
  );
}
