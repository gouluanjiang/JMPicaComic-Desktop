import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./workbench.css";

const lyrics = window.location.hash === "#asmr-lyrics";
// The desktop subtitle window is transparent from its first frame.
if (lyrics) {
  document.documentElement.classList.add("asmr-lyrics-root");
  document.documentElement.style.background = "transparent";
}
const root = createRoot(document.getElementById("root")!);
if (!lyrics) root.render(<div role="status">正在打开…</div>);

async function openApplication() {
  // Load only this window's entry before its first mount. A root Suspense
  // retry can otherwise leave a ready entry behind its fallback when the
  // browser clock is paused or timers are suspended.
  const Application = lyrics
    ? (await import("./asmr/AsmrLyricsWindow.tsx")).AsmrLyricsWindow
    : window.location.hash === "#reader-window"
      ? (await import("./reader/ReaderWindow.tsx")).ReaderWindow
      : (await import("./App.tsx")).default;
  root.render(
    <StrictMode>
      <Application />
    </StrictMode>,
  );
}

void openApplication().catch(() => {
  root.render(<div role="alert">界面暂时无法打开，请重新打开程序。</div>);
});
