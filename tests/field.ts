import { expect, type Locator, type Page } from "@playwright/test";

/**
 * The field, as the tests talk about it.
 *
 * Every test reads as the thing a person does — type, press Enter, ask for a new code —
 * rather than as selectors and waits, so a failing test names the behaviour that broke
 * and not the query that missed.
 */
export class Field {
  readonly root: Locator;
  readonly cells: Locator;
  readonly problem: Locator;
  readonly resendLine: Locator;
  readonly resendLink: Locator;
  readonly sendBox: Locator;
  readonly dialog: Locator;
  readonly dialogConfirm: Locator;
  readonly dialogCancel: Locator;
  readonly dialogProblem: Locator;

  constructor(private page: Page) {
    this.root = page.locator(".passkey");
    this.cells = page.locator(".passkey input");
    // the verdict the status row says once a refusal's "!" has landed — and nothing while
    // the loader is still closing, or when there is no refusal at all
    this.problem = page.locator('.passkey[data-fail="mark"] .pk-status-text:not([data-leaving])');
    this.resendLine = page.locator(".pk-resend");
    this.resendLink = page.locator(".pk-resend button");
    this.sendBox = page.locator(".pk-send");
    this.dialog = page.locator(".pk-dialog");
    this.dialogConfirm = page.locator(".pk-dialog-confirm");
    this.dialogCancel = page.locator(".pk-dialog-cancel");
    this.dialogProblem = page.locator(".pk-dialog-problem");
  }

  static async open(page: Page, query = "") {
    await page.goto(`/${query}`);
    const field = new Field(page);
    await expect(field.cells.first()).toBeFocused();
    return field;
  }

  /** typed, not set: the field listens on keydown, so a value written straight into the
   *  input would skip everything this is meant to be testing */
  async type(code: string) {
    for (const digit of code) await this.page.keyboard.press(digit);
  }

  async press(key: string) { await this.page.keyboard.press(key); }

  /** a real paste event, which is a different entry point from typing and has its own bugs */
  async paste(text: string) {
    await this.page.evaluate((value) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", value);
      (document.activeElement ?? document.querySelector(".passkey input")!)
        .dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }, text);
  }

  /** what the cells hold, with an underscore for empty, so a whole code is one assertion */
  async code() {
    return (await this.cells.evaluateAll((els) =>
      els.map((el) => (el as HTMLInputElement).value || "_").join("")));
  }

  /** which cell has the caret, or -1 */
  async focusedCell() {
    return this.cells.evaluateAll((els) => els.indexOf(document.activeElement as HTMLInputElement));
  }

  async state() { return (await this.root.getAttribute("data-state")) ?? "idle"; }

  /** whether the dialog is really modal, which is the thing that traps focus */
  async dialogOpen() {
    return this.dialog.evaluate((el) => (el as HTMLDialogElement).open).catch(() => false);
  }

  /** a code the stand-in accepts, one it refuses, and one that makes it fall over */
  static readonly GOOD = "1234";
  static readonly WRONG = "9999";
  static readonly OFFLINE = "0000";
}

/** the stand-in answers after 2s; give it room without making every test wait it out */
export const VERDICT = { timeout: 6000 };
