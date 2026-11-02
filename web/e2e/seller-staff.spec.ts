import type { Locator, Page } from "@playwright/test";
import { expect, isLocal, persona, test } from "./support";

// What sellers and staff do in the beta that the demo script does not walk through (tasks 11.5,
// 11.7): a seller asks for a show that is not in the catalogue and follows it on her dashboard,
// staff rule on it, and a verdict waits until it is confirmed. In English on a laptop, the way staff
// work. Sample personas only: their requests, rulings and orders stay in this browser.

// A day in Jakarta, as the date field takes it (yyyy-mm-dd).
const day = (fromNow: number) => new Date(Date.now() + fromNow * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
// A made-up show, so the request cannot be taken for one in the catalogue (and no "Lummy ..." name).
const SHOW = "Request check, an evening concert";

/** The Sell page's request form, opened the way a seller with a ticket for an unlisted show meets it. */
async function openRequestForm(page: Page) {
  await persona(page, "seller");
  await page.goto("/sell");
  await page.getByRole("button", { name: "No file handy? Use a sample" }).click();
  await page.getByRole("button", { name: "Check the ticket" }).click();
  await expect(page.getByRole("heading", { name: "Ticket check" })).toBeVisible();
  await page.locator("[data-request-show]").getByRole("button", { name: "Request it" }).click();
  const form = page.getByRole("dialog");
  await expect(form.locator("[data-event-request-form]")).toBeVisible();
  return form;
}

/** Fills the form with a show still to come, on an official https page. */
async function fillRequest(form: Locator, date = day(60), link = "https://example.com/an-evening-concert") {
  await form.getByLabel("Show name, as the organiser writes it").fill(SHOW);
  await form.getByLabel("Date", { exact: true }).fill(date);
  await form.getByLabel("Venue").fill("Istora Senayan");
  await form.getByLabel("City").fill("Jakarta");
  await form.getByLabel("Link to the organiser's official page").fill(link);
}

test.describe("seller and staff", () => {
  test("a seller requests a show that is not listed, staff turn it down with a reason, and she reads it", { tag: "@smoke" }, async ({ page }) => {
    const form = await openRequestForm(page);
    await fillRequest(form);
    await form.getByRole("button", { name: "Send the request" }).click();
    await expect(page.locator("[data-request-show]")).toContainText("Request sent");

    await test.step("it waits on her dashboard", async () => {
      await page.goto("/seller");
      const mine = page.locator("[data-show-requests]");
      await expect(mine.getByRole("heading", { name: "Your show requests" })).toBeVisible();
      await expect(mine.locator('[data-show-request="pending"]').filter({ hasText: SHOW })).toContainText("Waiting for staff");
    });

    const reason = "The link is not the organiser's official page, or it does not show this show.";
    await test.step("staff find it in the New events queue and reject it with a reason", async () => {
      await persona(page, "admin");
      await page.goto("/admin");
      await page.getByRole("button", { name: /^New events/ }).click();
      const request = page.locator("[data-request]").filter({ hasText: SHOW });
      await expect(request).toContainText("Requested by Maya K.");
      await request.getByRole("button", { name: "Reject..." }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: reason }).click();
      await dialog.getByRole("button", { name: "Reject", exact: true }).click();
      await expect(page.locator('[data-request-status="rejected"]').filter({ hasText: SHOW })).toContainText(`Staff: ${reason}`);
    });

    await test.step("the seller reads the reason on her dashboard", async () => {
      await persona(page, "seller");
      await page.goto("/seller");
      const mine = page.locator('[data-show-request="rejected"]').filter({ hasText: SHOW });
      await expect(mine).toContainText("Not approved");
      await expect(mine).toContainText(`Staff: ${reason}`);
    });
  });

  test("a request the rules refuse says why, and nothing is sent", async ({ page }) => {
    const form = await openRequestForm(page);
    const error = form.locator("[data-req-error]");
    const send = form.getByRole("button", { name: "Send the request" });
    // The page applies the server's own rules (lib/events/requests.ts), so it can say why at once.
    await fillRequest(form, day(-1));
    await send.click();
    await expect(error).toHaveText("The show has to be still to come.");
    await fillRequest(form, day(60), "http://example.com/an-evening-concert");
    await send.click();
    await expect(error).toContainText("Paste the link to the organiser's official page (https://...)");
    await form.getByRole("button", { name: "Close" }).click();
    await expect(page.locator("[data-request-show]")).toContainText("Your show is not in the list?");
    // The dashboard as it reads this browser's data (its note on demo listings appears only then),
    // with no request on it: Maya had none, and a refused one is not kept.
    await page.goto("/seller");
    await expect(page.locator("[data-demo-listings]")).toBeVisible();
    await expect(page.locator("[data-show-requests]")).toHaveCount(0);
  });

  test("a sample admin sees the three queues and none of the beta's real numbers", { tag: "@smoke" }, async ({ page, request, baseURL }) => {
    await persona(page, "admin");
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Admin dashboard" })).toBeVisible();
    await expect(page.getByText("Three queues: money in dispute, listings held back, and events waiting to open.")).toBeVisible();
    for (const tab of ["Claims", "Listings held", "New events"]) await expect(page.getByRole("button", { name: new RegExp(`^${tab}( \\d+)?$`) })).toBeVisible();
    // The Beta numbers, payments and show changes come from the database, so they are for staff
    // signed in with an account (tasks 11.7); a sample admin is not shown them at all.
    for (const tab of ["Beta", "Payments", "Shows"]) await expect(page.getByRole("button", { name: new RegExp(`^${tab}( \\d+)?$`) })).toHaveCount(0);
    // Nor are they behind a guessable address: each answers a stranger with 401 (503 on a local
    // server with no database), before it reads anything.
    const refused = isLocal(baseURL) ? [401, 503] : [401];
    for (const path of ["/api/admin/metrics", "/api/admin/payments", "/api/events/requests?queue=1"]) {
      expect(refused, path).toContain((await request.get(path)).status());
    }
  });

  test("a verdict waits for its confirmation: Cancel records nothing", async ({ page }) => {
    await persona(page, "admin");
    await page.goto("/admin");
    // The sample claim the seed keeps open on the last show that ended (lib/mock/seed-orders.ts).
    const first = page.locator("[data-claim]").first();
    await expect(first).toBeVisible();
    const claim = page.locator(`[data-claim="${await first.getAttribute("data-claim")}"]`);
    const dialog = page.getByRole("dialog");

    await claim.getByRole("button", { name: /^Full refund/ }).click();
    await expect(dialog.locator("[data-verdict-confirm]")).toContainText("Full refund");
    await expect(dialog).toContainText("A verdict is final");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(claim).toBeVisible();

    await claim.getByRole("button", { name: /^Release to seller/ }).click();
    await expect(dialog.locator("[data-verdict-confirm]")).toContainText("Release to seller");
    await dialog.getByRole("button", { name: "Yes, record it" }).click();
    await expect(claim).toHaveCount(0);
    await expect(page.getByText("Closed, funds released to the seller")).toBeVisible();
  });
});
