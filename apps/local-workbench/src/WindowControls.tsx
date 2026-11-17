// The desktop windows have no Windows title bar, so they draw their own
// minimize, maximize and close buttons. The main window shows them in its
// top-right corner over whichever top bar is showing; small reader windows show
// them in a bar that appears at the top edge. Closing goes through each
// window's usual close path, so reader positions and running work are handled
// as before.

import { useEffect, useState } from "react";
import { invokeDesktop } from "./runtime.ts";
import "./window-controls.css";

export type WindowShape = "normal" | "maximized" | "fullscreen";

type Internals = {
  __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: unknown } } };
};

/**
 * This window's native label. Only the desktop runtime describes its window;
 * most test bridges do not, and there the buttons stay in their normal state.
 */
export function currentWindowLabel(): string | null {
  const label = (window as unknown as Internals).__TAURI_INTERNALS__?.metadata
    ?.currentWindow?.label;
  return typeof label === "string" && label.length > 0 ? label : null;
}

function ask(
  label: string,
  name: "is_fullscreen" | "is_maximized",
): Promise<boolean> {
  return invokeDesktop<boolean>(`plugin:window|${name}`, { label }).then(
    (value) => value === true,
  );
}

/** Asked from the window itself; screen sizes cannot tell these apart. */
async function windowShape(label: string): Promise<WindowShape> {
  if (await ask(label, "is_fullscreen")) return "fullscreen";
  return (await ask(label, "is_maximized")) ? "maximized" : "normal";
}

/** Whether this window is maximized or fullscreen, kept current on resize. */
export function useWindowShape(label: string): WindowShape {
  const [shape, setShape] = useState<WindowShape>("normal");
  useEffect(() => {
    if (!label || currentWindowLabel() !== label) return;
    let active = true;
    let timer: number | undefined;
    const update = () =>
      windowShape(label)
        .then((next) => {
          if (active) setShape(next);
        })
        .catch(() => undefined);
    // Resizing fires many events; ask once it settles.
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(update, 120);
    };
    update();
    window.addEventListener("resize", onResize);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, [label]);
  return shape;
}

function command(
  label: string,
  name: "minimize" | "toggle_maximize" | "close",
) {
  void invokeDesktop(`plugin:window|${name}`, { label }).catch(() => undefined);
}

export function WindowControls({
  label = "main",
  shape: given,
  overReader = false,
  embedded = false,
  onClose,
}: {
  label?: string;
  /** Passed in when the caller already tracks the window's shape. */
  shape?: WindowShape;
  overReader?: boolean;
  /** Placed inside a bar instead of fixed in the window corner. */
  embedded?: boolean;
  /** Replaces the plain close request, for windows with their own close path. */
  onClose?(): void;
}) {
  const tracked = useWindowShape(given ? "" : label);
  const shape = given ?? tracked;
  // A fullscreen window has no title bar either.
  if (shape === "fullscreen") return null;
  const maximized = shape === "maximized";
  return (
    <div
      className={`window-controls${overReader ? " over-reader" : ""}${embedded ? " embedded" : ""}`}
      role="group"
      aria-label="窗口"
      data-testid="window-controls"
    >
      <button
        aria-label="最小化"
        title="最小化"
        onClick={() => command(label, "minimize")}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 5h10" />
        </svg>
      </button>
      <button
        aria-label={maximized ? "向下还原" : "最大化"}
        title={maximized ? "向下还原" : "最大化"}
        onClick={() => command(label, "toggle_maximize")}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          {maximized ? (
            <path d="M0.5 2.5h7v7h-7z M2.5 2.5v-2h7v7h-2" />
          ) : (
            <path d="M0.5 0.5h9v9h-9z" />
          )}
        </svg>
      </button>
      <button
        className="window-close"
        aria-label="关闭"
        title="关闭"
        onClick={() => (onClose ? onClose() : command(label, "close"))}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 0l10 10M10 0l-10 10" />
        </svg>
      </button>
    </div>
  );
}

/**
 * A small reader window's title bar. The comic fills the window, so the bar
 * slides in when the pointer reaches the top edge, like the bottom toolbar.
 */
export function ReaderTitleBar({ onClose }: { onClose(): void }) {
  const label = currentWindowLabel();
  const shape = useWindowShape(label ?? "");
  const [visible, setVisible] = useState(false);
  if (!label || shape === "fullscreen") return null;
  return (
    <div
      className={`reader-titlebar-zone${visible ? " is-visible" : ""}`}
      data-testid="reader-titlebar"
      // Movement inside the edge also opens it: a pointer that is already
      // in the top edge (a new window under the cursor) never "enters" it.
      onPointerEnter={() => setVisible(true)}
      onPointerMove={() => setVisible(true)}
      onPointerLeave={() => setVisible(false)}
    >
      <div className="reader-titlebar" data-tauri-drag-region>
        <span className="reader-titlebar-title" data-tauri-drag-region>
          JMPicaComic · 小窗阅读
        </span>
        <WindowControls
          label={label}
          shape={shape}
          embedded
          onClose={onClose}
        />
      </div>
    </div>
  );
}
