import { forwardRef, useEffect, useRef, useState } from "react";
import { PasskeySend, SEND_IN_MS, SEND_OUT_MS } from "./PasskeySend";
import { PASTE_FADE_MS, PASTE_SEND_MS, SHAKE_MS } from "./timing";
import type { usePasskey } from "./usePasskey";

type Passkey = ReturnType<typeof usePasskey>;

/*
 * The rejection, with some body to it.
 *
 * A rectangle sliding left and right is a rectangle sliding left and right. What makes a
 * shake read as a thing with mass is squash and stretch: it draws out along its line of
 * travel when it is moving fastest — mid-swing, between the extremes — and compresses
 * when it turns round, because that is when it is being stopped. So the stretch sits
 * between the keyframes that carry the furthest displacement, not on them.
 *
 * One table, four tracks, so the strip and everything hanging off it stay in step:
 *   x, sx, sy   the strip itself
 *   lag         how far the send box falls behind the swing
 *   neck        how thick the liquid between them is at that moment
 */
const SHAKE_FRAMES = [
  //  at     x    sx     sy      lag  neck
  { at: 0,    x:  0, sx: 1.000, sy: 1.000, lag:  0,   neck: 0 },
  { at: 0.09, x: -5, sx: 1.026, sy: 0.974, lag:  1.8, neck: 0.22 },
  { at: 0.19, x: -7, sx: 0.984, sy: 1.016, lag:  2.5, neck: 0.14 },
  { at: 0.33, x:  3, sx: 1.022, sy: 0.978, lag: -1.0, neck: 0.26 },
  { at: 0.45, x:  6, sx: 0.988, sy: 1.012, lag: -2.1, neck: 0.16 },
  { at: 0.58, x: -2, sx: 1.013, sy: 0.987, lag:  0.7, neck: 0.24 },
  { at: 0.68, x: -4, sx: 0.994, sy: 1.006, lag:  1.4, neck: 0.18 },
  { at: 0.80, x:  1, sx: 1.006, sy: 0.994, lag: -0.3, neck: 0.20 },
  { at: 0.88, x:  2, sx: 0.998, sy: 1.002, lag: -0.7, neck: 0.10 },
  { at: 1,    x:  0, sx: 1.000, sy: 1.000, lag:  0,   neck: 0 },
];

const SHAKE = SHAKE_FRAMES.map((f) => ({
  transform: `translateX(${f.x}px) scale(${f.sx}, ${f.sy})`, offset: f.at,
}));

/* The box is the heavy end. It rides the strip, so this is only what it fails to follow:
   a counter-move against the swing, which leaves it trailing the whipping cells. */
const SHAKE_DRAG = SHAKE_FRAMES.map((f) => ({
  transform: `translateX(${f.lag}px)`, offset: f.at,
}));

/* And the liquid comes back to span what the drag opens up. The neck is already the full
   width of the gap and lying flat — that is how it was left when it broke — so this only
   thickens it: fullest as the strip gathers back through centre, drawn thin at the
   extremes where the box is furthest behind, and flat again at the end, which is exactly
   where the send box's own animation left it. */
const SHAKE_NECK = SHAKE_FRAMES.map((f) => ({ scale: `1 ${f.neck}`, offset: f.at }));

/** keep in step with the pk-digit-out duration in passkey.css. Not --pk-digit-ms: the
 *  exit has its own, shorter time, and holding the glyph for the entrance's instead left
 *  it mounted 200ms after it had finished leaving. */
const EXIT_MS = 120;
/** fallback only: the wipe's real duration is read off --pk-caret-ms so the dev dial
 *  and the stylesheet stay the single source of truth. */
const CARET_MS = 300;



function caretMs(el: Element | null) {
  if (!el) return CARET_MS;
  const v = getComputedStyle(el).getPropertyValue("--pk-caret-ms").trim();
  const ms = v.endsWith("ms") ? parseFloat(v) : v.endsWith("s") ? parseFloat(v) * 1000 : NaN;
  return Number.isFinite(ms) ? ms : CARET_MS;
}

