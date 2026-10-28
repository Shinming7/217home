import { useEffect, useRef, useState } from "react";
import { api, errorText } from "../../net/api";
import type { RpsResult } from "../../net/types";
import { Panel } from "../../ui/Panel";

type Move = "rock" | "paper" | "scissors";
type Entry = { you: Move; foe: Move; result: RpsResult["result"] };
type Opponent = { id: string; nickname: string };

const MOVES: { id: Move; label: string; glyph: string; hint: string }[] = [
  { id: "rock", label: "石头", glyph: "石", hint: "压住剪刀" },
  { id: "paper", label: "布", glyph: "布", hint: "包住石头" },
  { id: "scissors", label: "剪刀", glyph: "剪", hint: "剪开布" },
];

const MOVE_LABEL: Record<Move, string> = { rock: "石头", paper: "布", scissors: "剪刀" };

type RpsModalProps = { opponents: Opponent[]; onClose: () => void };

export function RpsModal({ opponents, onClose }: RpsModalProps) {
  const [foe, setFoe] = useState<Opponent | null>(null);
  const [score, setScore] = useState({ you: 0, foe: 0 });
  const [entries, setEntries] = useState<Entry[]>([]);
  const [current, setCurrent] = useState<Entry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [over, setOver] = useState<"win" | "lose" | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reset = () => {
    setScore({ you: 0, foe: 0 });
    setEntries([]);
    setCurrent(null);
    setOver(null);
    setError("");
  };

  const choose = (opponent: Opponent) => {
    setFoe(opponent);
    reset();
  };

  const play = async (move: Move) => {
    if (busy || over || !foe) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.rps(move, foe.id);
      if (!mounted.current) return;
      const entry: Entry = { you: move, foe: result.house, result: result.result };
      setCurrent(entry);
      setEntries((list) => [entry, ...list].slice(0, 6));
      const next = {
        you: score.you + (result.result === "win" ? 1 : 0),
        foe: score.foe + (result.result === "lose" ? 1 : 0),
      };
      setScore(next);
      if (next.you >= 2) setOver("win");
      else if (next.foe >= 2) setOver("lose");
    } catch (caught) {
      if (mounted.current) setError(errorText(caught));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  if (!foe) {
    return (
      <Panel kicker="ROCK · PAPER · SCISSORS" title="和谁猜拳？" onClose={onClose}>
        <p className="panel-note">
          选一位住户当对手。这局由她的人机应战，不需要对方在线，也不会增加好感度。
        </p>
        {opponents.length ? (
          <div className="rps-pick">
            {opponents.map((opponent) => (
              <button key={opponent.id} className="rps-pick-btn" onClick={() => choose(opponent)}>
                <span className="rps-pick-name">{opponent.nickname}</span>
                <span className="rps-pick-hint">接受挑战</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>屋里还没有别的住户。</p>
            <p className="fineprint">等朋友进来安家，就能挑对手猜拳了。</p>
          </div>
        )}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </Panel>
    );
  }

  return (
    <Panel kicker="ROCK · PAPER · SCISSORS" title={`和 ${foe.nickname} 猜拳`} onClose={onClose}>
      <div className="rps-score" aria-label={`比分 你 ${score.you} 比 ${score.foe} ${foe.nickname}`}>
        <span>
          你 <strong>{score.you}</strong>
        </span>
        <span className="rps-vs">三局两胜</span>
        <span>
          {foe.nickname} <strong>{score.foe}</strong>
        </span>
      </div>

      <div className="rps-stage">
        <div className="rps-side">
          <span className="rps-name">你</span>
          <div className={current ? "rps-hand shown" : "rps-hand"}>{current ? MOVE_LABEL[current.you].slice(0, 1) : "?"}</div>
        </div>
        <span className="rps-mid">
          {current
            ? current.result === "win"
              ? "你赢了这局"
              : current.result === "lose"
                ? `${foe.nickname} 赢了这局`
                : "平局"
            : "出什么？"}
        </span>
        <div className="rps-side">
          <span className="rps-name">{foe.nickname}</span>
          <div className={current ? "rps-hand house shown" : "rps-hand house"}>
            {current ? MOVE_LABEL[current.foe].slice(0, 1) : "?"}
          </div>
        </div>
      </div>

      {over ? (
        <div className="rps-over" role="status">
          <h3>{over === "win" ? `你赢下了 ${foe.nickname}` : `${foe.nickname} 守住了擂台`}</h3>
          <p className="fineprint">
            {over === "win" ? "手气不错，去鱼缸那边再试试？" : "再来一场，把场子找回来。"}
          </p>
          <div className="rps-over-actions">
            <button className="pixel-btn primary" onClick={reset}>
              再来一场
            </button>
            <button className="pixel-btn" onClick={() => setFoe(null)}>
              换对手
            </button>
          </div>
        </div>
      ) : (
        <div className="rps-actions">
          {MOVES.map((move) => (
            <button key={move.id} className="rps-btn" disabled={busy} onClick={() => void play(move.id)}>
              <span className="rps-glyph">{move.glyph}</span>
              <span className="rps-label">{move.label}</span>
              <span className="rps-hint">{move.hint}</span>
            </button>
          ))}
        </div>
      )}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="fineprint">对手由小屋 AI 应战，战绩只留在游戏记录里，不会影响好感度。</p>

      {entries.length ? (
        <ul className="rps-history">
          {entries.map((entry, index) => (
            <li key={`${entry.you}-${entry.foe}-${index}`}>
              {MOVE_LABEL[entry.you]} 对 {MOVE_LABEL[entry.foe]} ·{" "}
              {entry.result === "win" ? "你赢" : entry.result === "lose" ? `${foe.nickname} 赢` : "平局"}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="rps-switch">
        <button className="pixel-btn" onClick={() => setFoe(null)}>
          换一位对手
        </button>
      </div>
    </Panel>
  );
}
