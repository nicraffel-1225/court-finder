import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Off: every page here fetches live court availability on each request —
  // there's nothing static to prerender or cache, so this newer Next.js
  // model (built for mixing static and dynamic content) doesn't fit.
  cacheComponents: false,
  agentRules: false,
};

export default nextConfig;
