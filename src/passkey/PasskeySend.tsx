import { useEffect, useRef, useState } from "react";
import { PASTE_FADE_MS, PASTE_SEND_MS } from "./timing";
import { springEasing } from "./spring";
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
/** keep in step with pk-send-arrow's duration in passkey.css */
const ARROW_IN_MS = 200;
/**
 * How far into the arrow's arrival the box gives way, when the arrow is what shoves it.
 * Not at the end of it: a thing that pushes is still moving when the pushed thing starts
 * to go, and waiting for the arrow to come to rest first reads as two unrelated events.
 */
const ARROW_BITES = 0.65;
/** out of the cell, still attached */
const UNFOLD_MS = 140;
/**
 * And then it waits, attached, until the block is out of the last cell — because that is
 * the thing doing the pushing, and the push has to land when the two of them meet.
 *
 * 0.767 of the crossing, not the whole of it. The block travels through a window 86px
 * wide that the cell clips at 43, and it is at translate 0 — filling the window — half
 * way through. Its trailing edge only clears 43 at 50/93.75 of the second half, which is
 * 0.767 of the whole. Waiting for the full crossing left 60ms of nothing between the
 * block leaving and the box moving, and 60ms is enough to break the causality.
 */
const SHOVE_AT = SEND_IN_MS * 0.767;
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

