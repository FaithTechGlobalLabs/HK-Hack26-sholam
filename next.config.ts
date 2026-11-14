import path from "node:path";
import type { NextConfig } from "next";

const devFrame =
  process.env.NODE_ENV === "development"
    ? "frame-ancestors 'self' http://localhost:8082 http://127.0.0.1:8082"
    : "frame-ancestors 'none'";

const nextConfig: NextConfig = {
  // The preview on :8082 and Brave both open the site as 127.0.0.1.
  // Without this, Next blocks the dev JavaScript and the page cannot hydrate.
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.0.114"],
  async headers() {
    const headers = [
      { key: "Content-Security-Policy", value: devFrame },
    ];
    if (process.env.NODE_ENV !== "development") {
      headers.push({ key: "X-Frame-Options", value: "DENY" });
    }
    return [
      {
        source: "/:path*",
        headers,
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // sholam sits inside the Automation-agents repo, which has its own
    // package-lock.json; pin the root so Turbopack resolves from here.
    root: path.join(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
