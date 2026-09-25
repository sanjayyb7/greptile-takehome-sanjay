import { useEffect, useRef, useState, type CSSProperties } from "react";
import { PasskeyCells } from "./PasskeyCells";
import { PasskeyResend } from "./PasskeyResend";
import { StatusIcon } from "./StatusIcon";
import { usePasskey } from "./usePasskey";
import "./passkey.css";

const LENGTH = 4;
/** how long the outgoing line has to be held on for: the pk-v2-label-* delay plus its
 *  duration, 160 + 200. Keep in step with passkey.css. */
const LABEL_SWAP_MS = 360;
/** how long the authenticated row takes to travel down — the pk-status translate
 *  transition on data-phase="settled". Only a backstop: completion is read off the
 *  transition's own end. Keep in step with passkey.css. */
const DROP_MS = 280;

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
  length = LENGTH, onVerify, onResend, resendCooldown, resendTo, onSuccess,
  onSuccessAnimationComplete }: {
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
  /** the code was accepted — the moment the check answers, while the success animation
   *  is only starting */
  onSuccess?: (code: string) => void;
  /** and the success animation has finished, the downward move included: the moment to
   *  navigate away. Once per success. Under reduced motion, as soon as the final
   *  authenticated state is on screen. */
  onSuccessAnimationComplete?: (code: string) => void;
}) {
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

  /*
   * The end of the success sequence, told once. It is the DROP's own transition ending
   * that says so rather than a timer counting to 1280, so the notice lands on the frame
   * the row arrives however the stylesheet is timed; the timer is only there in case no
   * transition runs at all. Reduced motion lands straight on "settled" with no travel, so
   * that is announced as soon as it has been painted.
   */
  const statusRef = useRef<HTMLParagraphElement>(null);
  const finished = useRef(onSuccessAnimationComplete);
  useEffect(() => { finished.current = onSuccessAnimationComplete; });
  const acceptedCode = passkey.digits.join("");
  useEffect(() => {
    if (status !== "success" || phase !== "settled") return;
    let told = false;
    const tell = () => {
      if (told) return;
      told = true;
      finished.current?.(acceptedCode);
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = requestAnimationFrame(tell);
      return () => cancelAnimationFrame(frame);
    }
    const el = statusRef.current;
    const landed = (e: TransitionEvent) => {
      if (e.target === el && e.propertyName === "translate") tell();
    };
    el?.addEventListener("transitionend", landed);
    const backstop = window.setTimeout(tell, DROP_MS + 120);
    return () => { el?.removeEventListener("transitionend", landed); clearTimeout(backstop); };
  }, [status, phase, acceptedCode]);

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
    <div className="passkey" ref={rootRef} style={{ "--pk-length": length } as CSSProperties}
      data-state={status}
      data-fail={fail ?? undefined}
      data-phase={phase === "none" ? undefined : phase}
      data-shake={shake} data-busy={passkey.busy || undefined}>
      {/* Where the code went, before the field asks for it. Four empty boxes assume you
          already know what they are for; this answers the two questions people arrive
          with — what is this, and where do I look. It goes once the code is accepted: the
          question has been answered by then. */}
      {status !== "success" && (
        <header className="pk-intro">
          <h1 className="pk-intro-title">Check your email</h1>
          <p className="pk-intro-body">
            We&rsquo;ve sent you a temporary login code. Please check your inbox at{" "}
            <strong>{resendTo ?? "you@example.com"}</strong>.
          </p>
        </header>
      )}
      {/* the row keeps its height in every state so the strip never jumps */}
      <p className="pk-status" ref={statusRef} role="status" aria-live="polite">
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
