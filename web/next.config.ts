import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Dev only: the chain e2e opens `next dev` at 127.0.0.1, which Next 16.1+ treats as another
  // origin and refuses its scripts, so the page never hydrates.
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    // Poster event = SVG data-URI (offline). Izinkan SVG lewat next/image.
    dangerouslyAllowSVG: true,
    contentDispositionType: "inline",
    remotePatterns: [
      {hostname: "i.pravatar.cc"}
    ],
  },
  async redirects() {
    return [
      {
        source: '/event', 
        destination: '/events',
        permanent: true, 
      },
    ];
  },
};

export default nextConfig;
