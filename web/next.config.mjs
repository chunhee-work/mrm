const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
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
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
