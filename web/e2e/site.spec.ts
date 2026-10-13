import { expect, test } from "./support";

// What a browser gets from lummy.id before any page logic: the headers that keep it from being
// framed or sniffed, the files crawlers and tabs ask for, the AI route's answer to a stranger, and
// links that lead somewhere.

test.describe("site", { tag: "@smoke" }, () => {
  test("every page is sent with the security headers", async ({ request }) => {
    for (const path of ["/", "/events", "/login", "/how-it-works"]) {
      const h = (await request.get(path)).headers();
      expect(h["x-frame-options"], path).toBe("DENY");
      expect(h["content-security-policy"], path).toContain("frame-ancestors 'none'");
      expect(h["strict-transport-security"], path).toContain("max-age=");
      expect(h["x-content-type-options"], path).toBe("nosniff");
      expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
      expect(h["permissions-policy"], path).toContain("camera=(self)");
      expect(h["x-powered-by"], path).toBeUndefined();
    }
  });

  test("robots.txt, sitemap.xml and favicon.ico are there", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toContain("Disallow: /admin");
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain("https://lummy.id/how-it-works");
    const icon = await request.get("/favicon.ico");
    expect(icon.status()).toBe(200);
    expect(icon.headers()["content-type"]).toContain("image/");
  });

  test("the AI fill says whether it is on, and turns a stranger away", async ({ request }) => {
    const info = await request.get("/api/tickets/extract");
    expect(info.ok()).toBe(true);
    const { available } = (await info.json()) as { available: boolean };
    const post = await request.post("/api/tickets/extract", {
      multipart: { ticket: { name: "ticket.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n") } },
    });
    // Off: nobody gets in. On: only a signed-in account.
    expect(post.status()).toBe(available ? 401 : 503);
  });

  test("every link on the public pages leads to a page", async ({ page, request }) => {
    const links = new Set<string>();
    for (const path of ["/", "/events", "/how-it-works", "/about", "/privacy", "/terms"]) {
      await page.goto(path);
      for (const href of await page.locator('a[href^="/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""))) {
        const target = href.split("#")[0];
        if (target && !target.startsWith("/api/")) links.add(target);
      }
    }
    expect(links.size).toBeGreaterThan(10);
    for (const href of links) expect.soft((await request.get(href)).status(), href).toBeLessThan(400);
  });
});
