import { musicControl, musicStatus } from "../../ipc/music";

// One app-wide preview player, outside React: it keeps playing when the panel closes or the window loses focus.
let el: HTMLAudioElement | null = null;
let current: number | null = null;
const subs = new Set<(id: number | null) => void>();

function set(id: number | null) {
  current = id;
  subs.forEach((f) => f(id));
}

function audio(): HTMLAudioElement {
  if (!el) {
    el = new Audio();
    el.addEventListener("ended", () => set(null));
  }
  return el;
}

export const currentPreview = () => current;

export function subscribePreview(f: (id: number | null) => void): () => void {
  subs.add(f);
  return () => subs.delete(f);
}

/** Pauses the desktop player (Apple Music in Firefox…) if it is playing, so the two never overlap. */
async function pauseDesktopPlayer() {
  const now = await musicStatus(null).catch(() => null);
  if (now?.status === "playing" && now.canControl) await musicControl(now.player, "play_pause").catch(() => {});
}

export async function playPreview(id: number, url: string): Promise<void> {
  const a = audio();
  a.src = url;
  set(id);
  try {
    await a.play();
    await pauseDesktopPlayer();
  } catch (e) {
    set(null);
    throw e;
  }
}

export function stopPreview() {
  el?.pause();
  set(null);
}
