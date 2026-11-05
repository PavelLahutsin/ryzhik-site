import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const characters = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/characters" }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      group: z.enum(["family", "friends"]),
      order: z.number(),
      role: z.string(),
      image: image(),
      imageAlt: z.string(),
    }),
});

const pages = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/pages" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    heading: z.string(),
    eyebrow: z.string().optional(),
    lede: z.string().optional(),
    draft: z.boolean().optional(),
    noindex: z.boolean().optional(),
    hero: z
      .object({
        badge: z.string(),
        badgeText: z.string(),
        titleBefore: z.string(),
        titleAccent: z.string(),
        titleAfter: z.string(),
        slogan: z.string(),
      })
      .optional(),
    sections: z
      .object({
        collectionsEyebrow: z.string(),
        collectionsTitle: z.string(),
        collectionsLede: z.string(),
        episodesEyebrow: z.string(),
        episodesTitle: z.string(),
        episodesLede: z.string(),
        charactersEyebrow: z.string(),
        charactersTitle: z.string(),
        charactersLede: z.string(),
        parentsEyebrow: z.string(),
        parentsTitle: z.string(),
        parentsLede: z.string(),
        coloringEyebrow: z.string(),
        coloringTitle: z.string(),
        coloringLede: z.string(),
        whereEyebrow: z.string(),
        whereTitle: z.string(),
        whereLede: z.string(),
        playlistsEyebrow: z.string(),
        playlistsTitle: z.string(),
        playlistsLede: z.string(),
        musicEyebrow: z.string(),
        musicTitle: z.string(),
        musicLede: z.string(),
        storyEyebrow: z.string(),
        storyTitle: z.string(),
      })
      .optional(),
    story: z.string().optional(),
    playlistTeasers: z
      .array(
        z.object({
          id: z.string(),
          text: z.string(),
        }),
      )
      .optional(),
    playlistIntros: z
      .array(
        z.object({
          id: z.string(),
          text: z.string(),
        }),
      )
      .optional(),
    actions: z
      .object({
        home: z.string(),
        watch: z.string(),
        characters: z.string(),
      })
      .optional(),
    themes: z
      .array(
        z.object({
          title: z.string(),
          summary: z.string(),
          text: z.string(),
          home: z.boolean(),
        }),
      )
      .optional(),
    asideTitle: z.string().optional(),
    asideLede: z.string().optional(),
    asidePoints: z
      .array(
        z.object({
          title: z.string(),
          text: z.string(),
        }),
      )
      .optional(),
  }),
});

const occasions = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/occasions" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    order: z.number(),
    tone: z.enum(["sun", "night", "habit", "song"]),
    icon: z.enum(["star", "music", "check", "heart"]),
    keywords: z.array(z.string()).min(1),
  }),
});

const albums = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/albums" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      href: z.string().url(),
      order: z.number(),
      cover: image(),
      blurb: z.string().optional(),
    }),
});

export const collections = { characters, pages, occasions, albums };
