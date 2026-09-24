# Passcode Flow

A 4-digit authentication code entry experience — the kind you type to mirror a laptop onto a TV.

The static states come from the supplied design and are matched exactly. Everything between
those states — timing, feedback, failure, edge cases — is the part that was open-ended.

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

Twenty-four tests in a real browser, in three files:

- **`tests/rules.spec.ts`** — the brief's rules, one test each.
  Digits only, paste filtered, focus advancing, both Backspace behaviours, hold-to-clear,
  Enter submitting, and the delay actually being a couple of seconds.
- **`tests/cases.spec.ts`** — the ten cases, in the order they are written down.
- **`tests/regressions.spec.ts`** — one test per bug that actually shipped and was found by
  hand. These are the ones worth having: each names a mistake that was easy to make,
  survived review, and now takes a second to catch.

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
- **Any other code** — the box goes, the last cell is selected, and the strip shakes and
  turns red for exactly as long as the shake lasts. The red lifts; the line underneath
  stays until something is edited. The code stays on screen too: clearing it is the
  person's move
- **Backspace after a rejection** — clears and steps back each press, because the code on
  screen is one to get rid of. On a complete code it clears in place instead, because
  there the replacement goes where the old digit was
- **Hold a digit, or hold Backspace** — the field fills and empties a cell at a time at the
  same cadence, driven here rather than by the OS key repeat
- **Click a cell three along** — the block spans the whole journey rather than jumping
- **Paste a code** — digits are filtered to numerals and land together, and the move out to
  the send box carries the moment on its own
- **Enter on a half-filled code** — nudges focus to the gap instead of failing
- **Resend** — offered from the first frame, because waiting out a timer for a code that
  never arrived helps nobody. The line then answers in sequence: sending, sent, the 30s
  wait counting down, the offer again. A new code leaves what you have typed alone
- **Send** — the code is not submitted automatically. The fourth digit opens a fifth box on
  the end of the strip and the code goes when it is pressed, so a mistyped digit stays
  fixable. Enter still submits, and `?auto` restores submit-on-last-digit
- **`0000`** — makes the check fall over rather than answer, so the connection failure can
  be seen; **`?resendfail`** makes the first send fail so the recovery can be
- **`?len=6`** — builds the field at another length. The design is drawn for four, so four
  is what it opens at; this is here because "it is a component, not a demo" is a claim, and
  a claim you cannot try is a sentence in a README

## Structure

One version of the field and nothing else: the ten explorations that produced it live on
`main`, and this branch is only what was chosen. No switcher, no variant flags, no code
for a path this build never takes.

| | Files | What |
| --- | --- | --- |
| **The component** | `src/passkey/` | 14 files. The field itself. Nothing in it knows about the page, and nothing outside it is needed to use it. |
| **The page** | `src/main.tsx`, `src/styles.css` | 2 files. What renders the field. Neither ships with the component. |
| **The tests** | `tests/`, `playwright.config.ts` | 5 files. 24 tests in a real browser. |
| **The scaffolding** | `package.json`, `tsconfig*.json`, `vite.config.ts`, `index.html`, `.gitignore` | What Vite and TypeScript need. Untouched from the starting point except for the test scripts. |

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
    fluid.css               the neck the box parts from the strip with
    dialog.css              the confirmation

src/main.tsx                 the page that renders it
src/styles.css               and centres it
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
      // "Incorrect code", a rejection says "Couldn't verify your code", and only one
      // of them means retype it.
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

      onSuccess={(code) => router.push("/dashboard")}
    />
  );
}
```

Every prop is optional. `autoFocus` puts the caret in the first cell on mount (default
on), `send` offers the arrow button once the code is complete (default on), and
`autoSubmit` submits on the last digit instead — Enter submits either way.

### The state machine, without the markup

`usePasskey` holds `idle → verifying → success | error`, the hold-to-repeat runs, the two
Backspace modes, paste handling and the resend cooldown, and renders nothing. It will
drive a strip of your own:

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
copy are choices. Progress reads above the strip where the design puts it; failure reads
underneath, flush with the strip's left edge, so the two never compete for the same line.
The rejection is a moment rather than a state — the red lasts exactly as long as the shake
and then the field is itself again, with the line underneath carrying it from there.

**Resend is offered from the first frame.** The design has no resend control, so this is an
addition: it answers "what if the code never arrived", which the four frames don't. Asking
is what arms the wait, because sending is what costs — a timer running before anything has
been sent is a timer on a question nobody asked.

Once a code has gone, the wait counts down in the open rather than waiting to be asked
for. A timer reads as a penalty when it appears unexplained; following "New code sent" it
is the answer to the obvious next question, which is when the next one can be had. The
seconds are zero-padded and tabular so the line cannot reflow as it ticks, and it is left
aligned with the strip so only its right edge is ever in motion. A new code leaves
whatever is typed alone — those digits are the person's work, and a code arriving by SMS
is no reason to throw it away.

**Success drops the strip.** The design's authenticated frame shows the label alone, so the
cells exit. That's an inference from what the frame omits.

**The end cells' focus ring keeps the strip's 16px corner.** The design only ever shows a
middle cell focused; squaring off an end would break the strip's silhouette.

**State never shifts the layout.** The status row holds its 32px whether or not it has a
message, and the field holds the height of its tallest state — so the
failure line appears in space that was already reserved rather than lifting the cells 19px
at the moment you are about to retype them.

## Accessibility

Real inputs with `aria-label` per cell, `inputMode="numeric"`, `autocomplete="one-time-code"`,
and a `role="status"` live region announcing each state change. The animated glyph layer is
`aria-hidden`.

Under `prefers-reduced-motion` the digits appear and clear immediately, the caret stops
travelling, the shake is dropped and the success sequence keeps its states but loses its
travel. The spinner keeps pulsing — the wait still has to read as a wait — but on opacity
alone, pinned at its resting radius, so nothing moves. Reduced motion means less motion,
not no feedback.
