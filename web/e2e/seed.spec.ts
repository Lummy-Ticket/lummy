import { expect, persona, test } from "./support";

// The page Playwright's test agents start from (docs/testing/playwright-agents.md): the planner
// explores from here, and the generator records a new test on top of it, so a generated test opens
// the way ours do, with the helpers of ./support. Only the agents' projects run it (agents and
// agents-phone in playwright.config.ts); it carries no @smoke tag, so CI never does.
test.describe("seed", () => {
  test("seed", async ({ page }) => {
    // The sample buyer, whose orders stay in this browser. Another persona is one call away:
    // persona(page, "seller") or persona(page, "admin"), then a page load.
    await persona(page, "buyer");
    await page.goto("/");
    await expect(page.locator("[data-demo-bar]")).toBeVisible();
  });
});
