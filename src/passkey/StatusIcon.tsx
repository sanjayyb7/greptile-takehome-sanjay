import { useId } from "react";
import type { Status } from "./usePasskey";

/* The tokens, not the hex. The mark is drawn in SVG, so its colours come through as fill
   and stroke rather than from a stylesheet — and spelling #107A4D here meant the one part
   of the field that could not follow the palette into dark mode. */
const GREEN = "var(--pk-focus)";
const ON_GREEN = "var(--pk-on-focus)";

/** the design's authenticated glyph — square wall and tick are one filled path */
const CHECK = "M17.708 8.292a1 1 0 0 1 0 1.416l-7 7a1 1 0 0 1-1.416 0l-3-3a1 1 0 0 1 1.416-1.416L10 14.586l6.292-6.294a1 1 0 0 1 1.416 0ZM24 2v20a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h20a2 2 0 0 1 2 2Zm-2 20V2H2v20h20Z";

/**
 * The same tick, as the centreline of the stroke whose outline CHECK draws.
 *
 * CHECK's tick is the filled outline of a 2px round-capped stroke: its arcs are radius 1
 * and centred on (17,9), (10,16) and (7,13), so stroking those three points at width 2
 * with round caps and joins renders exactly the same shape. Drawn rather than filled, the
 * line has a length to offset a dash along, which is what lets it be traced — a clip can
 * only sweep a straight edge across it, which near the bend is not the stroke's direction.
 *
 * Written tip first: upper right, down the long stroke to the bend, up the short one.
 */
const TICK = "M17 9L10 16L7 13";

/**
 * The spinner's 8 spokes, and where each one comes to rest on the square.
 *
 * The design draws the spinner as a single path, which can't spin visibly — 8 spokes at
 * 45° look identical under rotation — and can't come apart. Drawn as separate spokes they
 * can carry the spin (a fading trail) and then travel out to the square's edges, two per
 * side, so the lines themselves lay out the box before it fills in.
 *
 * Offsets are from the 26-box centre (13,13). 11 puts a spoke on the wall of the 24px
 * check that follows, so the dashed square and the real one are the same size. The g*
 * targets instead lay the pins along the whole checkbox — four along the square's sides,
 * four along the tick's strokes — so the ring assembles the entire mark, not just the tick.
 */
const SPOKES = [
  // a: where it sits on the ring. t*: the swish target (the square's edges).
  // g*: the merge target — four pins stretch into the square's sides, four squash onto
  // the tick's strokes, so the eight of them draw the whole checkbox. gs scales a pin
  // along its length: 22/6 for a full side, 5.45/6 and 2.62/6 for the tick's halves.
  { a: 0, x: 5.5, y: -11, r: 90, gx: 0, gy: -11, gr: 90, gs: 3.667 },
  { a: 45, x: 11, y: -5.5, r: 0, gx: 3.775, gy: -1.075, gr: 45, gs: 0.908 },
  { a: 90, x: 11, y: 5.5, r: 0, gx: 11, gy: 0, gr: 0, gs: 3.667 },
  { a: 135, x: 5.5, y: 11, r: 90, gx: -0.075, gy: 2.775, gr: 45, gs: 0.908 },
  { a: 180, x: -5.5, y: 11, r: 90, gx: 0, gy: 11, gr: 90, gs: 3.667 },
  { a: 225, x: -11, y: 5.5, r: 0, gx: -2.925, gy: 3.775, gr: 135, gs: 0.436 },
  { a: 270, x: -11, y: -5.5, r: 0, gx: -11, gy: 0, gr: 0, gs: 3.667 },
  { a: 315, x: -5.5, y: -11, r: 90, gx: -4.775, gy: 1.925, gr: 135, gs: 0.436 },
];

/**
 * The original pair, before any of the hand-off work.
 *
 * The design draws the spinner as one path, and the first build simply rotated it in
 * eight steps — a tick rather than a sweep, because eight spokes at 45 degrees look
 * identical under continuous rotation and only a stepped one reads as turning. Success
 * swapped it for the filled checkbox. That is the whole of it: nothing gathers, nothing
 * is drawn, nothing travels.
 */
