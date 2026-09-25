import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { PasskeyCells } from "./PasskeyCells";
import { FINAL, behaviourOf, type Behaviour, type Version } from "./variants";
import { PasskeyPour } from "./PasskeyPour";
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
function progress(p: Passkey, plain: boolean) {
  if (p.status === "verifying" || p.status === "success") return plain ? "Verifying" : "Verifying...";
  return "";
}

/**
 * Every line the status row can say, for the versions that give it verdicts. They are
 * all rendered as hidden sizers in the same grid cell: one sizer only sets a minimum, so
 * a longer label grew the lane — and because the row is centred, the icon and the text
 * jumped sideways between states. With all of them in, the lane is the widest from the
 * first frame and never changes.
 */
const VERDICT_LINES = ["Verifying...", "Authenticated", "Incorrect code", "Missing digits", "Not verified"];

/** what the status row says once a refusal's mark has landed */
function verdict(p: Passkey) {
  if (p.problem === "incomplete") return "Missing digits";
  if (p.problem === "offline") return "Not verified";
  return "Incorrect code";
}

/** failures read underneath, aligned to the strip's left edge */
function problem(p: Passkey, guarded: boolean, length: number, inRow: boolean) {
  // the row says it; a second sentence under the strip would say it twice
  if (inRow) return "";
  /* Guarded: every case gets its own sentence, because they ask for different things.
     "Enter all N digits" is an instruction and the code is fine so far; "Incorrect code"
     means retype it; "Couldn't verify" means the code was never judged and pressing again
     is the right move. One message for all three would be wrong twice. */
  if (guarded) {
    if (p.problem === "incomplete") return `Enter all ${length} digits.`;
    if (p.problem === "incorrect") return "Incorrect code. Try again.";
    if (p.problem === "offline") return "Couldn't verify your code. Try again.";
    return "";
  }
  // the design's wording. There is no attempt counter to report: a wrong code is refused
  // and the field stays open, so the only thing to say is that this one was wrong.
  if (p.status === "error") return "Invalid code. Please try again.";
  return "";
}

