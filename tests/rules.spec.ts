import { expect, test } from "@playwright/test";
import { Field, VERDICT } from "./field";

/**
 * The brief's rules, one test each.
 *
 * These are the lines that are not open to interpretation, so they are tested against the
 * chosen version: they have to hold for the thing being submitted.
 */
test.describe("the rules", () => {
  test("only digits are accepted", async ({ page }) => {
    const f = await Field.open(page, "");
    await page.keyboard.press("a");
    await page.keyboard.press("-");
    await page.keyboard.press("Shift");
    expect(await f.code()).toBe("____");
    await f.type("12");
    expect(await f.code()).toBe("12__");
  });

  test("a pasted code is filtered to its digits", async ({ page }) => {
    const f = await Field.open(page, "");
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData("text/plain", "12ab34");
      document.querySelector(".passkey input")!
        .dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await expect.poll(() => f.code()).toBe("1234");
  });

  test("a partial paste lands where the caret is", async ({ page }) => {
    // it used to be written from the first cell whatever was selected, and to clear
    // everything it did not cover — the caret was saying where to put them, and was
    // being ignored.
    // The caret is put on a filled cell here, not an empty one beyond the gap: an empty
    // cell with an empty cell before it is not somewhere the caret will go at all.
    const f = await Field.open(page, "");
    await f.type("1234");
    await f.cells.nth(1).click();
    await f.paste("99");
    expect(await f.code()).toBe("1994");
    expect(await f.focusedCell()).toBe(3);
  });

  test("a full-length paste replaces the whole code, wherever the caret is", async ({ page }) => {
    // the common case: a whole code off an SMS. Dropped at the caret it would lose its
    // last digits off the end, which is never what was meant.
    const f = await Field.open(page, "");
    await f.cells.nth(2).click();
    await f.paste("1234");
    expect(await f.code()).toBe("1234");
  });

  test("clicking an empty cell lands on the first gap, not where you clicked", async ({ page }) => {
    // clicking cell four of an empty code used to put the caret there, and the next
    // keystroke made a code with a hole in it — from a press that could only have meant
    // "let me start"
    const f = await Field.open(page);
    await f.cells.nth(3).click();
    expect(await f.focusedCell()).toBe(0);
    await f.type("12");
    await f.cells.nth(3).click();          // still ahead of the gap
    expect(await f.focusedCell()).toBe(2);
    await f.cells.nth(0).click();          // but a filled cell is a correction, so allowed
    expect(await f.focusedCell()).toBe(0);
    await f.type("9");
    expect(await f.code()).toBe("92__");
  });

  test("typing advances to the next cell", async ({ page }) => {
    const f = await Field.open(page, "");
    expect(await f.focusedCell()).toBe(0);
    await f.type("1");
    expect(await f.focusedCell()).toBe(1);
    await f.type("23");
    expect(await f.focusedCell()).toBe(3);
  });

  test("Backspace clears the current cell, then steps back", async ({ page }) => {
    const f = await Field.open(page, "");
    await f.type("123");
    await page.locator(".passkey input").nth(2).focus();
    await f.press("Backspace");                     // cell has a digit: clear it, stay
    expect(await f.code()).toBe("12__");
    expect(await f.focusedCell()).toBe(2);
    await f.press("Backspace");                     // cell is empty: step back and clear
    expect(await f.code()).toBe("1___");
    expect(await f.focusedCell()).toBe(1);
  });

  test("holding Backspace keeps clearing", async ({ page }) => {
    const f = await Field.open(page, "");
    await f.type(Field.GOOD);
    await page.keyboard.down("Backspace");
    await expect.poll(() => f.code(), { timeout: 4000 }).toBe("____");
    await page.keyboard.up("Backspace");
  });

  test("Enter submits, and the verdict takes a couple of seconds", async ({ page }) => {
    const f = await Field.open(page, "");
    await f.type(Field.GOOD);
    const started = Date.now();
    await f.press("Enter");
    await expect.poll(() => f.state()).toBe("verifying");
    await expect.poll(() => f.state(), VERDICT).toBe("success");
    // "a couple of seconds" — long enough to be a wait, not so long it reads as a hang
    expect(Date.now() - started).toBeGreaterThan(1500);
    expect(Date.now() - started).toBeLessThan(4000);
  });

  test("the passcode is 1234, and anything else is refused", async ({ page }) => {
    const f = await Field.open(page, "");
    await f.type(Field.WRONG);
    await f.press("Enter");
    await expect.poll(() => f.state(), VERDICT).toBe("error");
    expect(await f.code()).toBe(Field.WRONG);      // the digits are kept, not wiped
  });
});
