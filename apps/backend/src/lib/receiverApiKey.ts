import { timingSafeEqual } from "node:crypto";

export type ReceiverKeyVersion = "current" | "previous";

const sameKey = (provided: Buffer, key: string) => {
  const expected = Buffer.from(key);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
};

/**
 * HMI 가 보낸 x-api-key 가 지금 키인지, 교체 중에 함께 받는 예전 키인지 판별한다. 둘 다 아니면 null.
 * 키를 바꿀 때는 예전 키를 RECEIVER_API_KEY_PREVIOUS 로 옮겨, 현장 HMI 를 다시 구울 때까지 둘 다 받는다.
 */
export const matchReceiverApiKey = (
  provided: unknown,
  current: string,
  previous?: string,
): ReceiverKeyVersion | null => {
  if (typeof provided !== "string" || provided.length === 0) return null;
  const given = Buffer.from(provided);
  if (sameKey(given, current)) return "current";
  if (previous && sameKey(given, previous)) return "previous";
  return null;
};
