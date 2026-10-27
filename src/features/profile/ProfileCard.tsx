import { useEffect, useRef } from "react";
import { getCharacterPortrait } from "../../game/character";
import type { NpcSpec } from "../../game/types";

type ProfileCardProps = {
  spec: NpcSpec;
  onClose: () => void;
  onChat: () => void;
};

export function ProfileCard({ spec, onClose, onChat }: ProfileCardProps) {
  const avatarRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = avatarRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 64, 64);
    ctx.drawImage(getCharacterPortrait(spec.look), 0, 0);
  }, [spec]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="profile-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="profile-card" role="dialog" aria-modal="true" aria-label={`${spec.name}的档案`}>
        <header className="profile-head">
          <span className="profile-kicker">RESIDENT FILE · 217</span>
          <button className="icon-btn" onClick={onClose} aria-label="关闭档案">
            ×
          </button>
        </header>
        <div className="profile-id">
          <div className="avatar-frame">
            <canvas ref={avatarRef} width={64} height={64} aria-label={`${spec.name}的像素头像`} />
          </div>
          <div>
            <h2>{spec.name}</h2>
            <p className="joined">{spec.profile.joined}入住 · 217 号房</p>
            <div className="hearts" aria-label={`好感度 ${spec.profile.hearts} / 5`}>
              {Array.from({ length: 5 }).map((_, index) => (
                <span key={index} className={index < spec.profile.hearts ? "heart on" : "heart"}>
                  ♥
                </span>
              ))}
            </div>
          </div>
        </div>
        <p className="profile-intro">{spec.profile.intro}</p>
        <ul className="tag-list">
          {spec.profile.tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
        <div className="profile-actions">
          <button className="pixel-btn primary" onClick={onChat}>
            聊两句
          </button>
          <button className="pixel-btn" disabled>
            猜拳 · 即将开放
          </button>
        </div>
      </section>
    </div>
  );
}
