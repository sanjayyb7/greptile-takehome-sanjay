import { expect, test } from "@playwright/test";
import { Field, VERDICT } from "./field";

/** The brief's rules, one test each — the lines that are not open to interpretation. */
test.describe("the rules", () => {
  test("only digits are accepted", async ({ page }) => {
    const f = await Field.open(page);
    await page.keyboard.press("a");
    await page.keyboard.press("-");
    await page.keyboard.press("Shift");
    expect(await f.code()).toBe("____");
    await f.type("12");
    expect(await f.code()).toBe("12__");
  });

  test("a pasted code is filtered to its digits", async ({ page }) => {
    const f = await Field.open(page);
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
    // being ignored
    const f = await Field.open(page);
    await f.cells.nth(1).click();
    await f.paste("567");
    expect(await f.code()).toBe("_567");
    expect(await f.focusedCell()).toBe(3);
  });

  test("a full-length paste replaces the whole code, wherever the caret is", async ({ page }) => {
    // the common case: a whole code off an SMS. Dropped at the caret it would lose its
    // last digits off the end, which is never what was meant.
    const f = await Field.open(page);
    await f.cells.nth(2).click();
    await f.paste("1234");
    expect(await f.code()).toBe("1234");
  });

  test("typing advances to the next cell", async ({ page }) => {
    const f = await Field.open(page);
    expect(await f.focusedCell()).toBe(0);
    await f.type("1");
    expect(await f.focusedCell()).toBe(1);
    await f.type("23");
    expect(await f.focusedCell()).toBe(3);
  });

  test("Backspace clears the current cell, then steps back", async ({ page }) => {
    const f = await Field.open(page);
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
    const f = await Field.open(page);
    await f.type(Field.GOOD);
    await page.keyboard.down("Backspace");
    await expect.poll(() => f.code(), { timeout: 4000 }).toBe("____");
    await page.keyboard.up("Backspace");
  });

  test("Enter submits, and the verdict takes a couple of seconds", async ({ page }) => {
    const f = await Field.open(page);
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
    const f = await Field.open(page);
    await f.type(Field.WRONG);
    await f.press("Enter");
    await expect.poll(() => f.state(), VERDICT).toBe("error");
    expect(await f.code()).toBe(Field.WRONG);      // the digits are kept, not wiped
  });
});
