import { useEffect, useRef, useState } from "react";
import { PASTE_FADE_MS } from "./timing";
import type { usePasskey } from "./usePasskey";

type Passkey = ReturnType<typeof usePasskey>;

/** keep in step with the box's own motion in PasskeySend. The caret's travel in and out
 *  of the box borrows them, so the block and the box move as one. */
export const SEND_IN_MS = 260;
/**
 * One unbroken move, for the version that has no beats to fit in.
 *
 * 380 rather than the 260 the block crossing out of the last cell takes, and deliberately
 * so — the box is not finished when it has finished opening. The arrow is the last thing
 * to go in, and it waits out this whole duration before it starts (see --pk-arrow-delay
 * below), so what the number buys is somewhere for the arrow to land. Cut it to 260 and
 * the box stops before the gesture it belongs to is over.
 *
 * Reviewed three times as a mismatch against SEND_IN_MS. It is not one; it is written
 * down here so it stops being read as one.
 */
const SMOOTH_MS = 380;
/** the arrow goes before the box does, on the way back */
const ARROW_OUT_MS = 120;
export const SEND_OUT_MS = 234;


/**
 * A fifth box on the end of the strip, appearing when the last digit lands.
 *
 * It opens out of the right edge rather than arriving as a separate control, so the strip
 * grows into the action instead of the action being placed beside it. With this in play the
 * code is not submitted automatically — a mistyped digit stays fixable until it is pressed.
 */
/** the bridge's waist, and how far each end flares above and below it: 16 + 2 × 14 is
 *  44, the caret block's height, so at the strip it is the block coming out of it and at
 *  the box it is the block going into it */
const PLUG_WAIST = 16;
const PLUG_R = 14;

/** how long the caret block takes to reach the strip's edge on its way to the box,
 *  measured: the box waits for it, because it is the block that pushes it out */
const BLOCK_REACH_MS = 80;

