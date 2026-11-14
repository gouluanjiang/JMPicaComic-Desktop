// The listener's marks as this program last saw them, so lists and the detail
// panel agree after a change, and so playback can move a mark forward by
// itself without ever overwriting one it has not read.

import { setReview } from "./asmr-runtime.ts";
import { nextAutoMark } from "./asmr-types.ts";
import type { AsmrProgress } from "./asmr-types.ts";

export type ReviewChange = {
  id: number;
  progress?: AsmrProgress | null;
  userRating?: number | null;
};

const AUTO_KEY = "asmr-auto-mark";
const MAX_KNOWN = 500;
const known = new Map<number, AsmrProgress | null>();
const listeners = new Set<(change: ReviewChange) => void>();
let signedIn = false;

/** Marks read while signed out say nothing, so they are dropped. */
export function setMarksSignedIn(value: boolean) {
  signedIn = value;
  if (!value) known.clear();
}

/** Records a mark read from the site while signed in. */
export function noteProgress(id: number, progress: AsmrProgress | null) {
  known.delete(id);
  known.set(id, progress);
  while (known.size > MAX_KNOWN)
    known.delete(known.keys().next().value as number);
}

/** Tells every open list and panel that a work's mark or rating changed. */
export function announceReview(change: ReviewChange) {
  if (change.progress !== undefined) noteProgress(change.id, change.progress);
  listeners.forEach((listener) => listener(change));
}

export function onReviewChange(listener: (change: ReviewChange) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function autoMarkEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setAutoMark(value: boolean) {
  try {
    localStorage.setItem(AUTO_KEY, String(value));
  } catch {
    // The choice then lasts for this run only.
  }
}

/**
 * Moves a work to "listening" when it starts and "listened" when its last
 * file ends. Works whose mark was never read are left alone.
 */
export function autoMark(id: number, stage: "started" | "finished") {
  if (!signedIn || !autoMarkEnabled() || !known.has(id)) return;
  const next = nextAutoMark(known.get(id) ?? null, stage);
  if (!next) return;
  // Recorded first so a second file of the same work does not ask again.
  const previous = known.get(id) ?? null;
  noteProgress(id, next);
  setReview(id, null, next)
    .then(() => announceReview({ id, progress: next }))
    .catch(() => {
      if (known.get(id) === next) noteProgress(id, previous);
    });
}
