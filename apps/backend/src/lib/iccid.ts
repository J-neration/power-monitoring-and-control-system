/** USIM ICCID 정규화 (공백·하이픈 제거). HMI 페이로드와 DB 저장 시 동일 규칙 사용 */
export const normalizeIccid = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[\s-]/g, "");
};

/**
 * 유심 케이스 19자리 vs 모뎀/HMI 20자리 상호 매칭용 exact 후보.
 * - 끝 1자리 Luhn 체크섬
 * - 또는 AT+CCID 등에서 붙는 trailing `F` 패딩
 */
export const iccidLookupCandidates = (normalized: string): string[] => {
  const n = normalizeIccid(normalized);
  if (!n) return [];
  const out = new Set<string>([n]);
  if (/^\d{20}$/.test(n)) out.add(n.slice(0, 19));
  if (/^\d{19}F$/i.test(n)) out.add(n.slice(0, 19));
  return [...out];
};

/** 관리자 등록 중복 검사용 OR 조건 조각 */
export const iccidConflictWhere = (norm: string) => {
  const candidates = iccidLookupCandidates(norm);
  const nineteen = /^\d{19}$/.test(norm) ? norm : null;
  return {
    OR: [
      { iccid: { in: candidates } },
      ...(nineteen
        ? [
            { iccid: { startsWith: nineteen } },
            { iccid: { equals: `${nineteen}F` } },
            { iccid: { equals: `${nineteen}f` } },
          ]
        : []),
    ],
  };
};

export type IccidMatchRow = {
  id: string;
  iccid: string | null;
  siteId: string;
};

/** unknown/lte 자동생성보다 현장관리에 등록한 설치지점을 우선 */
export const pickPreferredIccidMatch = <T extends IccidMatchRow>(
  rows: T[],
): T | null => {
  if (rows.length === 0) return null;
  const ranked = [...rows].sort((a, b) => {
    const aUnknown = a.siteId === "unknown" ? 1 : 0;
    const bUnknown = b.siteId === "unknown" ? 1 : 0;
    if (aUnknown !== bUnknown) return aUnknown - bUnknown;
    const aLte = a.id.startsWith("lte-") ? 1 : 0;
    const bLte = b.id.startsWith("lte-") ? 1 : 0;
    if (aLte !== bLte) return aLte - bLte;
    return a.id.localeCompare(b.id);
  });
  return ranked[0] ?? null;
};
