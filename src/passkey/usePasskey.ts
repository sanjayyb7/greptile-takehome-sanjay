import { useCallback, useEffect, useRef, useState } from "react";
import { RESEND_COOLDOWN_S, RESEND_SENT_MS, requestNewCode, verifyPasscode } from "./verifyPasscode";

export type Status = "idle" | "verifying" | "success" | "error";

/**
 * What is wrong, when something is — kept apart from `status` because they answer
 * different questions. `status` is where the machine is; this is what to say.
 *
 *   incomplete  Enter on a code with a gap in it. Nothing was sent, so nothing failed:
 *               the field is still idle and the strip does not go red.
 *   incorrect   the code was checked and refused.
 *   offline     the check could not be made. A verdict was never reached, so this is not
 *               a wrong code and must not be worded as one — the digits may well be right.
 */
export type Problem = null | "incomplete" | "incorrect" | "offline";

/** and the same for asking for a new code: it either went or it did not */
export type Resending = "idle" | "sending" | "sent" | "failed";

/**
 * Owns the passcode state machine: idle → verifying → success | error. A wrong code is
 * never terminal — it is refused and the field stays open. The only rate limit is on
 * asking for a NEW code, which is the expensive side of this.
 */
export function usePasskey({ length = 4, autoSubmit = true, stepsWhenHeld = false,
  handsBackOnError = false, onVerify = verifyPasscode, onResend = requestNewCode,
  resendCooldown = RESEND_COOLDOWN_S, onSuccess }: {
  length?: number;
  /** holding a digit fills the code at our own cadence rather than the OS repeat rate */
  stepsWhenHeld?: boolean;
  /** a rejection returns the caret to the last cell — see handsBackOnError */
  handsBackOnError?: boolean;
  /**
   * Check the code. Anything resolving true or false will do; the default is the stand-in
   * in verifyPasscode.ts, which answers after two seconds so the verifying state can be
   * seen. The hook holds no opinion about how a code is checked, which is what lets this
   * be pointed at something real without being edited.
   */
  onVerify?: (code: string) => Promise<boolean>;
  /**
    * Ask for a new code. The default is the stand-in; a real one goes here.
    *
    * Whatever it resolves to is ignored — only settling matters, and rejecting is how it
    * says the send failed. Typed as unknown rather than void so a bare `() => fetch(...)`
    * is accepted: requiring void would make every caller wrap a one-line call to say
    * nothing.
    */
  onResend?: () => Promise<unknown>;
  /** and how long before another can be asked for, in seconds */
  resendCooldown?: number;
  /** submit as soon as the last cell is filled; Enter always submits regardless */
  autoSubmit?: boolean;
  onSuccess?: (code: string) => void;
} = {}) {
  const [digits, setDigits] = useState<string[]>(() => Array(length).fill(""));
  const [status, setStatus] = useState<Status>("idle");
  const [focused, setFocused] = useState<number | null>(null);
  // starts at zero: the resend is offered straight away, and only a resend arms the wait
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState<Resending>("idle");
  /** what to say about the last attempt, if anything — see Problem */
  const [problem, setProblem] = useState<Problem>(null);
  /**
   * A new code has been sent and what is on screen predates it.
   *
   * The digits are kept, because they may well be a code with one digit mistyped and
   * throwing them away would be throwing away the person's work. But they are no longer
   * the code that was just sent, and anything offering to submit them is offering to
   * submit the old one. Cleared by the first edit, which is the moment they become
   * whatever the person means them to be again.
   */
  const [stale, setStale] = useState(false);
  /**
   * Whether a cell has been chosen since the code was completed.
   *
   * Filling the last cell leaves the caret parked on it with nothing to do — the code is
   * finished and the arrow is the next thing — so the ring and the caret are dropped, and
   * the box is what the eye goes to. That is right until somebody clicks a cell, which is
   * as plain a statement of "I want to edit this one" as there is. Without this the two
   * cases were the same state: the ring was hidden for as long as the box was up, so
   * clicking a cell moved the caret there and showed nothing at all.
   */
  const [picked, setPicked] = useState(false);
  /** asked again too soon — the offer stands, so the refusal has to say how long */
  const [shake, setShake] = useState(0);
  /** how the digits on screen got there: a paste arrives all at once and reads as text
   *  landing, where typing reads as each digit being placed. They enter differently. */
  const [entry, setEntry] = useState<"type" | "paste">("type");
  // one counter per cell; bumping it remounts that digit's layer, replaying its entrance
  const [stamps, setStamps] = useState<number[]>(() => Array(length).fill(0));

  const cells = useRef<(HTMLInputElement | null)[]>([]);
  // keystrokes can outrun React's re-render, so the ref — not state — is the source of truth
  const latest = useRef(digits);
  const focusedRef = useRef(focused);
  const timers = useRef<number[]>([]);

  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const busy = status === "verifying" || status === "success";

  const focusAt = useCallback((i: number) => {
    cells.current[Math.max(0, Math.min(length - 1, i))]?.focus();
  }, [length]);

  const setAll = useCallback((next: string[]) => {
    latest.current = next;
    setDigits(next);
  }, []);

  const stamp = useCallback((indexes: number[]) => {
    setStamps((prev) => {
      const next = [...prev];
      indexes.forEach((i) => { next[i] += 1; });
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setAll(Array(length).fill(""));
    setStatus("idle");
    setStale(false);
    focusAt(0);
  }, [focusAt, length, setAll]);

  const submit = useCallback(async () => {
    if (busy) return;
    const entered = latest.current;
    const gap = entered.findIndex((d) => !d);
    if (gap !== -1) {
      // Enter on a half-filled code. The caret goes to the first gap, because that is
      // where the work is; the strip shakes, because a press that does nothing has to be
      // seen to have been received. Nothing was sent, so the status stays idle and the
      // cells stay their own colour — red here would say the code was refused, and it
      // was not: it was never asked about.
      setShake((n) => n + 1);
      setProblem("incomplete");
      focusAt(gap);
      return;
    }
    const code = entered.join("");
    // whatever the last attempt said, it was about an attempt that is now over. Left
    // standing it reads as a verdict on the one being made: "Verifying…" above the strip
    // and "Couldn't verify your code" below it, at the same time, about the same digits.
    setProblem(null);
    setStatus("verifying");
    let ok: boolean;
    try {
      ok = await onVerify(code);
    } catch {
      // The check never returned a verdict. The digits are left exactly as they are and
      // the field goes back to idle rather than to error: there is nothing wrong with
      // this code as far as anybody knows, and the next press should be an ordinary
      // submit and not a retry of something that failed.
      setShake((n) => n + 1);
      setProblem("offline");
      setStatus("idle");
      if (handsBackOnError) focusAt(length - 1);
      return;
    }
    if (ok) {
      setStatus("success");
      onSuccess?.(code);
      return;
    }
    setShake((n) => n + 1);
    setProblem("incorrect");
    // the wrong code stays on screen, in red — clearing it is the person's move, not ours.
    // Backspace walks it off; the red and the message go the moment they change anything.
    setStatus("error");
    // and where the caret lands is ours: the press moved it to the button, and the button
    // is about to go, so it has to be given somewhere to be. The last cell is the one a
    // Backspace would take first.
    if (handsBackOnError) focusAt(length - 1);
  }, [busy, focusAt, handsBackOnError, length, onSuccess, onVerify]);

  // the resend cooldown ticks whenever one is running
  useEffect(() => {
    if (cooldown <= 0) return;                          // the wait is over; the offer stands again
    const id = window.setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  /**
   * Asking for a new code leaves the strip alone. Whatever is typed there is the person's
   * work, and a code arriving by SMS is no reason to throw it away — they may well have
   * mistyped one digit of a code that was fine. The old rejection goes, since it was about
   * a code that no longer exists, but the digits and the caret stay where they were.
   *
   * Asking is what starts the wait, because sending is the expensive side. Asked again
   * too soon, nothing is sent and the line says how long is left instead: the offer is
   * still there, so it owes an answer rather than going quiet.
   */
  const resend = useCallback(async () => {
    if (resending === "sending" || busy) return;
    if (cooldown > 0) return;   // the line is already counting it down; nothing to send
    setResending("sending");
    try {
      await onResend();
    } catch {
      // Nothing went out, so nothing is spent: no cooldown is armed and the offer is
      // still the offer. "failed" is a state rather than a message the caller has to
      // remember, because whoever is showing the confirmation has to stay open on it.
      setResending("failed");
      return;
    }
    setStatus((s) => (s === "error" ? "idle" : s));
    setProblem(null);           // it was about a code that no longer exists
    setStale(true);             // and so are the digits on screen
    setResending("sent");
    setCooldown(resendCooldown);
    after(RESEND_SENT_MS, () => setResending("idle"));
  }, [after, busy, cooldown, onResend, resendCooldown, resending]);

  /** put the offer back after a failure, so the confirmation can be reopened cleanly */
  const clearResendError = useCallback(() => {
    setResending((r) => (r === "failed" ? "idle" : r));
  }, []);

  /**
   * What every edit does, whichever way it arrives.
   *
   * Typing, deleting and pasting are three entry points and they used to clear the last
   * attempt's feedback separately — which meant pasting cleared none of it. Paste 1234
   * over a refused 9999 and the digits changed while "Incorrect code" stayed on screen
   * and the send box stayed hidden, because the field still believed it was holding a
   * code that had been refused. The only way forward was Enter.
   *
   * Written once here, so a fourth way in cannot quietly miss a step.
   */
  const edited = useCallback(() => {
    setStatus((s) => (s === "error" ? "idle" : s));   // the rejection was about the old code
    setProblem(null);                                 // and so was the message
    setStale(false);                                  // the digits are theirs again
  }, []);

  const write = useCallback((i: number, raw: string) => {
    if (busy) return;
    const digit = raw.replace(/\D/g, "").slice(-1);   // digits only, never letters or symbols
    if (!digit) return;
    edited();
    setEntry("type");
    const next = [...latest.current];
    next[i] = digit;
    setAll(next);
    stamp([i]);                                      // animates even when the same digit is retyped
    if (i < length - 1) focusAt(i + 1);
    // the code is finished: the caret is parked until a cell is chosen again
    if (next.every(Boolean)) setPicked(false);
    if (autoSubmit && next.every(Boolean)) submit();
  }, [autoSubmit, busy, edited, focusAt, length, setAll, stamp, submit]);

  /* Holding Backspace is our own run, not the OS key repeat. The OS waits out its
     initial repeat delay — around half a second — after the first deletion, which put a
     stall between the last digit and the rest; with a full code that reads as the erase
     stopping dead the moment the send box leaves. LEAD_MS is long enough that a single
     tap still deletes exactly one digit, and matches the send box's exit so the run picks
     up just as the box finishes going. */
  /*
   * How long the key has to be down before this stops being a press and starts being a
   * hold.
   *
   * 130ms was shorter than a deliberate press, so a single Backspace took two digits with
   * it — the run had already started by the time the key came up. 320 fixed that for a
   * quick press and not for a slow one: measured, a press held 350ms still cleared two,
   * and an unhurried press is easily that long. 500 is past anything anybody does by
   * accident and still reads as a hold rather than a wait.
   */
  const ERASE_LEAD_MS = 500;
  /** and then the run's own cadence, which is not the lead: the wait to begin and the
   *  pace once going are different questions */
  const ERASE_STEP_MS = 240;
  const ERASE_MIN_MS = 110;
  const ERASE_RAMP_MS = 30;      // each step is this much quicker than the one before
  const erasing = useRef<number[]>([]);
  /** how long until the next step, or null when no key is being held. The caret reads it
   *  so its travel can keep pace with the run instead of being cut off part-way across. */
  const erasePace = useRef<number | null>(null);
  /** the key the run belongs to, so the run ends when that key comes up and not another */
  const runKey = useRef<string | null>(null);
  const endRun = useRef<(e: KeyboardEvent) => void>(() => {});
  const stopRun = useRef<() => void>(() => {});

  const stopErasing = useCallback(() => {
    erasing.current.forEach((id) => { clearTimeout(id); clearInterval(id); });
    erasing.current = [];
    erasePace.current = null;
    runKey.current = null;
    window.removeEventListener("keyup", endRun.current);
    window.removeEventListener("blur", stopRun.current);
  }, []);

  /* watched on the window, not on the cell the key went down in: the run walks focus
     along as it goes, so by the time the key comes up it is a different input — and if
     the window itself loses focus no keyup arrives at all. */
  /* Identified by the physical key, not by the character it produced. e.key is what a
     keystroke MEANS and that can change while the key is down: hold 1, press Shift, let
     go, and the keyup says "!" — which never matches the keydown, so the run is never
     told to stop. e.code is the key itself and says Digit1 both times. */
  endRun.current = (e: KeyboardEvent) => {
    if (e.code === runKey.current) stopErasing();
  };
  stopRun.current = stopErasing;

  /** Clears the cell the caret is in, or steps back and clears that one. Returns false
   *  when there is nothing left to erase, which ends the run. */
  const eraseStep = useCallback(() => {
    const i = focusedRef.current;
    if (i === null) return false;
    // deleting is editing too: the feedback goes on the first press, not on the first
    // digit typed afterwards
    edited();
    const next = [...latest.current];
    const back = () => { focusedRef.current = i - 1; focusAt(i - 1); };
    // The caret holds its place on a cell it has just emptied, the way a text field does:
    // what you deleted is where the replacement goes. Only a press on a cell that is
    // already empty steps back. The same two rules whatever has happened — a refused code
    // is still a code being corrected, and one that once behaved differently here was a
    // second mode to learn for no gain.
    if (next[i]) next[i] = "";
    else if (i > 0) { next[i - 1] = ""; back(); }
    else return false;
    setAll(next);
    return true;
  }, [edited, focusAt, setAll]);

  /** Writes the held digit into the caret's cell and steps forward. Returns false once
   *  the code is full, which ends the run — and leaves the send box to open on its own. */
  const typeStep = useCallback((digit: string) => {
    const i = focusedRef.current;
    if (i === null || latest.current.every(Boolean)) return false;
    write(i, digit);
    // set here as well as by the focus that write moves: the run has to know where it is
    // even in the frame before the focus event lands
    if (i < length - 1) focusedRef.current = i + 1;
    return !latest.current.every(Boolean);
  }, [length, write]);

  /* One run, either direction. Both are ours rather than the OS repeat, for the same
     reason and at the same cadence: hold a digit and the code fills a cell at a time,
     hold Backspace and it empties a cell at a time, and the two take the same length of
     time to cross the field. The OS rate is neither — about 30ms between repeats after a
     half-second stall, which filled all four cells in a tenth of a second and left the
     last one apparently arriving late because it was the only one anybody could see. */
  const holdRun = useCallback((code: string, first: () => boolean) => {
    runKey.current = code;
    window.addEventListener("keyup", endRun.current);
    window.addEventListener("blur", stopRun.current);
    // each step a little quicker than the last, down to a floor: a flat interval after a
    // longer lead-in leaves the first gap twice the rest, which still reads as a catch
    const step = (gap: number, lead = false) => {
      erasing.current.push(window.setTimeout(() => {
        const next = lead ? ERASE_STEP_MS : Math.max(ERASE_MIN_MS, gap - ERASE_RAMP_MS);
        erasePace.current = next;        // set before the step, which is what reads it
        if (!first()) return stopErasing();
        step(next);
      }, gap));
    };
    step(ERASE_LEAD_MS, true);   // the pace is declared by the run itself, so a single
                                 // press still gets a full, unhurried caret travel
  }, [stopErasing]);

  useEffect(() => stopErasing, [stopErasing]);

  const onKeyDown = useCallback((i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); submit(); return; }
    if (busy) { e.preventDefault(); return; }
    const typed = e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey;
    if (typed) {
      // handled here, not via onChange: React suppresses change events when a cell is
      // retyped with the digit it already holds, and that still counts as a new entry
      e.preventDefault();
      if (!/\d/.test(e.key)) return;
      if (!stepsWhenHeld) { write(i, e.key); return; }
      if (e.repeat) return;              // the OS repeat is ignored; the run below is ours
      focusedRef.current = i;
      stopErasing();
      write(i, e.key);
      if (i < length - 1) focusedRef.current = i + 1;
      if (latest.current.every(Boolean)) return;   // that filled it; there is no run to start
      const digit = e.key;
      holdRun(e.code, () => typeStep(digit));
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      if (e.repeat) return;                            // the OS repeat is ignored; the run below is ours
      if (status === "error") setStatus("idle");       // editing dismisses the last rejection
      setEntry("type");                                // editing a pasted code makes it typed
      focusedRef.current = i;
      stopErasing();
      eraseStep();
      holdRun(e.code, eraseStep);
    } else if (e.key === "ArrowLeft") focusAt(i - 1);
    else if (e.key === "ArrowRight") focusAt(i + 1);
  }, [busy, eraseStep, focusAt, holdRun, length, status, stepsWhenHeld, stopErasing, submit, typeStep, write]);



  /**
   * Pasted digits land where the caret is, not always at the first cell.
   *
   * A paste used to be written from index 0 whatever was selected, and it cleared
   * everything it did not cover — so selecting the second cell and pasting three digits
   * filled cells one to three and wiped the fourth. The caret was saying where to put
   * them and was being ignored.
   *
   * With one exception, and it is the common case: a paste of exactly the code's length
   * IS the code — the whole thing, off an SMS — so it replaces the whole thing from the
   * start. Dropped at the caret instead, a full code pasted into the third cell would
   * lose its last two digits off the end, which is never what was meant.
   */
  const onPaste = useCallback((e: React.ClipboardEvent) => {
    if (busy) return;
    const code = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!code) return;
    e.preventDefault();
    const whole = code.length >= length;
    const at = whole ? 0 : focusedRef.current ?? 0;
    // a whole code replaces; a fragment is written over what it covers and leaves the
    // rest alone, because the digits it does not reach were not being corrected
    const next = whole ? Array.from({ length }, (_, i) => code[i] ?? "") : [...latest.current];
    const written: number[] = [];
    for (let i = 0; i < code.length && at + i < length; i++) {
      next[at + i] = code[i];
      written.push(at + i);
    }
    edited();
    setEntry("paste");
    setAll(next);
    stamp(written);                                   // all at once, no stagger
    focusAt(Math.min(length - 1, at + code.length));
    if (next.every(Boolean)) setPicked(false);
    if (autoSubmit && next.every(Boolean)) submit();
  }, [autoSubmit, busy, edited, focusAt, length, setAll, stamp, submit]);

  /**
   * Focus lands where there is something to do.
   *
   * Clicking the fourth cell of an empty code put the caret there, and the next keystroke
   * filled cell four — a code with a hole in it, from a press that could only have meant
   * "let me start". An empty cell with an empty cell before it is not somewhere to type,
   * so the press is taken as a request to begin and lands on the first gap instead.
   *
   * A cell that HAS a digit is always clickable, because that is a correction and the
   * person is pointing at the digit they want to change. Only the empty ones are steered.
   */
  const onFocus = useCallback((i: number, e: React.FocusEvent<HTMLInputElement>) => {
    const entered = latest.current;
    if (!entered[i]) {
      const gap = entered.findIndex((d) => !d);
      if (gap !== -1 && gap < i) { focusAt(gap); return; }
    }
    focusedRef.current = i;
    setFocused(i);
    setPicked(true);
    e.target.select();
  }, [focusAt]);

  /** Clicking the cell that already has focus fires no focus event, and it is still a
   *  choice — so the press counts as one on its own. */
  const pick = useCallback(() => setPicked(true), []);

  const onBlur = useCallback(() => setFocused(null), []);

  return {
    digits, stamps, status, shake, busy, focused, onFocus, onBlur, erasePace, entry,
    cooldown, resending, resend, clearResendError, problem, stale, submit,
    cells, write, onKeyDown, onPaste, reset, focusAt, picked, pick,
  };
}
