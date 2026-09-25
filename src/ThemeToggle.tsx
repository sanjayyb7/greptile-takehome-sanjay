import { useState } from "react";

/**
 * Light and dark, on a switch.
 *
 * Not `prefers-color-scheme`: the design is drawn in light and that is what the page opens
 * in, whatever the machine happens to be set to. This is here so both can be looked at,
 * which is a reviewer's need rather than a visitor's.
 *
 * It writes one attribute on <html>. Every colour in the field is a token, and the dark
 * palette is one rule keyed off that attribute — so nothing here knows what changes, and
 * nothing that changes knows about this.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const flip = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "";
  };
  return (
    <button type="button" className="theme-toggle" onClick={flip}
      aria-pressed={dark} aria-label={dark ? "Switch to light" : "Switch to dark"}>
      {/* sun and moon in one 18px box, so the button never changes size with its state */}
      <svg viewBox="0 0 18 18" width="18" height="18" fill="none" aria-hidden="true">
        {dark
          ? <path d="M15 11.2A6.6 6.6 0 0 1 6.8 3a6.6 6.6 0 1 0 8.2 8.2Z"
              fill="currentColor" />
          : <>
              <circle cx="9" cy="9" r="3.4" fill="currentColor" />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                <rect key={a} x="8.4" y="0.6" width="1.2" height="2.6" rx="0.6"
                  fill="currentColor" transform={`rotate(${a} 9 9)`} />
              ))}
            </>}
      </svg>
    </button>
  );
}
