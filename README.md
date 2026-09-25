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

- **`tests/rules.spec.ts`** — the brief's rules, one test each, against the chosen version.
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
- **`?v=8`** — opens on a particular version; see below

## Structure

Everything here is the passcode field and the things needed to run it, try it or test it —
39 files, and nothing that is not one of those four. No leftover experiments, no scratch
branches folded in, no notes from getting here.

| | Files | What |
| --- | --- | --- |
| **The component** | `src/passkey/` | 16 files. The field itself. Nothing in it knows about the demo, and nothing outside it is needed to use it. |
| **The demo** | `src/main.tsx`, `src/styles.css`, `src/dev/` | 4 files. The page that renders the field and the switcher that walks the versions. None of it ships with the component. |
| **The tests** | `tests/`, `playwright.config.ts` | 5 files. 24 tests in a real browser. |
| **The scaffolding** | `package.json`, `tsconfig*.json`, `vite.config.ts`, `index.html`, `.gitignore` | What Vite and TypeScript need. Untouched from the starting point except for the test scripts. |

```
src/passkey/                 the component — nothing in here knows about the demo
  index.ts                  the public surface: what an app outside the folder imports
  PasskeyField.tsx          composition, and the copy for each state
  PasskeyCells.tsx          the inputs, the animated glyph, the caret and its block
  PasskeySend.tsx           the send box: how it opens out of the strip and clears
  PasskeyResend.tsx         the line underneath — offer, sending, sent, the wait
  PasskeyResendDialog.tsx   the confirmation in front of a resend
  StatusIcon.tsx            spinner and check, stacked in one 32px slot
  usePasskey.ts             the state machine — no markup, drives everything
  variants.ts               what differs between the versions, one flag per trait
  verifyPasscode.ts         stand-in for the auth call, and the resend timings
  timing.ts                 the numbers two modules have to agree on
  spring.ts                 a damped oscillator sampled into a CSS linear() easing
  passkey.css               the stylesheet's index — the order the parts cascade in
  styles/
    field.css               tokens, and the box the field itself is
    status.css              the line above the strip and the line below it
    send.css                the send box
    resend.css              the resend line
    strip.css               cells, caret, digit
    states.css              focused, verifying, refused, and reduced motion
    fluid.css               the versions where the box parts from the strip as liquid
    dialog.css              the confirmation

src/dev/                     the harness — none of it ships with the field
  VersionDots.tsx           the switcher at the foot of the screen
  versions.css              its styles
```

The stylesheet was one file of a thousand lines. Split, each part is the size of the thing
it describes. CSS is order-dependent, so the split is strictly by adjacent range and
`passkey.css` is now just the list that fixes the order — the built output is byte for
byte what it was before.

## Using it

The field is a component, not a demo, and it comes apart into three layers. Take whichever
one you need:

**The whole thing.** Everything it does not own is a prop:

```tsx
import { PasskeyField } from "./passkey";

<PasskeyField
  onVerify={(code) => api.verify(code)}   // anything resolving true or false
  onResend={() => api.sendNewCode()}
  resendCooldown={60}                     // seconds before another can be asked for
  length={6}
  onSuccessAnimationComplete={() => router.push("/dashboard")}   // after the success animation
/>
```

Left out, `onVerify` and `onResend` fall back to the stand-ins in `verifyPasscode.ts`,
which is what makes the demo answer to `1234`.

**The behaviour, without the version numbers.** `version` is a shorthand for a set of
traits — how a digit arrives, how the caret crosses, whether there is a send box, what
happens on a rejection. `behaviourOf` turns a version into that set, and the field takes
the set directly, so a field that is none of the ten can still be described:

```tsx
import { PasskeyField, behaviourOf } from "./passkey";

<PasskeyField behaviour={{ ...behaviourOf(8), hasSend: false, caret: "jump" }} />
```

That is the layer that keeps the exploration out of the component's surface: the field
reads one object, and `variants.ts` is only one way of producing it.

**The machine, without the markup.** `usePasskey` holds `idle → verifying → success |
error`, the hold-to-repeat runs, the two Backspace modes and the resend cooldown, and
renders nothing. It will drive a strip of your own:

```tsx
const { digits, status, cells, onKeyDown, onPaste, submit } =
  usePasskey({ length: 6, onVerify });
```

**Styling.** Every token is declared on `.passkey` rather than `:root`, so dropping the
field into an app cannot collide with its variables. Override them by setting the same
names on the field or anything above it — `--pk-focus`, `--pk-face`, `--pk-line`,
`--pk-ink`, `--pk-bad` for colour; `--pk-cell-w` and the `--pk-*-ms` family for size and
timing. Two fields on one page are independent; nothing reaches into the document to find
its own parts.

## The versions

The brief left the transitions open, so rather than pick one reading and present it as
the answer, nine of them are in the build and switchable — the numbered row at the foot
of the screen, or `?v=<n>`. They run in the order the work happened: the caret on its own,
then the letters, then the caret carrying the letters, then the send box appearing and
being worked out over four goes.

