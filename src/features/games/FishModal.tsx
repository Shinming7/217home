import { useEffect, useRef, useState } from "react";
import { api, errorText } from "../../net/api";
import type { DexEntry, FishInfo, FishResult } from "../../net/types";
import { Panel } from "../../ui/Panel";

const RARITY_TEXT: Record<string, string> = {
  common: "常见",
  uncommon: "少见",
  rare: "稀有",
  epic: "史诗",
  legend: "传说",
  legendary: "传说",
};

const FISH_COLORS = ["#8b9bb4", "#c0cbdc", "#feae34", "#f77622", "#f6757a", "#2ce8f5", "#63c74d", "#b55088"];

type FishModalProps = { onClose: () => void };

export function FishModal({ onClose }: FishModalProps) {
  const [fish, setFish] = useState<FishInfo[]>([]);
  const [collection, setCollection] = useState<DexEntry[]>([]);
  const [result, setResult] = useState<FishResult | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        const dex = await api.dex();
        if (!mounted.current) return;
        setFish(dex.fish);
        setCollection(dex.collection);
      } catch (caught) {
        if (mounted.current) setError(errorText(caught));
      }
    })();
    return () => {
      mounted.current = false;
      window.clearTimeout(timer.current);
    };
  }, []);

  const cast = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    setRevealed(false);
    try {
      const caught = await api.fish();
      if (!mounted.current) return;
      setResult(caught);
      setCollection((current) => {
        const map = new Map(current.map((entry) => [entry.fishId, entry]));
        for (const entry of caught.collection) {
          const existing = map.get(entry.fishId);
          map.set(entry.fishId, {
            fishId: entry.fishId,
            count: entry.count,
            firstAt: existing?.firstAt,
            lastAt: new Date().toISOString(),
          });
        }
        return [...map.values()];
      });
      timer.current = window.setTimeout(() => {
        if (mounted.current) setRevealed(true);
      }, 1300);
    } catch (caught) {
      if (mounted.current) setError(errorText(caught));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const countOf = (id: string) => collection.find((entry) => entry.fishId === id)?.count ?? 0;
  const caughtCount = fish.filter((entry) => countOf(entry.id) > 0).length;

  return (
    <Panel kicker="FISHING · 217" title="鱼缸与鱼图鉴" wide onClose={onClose}>
      <div className="fish-layout">
        <div className="fish-pond">
          <div className={busy ? "fish-water casting" : "fish-water"} aria-hidden="true">
            <span className="fish-bob" />
            <span className="fish-ripple" />
            <span className="fish-ripple second" />
          </div>
          {!revealed || !result ? (
            <div className="fish-status">
              <p>{busy ? "浮标沉下去了……" : result ? "有动静！" : "鱼缸今天很安静。"}</p>
              <button className="pixel-btn primary" onClick={() => void cast()} disabled={busy}>
                {busy ? "等鱼咬钩…" : "抛竿"}
              </button>
            </div>
          ) : (
            <div className="fish-result" role="status">
              {result.caught && result.fish ? (
                <>
                  <span className="fish-stamp">CAUGHT</span>
                  <h3>{result.fish.name}</h3>
                  <p>{RARITY_TEXT[result.fish.rarity] ?? result.fish.rarity} · 已经放进鱼缸</p>
                </>
              ) : (
                <>
                  <span className="fish-stamp empty">GONE</span>
                  <h3>空军</h3>
                  <p>鱼饵被吃掉了，什么也没钓上来。</p>
                </>
              )}
              <button className="pixel-btn" onClick={() => void cast()} disabled={busy}>
                再抛一竿
              </button>
            </div>
          )}
        </div>

        <div className="fish-dex">
          <div className="fish-dex-head">
            <h3>鱼图鉴</h3>
            <span>
              {caughtCount} / {fish.length || 8}
            </span>
          </div>
          <p className="fineprint">每种鱼第一次钓到会记进图鉴，之后可以重复钓。</p>
          <ul className="dex-grid">
            {fish.map((entry, index) => {
              const count = countOf(entry.id);
              const known = count > 0;
              return (
                <li key={entry.id} className={known ? "dex-item known" : "dex-item"}>
                  <span
                    className="dex-fish"
                    style={{ background: known ? FISH_COLORS[index % FISH_COLORS.length] : "#3a4466" }}
                    aria-hidden="true"
                  />
                  <span className="dex-name">{known ? entry.name : "??? "}</span>
                  <span className="dex-status">{known ? `×${count}` : RARITY_TEXT[entry.rarity] ?? entry.rarity}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <p className="fineprint">钓鱼结果由小屋服务端判定并存进图鉴，换设备登录也能看到。</p>
    </Panel>
  );
}
