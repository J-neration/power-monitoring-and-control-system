const path = require("node:path");

// AWS 컨테이너 이미지 빌드(apps/frontend/Dockerfile)에서만 켜진다.
// Netlify 빌드는 이 값이 없으므로 출력 형식·헤더가 기존과 같다 (보안 헤더는 netlify.toml 담당).
const isContainerBuild = process.env.NEXT_OUTPUT === "standalone";

// Next 의 하이드레이션 인라인 스크립트 때문에 script-src 에 'unsafe-inline' 이 필요하다.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

// netlify.toml [[headers]] 와 같은 값 + CSP. CSP 는 NEXT_CSP_ENFORCE=true 전까지 보고 전용.
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key:
      process.env.NEXT_CSP_ENFORCE === "true"
        ? "Content-Security-Policy"
        : "Content-Security-Policy-Report-Only",
    value: contentSecurityPolicy,
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // /admin → /admin/sites 는 page 안 redirect() 대신 여기서 처리.
  // (main)/loading.tsx Suspense 안에서 redirect() 하면 Next 14.1에서
  // 로딩 UI에 멈추는 경우가 있음 (헤더「관리자 패널」진입 경로).
  async redirects() {
    return [
      {
        source: "/admin",
        destination: "/admin/sites",
        permanent: false,
      },
    ];
  },
  ...(isContainerBuild && {
    output: "standalone",
    poweredByHeader: false,
    experimental: {
      // 워크스페이스 루트로 끌어올려진 node_modules 까지 standalone 출력에 포함시킨다.
      outputFileTracingRoot: path.join(__dirname, "../../"),
    },
    async headers() {
      return [{ source: "/:path*", headers: securityHeaders }];
    },
  }),
};

module.exports = nextConfig;
