import { expect, test } from "@playwright/test";
import { Field, VERDICT } from "./field";

/** The ten cases, one test each, in the order they are written down. */
test.describe("the cases", () => {
  test("incomplete code: focus goes to the gap, and nothing is sent", async ({ page }) => {
    const f = await Field.open(page);
    await f.type("12");
    await f.press("Enter");
    await expect(f.problem).toHaveText("Missing digits");
    expect(await f.focusedCell()).toBe(2);
    // not an error: nothing was refused, because nothing was asked
    expect(await f.state()).toBe("idle");
    await expect(f.root).not.toHaveAttribute("data-state", "error");
  });

  test("incorrect code: says so, keeps the digits, clears on the next edit", async ({ page }) => {
    const f = await Field.open(page);
    await f.type(Field.WRONG);
    await f.press("Enter");
    await expect(f.problem).toHaveText("Incorrect code", VERDICT);
    expect(await f.code()).toBe(Field.WRONG);
    await f.press("Backspace");
    await expect(f.problem).toHaveCount(0);
  });

  test("a failed connection is not a wrong code", async ({ page }) => {
    const f = await Field.open(page);
    await f.type(Field.OFFLINE);
    await f.press("Enter");
    await expect(f.problem).toHaveText("Not verified", VERDICT);
    expect(await f.code()).toBe(Field.OFFLINE);   // kept, because they may well be right
    expect(await f.state()).toBe("idle");         // no verdict was reached, so no error
    await f.press("Enter");                       // and it can simply be tried again
    await expect.poll(() => f.state()).toBe("verifying");
  });

  test("repeated Enter while verifying runs one loading sequence", async ({ page }) => {
    const f = await Field.open(page);
    await f.type(Field.GOOD);
    // count every entry into `verifying`, not just the final state
    await page.evaluate(() => {
      (window as any).__runs = 0;
      new MutationObserver(() => {
        if (document.querySelector(".passkey")?.getAttribute("data-state") === "verifying")
          (window as any).__runs++;
      }).observe(document.querySelector(".passkey")!, { attributes: true, attributeFilter: ["data-state"] });
    });
    for (let i = 0; i < 5; i++) await f.press("Enter");
    await expect.poll(() => f.state(), VERDICT).toBe("success");
    expect(await page.evaluate(() => (window as any).__runs)).toBe(1);
  });

  test("resend opens a confirmation naming where the code goes", async ({ page }) => {
    const f = await Field.open(page);
    await f.resendLink.click();
    await expect(f.dialog).toBeVisible();
    await expect(f.dialog).toContainText("Send code to: you@example.com");
    await expect(f.dialogCancel).toBeVisible();
    await expect(f.dialogConfirm).toHaveText("Resend code");
    await expect(f.dialogConfirm).toBeFocused();
  });

  test("cancelling keeps the digits and returns focus to the link", async ({ page }) => {
    const f = await Field.open(page);
    await f.type("12");
    await f.resendLink.click();
    await f.dialogCancel.click();
    await expect.poll(() => f.dialogOpen()).toBe(false);
    expect(await f.code()).toBe("12__");
    await expect(f.resendLink).toBeFocused();
  });

  test("confirming disables both buttons and cannot be pressed twice", async ({ page }) => {
    const f = await Field.open(page);
    await f.resendLink.click();
    await f.dialogConfirm.click();
    await expect(f.dialogConfirm).toHaveText("Sending…");
    await expect(f.dialogConfirm).toBeDisabled();
    await expect(f.dialogCancel).toBeDisabled();
  });

  test("a sent code closes the dialog, says so, then counts down", async ({ page }) => {
    const f = await Field.open(page);
    await f.type("12");
    await f.resendLink.click();
    await f.dialogConfirm.click();
    await expect(f.resendLine).toHaveText("Code resent", VERDICT);
    await expect.poll(() => f.dialogOpen()).toBe(false);
    expect(await f.code()).toBe("12__");                       // digits survive
    await expect(f.resendLine).toContainText("Resend in 0:", { timeout: 5000 });
  });

  test("a failed send keeps the dialog open and allows a retry", async ({ page }) => {
    const f = await Field.open(page, "?resendfail");
    await f.resendLink.click();
    await f.dialogConfirm.click();
    await expect(f.dialogProblem).toHaveText("Couldn't send the code. Try again.", VERDICT);
    await expect.poll(() => f.dialogOpen()).toBe(true);        // still there to retry in
    await expect(f.dialogConfirm).toBeEnabled();
    await expect(f.dialogCancel).toBeEnabled();
    await expect(f.resendLine).toHaveText("Didn't get a code? Resend");  // nothing spent
    await f.dialogConfirm.click();                             // and the retry goes
    await expect(f.resendLine).toHaveText("Code resent", VERDICT);
  });

  test("the cooldown disables only the resend", async ({ page }) => {
    const f = await Field.open(page);
    await f.resendLink.click();
    await f.dialogConfirm.click();
    await expect(f.resendLine).toContainText("Resend in 0:", { timeout: 8000 });
    await expect(f.resendLink).toHaveCount(0);                 // no way to ask again
    await f.type(Field.GOOD);                                  // but entry is untouched
    expect(await f.code()).toBe(Field.GOOD);
    await f.press("Enter");                                    // and so is verification
    await expect.poll(() => f.state(), VERDICT).toBe("success");
  });
});
