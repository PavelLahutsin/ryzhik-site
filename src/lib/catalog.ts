import linkFile from "../data/links.json";
import playlistFile from "../../data/playlists.json";
import siteFile from "../data/site.json";
import videoFile from "../data/videos.json";

export const site = siteFile;
export const platforms = linkFile.platforms;
export const playlists = playlistFile.playlists;
export const videos = videoFile.videos;

export type Platform = (typeof platforms)[number];
export type Video = (typeof videos)[number];
export type Playlist = (typeof playlists)[number];

export function platform(id: string): Platform {
  const found = platforms.find((item) => item.id === id);
  if (!found) throw new Error(`Нет ссылки с id «${id}» в src/data/links.json`);
  return found;
}

/** Non-empty href, or an empty string when the link is not configured yet. */
export function configuredHref(id: string): string {
  return platforms.find((item) => item.id === id)?.href.trim() ?? "";
}

export function publicPlatforms(flag: "where" | "footer" | "linksPage"): Platform[] {
  return platforms.filter((item) => item[flag] && !item.placeholder);
}

export function occasionIds(
  title: string,
  occasions: { id: string; data: { keywords: string[] } }[],
): string[] {
  const haystack = title.toLowerCase();
  return occasions
    .filter((item) => item.data.keywords.some((keyword) => haystack.includes(keyword.toLowerCase())))
    .map((item) => item.id);
}
