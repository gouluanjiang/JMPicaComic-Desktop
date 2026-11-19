import { useCallback, useEffect, useRef, useState } from "react";
import {
  emptyDownloadInventory,
  sameDownloadInventory,
} from "./download-types.ts";
import type {
  DownloadAdapter,
  DownloadInventorySnapshot,
  DownloadSnapshot,
} from "./download-types.ts";
import type { LibrarySnapshot } from "./library-types.ts";
import { DownloadError, downloadErrorMessage } from "./download-runtime.ts";

/**
 * Receipt file checks run on relevant changes: a library change, a finished
 * download, the window regaining focus or an explicit refresh. Never for each
 * image-progress tick, and not on every page switch either.
 */
export function useDownloadInventory(
  adapter: DownloadAdapter,
  enabled: boolean,
  library: LibrarySnapshot,
  downloads: DownloadSnapshot,
) {
  const [state, setState] = useState<{
    snapshot: DownloadInventorySnapshot;
    ready: boolean;
    error: string | null;
  }>(() => ({
    snapshot: emptyDownloadInventory(),
    ready: false,
    error: null,
  }));
  const epoch = useRef(0);
  const completed = JSON.stringify(
    downloads.tasks
      .filter((task) => task.phase === "downloaded")
      .map((task) => [
        task.id,
        task.revision,
        task.localFiles,
        task.libraryEntryId,
      ]),
  );
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const request = ++epoch.current;
    setState((previous) =>
      previous.error ? { ...previous, error: null } : previous,
    );
    try {
      const snapshot = await adapter.inventory();
      if (request !== epoch.current) return;
      if (snapshot.rootId !== library.rootId)
        throw new DownloadError("DOWNLOAD_ROOT_CHANGED");
      // An unchanged answer keeps the held state, so nothing redraws.
      setState((previous) =>
        previous.ready &&
        !previous.error &&
        sameDownloadInventory(previous.snapshot, snapshot)
          ? previous
          : { snapshot, ready: true, error: null },
      );
    } catch (problem) {
      if (request === epoch.current)
        setState((previous) => ({
          ...previous,
          ready: false,
          error: downloadErrorMessage(problem),
        }));
    }
  }, [adapter, enabled, library.rootId]);
  useEffect(() => {
    void refresh();
    return () => {
      epoch.current++;
    };
  }, [refresh, library.revision, completed]);
  useEffect(() => {
    if (!enabled) return;
    const focus = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    window.addEventListener("focus", focus);
    return () => {
      window.removeEventListener("focus", focus);
    };
  }, [enabled, refresh]);
  return { ...state, refresh };
}
