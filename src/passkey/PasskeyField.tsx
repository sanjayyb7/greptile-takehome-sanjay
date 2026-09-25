import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { PasskeyCells } from "./PasskeyCells";
import { PasskeyResend } from "./PasskeyResend";
import { StatusIcon } from "./StatusIcon";
import { usePasskey } from "./usePasskey";
import "./passkey.css";

const LENGTH = 4;
/** how long the outgoing line has to be held on for: the pk-v2-label-* delay plus its
 *  duration, 160 + 200. Keep in step with passkey.css. */
const LABEL_SWAP_MS = 360;

type Passkey = ReturnType<typeof usePasskey>;

/** progress sits above the strip, the way the design shows it */
function progress(p: Passkey) {
  if (p.status === "verifying" || p.status === "success") return "Verifying...";
  return "";
}

/**
 * Every line the status row can say. They are all rendered as hidden sizers in the same
 * grid cell: one sizer only sets a minimum, so a longer label grew the lane — and because
 * the row is centred, the icon and the text jumped sideways between states. With all of
 * them in, the lane is the widest from the first frame and never changes.
 */
const STATUS_LINES = ["Verifying...", "Authenticated", "Incorrect code", "Missing digits", "Not verified"];

/**
 * What the status row says once a refusal's mark has landed. Each case its own words,
 * because they ask for different things: a gap wants the rest of the code, a wrong code
 * wants retyping, and a code that could not be checked was never judged at all.
 */
function verdict(p: Passkey) {
  if (p.problem === "incomplete") return "Missing digits";
  if (p.problem === "offline") return "Not verified";
  return "Incorrect code";
}

