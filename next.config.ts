import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The launch film and its poster are versioned by file name (ring-v1.*), so browsers can keep
  // them for a year: shops download the film once per phone, not once per visit.
  async headers() {
    return [{ source: "/splash/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }];
  },
};

export default nextConfig;
