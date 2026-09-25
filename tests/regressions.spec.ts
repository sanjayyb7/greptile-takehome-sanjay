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
  test("a sent code hands focus back to the strip and takes the send box away", async ({ page }) => {
    // The link that had focus is replaced by "Code resent", which left focus on the body —
    // a complete code with an arrow offering to send the code that had just been
    // superseded, and no cell selected.
    const f = await Field.open(page);
    await f.type(Field.GOOD);
    await expect(f.sendBox).toBeVisible();
    await f.resendLink.click();
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
    await expect(f.problem).toHaveText("Incorrect code", VERDICT);
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
    await expect(f.problem).toHaveText("Not verified", VERDICT);
    await f.press("Enter");
    await expect.poll(() => f.state()).toBe("verifying");
    await expect(f.problem).toHaveCount(0);                  // nothing left over underneath
    await expect(f.problem).toHaveText("Not verified", VERDICT);
  });

  test("Backspace after a rejection clears in place, then steps back", async ({ page }) => {
    // A refusal used to put deletion into a second mode where every press stepped back,
    // on the reasoning that a refused code is being cleared rather than corrected. It has
    // not behaved that way since the three entry points were consolidated, and this is
    // what it does: the same two rules as anywhere else, refused or not.
    const f = await Field.open(page);
    await f.type(Field.WRONG);
    await f.press("Enter");
    await expect(f.problem).toHaveText("Incorrect code", VERDICT);
    expect(await f.focusedCell()).toBe(3);        // the rejection hands the caret back

    await f.press("Backspace");                   // a filled cell: cleared, caret stays
    expect(await f.code()).toBe("999_");
    expect(await f.focusedCell()).toBe(3);

    await f.press("Backspace");                   // now empty: step back and clear that
    expect(await f.code()).toBe("99__");
    expect(await f.focusedCell()).toBe(2);
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
    const f = await Field.open(page, "?v=8&len=6");
    await expect(f.cells).toHaveCount(6);
    const fits = await page.evaluate(() => {
      const field = document.querySelector(".passkey")!.getBoundingClientRect();
      const strip = document.querySelector(".pk-strip")!.getBoundingClientRect();
      return { fieldWidth: Math.round(field.width), stripWidth: Math.round(strip.width) };
    });
    expect(fits.stripWidth).toBe(fits.fieldWidth);
    await f.type("123");
    await f.press("Enter");
    await expect(f.problem).toHaveText("Missing digits");
  });


  test("the strip sits at the same height in every version", async ({ page }) => {
    // the versions are not all the same height, and the harness centred each at its own —
    // so changing version moved the one thing the switcher exists to compare
    const tops: number[] = [];
    for (const v of [11, 13, 12, 1, 2, 4, 5, 8, 14, 17, 15]) {
      await page.goto(`/?v=${v}`);
      await page.waitForSelector(".pk-strip");
      tops.push(await page.evaluate(() =>
        Math.round(document.querySelector(".pk-strip")!.getBoundingClientRect().top)));
    }
    expect(new Set(tops).size, `strip tops: ${tops.join(", ")}`).toBe(1);
  });
});
