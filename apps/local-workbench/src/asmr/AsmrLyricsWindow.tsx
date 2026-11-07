// The desktop subtitle window. It shows one line of text on a transparent,
// always-on-top window that can be dragged anywhere on the desktop.

import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { Icon } from "../icons.tsx";
import { invokeDesktop } from "../runtime.ts";
import { listenReaderEvent } from "../reader/window-runtime.ts";
import "./asmr-lyrics.css";

type Line = { text: string; title: string };

const SIZE_KEY = "jmpicacomic.asmr.desktopLyricsSize";
const SIZES = [18, 22, 26, 30, 36, 42, 50];
const DEFAULT_SIZE = 30;

function readLine(value: unknown): Line | null {
  if (!value || typeof value !== "object") return null;
  const { text, title } = value as Record<string, unknown>;
  return typeof text === "string" && typeof title === "string"
    ? { text: text.slice(0, 1000), title: title.slice(0, 500) }
    : null;
}

function readSize(): number {
  try {
    const value = Number(localStorage.getItem(SIZE_KEY));
    return SIZES.includes(value) ? value : DEFAULT_SIZE;
  } catch {
    return DEFAULT_SIZE;
  }
}

export function AsmrLyricsWindow() {
  const [line, setLine] = useState<Line>({ text: "", title: "" });
  const [size, setSize] = useState(readSize);
  useEffect(() => {
    document.documentElement.classList.add("asmr-lyrics-root");
    let active = true;
    let stop: () => void = () => undefined;
    invokeDesktop("asmr_lyrics_current")
      .then((value) => {
        const current = readLine(value);
        if (active && current) setLine(current);
      })
      .catch(() => undefined);
    void listenReaderEvent<unknown>("asmr-lyrics-line", (value) => {
      const next = readLine(value);
      if (next) setLine(next);
    }).then((handle) => {
      if (active) stop = handle;
      else handle();
    });
    return () => {
      active = false;
      stop();
    };
  }, []);
  const resize = (step: number) => {
    const next =
      SIZES[
        Math.min(SIZES.length - 1, Math.max(0, SIZES.indexOf(size) + step))
      ];
    setSize(next);
    try {
      localStorage.setItem(SIZE_KEY, String(next));
    } catch {
      // Not essential.
    }
  };
  const drag = (event: MouseEvent) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button"))
      return;
    event.preventDefault();
    void import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => getCurrentWindow().startDragging())
      .catch(() => undefined);
  };
  return (
    <main
      className="asmr-lyrics"
      onMouseDown={drag}
      title="拖动可移动位置"
      data-testid="asmr-lyrics"
    >
      <div className="asmr-lyrics-tools">
        <button
          aria-label="缩小字幕"
          title="缩小字幕"
          disabled={size === SIZES[0]}
          onClick={() => resize(-1)}
        >
          A−
        </button>
        <button
          aria-label="放大字幕"
          title="放大字幕"
          disabled={size === SIZES[SIZES.length - 1]}
          onClick={() => resize(1)}
        >
          A+
        </button>
        <button
          aria-label="关闭桌面字幕"
          title="关闭桌面字幕"
          onClick={() => {
            void invokeDesktop("asmr_lyrics_close").catch(() => undefined);
          }}
        >
          <Icon name="close" size={14} />
        </button>
      </div>
      {line.text ? (
        <p className="asmr-lyrics-text" style={{ fontSize: size }}>
          {line.text}
        </p>
      ) : (
        <p
          className="asmr-lyrics-text asmr-lyrics-idle"
          style={{ fontSize: Math.round(size * 0.6) }}
        >
          {line.title}
        </p>
      )}
    </main>
  );
}
