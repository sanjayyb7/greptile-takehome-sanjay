import { expect, test } from "@playwright/test";
import { Field, VERDICT } from "./field";

/**
 * One test per bug that actually happened.
 *
 * Every one of these shipped and was found by hand. They are the tests worth having:
 * each names a mistake that was easy to make, survived review, and would have been caught
 * here in under a second.
 */
test.describe("regressions", () => {
  test("the confirmation reopens after being cancelled mid-flight", async ({ page }) => {
    // It used to die here. Asked to open while the exit was still playing, the dialog was
    // already `open` so the open branch declined — and the exit's own close landed after.
    // The element ended shut while React still held `asking`, and since nothing changed
    // state again, the link was dead for the rest of the session.
    const f = await Field.open(page);
    await f.resendLink.click();
    await expect.poll(() => f.dialogOpen()).toBe(true);
    await f.dialogCancel.click();
    await page.waitForTimeout(120);            // mid-exit, deliberately
    // dispatched, not clicked. A normal click waits for the link to be actionable, which
    // means it waits for the modal above it to go — and waiting is the one thing that
    // makes this bug impossible. The race is the test.
    await f.resendLink.dispatchEvent("click");
    await expect.poll(() => f.dialogOpen()).toBe(true);
    // and the field is healthy afterwards rather than merely alive: it closes again, the
    // cells take a digit, and the control opens a third time
    await f.dialogCancel.click();
    await expect.poll(() => f.dialogOpen()).toBe(false);
    await f.cells.nth(1).click();
    await f.type("7");
    expect(await f.code()).toBe("_7__");
    await f.resendLink.click();
    await expect.poll(() => f.dialogOpen()).toBe(true);
  });

  test("the confirmation lands on the strip every time it opens", async ({ page }) => {
    // It was placed with getBoundingClientRect, which is measured AFTER transforms — and
    // the exit fills forwards at scale 0.16. So from the second open on, a 400px dialog
    // measured 64px and every offset was computed from that.
    const f = await Field.open(page);
    for (let round = 0; round < 3; round++) {
      await f.resendLink.click();
      await expect.poll(() => f.dialogOpen()).toBe(true);
      await page.waitForTimeout(500);                      // let it settle
      const centres = await page.evaluate(() => {
        const mid = (el: Element) => {
          const r = el.getBoundingClientRect();
          return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
        };
        return { dialog: mid(document.querySelector(".pk-dialog")!),
                 strip: mid(document.querySelector(".pk-strip")!) };
      });
      expect(centres.dialog, `open #${round + 1}`).toEqual(centres.strip);
      await f.dialogCancel.click();
      await expect.poll(() => f.dialogOpen()).toBe(false);
    }
  });

  test("a sent code hands focus back to the strip and takes the send box away", async ({ page }) => {
    // The line used to return early per state and render the dialog only in the last of
    // them, so a successful send tore an open <dialog> out of the DOM: no exit, no close,
    // and focus left on the body — a complete code with an arrow offering to send the
    // code that had just been superseded, and no cell selected.
    const f = await Field.open(page);
    await f.type(Field.GOOD);
    await expect(f.sendBox).toBeVisible();
    await f.resendLink.click();
    await f.dialogConfirm.click();
    await expect(f.resendLine).toHaveText("Code resent", VERDICT);
    await expect(f.sendBox).toHaveCount(0);            // the old code is not on offer
    expect(await f.focusedCell()).toBe(3);             // and the caret is where typing goes
    expect(await f.code()).toBe(Field.GOOD);           // digits untouched
    await f.press("Backspace");                        // editing makes the code theirs again
    await f.type("4");
    await expect(f.sendBox).toBeVisible();
  });

  test("Enter still submits with no send box on screen", async ({ page }) => {
    const f = await Field.open(page);
    await f.type(Field.GOOD);
    await f.resendLink.click();
    await f.dialogConfirm.click();
    await expect(f.sendBox).toHaveCount(0, VERDICT);
    await f.press("Enter");                            // the rule does not need the button
    await expect.poll(() => f.state(), VERDICT).toBe("success");
  });

  test("pasting over a refused code clears the refusal", async ({ page }) => {
    // Typing, deleting and pasting each cleared the last attempt's feedback separately,
    // and paste cleared none of it. The digits changed while "Incorrect code" stayed on
    // screen and the send box stayed hidden, because the field still believed it was
    // holding a code that had been refused — Enter was the only way forward.
    const f = await Field.open(page);
    await f.type(Field.WRONG);
    await f.press("Enter");
    await expect(f.problem).toHaveText("Incorrect code. Try again.", VERDICT);
    await expect(f.sendBox).toHaveCount(0);        // withheld, because the code was refused
    await f.paste(Field.GOOD);
    await expect.poll(() => f.code()).toBe(Field.GOOD);
    await expect(f.problem).toHaveCount(0);        // the message was about the old code
    await expect(f.sendBox).toBeVisible();         // and so was the withheld button
    expect(await f.state()).toBe("idle");
    await f.sendBox.click();                       // and it actually sends
    await expect.poll(() => f.state(), VERDICT).toBe("success");
  });

  test("clicking a cell while the send box is up selects it", async ({ page }) => {
    // Filling the last cell parks the caret — the code is done and the arrow is the next
    // thing — so the ring and the caret stand down. That was keyed off the box being up
    // at all, which made it true for as long as the box was there: clicking a cell moved
    // the caret to it and showed nothing.
    const f = await Field.open(page);
    await f.type(Field.GOOD);
    await expect(f.sendBox).toBeVisible();
    await f.cells.nth(1).click();
    expect(await f.focusedCell()).toBe(1);
    await expect(f.sendBox).toBeVisible();                   // the box has not gone
    // polled, not read once: border-color is transitioned, so a single read lands
    // mid-fade and sees the grey it is leaving
    await expect
      .poll(() => f.cells.nth(1).evaluate((el) => getComputedStyle(el).borderColor))
      .toContain("16, 122, 77");                             // the cell says it is chosen
  });

  test("a new attempt clears the last one's message", async ({ page }) => {
    // Submit 0000, wait for the connection failure, press Enter again: "Verifying…" went
    // up while "Couldn't verify your code" stayed underneath — two verdicts on screen at
    // once, about the same digits, one of them about an attempt that was over.
    const f = await Field.open(page);
    await f.type(Field.OFFLINE);
    await f.press("Enter");
    await expect(f.problem).toHaveText("Couldn't verify your code. Try again.", VERDICT);
    await f.press("Enter");
    await expect.poll(() => f.state()).toBe("verifying");
    await expect(f.problem).toHaveCount(0);                  // nothing left over underneath
    await expect(f.problem).toHaveText("Couldn't verify your code. Try again.", VERDICT);
  });

  test("the field writes nothing to the document", async ({ page }) => {
    // the tokens lived on :root, so dropping the field into an app put --ease-out and
    // --pk-focus into the document's scope for anything else to collide with
    const f = await Field.open(page);
    const leaked = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return ["--pk-focus", "--pk-face", "--pk-ink", "--ease-out", "--ease-glide"]
        .filter((name) => root.getPropertyValue(name).trim() !== "");
    });
    expect(leaked).toEqual([]);
    // and every id it does write is generated, never spelled out
    const dupes = await page.evaluate(() => {
      const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
      return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    });
    expect(dupes).toEqual([]);
    await expect(f.root).toBeVisible();
  });

  test("the length prop builds that many cells, and the strip fits", async ({ page }) => {
    // `length` reached the state machine but the cells were handed a constant, so a
    // six-digit field ran a six-digit machine behind four boxes — and the field's width
    // was a flat 336px, which is four cells written out as a total
    const f = await Field.open(page, "?len=6");
    await expect(f.cells).toHaveCount(6);
    const fits = await page.evaluate(() => {
      const field = document.querySelector(".passkey")!.getBoundingClientRect();
      const strip = document.querySelector(".pk-strip")!.getBoundingClientRect();
      return { fieldWidth: Math.round(field.width), stripWidth: Math.round(strip.width) };
    });
    expect(fits.stripWidth).toBe(fits.fieldWidth);
    await f.type("123");
    await f.press("Enter");
    await expect(f.problem).toHaveText("Enter all 6 digits.");   // the copy counts too
  });

});
