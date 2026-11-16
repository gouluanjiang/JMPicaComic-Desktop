// The main window has no Windows title bar, so it draws its own minimize,
// maximize and close buttons in the top-right corner, over whichever top bar
// is showing. Closing goes through the same close request as the system
// button, so reader windows and running work are handled as before.

import { useEffect, useState } from "react";
import { invokeDesktop } from "./runtime.ts";
import "./window-controls.css";

type WindowShape = "normal" | "maximized" | "fullscreen";

function ask(name: "is_fullscreen" | "is_maximized"): Promise<boolean> {
  return invokeDesktop<boolean>(`plugin:window|${name}`, {
    label: "main",
  }).then((value) => value === true);
}

/** Asked from the window itself; screen sizes cannot tell these apart. */
async function windowShape(): Promise<WindowShape> {
  if (await ask("is_fullscreen")) return "fullscreen";
  return (await ask("is_maximized")) ? "maximized" : "normal";
}

/**
 * Only the real desktop runtime describes its window; the test bridges do not,
 * and there the buttons simply stay in their normal state.
 */
function realWindow(): boolean {
  const internals = (
    window as unknown as {
      __TAURI_INTERNALS__?: { metadata?: { currentWindow?: unknown } };
    }
  ).__TAURI_INTERNALS__;
  return Boolean(internals?.metadata?.currentWindow);
}

function command(name: "minimize" | "toggle_maximize" | "close") {
  void invokeDesktop(`plugin:window|${name}`, { label: "main" }).catch(
    () => undefined,
  );
}

export function WindowControls({ overReader }: { overReader: boolean }) {
  const [shape, setShape] = useState<WindowShape>("normal");
  useEffect(() => {
    if (!realWindow()) return;
    let active = true;
    let timer: number | undefined;
    const update = () =>
      windowShape()
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
  }, []);
  // A fullscreen window has no title bar either.
  if (shape === "fullscreen") return null;
  const maximized = shape === "maximized";
  return (
    <div
      className={`window-controls${overReader ? " over-reader" : ""}`}
      role="group"
      aria-label="窗口"
      data-testid="window-controls"
    >
      <button
        aria-label="最小化"
        title="最小化"
        onClick={() => command("minimize")}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 5h10" />
        </svg>
      </button>
      <button
        aria-label={maximized ? "向下还原" : "最大化"}
        title={maximized ? "向下还原" : "最大化"}
        onClick={() => command("toggle_maximize")}
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
        onClick={() => command("close")}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 0l10 10M10 0l-10 10" />
        </svg>
      </button>
    </div>
  );
}
