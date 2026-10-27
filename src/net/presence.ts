import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import type { PresencePayload } from "./types";
import type { Dir } from "../game/types";

type PresenceOptions = {
  enabled: boolean;
  getPosition: () => { x: number; y: number; dir: Dir };
  onAuthError: () => void;
};

const VISIBLE_MS = 4000;
const HIDDEN_MS = 15000;

export function usePresence({ enabled, getPosition, onAuthError }: PresenceOptions) {
  const [presence, setPresence] = useState<PresencePayload | null>(null);
  const [offline, setOffline] = useState(false);
  const latest = useRef({ getPosition, onAuthError });
  latest.current = { getPosition, onAuthError };

  useEffect(() => {
    if (!enabled) {
      setPresence(null);
      setOffline(false);
      return;
    }
    let alive = true;
    let timer = 0;

    const run = async () => {
      if (!alive) return;
      const delay = document.hidden ? HIDDEN_MS : VISIBLE_MS;
      try {
        const pos = latest.current.getPosition();
        const payload = await api.presence(Math.round(pos.x), Math.round(pos.y), pos.dir);
        if (!alive) return;
        setPresence(payload);
        setOffline(false);
      } catch (error) {
        if (!alive) return;
        if (error instanceof ApiError && error.status === 401) {
          latest.current.onAuthError();
          return;
        }
        setOffline(true);
      }
      if (alive) timer = window.setTimeout(run, delay);
    };

    void run();
    const onVisibility = () => {
      if (!document.hidden) {
        window.clearTimeout(timer);
        void run();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      alive = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);

  return { presence, offline };
}
