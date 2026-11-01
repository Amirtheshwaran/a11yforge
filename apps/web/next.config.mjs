const apiProxyTarget = process.env["A11YFORGE_API_PROXY_TARGET"];

/**
 * Single-port hosting: with a proxy target set at build time, /backend/* reaches
 * the API on a private port. Compression would buffer the progress stream, and
 * the default 30-second proxy timeout would cut off a quiet one.
 */
const singlePortConfig = {
  compress: false,
  experimental: { proxyTimeout: 600_000 },
  async rewrites() {
    return [{ source: "/backend/:path*", destination: `${apiProxyTarget}/:path*` }];
  },
};

/** @type {import('next').NextConfig} */
const nextConfig = apiProxyTarget ? singlePortConfig : {};

export default nextConfig;