export function PasskeySend({ passkey, falls = false, fluid = false, smooth = false,
  clears = false, handsBack = false, staleOnResend = false }: {
  passkey: Passkey; falls?: boolean; fluid?: boolean; smooth?: boolean;
  /** the box goes on the press rather than waiting out the check — see sendClearsOnSubmit */
  clears?: boolean;
  /** and does not come back for a rejected code — see handsBackOnError */
  handsBack?: boolean;
  /** nor for one a newer code has superseded — see the stale note in usePasskey */
  staleOnResend?: boolean;
}) {
  const { digits, status, submit, entry, stale } = passkey;
  const box = useRef<HTMLButtonElement>(null);
  /** the blob that travels with the box inside the goo layer — see the fluid notes below */
  const blob = useRef<HTMLSpanElement>(null);
  /** and the stub it is leaving, which is drawn back in once the neck has snapped */
  const root = useRef<HTMLSpanElement>(null);
  /** the caret block's continuation, drawn crisp over the neck — see .pk-goo-plug */
  const plug = useRef<HTMLSpanElement>(null);
  const checking = status === "verifying" || status === "success";
  // Pressed is as good as emptied, for a box that does not wait out the check: the exit is
  // the one it already has, so backspacing a complete code and submitting one leave the
  // same way rather than by two different routes.
  // A refused code is complete, so `ready` would put the box straight back. It is the
  // wrong offer: the only code it could send is the one that was just refused.
  // A new code has just been sent, so the complete code on screen is the one before it.
  // The box would be offering to submit that, which is the one thing it should not be.
  const ready = digits.every(Boolean) && !(clears && checking)
    && !(handsBack && status === "error") && !(staleOnResend && stale);
  // it outlives the condition that shows it, so backspacing a complete code folds the box
  // away rather than deleting it mid-frame — the same trick the digit glyph uses
  const [leaving, setLeaving] = useState(false);
  const [wasReady, setWasReady] = useState(ready);
  if (wasReady !== ready) {
    setWasReady(ready);
    setLeaving(!ready);               // typing back in cancels the exit
  }
  // the box has to outlive the arrow leaving as well as its own pull back in
  const exitMs = falls ? ARROW_OUT_MS + SEND_OUT_MS : SEND_OUT_MS;

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
    // the bridge's animations fill both ways too, and a new one would stack on the last
    plug.current?.getAnimations().forEach((a) => a.cancel());
    root.current?.getAnimations().forEach((a) => a.cancel());
    const gap = parseFloat(style.getPropertyValue("--pk-send-gap")) || 16;

    /*
     * translate and scale rather than transform, deliberately — transform belongs to the
     * press feedback, and an animation filling forwards on it would pin the box and leave
     * :active with nothing to do.
     */
    if (falls && !leaving) {
      // the two ends of the push are the dial's; the rest is fixed
      const shut = "calc(-1 * var(--pk-send-gap)) 0";
      const bounce = Number(style.getPropertyValue("--pk-push-bounce")) || 0;
      const pushMs = parseFloat(style.getPropertyValue("--pk-push-ms")) || 260;
      // the arrow can be what does the pushing, rather than turning up once it is over
      const byArrow = (style.getPropertyValue("--pk-arrow-push").trim() || "1") !== "0";
      const shoveAt = byArrow ? SHOVE_AT + ARROW_IN_MS * ARROW_BITES : SHOVE_AT;
      const total = shoveAt + pushMs;

      // the arrow is a CSS animation, and the push's length is the dial's — so the delay
      // it waits out has to be handed to it rather than written in the stylesheet
      // it comes in while the box is still attached and shoves it on the way, or it waits
      // for the box to have settled — the two orders are the point of the switch
      el.style.setProperty("--pk-arrow-delay", `${byArrow ? SHOVE_AT : total}ms`);

      /*
       * The smooth version: no stick, no shove, no beats at all.
       *
       * Everywhere else the box holds attached and is then shoved, because being shoved
       * is the thing those versions are saying. This one says nothing — it opens out of
       * the cell and clears it in a single move, the gap widening the whole way rather
       * than all at the end. There is no moment where it is waiting, so there is no
       * moment that can feel like a stall.
       */
      if (smooth) {
        // from CSS so a version can shorten it without a prop: 380 is above the 300ms
        // ceiling for UI, and against a 234ms exit it made the arrival the slow half of
        // a pair where both are the system answering
        const opened = parseFloat(style.getPropertyValue("--pk-smooth-ms")) || SMOOTH_MS;
        const ms = leaving ? SEND_OUT_MS : opened;
        // The box does not move until the block that pushes it has reached the strip's edge:
        // opening any sooner, it was out and waiting before anything had touched it.
        const lead = (entry === "paste" ? PASTE_FADE_MS : 0) + BLOCK_REACH_MS;
        el.style.setProperty("--pk-arrow-delay", `${lead + ms}ms`);
        // no blurred neck here: its bulge made the box's end of the bridge bigger than the
        // block's, and the bridge below is the whole of the join, crisp at both ends
        // The bridge: a funnel from the block into the box — full height at the strip's
        // face, pinched in the middle, full height again at the box's. Its width IS the
        // progress, so its far end stays on the box's edge as the gap opens; it holds its
        // shape until the neck has thinned behind it, then pinches off. Sizes rather than
        // scale, so the curves keep their shape instead of being squeezed with the bar.
        if (!leaving) {
          const [W, R] = [PLUG_WAIST, PLUG_R];
          plug.current?.animate(
            [// The block's height at both faces, and held there for as long as the block is
             // still pushing: the box starts as the block reaches the strip's edge, and the block
             // has gone into it ~130ms later, which is 0.72 of the eased progress. Shrinking the block's end any
             // earlier left the block bigger than what it was pushing into.
             { width: "0px", height: `${W}px`, "--pk-plug-rl": `${R}px`, "--pk-plug-rr": `${R}px` },
             { width: `${gap * 0.72}px`, height: `${W}px`, "--pk-plug-rl": `${R}px`, "--pk-plug-rr": `${R}px`, offset: 0.72 },
             // then it lets go of the block — a quick break at the block's end —
             { width: `${gap * 0.8}px`, height: "0px", "--pk-plug-rl": "0px", "--pk-plug-rr": `${R}px`, offset: 0.8 },
             // and the box takes in what it was carrying
             { width: `${gap}px`, height: "0px", "--pk-plug-rl": "0px", "--pk-plug-rr": "0px" }],
            { duration: ms, delay: lead,
              easing: "cubic-bezier(0.33, 1, 0.68, 1)", fill: "both" },
          );
        }
        play(
          leaving
            ? [{ translate: heldTranslate, scale: heldScale, opacity: 1 },
               { translate: shut, scale: "0 1", opacity: 1 }]
            : [{ translate: shut, scale: "0 1", opacity: 1 },
               { translate: "0 0", scale: "1 1", opacity: 1 }],
          { duration: ms, delay: lead,
            easing: "cubic-bezier(0.33, 1, 0.68, 1)", fill: "both" },
        );
        return;
      }

      /*
       * Pasted, it starts already part way out.
       *
       * The stuck-then-shoved routine only means anything when something did the
       * shoving: typing the last digit sends a block across the cell, and the box gives
       * way to it. A paste has none of that — the code simply lands — so holding the box
       * attached and then heaving it out reads as a thing stuck to the text rather than a
       * thing being pushed, and it takes 619ms to say it.
       *
       * So on a paste it arrives with the gap already half open and glides the rest,
       * settling at 420ms. One move, no wind-up, nothing to wait through.
       */
      if (entry === "paste") {
        el.style.setProperty("--pk-arrow-delay", `${PASTE_FADE_MS + pushMs}ms`);
        root.current?.animate(
          [{ scale: ".5 .5" }, { scale: "1 0" }],
          { duration: pushMs, delay: PASTE_FADE_MS, easing: easeOut, fill: "both" },
        );
        play(
          [{ translate: "calc(-0.5 * var(--pk-send-gap)) 0", scale: ".86 1", opacity: 1,
             easing: springEasing(bounce, pushMs) },
           { translate: "0 0", scale: "1 1", opacity: 1 }],
          { duration: pushMs, delay: PASTE_FADE_MS, fill: "both" },
        );
        return;
      }

      // The neck: nothing while the box is still attached — there is no gap to span —
      // then stretched across the gap as the box pulls away, thinning the whole time
      // until there is too little of it left to survive the filter's threshold. That is
      // where it breaks. It never decides to break; it runs out.
      root.current?.animate(
        [{ scale: "0 .8" },
         { scale: "0 .8", offset: shoveAt / total },
         { scale: ".55 .42", offset: Math.min(0.99, (shoveAt + pushMs * 0.45) / total) },
         { scale: "1 0" }],
        { duration: total, fill: "both" },
      );

      play(
        // It arrives attached — unfolding out of the last cell with nothing between them,
        // a whole gap's width further left than it ends up. Then it holds. Then it is
        // shoved clear in one move, and the gap is what is left behind.
        // It is not a box appearing beside the strip, it is the strip pushing one out:
        // material forced through a narrow opening, which bulges as it leaves, thins as
        // it is drawn out, and settles once there is nothing pushing it. The corner
        // radius is squashed along with everything else, so the leading edge is rounder
        // the less of the box is out — which is what a thing being extruded looks like.
        [{ translate: shut, scale: "0 1", opacity: 1, easing: easeOut },
         // barely out and thicker than the opening
         { translate: shut, scale: ".38 1.06", opacity: 1,
           offset: (UNFOLD_MS * 0.38) / total, easing: easeOut },
         // drawn out, and thinner for it
         { translate: shut, scale: ".88 .965", opacity: 1,
           offset: (UNFOLD_MS * 0.76) / total, easing: easeOut },
         { translate: shut, scale: "1 1", opacity: 1, offset: UNFOLD_MS / total, easing: "linear" },
         // out, attached, and waiting for the block — the beat of nothing is what makes
         // the shove read as a shove rather than a slide
         { translate: shut, scale: "1 1", opacity: 1, offset: shoveAt / total,
           easing: springEasing(bounce, pushMs) },
         // one segment to its place. Whatever it does on the way past is the curve's,
         // not a keyframe's: a keyframe beyond the target and another back at it is two
         // moves, and looks like it.
         { translate: "0 0", scale: "1 1", opacity: 1 }],
        { duration: total, fill: "both" },
      );
      return;
    }

    // And back, in the order it makes sense in: the arrow leaves first — that is a CSS
    // animation of its own — and only once it is gone does the box get pulled in. The
    // gap closes on an ease-in, accelerating towards the strip, because being pulled is
    // not the same shape as arriving somewhere.
    if (falls && leaving) {
      const shutTo = "calc(-1 * var(--pk-send-gap)) 0";
      // coming back, the neck reaches out to meet the box, then is swallowed as the
      // gap closes behind it
      // the smooth versions' join is the bridge alone — see the open
      if (!smooth) root.current?.animate(
        [{ scale: "1 0" }, { scale: ".55 .42", offset: 0.45 }, { scale: "0 .8" }],
        { duration: SEND_OUT_MS, delay: ARROW_OUT_MS, fill: "both" },
      );
      // The same funnel, backwards: it forms as the box starts back, and its width is
      // the gap closing — the same keyframes and curve as the box's own return, as a
      // separate animation so that nothing in between bends it off the box's edge.
      const back = { duration: SEND_OUT_MS, delay: ARROW_OUT_MS, fill: "both" } as const;
      if (smooth) plug.current?.animate(
        [{ width: `${gap}px`, easing: "cubic-bezier(0.55, 0, 0.85, 0.35)" },
         { width: "0px", offset: 0.45 }, { width: "0px" }], back);
      if (smooth) plug.current?.animate(
        [{ height: "0px", "--pk-plug-rl": "0px", "--pk-plug-rr": "0px" },
         // it forms at the box first — the box giving back what it took —
         { height: "0px", "--pk-plug-rl": "0px", "--pk-plug-rr": `${PLUG_R / 2}px`, offset: 0.06 },
         { height: `${PLUG_WAIST / 2}px`, "--pk-plug-rl": "0px", "--pk-plug-rr": `${PLUG_R}px`, offset: 0.14 },
         // and reaches the block, the same height at both faces again
         { height: `${PLUG_WAIST}px`, "--pk-plug-rl": `${PLUG_R}px`, "--pk-plug-rr": `${PLUG_R}px`, offset: 0.26 },
         { height: `${PLUG_WAIST}px`, "--pk-plug-rl": `${PLUG_R}px`, "--pk-plug-rr": `${PLUG_R}px` }], back);

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
  }, [leaving, entry, ready, falls, fluid, smooth]);

  if (!ready && !leaving) return null;
  // everywhere but the clearing version it stays put while verifying — inert, dimmed — so
  // success can fade it out with the cells instead of it blinking away under the press
  const busy = checking;

  return (
    <>
      {fluid && (
        // the root stays behind at the strip's edge; the blob is the box's green, and the
        // neck between them is the filter's doing, not a shape anyone drew. Not in the
        // smooth versions: the bridge is their whole join, and the layer drew nothing
        // there — while its blur margin still reached 48px past the box, off the edge of
        // a narrow screen.
        <>
          {!smooth && (
            <span className="pk-goo" aria-hidden="true">
              <span className="pk-goo-root" ref={root} />
              <span className="pk-goo-blob" ref={blob} />
            </span>
          )}
          <span className="pk-goo-plug" ref={plug} aria-hidden="true" />
        </>
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
