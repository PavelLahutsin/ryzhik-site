import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ALLOWED = new Set(["high", "medium"]);

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    console.warn(`Could not read ${path}`);
    return fallback;
  }
}

/** @returns {{ oid: number, id: number, hash: string | null, url: string, confidence: "high" | "medium" } | null} */
export function normalizeVk(raw) {
  if (!raw || typeof raw !== "object") return null;
  const confidence = raw.confidence;
  if (!ALLOWED.has(confidence)) return null;
  const id = Number(raw.vkId ?? raw.vk_id ?? raw.id);
  const oid = Number(raw.oid ?? raw.vk_oid ?? raw.vkOid ?? -235612264);
  if (!Number.isInteger(id) || !Number.isInteger(oid)) return null;
  const hashValue = raw.vkHash ?? raw.vk_hash ?? raw.hash ?? "";
  const hash = typeof hashValue === "string" && hashValue.trim() ? hashValue.trim() : null;
  const url = raw.url || raw.vk_url || `https://vk.com/video${oid}_${id}`;
  return { oid, id, hash, url, confidence };
}

/**
 * manual.json overrides the generated map.
 * A previous videos.json value is kept only when neither file has this YouTube id.
 * confidence "low" is never stored.
 */
export function loadVkResolver(root, previousVideos = []) {
  const mapFile = readJson(join(root, "data", "vk", "yt_vk_map.json"), []);
  const manualFile = readJson(join(root, "data", "vk", "manual.json"), []);
  const map = new Map();
  for (const row of Array.isArray(mapFile) ? mapFile : []) {
    if (row?.youtube_id) map.set(row.youtube_id, row);
  }
  const manual = new Map();
  for (const row of Array.isArray(manualFile) ? manualFile : []) {
    const youtubeId = row?.youtubeId || row?.youtube_id;
    if (youtubeId) manual.set(youtubeId, row);
  }
  const previous = new Map();
  for (const video of previousVideos) {
    if (video?.id) previous.set(video.id, video.vk ?? null);
  }

  return function resolveVk(youtubeId) {
    if (manual.has(youtubeId)) return normalizeVk(manual.get(youtubeId));
    if (map.has(youtubeId)) return normalizeVk(map.get(youtubeId));
    return normalizeVk(previous.get(youtubeId));
  };
}
