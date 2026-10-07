const RETRY_KEY = "pmcs_conn_retry";

let reloadStarted = false;

/** RSC 스트림이 중간에 끊기거나, 탭이 얼며 fetch가 죽은 경우. */
export function isTransientClientError(error: {
  message?: string;
  name?: string;
}): boolean {
  const message = `${error.name ?? ""} ${error.message ?? ""}`;
  return /connection closed|failed to fetch|fetch failed|network\s*error|load failed|chunkloaderror|loading chunk|failed to load chunk/i.test(
    message,
  );
}

/**
 * 같은 탭에서 한 번만 새로고침한다.
 * true면 새로고침을 시작했으므로 오류 화면을 그리지 않는다.
 */
export function reloadOnceForTransientError(): boolean {
  if (typeof window === "undefined") return false;
  if (reloadStarted) return true;
  try {
    if (sessionStorage.getItem(RETRY_KEY) === "1") return false;
    sessionStorage.setItem(RETRY_KEY, "1");
  } catch {
    return false;
  }
  reloadStarted = true;
  window.location.reload();
  return true;
}

/** 화면이 안정적으로 떠 있으면 다음 단절도 다시 한 번 복구할 수 있게 플래그를 지운다. */
export function clearTransientRetryFlag(): void {
  try {
    sessionStorage.removeItem(RETRY_KEY);
  } catch {
    /* ignore */
  }
}
