import type { NextConfig } from "next";

/** Clerk's Frontend API host, encoded in the publishable key (pk_test_<base64 of "host$">). */
function clerkFrontendApi(): string {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  const encoded = key.split("_")[2] ?? "";
  try {
    const host = Buffer.from(encoded, "base64").toString("utf8").replace(/\$$/, "");
    return /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : "https://*.clerk.accounts.dev";
  } catch {
    return "https://*.clerk.accounts.dev";
  }
}

function supabaseOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "https://*.supabase.co";
  }
}

/**
 * Content-Security-Policy tuned for Clerk (its Frontend API, images, and the
 * Cloudflare bot check), Supabase, and Discogs covers (hotlinked from Discogs'
 * image hosts). Next.js and the language script need inline scripts; the dev
 * server also needs eval for fast refresh.
 */
function contentSecurityPolicy(): string {
  const clerk = clerkFrontendApi();
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} ${clerk} https://*.clerk.com https://challenges.cloudflare.com`,
    `connect-src 'self' ${clerk} https://*.clerk.com https://*.clerk.com:* ${supabaseOrigin()} https://clerk-telemetry.com`,
    "img-src 'self' data: blob: https://*.discogs.com https://img.clerk.com",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `frame-src 'self' ${clerk} https://*.clerk.com https://challenges.cloudflare.com`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy() },
        ],
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
