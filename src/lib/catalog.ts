import linkFile from "../data/links.json";
import playlistFile from "../../data/playlists.json";
import siteFile from "../data/site.json";
import videoFile from "../data/videos.json";

export const site = siteFile;
export const platforms = linkFile.platforms;
export const playlists = playlistFile.playlists;
export const videos = videoFile.videos as (typeof videoFile.videos[number] & {
  displayTitle?: string;
  occasions?: string[];
})[];

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

export function getDisplayTitle(title: string, displayTitle?: string): string {
  if (displayTitle?.trim()) return displayTitle.trim();
  const shortened = title
    .split(" | ", 1)[0]
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return shortened || title.trim();
}

export function occasionIds(
  title: string,
  occasions: { id: string; data: { keywords: string[] } }[],
  assigned?: string[],
): string[] {
  if (assigned !== undefined) {
    const knownIds = new Set(occasions.map((item) => item.id));
    return assigned.filter((id) => knownIds.has(id));
  }

  const haystack = title.toLowerCase();
  return occasions
    .filter((item) => item.data.keywords.some((keyword) => haystack.includes(keyword.toLowerCase())))
    .map((item) => item.id);
}
