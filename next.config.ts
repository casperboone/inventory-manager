import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json in the home directory confuses root detection.
  turbopack: { root: import.meta.dirname },
  // Old addresses, for bookmarks. Query strings carry over by themselves.
  redirects() {
    return [
      {
        source: "/assortment/:path*",
        destination: "/order-list/:path*",
        permanent: true,
      },
      {
        source: "/products/:path*",
        destination: "/catalog/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
