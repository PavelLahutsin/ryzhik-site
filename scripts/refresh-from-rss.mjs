/**
 * Pair recent YouTube videos onto VK episodes that do not yet have youtube_id.
 * The catalog stays the three VK playlists. Existing titles and YouTube ids are kept.
 * Playlist feeds are the source of a match. The channel feed fills a title the
 * playlist feed did not list. A failed or empty feed keeps the saved ids.
 *
 * Usage: npm run videos:rss
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RSS_URL, isVideoId, normalizeUploadDate } from "./lib/youtube.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const episodesPath = join(root, "data", "vk", "episodes.json");
const playlistFile = JSON.parse(readFileSync(join(root, "data", "playlists.json"), "utf8"));

function decodeXml(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function tag(block, name) {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return match ? decodeXml(match[1]) : "";
}

function parseFeed(xml) {
  const entries = [];
  for (const match of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const block = match[1];
    const id = tag(block, "yt:videoId") || (tag(block, "id").split(":").pop() ?? "");
    const title = tag(block, "title");
    if (!isVideoId(id) || !title) continue;
    entries.push({
      id,
      title,
      uploadDate: normalizeUploadDate(tag(block, "published")),
    });
  }
  return entries;
}

function normalizeTitle(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\uFE0F\u200D]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function youtubePlaylistId(url) {
  try {
    return new URL(url).searchParams.get("list") || "";
  } catch {
    return "";
  }
}

async function fetchFeed(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "ryzhik-site-rss/0.1",
      accept: "application/atom+xml, application/xml, text/xml",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  const entries = parseFeed(await response.text());
  if (entries.length === 0) throw new Error(`0 entries ${url}`);
  return entries;
}

function pairEntries(entries, episodes, playlistId = null) {
  const inScope = (episode) => playlistId == null || Number(episode.playlist_id) === playlistId;
  const buckets = new Map();
  for (const entry of entries) {
    const key = normalizeTitle(entry.title);
    if (key.length < 12) continue;
    if (!buckets.has(key)) buckets.set(key, []);
    const list = buckets.get(key);
    if (!list.some((item) => item.id === entry.id)) list.push(entry);
  }
  const used = new Set(episodes.map((episode) => episode.youtube_id).filter(Boolean));
  const pending = new Map();
  for (const episode of episodes) {
    if (!inScope(episode) || episode.youtube_id) continue;
    const key = normalizeTitle(episode.title);
    if (!pending.has(key)) pending.set(key, []);
    pending.get(key).push(episode);
  }
  let paired = 0;
  for (const [key, group] of pending) {
    const matches = (buckets.get(key) || []).filter((entry) => !used.has(entry.id));
    if (group.length !== 1 || matches.length !== 1) {
      if (group.length > 1 || matches.length > 1) {
        console.warn(`Skipped an ambiguous YouTube title (${group.length} episodes, ${matches.length} videos).`);
      }
      continue;
    }
    group[0].youtube_id = matches[0].id;
    if (!group[0].confidence) group[0].confidence = "high";
    used.add(matches[0].id);
    paired += 1;
    console.log(`paired ${group[0].vk_id} -> ${matches[0].id} ${group[0].title}`);
  }
  return paired;
}

if (!existsSync(episodesPath)) {
  console.warn("data/vk/episodes.json is missing. YouTube pairing was skipped.");
  process.exit(0);
}

const episodes = JSON.parse(readFileSync(episodesPath, "utf8"));
if (!Array.isArray(episodes) || episodes.length === 0) {
  console.warn("data/vk/episodes.json is empty. YouTube pairing was skipped.");
  process.exit(0);
}

const savedIds = episodes.map((episode) => ({
  vk_id: episode.vk_id,
  youtube_id: episode.youtube_id || null,
}));

let paired = 0;
for (const playlist of playlistFile.playlists || []) {
  const playlistId = Number(playlist.id);
  const listId = youtubePlaylistId(playlist.youtubeUrl || playlist.url || "");
  if (!listId) {
    console.warn(`Playlist ${playlistId} has no YouTube list id. Kept existing YouTube ids.`);
    continue;
  }
  const url = `https://www.youtube.com/feeds/videos.xml?playlist_id=${listId}`;
  try {
    const entries = await fetchFeed(url);
    console.log(`youtube playlist ${playlistId}: ${entries.length}`);
    paired += pairEntries(entries, episodes, playlistId);
  } catch (error) {
    console.warn(`YouTube playlist ${playlistId} failed (${error.message}). Kept existing YouTube ids.`);
  }
}

try {
  const channelEntries = await fetchFeed(RSS_URL);
  console.log(`youtube channel: ${channelEntries.length}`);
  paired += pairEntries(channelEntries, episodes, null);
} catch (error) {
  console.warn(`YouTube channel RSS failed (${error.message}). Kept existing YouTube ids.`);
}

if (episodes.length !== savedIds.length) {
  console.warn("Refusing to change the episode count. YouTube ids were not written.");
  process.exit(0);
}
for (const saved of savedIds) {
  const episode = episodes.find((item) => item.vk_id === saved.vk_id);
  if (!episode) {
    console.warn(`Refusing to drop episode ${saved.vk_id}. YouTube ids were not written.`);
    process.exit(0);
  }
  if (saved.youtube_id && episode.youtube_id !== saved.youtube_id) {
    console.warn(`Kept the saved YouTube id for ${saved.vk_id}.`);
    episode.youtube_id = saved.youtube_id;
  }
}

if (paired === 0) {
  console.log("No new YouTube pairings. episodes.json was not changed.");
  process.exit(0);
}

writeFileSync(episodesPath, `${JSON.stringify(episodes, null, 2)}\n`);
console.log(`paired ${paired} episode${paired === 1 ? "" : "s"}`);

const child = spawn(process.execPath, ["scripts/build-videos.mjs"], { cwd: root, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
