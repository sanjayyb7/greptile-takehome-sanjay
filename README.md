# Passcode Flow

A 4-digit passcode entry, built from the supplied design in React 19 + Vite + TypeScript,
with no animation library.

<!-- Demo video goes here -->

**Live explorations:** https://passcode-explorations.vercel.app

## Process

The static states match the design exactly. Everything between them (motion, feedback,
failure, edge cases) was open, so each idea was built as its own version and compared on a
switcher. The **`explorations`** branch has all of them; **`main`** is only the chosen one
(dot 7), and the two are identical pixel for pixel.

It wasn't clear how far the design could move, so the chosen version stays inside the
frames. **Dot 8** goes one step further: a "Check your email" heading with the address the
code went to. Saying where the code was sent felt right, so it's shown as an exploration.

## The animation: a continuity transition

The brief asks for Enter to submit, not auto-submit, so there needs to be a moment where
the code is complete but not sent. Nothing appears on its own: each element grows out of
the one before it.

1. The caret is a block that crosses each cell and writes the digit as it passes.
2. On the fourth digit it reaches the strip's edge and pushes the send box out, through a
   bridge that holds the block's height, then lets go.
3. The arrow travels into the box. Press it, or Enter, to submit. Backspace reverses it.
4. The spinner closes into a tick on success, or a red "!" on a wrong code, with the
   message and shake landing on the same frame.

| Dot | Version | What it tried |
| --- | --- | --- |
| 1 | [Vanishing letters](https://passcode-explorations.vercel.app/?v=13) | Digits rise through the cell's bottom edge |
| 2 | [Caret smear](https://passcode-explorations.vercel.app/?v=12) | The caret stretches as it travels |
| 3 | [Version 1](https://passcode-explorations.vercel.app/?v=1) | Send box on the end of the strip |
| 4 | [Version 2](https://passcode-explorations.vercel.app/?v=2) | Send box in its own container |
| 5 | [Version 4](https://passcode-explorations.vercel.app/?v=4) | Box attached, then shoved clear |
| 6 | [Fluid](https://passcode-explorations.vercel.app/?v=5) | Box separates like liquid |
| 7 | [**Chosen**](https://passcode-explorations.vercel.app/?v=8) | The block pushes the box out; every case answered |
| 8 | [Check your email](https://passcode-explorations.vercel.app/?v=14) | Dot 7 plus where the code went, a filled mark, no shadow |

## Run it

```bash
npm install
npm run dev      # opens at http://localhost:5173
```

## How to use

- **`1234`**: the correct passcode, shows success
- **Any other 4 digits**: shows "Incorrect code"
- **`0000`**: shows "Not verified" (simulates a failed connection)
- **Fewer than 4 digits, then Enter**: shows "Missing digits"
