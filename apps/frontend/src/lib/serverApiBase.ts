/**
 * 서버 코드(Route Handler·서버 컴포넌트)가 백엔드를 호출할 주소.
 *
 * API_BASE_INTERNAL 은 NEXT_PUBLIC_ 이 아니어서 빌드에 박히지 않고 런타임에 읽힌다.
 * AWS 에서는 VPC 내부 주소를 넣어 공개 api 도메인을 거치지 않게 하고,
 * 미설정(Netlify·로컬)이면 기존처럼 NEXT_PUBLIC_API_BASE 를 쓴다.
 */
export const serverApiBase = (): string =>
  process.env.API_BASE_INTERNAL ??
  process.env.NEXT_PUBLIC_API_BASE ??
  "http://localhost:4000";
