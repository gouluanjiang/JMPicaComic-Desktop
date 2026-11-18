import { memo, useRef } from "react";
import type { ComponentType } from "react";

type Callbacks = Record<string, unknown>;

/**
 * Stable stand-ins for callback props. Each function keeps its identity for
 * the life of the calling component and always runs the latest one passed
 * in, so a memoized child can skip renders without holding stale code.
 * Values that are not functions (e.g. an absent optional callback) pass
 * through unchanged, so a child can still tell whether one is given.
 */
export function useLatestCallbacks<T extends Callbacks>(callbacks: T): T {
  const latest = useRef(callbacks);
  latest.current = callbacks;
  const proxies = useRef(new Map<string, (...args: unknown[]) => unknown>());
  const result: Callbacks = {};
  for (const [name, value] of Object.entries(callbacks)) {
    if (typeof value !== "function") {
      result[name] = value;
      continue;
    }
    let proxy = proxies.current.get(name);
    if (!proxy) {
      proxy = (...args: unknown[]) => {
        const current = latest.current[name];
        return typeof current === "function"
          ? (current as (...values: unknown[]) => unknown)(...args)
          : undefined;
      };
      proxies.current.set(name, proxy);
    }
    result[name] = proxy;
  }
  return result as T;
}

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
