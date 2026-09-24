import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { PasskeyCells } from "./PasskeyCells";
import { PasskeyResend } from "./PasskeyResend";
import { StatusIcon } from "./StatusIcon";
import { SHAKE_MS } from "./timing";
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
 * Failures read underneath the strip, and each case gets its own sentence.
 *
 * They ask for different things. "Enter all N digits" is an instruction and the code is
 * fine so far; "Incorrect code" means retype it; "Couldn't verify" means the code was
 * never judged and pressing again is the right move. One message for all three would be
 * wrong twice.
 */
function problem(p: Passkey, length: number) {
  if (p.problem === "incomplete") return `Enter all ${length} digits.`;
  if (p.problem === "incorrect") return "Incorrect code. Try again.";
  if (p.problem === "offline") return "Couldn't verify your code. Try again.";
  return "";
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
  const below = problem(passkey, length);
  // success runs in two phases: the cells leave first, then the mark arrives
  const [phase, setPhase] = useState<"none" | "clearing" | "done" | "settled">("none");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (autoFocus) focusAt(0); }, [autoFocus, focusAt]);

  /* The red lasts exactly as long as the shake: the colour and the movement are one
     event, so they start and stop on the same frames rather than one outliving the other.
     Keyed on the shake counter as well as the status, so a second rejection of the same
     code — which never leaves the error state — flashes again instead of doing nothing. */
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (status !== "error") { setFlash(false); return; }
    setFlash(true);
    const id = window.setTimeout(() => setFlash(false), SHAKE_MS);
    return () => clearTimeout(id);
  }, [shake, status]);

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

  const above = phase === "done" || phase === "settled" ? "Authenticated" : progress(passkey);

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
      data-flash={flash ? "" : undefined}
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
            <StatusIcon status={status} />
            <span className="pk-status-label">
              {/* holds the lane open at the width of the longest line from the start, so
                  the icon beside it never shifts sideways when the text changes */}
              <span className="pk-status-sizer" aria-hidden="true">Authenticated</span>
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
      <PasskeyCells passkey={passkey} length={length} send={send} />
      {/* keyed on the shake counter so the copy re-enters on every rejection, even when
          the same message text repeats */}
      {below && (
        <p className="pk-problem" key={shake} role="status" aria-live="polite">
          <svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true">
            <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 5.75v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="10" cy="13.9" r="0.95" fill="currentColor" />
          </svg>
          {below}
        </p>
      )}
      <PasskeyResend passkey={passkey} to={resendTo} />
    </div>
  );
}
