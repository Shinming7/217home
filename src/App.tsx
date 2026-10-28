import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RoomCanvas } from "./features/room/RoomCanvas";
import { ProfileCard } from "./features/profile/ProfileCard";
import { FightModal, type Fighter } from "./features/games/FightModal";
import { JoinScreen } from "./features/join/JoinScreen";
import { Creator } from "./features/creator/Creator";
import { PhotoWall } from "./features/photos/PhotoWall";
import { MessageBoard } from "./features/board/MessageBoard";
import { RpsModal } from "./features/games/RpsModal";
import { FishModal } from "./features/games/FishModal";
import { PokerModal } from "./features/games/PokerModal";
import { AdminPanel } from "./features/admin/AdminPanel";
import { api, ApiError, errorText, setAuthToken } from "./net/api";
import { clearStoredSession, loadStoredSession, saveStoredSession } from "./net/session";
import { usePresence } from "./net/presence";
import { useForcedLandscape } from "./features/room/useLandscape";
import type { JoinResult, MemberDetail, MemberSummary, SelfMember } from "./net/types";
import { dialogueFor, fallbackLook } from "./game/looks";
import type { Dir, PeerInput, Phase, WeatherKind } from "./game/types";
import type { RoomEngine } from "./game/engine";

type Stage = "boot" | "join" | "create" | "room";
type PanelKind = "photos" | "board" | "rps" | "fish" | "poker" | "admin" | "edit";

const PHASE_LABEL: Record<Phase, string> = { morning: "晨光", day: "白天", dusk: "黄昏", night: "夜晚" };
const WEATHER_LABEL: Record<WeatherKind, string> = {
  clear: "晴",
  cloudy: "多云",
  rain: "雨",
  snow: "雪",
  storm: "雷暴",
  fog: "雾",
};