**The chosen one is marked with a black dot** and is what the build opens on. The rest are
kept because the reasoning is more useful than the conclusion — several of them are here
precisely because they were tried and rejected, and it is easier to say why the last one
is right with the others next to it.

## Saying what went wrong

This lived beside version 8 for a while, as 8.1, because the cost is real — more copy on
screen, a dialog in the way, and a field that talks where eight simply behaved. Put next
to each other the trade was not close, so it is not a variant any more: it is what
version 8 is.

| Case | What happens |
| --- | --- |
| Enter on an incomplete code | Focus goes to the first empty cell and the line reads "Enter all 4 digits." Nothing is sent, so the strip does not go red |
| Incorrect code | "Incorrect code. Try again." under the strip. The digits stay editable and the message goes the moment one is typed or deleted |
| Verification fails to connect | "Couldn't verify your code. Try again." — not "incorrect", because no verdict was reached. The digits are kept and can be submitted again |
| Repeated Enter while verifying | Ignored. One loading sequence, however many presses |
| Resend | Opens a confirmation naming where the code is going, with Cancel and Resend code |
| Cancel | Closes, keeps the digits, and puts focus back on the resend link |
| After a send | The send box goes, because the complete code on screen is now the previous one. Focus lands in the strip — the first empty cell, or the last one on a full code — and the first edit brings the box back. Enter still submits throughout |
| Confirm | The button becomes "Sending…" and both buttons disable, so a second press is impossible rather than merely ignored |
| Send succeeds | The dialog closes, "Code resent" stands where the link was, then the wait as a clock — "Resend in 0:30" |
| Send fails | The dialog stays open with "Couldn't send the code. Try again." Nothing is spent, so no cooldown is armed and it can be retried or cancelled |
| During the cooldown | Only the resend is disabled. Typing and verification carry on, and at zero "Resend code" comes back |

Under the strip, version 8 centres where the earlier versions sit flush left. Elsewhere the line
is a caption belonging to the field, the way helper text sits under an input; here it is
the field's own voice, speaking in whole sentences about what happened, and a sentence
centred under a centred block is the balanced reading of the two. It only works because
nothing in this version's copy reflows — the wait is a clock, "Resend in 0:30" through
"0:01", four characters either way and tabular, so it counts the whole way down without
either edge moving.

Three things in that list are decisions rather than mechanics:

**An incomplete code is not an error.** It shakes and says what is missing, but the field
stays idle and the cells keep their colour. Red would say the code was refused; it was
never asked about.

**A failed connection is not a wrong code.** The stand-in `verifyPasscode` *rejects* rather
than resolving false, and the hook keeps the two apart all the way to the copy — one means
retype, the other means try again, and the digits may well be right.

**The confirmation exists because a resend spends something.** A real code goes out and a
thirty-second wait is armed behind it, so a misclick costs both. It names the address
because "resend" alone cannot answer the question people have at that point, which is
whether the code is going somewhere they can still read. It is built on `<dialog>`, which
already does the top layer, the inert background, the focus trap and Escape correctly.

**It comes out of the link and lands over the strip.** Same curve and same duration as the
send box opening — 380ms out on `cubic-bezier(0.33, 1, 0.68, 1)`, 234ms back in, with a
middle frame wider than it is tall, because something pushed out through a small opening
is fatter across the opening than along it. The transform origin is the link's centre in
the dialog's own coordinates, so it grows out of the control that was pressed rather than
out of its own middle, and Cancel runs it backwards into the link. It is centred on the
strip and stands a little proud of it: the question is about the code typed there, and
asked anywhere else it is a notice about the field rather than something happening to it.
Matched to the strip's width exactly it read as a lid fitted to the box — one object, and
the question a state of the field rather than a thing arriving on top of it.

## Where this departs from the design

The supplied screens define the states. What happens between them is what the exercise
left open, and that is where all of this work sits — with one deliberate exception.

**Version 9 changes a state.** The design's authenticated mark is an outlined square with
a green tick. Every version here lands on exactly that, including the chosen one. Version
9 lands on a filled green circle with a white tick instead.

The reason is the frame before it. The spinner is eight spokes on a ring, and on success
they are pulled inward until they overlap into one solid dot; the mark is then handed that
dot and opens out of it at the same size — scaled from .12, a 24px mark is 2.88px across,
which is the dot.

Handing that dot to an outlined square loses two things at once. It loses its **mass**:
something filled becomes something hollow, so the mark reads as a new shape arriving
rather than as the dot opening. And it loses its **shape**: the thing the spokes make is
round, and the thing they were arranged on was a ring. Filled and round, none of that is
dropped — the loader closes into a dot and the dot grows into the mark, one object the
whole way through.

So version 9 is what the transition wants the state to be, and the chosen version is what
the design says it is. Both are in the build because that disagreement is worth showing
rather than settling quietly. If the design's mark is fixed, the chosen version is already
faithful to it and nothing needs to change; if it is not, version 9 is the argument for
moving it.

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
message, and from version 8 on the field holds the height of its tallest state — so the
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
