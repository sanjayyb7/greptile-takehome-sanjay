import { expect, test, type Page } from "@playwright/test";
import { Field } from "./field";

/** what src/harness.tsx puts on the page — declared again here, the tests being their
 *  own TypeScript project */
declare global {
  interface Window {
    harness: {
      resolve(n: number, ok: boolean): void;
      asked(): number;
      success: string[];
      complete: string[];
      reset(): void;
      unmount(): void;
    };
  }
}

/**
 * What happens around a verification rather than inside the field: a reset or an unmount
 * while a check is still out, the moment it is safe to navigate, the send box being
 * turned round, and the keyboard during the wait.
 *
 * The first cases run on harness.html, where every check waits to be answered by the test
 * and every callback is written down — see src/harness.tsx.
 */

const code = (page: Page) => page.locator("input").evaluateAll((els) =>
  els.map((el) => (el as HTMLInputElement).value || "_").join(""));
const status = (page: Page) => page.locator(".hook").getAttribute("data-status");
const asked = (page: Page) => page.evaluate(() => window.harness.asked());

async function openHook(page: Page) {
  await page.goto("/harness.html");
  await page.locator("input").first().click();
}

test.describe("an answer that arrives too late changes nothing", () => {
  test("reset during verification, then the old check says yes", async ({ page }) => {
    await openHook(page);
    await page.keyboard.type("1234");
    await page.keyboard.press("Enter");
    await expect.poll(() => status(page)).toBe("verifying");
    await page.evaluate(() => window.harness.reset());
    expect(await code(page)).toBe("____");
    expect(await status(page)).toBe("idle");
    await page.evaluate(() => window.harness.resolve(0, true));
    await page.waitForTimeout(200);
    expect(await status(page)).toBe("idle");                   // still empty and idle
    expect(await code(page)).toBe("____");
    expect(await page.evaluate(() => window.harness.success)).toEqual([]);   // never announced
  });

  test("reset clears the last attempt's feedback too", async ({ page }) => {
    await openHook(page);
    await page.keyboard.type("9999");
    await page.keyboard.press("Enter");
    await page.evaluate(() => window.harness.resolve(0, false));
    await expect.poll(() => page.locator(".hook").getAttribute("data-problem")).toBe("incorrect");
    await page.evaluate(() => window.harness.reset());
    await expect(page.locator(".hook")).toHaveAttribute("data-problem", "");
    expect(await status(page)).toBe("idle");
  });

  test("a newer attempt supersedes an older one still out", async ({ page }) => {
    await openHook(page);
    await page.keyboard.type("1234");
    await page.keyboard.press("Enter");                         // check 0
    await page.evaluate(() => window.harness.reset());
    await page.keyboard.type("9999");
    await page.keyboard.press("Enter");                         // check 1
    expect(await asked(page)).toBe(2);
    await page.evaluate(() => window.harness.resolve(1, false));
    await expect.poll(() => status(page)).toBe("error");
    await page.evaluate(() => window.harness.resolve(0, true));  // the old one, late
    await page.waitForTimeout(200);
    expect(await status(page)).toBe("error");                   // the newer verdict stands
    expect(await page.evaluate(() => window.harness.success)).toEqual([]);
  });

  test("an answer after unmounting is dropped", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto("/harness.html?field");
    await expect(page.locator(".passkey input").first()).toBeFocused();
    await page.keyboard.type("1234");
    await page.keyboard.press("Enter");
    await page.evaluate(() => window.harness.unmount());
    await expect(page.locator(".passkey")).toHaveCount(0);      // really gone — React unmounts async
    await page.evaluate(() => window.harness.resolve(0, true));
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.harness.success)).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe("navigating after success", () => {
  test("onSuccessAnimationComplete fires once, after the row has moved down", async ({ page }) => {
    await page.goto("/harness.html?field");
    await expect(page.locator(".passkey input").first()).toBeFocused();
    await page.evaluate(() => {
      const w = window as unknown as { landed: number; told: number };
      w.landed = 0; w.told = 0;
      // when the downward move actually ends, and when the callback is heard
      document.querySelector(".pk-status")!.addEventListener("transitionend", (e) => {
        if ((e as TransitionEvent).propertyName === "translate") w.landed = performance.now();
      });
      const push = window.harness.complete.push.bind(window.harness.complete);
      window.harness.complete.push = (...items: string[]) => { w.told = performance.now(); return push(...items); };
    });
    await page.keyboard.type("1234");
    await page.keyboard.press("Enter");
    await page.evaluate(() => window.harness.resolve(0, true));
    await expect.poll(() => page.evaluate(() => window.harness.success)).toEqual(["1234"]);
    expect(await page.evaluate(() => window.harness.complete)).toEqual([]);   // not yet
    await expect.poll(() => page.evaluate(() => window.harness.complete)).toEqual(["1234"]);
    const t = await page.evaluate(() => {
      const w = window as unknown as { landed: number; told: number };
      return { landed: w.landed, told: w.told };
    });
    expect(t.landed).toBeGreaterThan(0);
    expect(t.told).toBeGreaterThanOrEqual(t.landed);            // after the row arrived
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => window.harness.complete)).toEqual(["1234"]);   // once
  });

  test.describe("under reduced motion", () => {
    test.use({ reducedMotion: "reduce" });
    test("it fires as soon as the final state is shown", async ({ page }) => {
      await page.goto("/harness.html?field");
      await expect(page.locator(".passkey input").first()).toBeFocused();
      await page.keyboard.type("1234");
      await page.keyboard.press("Enter");
      await page.evaluate(() => window.harness.resolve(0, true));
      await expect(page.locator(".passkey")).toHaveAttribute("data-phase", "settled");
      await expect.poll(() => page.evaluate(() => window.harness.complete), { timeout: 300 })
        .toEqual(["1234"]);
    });
  });
});

