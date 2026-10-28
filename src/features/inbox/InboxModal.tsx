import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorText } from "../../net/api";
import { fallbackLook } from "../../game/looks";
import { PixelPortrait } from "../../ui/PixelPortrait";
import { Panel } from "../../ui/Panel";
import type { InboxMessage, InboxPeer, InboxThread } from "../../net/types";

type InboxModalProps = {
  initialPeerId?: string | null;
  onClose: () => void;
  onChanged: () => void;
  onAcceptInvite: (fromId: string) => void;
};

function timeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const time = `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
  return date.toDateString() === today.toDateString()
    ? time
    : `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

function inviteLeft(expiresAt: string | null): string {
  if (!expiresAt) return "10 分钟内有效";
  const remain = Date.parse(expiresAt) - Date.now();
  if (!Number.isFinite(remain)) return "";
  if (remain <= 0) return "已经过期";
  return `还剩约 ${Math.max(1, Math.ceil(remain / 60_000))} 分钟`;
}

function threadPreview(thread: InboxThread): string {
  if (thread.lastKind === "invite") return thread.lastMine ? "你发出了八角笼邀请" : "邀请你进八角笼";
  return thread.lastBody;
}

export function InboxModal({ initialPeerId, onClose, onChanged, onAcceptInvite }: InboxModalProps) {
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activePeer, setActivePeer] = useState<InboxPeer | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [clearArmed, setClearArmed] = useState(false);
  const [, setMinuteTick] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const clearTimer = useRef(0);
  const startedRef = useRef(false);

  const loadThreads = useCallback(async (quiet = false) => {
    if (!quiet) setLoadingThreads(true);
    try {
      const result = await api.inboxThreads();
      setThreads(result.threads);
      if (!quiet) setError("");
    } catch (caught) {
      if (!quiet) setError(errorText(caught));
    } finally {
      if (!quiet) setLoadingThreads(false);
    }
  }, []);

  const openThread = useCallback(
    async (peerId: string, peer?: InboxPeer) => {
      setActiveId(peerId);
      setActivePeer(peer ?? null);
      setMessages([]);
      setDraft("");
      setError("");
      setClearArmed(false);
      setLoadingMessages(true);
      try {
        const result = await api.inboxThread(peerId);
        setActivePeer(result.peer);
        setMessages(result.messages);
        onChanged();
        void loadThreads(true);
      } catch (caught) {
        setError(errorText(caught));
      } finally {
        setLoadingMessages(false);
      }
    },
    [loadThreads, onChanged],
  );

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!initialPeerId || startedRef.current) return;
    startedRef.current = true;
    void openThread(initialPeerId);
  }, [initialPeerId, openThread]);

  useEffect(() => {
    const timer = window.setInterval(() => void loadThreads(true), 6000);
    return () => window.clearInterval(timer);
  }, [loadThreads]);

  useEffect(() => {
    if (!activeId) return;
    let alive = true;
    let timer = 0;
    const loop = async () => {
      try {
        const result = await api.inboxThread(activeId);
        if (!alive) return;
        setActivePeer(result.peer);
        setMessages(result.messages);
      } catch {
        // 轮询失败时保留当前对话
      }
      if (alive) timer = window.setTimeout(loop, 5000);
    };
    timer = window.setTimeout(loop, 5000);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    const timer = window.setInterval(() => setMinuteTick((value) => value + 1), 30_000);
    return () => window.clearInterval(timer);
  }, [activeId]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loadingMessages]);

  useEffect(() => () => window.clearTimeout(clearTimer.current), []);

  const backToThreads = () => {
    setActiveId(null);
    setActivePeer(null);
    setMessages([]);
    setDraft("");
    setClearArmed(false);
    setError("");
    void loadThreads(true);
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || busy || !activeId) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.sendInbox(activeId, text);
      setMessages((current) => [...current, result.message]);
      setDraft("");
      void loadThreads(true);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  const askClear = () => {
    if (!activeId) return;
    if (!clearArmed) {
      setClearArmed(true);
      window.clearTimeout(clearTimer.current);
      clearTimer.current = window.setTimeout(() => setClearArmed(false), 4000);
      return;
    }
    setClearArmed(false);
    window.clearTimeout(clearTimer.current);
    const peerId = activeId;
    void (async () => {
      try {
        await api.deleteInboxThread(peerId);
        onChanged();
        backToThreads();
      } catch (caught) {
        setError(errorText(caught));
      }
    })();
  };

  const title = activeId ? (activePeer?.nickname ?? "对话") : "消息中心";

  return (
    <Panel kicker="INBOX · 217" title={title} wide onClose={onClose}>
      {activeId ? (
        <div className="inbox-thread-view">
          <div className="inbox-thread-head">
            <button className="fight-back" onClick={backToThreads}>
              ← 消息中心
            </button>
            <button className={clearArmed ? "inbox-clear armed" : "inbox-clear"} onClick={askClear}>
              {clearArmed ? "再点一次清空" : "清空对话"}
            </button>
          </div>

          {error ? <p className="form-error" role="alert">{error}</p> : null}

          <div className="inbox-messages" ref={listRef} aria-live="polite">
            {loadingMessages ? <p className="panel-note">正在翻信箱……</p> : null}
            {!loadingMessages && messages.length === 0 ? (
              <div className="empty-state">
                <p>还没有来往的信。</p>
                <p className="fineprint">说句话，就从这里开始。</p>
              </div>
            ) : null}
            {messages.map((message) =>
              message.kind === "invite" ? (
                <div
                  key={message.id}
                  className={message.mine ? "inbox-invite-card mine" : "inbox-invite-card"}
                >
                  <p className="inbox-invite-kicker">OCTAGON · 八角笼</p>
                  <p className="inbox-invite-line">
                    {message.mine
                      ? "你发出了一封约战邀请。"
                      : `${activePeer?.nickname ?? "对方"} 邀请你进八角笼打一场。`}
                  </p>
                  <p className="fineprint">
                    {message.mine
                      ? timeLabel(message.createdAt)
                      : message.invite?.expired
                        ? "这封邀请已经过期了。"
                        : `${inviteLeft(message.invite?.expiresAt ?? null)} · ${timeLabel(message.createdAt)}`}
                  </p>
                  {!message.mine && message.invite && !message.invite.expired ? (
                    <button className="pixel-btn primary" onClick={() => onAcceptInvite(activePeer?.id ?? activeId)}>
                      进笼开打
                    </button>
                  ) : null}
                </div>
              ) : (
                <div key={message.id} className={message.mine ? "inbox-bubble mine" : "inbox-bubble"}>
                  <p>{message.body}</p>
                  <span>{timeLabel(message.createdAt)}</span>
                </div>
              ),
            )}
          </div>

          <div className="inbox-composer">
            <textarea
              className="text-input textarea inbox-input"
              value={draft}
              maxLength={200}
              rows={2}
              placeholder="写一封短短的信……"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void send();
              }}
            />
            <div className="board-form-actions">
              <span className="fineprint">{draft.length} / 200 · Ctrl + Enter 发送</span>
              <button className="pixel-btn primary" onClick={() => void send()} disabled={busy || !draft.trim()}>
                {busy ? "正在送信…" : "寄出去"}
              </button>
            </div>
          </div>
          <p className="fineprint inbox-privacy">私信只在你和对方之间 · 站长也看不到</p>
        </div>
      ) : (
        <>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {loadingThreads ? <p className="panel-note">正在翻信箱……</p> : null}
          {!loadingThreads && threads.length === 0 ? (
            <div className="empty-state">
              <p>信箱还是空的。</p>
              <p className="fineprint">在住户档案里点「发私信」，或者在八角笼里发约战邀请。</p>
            </div>
          ) : (
            <ul className="inbox-threads">
              {threads.map((thread) => (
                <li key={thread.peer.id}>
                  <button className="inbox-thread" onClick={() => void openThread(thread.peer.id, thread.peer)}>
                    <span className="inbox-avatar">
                      <PixelPortrait
                        look={thread.peer.look ?? fallbackLook(thread.peer.id)}
                        label={`${thread.peer.nickname}的头像`}
                        size={34}
                      />
                    </span>
                    <span className="inbox-thread-main">
                      <span className="inbox-thread-top">
                        <strong>{thread.peer.nickname}</strong>
                        <em>{timeLabel(thread.lastAt)}</em>
                      </span>
                      <span className={thread.lastKind === "invite" ? "inbox-preview invite" : "inbox-preview"}>
                        {thread.lastMine ? "你：" : ""}
                        {threadPreview(thread)}
                      </span>
                    </span>
                    {thread.unread > 0 ? <span className="inbox-unread">{thread.unread}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="fineprint inbox-privacy">私信只在你和对方之间 · 站长也看不到</p>
        </>
      )}
    </Panel>
  );
}
