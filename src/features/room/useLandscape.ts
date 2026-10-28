import { useEffect, useState } from "react";

const PORTRAIT_QUERY = "(pointer: coarse) and (orientation: portrait)";

export function useForcedLandscape(enabled: boolean): boolean {
  const [forced, setForced] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setForced(false);
      return;
    }
    const query = window.matchMedia(PORTRAIT_QUERY);
    const update = () => setForced(query.matches && window.innerWidth <= 1024);
    update();
    query.addEventListener?.("change", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      query.removeEventListener?.("change", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [enabled]);

  useEffect(() => {
    if (!forced) return;
    document.documentElement.classList.add("forced-landscape-root");
    document.body.classList.add("forced-landscape-body");
    return () => {
      document.documentElement.classList.remove("forced-landscape-root");
      document.body.classList.remove("forced-landscape-body");
    };
  }, [forced]);

  return forced;
}
