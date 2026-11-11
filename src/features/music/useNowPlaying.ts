import { useCallback, useEffect, useState } from "react";
import { musicStatus, type NowPlaying } from "../../ipc/music";
import { pollInterval } from "./player";

const isIdle = () => document.documentElement.hasAttribute("data-idle");

/** Polls music_status while `visible` and the window is focused (no data-idle on <html>). */
export function useNowPlaying(player: string | null, visible: boolean) {
  const [now, setNow] = useState<NowPlaying | null>(null);
  const [idle, setIdle] = useState(isIdle);

  useEffect(() => {
    const mo = new MutationObserver(() => setIdle(isIdle()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-idle"] });
    return () => mo.disconnect();
  }, []);

  const refresh = useCallback(() => musicStatus(player).then(setNow, () => setNow(null)), [player]);

  useEffect(() => {
    const every = pollInterval(visible, idle);
    if (every === null) return;
    void refresh();
    const t = setInterval(() => void refresh(), every);
    return () => clearInterval(t);
  }, [visible, idle, refresh]);

  return { now, refresh };
}
