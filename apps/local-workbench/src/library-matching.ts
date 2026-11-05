import type { LibraryItem, LibraryReference } from "./library-types.ts";

export const libraryReferences = (item: LibraryItem): LibraryReference[] => [
  ...(item.sourceRef ? [item.sourceRef] : []),
  ...(item.links ?? []).map((link) => link.reference),
];
export const fileNeedsReview = (item: LibraryItem) =>
  item.state !== "indexed" ||
  item.errorCode !== null ||
  !(item.pageCount && item.pageCount > 0);
export type LibraryFilter = "all" | "owned" | "review";
/** When a work entered the library. A re-read of a re-selected folder records
 * its own time for every file, so the file's modified time wins when earlier. */
export function libraryAddedAt(
  item: Pick<LibraryItem, "addedAt" | "modifiedAt">,
): number | null {
  const { addedAt = null, modifiedAt } = item;
  if (addedAt == null) return modifiedAt;
  return modifiedAt == null ? addedAt : Math.min(addedAt, modifiedAt);
}

export const librarySorts = [
  "title",
  "modified",
  "added-desc",
  "added-asc",
  "updated-desc",
  "updated-asc",
] as const;
export type LibrarySort = (typeof librarySorts)[number];
export function compareAdded(
  a: LibraryItem,
  b: LibraryItem,
  sort: LibrarySort,
) {
  if (sort !== "added-asc" && sort !== "added-desc") return 0;
  const first = libraryAddedAt(a);
  const second = libraryAddedAt(b);
  if (first == null && second == null) return 0;
  if (first == null) return 1;
  if (second == null) return -1;
  return (first - second) * (sort === "added-asc" ? 1 : -1);
}
export function libraryFilterMatches(item: LibraryItem, filter: LibraryFilter) {
  return (
    filter === "all" ||
    (filter === "review" ? fileNeedsReview(item) : !fileNeedsReview(item))
  );
}
export const libraryFilterLabels: Record<LibraryFilter, string> = {
  all: "全部",
  owned: "文件可用",
  review: "文件待核对",
};
