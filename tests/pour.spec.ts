import { expect, test } from "@playwright/test";
import { Field, VERDICT } from "./field";

/**
 * Version 18, the liquid pour: pressing the send box pours it into the loader, and the
 * loader closes into the answer — a tick, or a red "!" with the verdict in the row.
 */
test.describe("liquid pour", () => {
  const label = (f: Field) => f.root.locator(".pk-status-text:not([data-leaving])");

  test("pressing the box pours it, and the landed loader holds for the whole wait", async ({ page }) => {
    const f = await Field.open(page, "?v=18");
    await f.type(Field.GOOD);
    await expect(f.sendBox).toBeVisible();
    await f.sendBox.click();
    await expect(f.root).toHaveAttribute("data-pour", "flight");
    await expect(f.root).toHaveAttribute("data-pour", "land");
    await page.waitForTimeout(1000);                   // mid-wait: still landed, not restarted
    await expect(f.root).toHaveAttribute("data-pour", "land");
    await expect.poll(() => f.state(), VERDICT).toBe("success");
    await expect(f.root).not.toHaveAttribute("data-pour");
    await expect(label(f)).toHaveText("Authenticated", VERDICT);
  });

  test("a refused code closes into the \"!\" with the verdict in the row", async ({ page }) => {
    const f = await Field.open(page, "?v=18");
    await f.type(Field.WRONG);
    await f.sendBox.click();
    await expect.poll(() => f.state(), VERDICT).toBe("error");
    await expect(f.root).toHaveAttribute("data-fail", "mark");
    await expect(label(f)).toHaveText("Incorrect code");
    await expect(f.problem).toHaveCount(0);            // no sentence under the strip
    await expect(f.sendBox).toHaveCount(0);            // and the box does not come back
    expect(await f.focusedCell()).toBe(3);
  });

  test("a gap and a failed check each name themselves", async ({ page }) => {
    const f = await Field.open(page, "?v=18");
    await f.type("12");
    await f.press("Enter");
    await expect(f.root).toHaveAttribute("data-fail", "mark");
    await expect(label(f)).toHaveText("Missing digits");

    await page.goto("/?v=18");
    const g = new Field(page);
    await expect(g.cells.first()).toBeFocused();
    await g.type(Field.OFFLINE);
    await g.press("Enter");
    await expect(label(g)).toHaveText("Not verified", VERDICT);
  });

  test("the filled-circle version pours into a green disc that takes the tick", async ({ page }) => {
    const f = await Field.open(page, "?v=14");
    await f.type(Field.GOOD);
    await f.sendBox.click();
    await expect(f.root).toHaveAttribute("data-pour", "land");
    const disc = page.locator(".pk-disc");
    await expect.poll(() => disc.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
    await expect.poll(() => f.state(), VERDICT).toBe("success");
    await expect(disc).toBeVisible();
  });
});
