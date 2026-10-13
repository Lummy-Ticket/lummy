import type { MetadataRoute } from "next";

/**
 * The pages about Lummy itself. The catalogue is left out while it holds sample shows with real
 * artists' names: someone searching for tickets should not land on a listing that cannot be bought.
 * Add the event pages once the pilot's real listings are up. Served as /sitemap.xml.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/how-it-works", "/about", "/privacy", "/terms"].map((path) => ({
    url: `https://lummy.id${path}`,
    changeFrequency: "monthly",
    priority: path ? 0.6 : 1,
  }));
}
