import { invoke } from "@tauri-apps/api/core";

export type PlayerInfo = { id: string; name: string };
export type NowPlaying = {
  player: string;
  name: string;
  status: "playing" | "paused" | "stopped";
  title: string | null;
  artist: string | null;
  album: string | null;
  lengthMs: number | null;
  positionMs: number | null;
  volume: number | null;
  canGoNext: boolean;
  canGoPrevious: boolean;
  canControl: boolean;
};
export type MusicAction = "play_pause" | "next" | "previous" | "stop";

export const musicPlayers = () => invoke<PlayerInfo[]>("music_players");
export const musicStatus = (player: string | null) => invoke<NowPlaying | null>("music_status", { player });
export const musicControl = (player: string, action: MusicAction) => invoke<null>("music_control", { player, action });
export const musicSetVolume = (player: string, volume: number) => invoke<null>("music_set_volume", { player, volume });
