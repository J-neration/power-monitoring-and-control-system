const ICCID_NAME = /^\d{19,20}$/;

/** 목록에 보여줄 짧은 이름. ICCID 전체인 경우에만 뒷 6자리. */
export function formatIccidListName(name: string): {
  text: string;
  title: string;
} {
  const compact = name.trim().replace(/[\s-]/g, "");
  if (!ICCID_NAME.test(compact)) {
    return { text: name, title: name };
  }
  return { text: `…${compact.slice(-6)}`, title: compact };
}
