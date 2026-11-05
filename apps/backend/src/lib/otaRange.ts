/**
 * HTTP Range 헤더 해석 (OTA 파일 다운로드용).
 *
 * HMI(Quectel EC800G)는 AT+QHTTPGETEX 로 64KB 씩 `Range: bytes=start-end` 를 보낸다.
 * 여기서는 단일 범위만 지원한다. 여러 범위(`bytes=0-1,5-9`)나 읽을 수 없는 헤더는
 * RFC 9110 이 허용하는 대로 무시하고 파일 전체(200)를 준다.
 */
export type RangeResult =
  | { kind: "full" }
  | { kind: "partial"; start: number; end: number } // end 포함
  | { kind: "unsatisfiable" };

const RANGE_RE = /^bytes=(\d*)-(\d*)$/;

export const parseRange = (header: string | undefined, size: number): RangeResult => {
  if (!header) return { kind: "full" };
  const m = RANGE_RE.exec(header.trim());
  if (!m) return { kind: "full" };

  const [, a, b] = m;
  if (a === "" && b === "") return { kind: "full" };

  if (a === "") {
    // 접미 범위: 마지막 n 바이트
    const n = Number(b);
    if (n === 0 || size === 0) return { kind: "unsatisfiable" };
    return { kind: "partial", start: Math.max(0, size - n), end: size - 1 };
  }

  const start = Number(a);
  if (start >= size) return { kind: "unsatisfiable" };
  const end = b === "" ? size - 1 : Math.min(Number(b), size - 1);
  if (end < start) return { kind: "full" };
  return { kind: "partial", start, end };
};
