/**
 * Refresh data/vk/episodes.json from the three public VK playlists.
 * Anonymous request: al_video.php act=load_videos_silent section=playlist_N oid=-235612264.
 * Episodes already in the file keep title and youtube_id.
 * New videos are inserted in the order VK returns.
 * Then scripts/build-videos.mjs rebuilds the site catalog.
 *
 * Usage: npm run videos:vk
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OID = -235612264;
const PLAYLISTS = [1, 2, 3];
const TITLES = {
  1: "Все песенки с Рыжиком",
  2: "Колыбельные для малышей",
  3: "Сонные истории",
};
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const episodesPath = join(root, "data", "vk", "episodes.json");

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
    const block = await fetchPage(playlistId, offset);
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

const previous = existsSync(episodesPath) ? JSON.parse(readFileSync(episodesPath, "utf8")) : [];
const previousById = new Map((Array.isArray(previous) ? previous : []).map((item) => [item.vk_id, item]));
const merged = [];
for (const playlistId of PLAYLISTS) {
  const fetched = await fetchPlaylist(playlistId);
  console.log(`playlist ${playlistId}: ${fetched.length}`);
  if (fetched.length === 0) {
    console.error(`Playlist ${playlistId} came back empty. episodes.json was not changed.`);
    process.exit(1);
  }
  for (const episode of fetched) {
    const saved = previousById.get(episode.vk_id);
    if (!saved) {
      merged.push(episode);
      continue;
    }
    merged.push({
      ...episode,
      title: saved.title || episode.title,
      youtube_id: saved.youtube_id ?? null,
      confidence: saved.confidence ?? null,
    });
  }
}

writeFileSync(episodesPath, `${JSON.stringify(merged, null, 2)}\n`);
console.log(`wrote ${merged.length} episodes`);

const child = spawn(process.execPath, ["scripts/build-videos.mjs"], { cwd: root, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
