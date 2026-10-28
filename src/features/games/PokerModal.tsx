import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorText } from "../../net/api";
import type { PokerTable } from "../../net/types";
import { Panel } from "../../ui/Panel";

type PokerModalProps = { onClose: () => void };

const PHASE_LABEL: Record<PokerTable["phase"], string> = {
  waiting: "等人入座",
  preflop: "翻牌前",
  flop: "翻牌圈",
  turn: "转牌圈",
  river: "河牌圈",
  showdown: "摊牌",
};

const SEAT_POSITIONS = [
  { left: "50%", top: "92%" },
  { left: "20%", top: "82%" },
  { left: "6%", top: "52%" },
  { left: "20%", top: "19%" },
  { left: "50%", top: "8%" },
  { left: "80%", top: "19%" },
  { left: "94%", top: "52%" },
  { left: "80%", top: "82%" },
];

const SUIT_SYMBOL: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

function cardParts(card: string) {
  const suit = card[card.length - 1];
  const rank = card.slice(0, -1);
  return { rank: rank === "T" ? "10" : rank, suit, red: suit === "h" || suit === "d" };
}

function PlayingCard({ card, small = false }: { card: string; small?: boolean }) {
  if (card === "??") {
    return <span className={small ? "poker-card back small" : "poker-card back"}>?</span>;
  }
  const { rank, suit, red } = cardParts(card);
  return (
    <span className={["poker-card", small ? "small" : "", red ? "red" : ""].filter(Boolean).join(" ")}>
      <span className="poker-card-rank">{rank}</span>
      <span className="poker-card-suit">{SUIT_SYMBOL[suit] ?? suit}</span>
    </span>
  );
}

