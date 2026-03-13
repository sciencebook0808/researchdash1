/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React Compiler for automatic optimizations (stable in Next.js 16)
  reactCompiler: true,
  
  typescript: {
    ignoreBuildErrors: false,
  },
  
  // Prisma v7 uses @prisma/adapter-pg (pure JS driver adapter).
  // pg and @prisma/adapter-pg must be treated as server-external to prevent
  // Next.js from bundling native Node.js bindings unavailable in serverless.
  serverExternalPackages: ["pg", "pg-native", "@prisma/adapter-pg"],
  
  // Disable React strict mode for TipTap compatibility
  reactStrictMode: false,
  
  // Image optimization configuration
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.clerk.com",
      },
      {
        protocol: "https",
        hostname: "images.clerk.dev",
      },
    ],
  },
  
  // Enable experimental features
  experimental: {
    // Optimize package imports for better tree-shaking
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-icons",
      "recharts",
      "framer-motion",
    ],
  },
}

module.exports = nextConfig
