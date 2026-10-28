import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorText } from "../../net/api";
import { fallbackLook } from "../../game/looks";
import { PixelPortrait } from "../../ui/PixelPortrait";
import { FighterCanvas } from "./FighterCanvas";
import type { CharacterLook } from "../../game/types";
import type { FightMoveView, OnlineFightFighter, OnlineFightOutcome, OnlineFightView } from "../../net/types";

type InviteTarget = { id: string; nickname: string; look: CharacterLook | null };

type OnlineFightProps = {
  self: { id: string; nickname: string; look: CharacterLook };
  inviteTargets: InviteTarget[];
  autoJoin?: boolean;
  onBack: () => void;
  onClose: () => void;
  onInsideChange: (inside: boolean) => void;
  onNotify: (text: string, warn?: boolean) => void;
};

const MOVES: { id: FightMoveView; label: string; hint: string }[] = [
  { id: "jab", label: "直拳", hint: "准 · 10~13" },
  { id: "hook", label: "摆拳", hint: "重 · 18~24" },
  { id: "block", label: "格挡", hint: "减伤 70%" },
  { id: "dodge", label: "闪避", hint: "70% 躲开" },
];

const MOVE_LABEL: Record<FightMoveView, string> = { jab: "直拳", hook: "摆拳", block: "格挡", dodge: "闪避" };

function hpTone(hp: number): string {
  if (hp > 55) return "ok";
  if (hp > 25) return "warn";
  return "danger";
}

function lookOf(fighter: OnlineFightFighter | null): CharacterLook {
  return fighter?.look ?? fallbackLook(fighter?.id ?? "217");
}

function fxOf(fighter: OnlineFightFighter | null): string {
  if (!fighter || !fighter.lastMove) return "";
  if (fighter.taken > 0) return "hurt";
  if (fighter.lastMove === "block") return "guard";
  if (fighter.lastMove === "dodge") return "slip";
  return fighter.dealt > 0 ? "attack" : "whiff";
}

function resultCopy(outcome: OnlineFightOutcome, selfId: string) {
  if (outcome.draw) {
    return {
      kicker: "DOUBLE K.O.",
      title: "平局",
      line: "两人一起坐在垫子上喘气。",
      bonus: "平局不记好感，改天再分胜负。",
    };
  }
  const won = outcome.winnerId === selfId;
  if (outcome.walkover) {
    return won
      ? {
          kicker: "WALKOVER",
          title: "对手离场",
          line: `${outcome.loserName ?? "对手"}先离开了八角笼，这局判你赢。`,
          bonus: "离场判胜不记好感。",
        }
      : {
          kicker: "WALKOVER",
          title: "提前离场",
          line: "你离开了八角笼，这局判对手赢。",
          bonus: "离场判负不记好感。",
        };
  }
  return won
    ? {
        kicker: "K.O. · YOU WIN",
        title: "胜利",
        line: `${outcome.loserName ?? "对手"}扶着围栏笑：这拳算你狠。`,
        bonus: "和对手各加一点好感（今天第一次交手才有）。",
      }
    : {
        kicker: "K.O. · YOU LOSE",
        title: "惜败",
        line: `${outcome.winnerName ?? "对手"}伸手拉你起来：明天再来。`,
        bonus: "和对手各加一点好感（今天第一次交手才有）。",
      };
}

