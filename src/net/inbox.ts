import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";
import type { InboxInviteAlert } from "./types";

type InboxFeedOptions = {
  enabled: boolean;
  onAuthError: () => void;
};

export function useInboxFeed({ enabled, onAuthError }: InboxFeedOptions) {
  const [count, setCount] = useState(0);
  const [invites, setInvites] = useState<InboxInviteAlert[]>([]);

  const refresh = useCallback(async () => {
    try {
      const result = await api.inboxUnread();
      setCount(result.count);
      setInvites(result.invites);
      return result;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onAuthError();
      return null;
    }
  }, [onAuthError]);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      setInvites([]);
      return;
    }
    let alive = true;
    let timer = 0;
    const loop = async () => {
      await refresh();
      if (!alive) return;
      timer = window.setTimeout(loop, document.visibilityState === "visible" ? 6000 : 20_000);
    };
    void loop();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [enabled, refresh]);

  return { count, invites, refresh };
}
