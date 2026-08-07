import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {hostname: "picsum.photos"}, 
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