/** Passcode entry: four cells, a status line above, and the states in between */
export function PasskeyField({ autoFocus = true, autoSubmit = false, send = true,
  length = LENGTH, onVerify, onResend, resendCooldown, resendTo, onSuccess }: {
  autoFocus?: boolean;
  /** submit as soon as the last digit lands; off when the Send button is doing that job */
  autoSubmit?: boolean;
  /** offer a Send button once the code is complete */
  send?: boolean;
  /** how many cells */
  length?: number;
  /** check the code — the stand-in answers to 1234 until something real is passed */
  onVerify?: (code: string) => Promise<boolean>;
  /** ask for a new code, and how long before another can be asked for */
  onResend?: () => Promise<unknown>;
  resendCooldown?: number;
  /** where a new code is sent — named in the confirmation, where it is the whole point */
  resendTo?: string;
  onSuccess?: (code: string) => void;
}) {
  /* The goo filter is referenced from CSS, which cannot know a generated id — so the id is
     generated here and handed to CSS as a variable. Written out, two fields on a page
     would define #pk-goo twice and every filter in both of them would resolve to the
     first, which is the first field's coordinate space. */
  const gooId = useId();
  const passkey = usePasskey({
    length, autoSubmit, stepsWhenHeld: true, handsBackOnError: true,
    onVerify, onResend, resendCooldown, onSuccess,
  });
  const { status, shake, focusAt } = passkey;
  // success runs in two phases: the cells leave first, then the mark arrives
  const [phase, setPhase] = useState<"none" | "clearing" | "done" | "settled">("none");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (autoFocus) focusAt(0); }, [autoFocus, focusAt]);

  /*
   * The verdict is said in the status row, and a refusal closes the loader into a red "!".
   *
   * A success closes the spinner into a tick; a refusal comes out of the same gather: the
   * spokes close to a dot, still green, and at 360ms — the moment a success's mark opens —
   * the dot opens into a red "!". Everything red lands on that frame: the mark, the label,
   * the focused cell, and the shake with it, so it reads as one event. Keyed on the shake
   * counter, so a second refusal of the same code closes and marks again.
   */
  const refused = passkey.problem === "incorrect" || passkey.problem === "offline";
  const [markedAt, setMarkedAt] = useState(-1);
  useEffect(() => {
    if (!refused) return;
    const now = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = window.setTimeout(() => setMarkedAt(shake), now ? 0 : 360);
    return () => clearTimeout(id);
  }, [refused, shake]);
  // a code with a gap was never sent, so there is no loader to close — it marks at once
  const fail: "closing" | "mark" | null = passkey.problem === "incomplete" ? "mark"
    : refused ? (markedAt === shake ? "mark" : "closing")
    : null;

  /*
   * The success sequence, as one timeline measured from the moment verification lands:
   *
   *      0ms  GATHER   the cells and the arrow fade over 160ms while the eight spokes
   *                    stop waving and pull into their shared centre over 280ms
   *    280ms  COMBINE  the solid dot holds still for 80ms, so the merge is perceptible
   *    360ms  EXPAND   that same dot opens into the square, and the tick is drawn across
   *   1000ms  DROP     the mark and the label travel down into the cells' place
   *
   * Two hand-off points, held here; every other beat is offset from them in the
   * stylesheet. 360 is gather + combine; 1000 leaves the tick a clear 280ms to finish, so
   * the line is seen to complete before anything travels.
   */
  useEffect(() => {
    if (status !== "success") return;
    // the wait is the point of the verification, so it is kept; only the transformation is
    // dropped, landing straight on the state it would have arrived at
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("settled");
      return;
    }
    setPhase("clearing");
    const a = window.setTimeout(() => setPhase("done"), 360);
    const b = window.setTimeout(() => setPhase("settled"), 1000);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [status]);

  const above = phase === "done" || phase === "settled" ? "Authenticated"
    : fail === "closing" ? "Verifying..."        // held until the mark, not replaced early
    : fail === "mark" ? verdict(passkey)
    : progress(passkey);

  // A swap needs both lines on screen at once, so the one being replaced is kept for as
  // long as its animation runs. React would otherwise drop it in the same frame the new
  // one mounts, leaving nothing to animate out.
  const [leaving, setLeaving] = useState("");
  const shown = useRef(above);
  if (shown.current !== above) {
    setLeaving(shown.current);
    shown.current = above;
  }
  useEffect(() => {
    if (!leaving) return;
    const id = window.setTimeout(() => setLeaving(""), LABEL_SWAP_MS);
    return () => clearTimeout(id);
  }, [leaving]);

  return (
    /* --pk-length is the cell count as a number the stylesheet can do arithmetic with.
       The strip's width is the cells', so it has to be derived rather than declared: it
       was a flat 336px, which is four cells, and a six-digit field laid its strip outside
       the box that is supposed to contain it. */
    <div className="passkey" ref={rootRef} style={{ "--pk-length": length, "--pk-goo": `url(#${gooId})` } as CSSProperties}
      data-state={status}
      data-fail={fail ?? undefined}
      data-phase={phase === "none" ? undefined : phase}
      data-shake={shake} data-busy={passkey.busy || undefined}>
      {/*
        * The goo filter. Blur everything in the group, then throw
        * the alpha channel's contrast far enough that the blur's soft edge snaps back to
        * a hard one: shapes further apart than the blur stay separate, shapes closer than
        * it merge, and shapes in between are joined by a neck. Nothing draws the neck —
        * it is what is left when two blurred edges overlap enough to survive the
        * threshold, which is why it thins and breaks on its own as they part.
        */}
      <svg className="pk-defs" aria-hidden="true" focusable="false">
        {/* wider than the default region, which would clip the blur at the edges */}
        <filter id={gooId} x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="soft" />
          <feColorMatrix in="soft" type="matrix"
            values="1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                    0 0 0 26 -13" />
        </filter>
      </svg>
      {/* the row keeps its height in every state so the strip never jumps */}
      <p className="pk-status" role="status" aria-live="polite">
        {above && (
          <>
            <StatusIcon status={status} fail={fail} />
            <span className="pk-status-label">
              {/* holds the lane open at the width of the longest line from the start, so
                  the icon beside it never shifts sideways when the text changes */}
              {STATUS_LINES.map((line) => (
                <span className="pk-status-sizer" aria-hidden="true" key={line}>{line}</span>
              ))}
              {/* aria-hidden: the live region announces the line that has arrived, not the
                  one on its way out, and never the frames in between */}
              {leaving && leaving !== above && (
                <span className="pk-status-text" data-leaving="" aria-hidden="true" key={`out:${leaving}`}>
                  {leaving}
                </span>
              )}
              {/* keyed so the new label animates in rather than swapping in place */}
              <span className="pk-status-text" key={above}>{above}</span>
            </span>
          </>
        )}
      </p>
      {/* the strip stays mounted through the whole sequence: its space is what the
          status line travels down into, so it is faded rather than removed */}
      <PasskeyCells passkey={passkey} length={length} send={send}
        shakeOn={fail === "mark" ? shake : 0} />
      <PasskeyResend passkey={passkey} to={resendTo} />
    </div>
  );
}
