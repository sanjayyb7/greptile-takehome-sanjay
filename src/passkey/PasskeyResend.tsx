import { useEffect, useRef, useState } from "react";
import { PasskeyResendDialog } from "./PasskeyResendDialog";
import type { usePasskey } from "./usePasskey";

type Passkey = ReturnType<typeof usePasskey>;

/** mm:ss. Minutes because a wait written only in seconds stops reading as a clock the
 *  moment it could be longer than one — and this one is configurable. */
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * The way out when the code never arrived. Offered from the start — waiting out a timer
 * for a code that was never delivered helps nobody — and it is the asking that arms the
 * wait, so a second code can only be had thirty seconds after the first.
 *
 * The line answers in sequence: the offer, then "Sending a new code…", then "New code
 * sent" for a beat, then the wait counting down, then the offer again. The countdown is
 * shown rather than held back, because the question after a code is sent is when the next
 * one can be had — being told only on asking means asking to find out.
 */
export function PasskeyResend({ passkey, to = "you@example.com" }: {
  passkey: Passkey;
  /** where a new code would go; only shown in the confirmation */
  to?: string;
}) {
  return <GuardedResend passkey={passkey} to={to} />;
}

/**
 * The line under the strip: the offer, and every state it passes through.
 *
 * At rest it is worded as the offer is worded everywhere else — "Didn't get a code?
 * Resend" — because that is the question the person is actually asking, and the version
 * differs in what happens after the press, not in what the press is for. The sequence is:
 * press, confirm, "Code resent" for a beat, then the wait as a clock, then the offer
 * again. Nothing about it touches what is typed in the cells.
 */
function GuardedResend({ passkey, to }: { passkey: Passkey; to: string }) {
  const { cooldown, resending, resend, clearResendError, status, digits, focusAt } = passkey;
  const [asking, setAsking] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  /* The send went: the dialog's work is done and the line takes over the reporting. */
  useEffect(() => { if (resending === "sent") setAsking(false); }, [resending]);

  /**
   * Where focus goes once the dialog has gone.
   *
   * Cancelled, it goes back to the link — nothing happened, and it belongs where it was.
   *
   * Sent, the link is not there to go back to: it has been replaced by "Code resent" and
   * then by the wait. Left alone that drops focus on the body, which is the state in the
   * report — a field with a complete code, no cell selected and no caret anywhere, at the
   * exact moment a new code has arrived and is about to be typed. So it is handed back to
   * the strip: the first empty cell, or the last one when the code is full, which is the
   * cell a Backspace would take first and the one the next keystroke should land in.
   */
  const settle = () => {
    const el = trigger.current;
    if (el) { el.focus(); return; }
    const gap = digits.findIndex((d) => !d);
    focusAt(gap === -1 ? digits.length - 1 : gap);
  };

  const cancel = () => {
    setAsking(false);
    clearResendError();   // so reopening starts from the offer, not from the last failure
  };

  /* The strip is found from the link rather than from the document: `.pk-strip` alone
     would be the FIRST field's strip on a page with two of them, which is the same bug
     the caret had. Read through the link's own ancestor, it can only be this field's. */
  const dialog = (
    <PasskeyResendDialog open={asking} to={to} state={resending}
      onConfirm={resend} onCancel={cancel} onClosed={settle}
      anchor={() => trigger.current}
      over={() => trigger.current?.closest(".passkey")?.querySelector(".pk-strip") ?? null} />
  );

  /* The line, as one expression rather than four returns.
   *
   * It used to return early for each state, with the dialog rendered only in the last of
   * them — and a successful send moves the line off that branch on the same commit the
   * send lands, so the dialog was unmounted mid-flight. React simply removes an open
   * <dialog> from the DOM: no exit plays, nothing reports that it closed, and focus is
   * left on the body. That was a field with a complete code, an arrow offering to send
   * it, and no cell selected — at the exact moment a new code had arrived to be typed.
   *
   * So the dialog is mounted for as long as this component is, whatever the line happens
   * to be saying, and the states only choose the words. */
  const line =
    status === "verifying" || status === "success" ? (
      <p className="pk-resend" aria-hidden="true">&nbsp;</p>
    ) : resending === "sent" ? (
      // "Code resent", where the link was. Keyed and swapped: it is a change of state.
      <p className="pk-resend" key="sent" data-swap role="status">Code resent</p>
    ) : cooldown > 0 ? (
      // The wait. Entry and verification are untouched by it — only this control is.
      <p className="pk-resend" key="waiting" data-swap role="status">
        Resend in <span className="pk-count">{clock(cooldown)}</span>
      </p>
    ) : (
      <p className="pk-resend" key="idle" data-swap>
        Didn't get a code?{" "}
        <button type="button" ref={trigger} onClick={() => setAsking(true)}>Resend</button>
      </p>
    );

  /* The dialog is a sibling of the line, not a child of it: <p> takes phrasing content
     and <dialog> is flow content, so nesting it is invalid markup. Closed, it is
     display:none and costs the layout nothing. */
  return <>{line}{dialog}</>;
}
