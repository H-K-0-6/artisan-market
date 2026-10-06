import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Same-origin app: bids and sockets go to this server; BENEFIT and card payments
// redirect to Tap's pages; BenefitPay loads Tap's SDK (from its CDNs, which talk to
// *.tap.company); photos upload to UploadThing and are served from its CDN. Next's
// inline bootstrap scripts need 'unsafe-inline' without nonces.
// Tap Payments, its CDNs, and BenefitPay's checkout (opened in a frame by the SDK).
const TAP = "https://*.tap.company https://tap-sdks.b-cdn.net https://*.b-cdn.net https://*.benefitpay.bh https://*.test-benefitpay.bh";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} ${TAP} https://code.jquery.com`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://utfs.io https://*.ufs.sh https://picsum.photos https://fastly.picsum.photos ${TAP}`,
  `font-src 'self' data: ${TAP}`,
  `connect-src 'self' ws: wss: https://*.uploadthing.com https://utfs.io https://*.ufs.sh ${TAP}`,
  `frame-src ${TAP}`,
  "frame-ancestors 'none'",
  `form-action 'self' https://*.tap.company`,
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
