import { useEffect, useRef } from "react";
import type { usePasskey } from "./usePasskey";

type Passkey = ReturnType<typeof usePasskey>;

/** mm:ss. Minutes because a wait written only in seconds stops reading as a clock the
 *  moment it could be longer than one — and this one is configurable. */
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * The way out when the code never arrived, on the line under the strip.
 *
 * Offered from the start — waiting out a timer for a code that was never delivered helps
 * nobody — and it is the asking that arms the wait, so a second code can only be had
 * thirty seconds after the first. The press sends straight away: where the code is going
 * is already said above the field, so there is nothing left to confirm, and the line
 * itself is the answer — "Code resent" for a beat, then the wait as a clock, then the offer
 * again. Nothing about it touches what is typed in the cells.
 */
export function PasskeyResend({ passkey }: { passkey: Passkey }) {
  const { cooldown, resending, resend, status, digits, focusAt } = passkey;

  /* The link that had focus is replaced by "Code resent", which would leave focus on the
     body — a field with no cell selected at the moment a new code has arrived to be typed.
     So it is handed to the strip: the first empty cell, or the last one when the code is
     full. Only when the press came from the link; a send nobody pressed moves nothing. */
  const pressed = useRef(false);
  useEffect(() => {
    if (resending !== "sent" || !pressed.current) return;
    pressed.current = false;
    const gap = digits.findIndex((d) => !d);
    focusAt(gap === -1 ? digits.length - 1 : gap);
  }, [resending, digits, focusAt]);

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
        <button type="button" disabled={resending === "sending"}
          onClick={() => { pressed.current = true; void resend(); }}>Resend</button>
      </p>
    );

  // a send that did not go is said under the line, with the link still there to try again
  return (
    <>
      {line}
      {resending === "failed" && (
        <p className="pk-resend-problem" role="alert">Couldn't send the code. Try again.</p>
      )}
    </>
  );
}