test("the send box turns round from where it is when the last digit is retyped", async ({ page }) => {
  // It used to snap shut and open again from nothing: the reopening started from the
  // closed keyframe whatever the box was actually showing.
  const f = await Field.open(page);
  await f.type("1234");
  await expect(f.sendBox).toBeVisible();
  await page.waitForTimeout(700);                               // fully open
  await f.press("Backspace");
  // part-way through closing: squeezed, but nowhere near gone
  await page.waitForFunction(() => {
    const s = getComputedStyle(document.querySelector(".pk-send")!).scale;
    const sx = s === "none" ? 1 : parseFloat(s);
    return sx < 0.85 && sx > 0.3;
  }, undefined, { polling: "raf" });
  await page.evaluate(() => {
    const w = window as unknown as { frames: number[][] };
    w.frames = [];
    const box = document.querySelector(".pk-send") as HTMLElement;
    const read = () => {
      const s = getComputedStyle(box);
      const sx = s.scale === "none" ? 1 : parseFloat(s.scale);
      const tx = s.translate === "none" ? 0 : parseFloat(s.translate);
      w.frames.push([sx, tx]);
    };
    // the first reading is the box as the key goes down, then one a frame after that
    window.addEventListener("keydown", () => {
      read();
      const t0 = performance.now();
      const tick = () => { read(); if (performance.now() - t0 < 500) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }, { once: true, capture: true });
  });
  await f.press("4");
  await page.waitForTimeout(600);
  const frames = await page.evaluate(() => (window as unknown as { frames: number[][] }).frames);
  const [start, ...after] = frames;
  const scales = after.map(([sx]) => sx);
  const least = Math.min(...scales);
  // it may carry on closing for the frame it takes to be told, and no further: it used to
  // drop straight to nothing and open again from there
  expect(start[0]).toBeGreaterThan(0.2);
  expect(least).toBeGreaterThan(start[0] - 0.1);
  // and from its lowest point it only ever opens
  const from = scales.indexOf(least);
  for (let i = from + 1; i < scales.length; i++) expect(scales[i]).toBeGreaterThanOrEqual(scales[i - 1] - 0.001);
  expect(after[after.length - 1]).toEqual([1, 0]);             // arriving fully open
  expect(await f.code()).toBe("1234");
});

test("Tab and Shift+Tab work during verification, and nothing else does", async ({ page }) => {
  await page.goto("/harness.html?field");
  const cells = page.locator(".passkey input");
  await expect(cells.first()).toBeFocused();
  await page.keyboard.type("1234");
  await page.keyboard.press("Enter");
  await expect(page.locator(".passkey")).toHaveAttribute("data-state", "verifying");
  await cells.nth(3).focus();
  await page.keyboard.press("Tab");                             // out of the field
  expect(await cells.evaluateAll((els) => els.includes(document.activeElement as HTMLInputElement))).toBe(false);
  await page.keyboard.press("Shift+Tab");                       // and back into it
  await expect(cells.nth(3)).toBeFocused();
  await page.keyboard.press("7");                               // no edits
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Enter");                           // and no second submission
  expect(await cells.evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value).join(""))).toBe("1234");
  expect(await asked(page)).toBe(1);
});
