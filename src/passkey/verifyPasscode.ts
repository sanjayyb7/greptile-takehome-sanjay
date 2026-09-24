/** Stand-in for the auth call: resolves after a beat so the verifying state is visible */
export const PASSCODE = "1234";
export const VERIFY_MS = 2000;

/**
 * The reserved code that makes the check fall over rather than answer.
 *
 * A dropped connection and a wrong code are different things and the field says so, but
 * only one of them can be reached by typing — so this is the other one's door. It is a
 * code rather than a URL flag because the failure it stands for happens mid-submit: you
 * have to be able to reach it from a complete code and the Enter key, the way it happens.
 */
export const OFFLINE_CODE = "0000";

/** how long a new code takes to go out, and how long before another can be asked for.
 *  Nothing gates the first ask: a code that never arrived should not have to be waited out. */
export const RESEND_MS = 900;
export const RESEND_COOLDOWN_S = 30;
/** how long "New code sent" stands before the offer is worded as an offer again */
export const RESEND_SENT_MS = 2500;

/**
 * `?resendfail` makes the first send fail and every one after it succeed.
 *
 * Failing once and then working is the whole of what there is to look at: a send that
 * always fails shows the message but never the recovery, and the recovery — dialog stays
 * open, button comes back, second press goes through — is the part that had to be
 * designed. The counter is module state because the flag describes a stand-in service
 * having a bad moment, not a component having one.
 */
const failFirstSend = typeof location !== "undefined"
  && new URLSearchParams(location.search).has("resendfail");
let sends = 0;

export function requestNewCode(): Promise<void> {
  const attempt = ++sends;
  return new Promise((resolve, reject) => setTimeout(() => {
    if (failFirstSend && attempt === 1) reject(new Error("send failed"));
    else resolve();
  }, RESEND_MS));
}

export function verifyPasscode(code: string): Promise<boolean> {
  return new Promise((resolve, reject) => setTimeout(() => {
    // not resolve(false) — a check that could not be made has not returned a verdict, and
    // collapsing the two is what makes a field say "wrong code" when the wifi dropped
    if (code === OFFLINE_CODE) reject(new Error("could not reach the server"));
    else resolve(code === PASSCODE);
  }, VERIFY_MS));
}
