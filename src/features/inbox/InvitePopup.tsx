import { useEffect, useState } from "react";
import { fallbackLook } from "../../game/looks";
import { PixelPortrait } from "../../ui/PixelPortrait";
import type { InboxInviteAlert } from "../../net/types";

type InvitePopupProps = {
  invite: InboxInviteAlert;
  extraCount: number;
  onAccept: () => void;
  onLater: () => void;
};

function leftLabel(expiresAt: string | null): string {
  if (!expiresAt) return "10 分钟内有效";
  const remain = Date.parse(expiresAt) - Date.now();
  if (!Number.isFinite(remain) || remain <= 0) return "已经过期";
  return `还剩约 ${Math.max(1, Math.ceil(remain / 60_000))} 分钟`;
}

export function InvitePopup({ invite, extraCount, onAccept, onLater }: InvitePopupProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 20_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <aside className="invite-pop" role="dialog" aria-label="八角笼约战邀请">
      <div className="invite-pop-head">
        <span className="invite-pop-avatar">
          <PixelPortrait
            look={invite.from.look ?? fallbackLook(invite.from.id)}
            label={`${invite.from.nickname}的头像`}
            size={30}
          />
        </span>
        <div className="invite-pop-text">
          <p className="invite-pop-kicker">OCTAGON · 约战</p>
          <p className="invite-pop-name">{invite.from.nickname} 邀你进八角笼</p>
        </div>
      </div>
      <p className="invite-pop-note">{leftLabel(invite.expiresAt)} · 接受后直接进笼</p>
      {extraCount > 0 ? <p className="invite-pop-extra">还有 {extraCount} 条邀请在消息里</p> : null}
      <div className="invite-pop-actions">
        <button className="pixel-btn primary" onClick={onAccept}>
          接受
        </button>
        <button className="pixel-btn" onClick={onLater}>
          稍后
        </button>
      </div>
    </aside>
  );
}
