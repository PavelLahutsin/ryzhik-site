/**
 * Refresh data/vk/episodes.json from the three public VK playlists.
 * Anonymous request: al_video.php act=load_videos_silent section=playlist_N oid=-235612264.
 * Episodes already in the file keep their saved record (title, ids, playlist).
 * New videos are inserted in the order VK returns.
 * A failed or empty playlist keeps the saved episodes for that playlist.
 * The list is never shrunk. Then scripts/build-videos.mjs rebuilds the catalog.
 *
 * Usage: npm run videos:vk
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const episodesPath = join(root, "data", "vk", "episodes.json");
const playlistFile = JSON.parse(readFileSync(join(root, "data", "playlists.json"), "utf8"));
const OID = Number(playlistFile.vkOwnerId);
const PLAYLISTS = (playlistFile.playlists || []).map((item) => Number(item.id));
const TITLES = Object.fromEntries((playlistFile.playlists || []).map((item) => [Number(item.id), item.title]));

function decodeCp1251(buffer) {
  const extra = {
    0x80: "Ђ", 0x81: "Ѓ", 0x82: "‚", 0x83: "ѓ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡",
    0x88: "€", 0x89: "‰", 0x8a: "Љ", 0x8b: "‹", 0x8c: "Њ", 0x8d: "Ќ", 0x8e: "Ћ", 0x8f: "Џ",
    0x90: "ђ", 0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—",
    0x98: "\u0098", 0x99: "™", 0x9a: "љ", 0x9b: "›", 0x9c: "њ", 0x9d: "ќ", 0x9e: "ћ", 0x9f: "џ",
    0xa0: "\u00a0", 0xa8: "Ё", 0xb8: "ё",
  };
  let out = "";
  for (const byte of buffer) {
    if (byte < 128) out += String.fromCharCode(byte);
    else if (extra[byte]) out += extra[byte];
    else if (byte >= 0xc0) out += String.fromCharCode(0x410 + (byte - 0xc0));
    else out += String.fromCharCode(byte);
  }
  return out;
}

function unescapeTitle(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

async function fetchPage(playlistId, offset) {
  const response = await fetch("https://vk.com/al_video.php", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "Mozilla/5.0",
      "x-requested-with": "XMLHttpRequest",
      referer: `https://vk.com/video/playlist/${OID}_${playlistId}`,
    },
    body: new URLSearchParams({
      act: "load_videos_silent",
      al: "1",
      section: `playlist_${playlistId}`,
      oid: String(OID),
      offset: String(offset),
    }),
  });
  if (!response.ok) throw new Error(`VK HTTP ${response.status} for playlist ${playlistId}`);
  const data = JSON.parse(decodeCp1251(Buffer.from(await response.arrayBuffer())));
  const block = data?.payload?.[1]?.[0]?.[`playlist_${playlistId}`];
  if (!block || !Array.isArray(block.list)) {
    throw new Error(`Playlist ${playlistId} did not return a video list.`);
  }
  return block;
}

function rowToEpisode(row, playlistId) {
  const vkId = Number(row[1]);
  const title = unescapeTitle(row[3]);
  if (!Number.isInteger(vkId) || !title) return null;
  return {
    playlist_id: playlistId,
    playlist_title: TITLES[playlistId],
    vk_id: vkId,
    vk_hash: String(row[42] || "").trim(),
    title,
    duration: Number(row[19]) || null,
    thumb: String(row[2] || ""),
    date: Number(row[9]) || null,
    youtube_id: null,
    confidence: null,
  };
}

async function fetchPlaylist(playlistId) {
  const seen = new Set();
  const episodes = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total && episodes.length < 500) {
    let block;
    try {
      block = await fetchPage(playlistId, offset);
    } catch (error) {
      if (episodes.length === 0) throw error;
      console.warn(
        `Playlist ${playlistId} stopped early (${error.message}). Using the ${episodes.length} videos already read.`,
      );
      break;
    }
    total = Number(block.total) || total;
    if (!block.list.length) break;
    for (const row of block.list) {
      const episode = rowToEpisode(row, playlistId);
      if (!episode || seen.has(episode.vk_id)) continue;
      seen.add(episode.vk_id);
      episodes.push(episode);
    }
    const next = offset + block.list.length;
    if (next === offset) break;
    offset = next;
  }
  return episodes;
}

function manualYoutubeIds() {
  const manualPath = join(root, "data", "vk", "manual.json");
  if (!existsSync(manualPath)) return new Map();
  const rows = JSON.parse(readFileSync(manualPath, "utf8"));
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const vkId = Number(row?.vk_id ?? row?.vkId);
    const youtube = String(row?.youtube_id ?? row?.youtubeId ?? "").trim();
    if (Number.isInteger(vkId) && /^[A-Za-z0-9_-]{6,}$/.test(youtube)) map.set(vkId, youtube);
  }
  return map;
}

const previous = existsSync(episodesPath) ? JSON.parse(readFileSync(episodesPath, "utf8")) : [];
const previousList = Array.isArray(previous) ? previous : [];
const previousById = new Map(previousList.map((item) => [item.vk_id, item]));
const merged = [];
const placed = new Set();

function keepPlaylist(playlistId) {
  for (const saved of previousList) {
    if (Number(saved.playlist_id) !== playlistId || placed.has(saved.vk_id)) continue;
    placed.add(saved.vk_id);
    merged.push(saved);
  }
}

for (const playlistId of PLAYLISTS) {
  let fetched = null;
  try {
    fetched = await fetchPlaylist(playlistId);
  } catch (error) {
    console.warn(`Playlist ${playlistId} failed (${error.message}). Keeping the saved episodes.`);
  }
  if (!fetched || fetched.length === 0) {
    if (fetched) console.warn(`Playlist ${playlistId} came back empty. Keeping the saved episodes.`);
    keepPlaylist(playlistId);
    continue;
  }
  console.log(`playlist ${playlistId}: ${fetched.length}`);
  const savedCount = previousList.filter((item) => Number(item.playlist_id) === playlistId).length;
  if (fetched.length < savedCount) {
    const fresh = fetched.filter((episode) => !previousById.has(episode.vk_id) && !placed.has(episode.vk_id));
    console.warn(
      `Playlist ${playlistId} returned ${fetched.length} videos and ${savedCount} are already saved. Keeping the saved episodes and adding ${fresh.length} new.`,
    );
    for (const episode of fresh) {
      placed.add(episode.vk_id);
      merged.push(episode);
      console.log(`added ${episode.vk_id} ${episode.title}`);
    }
    keepPlaylist(playlistId);
    continue;
  }
  const fetchedIds = new Set(fetched.map((episode) => episode.vk_id));
  for (const episode of fetched) {
    if (placed.has(episode.vk_id)) continue;
    const saved = previousById.get(episode.vk_id);
    if (saved) {
      if (Number(saved.playlist_id) !== playlistId) continue;
      placed.add(saved.vk_id);
      merged.push(saved);
      continue;
    }
    placed.add(episode.vk_id);
    merged.push(episode);
    console.log(`added ${episode.vk_id} ${episode.title}`);
  }
  for (const saved of previousList) {
    if (Number(saved.playlist_id) !== playlistId || placed.has(saved.vk_id)) continue;
    if (!fetchedIds.has(saved.vk_id)) {
      console.warn(`Playlist ${playlistId} omitted saved episode ${saved.vk_id}. Keeping it.`);
    }
    placed.add(saved.vk_id);
    merged.push(saved);
  }
}

for (const saved of previousList) {
  if (placed.has(saved.vk_id)) continue;
  placed.add(saved.vk_id);
  merged.push(saved);
}

if (merged.length < previousList.length) {
  console.warn(
    `Refusing to shrink the episode list (${previousList.length} -> ${merged.length}). episodes.json was not changed.`,
  );
  process.exit(0);
}
if (merged.length === 0) {
  console.warn("No episodes to write. episodes.json was not changed.");
  process.exit(0);
}

const overrides = manualYoutubeIds();
for (const episode of merged) {
  const override = overrides.get(episode.vk_id);
  if (override) episode.youtube_id = override;
}

writeFileSync(episodesPath, `${JSON.stringify(merged, null, 2)}\n`);
console.log(`wrote ${merged.length} episodes`);

const child = spawn(process.execPath, ["scripts/build-videos.mjs"], { cwd: root, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
