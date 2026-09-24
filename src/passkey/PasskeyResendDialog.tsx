import { useCallback, useEffect, useId, useRef } from "react";

/** the smooth send box's own numbers, so the two gestures read as one language: it opens
 *  on the same curve over the same time, and is pulled back in faster than it came out */
const OPEN_MS = 380;
const SHUT_MS = 234;
const CURVE = "cubic-bezier(0.33, 1, 0.68, 1)";

/**
 * The confirmation in front of a resend.
 *
 * A resend is the one control here that spends something — a real code goes out, and a
 * thirty-second wait is armed behind it. Fired on the press, a misclick costs both. So
 * the press opens this instead, and the send happens on a second, deliberate one.
 *
 * It says where the code is going, because "resend" on its own cannot answer the question
 * people actually have at this point, which is whether it is going somewhere they can
 * still read.
 *
 * Built on <dialog>, not a div with role="dialog". The element already does the modal
 * work correctly — the top layer, the inert background, Escape, the focus trap, and
 * returning focus to whatever opened it — and every one of those reimplemented by hand is
 * a place to get it subtly wrong. What is left to write is the behaviour that is ours:
 * where it sits, and how it gets there.
 */
export function PasskeyResendDialog({ open, to, state, onConfirm, onCancel, anchor, over,
  onClosed }: {
  open: boolean;
  /** where the new code is going — the whole reason for asking before sending */
  to: string;
  /** "sending" disables both buttons; "failed" keeps the dialog open and explains */
  state: "idle" | "sending" | "sent" | "failed";
  onConfirm: () => void;
  onCancel: () => void;
  /** the control it comes out of — read at the moment it is needed, because the link is
   *  remounted by the states the line passes through */
  anchor: () => HTMLElement | null;
  /** called once it has actually gone, so whoever opened it can place focus. The dialog
   *  knows WHEN it has closed; it does not know where focus belongs after. */
  onClosed: () => void;
  /** and what it covers: the strip, so the question lands on the thing it is about */
  over: () => HTMLElement | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  /* An id written out is an id that repeats. Two fields on a page would both label their
     dialog "pk-dialog-title", and aria-labelledby resolves a duplicate to the first one in
     the document — so the second field's dialog would announce the first field's. */
  const titleId = useId();
  /* A close in flight, so an open can abandon it.
   *
   * Without this the two run past each other. Asked to open while the exit is still
   * playing, `el.open` is still true, so the open branch declines to do anything — and
   * then the exit's own close lands a moment later. The element ends shut while React
   * still holds `open`, and since nothing changes state after that, pressing the link
   * again changes nothing: the control is dead for the rest of the session. */
  const closing = useRef<null | (() => void)>(null);
  /* The two lookups are arrow functions, so they are a new pair on every render of the
     line above. Held in a ref, they can be called by an effect without being a dependency
     of it — which matters because the effect that opens and closes is not idempotent:
     re-run mid-exit it cancels the exit and starts another, and the close that was
     waiting on the first one's `finished` is rejected and never lands. That is a dialog
     that shrinks correctly and then sits there, invisible and still modal. */
  const find = useRef({ anchor, over, onClosed });
  find.current = { anchor, over, onClosed };
  const sending = state === "sending";
  const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /**
   * Put it over the strip, and work out which point of it the motion starts from.
   *
   * The dialog is in the top layer, so it is positioned against the viewport and not
   * against the field — which means the field's own geometry has to be measured and
   * handed over rather than inherited. Centred on the strip: the question is about the
   * code that is typed there, and asked anywhere else it is a notice about the field
   * instead of a thing happening to it.
   *
   * The origin is the link's centre expressed in the dialog's own coordinates, which is
   * what makes the box grow out of the control that was pressed rather than out of its
   * own middle — the same reading as the send box coming out of the strip's edge.
   */
  const place = useCallback(() => {
    const el = ref.current;
    const target = find.current.over();
    if (!el || !target) return;
    // margin:auto is what centres a modal dialog; it has to go before left/top mean anything
    el.style.margin = "0";
    /* offsetWidth/Height rather than a client rect, because a rect is measured AFTER
       transforms and this element is one we scale. The exit fills forwards at 0.16, so on
       the second open the rect said the dialog was 64px wide, every offset was computed
       from that, and it opened down and to the right of where it belonged. These two read
       the laid-out box and cannot be lied to by a transform left over from last time. */
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const t = target.getBoundingClientRect();
    const left = Math.round(t.left + t.width / 2 - w / 2);
    const top = Math.round(t.top + t.height / 2 - h / 2);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;

    const from = find.current.anchor()?.getBoundingClientRect();
    // no link to come out of — it has been replaced by one of the line's other states —
    // so it grows from its own centre, which is the honest default
    const ox = from ? from.left + from.width / 2 - left : w / 2;
    const oy = from ? from.top + from.height / 2 - top : h / 2;
    el.style.transformOrigin = `${ox}px ${oy}px`;
  }, []);

  /* showModal rather than the open attribute: the attribute renders the dialog inline and
     non-modal, which leaves the field behind it focusable and Escape doing nothing. */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (open) {
      // whatever the exit was going to do, it is not doing it now
      closing.current?.();
      closing.current = null;
      if (!el.open) el.showModal();
      // read before cancelling, because getComputedStyle is live and cancelling drops the
      // element to its declared scale — a dialog caught mid-exit would jump to full size
      // and grow from there instead of turning round where it is
      const held = getComputedStyle(el).scale;
      const caught = el.getAnimations().length > 0;
      // before placing, not after: the exit fills forwards, so until it is dropped the
      // element is still wearing last time's scale
      el.getAnimations().forEach((a) => a.cancel());
      place();
      // the confirm button rather than the dialog itself, so Enter answers the question
      // the dialog is asking. Cancel is one Shift+Tab or one Escape away.
      confirmRef.current?.focus();
      if (still()) return;
      /* Out of the link and up to size. The middle frame is wider than it is tall for the
         same reason the send box's is: something pushed out through a small opening is
         fatter across the opening than along it, and a box that only scales evenly reads
         as a picture being zoomed rather than an object arriving.

         Caught on its way out, it starts from wherever it had got to and goes straight
         back up, with no middle frame: the shape is already in flight, and re-imposing the
         wind-up on it would be a second gesture laid over one already happening. */
      el.animate(
        caught && held !== "none"
          ? [{ scale: held, opacity: 1 }, { scale: "1 1", opacity: 1, borderRadius: "16px" }]
          : [{ scale: "0.16 0.16", opacity: 0, borderRadius: "999px" },
             { scale: "0.74 0.6", opacity: 1, borderRadius: "40px", offset: 0.45 },
             { scale: "1 1", opacity: 1, borderRadius: "16px" }],
        { duration: caught ? SHUT_MS : OPEN_MS, easing: CURVE, fill: "both" },
      );
      return;
    }

    /* Closing, and putting focus back on the way out.
     *
     * <dialog> restores focus by itself, but only to whatever was focused when showModal
     * ran — which is nothing at all if the link was activated by keyboard-less means, and
     * the wrong thing if focus had moved since. So the anchor is focused explicitly, and
     * after the close rather than before it: a modal dialog holds focus while it is open,
     * so an earlier attempt is simply swallowed.
     *
     * Where it goes is the caller's to decide, not this component's: after a cancel it
     * belongs on the link, and after a send the link is gone and it belongs in the strip,
     * and only the line knows which of those just happened. */
    let done = false;
    const shut = () => {
      if (done) return;
      done = true;
      el.close();
      find.current.onClosed();
    };

    if (!open && el.open) {
      if (still()) { shut(); return; }
      // measured before the cancel, as everywhere else here: getComputedStyle is live, and
      // cancelling drops the element to its declared scale — so a dialog asked to close
      // while it is still opening would jump to full size and shrink from there
      const held = getComputedStyle(el).scale;
      el.getAnimations().forEach((a) => a.cancel());
      // and back into the link it came from, on the faster of the two durations — being
      // pulled in is not the same length of gesture as arriving
      const out = el.animate(
        [{ scale: held === "none" ? "1 1" : held, opacity: 1, borderRadius: "16px" },
         { scale: "0.16 0.16", opacity: 0, borderRadius: "999px" }],
        { duration: SHUT_MS, easing: CURVE, fill: "both" },
      );
      // closed only once it has gone: close() pulls it out of the top layer immediately,
      // and there is nothing to watch after that
      out.finished.then(shut).catch(() => {});
      /* And a fallback, because `finished` resolves on a frame and a background tab does
         not get frames. Left to the promise alone, a tab hidden mid-exit keeps a dialog
         that is invisible — opacity 0, filled forwards — and still modal, which means
         still holding focus and still swallowing Escape, until the tab is looked at
         again. The timer is a real clock, so it lands either way; `closed` makes whichever
         arrives second a no-op. */
      const fallback = window.setTimeout(shut, SHUT_MS + 120);
      // an open arriving before either of those lands calls this, and the close is off
      closing.current = () => { done = true; clearTimeout(fallback); };
      return () => clearTimeout(fallback);
    }
  }, [open, place]);

  /* Escape fires `cancel`, and left alone the browser closes the dialog itself — which
     puts the element and our `open` out of step, and skips the exit entirely. Prevented
     and routed through the same path the button takes, so there is one way out, not two. */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e: Event) => {
      e.preventDefault();
      if (!sending) onCancel();   // nothing is escapable while a code is going out
    };
    el.addEventListener("cancel", stop);
    return () => el.removeEventListener("cancel", stop);
  }, [onCancel, sending]);

  /* It is pinned to the strip, so it has to be re-pinned when the strip moves. Only while
     it is open — there is nothing to place otherwise. */
  useEffect(() => {
    if (!open) return;
    const again = () => place();
    window.addEventListener("resize", again);
    return () => window.removeEventListener("resize", again);
  }, [open, place]);

  return (
    <dialog className="pk-dialog" ref={ref} aria-labelledby={titleId}
      data-closing={!open || undefined}>
      <p className="pk-dialog-title" id={titleId}>
        Send code to: <strong>{to}</strong>
      </p>
      {/* The failure sits above the buttons, where it is read before the button that
          would repeat the thing that failed — and it is the only thing that changes, so
          the dialog does not resize under the pointer beyond this one line. */}
      {state === "failed" && (
        <p className="pk-dialog-problem" role="alert">Couldn't send the code. Try again.</p>
      )}
      <div className="pk-dialog-actions">
        <button type="button" className="pk-dialog-cancel" onClick={onCancel} disabled={sending}>
          Cancel
        </button>
        {/* disabled while sending, which is what makes a second press impossible rather
            than merely ignored — and the label says why it is not taking presses */}
        <button type="button" className="pk-dialog-confirm" ref={confirmRef}
          onClick={onConfirm} disabled={sending}>
          {sending ? "Sending…" : "Resend code"}
        </button>
      </div>
    </dialog>
  );
}
