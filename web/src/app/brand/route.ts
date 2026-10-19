// The draft brand guideline, for the team to review (19 Oct 2026): a plain page outside the site's
// layout, linked from nowhere and kept out of search engines. Built by docs/brand/build.py; delete
// this folder once the team has decided.
import { BRAND_HTML } from "./html";

export const dynamic = "force-static";

export function GET() {
  return new Response(BRAND_HTML, {
    headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow" },
  });
}
