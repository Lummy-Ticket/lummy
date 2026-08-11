import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
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
