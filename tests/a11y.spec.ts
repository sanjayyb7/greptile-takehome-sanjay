import { expect, test, type Page } from "@playwright/test";
import { Field, VERDICT } from "./field";

/**
 * Reliability and accessibility: keyboard focus order, the ways a code arrives other than
 * typing, narrow screens, and reduced motion. Each of these was broken before its test.
 */

/** what has keyboard focus, named the way a person would describe it */
const focusedName = (page: Page) => page.evaluate(() => {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body) return "body";
  return el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.tagName;
});

test.describe("focus order", () => {
  test("Tab goes into the field once and out again, both ways", async ({ page }) => {
    // Tabbing from the first empty cell landed on the second, which is not somewhere to
    // type yet — so focus was steered straight back. Tab could never leave the field.
    const f = await Field.open(page);
    await f.press("Tab");
    expect(await focusedName(page)).toBe("Resend");            // out, not stuck in cell 1
    await f.press("Shift+Tab");
    expect(await focusedName(page)).toBe("Digit 1 of 4");      // back in, at the first gap
    await f.press("Shift+Tab");
    expect(await focusedName(page)).toBe("body");               // and out the other side
  });

  test("with part of a code, Tab still passes through in one stop", async ({ page }) => {
    const f = await Field.open(page);
    await f.type("12");
    expect(await f.focusedCell()).toBe(2);
    await f.press("Tab");
    expect(await focusedName(page)).toBe("Resend");
    await f.press("Shift+Tab");
    expect(await f.focusedCell()).toBe(2);                      // where typing goes next
  });

  test("a complete code offers the send box next, then the resend link", async ({ page }) => {
    const f = await Field.open(page);
    await f.type(Field.GOOD);
    await expect(f.sendBox).toBeVisible();
    await f.press("Tab");
    expect(await focusedName(page)).toBe("Send passcode");
    await f.press("Tab");
    expect(await focusedName(page)).toBe("Resend");
  });

  test("once authenticated, the hidden cells are out of the focus order and the tree", async ({ page }) => {
    const f = await Field.open(page);
    await f.type(Field.GOOD);
    await f.press("Enter");
    await expect.poll(() => f.state(), VERDICT).toBe("success");
    // inert: not focusable, not clickable, not in the accessibility tree
    await expect(page.locator(".pk-strip")).toHaveAttribute("inert", "");
    await page.locator("body").focus();
    await f.press("Tab");
    expect(await f.focusedCell()).toBe(-1);
    const snapshot = await page.locator(".passkey").ariaSnapshot();
    expect(snapshot).not.toContain("Digit");
  });
});

test.describe("ways a code arrives", () => {
  test("autofill of the whole code into one cell fills every cell", async ({ page }) => {
    // One-time-code autofill writes the whole code into the focused input in one go.
    // maxLength=1 cut it to a single character, and the rest were dropped.
    const f = await Field.open(page);
    await f.cells.first().evaluate((el: HTMLInputElement) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(el, "1234");
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText" }));
    });
    await expect.poll(() => f.code()).toBe("1234");
    await expect(f.sendBox).toBeVisible();
  });

  test("a paste keeps only its digits, and a paste with none changes nothing", async ({ page }) => {
    const f = await Field.open(page);
    await f.paste(" 12-3 4 ");
    await expect.poll(() => f.code()).toBe("1234");
    await f.press("Backspace");
    await f.press("Backspace");
    await f.paste("abc");
    expect(await f.code()).toBe("12__");
    // nothing but digits ever reaches a cell, even for a frame
    expect(await f.cells.evaluateAll((els) => els.every((el) => /^\d?$/.test((el as HTMLInputElement).value)))).toBe(true);
  });

  test("a mobile keyboard's delete clears the cell, then steps back", async ({ page }) => {
    // Android keyboards send Backspace as an "Unidentified" key, so the delete arrives as
    // an input event with nothing in it — and an empty write was ignored outright.
    const f = await Field.open(page);
    await f.type("123");
    await f.cells.nth(2).click();                               // on the 3
    const del = (i: number) => f.cells.nth(i).evaluate((el) => {
      const e = new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "deleteContentBackward" });
      if (el.dispatchEvent(e)) {                                // not handled: the browser deletes
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
        set.call(el, "");
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
      }
    });
    await del(2);
    expect(await f.code()).toBe("12__");
    expect(await f.focusedCell()).toBe(2);                      // stays, like Backspace
    await del(2);                                                // empty: steps back and clears
    expect(await f.code()).toBe("1___");
    expect(await f.focusedCell()).toBe(1);
  });

  test("any edit dismisses the last refusal, and the digits are kept", async ({ page }) => {
    for (const edit of ["type", "delete", "paste"] as const) {
      const f = await Field.open(page);
      await f.type(Field.WRONG);
      await f.press("Enter");
      await expect(f.problem).toHaveText("Incorrect code", VERDICT);
      expect(await f.code()).toBe(Field.WRONG);                 // kept after the error
      if (edit === "type") { await f.cells.nth(1).click(); await f.type("1"); }
      if (edit === "delete") await f.press("Backspace");
      if (edit === "paste") await f.paste("12");
      await expect(f.problem, edit).toHaveCount(0);
      expect(await f.state(), edit).toBe("idle");
    }
  });
});

