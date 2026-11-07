import { invokeDesktop } from "../runtime.ts";
import {
  validateCover,
  validateDetail,
  validateIndex,
  validatePage,
} from "./asmr-types.ts";
import type {
  AsmrCoverSize,
  AsmrIndexEntry,
  AsmrIndexKind,
  AsmrListQuery,
  AsmrPage,
  AsmrRelation,
  AsmrWorkDetail,
} from "./asmr-types.ts";

export function loadWorks(query: AsmrListQuery): Promise<AsmrPage> {
  return invokeDesktop("asmr_works", { query }).then(validatePage);
}

export function loadPopular(
  page: number,
  subtitleOnly: boolean,
): Promise<AsmrPage> {
  return invokeDesktop("asmr_popular", { page, subtitleOnly }).then(
    validatePage,
  );
}

export function searchWorks(
  keyword: string,
  query: AsmrListQuery,
): Promise<AsmrPage> {
  return invokeDesktop("asmr_search", { keyword, query }).then(validatePage);
}

export function loadRelated(
  relation: AsmrRelation,
  id: string,
  query: AsmrListQuery,
): Promise<AsmrPage> {
  return invokeDesktop("asmr_related", { relation, id, query }).then(
    validatePage,
  );
}

const indexes = new Map<AsmrIndexKind, Promise<AsmrIndexEntry[]>>();

/** The native side caches these too; this avoids repeating IPC per visit. */
export function loadIndex(kind: AsmrIndexKind): Promise<AsmrIndexEntry[]> {
  const cached = indexes.get(kind);
  if (cached) return cached;
  const request = invokeDesktop("asmr_index", { kind }).then(validateIndex);
  indexes.set(kind, request);
  request.catch(() => indexes.delete(kind));
  return request;
}

export function loadWork(id: number): Promise<AsmrWorkDetail> {
  return invokeDesktop("asmr_work", { id }).then(validateDetail);
}

// Card covers are the 560x420 "main" size, about 90 KB each as data URLs.
const COVER_CACHE = 240;
const COVER_CONCURRENCY = 4;
const covers = new Map<string, string | null>();
const waiting: (() => void)[] = [];
let active = 0;

// A finished request hands its slot straight to the next waiter, so the
// number of covers in flight never exceeds the limit.
async function slot<T>(run: () => Promise<T>): Promise<T> {
  if (active < COVER_CONCURRENCY) active++;
  else await new Promise<void>((resolve) => waiting.push(resolve));
  try {
    return await run();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

export function cachedCover(id: number, size: AsmrCoverSize) {
  return covers.get(`${size}:${id}`);
}

export async function loadCover(
  id: number,
  size: AsmrCoverSize,
): Promise<string | null> {
  const key = `${size}:${id}`;
  if (covers.has(key)) {
    const value = covers.get(key)!;
    // Refresh recency.
    covers.delete(key);
    covers.set(key, value);
    return value;
  }
  const value = await slot(() =>
    invokeDesktop("asmr_cover", { id, size }).then((result) =>
      validateCover(result, id),
    ),
  );
  covers.set(key, value);
  while (covers.size > COVER_CACHE)
    covers.delete(covers.keys().next().value as string);
  return value;
}
