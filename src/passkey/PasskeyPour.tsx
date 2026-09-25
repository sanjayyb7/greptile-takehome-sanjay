import { useLayoutEffect, useRef, type RefObject } from "react";
import type { Status } from "./usePasskey";

/*
 * THE POUR — the send box, pressed, becomes the loader.
 *
 *      0ms  the box balls up where it stands, and a neck stretches from it toward the
 *           status slot; a round head leaves along that line with a tail laid out
 *           behind it, so it leaves already a teardrop
 *     ~85ms the neck has thinned to nothing at the box end and the filter snaps it
 *    ~115ms what is left of the box is gone
 *    400ms  the drop hits the slot while still moving: it squashes and bursts, and the
 *           spokes are flung out of the splash already turning
 *    420ms  the travel ends underneath the splash
 *
 * One timing for every part: 420ms on cubic-bezier(0.6, 0, 0.75, 0.9) — a slow start, so
 * the neck has time to stretch, and still fast at the end, so the impact is what breaks
 * the drop rather than it arriving and stopping.
 *
 * The key trick is where the offsets live. WAAPI applies the effect's easing first and the
 * keyframe offsets second, so an offset is a point in EASED progress. `translate` is given
 * only at 0 and 1, so at offset p the drop is exactly p of the way there — which lets the
 * neck's length and the tail's positions be written as offsets alone, with no per-frame JS.
 */
const TRAVEL_MS = 420;
const TRAVEL_EASE = "cubic-bezier(0.6, 0, 0.75, 0.9)";
const SPLASH_AT = 400;
const NECK_THICK = 34;

/** the head's diameter in px through the flight — round throughout, never stretched: a
 *  stretched circle reads as an ellipse or a pill, not a drop */
const HEAD: [offset: number, px: number][] = [[0, 42], [0.3, 36], [0.85, 36], [1, 28]];

/**
 * The tail, which is what makes it a teardrop. Two beads follow the head's straight line,
 * set back along it by `lag` px. They lie along the neck from the first frame, so the
 * break happens at the box end and the drop leaves carrying the neck as its tail, the way
 * a real drip does. Consecutive beads overlap; any gap and it reads as beads on a string.
 *
 * Why this and not a train of lagged drops: the merge range is fixed by the blur (~20-40px),
 * and drops spaced by a TIME lag separate by speed × lag — with the easing peaking near 3×
 * average speed, they break apart. Laying the tail out by distance keeps it joined.
 */
const TAIL: { size: number; lag: [offset: number, px: number][] }[] = [
  { size: 24, lag: [[0, 0], [0.1, 12], [0.2, 16], [0.35, 18], [0.6, 20], [0.85, 22], [1, 6]] },
  { size: 14, lag: [[0, 0], [0.1, 22], [0.2, 30], [0.35, 34], [0.6, 36], [0.85, 40], [1, 10]] },
];

