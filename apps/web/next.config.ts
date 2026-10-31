import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@multipost/core", "@multipost/db", "@multipost/renderers", "@multipost/connectors"]
};

export default nextConfig;
