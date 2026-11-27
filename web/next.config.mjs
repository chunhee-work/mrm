const dev = process.env.NODE_ENV !== "production";
// local test runs point the file store at a stand-in on this machine; in production this is empty and only Vercel's store is allowed
const localStore = (() => { try { return new URL(process.env.NEXT_PUBLIC_VERCEL_BLOB_API_URL ?? "").origin; } catch { return ""; } })();

// What a page may load and where it may send data. Nothing here comes from another site: scripts, styles, fonts and pictures are our own,
// uploads go to Vercel's file store, and the only frame is the Merimen live view on the connection page.
// 'unsafe-inline' stays for scripts and styles because Next.js writes small inline ones into every page; a script file from another
// site, a frame around our pages, a form posting elsewhere and a changed <base> are all refused.
// The 3D landing page needs two things of its own: its models are unpacked by a small WebAssembly decoder ('wasm-unsafe-eval'
// lets WebAssembly compile, nothing else), and the pictures inside a model are read back through blob: addresses (connect-src).
const contentPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' blob: https://vercel.com https://*.vercel-storage.com${localStore ? ` ${localStore}` : ""}${dev ? " ws:" : ""}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  `frame-src https://*.browserbase.com${dev ? " data:" : ""}`, // data: is the stand-in live view of local runs
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  // another site that opens one of our pages gets no handle on it, and cannot load our pages or files as its own resources
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
];

export default {
  reactStrictMode: true,
  devIndicators: false,
  poweredByHeader: false,
  // R4-B03 (React error #418 on /billing, /signup, /forgot-password, /reset-password): Next 15 streams <title> and the meta tags into <body> and moves them into <head>
  // with a script once they resolve. On pages that render fast, that move can land before React has hydrated, so the DOM no longer matches the server HTML.
  // Every browser now gets the metadata in <head> of the first HTML, as search bots already do (the page waits for generateMetadata, a cookie read).
  htmlLimitedBots: /.*/,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // pages only: a file opened from /api (a PDF in the browser's own viewer) keeps the headers its route sets
      { source: "/((?!api/).*)", headers: [{ key: "Content-Security-Policy", value: contentPolicy }] },
    ];
  },
};
