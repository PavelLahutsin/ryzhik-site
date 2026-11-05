/**
 * Build src/data/videos.json from data/vk/episodes.json.
 * Playlist names and links are edited in data/playlists.json.
 *
 * data/vk/manual.json can override an episode or add one the fetch missed.
 * Thumbnails are written to public/thumbs/<vk_id>.webp when missing.
 *
 * Usage: node scripts/build-videos.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { groupsFromTitle } from "./lib/groups.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const episodesPath = join(root, "data", "vk", "episodes.json");
const manualPath = join(root, "data", "vk", "manual.json");
const playlistsSourcePath = join(root, "data", "playlists.json");
const videosPath = join(root, "src", "data", "videos.json");
const thumbDir = join(root, "public", "thumbs");

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

const playlistFile = readJson(playlistsSourcePath, { vkOwnerId: -235612264, playlists: [] });
const OID = Number(playlistFile.vkOwnerId);
const PLAYLISTS = (Array.isArray(playlistFile.playlists) ? playlistFile.playlists : []).map((item) => ({
  id: String(item.id),
  title: String(item.title || ""),
  url: String(item.vkUrl || item.url || ""),
}));

function asEpisode(raw) {
  const vkId = Number(raw.vk_id ?? raw.vkId);
  const playlistId = String(raw.playlist_id ?? raw.playlistId ?? "");
  const title = String(raw.title || "").trim();
  if (!Number.isInteger(vkId) || !title || !PLAYLISTS.some((item) => item.id === playlistId)) return null;
  const hash = String(raw.vk_hash ?? raw.vkHash ?? "").trim();
  const youtube = String(raw.youtube_id ?? raw.youtubeId ?? "").trim();
  const duration = Number(raw.duration);
  const date = Number(raw.date);
  return {
    playlist_id: Number(playlistId),
    playlist_title: PLAYLISTS.find((item) => item.id === playlistId).title,
    vk_id: vkId,
    vk_hash: hash,
    title,
    duration: Number.isFinite(duration) ? duration : null,
    thumb: String(raw.thumb || ""),
    date: Number.isFinite(date) ? date : null,
    youtube_id: /^[A-Za-z0-9_-]{6,}$/.test(youtube) ? youtube : null,
    confidence: raw.confidence || null,
  };
}

function youtubeIdOf(raw) {
  const youtube = String(raw?.youtube_id ?? raw?.youtubeId ?? "").trim();
  return /^[A-Za-z0-9_-]{6,}$/.test(youtube) ? youtube : null;
}

function mergeEpisodes(source, manual) {
  const byId = new Map();
  const ordered = [];
  for (const row of source) {
    const episode = asEpisode(row);
    if (!episode || byId.has(episode.vk_id)) continue;
    byId.set(episode.vk_id, episode);
    ordered.push(episode);
  }
  for (const row of manual) {
    const episode = asEpisode(row);
    const vkId = Number(row?.vk_id ?? row?.vkId);
    const youtube = youtubeIdOf(row);
    if (!episode && !(Number.isInteger(vkId) && youtube)) {
      console.warn("Skipped a manual episode: need playlist_id 1–3, vk_id and title, or a youtube_id for an existing vk_id.");
      continue;
    }
    if (episode) {
      const existing = byId.get(episode.vk_id);
      if (existing) Object.assign(existing, episode);
      else {
        byId.set(episode.vk_id, episode);
        const lastOfPlaylist = ordered.findLastIndex((item) => item.playlist_id === episode.playlist_id);
        if (lastOfPlaylist === -1) ordered.push(episode);
        else ordered.splice(lastOfPlaylist + 1, 0, episode);
      }
    }
    if (youtube) {
      const existing = byId.get(episode ? episode.vk_id : vkId);
      if (existing) existing.youtube_id = youtube;
      else console.warn(`Manual youtube id for unknown vk_id ${vkId}.`);
    }
  }
  return ordered;
}

function uploadDate(unix) {
  if (!unix) return null;
  const date = new Date(unix * 1000);
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function ensureThumb(episode) {
  mkdirSync(thumbDir, { recursive: true });
  const dest = join(thumbDir, `${episode.vk_id}.webp`);
  if (existsSync(dest)) return `/thumbs/${episode.vk_id}.webp`;
  const localJpg = join(root, "data", "vk", "thumbs", `${episode.vk_id}.jpg`);
  let input = null;
  if (existsSync(localJpg)) input = readFileSync(localJpg);
  else if (episode.thumb.startsWith("http")) {
    const response = await fetch(episode.thumb, { headers: { "user-agent": "ryzhik-site/0.1" } });
    if (response.ok) input = Buffer.from(await response.arrayBuffer());
  }
  if (!input) return episode.thumb || "";
  await sharp(input).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 72 }).toFile(dest);
  return `/thumbs/${episode.vk_id}.webp`;
}

const source = readJson(episodesPath, []);
const manual = readJson(manualPath, []);
if (!Array.isArray(source) || source.length === 0) {
  console.error("data/vk/episodes.json is missing or empty.");
  process.exit(1);
}
const episodes = mergeEpisodes(source, Array.isArray(manual) ? manual : []);
const videos = [];
for (const episode of episodes) {
  const thumbnail = await ensureThumb(episode);
  videos.push({
    id: String(episode.vk_id),
    title: episode.title,
    durationSeconds: episode.duration,
    thumbnail,
    uploadDate: uploadDate(episode.date),
    playlists: [String(episode.playlist_id)],
    groups: groupsFromTitle(episode.title),
    watchUrl: `https://vk.com/video${OID}_${episode.vk_id}`,
    youtubeId: episode.youtube_id,
    vk: {
      oid: OID,
      id: episode.vk_id,
      hash: episode.vk_hash || null,
      url: `https://vk.com/video${OID}_${episode.vk_id}`,
    },
  });
}

const payload = {
  channelId: "UCpj352hhYxdxK02JheWYkRg",
  vkOwnerId: OID,
  note: "Каталог серий из data/vk/episodes.json: три плейлиста VK, в их порядке. Сборников и шортсов нет. videos:build пересобирает этот файл. Новые серии подтягивает npm run videos:vk.",
  videos,
};
writeFileSync(videosPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`episodes ${videos.length}, with youtube ${videos.filter((item) => item.youtubeId).length}`);