export function PokerModal({ onClose }: PokerModalProps) {
  const [table, setTable] = useState<PokerTable | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [raiseTo, setRaiseTo] = useState(0);
  const fetchedAt = useRef(Date.now());
  const inFlight = useRef(false);
  const mounted = useRef(true);

  const apply = useCallback((next: PokerTable) => {
    setTable(next);
    fetchedAt.current = Date.now();
    setError("");
  }, []);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const result = await api.pokerState();
      if (mounted.current) apply(result.table);
    } catch (caught) {
      if (mounted.current) setError(errorText(caught));
    } finally {
      inFlight.current = false;
    }
  }, [apply]);

  useEffect(() => {
    mounted.current = true;
    void load();
    const poll = window.setInterval(() => void load(), 1200);
    const tick = window.setInterval(() => setClock(Date.now()), 500);
    return () => {
      mounted.current = false;
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [load]);

  const run = async (call: () => Promise<{ table: PokerTable }>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await call();
      if (mounted.current) apply(result.table);
    } catch (caught) {
      if (mounted.current) {
        setError(errorText(caught));
        void load();
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const viewer = table?.viewer;
  const street = table && table.phase !== "waiting" && table.phase !== "showdown";
  const estimatedNow = table ? table.serverNow + (clock - fetchedAt.current) : 0;
  const remaining = table && table.deadline > 0 ? Math.max(0, Math.ceil((table.deadline - estimatedNow) / 1000)) : 0;
  const turnNickname = table && table.turn >= 0 ? table.seats[table.turn]?.nickname ?? "" : "";
  const seated = table ? table.seats.filter((seat) => seat !== null).length : 0;

  useEffect(() => {
    if (viewer?.isTurn && table) {
      const base = table.streetBet === 0 ? table.bigBlind : table.streetBet;
      setRaiseTo(Math.min(viewer.maxRaiseTo, Math.max(viewer.minRaiseTo, base + table.bigBlind)));
    }
  }, [viewer?.isTurn, table?.handNo, table?.streetBet, viewer?.minRaiseTo, viewer?.maxRaiseTo, table?.bigBlind]);

  const rotation = viewer?.seat ?? 0;
  const shownPot = table?.phase === "showdown" ? table.result?.total ?? 0 : table?.pot ?? 0;

  return (
    <Panel kicker="TEXAS HOLD'EM · 217" title="客厅德州" wide onClose={onClose}>
      <div className="poker-top">
        <span className="poker-chip-stat">盲注 {table?.smallBlind ?? 10} / {table?.bigBlind ?? 20}</span>
        <span className="poker-chip-stat">第 {table?.handNo ?? 0} 手</span>
        <span className="poker-chip-stat">{seated} / 8 人</span>
        <span className="poker-chip-stat phase">{table ? PHASE_LABEL[table.phase] : "连接中"}</span>
        {table && street && table.turn >= 0 ? (
          <span className="poker-chip-stat clock">
            {turnNickname} 行动 · {remaining}s
          </span>
        ) : null}
      </div>

      <div className="poker-felt">
        <div className="poker-center">
          <div className="poker-board" aria-label="公共牌">
            {Array.from({ length: 5 }, (_, index) => {
              const card = table?.board[index];
              return card ? <PlayingCard key={index} card={card} /> : <span key={index} className="poker-card empty" />;
            })}
          </div>
          <div className="poker-pot">
            <span>底池</span>
            <strong>{shownPot}</strong>
          </div>
          {table?.phase === "showdown" && table.result ? (
            <div className="poker-result">
              <p>{table.result.text}</p>
              <span>下一手 {remaining}s</span>
            </div>
          ) : table?.phase === "waiting" ? (
            <div className="poker-result muted">
              <p>{seated >= 2 ? "人数够了，准备开局" : "再坐一位住户就能开局"}</p>
              <span>2 人即可开局</span>
            </div>
          ) : null}
        </div>

        {SEAT_POSITIONS.map((position, displayIndex) => {
          const seatIndex = table ? (displayIndex + rotation) % 8 : displayIndex;
          const seat = table?.seats[seatIndex] ?? null;
          const isTurn = Boolean(table && seat && table.turn === seatIndex && street);
          const isDealer = Boolean(table && seat && table.dealer === seatIndex);
          const mine = Boolean(seat && seat.id === (viewer?.seat != null ? table?.seats[viewer.seat]?.id : undefined));
          return (
            <div
              key={seatIndex}
              className={[
                "poker-seat",
                seat ? "" : "empty",
                isTurn ? "turn" : "",
                seat?.folded ? "folded" : "",
                mine ? "mine" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ left: position.left, top: position.top }}
            >
              {seat ? (
                <>
                  <span className="poker-seat-cards">
                    {seat.cards.length ? (
                      seat.cards.map((card, index) => <PlayingCard key={index} card={card} small />)
                    ) : (
                      <span className="poker-seat-out">{seat.inHand ? "…" : "在等下一手"}</span>
                    )}
                  </span>
                  <span className="poker-seat-name">
                    {isDealer ? <em>D</em> : null}
                    {seat.nickname}
                    {mine ? <i>你</i> : null}
                  </span>
                  <span className="poker-seat-chips">{seat.chips}</span>
                  <span className="poker-seat-note">
                    {seat.folded
                      ? seat.leaving
                        ? "准备离开"
                        : "已弃牌"
                      : seat.allIn
                        ? "全下"
                        : seat.bet > 0
                          ? `已下注 ${seat.bet}`
                          : seat.lastAction || (seat.inHand ? "等待行动" : "旁观")}
                  </span>
                </>
              ) : (
                <span className="poker-seat-empty">空位</span>
              )}
            </div>
          );
        })}
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {(table?.logs.length ?? 0) > 0 ? (
        <ul className="poker-logs">
          {table!.logs.slice(-4).map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      ) : null}

      <div className="poker-actions">
        {!table ? (
          <p className="panel-note">正在把牌桌摆好……</p>
        ) : viewer?.seat == null ? (
          <>
            <p className="poker-hint">
              坐下会拿到 1000 筹码，盲注 10/20；2 人即可开局，最多 8 人。离开时这手牌会弃掉。
            </p>
            <button className="pixel-btn primary" disabled={busy || seated >= 8} onClick={() => void run(api.pokerJoin)}>
              {seated >= 8 ? "牌桌坐满了" : busy ? "正在坐下…" : "坐下打牌"}
            </button>
          </>
        ) : viewer.isTurn ? (
          <>
            <div className="poker-turn-row">
              <span className="poker-your-turn">轮到你 · {remaining}s</span>
              <button className="pixel-btn" disabled={busy} onClick={() => void run(() => api.pokerAction("fold"))}>
                弃牌
              </button>
              <button
                className="pixel-btn primary"
                disabled={busy}
                onClick={() => void run(() => api.pokerAction(viewer.canCheck ? "check" : "call"))}
              >
                {viewer.canCheck ? "过牌" : viewer.toCall >= (table.seats[viewer.seat]?.chips ?? 0) ? `全下跟注 ${viewer.toCall}` : `跟注 ${viewer.toCall}`}
              </button>
            </div>
            {viewer.maxRaiseTo > table.streetBet ? (
              <div className="poker-raise">
                <input
                  className="poker-slider"
                  type="range"
                  min={Math.min(viewer.minRaiseTo, viewer.maxRaiseTo)}
                  max={viewer.maxRaiseTo}
                  step={10}
                  value={Math.min(Math.max(raiseTo, viewer.minRaiseTo), viewer.maxRaiseTo)}
                  onChange={(event) => setRaiseTo(Number(event.target.value))}
                />
                <span className="poker-raise-value">加注到 {Math.min(Math.max(raiseTo, viewer.minRaiseTo), viewer.maxRaiseTo)}</span>
                <div className="poker-raise-quick">
                  <button
                    className="chip-btn"
                    onClick={() => setRaiseTo(Math.min(viewer.maxRaiseTo, viewer.minRaiseTo))}
                  >
                    最小
                  </button>
                  <button
                    className="chip-btn"
                    onClick={() =>
                      setRaiseTo(
                        Math.min(viewer.maxRaiseTo, Math.max(viewer.minRaiseTo, table.streetBet + Math.ceil(table.pot / 2 / 10) * 10)),
                      )
                    }
                  >
                    半池
                  </button>
                  <button
                    className="chip-btn"
                    onClick={() =>
                      setRaiseTo(Math.min(viewer.maxRaiseTo, Math.max(viewer.minRaiseTo, table.streetBet + Math.ceil(table.pot / 10) * 10)))
                    }
                  >
                    满池
                  </button>
                  <button className="chip-btn allin" onClick={() => setRaiseTo(viewer.maxRaiseTo)}>
                    全下
                  </button>
                </div>
                <button
                  className="pixel-btn primary"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      api.pokerAction(
                        "raise",
                        Math.min(Math.max(raiseTo, viewer.minRaiseTo), viewer.maxRaiseTo),
                      ),
                    )
                  }
                >
                  加注
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="poker-wait-row">
              <span className="poker-hint">
                {viewer.leaving
                  ? "这手结束后就离开牌桌。"
                  : viewer.inHand
                    ? street && table.turn >= 0
                      ? `等 ${turnNickname} 行动 · ${remaining}s`
                      : "本手结束，稍等下一手"
                    : table.seats[viewer.seat]?.chips === 0
                      ? "筹码输光了，重新买入继续。"
                      : "你在旁观这一手，下一手自动入局。"}
              </span>
              {viewer.leaving ? null : table.seats[viewer.seat]?.chips === 0 ? (
                <button className="pixel-btn primary" disabled={busy} onClick={() => void run(api.pokerRebuy)}>
                  重新买入 1000
                </button>
              ) : null}
              {viewer.leaving || table.phase !== "waiting" ? null : (
                <button
                  className="pixel-btn"
                  disabled={busy || seated < 2}
                  onClick={() => void run(api.pokerStart)}
                >
                  开始下一手
                </button>
              )}
              {viewer.leaving ? null : (
                <button className="pixel-btn danger" disabled={busy} onClick={() => void run(api.pokerLeave)}>
                  离开牌桌
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
