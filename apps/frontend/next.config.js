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
};

module.exports = nextConfig;
