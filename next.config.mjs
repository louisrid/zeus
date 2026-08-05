/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["highs"],
    outputFileTracingIncludes: {
      "/api/**/*": ["./node_modules/highs/build/highs.wasm"],
    },
  },
};
export default nextConfig;
