import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

const COOKIE_NAME = "pmcs_token";
const COOKIE_MAX_AGE = 60 * 60 * 8; // 8시간 (JWT 만료와 동일)

const IP_MAX_FAILURES = 30;
const IP_WINDOW_MS = 15 * 60 * 1000;
const ipBuckets = new Map<string, { failures: number; windowStart: number }>();

const clientIp = (request: NextRequest): string =>
  request.headers.get("x-nf-client-connection-ip") ??
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
  request.headers.get("x-real-ip") ??
  "";

const ipLockMessage = "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.";

const checkIpLock = (ip: string): { locked: true; retryAfterSec: number } | { locked: false } => {
  if (!ip) return { locked: false };
  const bucket = ipBuckets.get(ip);
  if (!bucket) return { locked: false };
  const now = Date.now();
  if (now - bucket.windowStart >= IP_WINDOW_MS) {
    ipBuckets.delete(ip);
    return { locked: false };
  }
  if (bucket.failures >= IP_MAX_FAILURES) {
    return {
      locked: true,
      retryAfterSec: Math.max(1, Math.ceil((bucket.windowStart + IP_WINDOW_MS - now) / 1000)),
    };
  }
  return { locked: false };
};

const recordIpFailure = (ip: string): void => {
  if (!ip) return;
  const now = Date.now();
  const bucket = ipBuckets.get(ip);
  if (!bucket || now - bucket.windowStart >= IP_WINDOW_MS) {
    ipBuckets.set(ip, { failures: 1, windowStart: now });
    return;
  }
  bucket.failures += 1;
};

export async function POST(request: NextRequest) {
  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "잘못된 요청입니다." }, { status: 400 });
  }

  const ip = clientIp(request);
  const ipLock = checkIpLock(ip);
  if (ipLock.locked) {
    return NextResponse.json(
      { message: ipLockMessage },
      { status: 429, headers: { "Retry-After": String(ipLock.retryAfterSec) } },
    );
  }

  // 백엔드 /auth/login 호출
  let backendRes: Response;
  try {
    backendRes = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: body.username, password: body.password }),
    });
  } catch {
    return NextResponse.json({ message: "서버에 연결할 수 없습니다." }, { status: 503 });
  }

  const data = await backendRes.json();

  if (!backendRes.ok) {
    if (backendRes.status === 401 || backendRes.status === 429) {
      recordIpFailure(ip);
    }
    const retryAfter = backendRes.headers.get("retry-after");
    return NextResponse.json(
      { message: data.message ?? "로그인에 실패했습니다." },
      {
        status: backendRes.status,
        headers: retryAfter ? { "Retry-After": retryAfter } : undefined,
      },
    );
  }

  const { token, user } = data as { token: string; user: object };

  // httpOnly 쿠키로 JWT 설정
  const response = NextResponse.json({ user });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
