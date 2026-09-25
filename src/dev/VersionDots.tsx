import { useEffect, useRef, useState } from "react";
import { FINAL, VERSIONS, type Version } from "../passkey/variants";
import "./versions.css";

/** how long the outgoing number is held on for — its own fade, and nothing more. The
 *  incoming one waits that long before it starts, so the two never share the circle. */
const NUM_SWAP_MS = 130;

/** what a dot is called. Position by default; a revision says 8.1 rather than claiming a
 *  place of its own in the running order, because it is the same work corrected. */
const nameOf = (i: number) => VERSIONS[i]?.label ?? String(i + 1);

/**
 * Switches between the explorations, and says which one is which.
 *
 * A radio group rather than buttons: they are one choice with several answers, so arrow
 * keys move between them and a screen reader says which is current. The dots carry the
 * name and the number as their label — the visible text under them is only there for the
 * eye.
 *
 * The one being shown grows into a numbered disc and the rest stay as dots, which is what
 * lets the row be counted. Nothing about the layout changes when the selection moves: the
 * disc is a single element that slides along the track on a transform, and each dot keeps
 * its own slot whether it is the selected one or not. A row of items re-laying itself out
 * on every click is a lot of work for a thing that should feel like one disc moving.
 *
 * The number belongs to the disc, not to the slot underneath it. Kept per slot and
 * cross-faded, the disc crossed the gap empty — white numerals on a grey track are
 * invisible, so the one being left and the one being approached both disappeared for the
 * length of the journey and the new one appeared on arrival. Carried, it rides across and
 * only its value changes, which it does by resolving in place: the old one softens and
 * goes, the new one comes up out of the blur behind it.
 */
export function VersionDots({ value, onChange, beside }: {
  value: Version;
  onChange: (v: Version) => void;
  /** anything that belongs beside the track — the theme switch, here */
  beside?: React.ReactNode;
}) {
  const at = VERSIONS.findIndex((v) => v.id === value);
  const current = VERSIONS[at];
  const chosen = value === FINAL;

  // the number being replaced, held on so there is something to roll out — the same
  // trick the digit glyph uses, and for the same reason: React would otherwise drop it
  // in the frame the new one mounts, leaving nothing to animate
  const [outgoing, setOutgoing] = useState<number | null>(null);
  const was = useRef(at);
  if (was.current !== at) {
    setOutgoing(was.current);
    was.current = at;
  }
  useEffect(() => {
    if (outgoing === null) return;
    const id = window.setTimeout(() => setOutgoing(null), NUM_SWAP_MS);
    return () => clearTimeout(id);
  }, [outgoing]);
  return (
    <div className="pk-versions">
      {/* the track keeps the middle of the page to itself; whatever sits beside it hangs
          off its edge rather than sharing the row, so adding one does not move the other */}
      <div className="pk-versions-row">
      <div className="pk-versions-track" role="radiogroup" aria-label="Version">
        {/* the disc, under the numbers and over the dots. Black when what it is sitting
            on is the chosen one, so the row still says which that is while it is open */}
        <span className="pk-versions-disc" aria-hidden="true"
          data-final={chosen ? "" : undefined}
          style={{ "--pk-v-at": at } as React.CSSProperties}>
          <span className="pk-versions-disc-num" key={at}>{nameOf(at)}</span>
          {outgoing !== null && (
            <span className="pk-versions-disc-num" data-leaving="" key={`out-${outgoing}`}>
              {nameOf(outgoing)}
            </span>
          )}
        </span>
        {VERSIONS.map((v, i) => (
          <button
            key={v.id}
            type="button"
            role="radio"
            className="pk-version-dot"
            aria-checked={v.id === value}
            data-final={v.id === FINAL ? "" : undefined}
            aria-label={`${nameOf(i)}. ${v.name}${v.id === FINAL ? " (chosen)" : ""} — ${v.note}`}
            title={v.id === FINAL ? `${nameOf(i)}. ${v.note} — the one chosen` : `${nameOf(i)}. ${v.note}`}
            onClick={() => onChange(v.id)}
            onKeyDown={(e) => {
              // arrow keys walk the group, as a radio group should
              const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1
                : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1
                : 0;
              if (!step) return;
              e.preventDefault();
              onChange(VERSIONS[(i + step + VERSIONS.length) % VERSIONS.length].id);
            }}
          />
        ))}
      </div>
        {beside}
      </div>
      {/* keyed so the line changes over rather than swapping in place */}
      <p className="pk-versions-note" key={value} aria-hidden="true">
        {chosen && <strong>The one chosen. </strong>}{current?.note}
      </p>
    </div>
  );
}
