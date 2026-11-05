/**
 * Rebuild src/data/videos.json and src/data/playlists.json
 * from data/youtube-audit (yt-dlp dump).
 *
 * Re-running keeps videos that exist only because of scripts/refresh-from-rss.mjs.
 * Audit rows win for title, duration and upload date.
 *
 * Usage: node scripts/build-videos.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./lib/csv.mjs";
import { groupsFromTitle } from "./lib/groups.mjs";
import { loadVkResolver } from "./lib/vk.mjs";
import {
  CHANNEL_ID,
  normalizeDuration,
  normalizeUploadDate,
  readPlaylists,
  sortVideos,
  thumbnailUrl,
  watchUrl,
  isVideoId,
} from "./lib/youtube.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const auditDir = join(root, "data", "youtube-audit");
const videosPath = join(root, "src", "data", "videos.json");
const playlistsPath = join(root, "src", "data", "playlists.json");

let previousVideos = [];
if (existsSync(videosPath)) {
  try {
    previousVideos = JSON.parse(readFileSync(videosPath, "utf8")).videos || [];
  } catch {
    console.warn("Existing videos.json was not readable. VK fields from it were skipped.");
  }
}
const resolveVk = loadVkResolver(root, previousVideos);

const csvRows = parseCsv(readFileSync(join(auditDir, "videos.csv"), "utf8"));
const flat = JSON.parse(readFileSync(join(auditDir, "videos_flat.json"), "utf8"));
const tab = JSON.parse(readFileSync(join(auditDir, "tab_playlists.json"), "utf8"));
const flatEntries = Array.isArray(flat.entries) ? flat.entries : [];
const flatById = new Map(flatEntries.map((entry) => [entry.id, entry]));
const { playlists, membership } = readPlaylists(tab, flatEntries);

/** @type {Map<string, object>} */
const videos = new Map();

for (const row of csvRows) {
  if (!isVideoId(row.id)) continue;
  const flatEntry = flatById.get(row.id);
  const title = (row.title || flatEntry?.title || "").trim();
  if (!title) continue;
  videos.set(row.id, {
    id: row.id,
    title,
    durationSeconds: normalizeDuration(row.duration ?? flatEntry?.duration),
    thumbnail: thumbnailUrl(row.id),
    uploadDate: normalizeUploadDate(row.upload_date),
    playlists: membership.get(row.id) ?? [],
    groups: groupsFromTitle(title),
    watchUrl: watchUrl(row.id),
  });
}

for (const entry of flatEntries) {
  if (!isVideoId(entry.id) || videos.has(entry.id)) continue;
  const title = (entry.title || "").trim();
  if (!title) continue;
  videos.set(entry.id, {
    id: entry.id,
    title,
    durationSeconds: normalizeDuration(entry.duration),
    thumbnail: thumbnailUrl(entry.id),
    uploadDate: normalizeUploadDate(entry.upload_date || entry.timestamp),
    playlists: membership.get(entry.id) ?? [],
    groups: groupsFromTitle(title),
    watchUrl: watchUrl(entry.id),
  });
}

if (existsSync(videosPath)) {
  try {
    const previous = JSON.parse(readFileSync(videosPath, "utf8"));
    for (const saved of previous.videos || []) {
      if (!isVideoId(saved.id) || videos.has(saved.id)) continue;
      const title = (saved.title || "").trim();
      if (!title) continue;
      videos.set(saved.id, {
        id: saved.id,
        title,
        durationSeconds: normalizeDuration(saved.durationSeconds),
        thumbnail: thumbnailUrl(saved.id),
        uploadDate: normalizeUploadDate(saved.uploadDate),
        playlists: Array.isArray(saved.playlists) ? saved.playlists : [],
        groups: groupsFromTitle(title),
        watchUrl: watchUrl(saved.id),
      });
    }
  } catch {
    console.warn("Existing videos.json was not merged (unreadable).");
  }
}

for (const video of videos.values()) {
  video.vk = resolveVk(video.id);
}

const payload = {
  channelId: CHANNEL_ID,
  note: "Файл собирает scripts/build-videos.mjs из data/youtube-audit. groups — метки «family» и «friends» только по словам в названии. vk — связь с VK Видео (confidence high или medium) из data/vk/yt_vk_map.json, data/vk/manual.json или уже записанного поля. Совпадение low не сохраняется.",
  videos: sortVideos([...videos.values()]),
};

const playlistPayload = {
  channelId: CHANNEL_ID,
  note: "Плейлисты вкладки канала из tab_playlists.json. Состав роликов не выдумывается: если в выгрузке нет списка id, на сайте плейлист ведёт на YouTube.",
  playlists,
};

writeFileSync(videosPath, `${JSON.stringify(payload, null, 2)}\n`);
writeFileSync(playlistsPath, `${JSON.stringify(playlistPayload, null, 2)}\n`);

const family = payload.videos.filter((video) => video.groups.includes("family")).length;
const friends = payload.videos.filter((video) => video.groups.includes("friends")).length;
const withPlaylist = payload.videos.filter((video) => video.playlists.length > 0).length;
const withVk = payload.videos.filter((video) => video.vk).length;
console.log(
  `videos ${payload.videos.length}, family ${family}, friends ${friends}, with playlist membership ${withPlaylist}, playlists ${playlists.length}, with vk ${withVk}`,
);
