import { useEffect, useRef, useState } from "react";
import { api, errorText } from "../../net/api";
import type { RpsResult } from "../../net/types";
import { Panel } from "../../ui/Panel";

type Move = "rock" | "paper" | "scissors";
type Entry = { you: Move; house: Move; result: RpsResult["result"] };

const MOVES: { id: Move; label: string; glyph: string; hint: string }[] = [
  { id: "rock", label: "石头", glyph: "石", hint: "压住剪刀" },
  { id: "paper", label: "布", glyph: "布", hint: "包住石头" },
  { id: "scissors", label: "剪刀", glyph: "剪", hint: "剪开布" },
];

const MOVE_LABEL: Record<Move, string> = { rock: "石头", paper: "布", scissors: "剪刀" };
const RESULT_LABEL: Record<RpsResult["result"], string> = { win: "你赢了这局", lose: "小屋赢了这局", draw: "平局" };

type RpsModalProps = { onClose: () => void };

export function RpsModal({ onClose }: RpsModalProps) {
  const [score, setScore] = useState({ you: 0, house: 0 });
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

  const play = async (move: Move) => {
    if (busy || over) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.rps(move);
      if (!mounted.current) return;
      const entry: Entry = { you: move, house: result.house, result: result.result };
      setCurrent(entry);
      setEntries((list) => [entry, ...list].slice(0, 6));
      const next = {
        you: score.you + (result.result === "win" ? 1 : 0),
        house: score.house + (result.result === "lose" ? 1 : 0),
      };
      setScore(next);
      if (next.you >= 2) setOver("win");
      else if (next.house >= 2) setOver("lose");
    } catch (caught) {
      if (mounted.current) setError(errorText(caught));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const restart = () => {
    setScore({ you: 0, house: 0 });
    setEntries([]);
    setCurrent(null);
    setOver(null);
    setError("");
  };

  return (
    <Panel kicker="ROCK · PAPER · SCISSORS" title="和 217 猜拳" onClose={onClose}>
      <div className="rps-score" aria-label={`比分 你 ${score.you} 比 ${score.house} 小屋`}>
        <span>
          你 <strong>{score.you}</strong>
        </span>
        <span className="rps-vs">三局两胜</span>
        <span>
          小屋 <strong>{score.house}</strong>
        </span>
      </div>

      <div className="rps-stage">
        <div className="rps-side">
          <span className="rps-name">你</span>
          <div className={current ? "rps-hand shown" : "rps-hand"}>{current ? MOVE_LABEL[current.you].slice(0, 1) : "?"}</div>
        </div>
        <span className="rps-mid">{current ? RESULT_LABEL[current.result] : "出什么？"}</span>
        <div className="rps-side">
          <span className="rps-name">小屋</span>
          <div className={current ? "rps-hand shown house" : "rps-hand house"}>{current ? MOVE_LABEL[current.house].slice(0, 1) : "?"}</div>
        </div>
      </div>

      {over ? (
        <div className="rps-over" role="status">
          <h3>{over === "win" ? "你赢下了这一场" : "小屋守住了擂台"}</h3>
          <p className="fineprint">{over === "win" ? "手气不错，去鱼缸那边再试试？" : "再来一场，把场子找回来。"}</p>
          <button className="pixel-btn primary" onClick={restart}>
            重新开始
          </button>
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

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <p className="fineprint">每局由小屋服务端当场判定，战绩只留在游戏记录里，不会影响好感度。</p>

      {entries.length ? (
        <ul className="rps-history">
          {entries.map((entry, index) => (
            <li key={`${entry.you}-${entry.house}-${index}`}>
              {MOVE_LABEL[entry.you]} 对 {MOVE_LABEL[entry.house]} · {RESULT_LABEL[entry.result]}
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}
