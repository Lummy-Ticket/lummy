import { readFileSync } from "node:fs";
import { expect, persona, test } from "./support";

// Every beat of the demo script (docs/06-demo-script.md), in English on a laptop the way it is
// presented. Run it before recording: a script that has not been walked through the real app is a
// script that breaks on camera. Sample personas only, so nothing reaches the database.

test.describe("demo script", { tag: "@smoke" }, () => {
  test("0:12 EN to ID flips the whole page", async ({ page }) => {
    await page.goto("/");
    const bar = page.locator('[data-bar="site"]');
    await bar.getByRole("button", { name: "ID", exact: true }).click();
    await expect(page.locator("h1").first()).toContainText("Beli tiket");
    await bar.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.locator("h1").first()).toContainText("Buy resale");
  });

  test("0:25 to 0:50 the checks a seller meets on the sample tickets", async ({ page }) => {
    await persona(page, "seller");
    const check = async (sample?: string) => {
      await page.goto("/sell");
      if (sample) await page.getByRole("button", { name: sample }).click();
      else await page.getByRole("button", { name: "No file handy? Use a sample" }).click();
      await page.getByRole("button", { name: "Check the ticket" }).click();
      await expect(page.getByRole("heading", { name: "Ticket check" })).toBeVisible();
    };
    await test.step("0:25 a sample fills the form", async () => {
      await check();
      await expect(page.getByText("Details from the sample")).toBeVisible();
    });
    await test.step("0:35 an edited ticket scores high", async () => {
      await check("Edited ticket");
      await expect(page.getByText(/Traces of editing/)).toBeVisible();
    });
    await test.step("0:42 a duplicate barcode is blocked outright", async () => {
      await check("Duplicate barcode");
      await page.getByRole("button", { name: "Continue to price" }).click();
      await expect(page.getByRole("button", { name: /Blocked \(duplicate\)/ })).toBeVisible();
    });
    await test.step("0:50 a last-minute listing goes to review", async () => {
      await check();
      await page.getByRole("combobox").first().selectOption("ev-demo-fest");
      await page.getByRole("button", { name: "Continue to price" }).click();
      await expect(page.getByText(/duplicate-ticket fraud happens/)).toBeVisible();
      await expect(page.getByRole("button", { name: /Submit for review/ })).toBeVisible();
    });
  });

  test("1:00 to 1:10 checkout creates the order, with the letter and the on-chain panel", async ({ page }) => {
    await persona(page, "buyer");
    await page.goto("/checkout?listing=ls-1&qty=2");
    await page.getByRole("button", { name: /^Pay / }).click();
    await expect(page).toHaveURL(/\/tickets\/or-/);
    await expect(page.getByText("Letter of authorisation").first()).toBeVisible();
    // The letter is a real draft to download, a PDF with the order on it, not a picture of one.
    await page.getByRole("button", { name: /Letter of authorisation/ }).click();
    const [draft] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download draft (PDF)" }).click()]);
    expect(draft.suggestedFilename()).toMatch(/^draf-surat-kuasa-or-.+\.pdf$/);
    expect(readFileSync(await draft.path()).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    await page.keyboard.press("Escape");
    await page.getByText("Verify it yourself on-chain").click();
    // A sample order says so and links the live contract; a chain-mode order lists its transactions.
    await expect(page.getByText("This is a sample order").or(page.getByText("Escrow contract")).first()).toBeVisible();
  });

  test("1:20 to 2:22 a claim, from the countdown to the verdict", async ({ page }) => {
    await persona(page, "buyer");
    await page.goto("/tickets/or-seed-2");
    await test.step("1:20 the live countdown", async () => {
      await expect(page.getByText("Auto-releases to the seller in")).toBeVisible();
    });
    await test.step("1:32 a no-show is refused on the spot", async () => {
      await page.getByRole("button", { name: "Something went wrong at the gate" }).click();
      await page.getByText("I could not attend").click();
      await expect(page.getByText("Not a refund case")).toBeVisible();
      await expect(page.getByRole("button", { name: "File dispute" })).toBeDisabled();
    });
    await test.step("1:45 weak evidence reads WEAK, with the reason", async () => {
      await page.getByText("Turned away at the gate").click();
      await page.getByText("scanner-no-code-visible.jpg").click();
      await expect(page.getByText("WEAK").first()).toBeVisible();
      await expect(page.getByText(/someone else being refused/)).toBeVisible();
    });
    await test.step("1:55 strong evidence files the claim", async () => {
      await page.getByText("gate-scanner-rejected.jpg").click();
      await expect(page.getByText("STRONG").first()).toBeVisible();
      await page.getByRole("dialog").getByRole("checkbox").check();
      await page.getByRole("button", { name: "File dispute" }).click();
      await expect(page.getByText("Under review").first()).toBeVisible();
    });
    await test.step("2:05 the seller sees the claim and answers", async () => {
      await persona(page, "seller");
      await page.goto("/seller");
      await expect(page.getByRole("heading", { name: /Claims against you/ })).toBeVisible();
      await page.getByText("Answer this claim").first().click();
      await page.locator("textarea").fill("Handed the ticket over three days before the show.");
      await page.getByText("handover-chat.png").click();
      await page.getByRole("button", { name: /Send answer/ }).click();
      await expect(page.getByText("Your answer is on file").first()).toBeVisible();
    });
    await test.step("2:15 the arbiter sees both sides, the ladder and the penalty", async () => {
      await persona(page, "admin");
      await page.goto("/admin");
      await expect(page.getByText("Seller replied").first()).toBeVisible();
      await expect(page.getByRole("button", { name: /Full refund|Release to seller/ }).nth(1)).toBeVisible();
      await expect(page.getByText(/40% of the sale/).first()).toBeVisible();
    });
    await test.step("2:22 the verdict lands on the buyer's order", async () => {
      await page.getByRole("button", { name: /Full refund/ }).first().click();
      await persona(page, "buyer");
      await page.goto("/tickets");
      await expect(page.getByText("Refunded to you").first()).toBeVisible();
    });
  });

  test("2:25 the organiser cancels, and the refund is automatic", async ({ page }) => {
    await persona(page, "buyer");
    await page.goto("/tickets/or-seed-1");
    await page.getByRole("button", { name: "Organiser cancels", exact: true }).click();
    await expect(page.getByText("Refunded to you").first()).toBeVisible();
  });

  test("the show's name rule is on the event page, unconfirmed for a real show", async ({ page }) => {
    // Real shows carry a name rule only when the promoter's terms say so (tasks/real-events-2026.md).
    await page.goto("/events/ev-gnr-jakarta");
    await expect(page.getByText("Name rules not confirmed").first()).toBeVisible();
    // Real shows, sample listings: the page says so (lib/features.ts).
    await expect(page.locator("[data-sample-listings]")).toBeVisible();
    // Sellers cannot stage an ID card yet (lib/features.ts), so no listing claims one or is blamed for lacking one.
    await expect(page.getByText(/ID checked at the gate|ID card not staged/)).toHaveCount(0);
  });

  test("a show opens on the ticket count of its cheapest listing, so the From price is in the list", async ({ page }) => {
    // 9.50 USDC is one ticket; a fixed default of 2 hid it while the sidebar said "From 9.50 USDC".
    await page.goto("/events/ev-bbw-2026");
    await expect(page.getByRole("group", { name: "Number of tickets" }).getByRole("button", { name: "1", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-listing="ls-bbw-1"]')).toBeVisible();
  });

  test("a listing held for a check says when it can be bought", async ({ page }) => {
    await page.goto("/events/ev-demo-fest");
    await expect(page.locator('[data-listing="ls-3"] [data-review-why]')).toContainText("once the Lummy team has checked the file");
  });

  test("what is not live says so: the review target, and no real payout yet", async ({ page }) => {
    await persona(page, "seller");
    await page.goto("/seller");
    await expect(page.locator("[data-review-note]").first()).toContainText("within 24 hours");
    await page.goto("/profile");
    await expect(page.locator("[data-payout-test]")).toContainText("no real money is paid out");
  });

  test("an ID-match show has the buyer confirm the risk before paying", async ({ page }) => {
    await persona(page, "buyer");
    await page.goto("/checkout?listing=ls-9&qty=1");
    const pay = page.getByRole("button", { name: /^Pay / });
    await expect(pay).toBeDisabled();
    await page.getByText(/my ID card matches the name/).click();
    await expect(pay).toBeEnabled();
  });

  test("refused over the name: a refund without a seller penalty", async ({ page }) => {
    await persona(page, "buyer");
    await page.goto("/checkout?listing=ls-1&qty=2");
    await page.getByRole("button", { name: /^Pay / }).click();
    await expect(page).toHaveURL(/\/tickets\/or-/);
    await page.getByRole("button", { name: "Mark event as finished" }).click();
    await page.getByRole("button", { name: "Something went wrong at the gate" }).click();
    await page.getByText("Turned away over the name").click();
    await page.getByText("gate-id-check-refused.jpg").click();
    await expect(page.getByText("STRONG").first()).toBeVisible();
    await page.getByRole("dialog").getByRole("checkbox").check();
    await page.getByRole("button", { name: "File dispute" }).click();
    await expect(page.getByText("Under review").first()).toBeVisible();
    await persona(page, "admin");
    await page.goto("/admin");
    const card = page.locator("[data-claim]", { hasText: "Turned away over the name" }).first();
    await expect(card.getByText(/charges the seller nothing/)).toBeVisible();
    await expect(card.getByText(/40% of the sale/)).toHaveCount(0);
  });

  test("a first visit is signed out, and a sample account returns to checkout", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await page.goto("/checkout?listing=ls-1");
    await expect(page).toHaveURL(/\/login/);
    await page.getByRole("button", { name: /^(Continue with a (demo|sample) account|Sign in)$/ }).click();
    await expect(page).toHaveURL(/\/checkout\?listing=ls-1/);
    await expect(page.locator("[data-demo-bar]")).toContainText("Demo account: Buyer");
  });

  test("a persona stored days ago says it is a demo account, and as whom, and leaves in one click", async ({ page }) => {
    await persona(page, "admin");
    await page.goto("/");
    const bar = page.locator("[data-demo-bar]");
    await expect(bar).toContainText("Demo account: Admin");
    await expect(bar.getByRole("link", { name: "Sign in with your email" })).toHaveAttribute("href", "/login");
    await bar.getByRole("button", { name: "Leave demo" }).click();
    await expect(bar).toHaveCount(0);
    await expect(page.locator('[data-bar="site"]').getByRole("link", { name: "Sign in" })).toBeVisible();
  });
});
