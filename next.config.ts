import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The local-first MVP has no server-side data layer yet. When the Supabase
  // repository lands, route handlers under app/api/ become the transport and
  // this config gains the server-only env plumbing.
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