export function PasskeySend({ passkey }: { passkey: Passkey }) {
  const { digits, status, submit, entry, stale } = passkey;
  const box = useRef<HTMLButtonElement>(null);
  /** the bridge between the strip and the box as they part — see .pk-goo-plug */
  const plug = useRef<HTMLSpanElement>(null);
  const checking = status === "verifying" || status === "success";
  // Pressed is as good as emptied, for a box that does not wait out the check: the exit is
  // the one it already has, so backspacing a complete code and submitting one leave the
  // same way rather than by two different routes.
  // A refused code is complete, so `ready` would put the box straight back. It is the
  // wrong offer: the only code it could send is the one that was just refused.
  // A new code has just been sent, so the complete code on screen is the one before it.
  // The box would be offering to submit that, which is the one thing it should not be.
  /* The box goes on the press rather than waiting out the check; it does not come back
     for a code that was refused, because the only code it could send is that one; and it
     does not come back for one a newer code has superseded, for the same reason. */
  const ready = digits.every(Boolean) && !checking && status !== "error" && !stale;
  // it outlives the condition that shows it, so backspacing a complete code folds the box
  // away rather than deleting it mid-frame — the same trick the digit glyph uses
  const [leaving, setLeaving] = useState(false);
  const [wasReady, setWasReady] = useState(ready);
  if (wasReady !== ready) {
    setWasReady(ready);
    setLeaving(!ready);               // typing back in cancels the exit
  }
  // the box has to outlive the arrow leaving as well as its own pull back in
  const exitMs = ARROW_OUT_MS + SEND_OUT_MS;

  useEffect(() => {
    if (!leaving) return;
    const id = window.setTimeout(() => setLeaving(false), exitMs);
    return () => clearTimeout(id);
  }, [leaving, exitMs]);

  /*
   * Opening and closing is run from here rather than by a keyframe, because it can be
   * reversed mid-flight: type the last digit, backspace, type it again and the box is
   * asked to open while it is still closing. A keyframe restarts from its own `from`, so
   * that read as the box snapping shut and starting over. Reading the scale it actually
   * has and animating on from there, it simply turns round.
   *
   * WAAPI rather than a transition: the entrance has a delay that only applies on a
   * paste, and the whole thing stays one statement instead of a rule per case.
   */
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const style = getComputedStyle(el);
    const easeOut = style.getPropertyValue("--ease-out").trim() || "ease-out";
    const running = el.getAnimations();
    // Read where the box actually is BEFORE cancelling. getComputedStyle hands back a
    // live object, and cancelling drops the element to its CSS base — which here is the
    // closed, attached state — so reading afterwards says the box has already gone and
    // every retarget starts from nothing.
    const heldTranslate = style.translate;
    const heldScale = style.scale;
    running.forEach((a) => a.cancel());
    // the bridge's animations fill both ways too, and a new one would stack on the last
    plug.current?.getAnimations().forEach((a) => a.cancel());
    const gap = parseFloat(style.getPropertyValue("--pk-send-gap")) || 16;

    /*
     * translate and scale rather than transform, deliberately — transform belongs to the
     * press feedback, and an animation filling forwards on it would pin the box and leave
     * :active with nothing to do.
     */
    if (!leaving) {
      const shut = "calc(-1 * var(--pk-send-gap)) 0";
      /*
       * No stick, no shove, no beats at all: it opens out of the cell and clears it in a
       * single move, the gap widening the whole way rather than all at the end. There is
       * no moment where it is waiting, so there is no moment that can feel like a stall.
       */
      // from CSS so a version can shorten it without a prop: 380 is above the 300ms
      // ceiling for UI, and against a 234ms exit it made the arrival the slow half of
      // a pair where both are the system answering
      const ms = parseFloat(style.getPropertyValue("--pk-smooth-ms")) || SMOOTH_MS;
      /*
       * Asked to open while it was still on screen — the last digit deleted and typed
       * again before the box had finished folding away. It turns round from wherever it
       * actually is rather than snapping shut and starting over: from the held translate
       * and scale, straight away (the block is not what pushes it this time), in the share
       * of the full opening still left to cover, on the same curve. No bridge — the gap is
       * already part-open, and a bridge grown from nothing would not reach it.
       */
      if (running.length) {
        // how far it has to go: closing slides it back across the gap first and then
        // squeezes it, so whichever of the two is further from open decides
        const open = heldScale === "none" ? 1 : parseFloat(heldScale) || 0;
        const back = heldTranslate === "none" ? 0 : Math.abs(parseFloat(heldTranslate)) / gap;
        const rest = Math.min(1, Math.max(1 - open, back));
        el.style.setProperty("--pk-arrow-delay", "0ms");
        el.animate(
          [{ translate: heldTranslate, scale: heldScale, opacity: 1 },
           { translate: "0 0", scale: "1 1", opacity: 1 }],
          { duration: Math.max(120, ms * rest),
            easing: "cubic-bezier(0.33, 1, 0.68, 1)", fill: "both" },
        );
        return;
      }
      // The box does not move until the block that pushes it has reached the strip's edge:
      // opening any sooner, it was out and waiting before anything had touched it.
      const lead = (entry === "paste" ? PASTE_FADE_MS : 0) + BLOCK_REACH_MS;
      el.style.setProperty("--pk-arrow-delay", `${lead + ms}ms`);
      // The bridge: a funnel from the block into the box — full height at the strip's
      // face, pinched in the middle, full height again at the box's. Its width IS the
      // progress, so its far end stays on the box's edge as the gap opens. Sizes rather
      // than scale, so the curves keep their shape instead of being squeezed with the bar.
      const [W, R] = [PLUG_WAIST, PLUG_R];
      plug.current?.animate(
        [// The block's height at both faces, and held there for as long as the block is
         // still pushing: the box starts as the block reaches the strip's edge, and the
         // block has gone into it ~130ms later, which is 0.72 of the eased progress.
         // Shrinking the block's end any earlier left the block bigger than what it was
         // pushing into.
         { width: "0px", height: `${W}px`, "--pk-plug-rl": `${R}px`, "--pk-plug-rr": `${R}px` },
         { width: `${gap * 0.72}px`, height: `${W}px`, "--pk-plug-rl": `${R}px`, "--pk-plug-rr": `${R}px`, offset: 0.72 },
         // then it lets go of the block — a quick break at the block's end —
         { width: `${gap * 0.8}px`, height: "0px", "--pk-plug-rl": "0px", "--pk-plug-rr": `${R}px`, offset: 0.8 },
         // and the box takes in what it was carrying
         { width: `${gap}px`, height: "0px", "--pk-plug-rl": "0px", "--pk-plug-rr": "0px" }],
        { duration: ms, delay: lead, easing: "cubic-bezier(0.33, 1, 0.68, 1)", fill: "both" },
      );
      el.animate(
        [{ translate: shut, scale: "0 1", opacity: 1 },
         { translate: "0 0", scale: "1 1", opacity: 1 }],
        { duration: ms, delay: lead, easing: "cubic-bezier(0.33, 1, 0.68, 1)", fill: "both" },
      );
      return;
    }

    // And back, in the order it makes sense in: the arrow leaves first — that is a CSS
    // animation of its own — and only once it is gone does the box get pulled in. The
    // gap closes on an ease-in, accelerating towards the strip, because being pulled is
    // not the same shape as arriving somewhere.
    {
      const shutTo = "calc(-1 * var(--pk-send-gap)) 0";
      // The same funnel, backwards: it forms as the box starts back, and its width is
      // the gap closing — the same keyframes and curve as the box's own return, as a
      // separate animation so that nothing in between bends it off the box's edge.
      const back = { duration: SEND_OUT_MS, delay: ARROW_OUT_MS, fill: "both" } as const;
      plug.current?.animate(
        [{ width: `${gap}px`, easing: "cubic-bezier(0.55, 0, 0.85, 0.35)" },
         { width: "0px", offset: 0.45 }, { width: "0px" }], back);
      plug.current?.animate(
        [{ height: "0px", "--pk-plug-rl": "0px", "--pk-plug-rr": "0px" },
         // it forms at the box first — the box giving back what it took —
         { height: "0px", "--pk-plug-rl": "0px", "--pk-plug-rr": `${PLUG_R / 2}px`, offset: 0.06 },
         { height: `${PLUG_WAIST / 2}px`, "--pk-plug-rl": "0px", "--pk-plug-rr": `${PLUG_R}px`, offset: 0.14 },
         // and reaches the block, the same height at both faces again
         { height: `${PLUG_WAIST}px`, "--pk-plug-rl": `${PLUG_R}px`, "--pk-plug-rr": `${PLUG_R}px`, offset: 0.26 },
         { height: `${PLUG_WAIST}px`, "--pk-plug-rl": `${PLUG_R}px`, "--pk-plug-rr": `${PLUG_R}px` }], back);

      el.animate(
        [{ translate: heldTranslate, scale: heldScale, opacity: 1,
           easing: "cubic-bezier(0.55, 0, 0.85, 0.35)" },
         { translate: shutTo, scale: "1 1", opacity: 1, offset: 0.45, easing: easeOut },
         { translate: shutTo, scale: "0 1", opacity: 1 }],
        { duration: SEND_OUT_MS, delay: ARROW_OUT_MS, fill: "both" },
      );
      return;
    }

    // `ready` is a dependency because the component returns null until the code is
    // complete: the element appears without either of the others changing, and without
    // it here the box would sit at the closed scale it is declared with, never opening.
  }, [leaving, entry, ready]);

  if (!ready && !leaving) return null;
  // everywhere but the clearing version it stays put while verifying — inert, dimmed — so
  // success can fade it out with the cells instead of it blinking away under the press
  const busy = checking;

  return (
    <>
      {/* the bridge between the strip and the box, as they part — see .pk-goo-plug */}
      <span className="pk-goo-plug" ref={plug} aria-hidden="true" />
      <button type="button" ref={box} className="pk-send" onClick={() => submit()} aria-label="Send passcode"
      disabled={busy || leaving} data-busy={busy || undefined} data-leaving={leaving || undefined}>
      {/* 32px, so it carries the 84x128 box the way a 36px digit carries a cell; the 2.2
          stroke on a 24 viewBox lands at ~2.9px rendered, close to Inter 500's stem */}
      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" aria-hidden="true">
        <path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </>
  );
}
