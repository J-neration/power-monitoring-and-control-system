/** 계정별 로그인 실패 제한. Next BFF를 거치면 백엔드 IP가 Netlify로 뭉개지므로 username 기준이 맞다. */
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

type Bucket = { failures: number; windowStart: number };

const buckets = new Map<string, Bucket>();
let nowFn = () => Date.now();

const normalizeUsername = (username: string) => username.trim().toLowerCase();

export class LoginLockedError extends Error {
  readonly retryAfterSec: number;

  constructor(retryAfterSec: number) {
    const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
    super(`로그인 시도가 너무 많습니다. ${minutes}분 후 다시 시도해 주세요.`);
    this.name = "LoginLockedError";
    this.retryAfterSec = retryAfterSec;
  }
}

const remainingSec = (bucket: Bucket): number => {
  const left = bucket.windowStart + LOGIN_WINDOW_MS - nowFn();
  return Math.max(1, Math.ceil(left / 1000));
};

export const getLoginLock = (
  username: string,
): { locked: true; retryAfterSec: number } | { locked: false } => {
  const key = normalizeUsername(username);
  if (!key) return { locked: false };

  const bucket = buckets.get(key);
  if (!bucket) return { locked: false };

  if (nowFn() - bucket.windowStart >= LOGIN_WINDOW_MS) {
    buckets.delete(key);
    return { locked: false };
  }

  if (bucket.failures >= LOGIN_MAX_FAILURES) {
    return { locked: true, retryAfterSec: remainingSec(bucket) };
  }
  return { locked: false };
};

export const assertNotLocked = (username: string): void => {
  const lock = getLoginLock(username);
  if (lock.locked) throw new LoginLockedError(lock.retryAfterSec);
};

export const recordLoginFailure = (
  username: string,
): { locked: boolean; retryAfterSec: number } => {
  const key = normalizeUsername(username);
  if (!key) return { locked: false, retryAfterSec: 0 };

  const now = nowFn();
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= LOGIN_WINDOW_MS) {
    bucket = { failures: 1, windowStart: now };
    buckets.set(key, bucket);
  } else {
    bucket.failures += 1;
  }

  if (bucket.failures >= LOGIN_MAX_FAILURES) {
    return { locked: true, retryAfterSec: remainingSec(bucket) };
  }
  return { locked: false, retryAfterSec: 0 };
};

export const clearLoginFailures = (username: string): void => {
  buckets.delete(normalizeUsername(username));
};

export const _resetLoginThrottleForTests = (): void => {
  buckets.clear();
  nowFn = () => Date.now();
};

export const _setNowForTests = (fn: () => number): void => {
  nowFn = fn;
};