/**
 * The glyph for one cell. It outlives the value it shows: when the cell is cleared the
 * digit stays mounted long enough to slide back out, and a newly typed digit cancels
 * that exit so the two never overlap.
 */
function Digit(
  { value, stamp, fade, crossMs }:
  { value: string; stamp: number;
    /** resolves into focus rather than travelling: "paste" takes the paste's own short
     *  window, "typed" the digit's full duration, which is what the first version used */
    fade: false | "paste" | "typed";
    /** the long travel, all the way through the cell's bottom edge — see version 13 */
    crossMs?: number },
) {
  const [shown, setShown] = useState(value);
  const [leaving, setLeaving] = useState<string | null>(null);
  const glyph = useRef<HTMLSpanElement>(null);
  // How long the block that reveals this digit is taking. Held in a ref, and deliberately
  // not a dependency of the entrance below: it is a property of the moment the digit
  // landed, not state to react to. The wipe unmounts when it finishes, which takes this
  // back to undefined — as a dependency that re-ran the entrance on an already-written
  // digit, which dipped it back to nothing and brought it in a second time.
  const cross = useRef(crossMs);
  cross.current = crossMs;
  const ghost = useRef<HTMLSpanElement>(null);
  /** the crossing this digit is leaving under, resolved when it starts to go */
  const exitMs = useRef(EXIT_MS);

  if (shown !== value) {                       // derived during render, not in an effect
    setShown(value);
    setLeaving(value ? null : shown || null);  // typed over: no exit, the entrance takes over
  }

  /*
   * The exit's length is read here rather than during render. useWipe creates the wipe
   * with a render-phase setState, so on the pass where this digit's value changes the
   * crossing has not been published yet and the prop is still undefined — reading it then
   * fell back to EXIT_MS every time, and the digit went in 120ms flat instead of taking
   * as long as the block crossing the cell. By the time an effect runs, it is there.
   *
   * Unwritten the way it was written: the mirror of the entrance. The digit goes over the
   * first half, which is as long as the block takes to sweep back across the cell, and is
   * gone by the time the block is over it.
   */
  useEffect(() => {
    if (!leaving) return;
    const ms = cross.current ?? EXIT_MS;
    exitMs.current = ms;

    const el = ghost.current;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let out = ms;
    if (el && !still) {
      // rubbed out the way it was written: held at full size until the block covers the
      // cell, then gone behind it
      el.animate(
        [{ opacity: 1, scale: "1" },
         { opacity: 0, scale: "0.5", offset: 0.5 },
         { opacity: 0, scale: "0.5" }],
        { duration: ms, easing: "ease-in-out", fill: "both" },
      );
    }
    exitMs.current = out;

    const id = window.setTimeout(() => setLeaving(null), out);
    return () => clearTimeout(id);
  }, [leaving]);

  // WAAPI, not a keyframe: typing is the fastest-triggered motion here, and a keyframe
  // restarts from zero. Reading the element's current values first means a digit entered
  // mid-flight carries on from where it is rather than snapping back down.
  useEffect(() => {
    const el = glyph.current;
    if (!el || !value) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const style = getComputedStyle(el);
    const blur = style.getPropertyValue("--pk-digit-blur").trim() || "4px";
    // the travel this digit is being revealed by, when there is one: the block's own
    // duration is paced to how fast the caret is being moved, so taking the nominal one
    // leaves the two with different midpoints and the digit turning up after the block
    // has already gone
    const ms = cross.current ?? (parseFloat(style.getPropertyValue("--pk-digit-ms")) || 300);
    const easing = style.getPropertyValue("--pk-digit-ease").trim() || "ease-out";

    const running = el.getAnimations();
    const held = running.length
      ? { translate: style.translate, scale: style.scale, opacity: style.opacity, filter: style.filter }
      : null;
    running.forEach((a) => a.cancel());

    // The digit does not travel: it resolves where it already is. Pasted, because it was
    // not placed here one keystroke at a time; typed, because that is what the first
    // version did and this is how it is kept. translate is still written at both ends, or
    // a filled entrance from before would leave it sitting off its line.
    if (fade) {
      // a typed fade carries the whole entrance, so it gets the heavier blur and longer
      // window it was tuned at; a pasted one is a detail inside a bigger move
      const fadeBlur = style.getPropertyValue("--pk-fade-blur").trim() || blur;
      const fadeMs = parseFloat(style.getPropertyValue("--pk-fade-ms")) || ms;
      el.animate(
        [held ?? { opacity: 0, filter: `blur(${fade === "paste" ? blur : fadeBlur})`, translate: "0 0" },
         { opacity: 1, filter: "blur(0)", translate: "0 0" }],
        { duration: fade === "paste" ? PASTE_FADE_MS : fadeMs, easing, fill: "both" },
      );
      return;
    }

    /*
     * Typed, the digit is written by the block passing over it rather than arriving on
     * its own. It is held at nothing for the first half, which is exactly as long as the
     * block takes to reach its widest and cover the cell, and then scales up behind it as
     * it leaves. --pk-digit-ms is locked to --pk-caret-ms for that reason: the halfway
     * point of this and the halfway point of the travel are the same instant, and if they
     * drift the digit either shows through the block or turns up after it has gone.
     *
     * ease-in-out, matching the block's own curve, so the two stay in step across the
     * whole of it and not merely at the ends.
     */
    el.animate(
      [held ?? { opacity: 0, scale: "0.5", translate: "0 0", filter: "blur(0)" },
       { opacity: 0, scale: "0.5", offset: 0.5 },
       { opacity: 1, scale: "1", translate: "0 0", filter: "blur(0)" }],
      { duration: ms, easing: "ease-in-out", fill: "both" },
    );
  }, [value, stamp, fade]);

  // no key: the span persists so an in-flight entrance has something to retarget from
  if (value) return <span className="pk-digit" ref={glyph}>{value}</span>;
  if (leaving) return <span className="pk-digit pk-digit-out" ref={ghost} key={`out-${stamp}`}>{leaving}</span>;
  return null;
}

