// Main-window side of the desktop subtitle window: opens it while a file with
// subtitles plays, sends it each line, and remembers where it was left.

import { useCallback, useEffect, useRef, useState } from "react";
import { invokeDesktop, isDesktopRuntime } from "../runtime.ts";
import { listenReaderEvent } from "../reader/window-runtime.ts";
import type { QueueItem } from "./asmr-player.ts";

const ENABLED_KEY = "jmpicacomic.asmr.desktopLyrics";
const PLACEMENT_KEY = "jmpicacomic.asmr.desktopLyricsPlacement";

type Placement = { x: number; y: number; width: number; height: number };

function readPlacement(): Placement | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(PLACEMENT_KEY) ?? "null",
    ) as unknown;
    if (!value || typeof value !== "object") return null;
    const { x, y, width, height } = value as Record<string, unknown>;
    return [x, y, width, height].every(
      (part) => typeof part === "number" && Number.isFinite(part),
    )
      ? ({ x, y, width, height } as Placement)
      : null;
  } catch {
    return null;
  }
}

function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== "false";
  } catch {
    return true;
  }
}

const quietly = (command: string, args?: Record<string, unknown>) =>
  invokeDesktop(command, args).catch(() => undefined);

/**
 * Returns whether desktop subtitles are on and a toggle. The window shows
 * only while the current file has subtitles; it is closed with the player.
 */
export function useDesktopLyrics(
  item: QueueItem | null,
  line: string | null,
): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabled] = useState(readEnabled);
  // Closes we asked for must not switch the feature off.
  const closing = useRef(false);
  const open = useRef(false);
  const available = isDesktopRuntime();
  const wanted = available && enabled && item?.subtitleFileId != null;
  const playing = item !== null;

  const change = useCallback((value: boolean) => {
    setEnabled(value);
    try {
      localStorage.setItem(ENABLED_KEY, String(value));
    } catch {
      // Not essential.
    }
  }, []);

  useEffect(() => {
    if (!available) return;
    let stop: (() => void)[] = [];
    let active = true;
    void Promise.all([
      listenReaderEvent<Placement>("asmr-lyrics-placement", (placement) => {
        try {
          localStorage.setItem(PLACEMENT_KEY, JSON.stringify(placement));
        } catch {
          // Not essential.
        }
      }),
      listenReaderEvent("asmr-lyrics-closed", () => {
        open.current = false;
        // Closed from its own close button: the listener turned it off.
        if (!closing.current) change(false);
        closing.current = false;
      }),
    ]).then((handles) => {
      if (active) stop = handles;
      else handles.forEach((handle) => handle());
    });
    return () => {
      active = false;
      stop.forEach((handle) => handle());
    };
  }, [available, change]);

  useEffect(() => {
    if (!available) return;
    if (wanted) {
      open.current = true;
      void quietly("asmr_lyrics_open", { placement: readPlacement() });
    } else if (open.current && playing && enabled) {
      // This file has no subtitles; keep the window for the next one.
      void quietly("asmr_lyrics_hide");
    } else if (open.current) {
      open.current = false;
      closing.current = true;
      void quietly("asmr_lyrics_close");
    }
  }, [available, wanted, playing, enabled]);

  const title = item?.title ?? "";
  useEffect(() => {
    if (wanted) void quietly("asmr_lyrics_line", { text: line ?? "", title });
  }, [wanted, line, title]);

  return [enabled, change];
}