export function PasskeyPour({ enabled, status, rootRef }: {
  enabled: boolean;
  status: Status;
  /** the field, which carries data-pour for the spinner's rules to read */
  rootRef: RefObject<HTMLDivElement | null>;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const source = useRef<HTMLSpanElement>(null);
  const neck = useRef<HTMLSpanElement>(null);
  const drop = useRef<HTMLSpanElement>(null);
  const beads = useRef<(HTMLSpanElement | null)[]>([]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) return;
    const parts = [source.current, neck.current, drop.current, ...beads.current]
      .filter((el): el is HTMLSpanElement => el !== null);

    /* Every pour starts clean. The parts are held by fill:"both" animations, and those
       outlive their run: without this the second press stacks a new travel on top of the
       last pour's exit, which still holds opacity at 0 — and the pour runs invisibly from
       the second press onward. */
    const reset = () => parts.forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
    reset();

    /* Land is kept for the whole wait and cleared only when the status moves on. Handing
       the spokes to another rule mid-wait would restart their spin, and a restart reads
       as the loader pausing. */
    if (status !== "verifying") { delete root.dataset.pour; return; }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const strip = root.querySelector<HTMLElement>(".pk-strip");
    const icon = root.querySelector<HTMLElement>(".pk-icon");
    const L = layer.current;
    // no box on screen — submitted on the last digit, or by Enter with ?auto — so there
    // is nothing to pour, and the loader simply appears as it does everywhere else
    if (!strip || !icon || !L || !root.querySelector(".pk-send")) return;

    /* Measured off the strip, not the send button. The button is scale-animated, so its
       client rect reads as whatever sliver of the open it happens to be at; the strip has
       no transform, and the box's place is fixed relative to it. */
    const css = getComputedStyle(root);
    const gap = parseFloat(css.getPropertyValue("--pk-send-gap")) || 16;
    const cellW = parseFloat(css.getPropertyValue("--pk-cell-w")) || 84;
    const at = L.getBoundingClientRect();
    const s = strip.getBoundingClientRect();
    const t = icon.getBoundingClientRect();
    const box = { left: s.right + gap - at.left, top: s.top - at.top, w: cellW, h: s.height };
    const cx = box.left + box.w / 2;
    const cy = box.top + box.h / 2;
    const dx = t.left + t.width / 2 - at.left - cx;
    const dy = t.top + t.height / 2 - at.top - cy;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const round = (px: number) => `${px / box.w} ${px / box.h}`;

    const place = (el: HTMLElement | null, left: number, top: number, w: number, h: number) => {
      if (!el) return;
      Object.assign(el.style, { left: `${left}px`, top: `${top}px`, width: `${w}px`, height: `${h}px` });
    };
    place(source.current, box.left, box.top, box.w, box.h);
    place(drop.current, box.left, box.top, box.w, box.h);
    place(neck.current, cx, cy - NECK_THICK / 2, len, NECK_THICK);
    if (neck.current) neck.current.style.rotate = `${Math.atan2(dy, dx)}rad`;
    TAIL.forEach((b, i) => place(beads.current[i], cx - b.size / 2, cy - b.size / 2, b.size, b.size));

    // the real box and the strip's goo go the same frame the source takes their place.
    // visibility, not opacity: the box is held by a filling animation, and a filling
    // animation outranks an opacity declaration
    root.dataset.pour = "flight";

    const timing = { duration: TRAVEL_MS, easing: TRAVEL_EASE, fill: "both" } as const;

    // the box itself: it balls up, and what is left after the neck breaks goes fast, or it
    // reads as a second, separate circle staying behind
    source.current?.animate([
      { scale: "1 1", borderRadius: "16px", opacity: 1, offset: 0 },
      { scale: "0.78 0.6", borderRadius: "50%", opacity: 1, offset: 0.1 },
      { scale: "0.42 0.3", opacity: 1, offset: 0.2 },
      { scale: "0 0", opacity: 1, offset: 0.27 },
      { scale: "0 0", opacity: 1, offset: 1 },
    ], timing);

    // a bar from the box's centre to the slot's. Its scaleX IS the offset, so its tip sits
    // on the drop the whole way; its thickness is gone by 0.2 and the filter snaps it first
    neck.current?.animate([
      { scale: "0 1", opacity: 1, offset: 0 },
      { scale: "0.1 0.6", opacity: 1, offset: 0.1 },
      { scale: "0.2 0", opacity: 1, offset: 0.2 },
      { scale: "1 0", opacity: 1, offset: 1 },
    ], timing);

    drop.current?.animate(HEAD.map(([offset, px]) => ({
      scale: round(px), opacity: 1, offset,
      ...(offset === 0 ? { translate: "0px 0px" } : {}),
      ...(offset === 1 ? { translate: `${dx}px ${dy}px` } : {}),
    })), timing);

    TAIL.forEach((b, i) => beads.current[i]?.animate(b.lag.map(([offset, lag]) => ({
      translate: `${offset * dx - lag * ux}px ${offset * dy - lag * uy}px`, opacity: 1, offset,
    })), timing));

    /* The splash, while the drop is still travelling. Layered on top: it only touches
       scale and opacity, so the travel's translate keeps running underneath it. */
    const easeOut = css.getPropertyValue("--ease-out").trim() || "ease-out";
    const [sx, sy] = [28 / box.w, 28 / box.h];
    const splash = window.setTimeout(() => {
      root.dataset.pour = "land";
      drop.current?.animate([
        { scale: `${sx} ${sy}`, opacity: 1 },
        { scale: `${sx * 0.6} ${sy * 1.5}`, opacity: 1, offset: 0.3 },
        { scale: "0 0", opacity: 0 },
      ], { duration: 200, easing: easeOut, fill: "forwards" });
      beads.current.forEach((el) => el?.animate(
        [{ scale: "1", opacity: 1 }, { scale: "0", opacity: 0 }],
        { duration: 120, fill: "forwards" },
      ));
    }, SPLASH_AT);

    // cut short — a fast verdict, a remount — and nothing is left stuck halfway up
    return () => { clearTimeout(splash); reset(); };
  }, [enabled, status, rootRef]);

  if (!enabled) return null;
  return (
    /* A second goo layer, over the whole field. The strip's own layer cannot carry this:
       a filter only renders inside its own region, so a blob leaving it gets hard edges
       halfway up. Every shape that has to merge sits inside this one element. */
    <div className="pk-pour" ref={layer} aria-hidden="true">
      <span className="pk-pour-source" ref={source} />
      <span className="pk-pour-neck" ref={neck} />
      <span className="pk-pour-drop" ref={drop} />
      {TAIL.map((b, i) => (
        <span key={b.size} className="pk-pour-bead" ref={(el) => { beads.current[i] = el; }} />
      ))}
    </div>
  );
}
