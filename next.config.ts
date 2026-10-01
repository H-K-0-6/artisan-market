import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Same-origin app: bids and sockets go to this server, payments redirect to Stripe
// Checkout (no Stripe.js on our pages), photos upload to UploadThing and are served
// from its CDN. Next's inline bootstrap scripts need 'unsafe-inline' without nonces.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://utfs.io https://*.ufs.sh https://picsum.photos https://fastly.picsum.photos",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss: https://*.uploadthing.com https://utfs.io https://*.ufs.sh",
  "frame-ancestors 'none'",
  "form-action 'self' https://checkout.stripe.com",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  // A stray lockfile in a parent folder otherwise makes Turbopack guess the wrong root.
  turbopack: { root: __dirname },
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
      { protocol: "https", hostname: "utfs.io" },
      { protocol: "https", hostname: "*.ufs.sh" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