export function OnlineFight({
  self,
  inviteTargets,
  autoJoin,
  onBack,
  onClose,
  onInsideChange,
  onNotify,
}: OnlineFightProps) {
  const [fight, setFight] = useState<OnlineFightView | null>(null);
  const [warning, setWarning] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(() => Date.now());
  const [fxKey, setFxKey] = useState(0);
  const [leaveArmed, setLeaveArmed] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [invited, setInvited] = useState<string[]>([]);
  const offsetRef = useRef(0);
  const insideRef = useRef(false);
  const resolvedRef = useRef(0);
  const autoTried = useRef(false);
  const leaveTimer = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    let timer = 0;
    const load = async () => {
      try {
        const { fight: next } = await api.fightOnlineState();
        if (!alive) return;
        offsetRef.current = next.serverNow - Date.now();
        setFight(next);
        setWarning("");
      } catch (error) {
        if (!alive) return;
        setWarning(errorText(error));
      } finally {
        if (alive) timer = window.setTimeout(load, 1200);
      }
    };
    void load();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setLeaveArmed(false), 3500);
    return () => window.clearTimeout(timer);
  }, [leaveArmed]);

  useEffect(() => {
    const inside = Boolean(fight?.viewer.inside);
    insideRef.current = inside;
    onInsideChange(inside);
  }, [fight?.viewer.inside, onInsideChange]);

  useEffect(
    () => () => {
      if (!insideRef.current) return;
      insideRef.current = false;
      void api.fightOnlineLeave().catch(() => {});
    },
    [],
  );

  useEffect(() => {
    if (!fight) return;
    if (fight.resolvedRound === 0) {
      resolvedRef.current = 0;
      return;
    }
    if (fight.resolvedRound === resolvedRef.current) return;
    resolvedRef.current = fight.resolvedRound;
    setFxKey((value) => value + 1);
  }, [fight]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [fight?.logs]);

  const run = useCallback(async (action: () => Promise<{ fight: OnlineFightView }>) => {
    setBusy(true);
    setWarning("");
    try {
      const { fight: next } = await action();
      offsetRef.current = next.serverNow - Date.now();
      setFight(next);
      return next;
    } catch (error) {
      setWarning(errorText(error));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!autoJoin || autoTried.current || !fight) return;
    if (fight.viewer.inside) {
      autoTried.current = true;
      return;
    }
    if (fight.phase !== "waiting" || fight.fighters.length >= 2) {
      autoTried.current = true;
      return;
    }
    autoTried.current = true;
    void run(api.fightOnlineJoin);
  }, [autoJoin, fight, run]);

  const join = () => {
    if (busy) return;
    void run(api.fightOnlineJoin);
  };

  const sendInvite = async (target: InviteTarget) => {
    if (inviting || invited.includes(target.id)) return;
    setInviting(target.id);
    try {
      await api.inviteToFight(target.id);
      setInvited((current) => [...current, target.id]);
      onNotify(`约战邀请已经送到 ${target.nickname} 的信箱`);
    } catch (error) {
      onNotify(errorText(error), true);
    } finally {
      setInviting(null);
    }
  };

  const submit = (move: FightMoveView) => {
    if (busy || !fight?.viewer.canMove) return;
    void run(() => api.fightOnlineMove(move));
  };

  const handleLeave = () => {
    if (busy) return;
    if (!leaveArmed) {
      setLeaveArmed(true);
      return;
    }
    setLeaveArmed(false);
    insideRef.current = false;
    onInsideChange(false);
    void api.fightOnlineLeave()
      .then(({ fight: next }) => {
        offsetRef.current = next.serverNow - Date.now();
        setFight(next);
      })
      .catch((error) => setWarning(errorText(error)));
  };

  const closeAndLeave = () => {
    insideRef.current = false;
    onInsideChange(false);
    void api.fightOnlineLeave().catch(() => {});
    onClose();
  };

  if (!fight) {
    return (
      <div className="online-loading">
        <p>正在推开八角笼的门…</p>
        {warning ? <p className="online-warning" role="alert">{warning}</p> : null}
      </div>
    );
  }

  const me = fight.fighters.find((fighter) => fighter.id === self.id) ?? null;
  const foe = fight.fighters.find((fighter) => fighter.id !== self.id) ?? null;
  const foeLook = lookOf(foe);
  const remain = fight.deadline > 0
    ? Math.max(0, Math.ceil((fight.deadline - (tick + offsetRef.current)) / 1000))
    : 0;
  const waitingFighter = fight.fighters[0] ?? null;

  if ((fight.phase === "fight" || fight.phase === "over") && me) {
    const submitted = fight.viewer.submitted;
    return (
      <>
        <div className="fight-stage online-stage" aria-busy={busy}>
          <div className="fight-scoreboard">
            <div className="fight-side">
              <span className="fight-name">你</span>
              <div className="hp-track">
                <div className={`hp-fill ${hpTone(me.hp)}`} style={{ width: `${me.hp}%` }} />
              </div>
              <span className="hp-num">{me.hp} / 100</span>
            </div>
            <span className={remain <= 5 ? "fight-round urgent" : "fight-round"}>ROUND {fight.round} · {remain}s</span>
            <div className="fight-side right">
              <span className="fight-name">{foe?.nickname ?? "对手"}</span>
              <div className="hp-track">
                <div className={`hp-fill ${hpTone(foe?.hp ?? 0)}`} style={{ width: `${foe?.hp ?? 0}%` }} />
              </div>
              <span className="hp-num">{foe?.hp ?? 0} / 100</span>
            </div>
          </div>

          <div className="fight-arena">
            <div className="fight-fence" aria-hidden="true" />
            <div className="fight-mat" aria-hidden="true">
              <span className="fight-logo">217</span>
            </div>
            <span className="fight-pad left" aria-hidden="true" />
            <span className="fight-pad right" aria-hidden="true" />
            <span className="fight-vs" aria-hidden="true">VS</span>
            <div className="fight-fighters">
              <div className="fight-slot left">
                <div className="fight-sprite-wrap" key={`you-${fxKey}`} data-fx={fxOf(me)}>
                  <FighterCanvas look={self.look} dir="right" />
                  {me.taken > 0 ? <span className="fight-dmg">-{me.taken}</span> : null}
                </div>
              </div>
              <div className="fight-slot right">
                <div className="fight-sprite-wrap" key={`foe-${fxKey}`} data-fx={fxOf(foe)}>
                  <FighterCanvas look={foeLook} dir="left" />
                  {foe && foe.taken > 0 ? <span className="fight-dmg">-{foe.taken}</span> : null}
                </div>
              </div>
            </div>
          </div>

          <div className="online-turn">
            <span>{submitted ? `你已出招：${MOVE_LABEL[fight.viewer.move ?? "block"]} · 等对手` : "选一招，双方同时出拳"}</span>
            <span className={foe?.submitted ? "online-foe ready" : "online-foe"}>
              {foe ? (foe.submitted ? "对手已出招" : "对手还在想") : "对手已离场"}
            </span>
          </div>

          <div className="fight-log" ref={logRef} aria-live="polite">
            {fight.logs.slice(-7).map((entry, index) => (
              <p key={`${index}-${entry.text}`} className={`log-${entry.by === self.id ? "you" : entry.by ? "foe" : "system"}`}>
                {entry.text}
              </p>
            ))}
          </div>

          <div className="fight-moves">
            {MOVES.map((item) => (
              <button
                key={item.id}
                className={fight.viewer.move === item.id ? "move-btn picked" : "move-btn"}
                disabled={busy || !fight.viewer.canMove}
                onClick={() => submit(item.id)}
              >
                <span className="move-label">{item.label}</span>
                <span className="move-hint">{item.hint}</span>
              </button>
            ))}
          </div>

          <div className="online-foot">
            <button className={leaveArmed ? "pixel-btn danger" : "pixel-btn"} onClick={handleLeave} disabled={busy}>
              {leaveArmed ? "再点一次离开（判负）" : "离开八角笼"}
            </button>
            <p className="fineprint">出招后不能改 · 掉线或离开会判负</p>
          </div>

          {warning ? <p className="online-warning" role="alert">{warning}</p> : null}
        </div>

        {fight.phase === "over" && fight.over ? <ResultOverlay outcome={fight.over} selfId={self.id} remain={remain} onClose={closeAndLeave} /> : null}
      </>
    );
  }

  if (fight.phase === "fight") {
    const first = fight.fighters[0];
    const second = fight.fighters[1];
    return (
      <div className="online-lobby">
        <button className="fight-back" onClick={onBack}>← 换个玩法</button>
        <div className="online-lobby-card">
          <p className="online-lobby-kicker">八角笼使用中</p>
          <div className="online-lobby-vs">
            <span>{first?.nickname ?? "？？"}</span>
            <i>VS</i>
            <span>{second?.nickname ?? "？？"}</span>
          </div>
          <p className="online-lobby-line">第 {fight.round} 回合 · 还剩 {remain} 秒</p>
          <div className="online-lobby-hp">
            {fight.fighters.map((fighter) => (
              <div key={fighter.id} className="online-hp-row">
                <span>{fighter.nickname}</span>
                <div className="hp-track">
                  <div className={`hp-fill ${hpTone(fighter.hp)}`} style={{ width: `${fighter.hp}%` }} />
                </div>
                <span className="hp-num">{fighter.hp}</span>
              </div>
            ))}
          </div>
          <p className="fineprint">等这一场打完，笼子空出来再进去。</p>
        </div>
        {warning ? <p className="online-warning" role="alert">{warning}</p> : null}
      </div>
    );
  }

  if (fight.phase === "over") {
    return (
      <div className="online-lobby">
        <button className="fight-back" onClick={onBack}>← 换个玩法</button>
        <div className="online-lobby-card">
          <p className="online-lobby-kicker">刚刚收场</p>
          <p className="online-lobby-line">裁判正在收拾笼子，{remain} 秒后可以再进。</p>
          <p className="online-lobby-hint">刚才那场的输赢已经写进记录本。</p>
        </div>
        {warning ? <p className="online-warning" role="alert">{warning}</p> : null}
      </div>
    );
  }

  const inviteBlock = inviteTargets.length > 0 ? (
    <div className="online-invites">
      <p className="online-invites-title">邀请在线住户</p>
      <ul className="online-invite-list">
        {inviteTargets.map((target) => (
          <li key={target.id} className="online-invite-row">
            <span className="online-invite-portrait">
              <PixelPortrait
                look={target.look ?? fallbackLook(target.id)}
                label={`${target.nickname}的头像`}
                size={26}
              />
            </span>
            <span className="online-invite-name">{target.nickname}</span>
            <button
              className="pixel-btn"
              disabled={inviting === target.id || invited.includes(target.id)}
              onClick={() => void sendInvite(target)}
            >
              {invited.includes(target.id) ? "已邀请" : inviting === target.id ? "送信中…" : "约战"}
            </button>
          </li>
        ))}
      </ul>
      <p className="fineprint">邀请会送进对方的信箱，10 分钟内有效；对方接受后会直接走进笼子，和你开打。</p>
    </div>
  ) : null;

  if (fight.viewer.inside) {
    return (
      <div className="online-lobby">
        <div className="online-wait-card">
          <div className="online-wait-portrait">
            <PixelPortrait look={self.look} />
          </div>
          <p className="online-wait-title">你走进了八角笼</p>
          <p className="online-wait-line">等另一位住户推门进来，对方一进来就自动开打。</p>
          <p className="online-wait-dots" aria-hidden="true">· · ·</p>
          <button className={leaveArmed ? "pixel-btn danger" : "pixel-btn"} onClick={handleLeave} disabled={busy}>
            {leaveArmed ? "再点一次离开" : "离开八角笼"}
          </button>
          {warning ? <p className="online-warning" role="alert">{warning}</p> : null}
        </div>
        {inviteBlock}
      </div>
    );
  }

  return (
    <div className="online-lobby">
      <button className="fight-back" onClick={onBack}>← 换个玩法</button>
      <div className="online-lobby-card">
        <p className="online-lobby-kicker">联机对打 · 1v1</p>
        <h3 className="online-lobby-name">
          {waitingFighter ? `${waitingFighter.nickname} 在笼里等你` : "八角笼空着"}
        </h3>
        <p className="online-lobby-line">回合制，双方同时出招，30 秒内定拳。两个人就能开打。</p>
        <div className="online-lobby-fighters">
          <div className="online-lobby-slot">
            <PixelPortrait look={self.look} />
            <span>你</span>
          </div>
          <i>VS</i>
          <div className="online-lobby-slot">
            {waitingFighter ? <PixelPortrait look={lookOf(waitingFighter)} /> : <span className="online-empty-slot">？</span>}
            <span>{waitingFighter ? waitingFighter.nickname : "等对手"}</span>
          </div>
        </div>
        <button className="pixel-btn primary online-join" onClick={join} disabled={busy}>
          {busy ? "推门中…" : waitingFighter ? "进去开打" : "走进八角笼"}
        </button>
        <p className="fineprint">输赢两边都会加好感 · 每天第一次交手才加</p>
      </div>

      {!waitingFighter ? inviteBlock : null}

      {warning ? <p className="online-warning" role="alert">{warning}</p> : null}
    </div>
  );
}

function ResultOverlay({
  outcome,
  selfId,
  remain,
  onClose,
}: {
  outcome: OnlineFightOutcome;
  selfId: string;
  remain: number;
  onClose: () => void;
}) {
  const copy = resultCopy(outcome, selfId);
  return (
    <div className="fight-result" role="status">
      <p className="fight-result-kicker">
        ROUND {outcome.rounds} · {copy.kicker}
      </p>
      <h3>{copy.title}</h3>
      <p className="fight-result-line">{copy.line}</p>
      <p className="fineprint">{copy.bonus}</p>
      <div className="fight-result-actions">
        <button className="pixel-btn" onClick={onClose}>
          回房间
        </button>
      </div>
      <p className="fineprint">裁判 {remain} 秒后清场，想再打就再进来。</p>
    </div>
  );
}
