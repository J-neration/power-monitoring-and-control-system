export const CLIENT_LABELS: Record<string, string> = {
  lotte: "롯데건설",
  gs: "GS건설",
  hyundai: "현대건설",
  posco: "포스코이앤씨",
  prime: "프라임솔루션",
  datacenter: "데이터센터",
};

/** prime만 실제 현장 데이터. 나머지는 개발·시연용 테스트 데이터 */
export const isTestClient = (client: string) => client !== "prime";
