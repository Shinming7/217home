import { useCallback, useEffect, useRef, useState } from "react";
import { fallbackLook } from "../../game/looks";
import { PixelPortrait } from "../../ui/PixelPortrait";
import { FighterCanvas } from "./FighterCanvas";
import { OnlineFight } from "./OnlineFight";
import type { CharacterLook } from "../../game/types";

type Move = "jab" | "hook" | "block" | "dodge";
type Stage = "select" | "fight" | "over";
type FightMode = "mode" | "ai" | "online";
type Outcome = "win" | "lose" | "draw";
type LogTone = "you" | "foe" | "system";
type LogEntry = { id: number; text: string; tone: LogTone };
type FightRecord = { [fighterId: string]: { w: number; l: number } };

export type Fighter = { id: string; nickname: string; look: CharacterLook | null };

type FightModalProps = {
  self: { id: string; nickname: string; look: CharacterLook };
  opponents: Fighter[];
  onlineTargets: Fighter[];
  initialFoeId?: string | null;
  initialMode?: "online" | null;
  autoJoin?: boolean;
  onClose: () => void;
  onResult: (targetId: string, result: "win" | "lose", rounds: number) => void;
  onNotify: (text: string, warn?: boolean) => void;
};

const MOVES: { id: Move; label: string; hint: string }[] = [
  { id: "jab", label: "直拳", hint: "准 · 10~13" },
  { id: "hook", label: "摆拳", hint: "重 · 18~24" },
  { id: "block", label: "格挡", hint: "减伤 70%" },
  { id: "dodge", label: "闪避", hint: "70% 躲开" },
];

const MOVE_LABEL: Record<Move, string> = { jab: "直拳", hook: "摆拳", block: "格挡", dodge: "闪避" };

const RESULT_COPY: Record<Outcome, { kicker: string; title: string; line: (name: string) => string }> = {
  win: {
    kicker: "K.O. · YOU WIN",
    title: "胜利",
    line: (name) => `${name}扶着围栏笑：这拳算你狠。`,
  },
  lose: {
    kicker: "K.O. · YOU LOSE",
    title: "惜败",
    line: (name) => `${name}伸手拉你起来：明天再来。`,
  },
  draw: {
    kicker: "DOUBLE K.O.",
    title: "平局",
    line: () => "两人一起坐在垫子上喘气。",
  },
};

const RECORD_KEY = "217-fight-record-v3";

function loadRecord(): FightRecord {
  try {
    const raw = sessionStorage.getItem(RECORD_KEY);
    return raw ? (JSON.parse(raw) as FightRecord) : {};
  } catch {
    return {};
  }
}

function hpTone(hp: number): string {
  if (hp > 55) return "ok";
  if (hp > 25) return "warn";
  return "danger";
}

function rollAttack(move: Move, defenderMove: Move, defenderDodged: boolean) {
  const accuracy = move === "jab" ? 0.88 : 0.6;
  if (Math.random() > accuracy) return { damage: 0, evaded: false, blocked: false };
  if (defenderMove === "dodge" && defenderDodged) return { damage: 0, evaded: true, blocked: false };
  const base = move === "jab" ? 10 + Math.floor(Math.random() * 4) : 18 + Math.floor(Math.random() * 7);
  const blocked = defenderMove === "block";
  return { damage: blocked ? Math.max(1, Math.round(base * 0.3)) : base, evaded: false, blocked };
}

function aiChoose(foeHp: number, playerHp: number): Move {
  const roll = Math.random();
  if (foeHp <= 22) return roll < 0.34 ? "block" : roll < 0.58 ? "dodge" : roll < 0.9 ? "jab" : "hook";
  if (playerHp <= 22) return roll < 0.5 ? "hook" : roll < 0.82 ? "jab" : "block";
  if (roll < 0.42) return "jab";
  if (roll < 0.74) return "hook";
  if (roll < 0.9) return "block";
  return "dodge";
}

