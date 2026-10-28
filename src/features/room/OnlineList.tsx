import { useEffect, useRef, useState } from "react";
import { fallbackLook } from "../../game/looks";
import type { CharacterLook } from "../../game/types";
import type { Role } from "../../net/types";
import { PixelPortrait } from "../../ui/PixelPortrait";

export type OnlineResident = {
  id: string;
  nickname: string;
  role: Role;
  look: CharacterLook | null;
};

type OnlineListProps = {
  selfId: string;
  residents: OnlineResident[];
  onlineCount: number;
  memberCount: number;
  offline: boolean;
  onSelect: (id: string) => void;
};

export function OnlineList({
  selfId,
  residents,
  onlineCount,
  memberCount,
  offline,
  onSelect,
}: OnlineListProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (offline) setOpen(false);
  }, [offline]);

  return (
    <div className="status-wrap" ref={wrapRef}>
      <button
        type="button"
        className={open ? "status status-toggle open" : "status status-toggle"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        disabled={offline}
      >
        <span className={offline ? "status-dot offline" : "status-dot"} aria-hidden="true" />
        {offline ? "离线 · 自在小逛" : `${memberCount} 位住户 · 在线 ${onlineCount}`}
        {offline ? null : (
          <span className="status-caret" aria-hidden="true">
            ▾
          </span>
        )}
      </button>

      {open && !offline ? (
        <div className="online-pop" role="dialog" aria-label="在线住户">
          <p className="online-pop-head">此刻在屋里 · {onlineCount} 人</p>
          <ul className="online-list">
            {residents.map((resident) => (
              <li key={resident.id}>
                <button
                  type="button"
                  className="online-item"
                  onClick={() => {
                    setOpen(false);
                    onSelect(resident.id);
                  }}
                >
                  <span className="online-avatar">
                    <PixelPortrait
                      look={resident.look ?? fallbackLook(resident.id)}
                      label={`${resident.nickname}的头像`}
                      size={28}
                    />
                  </span>
                  <span className="online-name">{resident.nickname}</span>
                  {resident.id === selfId ? <span className="online-badge me">我</span> : null}
                  {resident.role === "owner" ? <span className="online-badge owner">站长</span> : null}
                </button>
              </li>
            ))}
          </ul>
          {residents.length <= 1 ? <p className="online-empty">现在只有你在屋里，等大家回来。</p> : null}
        </div>
      ) : null}
    </div>
  );
}
