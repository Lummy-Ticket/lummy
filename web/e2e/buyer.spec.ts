import { getEventById, isEventOver, seedEvents } from "../src/lib/mock/seed";
import { expect, expectFitsScreen, isBuyable, isLocal, persona, rupiah, showWhere, test } from "./support";

// What a buyer meets around the edges of a sale, on the phones testers bring and in Indonesian:
// a show that has ended or has just started sells nothing (sales close when a show starts, uji
// manual 25 Oct 2026), and a sample order offers no file that could pass for a ticket. Signed out,
// or with the sample buyer, so nothing reaches the database.

// Shows by what they are, never by id (tasks 11.8): the last show in the seed that has ended, which
// lummy.id still serves so old links resolve, and a show still to come with tickets on sale.
const ENDED = seedEvents()
  .map((e) => getEventById(e.id)!)
  .filter((e) => isEventOver(e))
  .sort((a, b) => Date.parse(b.dateISO) - Date.parse(a.dateISO))[0];
const SOON = showWhere("a rupiah show with tickets on sale", (e, ls) => rupiah(e) && ls.some(isBuyable));

test.describe("buyer", () => {
  test("a show that has ended says so, and sells nothing", { tag: "@smoke" }, async ({ page }) => {
    test.skip(!ENDED, "no show in the seed has ended yet");
    await page.goto(`/events/${ENDED.id}`);
    const closed = page.locator("[data-sales-closed]");
    await expect(closed).toContainText("Acara ini sudah selesai");
    await expect(closed).toContainText("Tiketnya sudah tidak dijual lagi.");
    await expect(closed.getByRole("link", { name: "Lihat acara berikutnya" })).toHaveAttribute("href", "/events");
    await expect(page.getByText("Acara ini sudah lewat, jadi tidak ada yang dijual.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Beli", exact: true })).toHaveCount(0);
    await expectFitsScreen(page);
  });

  test("a show's page left open as the doors open closes its sales at the next tap", { tag: "@smoke" }, async ({ page }) => {
    await page.goto(`/events/${SOON.id}`);
    const counts = page.getByRole("group", { name: "Jumlah tiket" });
    await expect(page.getByRole("button", { name: "Beli", exact: true }).first()).toBeVisible();
    // The browser's clock moves to half an hour after the doors open, once the page has loaded: set
    // before, the server renders with the real time and the browser with the moved one, and the two
    // pages differ (React error #418 on 1 Nov 2026). The page reads the clock on every render, so the
    // next tap, on another ticket count, is the one that finds the show started.
    await page.clock.setFixedTime(new Date(Date.parse(SOON.dateISO) + 30 * 60_000));
    const closed = page.locator("[data-sales-closed]");
    // A tap that lands before the page is ready does nothing, as on a slow phone: tap until it shows.
    await expect(async () => {
      if (!(await closed.isVisible())) await counts.getByRole("button", { pressed: false }).first().click({ timeout: 3_000 });
      await expect(closed).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000 });
    await expect(closed).toContainText("Acara ini sudah dimulai");
    await expect(closed).toContainText("Penjualan ditutup saat pintu dibuka");
    await expect(page.getByText("Acara ini sudah dimulai, jadi penjualan ditutup.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Beli", exact: true })).toHaveCount(0);
    await expectFitsScreen(page);
  });

  test("a sample order's ticket file says it is a sample, with nothing to download", { tag: "@smoke" }, async ({ page, request, baseURL }) => {
    // While payments are simulated an account's order downloads a stand-in marked "NOT A TICKET -
    // LUMMY BETA" (lib/docs/standin.ts), and its first download is written to the order. A sample
    // order has no file at all, so the page says so and links nothing that could pass for a ticket.
    await persona(page, "buyer");
    await page.goto("/tickets/or-seed-1");
    const row = page.locator("[data-sample-ticket]");
    await expect(row).toContainText("(contoh)");
    await expect(row).toContainText("Pesanan contoh tidak punya file tiket sungguhan.");
    await expect(page.locator("[data-ticket-file]")).toHaveCount(0);
    await expect(page.locator('a[href^="/api/orders/"]')).toHaveCount(0);
    // The file's address answers only a signed-in buyer: a stranger gets 401 (503 on a local
    // server with no database), before any order is read.
    expect(isLocal(baseURL) ? [401, 503] : [401]).toContain((await request.get("/api/orders/or-seed-1/ticket")).status());
    await expectFitsScreen(page);
  });
});
