import { createDialKit, createDialRoot } from "dialkit/vanilla";
import "dialkit/vanilla/styles.css";

/**
 * Live dials for how a digit is written in, for the explorations only.
 *
 * Everything here lands as CSS variables on the field, which is where the field already
 * reads them from — the block's crossing time, the curve it and the digit share, when the
 * digit starts to show, and what it starts from. Nothing in the field knows the dials
 * exist, so taking this file out leaves it exactly as shipped. One style tag rather than
 * inline styles, because switching version remounts the field and an inline value would
 * be gone with it.
 */
export function mountDigitDials() {
  createDialRoot({ position: "top-right", theme: "light" });
  const tag = document.createElement("style");
  tag.dataset.dials = "digits";
  document.head.append(tag);

  const kit = createDialKit("Digits", {
    // 300ms is the shipped crossing: the block and the digit share it, so they move as one
    speed: [300, 80, 1000, 10],
    // the curve both run on; ease-in-out is shipped. Only the Bézier is used — a spring
    // has no CSS equivalent for a keyframed crossing, so switching mode keeps the last curve
    curve: { type: "easing", duration: 0.3, ease: [0.42, 0, 0.58, 1] },
    // how far into the crossing the digit starts to show: 0.5 waits for the block to cover
    // the cell; lower shows it sooner, which reads as more responsive
    showsAt: [0.5, 0, 0.9, 0.05],
    // where it starts from: fully transparent at half size is shipped
    startOpacity: [0, 0, 1, 0.05],
    startScale: [0.5, 0.1, 1, 0.05],
  }, { id: "pk-digit-dials", persist: true });   // kept across reloads, in this browser

  let ease = "cubic-bezier(0.42, 0, 0.58, 1)";
  kit.subscribe((v) => {
    if (v.curve.type === "easing") ease = `cubic-bezier(${v.curve.ease.join(", ")})`;
    // doubled class and !important: the field sets these on .passkey, and some versions
    // set them again under their own attributes
    tag.textContent = `.passkey.passkey {
      --pk-caret-ms: ${v.speed}ms !important;
      --pk-digit-ms: ${v.speed}ms !important;
      --pk-write-ease: ${ease} !important;
      --pk-write-at: ${v.showsAt} !important;
      --pk-write-opacity: ${v.startOpacity} !important;
      --pk-write-scale: ${v.startScale} !important;
    }`;
  });
}
