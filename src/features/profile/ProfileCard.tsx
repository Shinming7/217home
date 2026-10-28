import { useEffect } from "react";
import { fallbackLook } from "../../game/looks";
import { PixelPortrait } from "../../ui/PixelPortrait";
import type { MemberDetail } from "../../net/types";

type ProfileCardProps = {
  detail: MemberDetail;
  selfId: string;
  onClose: () => void;
  onChat: () => void;
  onMessage: () => void;
};

function timeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function ProfileCard({ detail, selfId, onClose, onChat, onMessage }: ProfileCardProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const member = detail.member;
  const look = member.look ?? fallbackLook(member.id);
  const isSelf = member.id === selfId;
  const filled = Math.min(5, Math.max(0, Math.ceil(detail.hearts / 2)));

  return (
    <div
      className="profile-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="profile-card" role="dialog" aria-modal="true" aria-label={`${member.nickname}的档案`}>
        <header className="profile-head">
          <span className="profile-kicker">RESIDENT FILE · 217</span>
          <button className="icon-btn" onClick={onClose} aria-label="关闭档案">
            ×
          </button>
        </header>

        <div className="profile-id">
          <div className="avatar-frame">
            {member.pixel ? (
              <img src={member.pixel} alt={`${member.nickname}的像素头像`} />
            ) : (
              <PixelPortrait look={look} label={`${member.nickname}的像素头像`} />
            )}
          </div>
          <div>
            <h2>{member.nickname}</h2>
            <p className="joined">
              第 {Math.max(1, Math.ceil((Date.now() - new Date(member.createdAt).getTime()) / 86_400_000))} 天入住 · 217 号房
            </p>
            <div className="online-line">
              <span className={detail.online ? "online-pill on" : "online-pill"}>{detail.online ? "在屋里" : "出门了"}</span>
              {member.role === "owner" ? <span className="owner-pill">站长</span> : null}
            </div>
            <div className="hearts" aria-label={`好感度 ${detail.hearts}`}>
              {Array.from({ length: 5 }).map((_, index) => (
                <span key={index} className={index < filled ? "heart on" : "heart"}>
                  ♥
                </span>
              ))}
              <span className="heart-count">好感 {detail.hearts}</span>
            </div>
          </div>
        </div>

        <p className="profile-intro">{member.intro || "还没有写介绍，等本人回来补上。"}</p>
        {member.tags.length ? (
          <ul className="tag-list">
            {member.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        ) : null}

        {detail.recentMessages.length ? (
          <div className="recent-block">
            <p className="recent-title">最近留言</p>
            <ul className="recent-list">
              {detail.recentMessages.map((message) => (
                <li key={message.id}>
                  <span>{message.body}</span>
                  <em>{timeLabel(message.createdAt)}</em>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!isSelf ? (
          <div className="profile-actions">
            <button className="pixel-btn primary" onClick={onChat}>
              聊两句
            </button>
            <button className="pixel-btn" onClick={onMessage}>
              发私信
            </button>
          </div>
        ) : (
          <p className="fineprint">这是你自己的档案。</p>
        )}
      </section>
    </div>
  );
}
