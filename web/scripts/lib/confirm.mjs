// Opens a sign-in link the way a person does since 4 Nov 2026: the link shows a page, and its
// button signs in (app/auth/confirm/route.ts). A link the server refuses outright goes straight to
// /login?error=link, with no button to press. Returns the page, wherever it landed.
export async function openSignInLink(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const button = page.locator("[data-confirm-sign-in]");
  if (await button.count()) {
    await button.click();
    await page.waitForURL((u) => !u.pathname.startsWith("/auth/confirm"), { waitUntil: "networkidle" });
  }
  return page;
}
