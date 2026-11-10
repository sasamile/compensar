/**
 * Cabeceras de seguridad (TEC-22, TEC-55 parcial, TEC-59, RNF-SEG-05/09).
 * - CSP: Next.js App Router necesita 'unsafe-inline' en script-src (datos de hidratación en línea) y,
 *   en desarrollo, 'unsafe-eval' y websockets para recarga en caliente. Orígenes externos permitidos:
 *   jsDelivr (Swagger UI con SRI en /api-docs) y Cloudflare Turnstile (anti-bots, opcional).
 * - HSTS: el navegador solo la aplica sobre HTTPS; TLS 1.2/1.3 y la redirección HTTP→HTTPS se hacen en el
 *   balanceador/CDN (fuera del código).
 */
const dev = process.env.NODE_ENV !== "production";
const ssoOrigin = (() => { try { return process.env.SSO_FORM_ORIGIN ? new URL(process.env.SSO_FORM_ORIGIN).origin : ""; } catch { return ""; } })();

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://cdn.jsdelivr.net https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://challenges.cloudflare.com${dev ? " ws: wss:" : ""}`,
  "frame-src 'self' https://challenges.cloudflare.com https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  `form-action 'self'${ssoOrigin ? " " + ssoOrigin : ""}`,
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

/** @type {import('next').NextConfig} */
export default {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["exceljs", "qrcode", "pdf-lib"],
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
