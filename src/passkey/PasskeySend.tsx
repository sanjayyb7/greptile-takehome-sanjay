import { useEffect, useRef, useState } from "react";
import { PASTE_FADE_MS, PASTE_SEND_MS } from "./timing";
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
export function PasskeySend({ passkey }: { passkey: Passkey }) {
  const { digits, status, submit, entry, stale } = passkey;
  const box = useRef<HTMLButtonElement>(null);
  /** the blob that travels with the box inside the goo layer — see the fluid notes below */
  const blob = useRef<HTMLSpanElement>(null);
  /** and the stub it is leaving, which is drawn back in once the neck has snapped */
  const root = useRef<HTMLSpanElement>(null);
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
    /*
     * In the fluid version what you see is not this button at all. A filter merges any
     * two shapes that come within about its blur radius of each other and hardens the
     * result's edges again, so a shape leaving another drags a neck behind it that thins
     * and snaps — which only works if both shapes are inside the same filtered group.
     * The button cannot be: it has to stay where the pointer and the focus ring expect
     * it. So the green is a blob in that group, moving on exactly the keyframes the
     * button does, and the button keeps only the arrow and the hit area.
     */
    const play = (frames: Keyframe[], options: KeyframeAnimationOptions) => {
      el.animate(frames, options);
      blob.current?.animate(frames, options);
    };

    const running = el.getAnimations();
    // Read where the box actually is BEFORE cancelling. getComputedStyle hands back a
    // live object, and cancelling drops the element to its CSS base — which here is the
    // closed, attached state — so reading afterwards says the box has already gone and
    // every retarget starts from nothing.
    const heldTranslate = style.translate;
    const heldScale = style.scale;
    running.forEach((a) => a.cancel());

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
      const opened = parseFloat(style.getPropertyValue("--pk-smooth-ms")) || SMOOTH_MS;
      const ms = leaving ? SEND_OUT_MS : opened;
      el.style.setProperty("--pk-arrow-delay", `${(entry === "paste" ? PASTE_FADE_MS : 0) + ms}ms`);
      root.current?.animate(
        leaving
          ? [{ scale: "1 0" }, { scale: ".6 .5", offset: 0.5 }, { scale: "0 .78" }]
          : [{ scale: "0 .78" }, { scale: ".6 .5", offset: 0.55 }, { scale: "1 0" }],
        { duration: ms, delay: entry === "paste" ? PASTE_FADE_MS : 0,
          easing: "cubic-bezier(0.33, 1, 0.68, 1)", fill: "both" },
      );
      play(
        leaving
          ? [{ translate: heldTranslate, scale: heldScale, opacity: 1 },
             { translate: shut, scale: "0 1", opacity: 1 }]
          : [{ translate: shut, scale: "0 1", opacity: 1 },
             { translate: "0 0", scale: "1 1", opacity: 1 }],
        { duration: ms, delay: entry === "paste" ? PASTE_FADE_MS : 0,
          easing: "cubic-bezier(0.33, 1, 0.68, 1)", fill: "both" },
      );
    return;
    }

    // And back, in the order it makes sense in: the arrow leaves first — that is a CSS
    // animation of its own — and only once it is gone does the box get pulled in. The
    // gap closes on an ease-in, accelerating towards the strip, because being pulled is
    // not the same shape as arriving somewhere.
    if (leaving) {
      const shutTo = "calc(-1 * var(--pk-send-gap)) 0";
      // coming back, the neck reaches out to meet the box, then is swallowed as the
      // gap closes behind it
      root.current?.animate(
        [{ scale: "1 0" }, { scale: ".55 .42", offset: 0.45 }, { scale: "0 .8" }],
        { duration: SEND_OUT_MS, delay: ARROW_OUT_MS, fill: "both" },
      );

      play(
        [{ translate: heldTranslate, scale: heldScale, opacity: 1,
           easing: "cubic-bezier(0.55, 0, 0.85, 0.35)" },
         { translate: shutTo, scale: "1 1", opacity: 1, offset: 0.45, easing: easeOut },
         { translate: shutTo, scale: "0 1", opacity: 1 }],
        { duration: SEND_OUT_MS, delay: ARROW_OUT_MS, fill: "both" },
      );
      return;
    }

    const from = running.length ? heldScale : leaving ? "1 1" : "0 1";
    play(
      leaving
        ? [{ scale: from, opacity: 1 }, { scale: "0 1", opacity: 0 }]
        : [{ scale: from }, { scale: "1 1" }],
      {
        duration: leaving ? SEND_OUT_MS : entry === "paste" ? PASTE_SEND_MS : SEND_IN_MS,
        delay: !leaving && entry === "paste" ? PASTE_FADE_MS : 0,
        easing: easeOut,
        fill: "both",
      },
    );
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
      {(
        // the root stays behind at the strip's edge; the blob is the box's green, and the
        // neck between them is the filter's doing, not a shape anyone drew
        <span className="pk-goo" aria-hidden="true">
          <span className="pk-goo-root" ref={root} />
          <span className="pk-goo-blob" ref={blob} />
        </span>
      )}
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