test.describe("narrow screens", () => {
  for (const width of [320, 375]) {
    test(`at ${width}px everything fits and still works`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      const f = await Field.open(page);
      await f.type(Field.GOOD);
      await expect(f.sendBox).toBeVisible();
      await page.waitForTimeout(600);                           // the box has finished opening
      const fits = await page.evaluate(() => {
        const inView = (el: Element | null) => {
          if (!el) return false;
          const r = el.getBoundingClientRect();
          return r.left >= 0 && r.right <= innerWidth;
        };
        return {
          scrolls: document.documentElement.scrollWidth > innerWidth,
          strip: inView(document.querySelector(".pk-strip")),
          send: inView(document.querySelector(".pk-send")),
          resend: inView(document.querySelector(".pk-resend button")),
        };
      });
      expect(fits).toEqual({ scrolls: false, strip: true, send: true, resend: true });
      await f.sendBox.click();                                  // and it is usable, not just seen
      await expect.poll(() => f.state(), VERDICT).toBe("success");
    });
  }

  test("the desktop design is untouched", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const f = await Field.open(page);
    const box = await f.cells.first().evaluate((el) => {
      const r = el.getBoundingClientRect(); return [r.width, r.height];
    });
    expect(box).toEqual([84, 128]);
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("nothing moves through a whole attempt: wrong, corrected, sent, authenticated", async ({ page }) => {
    const f = await Field.open(page);
    // every animation or transition that runs, sampled each frame; anything that moves
    // something — a translate, a scale, a rotation — is a failure. Opacity is allowed:
    // a fade is how reduced motion says a state changed.
    await page.evaluate(() => {
      const w = window as unknown as { moved: string[] };
      w.moved = [];
      const moving = /translate|transform|scale|rotate/;
      const tick = () => {
        for (const a of document.getAnimations()) {
          if (a.playState !== "running") continue;
          const effect = a.effect as KeyframeEffect | null;
          const target = effect?.target as Element | null;
          // a keyframed property only counts if its value changes: holding a transform
          // still while the opacity pulses is not motion
          const frames = effect?.getKeyframes() ?? [];
          const changes = (p: string) => new Set(frames.map((k) => String(k[p] ?? ""))).size > 1;
          const props = a instanceof CSSTransition ? [a.transitionProperty]
            : [...new Set(frames.flatMap((k) => Object.keys(k)))].filter(changes);
          const hit = props.filter((p) => moving.test(p));
          if (!hit.length || !target) continue;
          const d = Number(effect?.getTiming().duration ?? 0);
          if (!(d > 0)) continue;
          const name = (a as CSSAnimation).animationName ?? (a instanceof CSSTransition ? "transition" : "waapi");
          const label = `${target.getAttribute("class") ?? target.tagName} ${name} ${hit.join(",")}`;
          if (!w.moved.includes(label)) w.moved.push(label);
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await f.type(Field.WRONG);
    await f.press("Enter");
    await expect(f.problem).toHaveText("Incorrect code", VERDICT);
    await f.press("Backspace");
    await f.press("Backspace");
    await f.type("34");                                          // 9934 — still wrong, still fine
    await f.cells.first().click();
    await f.paste(Field.GOOD);
    await expect(f.sendBox).toBeVisible();
    await f.sendBox.click();
    await expect.poll(() => f.state(), VERDICT).toBe("success");
    await page.waitForTimeout(1500);                             // the whole success sequence
    const moved = await page.evaluate(() => (window as unknown as { moved: string[] }).moved);
    expect(moved).toEqual([]);
  });
});