/** Passcode entry: four cells, a status line above, and the states in between */
export function PasskeyField({ autoFocus = true, autoSubmit = false, send = true,
  version = FINAL, behaviour, length = LENGTH, onVerify, onResend, resendCooldown,
  resendTo, onSuccess }: {
  autoFocus?: boolean;
  /** submit as soon as the last digit lands; off when the Send button is doing that job */
  autoSubmit?: boolean;
  /** offer a Send button once the code is complete */
  send?: boolean;
  /**
   * Which exploration to run — see variants.ts. This is the demo's switch, not part of
   * using the field: left out, it runs the one that was chosen.
   */
  version?: Version;
  /**
   * How the field behaves, if not one of the explorations. `version` is a shorthand for
   * picking one of these off the shelf; this is the shelf. Pass it and the version is
   * ignored, which is how a field that is none of the ten gets described.
   */
  behaviour?: Behaviour;
  /** how many cells */
  length?: number;
  /** check the code — the stand-in answers to 1234 until something real is passed */
  onVerify?: (code: string) => Promise<boolean>;
  /** ask for a new code, and how long before another can be asked for */
  onResend?: () => Promise<void>;
  resendCooldown?: number;
  /** where a new code is sent — named in the confirmation, where it is the whole point */
  resendTo?: string;
  onSuccess?: (code: string) => void;
}) {
  const b = behaviour ?? behaviourOf(version);
  /* The goo filter is referenced from CSS, which cannot know a generated id — so the id is
     generated here and handed to CSS as a variable. Written out, two fields on a page
     would define #pk-goo twice and every filter in both of them would resolve to the
     first, which is the first field's coordinate space. */
  const gooId = useId();
  const passkey = usePasskey({
    length, autoSubmit, stepsWhenHeld: b.stepsWhenHeld,
    handsBackOnError: b.handsBackOnError,
    onVerify, onResend, resendCooldown, onSuccess,
  });
  const { status, shake, focusAt } = passkey;
  const below = problem(passkey, b.guarded, length, b.verdictInRow);
  // success runs in two phases: the cells leave first, then the mark arrives
  const [phase, setPhase] = useState<"none" | "clearing" | "collapsing" | "done" | "settled">("none");
  const statusRef = useRef<HTMLParagraphElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const before = useRef<DOMRect | null>(null);
  // the hand-off style is set on the element by the dev panel; these two run their own
  // sequence, holding the strip's space so the line has somewhere to travel to
  const sequenced = useRef(false);

  useEffect(() => { if (autoFocus) focusAt(0); }, [autoFocus, focusAt]);

  /*
   * A refusal, closed the same way a success is.
   *
   * "closing" from the moment the verdict is in: the spinner stays, and its spokes run
   * the same 280ms gather a success does — still green, because the close belongs to both
   * answers and colouring it early gives the verdict away. "mark" at 360ms: the dot opens
   * into a red "!", and the label, the focused cell and the shake all land on that frame.
   *
   * Derived in the render rather than set in an effect, so the frame the error arrives is
   * already "closing". Set a frame later, the row would have had nothing to say for that
   * frame and the icon would unmount and remount under the gather.
   *
   * Keyed on the shake counter, which moves on every rejection — so refusing the same
   * code twice closes and marks twice rather than sitting on the first mark.
   */
  const refused = b.verdictInRow
    && (passkey.problem === "incorrect" || passkey.problem === "offline");
  const [markedAt, setMarkedAt] = useState(-1);
  useEffect(() => {
    if (!refused) return;
    const now = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = window.setTimeout(() => setMarkedAt(shake), now ? 0 : 360);
    return () => clearTimeout(id);
  }, [refused, shake]);
  // a code with a gap was never sent, so there is no loader to close — it marks at once
  const fail: "closing" | "mark" | null = !b.verdictInRow ? null
    : passkey.problem === "incomplete" ? "mark"
    : refused ? (markedAt === shake ? "mark" : "closing")
    : null;

  /* The red lasts exactly as long as the shake: the colour and the movement are one
     event, so they start and stop on the same frames rather than one outliving the other.
     Keyed on the shake counter as well as the status, so a second rejection of the same
     code — which never leaves the error state — flashes again instead of doing nothing. */
  const flashes = b.flashesError;
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!flashes || status !== "error") { setFlash(false); return; }
    setFlash(true);
    const id = window.setTimeout(() => setFlash(false), SHAKE_MS);
    return () => clearTimeout(id);
  }, [flashes, shake, status]);

  /*
   * The shipped hand-off and spinner, written on the node rather than rendered.
   *
   * These are not dev toggles with a dev default — v2 and wave ARE the behaviour, and
   * everything else on data-mark is an alternative to compare against. Without them the
   * field falls back to the "swish" rules, whose tick never appears: it is revealed by a
   * clip-path, and a clip-path on an SVG <g> resolves against that group's own fill box,
   * which for the tick is 10x7 — the 6.5/5.5 insets close over it completely. That is a
   * blank checkbox next to "Authenticated", in every build without the dev panel.
   *
   * Set here and not in JSX because the dev panel owns these attributes once it has
   * written to them; rendered, every phase change would snatch them back mid-sequence.
   * Set on mount and only when absent, so switching version — which remounts the field
   * and drops what the panel wrote to the old node — lands on the real behaviour again.
   */
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    el.dataset.mark ||= b.handOff;
    el.dataset.spin ||= "wave";
  }, [version]);

  useEffect(() => {
    if (status !== "success") return;
    const mark = rootRef.current?.dataset.mark;
    const SEQUENCES: Record<string, { done: number; settled: number }> = {
      v1: { done: 440, settled: 1080 },   // gather 300, hold 140, mark, hold, travel 440
      // gather 280 + combine 80 = 360, then expand 160 + tick 200 = 360, then hold 280.
      // The tick always finished before the drop, but by 140ms — eight frames, which
      // reads as one continuous event rather than a line completing and then moving.
      // Doubled, the finish lands on its own before anything travels.
      v2: { done: 360, settled: 1000 },
    };
    const seq = mark ? SEQUENCES[mark] : undefined;
    sequenced.current = Boolean(seq);

    // the wait is the point of the verification, so it is kept; only the transformation
    // is dropped, landing straight on the state it would have arrived at
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("settled");
      return;
    }

    if (seq) {
      setPhase("clearing");                                              // 0ms  cells fade, spokes gather
      const a = window.setTimeout(() => setPhase("done"), seq.done);     //      dot opens into the mark
      const b = window.setTimeout(() => setPhase("settled"), seq.settled); //    line travels down
      return () => { clearTimeout(a); clearTimeout(b); };
    }

    setPhase("clearing");                                            // 0ms    cells snap shut
    const t1 = window.setTimeout(() => {                             // 110ms  their space closes
      before.current = statusRef.current?.getBoundingClientRect() ?? null;
      setPhase("collapsing");
    }, 110);
    const t2 = window.setTimeout(() => setPhase("done"), 290);       // 290ms  the mark arrives
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [status]);

  // FLIP: the strip's space closes in one frame, then the line is animated from where it
  // used to be back to where it now is — a transform, so nothing animates layout.
  useLayoutEffect(() => {
    if (phase !== "collapsing") return;
    const el = statusRef.current;
    const from = before.current;
    before.current = null;
    if (!el || from === null) return;
    const now = el.getBoundingClientRect();
    const dy = from.top - now.top;
    // the send box goes with the cells, so the line loses the offset that kept it centred
    // on the wider field at the same moment: carried in the same FLIP, the two are one
    // move to the centre rather than a drop with a sideways drift laid over it
    const dx = from.left - now.left;
    if (!dx && !dy) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // the component's own curve, read off the element: a second, weaker ease-out
    // hardcoded here meant two curves doing one job
    const easing = getComputedStyle(el).getPropertyValue("--ease-out").trim() || "ease-out";
    el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
      { duration: 180, easing },
    );
  }, [phase]);

  // the sequenced styles hold the strip so its space stays reserved to travel into
  const stripMounted = sequenced.current || phase === "none" || phase === "clearing";
  const above = phase === "done" || phase === "settled" ? "Authenticated"
    : fail === "closing" ? "Verifying..."        // held until the mark, not replaced early
    : fail === "mark" ? verdict(passkey)
    : progress(passkey, b.plainProgress);

  /*
   * Hold the row still when the label changes width, and pay the difference inside the
   * drop.
   *
   * Without the ellipsis the lane sizes to its content, so each state centres on the
   * strip properly — but "Authenticated" is wider than "Verifying", and re-centring moved
   * the row sideways the moment the word changed. A shift, a pause, and then a fall reads
   * as three events.
   *
   * So the row is pinned where it was: the difference is measured at the swap and held as
   * an offset, and the drop then animates from that offset to nothing while it travels the
   * 96px down. The correction happens, but inside a move that was happening anyway, which
   * is the difference between one gesture and two.
   */
  const lastLeft = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = statusRef.current;
    if (!el || !b.plainProgress) return;
    // An empty row and a row with a word in it are different widths, but that is the line
    // arriving rather than a word changing length — there is nothing to hold still. Only
    // the step from one label to another is worth correcting.
    if (!above) {
      lastLeft.current = null;
      el.style.removeProperty("--pk-status-dx");
      return;
    }
    // offsetLeft, not a client rect: the rect includes the very offset being set here, so
    // reading it fed each measurement back into the next and the row walked off sideways.
    // offsetLeft is the laid-out position and is blind to the transform.
    const now = el.offsetLeft;
    const prev = lastLeft.current;
    lastLeft.current = now;
    const dx = prev === null ? 0 : prev - now;
    if (dx) el.style.setProperty("--pk-status-dx", `${dx}px`);
    else el.style.removeProperty("--pk-status-dx");
  }, [above, b.plainProgress]);

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
      data-state={status} data-version={version}
      data-attached={b.hasSend && !b.detachedSend ? "" : undefined}
      data-entrance={b.entrance}
      data-caret={b.caret}
      data-filled={b.filledMark ? "" : undefined}
      data-seamless={b.seamlessWipe ? "" : undefined}
      data-steady={b.steadyHeight ? "" : undefined}
      data-editcaret={b.editCaret ? "" : undefined}
      data-guarded={b.guarded ? "" : undefined}
      data-plain={b.plainProgress ? "" : undefined}
      data-pours={b.pours ? "" : undefined}
      data-disc={b.discLoader ? "" : undefined}
      data-verdicts={b.verdictInRow ? "" : undefined}
      data-fail={fail ?? undefined}
      data-flashes={flashes ? "" : undefined}
      data-flash={flash ? "" : undefined}
      data-phase={phase === "none" ? undefined : phase}
      data-shake={shake} data-busy={passkey.busy || undefined}>
      {/*
        * The goo filter, for the fluid version. Blur everything in the group, then throw
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
      {/* Named before the cells, not after them: four boxes on an empty screen assume you
          already know what they are for. It goes on success with everything else — the
          question has been answered by then. */}
      {b.intro && status !== "success" && (
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
            <StatusIcon status={status} origin={b.handOff === "origin"}
              filled={b.filledMark} fail={fail} />
            <span className="pk-status-label">
              {/* holds the lane open at the width of the longest line from the start, so
                  the icon beside it never shifts sideways when the text changes */}
              {(b.verdictInRow ? VERDICT_LINES : ["Authenticated"]).map((line) => (
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
      {stripMounted && (
        <PasskeyCells
          passkey={passkey}
          length={length}
          send={send}
          written={b.entrance === "written"}
          fadeIn={b.entrance === "fade"}
          vanish={b.entrance === "vanish"}
          caret={b.caret}
          noCaret={b.hidesCaret}
          handsBack={b.handsBackOnError}
          staleOnResend={b.guarded}
          falls={b.boxFallsIn}
          fluid={b.fluidSend}
          fluidBlock={b.fluidDigits}
          smooth={b.smoothSend}
          clears={b.sendClearsOnSubmit}
          shakeOn={b.verdictInRow ? (fail === "mark" ? shake : 0) : undefined}
        />
      )}
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
      <PasskeyResend passkey={passkey} guarded={b.guarded} to={resendTo} />
      <PasskeyPour enabled={b.pours && send} status={status} rootRef={rootRef} />
    </div>
  );
}
