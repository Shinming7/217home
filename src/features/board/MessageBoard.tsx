import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorText } from "../../net/api";
import type { MessageItem } from "../../net/types";
import { Panel } from "../../ui/Panel";

type MessageBoardProps = {
  isOwner: boolean;
  onClose: () => void;
  onChanged: () => void;
};

function timeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const time = `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
  return sameDay ? time : `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

export function MessageBoard({ isOwner, onClose, onChanged }: MessageBoardProps) {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const confirmTimer = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMessages(await api.messages());
      setError("");
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => window.clearTimeout(confirmTimer.current), []);

  const send = async () => {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.postMessage(text);
      setMessages((current) => [result.message, ...current]);
      setBody("");
      onChanged();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  const askDelete = (id: string) => {
    if (confirmId === id) {
      setConfirmId(null);
      window.clearTimeout(confirmTimer.current);
      void (async () => {
        try {
          await api.adminDeleteMessage(id);
          setMessages((current) => current.filter((message) => message.id !== id));
          onChanged();
        } catch (caught) {
          setError(errorText(caught));
        }
      })();
      return;
    }
    setConfirmId(id);
    window.clearTimeout(confirmTimer.current);
    confirmTimer.current = window.setTimeout(() => setConfirmId(null), 4000);
  };

  return (
    <Panel kicker="MESSAGE BOARD · 217" title="留言板" wide onClose={onClose}>
      <div className="board-form">
        <textarea
          className="text-input textarea"
          value={body}
          maxLength={160}
          rows={2}
          placeholder="留一句话给屋里的人……"
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void send();
          }}
        />
        <div className="board-form-actions">
          <span className="fineprint">{body.length} / 160 · Ctrl + Enter 发送</span>
          <button className="pixel-btn primary" onClick={() => void send()} disabled={busy || !body.trim()}>
            {busy ? "正在贴上去…" : "贴到留言板"}
          </button>
        </div>
      </div>

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {loading ? <p className="panel-note">正在翻留言……</p> : null}

      {!loading && messages.length === 0 ? (
        <div className="empty-state">
          <p>留言板还是空白。</p>
          <p className="fineprint">写下第一句话，明天回来还能看见。</p>
        </div>
      ) : (
        <ul className="board-list">
          {messages.map((message) => (
            <li key={message.id} className="board-item">
              <div className="board-avatar" style={{ background: message.author.look?.shirt ?? "#3a4466" }}>
                {message.author.nickname.slice(0, 1)}
              </div>
              <div className="board-content">
                <p className="board-meta">
                  <strong>{message.author.nickname}</strong>
                  <span>{timeLabel(message.createdAt)}</span>
                </p>
                <p className="board-body">{message.body}</p>
              </div>
              {isOwner ? (
                <button
                  className={confirmId === message.id ? "card-delete armed" : "card-delete"}
                  onClick={() => askDelete(message.id)}
                  aria-label="删除留言"
                >
                  {confirmId === message.id ? "再点一次" : "×"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
