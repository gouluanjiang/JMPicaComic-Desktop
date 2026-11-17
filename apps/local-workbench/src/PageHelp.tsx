import { useEffect, useRef, useState } from "react";

/**
 * The (i) beside a page title. Page explanations and running statistics stay
 * off the main screen (ui-navy-gold.css hides them) until this is opened; it
 * marks the page's top-level container under `main.content`.
 */
export function PageHelp() {
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const page = button.current?.closest("main.content > *");
    if (!page) return;
    page.toggleAttribute("data-help-open", open);
    return () => page.removeAttribute("data-help-open");
  }, [open]);
  return (
    <button
      ref={button}
      type="button"
      className="page-help"
      aria-label={open ? "收起本页说明" : "显示本页说明"}
      aria-pressed={open}
      onClick={() => setOpen((value) => !value)}
    >
      i
    </button>
  );
}
