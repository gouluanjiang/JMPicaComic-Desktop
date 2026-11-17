import { memo } from "react";
import type { ComponentType } from "react";

/**
 * A page that stays mounted while hidden skips the main window's re-renders
 * until it is shown again, then catches up with the latest props. Its own
 * state and subscriptions still update it. Only for pages whose callbacks run
 * from clicks, so a hidden page never acts on stale props.
 */
export function dormantWhileHidden<P extends { active?: boolean }>(
  Component: ComponentType<P>,
) {
  return memo(Component, (previous, next) => !previous.active && !next.active);
}
