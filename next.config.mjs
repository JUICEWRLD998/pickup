/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@mysten-incubation/memwal"],
  poweredByHeader: false,
  agentRules: false,
};
export default nextConfig;
