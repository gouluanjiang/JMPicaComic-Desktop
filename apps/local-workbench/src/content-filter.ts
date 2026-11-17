import {
  inheritLanguageTags,
  languageTagKind,
  retainedLanguageTags,
} from "./source-language.ts";

// Whole metadata labels only. Titles, authors and descriptions are never evidence.
const blLabels = new Set([
  "bl",
  "耽美",
  "yaoi",
  "boys love",
  "boys' love",
  "boy's love",
  "boys-love",
  "boys_love",
  "boyslove",
  "ボーイズラブ",
  "男男",
  "bl漫畫",
  "bl漫画",
  "bl漫",
  "bl向",
  "耽美漫畫",
  "耽美漫画",
  "耽美向",
  "耽美花園",
  "耽美花园",
]);
const aiLabels = new Set([
  "ai",
  "aigc",
  "ai漫画",
  "ai漫畫",
  "ai作画",
  "ai作畫",
  "ai绘画",
  "ai繪畫",
  "ai绘图",
  "ai繪圖",
  "ai绘制",
  "ai繪製",
  "ai生成",
  "ai生成漫画",
  "ai生成漫畫",
  "ai生成作品",
  "aiart",
  "aiartwork",
  "aicomic",
  "aicomics",
  "aigenerated",
  "aigeneratedart",
  "aigeneratedcomic",
  "aigeneratedcomics",
  "aiイラスト",
  "aiコミック",
  "aiマンガ",
  "ai絵",
]);
function normalizedLabel(tag: string): string {
  return tag
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘]/gu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}
const BL = 1,
  AI = 2,
  JM_FEMALE = 4,
  JM_ENGLISH = 8;
// The same few thousand tag strings recur across every list, so each one is
// classified once. Normalizing on every check cost hundreds of milliseconds
// per render with a large catalog. Bounded so stray input cannot grow it.
const TAG_CACHE_LIMIT = 50_000;
const tagKinds = new Map<string, number>();
function tagKind(tag: string): number {
  let kind = tagKinds.get(tag);
  if (kind !== undefined) return kind;
  const label = normalizedLabel(tag);
  kind =
    (blLabels.has(label) ? BL : 0) |
    // Only separators within a complete known label are optional; no substring match.
    (aiLabels.has(label.replace(/[ _-]/gu, "")) ? AI : 0) |
    (label === "女性向" ? JM_FEMALE : 0) |
    (label === "english manga" ? JM_ENGLISH : 0);
  if (tagKinds.size >= TAG_CACHE_LIMIT) tagKinds.clear();
  tagKinds.set(tag, kind);
  return kind;
}
export function isBlTag(tag: string): boolean {
  return (tagKind(tag) & BL) !== 0;
}
export function isAiTag(tag: string): boolean {
  return (tagKind(tag) & AI) !== 0;
}
export function isBlockedTag(tag: string): boolean {
  return (tagKind(tag) & (BL | AI)) !== 0;
}
export function isBlTagged(tags?: readonly string[]): boolean {
  return tags?.some(isBlTag) ?? false;
}
export function isBlockedTagged(tags?: readonly string[]): boolean {
  return tags?.some(isBlockedTag) ?? false;
}
export function isJmFemaleTag(tag: string): boolean {
  return (tagKind(tag) & JM_FEMALE) !== 0;
}
export function isJmEnglishCategory(tag: string): boolean {
  return (tagKind(tag) & JM_ENGLISH) !== 0;
}

/** Compact catalogs keep at most two language labels and one label per blocked kind. */
export function retainedContentTags(tags: readonly string[]): string[] {
  const retained = retainedLanguageTags(tags);
  for (const matches of [
    isBlTag,
    isAiTag,
    isJmFemaleTag,
    isJmEnglishCategory,
  ]) {
    const label = tags.find(matches);
    if (label) retained.push(label.trim());
  }
  return retained;
}

/** A lightweight source response must not erase known explicit evidence. */
export function inheritContentTags(
  incoming: string[],
  previous: readonly string[],
): string[] {
  let tags = inheritLanguageTags(incoming, previous);
  for (const matches of [
    isBlTag,
    isAiTag,
    isJmFemaleTag,
    isJmEnglishCategory,
  ]) {
    const prior = !tags.some(matches) && previous.find(matches);
    if (!prior) continue;
    if (tags === incoming) tags = [...tags];
    if (tags.length >= 128) {
      const removable = tags.findLastIndex(
        (tag) =>
          !languageTagKind(tag) &&
          !isBlockedTag(tag) &&
          !isJmFemaleTag(tag) &&
          !isJmEnglishCategory(tag),
      );
      // A saturated list consisting only of evidence can be compacted safely.
      tags =
        removable < 0
          ? retainedContentTags(tags)
          : tags.toSpliced(removable, 1);
    }
    tags.push(prior.trim());
  }
  return tags;
}

type ContentWork = {
  source: string;
  workId: string;
  tags?: readonly string[];
  categories?: readonly string[];
};
// Only explicit positives live here, for this process. No disk persistence,
// title matching, account details, extra source reads, or cross-site guessing.
const known = new Set<string>();
const listeners = new Set<() => void>();
let revision = 0,
  notificationQueued = false;
const key = (work: ContentWork) => JSON.stringify([work.source, work.workId]);
function anyKind(work: ContentWork, mask: number): boolean {
  for (const list of [work.tags, work.categories])
    if (list) for (const tag of list) if (tagKind(tag) & mask) return true;
  return false;
}
const excludedByMetadata = (work: ContentWork) =>
  anyKind(work, BL | AI) || (work.source === "JM" && anyKind(work, JM_FEMALE));
/** The accepted JM author/search scope is narrower than general browsing. */
export const isOutsideJmAuthorScope = (work: ContentWork) =>
  work.source === "JM" && anyKind(work, JM_ENGLISH);
export function rememberContentWork(work: ContentWork): void {
  if (!excludedByMetadata(work) || known.has(key(work))) return;
  known.add(key(work));
  revision++;
  if (!notificationQueued) {
    notificationQueued = true;
    queueMicrotask(() => {
      notificationQueued = false;
      for (const listener of listeners) listener();
    });
  }
}
export function isContentHidden(work: ContentWork): boolean {
  return excludedByMetadata(work) || known.has(key(work));
}
export function subscribeContentFilter(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function getContentFilterRevision(): number {
  return revision;
}
