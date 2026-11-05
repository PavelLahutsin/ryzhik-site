/**
 * Family / friends tags from the title only.
 * A video stays untagged when the title does not clearly say so.
 * Cyrillic is not a word character in JS regex, so these patterns do not use \b.
 */

const FAMILY = [
  /семья/iu,
  /семьи/iu,
  /семье/iu,
  /семью/iu,
  /семьёй/iu,
  /семейн/iu,
  /finger family/iu,
  /мам(а|ы|е|у|ой|ою)/iu,
  /пап(а|ы|е|у|ой|ою)/iu,
  /братик/iu,
  /бабушк/iu,
];

const FRIENDS = [
  /друз(ья|ей|ьями|ом)/iu,
  /friends/iu,
  /ёжик/iu,
  /ежик/iu,
  /hedgehog/iu,
];

function matches(title, patterns) {
  return patterns.some((pattern) => pattern.test(title));
}

/** @returns {Array<"family" | "friends">} */
export function groupsFromTitle(title) {
  const text = title ?? "";
  const groups = [];
  if (matches(text, FAMILY)) groups.push("family");
  if (matches(text, FRIENDS)) groups.push("friends");
  return groups;
}
