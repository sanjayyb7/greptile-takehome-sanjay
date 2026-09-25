# Passcode Flow

A 4-digit authentication code entry experience — the kind you type to mirror a laptop onto a TV.

<!-- Demo video: edit this file on github.com and drag an .mp4 or .mov onto this line.
     GitHub uploads it and replaces it with a link that plays inline (10MB on a free plan). -->

The static states come from the supplied design and are matched exactly. Everything between
those states — timing, feedback, failure, edge cases — was left open, and that is where the
work went.

## How it got here

### Explorations first, then a choice

There are two branches:

- **[`explorations`](https://github.com/sanjayyb7/greptile-takehome-sanjay/tree/explorations)**
  — every direction that was tried, each one a dot on a switcher at the bottom of the page.
  Live at **https://passcode-explorations.vercel.app**. The strip sits at the same point on
  screen in every version, so switching between them compares the motion and nothing else.
- **`main`** — only the one that was chosen, with nothing else in it. It is the same code
  as dot 7 on the explorations branch, and the two are checked against each other pixel
  for pixel.

Rather than settle on the first idea for each open question, each idea became a version,
and each version was used — typed into, backspaced, refused, resent — until it was clear
what it got right and what it got wrong. Later versions keep what earlier ones got right.

It was not clear how far the design could be moved away from the supplied frames. The chosen
version stays inside them. Version 8 goes one step further and is kept as an exploration: a
**"Check your email"** heading above the field, with the address the code was sent to.
Four empty boxes assume you already know what they are for; saying where the code went
answers the two questions people arrive with — what is this, and where do I look — before
the field asks for anything. That change felt clearly right, so it is shown, but it is
kept out of the chosen version because it goes beyond the design.

### The idea: every step is pushed by the one before

The brief asks for Enter to submit, which means the code must not submit itself the moment
the fourth digit lands. So there has to be a moment where the code is complete but not
sent, and something to press. The whole interaction grew out of making that moment feel
caused rather than appearing:

1. **The caret writes.** It is a block that crosses into the next cell and writes the digit
   as it passes over it. Deleting runs the same crossing backwards and rubs the digit out.
   Holding a digit or Backspace fills or empties the field at one even pace, a cell per
   crossing, with no stall after the first.
2. **The block pushes the send box out.** On the fourth digit the block carries on to the
   strip's edge, and only when it touches the edge does the box start to open. Between the
   two runs a bridge at the block's own height — it holds while the block is still pushing,
   drains from the block's end once the block has gone into the edge, and the box takes in
   the rest.
3. **The box shows the arrow.** Once the box has cleared the strip, the arrow travels into
   it. Press it, or press Enter, and the code goes. Backspace on a complete code plays the
   whole thing in reverse: the arrow leaves, the bridge forms again, the box is pulled back
   into the strip. Retyping the last digit halfway through turns the box round from where
   it is.
4. **The loader closes into the answer.** While the code is checked the spinner turns.
   Accepted, its spokes gather into a dot that opens into the tick, and the row travels
   down into the cells' place. Refused, the same dot opens into a red "!" instead, and the
   label, the selected cell and the shake all land on that frame, the shake lasting exactly
   as long as the mark takes to draw.

### The tour

| Dot | Version | What it tried |
| --- | --- | --- |
| 1 | [Vanishing letters](https://passcode-explorations.vercel.app/?v=13) | The digit rises in through the cell's bottom edge and slides back down past it |
| 2 | [Caret: smear](https://passcode-explorations.vercel.app/?v=12) | The caret stretches into a block as it travels, then snaps back to a line |
| 3 | [Version 1](https://passcode-explorations.vercel.app/?v=1) | A send box on the end of the strip; digits rise into place |
| 4 | [Version 2](https://passcode-explorations.vercel.app/?v=2) | The send box set apart in its own container |
| 5 | [Version 4](https://passcode-explorations.vercel.app/?v=4) | The box arrives attached, then is shoved clear — the push opens the gap |
| 6 | [Fluid](https://passcode-explorations.vercel.app/?v=5) | The box separates from the strip like liquid; a neck thins and breaks |
| 7 | [**The chosen one**](https://passcode-explorations.vercel.app/?v=8) | The block pushes the box out through the bridge; the box clears in one move; every case is answered out loud |
| 8 | [Check your email](https://passcode-explorations.vercel.app/?v=14) | Dot 7 plus a heading naming where the code went, a filled circle for the mark, no shadow on the selected cell, and a resend that sends on the press |

A liquid pour — the send box pouring up into the loader — was also built, and is set aside
in the code rather than on the switcher.

### Then making it hold up

Once the interaction was settled, the same component went through a reliability pass
without changing how it looks: keyboard focus that never gets trapped, one-time-code
autofill and mobile keyboard deletion, phones down to 320px, reduced motion that really
removes movement, verification that a reset or an unmount can no longer be overtaken by a
late answer, and a callback for when the success animation has finished. Every fix has a
test, and each was run against the code without its fix to see it fail.

## Running locally

Requires Node 20+.

```bash
npm install
npm run dev
```

Then open the URL Vite prints (http://localhost:5173 by default).

The passcode is **1234**. Any other four digits fail.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Typecheck and production build |
| `npm run preview` | Serve the production build |
| `npm test` | The test suite (starts its own dev server) |

## Tests

```bash
npx playwright install chromium   # once
npm test
```

Fifty tests in a real browser, in five files:

- **`tests/rules.spec.ts`** — the brief's rules, one test each.
  Digits only, paste filtered, focus advancing, both Backspace behaviours, hold-to-clear,
  Enter submitting, and the delay actually being a couple of seconds.
- **`tests/cases.spec.ts`** — the ten cases, in the order they are written down.
- **`tests/regressions.spec.ts`** — one test per bug that actually shipped and was found by
  hand. These are the ones worth having: each names a mistake that was easy to make,
  survived review, and now takes a second to catch.
- **`tests/a11y.spec.ts`** — reliability and accessibility. Tab and Shift+Tab pass
  through the field in one stop and out again, the hidden cells leave the focus order and
  the accessibility tree once authenticated, one-time-code autofill and mobile keyboard
  deletion work, everything fits and works at 320px and 375px, and under reduced motion
  nothing moves through a whole attempt.
- **`tests/lifecycle.spec.ts`** — what happens around a verification. A reset, a newer
  attempt or an unmount while a check is still out leaves the late answer with nothing to
  change; `onSuccessAnimationComplete` fires once, after the row has moved down (and at
  once under reduced motion); the send box turns round from where it is when the last
  digit is retyped; Tab works during the wait while edits and resubmits do not. These run
  on `harness.html`, a page the dev server serves for the tests, where each check waits to
  be answered by the test itself. It is never built.

Playwright rather than jsdom, because jsdom has no modal `<dialog>`, no `element.animate`
and no real focus — and all three of those are where the bugs were. Testing a polyfilled
fiction of this component would have caught none of them.

One thing worth knowing about the regression tests: the reopen-mid-flight test *dispatches*
its click rather than using Playwright's. A normal click waits for the link to be
actionable, which means waiting for the modal above it to go — and waiting is the one thing
that makes that bug impossible. Each regression test was checked by reverting the fix and
confirming it fails.

## What to try

- **`1234`** — the spokes gather into a dot, the dot opens into the mark, the tick is drawn
  across it as the label changes, and the two travel down into the cells' place
- **Any other code** — the box goes, the spinner closes into a red "!", "Incorrect code"
  appears in the status row, the last cell is selected in red, and the strip shakes for as
  long as the mark takes to draw. The code stays on screen — clearing it is the person's
  move — and any edit clears the verdict
- **Backspace** — clears the cell it is in and stays there, the way a text field does:
  what you deleted is where the replacement goes. Only a press on a cell that is already
  empty steps back. The same two rules whatever has happened, a refused code included —
  that is still a code being corrected
- **Hold a digit, or hold Backspace** — the field fills and empties a cell at a time at the
  same cadence, driven here rather than by the OS key repeat
- **Click a cell three along** — the block spans the whole journey rather than jumping
- **Paste a code** — digits are filtered to numerals and land together, and the move out to
  the send box carries the moment on its own
- **Enter on a half-filled code** — nudges focus to the gap instead of failing
- **Resend** — offered from the first frame, because waiting out a timer for a code that
  never arrived helps nobody. It asks first, naming the address the code will go to; then
  the line answers in sequence: "Code resent", the 30s wait counting down, the offer again.
  A new code leaves what you have typed alone
- **Send** — the code is not submitted automatically. The fourth digit opens a fifth box on
  the end of the strip and the code goes when it is pressed, so a mistyped digit stays
  fixable. Enter still submits, and `?auto` restores submit-on-last-digit
- **`0000`** — makes the check fall over rather than answer, so the connection failure can
  be seen; **`?resendfail`** makes the first send fail so the recovery can be
- **`?len=6`** — builds the field at another length. The design is drawn for four, so four
  is what it opens at; this is here because "it is a component, not a demo" is a claim, and
  a claim you cannot try is a sentence in a README

## Structure

One version of the field and nothing else: the explorations that produced it live on the
`explorations` branch, and this branch is only what was chosen. No switcher, no variant flags, no code
for a path this build never takes.

| | Files | What |
| --- | --- | --- |
| **The component** | `src/passkey/` | 14 files. The field itself. Nothing in it knows about the page, and nothing outside it is needed to use it. |
| **The page** | `src/main.tsx`, `src/styles.css` | 2 files. What renders the field. Neither ships with the component. |
| **The test page** | `harness.html`, `src/harness.tsx` | 2 files. The field with checks the tests answer by hand. Served in development, never built. |
| **The tests** | `tests/`, `playwright.config.ts` | 6 files. 50 tests in a real browser. |
| **The scaffolding** | `package.json`, `tsconfig*.json`, `vite.config.ts`, `index.html`, `.gitignore` | What Vite and TypeScript need. `npm run build` typechecks all three projects — the app, the Vite config, and the tests — so a type error in a spec fails the build rather than waiting for someone to run it. |

```
src/passkey/                 the component — nothing in here knows about the page
  index.ts                  the public surface: what an app outside the folder imports
  PasskeyField.tsx          composition, and the copy for each state
  PasskeyCells.tsx          the inputs, the animated glyph, the caret and its block
  PasskeySend.tsx           the send box: how it opens out of the strip and clears
  PasskeyResend.tsx         the line underneath — offer, sending, sent, the wait
  PasskeyResendDialog.tsx   the confirmation in front of a resend
  StatusIcon.tsx            spinner and check, stacked in one 32px slot
  usePasskey.ts             the state machine — no markup, drives everything
  verifyPasscode.ts         stand-in for the auth call, and the resend timings
  timing.ts                 the numbers two modules have to agree on
  passkey.css               the stylesheet's index — the order the parts cascade in
  styles/
    field.css               tokens, and the box the field itself is
    status.css              the line above the strip and the line below it
    send.css                the send box
    resend.css              the resend line
    strip.css               cells, caret, digit
    states.css              focused, verifying, refused, and reduced motion
    fluid.css               the bridge the box parts from the strip with
    dialog.css              the confirmation

src/main.tsx                 the page that renders it
src/styles.css               and centres it
src/harness.tsx              the tests' page — checks answered by hand (harness.html)
```

The stylesheet was one file of a thousand lines. Split, each part is the size of the thing
it describes. CSS is order-dependent, so the split is strictly by adjacent range and
`passkey.css` is now just the list that fixes the order — the built output is byte for
byte what it was before.

## Using it

The field is a component, not a demo, and it comes apart into two layers. Take whichever
one you need.

### Everything it does not own is a prop

```tsx
import { PasskeyField } from "./passkey";

function SignIn() {
  return (
    <PasskeyField
      // Check the code. Resolve true to accept, false to refuse — and REJECT if the
      // check could not be made at all. The field keeps those apart: a refusal says
      // "Incorrect code", a rejection says "Not verified", and only one of them means
      // retype it.
      onVerify={async (code) => {
        const res = await fetch("/api/verify", {
          method: "POST",
          body: JSON.stringify({ code }),
        });
        if (!res.ok) throw new Error("could not reach the server");   // → offline
        return (await res.json()).valid;                              // → true / false
      }}

      // Send a new code. Reject and the confirmation stays open saying so, with nothing
      // spent: no cooldown is armed and it can be retried from inside the dialog.
      onResend={() => fetch("/api/resend", { method: "POST" })}

      resendTo="sanjay@example.com"   // named in the confirmation, so it can be checked
      resendCooldown={60}             // seconds before another can be asked for
      length={6}                      // cells; the strip and the copy both follow it

      // Leave once the authenticated animation has finished — the mark drawn and the row
      // moved down into the cells' place. onSuccess fires as soon as the code is accepted,
      // which is too early to navigate from: the page would change mid-animation.
      onSuccessAnimationComplete={() => router.push("/dashboard")}
    />
  );
}
```

Every prop is optional. `autoFocus` puts the caret in the first cell on mount (default
on), `send` offers the arrow button once the code is complete (default on), and
`autoSubmit` submits on the last digit instead — Enter submits either way.

### The state machine, without the markup

`usePasskey` holds `idle → verifying → success | error`, the hold-to-repeat runs, the
deletion rules, paste handling and the resend cooldown, and renders nothing. It will drive
a strip of your own:

```tsx
const { digits, status, problem, cells, onKeyDown, onPaste, submit } =
  usePasskey({ length: 6, onVerify });
```

### What is demo behaviour, and what is not

`verifyPasscode.ts` is a stand-in for a real service and is the **only** file that has to
go. Nothing else in `src/passkey/` knows what a correct code is.

| | |
| --- | --- |
| **`1234` is accepted** | Only because `verifyPasscode` says so. Pass `onVerify` and it is never consulted. |
| **`0000` fails to connect** | A reserved code that makes the stand-in *reject* rather than answer, so the offline path can be reached by typing. Real code would reject on a network error. |
| **The resend always succeeds** | `requestNewCode` resolves after 900ms. `?resendfail` makes the first attempt fail so the recovery can be seen. |
| **The two-second wait** | `VERIFY_MS`, there to make the verifying state visible. A real call takes as long as it takes. |
| **`you@example.com`** | The `resendTo` default. Pass the real address. |
| **`?len=` and `?auto`** | Read in `src/main.tsx`, the demo page; **`?resendfail`** in `verifyPasscode.ts`. The component knows nothing about any of them. |

### Styling

Every token is declared on `.passkey` rather than `:root`, so dropping the field into an
app cannot collide with its variables. Override them by setting the same names on the
field or anything above it — `--pk-focus`, `--pk-face`, `--pk-line`, `--pk-ink`,
`--pk-bad` for colour; `--pk-cell-w` and the `--pk-*-ms` family for size and timing. Two
fields on one page are independent: every id the field writes is generated, and nothing
reaches into the document to find its own parts.

## Decisions worth naming

**The glyph is not the input's own text.** An `<input>` can't animate its text, so each cell
paints its digit in an `aria-hidden` layer above a real input. The input keeps the value,
the caret, the mobile numpad, autofill and the screen-reader label; the layer only draws.
The layer is clipped to the cell so a digit can travel through the bottom edge without
escaping, while the focus ring and shadow sit outside the clip and stay intact.

**Digit entry is handled on `keydown`, not `onChange`.** React suppresses change events when
a cell is retyped with the digit it already holds, and that still counts as a new entry that
should animate. `onChange` remains as the fallback for mobile keyboards and autofill.

**The Send box is the submit, and Enter always works.** The rules only require Enter, so
the box is an addition rather than an assumption — the fourth digit opens it and the code
goes when it is pressed, which keeps a mistyped digit fixable. `?auto` restores
submit-on-the-last-digit, and `autoSubmit` is the prop behind it.

**There is no attempt limit.** A wrong code is refused and the field stays open. An earlier
build locked after three, and it was the wrong shape for this: the brief's own analogy is a
passcode on a television, where the person typing has the code in front of them and the
failure is almost always a typo. Locking punishes the typo. The only rate limit is on
asking for a *new* code, because sending is the expensive side.

**Failure is invented.** None of it appears in the design, so the red, the shake and the
copy are choices. The verdict is said where progress is said — in the status row above the
strip — so a success and a refusal arrive in the same place and out of the same motion:
the spinner closes to a dot, and the dot opens into a tick or a red "!". Each case has its
own words: "Incorrect code" means retype it, "Missing digits" means finish it, and "Not
verified" means the check never answered, so the digits may well be right.

**Resend is offered from the first frame.** The design has no resend control, so this is an
addition: it answers "what if the code never arrived", which the four frames don't. Asking
is what arms the wait, because sending is what costs — a timer running before anything has
been sent is a timer on a question nobody asked.

Once a code has gone, the wait counts down in the open rather than waiting to be asked
for. A timer reads as a penalty when it appears unexplained; following "Code resent" it is
the answer to the obvious next question, which is when the next one can be had. The
seconds are tabular so the line cannot reflow as it ticks. A new code leaves whatever is
typed alone — those digits are the person's work, and a code arriving by SMS is no reason
to throw it away.

**Success drops the strip.** The design's authenticated frame shows the label alone, so the
cells exit. That's an inference from what the frame omits.

**The end cells' focus ring keeps the strip's 16px corner.** The design only ever shows a
middle cell focused; squaring off an end would break the strip's silhouette.

**State never shifts the layout.** The status row holds its 32px whether or not it has a
message, and every verdict is said there, so nothing arrives under the strip to lift the
cells at the moment you are about to retype them.

## Accessibility

Real inputs with `aria-label` per cell, `inputMode="numeric"`, `autocomplete="one-time-code"`,
and a `role="status"` live region announcing each state change. The animated glyph layer is
`aria-hidden`. The cells take one Tab stop — the cell typing would go to — so Tab and
Shift+Tab pass through the field and out again, including while a code is being checked;
once authenticated, the faded cells leave the focus order and the accessibility tree.

Under `prefers-reduced-motion` the digits appear and clear immediately, the caret stops
travelling, the shake is dropped, labels and the arrow fade instead of sliding, and the
success sequence keeps its states but loses its travel. The spinner keeps pulsing — the wait still has to read as a wait — but on opacity
alone, pinned at its resting radius, so nothing moves. Reduced motion means less motion,
not no feedback.
