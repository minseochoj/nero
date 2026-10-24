/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  outputFileTracingRoot: import.meta.dirname,
  images: { unoptimized: true },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // node builtins some Solana deps reference but never use in the browser
      config.resolve.fallback = { ...(config.resolve.fallback || {}), fs: false, os: false, path: false, crypto: false }
    }
    return config
  },
}
