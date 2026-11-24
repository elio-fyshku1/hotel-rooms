/**
 * Next.js settings.
 * "standalone" builds a self-contained server in .next/standalone, which is
 * what the Dockerfile copies into the production image.
 */
const nextConfig = {
  output: "standalone",
};

export default nextConfig;
