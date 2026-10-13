import type { MetadataRoute } from "next";

/**
 * Search engines may read the public pages; account pages, the staff console, the gate and the API
 * are not for them. Served as /robots.txt.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin", "/gate", "/checkout", "/tickets", "/seller", "/sell", "/profile", "/login", "/auth/"],
    },
    sitemap: "https://lummy.id/sitemap.xml",
  };
}
