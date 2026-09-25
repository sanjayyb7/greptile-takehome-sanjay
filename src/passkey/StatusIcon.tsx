import { useId } from "react";
import type { Status } from "./usePasskey";

/* The tokens, not the hex. The mark is drawn in SVG, so its colours come through as fill
   and stroke rather than from a stylesheet — and spelling #107A4D here meant the one part
   of the field that could not follow the palette into dark mode. */
const GREEN = "var(--pk-focus)";

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
 * The spinner's 8 spokes, one every 45°.
 *
 * The design draws the spinner as a single path, which can't spin visibly — 8 spokes at
 * 45° look identical under rotation — and can't come apart. Drawn as separate spokes they
 * carry the spin as a fading trail, and on a verdict they gather into one dot at the
 * centre, which the mark then opens out of.
 */
const SPOKES = [0, 45, 90, 135, 180, 225, 270, 315];

export function StatusIcon({ status, fail = null }: {
  status: Status;
  /**
   * A refusal closing the same way a success does. "closing" keeps the spinner on screen
   * while its spokes gather, "mark" opens the dot into a red "!".
   */
  fail?: "closing" | "mark" | null;
}) {
  /* Before the early return, because a hook has to run on every render. Generated rather
     than written out: the tick is revealed by a clipPath referenced by id, and two fields
     on a page would define the same id twice — both ticks would then be clipped by the
     first field's path. */
  const clipId = useId();
  if (status !== "verifying" && status !== "success" && !fail) return null;

  return (
    <span className="pk-icon">
      <svg className="pk-spinner" viewBox="0 0 26 26" width="26" height="26" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        {SPOKES.map((a, i) => (
          <rect
            key={a}
            className="pk-spoke"
            x="12" y="10" width="2" height="6" rx="1"
            fill={GREEN}
            style={{ "--i": i, "--a": a } as React.CSSProperties}
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
          <path clipPath={`url(#${clipId})`} fill={GREEN} fillRule="nonzero" d={CHECK} />
        </g>
        <g className="pk-check-tick">
          {/* pathLength normalises the stroke to 1, so a dash of 1 covers it exactly and
              the offset runs 1 → 0 whatever the geometry measures */}
          <path d={TICK} fill="none" stroke={GREEN} strokeWidth="2"
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