export function FightModal({
  self,
  opponents,
  onlineTargets,
  initialFoeId,
  initialMode,
  autoJoin,
  onClose,
  onResult,
  onNotify,
}: FightModalProps) {
  const [mode, setMode] = useState<FightMode>(
    initialFoeId ? "ai" : initialMode === "online" ? "online" : "mode",
  );
  const [onlineInside, setOnlineInside] = useState(false);
  const [stage, setStage] = useState<Stage>("select");
  const [foeId, setFoeId] = useState<string | null>(null);
  const [youHp, setYouHp] = useState(100);
  const [foeHp, setFoeHp] = useState(100);
  const [round, setRound] = useState(1);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [fx, setFx] = useState({ key: 0, you: "", foe: "", youTaken: 0, foeTaken: 0 });
  const [result, setResult] = useState<Outcome | null>(null);
  const [record, setRecord] = useState<FightRecord>(loadRecord);
  const timers = useRef<number[]>([]);
  const logId = useRef(1);
  const logRef = useRef<HTMLDivElement>(null);
  const reported = useRef(false);

  const foe = foeId ? (opponents.find((entry) => entry.id === foeId) ?? null) : null;
  const foeLook = foe?.look ?? (foe ? fallbackLook(foe.id) : self.look);

  const clearTimers = useCallback(() => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  }, []);

  const startFight = useCallback(
    (fighterId: string) => {
      const fighter = opponents.find((entry) => entry.id === fighterId);
      if (!fighter) return;
      clearTimers();
      logId.current = 1;
      reported.current = false;
      setFoeId(fighterId);
      setStage("fight");
      setYouHp(100);
      setFoeHp(100);
      setRound(1);
      setBusy(false);
      setResult(null);
      setFx({ key: 0, you: "", foe: "", youTaken: 0, foeTaken: 0 });
      setLog([{ id: 0, text: `裁判挥手：${fighter.nickname} 对阵 你，开打！`, tone: "system" }]);
    },
    [clearTimers, opponents],
  );

  useEffect(() => {
    if (initialFoeId) startFight(initialFoeId);
  }, [initialFoeId, startFight]);

  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => {
    try {
      sessionStorage.setItem(RECORD_KEY, JSON.stringify(record));
    } catch {
      // 无痕模式或存储被禁用时静默失败
    }
  }, [record]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  const onlineInsideRef = useRef(false);
  useEffect(() => {
    onlineInsideRef.current = onlineInside;
  }, [onlineInside]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !onlineInsideRef.current) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const playRound = (move: Move) => {
    if (!foe || stage !== "fight" || busy || result) return;
    setBusy(true);

    const foeMove = aiChoose(foeHp, youHp);
    const youAttack = move === "jab" || move === "hook";
    const foeAttack = foeMove === "jab" || foeMove === "hook";
    const youDodging = move === "dodge" && Math.random() < 0.7;
    const foeDodging = foeMove === "dodge" && Math.random() < 0.7;

    const youRes = youAttack ? rollAttack(move, foeMove, foeDodging) : { damage: 0, evaded: false, blocked: false };
    const foeRes = foeAttack ? rollAttack(foeMove, move, youDodging) : { damage: 0, evaded: false, blocked: false };

    const nextFoeHp = Math.max(0, foeHp - youRes.damage);
    const nextYouHp = Math.max(0, youHp - foeRes.damage);

    const entries: LogEntry[] = [];
    const push = (text: string, tone: LogTone) => entries.push({ id: logId.current++, text, tone });

    if (move === "block" && foeMove === "block") {
      push("两人同时抱拳格挡，裁判都看困了。", "system");
    } else if (move === "dodge" && foeMove === "dodge") {
      push("两人同时闪开，台上只剩风声。", "system");
    } else {
      if (youAttack) {
        if (youRes.damage > 0) {
          push(
            youRes.blocked
              ? `你的${MOVE_LABEL[move]}被压住大半，只擦到 ${youRes.damage} 点。`
              : `你的${MOVE_LABEL[move]}正中${foe.nickname}，打掉 ${youRes.damage} 点！`,
            "you",
          );
        } else if (youRes.evaded) {
          push(`${foe.nickname}侧身一闪，你的${MOVE_LABEL[move]}落空。`, "foe");
        } else if (foeMove === "block") {
          push(`你的${MOVE_LABEL[move]}砸在${foe.nickname}的护臂上，没讨到便宜。`, "you");
        } else {
          push(`你的${MOVE_LABEL[move]}挥空了，气势还在。`, "you");
        }
      } else if (move === "block") {
        if (!foeAttack) push("你架起双臂，静静看着对手。", "you");
      } else if (foeAttack && !foeRes.evaded) {
        push("你慢了半拍，没能完全闪开。", "system");
      } else if (!foeAttack) {
        push(youDodging ? "你原地晃动，先躲为敬。" : "你脚下有点滑，晃了个空。", "you");
      }

      if (foeAttack) {
        if (foeRes.damage > 0) {
          push(
            foeRes.blocked
              ? `${foe.nickname}的${MOVE_LABEL[foeMove]}被你挡下，只疼了一下。`
              : `${foe.nickname}的${MOVE_LABEL[foeMove]}击中你，-${foeRes.damage}。`,
            "foe",
          );
        } else if (foeRes.evaded) {
          push(`你低头闪过${foe.nickname}的${MOVE_LABEL[foeMove]}，台下叫好。`, "you");
        } else {
          push(`${foe.nickname}的${MOVE_LABEL[foeMove]}擦着耳边飞过。`, "system");
        }
      } else if (!youAttack) {
        push(foeMove === "block" ? `${foe.nickname}收肩护住面门。` : `${foe.nickname}跳着步子，等你露出破绽。`, "foe");
      }
    }

    const youFx =
      move === "block"
        ? "guard"
        : move === "dodge"
          ? foeAttack && youDodging
            ? "slip"
            : "whiff"
          : foeRes.damage > 0
            ? "hurt"
            : "attack";
    const foeFx =
      foeMove === "block"
        ? "guard"
        : foeMove === "dodge"
          ? youAttack && foeDodging
            ? "slip"
            : "whiff"
          : youRes.damage > 0
            ? "hurt"
            : "attack";

    setYouHp(nextYouHp);
    setFoeHp(nextFoeHp);
    setLog((prev) => [...prev, ...entries]);
    setFx({ key: fx.key + 1, you: youFx, foe: foeFx, youTaken: foeRes.damage, foeTaken: youRes.damage });
    setRound((value) => value + 1);

    const timer = window.setTimeout(() => {
      if (nextFoeHp <= 0 || nextYouHp <= 0) {
        const outcome: Outcome = nextFoeHp <= 0 && nextYouHp <= 0 ? "draw" : nextFoeHp <= 0 ? "win" : "lose";
        setResult(outcome);
        setStage("over");
        if (outcome !== "draw" && !reported.current) {
          reported.current = true;
          onResult(foe.id, outcome, Math.max(1, round - 1));
        }
        setRecord((prev) => {
          const currentRecord = prev[foe.id] ?? { w: 0, l: 0 };
          if (outcome === "win") return { ...prev, [foe.id]: { w: currentRecord.w + 1, l: currentRecord.l } };
          if (outcome === "lose") return { ...prev, [foe.id]: { w: currentRecord.w, l: currentRecord.l + 1 } };
          return prev;
        });
      }
      setBusy(false);
    }, 720);
    timers.current.push(timer);
  };

  const backToSelect = () => {
    clearTimers();
    setStage("select");
    setResult(null);
    setBusy(false);
  };

  return (
    <div
      className="fight-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="fight-shell" role="dialog" aria-modal="true" aria-label="八角笼对打小游戏">
        <header className="fight-head">
          <div>
            <span className="profile-kicker">OCTAGON · 217</span>
            <h2 className="fight-title">
              {mode === "mode"
                ? "八角笼 · 挑个玩法"
                : mode === "online"
                  ? "八角笼 · 联机对打"
                  : stage === "select"
                    ? "八角笼 · 挑个对手"
                    : foe
                      ? `八角笼 · 对战${foe.nickname}`
                      : "八角笼"}
            </h2>
          </div>
          {mode === "online" && onlineInside ? null : (
            <button className="icon-btn" onClick={onClose} aria-label="离开八角笼">
              ×
            </button>
          )}
        </header>

        {mode === "mode" ? (
          <div className="fight-modes">
            <button className="fight-mode-card" onClick={() => setMode("ai")}>
              <span className="fight-mode-badge">1P</span>
              <span className="fight-mode-name">人机对打</span>
              <span className="fight-mode-desc">挑一位住户的影子当对手，由电脑接招，随时开打。</span>
              <span className="fight-mode-cta">选对手</span>
            </button>
            <button className="fight-mode-card online" onClick={() => setMode("online")}>
              <span className="fight-mode-badge">2P</span>
              <span className="fight-mode-name">联机对打</span>
              <span className="fight-mode-desc">走进八角笼等另一位住户，对方一进来就开打。</span>
              <span className="fight-mode-cta">进笼子</span>
            </button>
            <p className="fight-note">联机是两位住户实时对拳 · 人机随时能练手</p>
          </div>
        ) : mode === "online" ? (
          <OnlineFight
            self={self}
            inviteTargets={onlineTargets}
            autoJoin={Boolean(autoJoin)}
            onBack={() => setMode("mode")}
            onClose={onClose}
            onInsideChange={setOnlineInside}
            onNotify={onNotify}
          />
        ) : stage === "select" || !foe ? (
          <div className="fight-select">
            <button className="fight-back" onClick={() => setMode("mode")}>
              ← 换个玩法
            </button>
            {opponents.length === 0 ? (
              <div className="empty-state">
                <p>屋里还没有别的住户可以切磋。</p>
                <p className="fineprint">等朋友进来，或者把自己的小人捏好先。</p>
              </div>
            ) : (
              opponents.map((fighter) => {
                const rec = record[fighter.id];
                return (
                  <button key={fighter.id} className="fighter-choice" onClick={() => startFight(fighter.id)}>
                    <span className="fighter-portrait">
                      <PixelPortrait look={fighter.look ?? fallbackLook(fighter.id)} />
                    </span>
                    <span className="fighter-name">{fighter.nickname}</span>
                    <span className="fighter-taunt">{fighter.nickname}：来吧，点到为止。</span>
                    <span className="fighter-record">{rec ? `战绩 ${rec.w} 胜 ${rec.l} 负` : "初次交手"}</span>
                    <span className="fighter-cta">开打</span>
                  </button>
                );
              })
            )}
            <p className="fight-note">纯属屋内的友好切磋 · 打完会加一点好感度 · 战绩记在这台设备上</p>
          </div>
        ) : (
          <div className="fight-stage" aria-busy={busy}>
            <div className="fight-scoreboard">
              <div className="fight-side">
                <span className="fight-name">你</span>
                <div className="hp-track">
                  <div className={`hp-fill ${hpTone(youHp)}`} style={{ width: `${youHp}%` }} />
                </div>
                <span className="hp-num">{youHp} / 100</span>
              </div>
              <span className="fight-round">ROUND {round}</span>
              <div className="fight-side right">
                <span className="fight-name">{foe.nickname}</span>
                <div className="hp-track">
                  <div className={`hp-fill ${hpTone(foeHp)}`} style={{ width: `${foeHp}%` }} />
                </div>
                <span className="hp-num">{foeHp} / 100</span>
              </div>
            </div>

            <div className="fight-arena">
              <div className="fight-fence" aria-hidden="true" />
              <div className="fight-mat" aria-hidden="true">
                <span className="fight-logo">217</span>
              </div>
              <span className="fight-pad left" aria-hidden="true" />
              <span className="fight-pad right" aria-hidden="true" />
              <span className="fight-vs" aria-hidden="true">
                VS
              </span>
              <div className="fight-fighters">
                <div className="fight-slot left">
                  <div className="fight-sprite-wrap" key={`you-${fx.key}`} data-fx={fx.you}>
                    <FighterCanvas look={self.look} dir="right" />
                    {fx.youTaken > 0 ? <span className="fight-dmg">-{fx.youTaken}</span> : null}
                  </div>
                </div>
                <div className="fight-slot right">
                  <div className="fight-sprite-wrap" key={`foe-${fx.key}`} data-fx={fx.foe}>
                    <FighterCanvas look={foeLook} dir="left" />
                    {fx.foeTaken > 0 ? <span className="fight-dmg">-{fx.foeTaken}</span> : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="fight-log" ref={logRef} aria-live="polite">
              {log.map((entry) => (
                <p key={entry.id} className={`log-${entry.tone}`}>
                  {entry.text}
                </p>
              ))}
            </div>

            <div className="fight-moves">
              {MOVES.map((item) => (
                <button key={item.id} className="move-btn" disabled={busy || stage === "over"} onClick={() => playRound(item.id)}>
                  <span className="move-label">{item.label}</span>
                  <span className="move-hint">{item.hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === "ai" && stage === "over" && result && foe ? (
          <div className="fight-result" role="status">
            <p className="fight-result-kicker">
              ROUND {Math.max(1, round - 1)} · {RESULT_COPY[result].kicker}
            </p>
            <h3>{RESULT_COPY[result].title}</h3>
            <p className="fight-result-line">{RESULT_COPY[result].line(foe.nickname)}</p>
            {result === "draw" ? <p className="fineprint">平局不记好感，改天再分胜负。</p> : null}
            <div className="fight-result-actions">
              <button className="pixel-btn primary" onClick={() => startFight(foe.id)}>
                再战
              </button>
              <button className="pixel-btn" onClick={backToSelect}>
                换个对手
              </button>
              <button className="pixel-btn" onClick={onClose}>
                回房间
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
