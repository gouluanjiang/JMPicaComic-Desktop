import { memo } from "react";
import type { ComponentType } from "react";

/**
 * While a page stays hidden, it skips main-window re-renders in which only
 * callback props changed: those are new functions on every render and these
 * pages call them from clicks only. Any data prop that changes (accounts,
 * library, settings) still reaches the hidden page at once, so it can cancel
 * or redo work, e.g. drop pending pages when the account changes.
 */
export function onlyCallbacksChanged(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): boolean {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of keys) {
    const before = previous[key];
    const after = next[key];
    if (Object.is(before, after)) continue;
    if (typeof before === "function" && typeof after === "function") continue;
    return false;
  }
  return true;
}

export function dormantWhileHidden<P extends { active?: boolean }>(
  Component: ComponentType<P>,
) {
  return memo(
    Component,
    (previous, next) =>
      !previous.active &&
      !next.active &&
      onlyCallbacksChanged(
        previous as Record<string, unknown>,
        next as Record<string, unknown>,
      ),
  );
}