/**
 * A single caret for the whole strip, so it travels across the dividers into the next
 * cell rather than disappearing and reappearing. It holds solid while it moves — a blink
 * mid-journey would hide the very motion it's meant to show.
 *
 * In the kept version it deliberately never travels: the wipe below is what reads as the
 * movement. The earlier explorations move it instead, and the smear needs to know when a
 * journey is under way, which is what data-moving marks.
 */
function Caret({ index, hidden }: { index: number; hidden: boolean }) {
  return (
    <span
      className="pk-caret"
      aria-hidden="true"
      data-hidden={hidden || undefined}
      style={{ "--pk-caret-i": index } as React.CSSProperties}
    />
  );
}

type Wipe = { from: number; to: number; id: number; ms: number; delay: number; push: boolean };

/** Tracks the caret's jumps so the cells either side of one can each draw their half. */
function useWipe(
  index: number | null,
  pace: React.RefObject<number | null>,
  /** the slot past the last cell, where the send box opens */
  sendSlot: number,
  /** the code was pasted, so the move out to the box carries the moment on its own */
  pasted: boolean,
  /**
   * The box is going because the code was refused, so the caret's return to the last cell
   * is not a journey anybody made — draw nothing for it.
   *
   * Every other move out of the box is one: a Backspace on a complete code sends the
   * block back into the cell as the box folds away, and the two read as one gesture. A
   * rejection is not that. The box is leaving because there is nothing left for it to
   * send, and a block sliding in on top of a strip that is shaking and red is a second
   * event competing with the one that matters.
   */
  hushFromBox: boolean,
) {
  const ref = useRef<HTMLElement | null>(null);
  const [at, setAt] = useState(index);
  const [wipe, setWipe] = useState<Wipe | null>(null);
  const movedAt = useRef(0);

  // only tracked while there is a cell to track: moving between cells blurs one before
  // focusing the next, and treating that momentary null as a destination would swallow
  // the very move we are here to draw.
  if (index !== null && at !== index) {
    if (at !== null && !(hushFromBox && at === sendSlot)) {
      /*
       * A run that states its own cadence gets paced to it. Nothing else does.
       *
       * Held Backspace walks back faster than a full crossing takes, so each wipe was
       * being cut off and restarted a cell to the left — a lurch rather than a travel.
       * Giving one only the time until the next move lets every one of them finish, and
       * the held erase reads as one continuous sweep back.
       *
       * That used to fall back to the time since the LAST move for everything else,
       * which quietly turned typing into a race: the gap between two keystrokes became
       * the length of the crossing, so the faster you typed the shorter each block's
       * travel got, down to a 60ms floor. The speed of the last two keys says nothing
       * about how long this one crossing should take, and the crossing is least legible
       * exactly when it is shortest. Typing now always gets the full travel, and a
       * keystroke that lands mid-crossing replaces the wipe rather than hurrying it.
       */
      const now = performance.now();
      const gap = pace.current;
      // in and out of the send box the block borrows the box's own timing, so the two
      // read as one gesture: the block sweeps out of the last cell as the box opens out
      // of the strip, and back into the cell as the box folds away
      const toBox = index === sendSlot;
      const fromBox = at === sendSlot;
      // erasing takes exactly as long as writing: a crossing is a crossing, whichever
      // way it is going, and the digit's exit is locked to it either way
      const full = caretMs(ref.current);
      const ms = toBox ? (pasted ? PASTE_SEND_MS : SEND_IN_MS)
        : fromBox ? SEND_OUT_MS
        : gap === null ? full
        : Math.min(full, Math.max(60, gap));
      // after the pasted digits have resolved, not over the top of them
      const delay = toBox && pasted ? PASTE_FADE_MS : 0;
      // A move to or from the box is always between it and the last cell, whatever the
      // caret was doing beforehand. A paste fills every cell at once and leaves focus at
      // the first, and taking that literally sent the block out of cell one — it is the
      // last cell that pushes the box out, because that is the one the box opens from.
      const from = toBox ? sendSlot - 1 : at;
      const to = fromBox ? sendSlot - 1 : index;
      movedAt.current = now;
      // a paste has no caret sitting in the last cell for the block to grow out of, so
      // it starts clear of the digit and already travelling — see pk-caret-wipe-push
      setWipe({ from, to, id: now, ms, delay, push: toBox && pasted });
    }
    setAt(index);
  }

  useEffect(() => {
    if (!wipe) return;
    const id = window.setTimeout(() => setWipe(null), wipe.ms + wipe.delay);
    return () => clearTimeout(id);
  }, [wipe]);

  return { wipe, ref };
}

