/**
 * 로그인 후 돌아갈 경로(?from=) 검증.
 * 같은 사이트 내부 경로만 허용해 외부 사이트로 보내는 open redirect를 막는다.
 * - "/"로 시작해야 함 ("//evil.com", "/\evil.com" 같은 프로토콜 상대 URL 거부)
 * - 제어문자 거부
 * - /login, /api 는 돌아갈 곳이 아니므로 거부 (루프 방지)
 * 조건에 맞지 않으면 대시보드("/")로.
 */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.includes("\\")) return "/";
  if (/[\u0000-\u001f\u007f]/.test(value)) return "/";
  const pathname = value.split(/[?#]/, 1)[0];
  if (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/api" ||
    pathname.startsWith("/api/")
  ) {
    return "/";
  }
  return value;
}
