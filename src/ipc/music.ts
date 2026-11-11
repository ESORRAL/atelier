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

export type MusicTarget = "home" | "search" | "library" | "playlists";
/** Opens Apple Music web in the default browser; the core builds the URL (contracts/ipc.md §8). */
export const musicOpen = (target: MusicTarget, query: string | null) => invoke<null>("music_open", { target, query });

// Catalogue search (contracts/ipc.md §9): requests go through the core, never from the UI.
export type MusicArtist = { id: number; name: string; genre: string | null; url: string };
export type MusicAlbum = { id: number; name: string; artist: string; artworkUrl: string | null; year: number | null; trackCount: number | null; url: string };
export type MusicSong = { id: number; name: string; artist: string; album: string | null; artworkUrl: string | null; durationMs: number | null; previewUrl: string | null; url: string };
export type SearchResults = { artists: MusicArtist[]; albums: MusicAlbum[]; songs: MusicSong[] };
export type SearchKind = "all" | "artist" | "album" | "song";
export type LookupWhat = "artist_albums" | "album_songs";

export const musicSearch = (term: string, kind: SearchKind) => invoke<SearchResults>("music_search", { term, kind });
export const musicLookup = (id: number, what: LookupWhat) => invoke<SearchResults>("music_lookup", { id, what });
export const musicOpenUrl = (url: string) => invoke<null>("music_open_url", { url });