/** One cell's share of the wipe. It is rendered INSIDE the cell's clip layer, so the bar
 *  is cut at the inner edge of the border exactly as a digit is: the divider and the focus
 *  ring stay unbroken on top and the bar passes beneath them, rather than across. */
const WipeHalf = forwardRef<HTMLSpanElement, { wipe: Wipe; cell: number }>(
  function WipeHalf({ wipe, cell }, ref) {
    const left = Math.min(wipe.from, wipe.to);
    return (
      <span
        key={wipe.id}
        ref={ref}
        className="pk-caret-wipe"
        data-back={wipe.to < wipe.from || undefined}
        data-push={wipe.push || undefined}
        style={{
          "--pk-wipe-o": left - cell,
          // how far the block has to go, in cells. One for a step between neighbours;
          // more when a cell further off is clicked, and the window has to reach it.
          "--pk-wipe-span": Math.abs(wipe.to - wipe.from) || 1,
          "--pk-wipe-ms": `${wipe.ms}ms`,
          "--pk-wipe-delay": `${wipe.delay}ms`,
        } as React.CSSProperties}
      >
        <i />
      </span>
    );
  },
);

/**
 * The four-slot strip. Each slot is a real input — native caret, mobile numpad, autofill,
 * screen-reader label — with the glyph painted in a decorative layer on top, because an
 * input's own text can't be animated.
 */