const SPINNER = "M14 1v4a1 1 0 1 1-2 0V1a1 1 0 1 1 2 0Zm4.656 7.344a1 1 0 0 0 .708-.294l2.828-2.828a1 1 0 1 0-1.414-1.415L17.95 6.636a1 1 0 0 0 .707 1.708ZM25 12h-4a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2Zm-5.636 5.95a1 1 0 0 0-1.414 1.414l2.828 2.828a1 1 0 0 0 1.414-1.414l-2.828-2.828ZM13 20a1 1 0 0 0-1 1v4a1 1 0 1 0 2 0v-4a1 1 0 0 0-1-1Zm-6.364-2.05-2.829 2.828a1 1 0 1 0 1.415 1.414l2.828-2.828a1 1 0 0 0-1.414-1.414ZM6 13a1 1 0 0 0-1-1H1a1 1 0 1 0 0 2h4a1 1 0 0 0 1-1Zm-.778-9.193A1 1 0 0 0 3.807 5.222L6.636 8.05A1 1 0 0 0 8.05 6.636L5.222 3.807Z";

export function StatusIcon({ status, origin = false, filled = false, fail = null }: {
  status: Status; origin?: boolean;
  /** the mark closes into a solid box instead of arriving as an outline — see filledMark */
  filled?: boolean;
  /**
   * A refusal closing the same way a success does — see verdictInRow. "closing" keeps the
   * spinner on screen while its spokes gather, "mark" opens the dot into a red "!".
   */
  fail?: "closing" | "mark" | null;
}) {
  /* Before the early return, because a hook has to run on every render. Generated rather
     than written out: the tick is revealed by a clipPath referenced by id, and two fields
     on a page would define the same id twice — both ticks would then be clipped by the
     first field's path. */
  const clipId = useId();
  if (status !== "verifying" && status !== "success" && !fail) return null;

  if (origin) {
    return (
      <span className="pk-icon">
        {status === "verifying" ? (
          <svg className="pk-spin-origin" viewBox="0 0 26 26" width="26" height="26"
            xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path fill={GREEN} fillRule="nonzero" d={SPINNER} />
          </svg>
        ) : (
          <svg className="pk-check-origin" viewBox="0 0 24 24" width="24" height="24"
            xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path fill={GREEN} fillRule="nonzero" d={CHECK} />
          </svg>
        )}
      </span>
    );
  }

  return (
    <span className="pk-icon">
      <svg className="pk-spinner" viewBox="0 0 26 26" width="26" height="26" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        {SPOKES.map((s, i) => (
          <rect
            key={s.a}
            className="pk-spoke"
            x="12" y="10" width="2" height="6" rx="1"
            fill={GREEN}
            style={{
              "--i": i, "--a": s.a,
              "--tx": s.x, "--ty": s.y, "--tr": s.r,      // swish: the square's edges
              "--gx": s.gx, "--gy": s.gy, "--gr": s.gr, "--gs": s.gs,   // merge: the whole checkbox
            } as React.CSSProperties}
          />
        ))}
      </svg>
      <svg className="pk-check" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <clipPath id={clipId}>
            {/* even-odd: the whole box minus the inner box, i.e. the square wall only */}
            <path clipRule="evenodd" d="M0 0H24V24H0Z M4.5 6.5H19.5V18.5H4.5Z" />
          </clipPath>
        </defs>
        <g className="pk-check-wall">
          {/* filled: a solid disc from the frame it appears on, rather than an outline
              that fills in afterwards. A circle and not the design's square, because the
              thing it opens out of is round — eight spokes on a ring, pulled in until
              they overlap into a dot. Scaled from .12 that disc is 2.88px across, which
              is the dot's own size, so the mark is the dot growing rather than a
              different shape taking its place. Same element and same entrance either
              way; only what is drawn inside it differs. */}
          {filled
            ? <circle cx="12" cy="12" r="12" fill={GREEN} />
            : <path clipPath={`url(#${clipId})`} fill={GREEN} fillRule="nonzero" d={CHECK} />}
        </g>
        <g className="pk-check-tick">
          {/* pathLength normalises the stroke to 1, so a dash of 1 covers it exactly and
              the offset runs 1 → 0 whatever the geometry measures */}
          <path d={TICK} fill="none" stroke={filled ? ON_GREEN : GREEN} strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            pathLength="1" strokeDasharray="1" />
        </g>
      </svg>
      {/* The refusal's mark, opening out of the same dot. Rendered through the close as
          well as after it, so its entrance is a transition from where it already is
          rather than a thing appearing. Written the way a hand writes it: the stem is
          traced first, the full stop last. */}
      {fail && (
        <svg className="pk-bang" viewBox="0 0 24 24" width="24" height="24"
          xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <g className="pk-bang-glyph">
            <path className="pk-bang-stem" d="M12 4.5L12 14.5" fill="none" stroke="var(--pk-bad)"
              strokeWidth="2.4" strokeLinecap="round" pathLength="1" strokeDasharray="1" />
            <circle className="pk-bang-dot" cx="12" cy="19.3" r="1.3" fill="var(--pk-bad)" />
          </g>
        </svg>
      )}
    </span>
  );
}
