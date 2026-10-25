import { NextRequest, NextResponse } from "next/server";
import { serverApiBase } from "../../../../../lib/serverApiBase";

const API_BASE = serverApiBase();

type RouteContext = { params: { id: string } };

export async function GET(request: NextRequest, context: RouteContext) {
  const token = request.cookies.get("pmcs_token")?.value;
  if (!token) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  const id = decodeURIComponent(context.params.id);
  const query = request.nextUrl.searchParams.toString();
  const res = await fetchHistory(API_BASE, id, query, token);
  const finalRes = await localHistoryFallback(res, id, query, token);

  const data = await finalRes.json().catch(() => ({ message: "이력 조회에 실패했습니다." }));
  return NextResponse.json(data, { status: finalRes.status });
}

function fetchHistory(base: string, id: string, query: string, token: string) {
  return fetch(`${base}/devices/${encodeURIComponent(id)}/history${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}

/**
 * 로컬 화면은 Railway 개발 API를 보지만, 이력 라우트는 아직 그 서버에 없다.
 * 404이면 같은 개발 DB를 보는 로컬 API로 한 번 더 묻는다.
 */
async function localHistoryFallback(res: Response, id: string, query: string, token: string) {
  const local = "http://127.0.0.1:4000";
  const remote = API_BASE.replace(/\/$/, "");
  if (res.status !== 404 || process.env.NODE_ENV === "production") return res;
  if (remote === local || remote === "http://localhost:4000") return res;
  try {
    const localRes = await fetchHistory(local, id, query, token);
    if (localRes.status !== 404) return localRes;
  } catch {
    return res;
  }
  return res;
}