export function PasskeyCells({ passkey, length, send }: {
  passkey: Passkey; length: number; send?: boolean;
}) {
  const { digits, stamps, status, shake, busy, focused, cells, write, onKeyDown, onPaste, onFocus, onBlur, erasePace, entry, stale, picked, pick } = passkey;
  const strip = useRef<HTMLDivElement>(null);

  // WAAPI, not CSS: a counter in an attribute doesn't restart a CSS animation — going from
  // data-shake="1" to "2" leaves the selector already matching, so only the first rejection
  // ever played. This restarts on every one, and retargets if they land back to back.
  useEffect(() => {
    if (!shake || !strip.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const opts = { duration: SHAKE_MS, easing: "cubic-bezier(0.77, 0, 0.175, 1)" } as const;
    strip.current.animate(SHAKE, opts);
    // no fill on any of these: each ends on the value the send box's own animations are
    // already holding, so letting them expire hands control straight back
    strip.current.querySelector(".pk-send")?.animate(SHAKE_DRAG, opts);
    strip.current.querySelector(".pk-goo-blob")?.animate(SHAKE_DRAG, opts);
    strip.current.querySelector(".pk-goo-root")?.animate(SHAKE_NECK, opts);
  }, [shake]);

  // matches PasskeySend's own condition: while the box is on screen the last cell gives up
  // its rounded corner, so the two stay flush — including through verifying, where the box
  // waits dimmed rather than leaving
  // the same condition the box itself is under, so the last cell takes its corner back
  // on the frame the box starts leaving rather than after it has gone
  const refused = status === "error";
  /* A code has just been sent, so the complete one on screen is the previous one. Same
     reasoning as a refusal: the button's whole meaning would be "send that", and that is
     the one thing it should not be offering. Taking it away says what is true — the code
     that matters is the one arriving — and hands the cell back its caret, which the box
     holds while it is up. */
  const showSend = Boolean(send) && digits.every(Boolean) && !busy && !refused && !stale;
  // The send box is the position after the last cell. The caret's travel does not stop at
  // the strip's edge: when the box opens the block carries on out into it, and when the
  // box folds away the block comes back out of it into the cell it came from. Only the
  // half inside the last cell is ever drawn — the other lies under the box, where a green
  // block on a green box would show nothing anyway.
  const caretAt = showSend ? length : focused;

  const { wipe, ref: wipeRef } = useWipe(busy ? null : caretAt, erasePace, length,
    entry === "paste", refused);

  return (
    <div className="pk-strip" ref={strip} onPaste={onPaste} data-send={showSend ? "on" : undefined}
      /* The box is up AND nobody has chosen a cell since — which is when the ring and the
         caret stand down. Separate from data-send, because the box being up is not on its
         own a reason to hide where typing would land. */
      data-parked={showSend && !picked ? "" : undefined}
      data-entry={entry === "paste" ? "paste" : undefined}>
      {digits.map((digit, i) => (
        <span className="pk-slot" key={i}
          data-edge={i === 0 ? "first" : i === length - 1 ? "last" : undefined}>
          <input
            ref={(el) => { cells.current[i] = el; }}
            className="pk-cell"
            value={digit}
            readOnly={busy}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            maxLength={1}
            aria-label={`Digit ${i + 1} of ${length}`}
            onChange={(e) => write(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onFocus={(e) => onFocus(i, e)}
            onPointerDown={pick}
            onBlur={onBlur}
          />
          <span className="pk-clip" aria-hidden="true">
            <Digit
              value={digit}
              stamp={stamps[i]}
              fade={entry === "paste" ? "paste" : false}
              /* the block crossing this cell is what writes its digit and what rubs it
                 out: going forward it sets out from this cell, going back it lands on it */
              crossMs={wipe && (wipe.to > wipe.from ? wipe.from === i : wipe.to === i)
                ? wipe.ms : undefined}
            />
            {/* every cell the block passes over draws its share of it, not just the two
                it starts and ends in — otherwise a jump across the strip goes missing in
                the middle, because each cell clips to itself and there is nobody in
                between to draw the part that crosses them */}
            {wipe
              && i >= Math.min(wipe.from, wipe.to) && i <= Math.max(wipe.from, wipe.to) && (
              <WipeHalf wipe={wipe} cell={i} ref={i === wipe.to ? wipeRef : undefined} />
            )}
          </span>
        </span>
      ))}
      {focused !== null && !busy && (
        <Caret index={focused} hidden={Boolean(digits[focused])} />
      )}
      {send && <PasskeySend passkey={passkey} />}
    </div>
  );
}
