import { expect, test } from "@playwright/test";
import { Field, VERDICT } from "./field";

/**
 * Version 14, the filled circle: the verdict is said in the status row, and a refusal
 * closes the loader into a red "!" the way a success closes it into the mark.
 */
test.describe("verdict in the row", () => {
  const label = (f: Field) => f.root.locator(".pk-status-text:not([data-leaving])");

  test("the send box does not pour: the loader simply appears", async ({ page }) => {
    const f = await Field.open(page, "?v=14");
    await f.type(Field.GOOD);
    await f.sendBox.click();
    await expect.poll(() => f.state()).toBe("verifying");
    await expect(f.root).not.toHaveAttribute("data-pour");
    await expect.poll(() => f.state(), VERDICT).toBe("success");
    await expect(label(f)).toHaveText("Authenticated", VERDICT);
  });

  test("a refused code closes into the \"!\" with the verdict in the row", async ({ page }) => {
    const f = await Field.open(page, "?v=14");
    await f.type(Field.WRONG);
    await f.sendBox.click();
    await expect.poll(() => f.state(), VERDICT).toBe("error");
    await expect(f.root).toHaveAttribute("data-fail", "mark");
    await expect(label(f)).toHaveText("Incorrect code");
    await expect(page.locator(".pk-problem")).toHaveCount(0);   // no sentence under the strip
    await expect(f.sendBox).toHaveCount(0);            // and the box does not come back
    expect(await f.focusedCell()).toBe(3);
  });

  test("a gap and a failed check each name themselves", async ({ page }) => {
    const f = await Field.open(page, "?v=14");
    await f.type("12");
    await f.press("Enter");
    await expect(f.root).toHaveAttribute("data-fail", "mark");
    await expect(label(f)).toHaveText("Missing digits");

    await page.goto("/?v=14");
    const g = new Field(page);
    await expect(g.cells.first()).toBeFocused();
    await g.type(Field.OFFLINE);
    await g.press("Enter");
    await expect(label(g)).toHaveText("Not verified", VERDICT);
  });
});
