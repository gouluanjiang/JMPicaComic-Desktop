// The main window has no Windows title bar, so it draws its own minimize,
// maximize and close buttons in the top-right corner, over whichever top bar
// is showing. Closing goes through the same close request as the system
// button, so reader windows and running work are handled as before.

import { useEffect, useState } from "react";
import { invokeDesktop } from "./runtime.ts";
import "./window-controls.css";

type WindowShape = "normal" | "maximized" | "fullscreen";

/** Read from the page alone, so no native call is made while just looking. */
function windowShape(): WindowShape {
  const { screen } = window;
  if (window.outerWidth >= screen.width && window.outerHeight >= screen.height)
    return "fullscreen";
  if (
    window.outerWidth >= screen.availWidth &&
    window.outerHeight >= screen.availHeight
  )
    return "maximized";
  return "normal";
}

function command(name: "minimize" | "toggle_maximize" | "close") {
  void invokeDesktop(`plugin:window|${name}`, { label: "main" }).catch(
    () => undefined,
  );
}

export function WindowControls({ overReader }: { overReader: boolean }) {
  const [shape, setShape] = useState<WindowShape>(windowShape);
  useEffect(() => {
    const update = () => setShape(windowShape());
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
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
