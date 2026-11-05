export const CHANNEL_ID = "UCpj352hhYxdxK02JheWYkRg";

export const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

export function thumbnailUrl(id) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export function watchUrl(id) {
  return `https://www.youtube.com/watch?v=${id}`;
}

/** YYYYMMDD -> YYYY-MM-DD, or null. */
export function normalizeUploadDate(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return null;
}

export function normalizeDuration(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export function shortPlaylistTitle(title) {
  const raw = (title || "").trim();
  if (!raw) return raw;
  const withoutLeading = raw.replace(/^(?:\p{Extended_Pictographic}|\s)+/u, "");
  const beforeMark = withoutLeading.split(/\p{Extended_Pictographic}/u)[0] ?? withoutLeading;
  const cut = beforeMark.split("|")[0].split("—")[0].split(":")[0].trim();
  const shorter = cut.replace(/\s+для малышей$/i, "").trim();
  const text = shorter.length >= 2 ? shorter : cut || raw;
  return text.length > 34 ? `${text.slice(0, 32).trim()}…` : text;
}

export function isVideoId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{6,}$/.test(id);
}

function addMembership(map, videoId, playlistId) {
  if (!isVideoId(videoId) || !playlistId) return;
  if (!map.has(videoId)) map.set(videoId, []);
  const list = map.get(videoId);
  if (!list.includes(playlistId)) list.push(playlistId);
}

function videoIdsFromPlaylist(playlist) {
  const nested = playlist.entries || playlist.videos || playlist.items || [];
  const ids = [];
  if (!Array.isArray(nested)) return ids;
  for (const item of nested) {
    if (typeof item === "string") ids.push(item);
    else if (item && typeof item.id === "string") ids.push(item.id);
  }
  return ids;
}

/**
 * Playlists from tab_playlists.json.
 * Video membership is recorded only when the dump actually lists videos.
 */
export function readPlaylists(tabJson, flatEntries) {
  const playlists = [];
  const membership = new Map();
  const entries = Array.isArray(tabJson?.entries) ? tabJson.entries : [];

  for (const playlist of entries) {
    if (!playlist?.id || !playlist.title) continue;
    playlists.push({
      id: String(playlist.id),
      title: String(playlist.title),
      shortTitle: shortPlaylistTitle(String(playlist.title)),
      url: playlist.url || `https://www.youtube.com/playlist?list=${playlist.id}`,
    });
    for (const videoId of videoIdsFromPlaylist(playlist)) {
      addMembership(membership, videoId, String(playlist.id));
    }
  }

  for (const entry of flatEntries || []) {
    if (!entry?.id || !entry.playlist_id) continue;
    addMembership(membership, String(entry.id), String(entry.playlist_id));
  }

  return { playlists, membership };
}

export function sortVideos(videos) {
  return [...videos].sort((a, b) => {
    const da = a.uploadDate || "";
    const db = b.uploadDate || "";
    if (da !== db) return da < db ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
