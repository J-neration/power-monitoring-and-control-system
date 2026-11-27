/** 고조파 전송(1시간 주기·refreshHarmonics 명령)을 지원하는 최소 HMI 펌웨어 버전 */
export const HARMONICS_MIN_FW = "2.5.1";

/** "v2.5.1" / "2.5.1" → [2, 5, 1]. 숫자 버전이 아니면 null. */
function parseFw(fw: string): number[] | null {
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i.exec(fw.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
}

/**
 * 이 펌웨어가 고조파를 보낼 수 있는가.
 * true = v2.5.1 이상, false = 그보다 낮음, null = 버전을 모름(아직 보고 안 됨 등).
 */
export function harmonicsSupported(fwVersion: string | null | undefined): boolean | null {
  if (!fwVersion) return null;
  const cur = parseFw(fwVersion);
  const min = parseFw(HARMONICS_MIN_FW);
  if (!cur || !min) return null;
  for (let i = 0; i < 3; i++) {
    if (cur[i] !== min[i]) return cur[i] > min[i];
  }
  return true;
}

/** 지원하지 않는 펌웨어일 때 빈 화면에 보여 줄 문구 */
export const harmonicsUnsupportedText = (fwVersion: string | null | undefined) =>
  `펌웨어 v${HARMONICS_MIN_FW} 이상에서 지원${fwVersion ? ` (현재 v${fwVersion.replace(/^v/i, "")})` : ""}`;
