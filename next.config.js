/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Prisma v7 uses the pg driver adapter (pure JS) — exclude native pg bindings
  // from the serverless bundle to avoid missing binary errors on Vercel.
  serverExternalPackages: ["pg-native"],
}

module.exports = nextConfig
