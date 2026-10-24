import { DEMO_SIGN_IN, aiClaims, expect, expectFitsScreen, isLocal, signInSample, tapUntil, test } from "./support";

// The five user-testing tasks (tasks/user-testing.md), the way a first-time tester meets them on a
// phone: signed out, in Indonesian, with a sample account only, so nothing reaches the database.

test.describe("user tasks", { tag: "@smoke" }, () => {
  test("a first visit follows the phone's language, with the switch in the bar", async ({ page, baseURL }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "id");
    await expect(page.locator('[data-bar="site"]').getByRole("button", { name: "ID", exact: true })).toHaveAttribute("aria-pressed", "true");
    const devPanel = page.getByRole("button", { name: /^(Dev panel|Panel dev)$/ });
    if (isLocal(baseURL)) await expect(devPanel).toBeVisible();
    else await expect(devPanel).toHaveCount(0);
    await expectFitsScreen(page);
  });

  test("no page or link preview claims AI checks tickets", async ({ page }) => {
    await page.goto("/");
    expect(await page.locator('meta[name="description"]').getAttribute("content")).not.toMatch(/\bAI\b/);
    for (const path of ["/", "/events", "/events/ev-5sos-jakarta", "/how-it-works", "/about"]) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("lang", "id");
      expect(aiClaims(await page.locator("body").innerText()), path).toEqual([]);
      await expectFitsScreen(page);
    }
  });

  test("the home page gives selling the same room as buying", async ({ page }) => {
    await page.goto("/");
    const sell = page.locator("[data-home-sell]");
    await sell.scrollIntoViewIfNeeded();
    await expect(sell.getByText("Jual di Lummy")).toBeVisible();
    await expect(sell.getByRole("link", { name: "Cara jualan" })).toHaveAttribute("href", "/how-it-works#selling");
    await expectFitsScreen(page);
  });

  test("the seller's name says why no record is needed", async ({ page }) => {
    await page.goto("/events/ev-gnr-jakarta");
    // The page opens on one ticket, the cheapest listing's count, where this single is on show.
    const row = page.locator('[data-listing="ls-2"]');
    // A tap that lands before the page is ready does nothing, as on a slow phone: tap until it opens.
    await expect(async () => {
      if (!(await row.locator("[data-seller-note]").isVisible())) await row.locator("[data-seller-info]").click();
      await expect(row.locator("[data-seller-note]")).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await expect(row.locator("[data-seller-note]")).toContainText("tidak perlu memercayai penjualnya");
    await expectFitsScreen(page);
  });

  test("1 a search finds a show and its cheapest price", async ({ page }) => {
    await page.goto("/");
    const search = page.getByRole("textbox", { name: "Cari event" }).first();
    await search.fill("summer");
    await search.press("Enter");
    await expect(page).toHaveURL(/\/events\?q=summer/);
    await page.getByRole("link", { name: /Seconds of Summer/ }).first().click();
    await expect(page).toHaveURL(/\/events\/ev-/);
    await expect(page.getByText("Termurah").first()).toBeVisible();
    await expect(page.getByText("Mulai dari")).toBeVisible();
    await expectFitsScreen(page);
  });

  test("2 one ticket with a sample account, told the payment is simulated, then where the money is", async ({ page }) => {
    await page.goto("/events/ev-5sos-jakarta");
    // Up to 8, the most one listing holds, so a set of 7 or 8 that cannot be split can be found; it fits a phone.
    const counts = page.getByRole("group", { name: "Jumlah tiket" }).getByRole("button");
    await expect(counts).toHaveText(["1", "2", "3", "4", "5", "6", "7", "8"]);
    await expectFitsScreen(page);
    await page.getByRole("group", { name: "Jumlah tiket" }).getByRole("button", { name: "1", exact: true }).click();
    await page.getByRole("button", { name: "Beli" }).first().click();
    await expect(page).toHaveURL(/\/login/);
    await tapUntil(page, page.getByRole("button", { name: DEMO_SIGN_IN }), (u) => u.pathname === "/checkout");
    await expect(page.locator("[data-sample-payment]")).toBeVisible();
    await expectFitsScreen(page);
    // A show whose gate matches the ID card to the name (id_match, as 5 Seconds of Summer on SODTix's
    // terms) asks the buyer to say they understand that before Bayar.
    const nameRisk = page.getByRole("checkbox", { name: /KTP harus sama dengan nama di tiket/ });
    if (await nameRisk.isVisible()) {
      await expect(page.getByRole("button", { name: /^Bayar / })).toBeDisabled();
      await nameRisk.check();
    }
    await tapUntil(page, page.getByRole("button", { name: /^Bayar / }), (u) => u.pathname.startsWith("/tickets/or-"));
    // Task 3: the money is held, and the page says until when.
    await expect(page.getByText("Dana terkunci").first()).toBeVisible();
    await expect(page.getByText("Menunggu acara, lalu 48 jam")).toBeVisible();
    await expectFitsScreen(page);
  });

  test("3 my tickets shows each ticket's price, not a total that leaves out the fees", async ({ page }) => {
    await signInSample(page, "/tickets");
    await expect(page.getByText("Harga tiket").first()).toBeVisible();
    await expect(page.getByText("Total dibayar")).toHaveCount(0);
    // Every page says it is a demo account, and as whom, on a phone too.
    await expect(page.locator("[data-demo-bar]")).toContainText("Akun demo: Pembeli");
    await expectFitsScreen(page);
  });

  test("4 a gate claim on the show that has just ended, graded and held", async ({ page }) => {
    await signInSample(page, "/tickets");
    await page.getByText(/Lummy Demo Night, Surabaya/).first().click();
    await page.getByRole("button", { name: "Ada masalah di gate" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Ditolak di gate", { exact: true }).click();
    await dialog.getByText("gate-scanner-rejected.jpg").click();
    await expect(dialog.getByText("KUAT").first()).toBeVisible();
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Kirim sengketa" }).click();
    // The payout waits for the decision, with no date of its own, and no empty quote for a claim without a note.
    await expect(page.getByText("Menunggu putusan klaim")).toBeVisible();
    await expect(page.getByText(/Cair otomatis pada/)).toHaveCount(0);
    await expect(page.getByText("“”")).toHaveCount(0);
    await expectFitsScreen(page);
  });

  test("5 a sample ticket is checked and listed, with no AI claim", async ({ page }) => {
    await signInSample(page, "/sell");
    await page.getByRole("button", { name: "Gak punya file? Pakai contoh" }).click();
    await page.getByRole("button", { name: "Cek tiketnya" }).click();
    await expect(page.getByRole("heading", { name: "Cek tiket" })).toBeVisible();
    await expect(page.getByText("Data dari tiket contoh")).toBeVisible();
    expect(aiClaims(await page.locator("main").innerText())).toEqual([]);
    await expectFitsScreen(page);
    await page.getByRole("button", { name: "Lanjut ke harga" }).click();
    await page.getByRole("button", { name: /^(Publish listing|Ajukan untuk review)$/ }).click();
    await expect(page).toHaveURL(/\/seller/);
  });
});