export default function App() {
  const [stage, setStage] = useState<Stage>("boot");
  const [self, setSelf] = useState<SelfMember | null>(null);
  const [notice, setNotice] = useState("");
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [selected, setSelected] = useState<MemberDetail | null>(null);
  const [panel, setPanel] = useState<PanelKind | null>(null);
  const [fightOpen, setFightOpen] = useState(false);
  const [fightFoeId, setFightFoeId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [toastWarn, setToastWarn] = useState(false);
  const [quitArmed, setQuitArmed] = useState(false);
  const engineRef = useRef<RoomEngine | null>(null);
  const toastTimer = useRef(0);
  const quitTimer = useRef(0);

  const notify = useCallback((text: string, warn = false) => {
    setToast(text);
    setToastWarn(warn);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3200);
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(toastTimer.current);
      window.clearTimeout(quitTimer.current);
    },
    [],
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      const stored = loadStoredSession();
      if (!stored) {
        if (alive) setStage("join");
        return;
      }
      setAuthToken(stored.token);
      try {
        const { member } = await api.me();
        if (!alive) return;
        saveStoredSession({ token: stored.token, member });
        setSelf(member);
        setStage(member.look ? "room" : "create");
      } catch {
        if (!alive) return;
        setAuthToken(null);
        clearStoredSession();
        setNotice("上次的登录已经失效，重新输入暗号就好。");
        setStage("join");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const handleAuthError = useCallback(() => {
    setAuthToken(null);
    clearStoredSession();
    setSelf(null);
    setMembers([]);
    setSelected(null);
    setPanel(null);
    setFightOpen(false);
    setStage("join");
    setNotice("登录已经失效，请重新输入房间暗号。");
  }, []);

  const refreshMembers = useCallback(async () => {
    try {
      const result = await api.members();
      setMembers(result.members);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleAuthError();
        return;
      }
      notify(errorText(error), true);
    }
  }, [handleAuthError, notify]);

  useEffect(() => {
    if (stage === "room") void refreshMembers();
  }, [stage, refreshMembers]);

  const getPosition = useCallback((): { x: number; y: number; dir: Dir } => {
    return engineRef.current?.getPlayer() ?? { x: 196, y: 228, dir: "down" };
  }, []);

  const { presence, offline } = usePresence({
    enabled: stage === "room",
    getPosition,
    onAuthError: handleAuthError,
  });

  useEffect(() => {
    if (presence) {
      setMembers((current) => {
        if (!current.length) return current;
        const byId = new Map(presence.peers.map((peer) => [peer.id, peer]));
        return current.map((member) => {
          const peer = byId.get(member.id);
          return peer ? { ...member, online: peer.online, x: peer.x, y: peer.y, dir: peer.dir, look: peer.look } : member;
        });
      });
    }
  }, [presence]);

  const selfLook = useMemo(() => (self ? (self.look ?? fallbackLook(self.id)) : fallbackLook("217")), [self]);

  const peers: PeerInput[] = useMemo(() => {
    const source = presence?.peers ?? members.filter((member) => !member.isSelf);
    return source.map((member) => ({
      id: member.id,
      nickname: member.nickname,
      look: member.look,
      online: member.online,
      x: member.x,
      y: member.y,
      dir: member.dir,
    }));
  }, [presence, members]);

  const opponents: Fighter[] = useMemo(
    () =>
      members
        .filter((member) => !member.isSelf)
        .map((member) => ({ id: member.id, nickname: member.nickname, look: member.look })),
    [members],
  );

  const phase: Phase = presence?.phase ?? "dusk";
  const weather: WeatherKind = presence?.weather.kind ?? "clear";
  const paused = Boolean(selected) || fightOpen || panel !== null;
  const forcedLandscape = useForcedLandscape(stage === "room");

  const handleJoined = (result: JoinResult) => {
    setAuthToken(result.token);
    saveStoredSession({ token: result.token, member: result.member });
    setSelf(result.member);
    setNotice("");
    setStage(result.member.look ? "room" : "create");
  };

  const handleSaved = (member: SelfMember) => {
    const stored = loadStoredSession();
    if (stored) saveStoredSession({ token: stored.token, member });
    setSelf(member);
    setPanel(null);
    setStage("room");
    void refreshMembers();
  };

  const openProfile = async (id: string) => {
    try {
      const detail = await api.memberDetail(id);
      setSelected(detail);
    } catch (error) {
      notify(errorText(error), true);
    }
  };

  const handleChat = async () => {
    if (!selected) return;
    const target = selected.member;
    const lines = dialogueFor(selected.hearts);
    engineRef.current?.say(target.id, lines[Math.floor(Math.random() * lines.length)]);
    setSelected(null);
    try {
      const result = await api.touchAffinity(target.id);
      setMembers((current) =>
        current.map((member) => (member.id === target.id ? { ...member, hearts: result.hearts } : member)),
      );
      if (result.added) notify(`和 ${target.nickname} 的好感 +1（现在 ${result.hearts} 点）`);
      else notify("今天已经聊过啦，明天再来续上");
    } catch (error) {
      notify(errorText(error), true);
    }
  };

  const handleFightResult = async (targetId: string, result: "win" | "lose", rounds: number) => {
    try {
      const response = await api.fight(targetId, result, rounds);
      setMembers((current) =>
        current.map((member) => (member.id === targetId ? { ...member, hearts: response.hearts } : member)),
      );
      if (response.added) notify(`八角笼切磋完，好感 +1（现在 ${response.hearts} 点）`);
      else notify(result === "win" ? "打赢了！今天的好感已经拿过啦" : "输赢都算数，好感今天已经加过了");
    } catch (error) {
      notify(errorText(error), true);
    }
  };

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // 会话可能已经过期，本地清理即可
    }
    setAuthToken(null);
    clearStoredSession();
    setSelf(null);
    setMembers([]);
    setSelected(null);
    setPanel(null);
    setFightOpen(false);
    setStage("join");
    setNotice("");
    setQuitArmed(false);
  }, []);

  const askQuit = () => {
    if (quitArmed) {
      void logout();
      return;
    }
    setQuitArmed(true);
    window.clearTimeout(quitTimer.current);
    quitTimer.current = window.setTimeout(() => setQuitArmed(false), 4000);
  };

  if (stage === "boot") {
    return (
      <div className="app boot">
        <div className="boot-card">
          <span className="brand-badge">217</span>
          <p>正在打开小屋的灯……</p>
        </div>
      </div>
    );
  }

  if (stage === "join") return <JoinScreen notice={notice} onJoined={handleJoined} />;

  if (stage === "create" && self) {
    return <Creator self={self} mode="create" onSaved={handleSaved} />;
  }

  if (!self) {
    return <JoinScreen notice={notice} onJoined={handleJoined} />;
  }

  const memberCount = presence?.memberCount ?? members.length;
  const onlineCount = presence?.onlineCount ?? members.filter((member) => member.online).length;

  return (
    <div className={forcedLandscape ? "app forced-landscape" : "app"}>
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
            <span className={offline ? "status-dot offline" : "status-dot"} aria-hidden="true" />
            {offline ? "离线 · 自在小逛" : `${memberCount} 位住户 · 在线 ${onlineCount}`}
          </span>
          <span className={`chip weather-chip w-${weather}`} title={`${presence?.weather.city ?? "上海"}的天气`}>
            {WEATHER_LABEL[weather]}
            {presence?.weather.temp != null ? ` ${presence.weather.temp}°` : ""}
          </span>
          <span className="chip phase-chip">{PHASE_LABEL[phase]}</span>
        </div>
      </header>

      <main className="stage">
        <div className="room-frame">
          <RoomCanvas
            selfLook={selfLook}
            start={{ x: 196, y: 228 }}
            peers={peers}
            phase={phase}
            weather={weather}
            paused={paused}
            onSelectMember={(id) => void openProfile(id)}
            onEnterCage={() => {
              setFightFoeId(null);
              setFightOpen(true);
            }}
            onOpenPhotos={() => setPanel("photos")}
            onOpenPoker={() => setPanel("poker")}
            onEngine={(engine) => {
              engineRef.current = engine;
            }}
          />
        </div>
      </main>

      <nav className="dock" aria-label="小屋功能">
        <button className={panel === "photos" ? "dock-btn active" : "dock-btn"} onClick={() => setPanel("photos")}>
          照片墙
        </button>
        <button className={panel === "board" ? "dock-btn active" : "dock-btn"} onClick={() => setPanel("board")}>
          留言板
        </button>
        <button className={panel === "rps" ? "dock-btn active" : "dock-btn"} onClick={() => setPanel("rps")}>
          猜拳
        </button>
        <button className={panel === "fish" ? "dock-btn active" : "dock-btn"} onClick={() => setPanel("fish")}>
          钓鱼
        </button>
        <button className={panel === "poker" ? "dock-btn active" : "dock-btn"} onClick={() => setPanel("poker")}>
          德州
        </button>
        <button className={panel === "edit" ? "dock-btn active" : "dock-btn"} onClick={() => setPanel("edit")}>
          我的档案
        </button>
        {self.role === "owner" ? (
          <button className={panel === "admin" ? "dock-btn active" : "dock-btn"} onClick={() => setPanel("admin")}>
            站长
          </button>
        ) : null}
        <button className={quitArmed ? "dock-btn quit armed" : "dock-btn quit"} onClick={askQuit}>
          {quitArmed ? "再点一次离开" : "离开"}
        </button>
      </nav>

      <footer className="hintbar">
        <p>
          <span className="key">WASD</span> / <span className="key">方向键</span> 移动 · 点击小人打开档案 · 照片墙、牌桌、八角笼都能互动
        </p>
        <p className="fineprint">
          {offline
            ? "连不上小屋服务，先自己逛一会儿；恢复后会自动同步。"
            : `照片墙、留言板和小游戏都在下面 · 当前住客 ${memberCount} 位`}
        </p>
      </footer>

      {selected ? (
        <ProfileCard
          detail={selected}
          selfId={self.id}
          onClose={() => setSelected(null)}
          onChat={() => void handleChat()}
          onFight={() => {
            setFightFoeId(selected.member.id);
            setFightOpen(true);
            setSelected(null);
          }}
        />
      ) : null}

      {fightOpen ? (
        <FightModal
          self={{ id: self.id, nickname: self.nickname, look: selfLook }}
          opponents={opponents}
          initialFoeId={fightFoeId}
          onClose={() => {
            setFightOpen(false);
            setFightFoeId(null);
          }}
          onResult={(targetId, result, rounds) => void handleFightResult(targetId, result, rounds)}
        />
      ) : null}

      {panel === "photos" ? (
        <PhotoWall isOwner={self.role === "owner"} onClose={() => setPanel(null)} onChanged={() => void refreshMembers()} />
      ) : null}
      {panel === "board" ? (
        <MessageBoard isOwner={self.role === "owner"} onClose={() => setPanel(null)} onChanged={() => void refreshMembers()} />
      ) : null}
      {panel === "rps" ? <RpsModal opponents={opponents} onClose={() => setPanel(null)} /> : null}
      {panel === "fish" ? <FishModal onClose={() => setPanel(null)} /> : null}
      {panel === "poker" ? <PokerModal onClose={() => setPanel(null)} /> : null}
      {panel === "edit" ? (
        <Creator self={self} mode="edit" onSaved={handleSaved} onCancel={() => setPanel(null)} />
      ) : null}
      {panel === "admin" && self.role === "owner" ? (
        <AdminPanel
          onClose={() => setPanel(null)}
          onChanged={() => void refreshMembers()}
          onLogout={() => void logout()}
        />
      ) : null}

      {toast ? (
        <div className={toastWarn ? "toast warn" : "toast"} role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
