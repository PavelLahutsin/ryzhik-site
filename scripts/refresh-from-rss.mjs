/**
 * Merge the public YouTube RSS feed into src/data/videos.json.
 *
 * New videos are added (duration stays null — RSS has no length).
 * Existing videos keep the audit title when it already has Cyrillic,
 * so an English feed title does not replace the Russian one.
 * Missing upload dates are filled from <published>.
 * groups are recalculated from the title that remains.
 *
 * Usage: node scripts/refresh-from-rss.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { groupsFromTitle } from "./lib/groups.mjs";
import {
  CHANNEL_ID,
  RSS_URL,
  isVideoId,
  normalizeUploadDate,
  sortVideos,
  thumbnailUrl,
  watchUrl,
} from "./lib/youtube.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const videosPath = join(root, "src", "data", "videos.json");

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

function cyrillicCount(text) {
  return (text.match(/[А-Яа-яЁё]/g) || []).length;
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
    const published = tag(block, "published");
    if (!isVideoId(id) || !title) continue;
    entries.push({
      id,
      title,
      uploadDate: normalizeUploadDate(published),
    });
  }
  return entries;
}

const response = await fetch(RSS_URL, {
  headers: { "user-agent": "ryzhik-site-rss/0.1", accept: "application/atom+xml, application/xml, text/xml" },
});
if (!response.ok) {
  console.error(`RSS HTTP ${response.status} ${RSS_URL}`);
  process.exit(1);
}
const xml = await response.text();
const feedEntries = parseFeed(xml);
if (feedEntries.length === 0) {
  console.error("RSS parsed 0 entries. File was not changed.");
  process.exit(1);
}

const current = JSON.parse(readFileSync(videosPath, "utf8"));
const videos = new Map((current.videos || []).map((video) => [video.id, { ...video }]));
let added = 0;
let datesFilled = 0;
let titlesUpdated = 0;

for (const entry of feedEntries) {
  const existing = videos.get(entry.id);
  if (!existing) {
    videos.set(entry.id, {
      id: entry.id,
      title: entry.title,
      durationSeconds: null,
      thumbnail: thumbnailUrl(entry.id),
      uploadDate: entry.uploadDate,
      playlists: [],
      groups: groupsFromTitle(entry.title),
      watchUrl: watchUrl(entry.id),
    });
    added++;
    continue;
  }
  if (!existing.uploadDate && entry.uploadDate) {
    existing.uploadDate = entry.uploadDate;
    datesFilled++;
  }
  const rssCyr = cyrillicCount(entry.title);
  const currentCyr = cyrillicCount(existing.title || "");
  if (rssCyr > currentCyr) {
    existing.title = entry.title;
    titlesUpdated++;
  }
  existing.groups = groupsFromTitle(existing.title);
  existing.thumbnail = thumbnailUrl(entry.id);
  existing.watchUrl = watchUrl(entry.id);
}

const payload = {
  ...current,
  channelId: current.channelId || CHANNEL_ID,
  videos: sortVideos([...videos.values()]),
};

writeFileSync(videosPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(
  `RSS entries ${feedEntries.length}; added ${added}; titles updated ${titlesUpdated}; dates filled ${datesFilled}; total ${payload.videos.length}`,
);
