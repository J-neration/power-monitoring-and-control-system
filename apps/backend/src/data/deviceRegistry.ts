export type DeviceTelemetry = {
  lastSeenAt?: string;
  moduleStatus: number[];
  numOfMods: number;
  model?: "psta" | "paf" | "psvg";
  capacity?: 200 | 150;
  vL1?: number;
  vL2?: number;
  vL3?: number;
  gridCurrentL1?: number;
  gridCurrentL2?: number;
  gridCurrentL3?: number;
  loadCurrentL1?: number;
  loadCurrentL2?: number;
  loadCurrentL3?: number;
  loadCurrentTHDL1?: number;
  loadCurrentTHDL2?: number;
  loadCurrentTHDL3?: number;
  gridCurrentTHDL1?: number;
  gridCurrentTHDL2?: number;
  gridCurrentTHDL3?: number;
  tpf1?: number;
  tpf2?: number;
  dpf1?: number;
  dpf2?: number;
  uncompP?: number;
  compP?: number;
  uncompQ?: number;
  compQ?: number;
  uncompS?: number;
  compS?: number;
  uncompH?: number;
  compH?: number;
};

export type InstallationEntry = {
  id: string;
  label: string;
  device?: DeviceTelemetry;
};

export type SiteEntry = {
  siteId: string;
  name: string;
  client: string;
  region: string;
  address: string;
  installations: InstallationEntry[];
};

export const CLIENT_LABELS: Record<string, string> = {
  lotte: "롯데건설",
  gs: "GS건설",
  hyundai: "현대건설",
  posco: "포스코이앤씨",
  prime: "프라임솔루션",
};

export const siteRegistry: SiteEntry[] = [
  // ── 프라임솔루션 (자사 테스트) ──────────────────────────────────────────
  {
    siteId: "prime-rnd-lab",
    name: "프라임 R&D 연구소",
    client: "prime",
    region: "경기도",
    address: "경기도 안양시 동안구 시민대로 361",
    installations: [
      { id: "PSVG-RNDTEST5", label: "변전실", device: { moduleStatus: [], numOfMods: 0, model: "psvg", capacity: 200 } },
      { id: "PSVG-RNDTEST6", label: "전기실", device: { moduleStatus: [], numOfMods: 0, model: "psvg", capacity: 150 } },
    ],
  },

  // ── 롯데건설 ─────────────────────────────────────────────────────────────
  {
    siteId: "lotte-songdo-xi",
    name: "송도 크리스탈자이",
    client: "lotte",
    region: "인천",
    address: "인천광역시 연수구 송도동 24-5",
    installations: [
      {
        id: "PSVG-SONGDO01",
        label: "101동 변전실",
        device: {
          model: "psvg", capacity: 200,
          moduleStatus: [2, 2, 2, 2, 2, 2],
          numOfMods: 6,
          vL1: 220.3, vL2: 221.1, vL3: 219.8,
          gridCurrentL1: 48.2, gridCurrentL2: 47.9, gridCurrentL3: 48.5,
          loadCurrentL1: 45.1, loadCurrentL2: 44.8, loadCurrentL3: 45.3,
          loadCurrentTHDL1: 3.2, loadCurrentTHDL2: 3.5, loadCurrentTHDL3: 3.1,
          gridCurrentTHDL1: 2.1, gridCurrentTHDL2: 2.3, gridCurrentTHDL3: 2.0,
          tpf1: 84, tpf2: 97, dpf1: 85, dpf2: 98,
          uncompP: 32500, compP: 31800, uncompQ: 4200, compQ: 1100,
          uncompS: 38700, compS: 33200,
        },
      },
      {
        id: "PSVG-SONGDO02",
        label: "102동 전기실",
        device: {
          model: "psvg", capacity: 150,
          moduleStatus: [2, 2, 2, 2, 2, 2],
          numOfMods: 6,
          vL1: 219.8, vL2: 220.2, vL3: 219.5,
          gridCurrentL1: 35.1, gridCurrentL2: 34.8, gridCurrentL3: 35.4,
          loadCurrentL1: 32.4, loadCurrentL2: 32.0, loadCurrentL3: 32.7,
          loadCurrentTHDL1: 3.8, loadCurrentTHDL2: 4.1, loadCurrentTHDL3: 3.6,
          gridCurrentTHDL1: 2.5, gridCurrentTHDL2: 2.7, gridCurrentTHDL3: 2.4,
          tpf1: 82, tpf2: 96, dpf1: 83, dpf2: 97,
          uncompP: 22100, compP: 21600, uncompQ: 3500, compQ: 900,
          uncompS: 26800, compS: 22400,
        },
      },
      {
        id: "PSVG-SONGDO03",
        label: "지하주차장 전력실",
        device: {
          model: "paf", capacity: 200,
          moduleStatus: [2, 2, 1, 1, 2, 2],
          numOfMods: 6,
          vL1: 217.9, vL2: 218.4, vL3: 217.5,
          gridCurrentL1: 29.4, gridCurrentL2: 28.9, gridCurrentL3: 30.1,
          loadCurrentL1: 26.8, loadCurrentL2: 26.3, loadCurrentL3: 27.2,
          loadCurrentTHDL1: 5.1, loadCurrentTHDL2: 5.4, loadCurrentTHDL3: 4.9,
          gridCurrentTHDL1: 3.4, gridCurrentTHDL2: 3.7, gridCurrentTHDL3: 3.2,
          tpf1: 80, tpf2: 93, dpf1: 81, dpf2: 94,
          uncompP: 17200, compP: 16700, uncompQ: 4300, compQ: 1800,
          uncompS: 21900, compS: 18100,
        },
      },
    ],
  },
  {
    siteId: "lotte-haeundae-castle",
    name: "해운대 롯데캐슬",
    client: "lotte",
    region: "부산",
    address: "부산광역시 해운대구 마린시티로 38",
    installations: [
      {
        id: "PSVG-BUSAN01",
        label: "A동 변전실",
        device: {
          model: "psvg", capacity: 200,
          moduleStatus: [2, 2, 2, 2, 2, 2],
          numOfMods: 6,
          vL1: 221.0, vL2: 220.8, vL3: 221.3,
          gridCurrentL1: 52.1, gridCurrentL2: 51.8, gridCurrentL3: 52.4,
          loadCurrentL1: 49.2, loadCurrentL2: 48.9, loadCurrentL3: 49.5,
          loadCurrentTHDL1: 2.8, loadCurrentTHDL2: 3.0, loadCurrentTHDL3: 2.7,
          gridCurrentTHDL1: 1.9, gridCurrentTHDL2: 2.0, gridCurrentTHDL3: 1.8,
          tpf1: 86, tpf2: 98, dpf1: 87, dpf2: 99,
          uncompP: 34200, compP: 33600, uncompQ: 3800, compQ: 900,
          uncompS: 40100, compS: 34100,
        },
      },
      {
        id: "PSVG-BUSAN02",
        label: "B동 전기실",
        device: {
          model: "paf", capacity: 200,
          moduleStatus: [2, 3, 3, 2, 3, 2],
          numOfMods: 6,
          vL1: 213.1, vL2: 212.5, vL3: 214.0,
          gridCurrentL1: 74.8, gridCurrentL2: 73.9, gridCurrentL3: 75.2,
          loadCurrentL1: 70.1, loadCurrentL2: 69.4, loadCurrentL3: 70.8,
          loadCurrentTHDL1: 11.2, loadCurrentTHDL2: 11.8, loadCurrentTHDL3: 10.9,
          gridCurrentTHDL1: 8.1, gridCurrentTHDL2: 8.6, gridCurrentTHDL3: 7.9,
          tpf1: 72, tpf2: 86, dpf1: 73, dpf2: 87,
          uncompP: 54600, compP: 53200, uncompQ: 12400, compQ: 6100,
          uncompS: 67800, compS: 58100,
        },
      },
    ],
  },
  {
    siteId: "lotte-jamsil-castle",
    name: "잠실 롯데캐슬",
    client: "lotte",
    region: "서울",
    address: "서울특별시 송파구 올림픽로 300",
    installations: [
      {
        id: "PSVG-SEOUL01",
        label: "101동 변전실",
        device: {
          model: "psvg", capacity: 200,
          moduleStatus: [2, 2, 2, 2, 2, 2],
          numOfMods: 6,
          vL1: 220.8, vL2: 219.9, vL3: 220.5,
          gridCurrentL1: 44.3, gridCurrentL2: 43.8, gridCurrentL3: 44.6,
          loadCurrentL1: 41.5, loadCurrentL2: 41.1, loadCurrentL3: 41.8,
          loadCurrentTHDL1: 3.6, loadCurrentTHDL2: 3.9, loadCurrentTHDL3: 3.4,
          gridCurrentTHDL1: 2.4, gridCurrentTHDL2: 2.6, gridCurrentTHDL3: 2.3,
          tpf1: 83, tpf2: 96, dpf1: 84, dpf2: 97,
          uncompP: 28700, compP: 28100, uncompQ: 4100, compQ: 1200,
          uncompS: 34200, compS: 29000,
        },
      },
      {
        id: "PSVG-SEOUL02",
        label: "102동 전기실",
        device: {
          model: "psvg", capacity: 150,
          moduleStatus: [2, 2, 1, 1, 2, 2],
          numOfMods: 6,
          vL1: 219.2, vL2: 218.8, vL3: 219.5,
          gridCurrentL1: 31.4, gridCurrentL2: 30.9, gridCurrentL3: 31.7,
          loadCurrentL1: 28.6, loadCurrentL2: 28.2, loadCurrentL3: 29.0,
          loadCurrentTHDL1: 4.9, loadCurrentTHDL2: 5.2, loadCurrentTHDL3: 4.7,
          gridCurrentTHDL1: 3.2, gridCurrentTHDL2: 3.5, gridCurrentTHDL3: 3.1,
          tpf1: 81, tpf2: 95, dpf1: 82, dpf2: 96,
          uncompP: 18900, compP: 18400, uncompQ: 4600, compQ: 1700,
          uncompS: 23800, compS: 19400,
        },
      },
    ],
  },

  // ── GS건설 ───────────────────────────────────────────────────────────────
  {
    siteId: "gs-cheongna-xi",
    name: "청라 자이",
    client: "gs",
    region: "인천",
    address: "인천광역시 서구 청라동 162-1",
    installations: [
      {
        id: "PSVG-CHEONGNA01",
        label: "201동 변전실",
        device: {
          model: "psvg", capacity: 200,
          moduleStatus: [2, 2, 2, 2, 2, 2],
          numOfMods: 6,
          vL1: 220.1, vL2: 219.8, vL3: 220.4,
          gridCurrentL1: 41.5, gridCurrentL2: 41.0, gridCurrentL3: 41.8,
          loadCurrentL1: 38.9, loadCurrentL2: 38.5, loadCurrentL3: 39.2,
          loadCurrentTHDL1: 3.0, loadCurrentTHDL2: 3.3, loadCurrentTHDL3: 2.9,
          gridCurrentTHDL1: 2.0, gridCurrentTHDL2: 2.2, gridCurrentTHDL3: 1.9,
          tpf1: 85, tpf2: 97, dpf1: 86, dpf2: 98,
          uncompP: 25600, compP: 25000, uncompQ: 3500, compQ: 900,
          uncompS: 30200, compS: 25600,
        },
      },
      {
        id: "PSVG-CHEONGNA02",
        label: "지하 전력실",
        device: {
          model: "paf", capacity: 150,
          moduleStatus: [2, 1, 2, 1, 2, 2],
          numOfMods: 6,
          vL1: 217.3, vL2: 216.9, vL3: 217.8,
          gridCurrentL1: 27.6, gridCurrentL2: 27.1, gridCurrentL3: 28.0,
          loadCurrentL1: 24.9, loadCurrentL2: 24.5, loadCurrentL3: 25.3,
          loadCurrentTHDL1: 6.1, loadCurrentTHDL2: 6.5, loadCurrentTHDL3: 5.9,
          gridCurrentTHDL1: 4.1, gridCurrentTHDL2: 4.4, gridCurrentTHDL3: 3.9,
          tpf1: 78, tpf2: 92, dpf1: 79, dpf2: 93,
          uncompP: 14800, compP: 14300, uncompQ: 3900, compQ: 1600,
          uncompS: 19200, compS: 15500,
        },
      },
    ],
  },

  // ── 현대건설 ─────────────────────────────────────────────────────────────
  {
    siteId: "hyundai-daejeon-hillstate",
    name: "대전 힐스테이트",
    client: "hyundai",
    region: "대전",
    address: "대전광역시 유성구 테크노4로 17",
    installations: [
      {
        id: "PSVG-DAEJEON01",
        label: "1단지 변전실",
        device: {
          model: "psta", capacity: 200,
          moduleStatus: [2, 2, 1, 1, 2, 2],
          numOfMods: 6,
          vL1: 218.5, vL2: 219.2, vL3: 217.8,
          gridCurrentL1: 38.1, gridCurrentL2: 37.6, gridCurrentL3: 38.9,
          loadCurrentL1: 35.4, loadCurrentL2: 34.9, loadCurrentL3: 36.1,
          loadCurrentTHDL1: 5.8, loadCurrentTHDL2: 6.2, loadCurrentTHDL3: 5.5,
          gridCurrentTHDL1: 3.9, gridCurrentTHDL2: 4.1, gridCurrentTHDL3: 3.7,
          tpf1: 79, tpf2: 94, dpf1: 80, dpf2: 95,
          uncompP: 21800, compP: 21200, uncompQ: 5700, compQ: 2100,
          uncompS: 27500, compS: 22900,
        },
      },
      {
        id: "PSVG-DAEJEON02",
        label: "2단지 전기실",
        device: {
          model: "psvg", capacity: 200,
          moduleStatus: [2, 2, 2, 2, 2, 2],
          numOfMods: 6,
          vL1: 220.6, vL2: 220.1, vL3: 220.9,
          gridCurrentL1: 55.4, gridCurrentL2: 54.8, gridCurrentL3: 55.9,
          loadCurrentL1: 51.8, loadCurrentL2: 51.3, loadCurrentL3: 52.2,
          loadCurrentTHDL1: 2.9, loadCurrentTHDL2: 3.1, loadCurrentTHDL3: 2.8,
          gridCurrentTHDL1: 1.8, gridCurrentTHDL2: 2.0, gridCurrentTHDL3: 1.7,
          tpf1: 87, tpf2: 98, dpf1: 88, dpf2: 99,
          uncompP: 38100, compP: 37400, uncompQ: 3600, compQ: 850,
          uncompS: 44700, compS: 37900,
        },
      },
    ],
  },
  {
    siteId: "hyundai-gumi-hillstate",
    name: "구미 힐스테이트",
    client: "hyundai",
    region: "경상북도",
    address: "경상북도 구미시 산동면 첨단기업1로 10",
    installations: [
      {
        id: "PSVG-GUMI01",
        label: "A동 변전실",
        device: {
          model: "psvg", capacity: 200,
          moduleStatus: [2, 3, 3, 2, 2, 3],
          numOfMods: 6,
          vL1: 215.2, vL2: 214.8, vL3: 216.1,
          gridCurrentL1: 62.3, gridCurrentL2: 61.8, gridCurrentL3: 63.1,
          loadCurrentL1: 58.7, loadCurrentL2: 57.9, loadCurrentL3: 59.4,
          loadCurrentTHDL1: 8.9, loadCurrentTHDL2: 9.4, loadCurrentTHDL3: 8.6,
          gridCurrentTHDL1: 6.2, gridCurrentTHDL2: 6.8, gridCurrentTHDL3: 6.0,
          tpf1: 76, tpf2: 89, dpf1: 77, dpf2: 90,
          uncompP: 43200, compP: 42100, uncompQ: 8900, compQ: 4200,
          uncompS: 52600, compS: 45800,
        },
      },
      {
        id: "PSVG-GUMI02",
        label: "B동 전기실",
        device: {
          model: "paf", capacity: 200,
          moduleStatus: [2, 2, 2, 2, 2, 2],
          numOfMods: 6,
          vL1: 220.6, vL2: 220.1, vL3: 220.9,
          gridCurrentL1: 55.4, gridCurrentL2: 54.8, gridCurrentL3: 55.9,
          loadCurrentL1: 51.8, loadCurrentL2: 51.3, loadCurrentL3: 52.2,
          loadCurrentTHDL1: 2.9, loadCurrentTHDL2: 3.1, loadCurrentTHDL3: 2.8,
          gridCurrentTHDL1: 1.8, gridCurrentTHDL2: 2.0, gridCurrentTHDL3: 1.7,
          tpf1: 87, tpf2: 98, dpf1: 88, dpf2: 99,
          uncompP: 38100, compP: 37400, uncompQ: 3600, compQ: 850,
          uncompS: 44700, compS: 37900,
        },
      },
      {
        id: "PSVG-GUMI03",
        label: "지하주차장 전력실",
        device: {
          model: "psvg", capacity: 150,
          moduleStatus: [2, 2, 1, 2, 1, 2],
          numOfMods: 6,
          vL1: 218.0, vL2: 217.6, vL3: 218.5,
          gridCurrentL1: 33.2, gridCurrentL2: 32.7, gridCurrentL3: 33.8,
          loadCurrentL1: 30.5, loadCurrentL2: 30.1, loadCurrentL3: 31.0,
          loadCurrentTHDL1: 4.7, loadCurrentTHDL2: 5.0, loadCurrentTHDL3: 4.5,
          gridCurrentTHDL1: 3.1, gridCurrentTHDL2: 3.4, gridCurrentTHDL3: 3.0,
          tpf1: 82, tpf2: 95, dpf1: 83, dpf2: 96,
          uncompP: 19400, compP: 18900, uncompQ: 4200, compQ: 1500,
          uncompS: 24300, compS: 19800,
        },
      },
    ],
  },

  // ── 포스코이앤씨 ─────────────────────────────────────────────────────────
  {
    siteId: "posco-dongtan-sharp",
    name: "동탄 더샵",
    client: "posco",
    region: "경기도",
    address: "경기도 화성시 동탄대로 520",
    installations: [
      {
        id: "PSVG-DONGTAN01",
        label: "1단지 변전실",
        device: {
          model: "psvg", capacity: 200,
          moduleStatus: [2, 2, 2, 2, 2, 2],
          numOfMods: 6,
          vL1: 220.4, vL2: 220.0, vL3: 220.7,
          gridCurrentL1: 46.8, gridCurrentL2: 46.3, gridCurrentL3: 47.1,
          loadCurrentL1: 43.5, loadCurrentL2: 43.1, loadCurrentL3: 43.9,
          loadCurrentTHDL1: 3.4, loadCurrentTHDL2: 3.7, loadCurrentTHDL3: 3.2,
          gridCurrentTHDL1: 2.2, gridCurrentTHDL2: 2.4, gridCurrentTHDL3: 2.1,
          tpf1: 84, tpf2: 97, dpf1: 85, dpf2: 98,
          uncompP: 30200, compP: 29600, uncompQ: 3900, compQ: 1000,
          uncompS: 36100, compS: 30400,
        },
      },
      {
        id: "PSVG-DONGTAN02",
        label: "2단지 전기실",
        device: {
          model: "psta", capacity: 150,
          moduleStatus: [2, 3, 3, 2, 3, 2],
          numOfMods: 6,
          vL1: 212.4, vL2: 211.8, vL3: 213.0,
          gridCurrentL1: 56.1, gridCurrentL2: 55.4, gridCurrentL3: 56.8,
          loadCurrentL1: 52.3, loadCurrentL2: 51.7, loadCurrentL3: 53.0,
          loadCurrentTHDL1: 10.1, loadCurrentTHDL2: 10.7, loadCurrentTHDL3: 9.8,
          gridCurrentTHDL1: 7.2, gridCurrentTHDL2: 7.8, gridCurrentTHDL3: 7.0,
          tpf1: 74, tpf2: 87, dpf1: 75, dpf2: 88,
          uncompP: 37800, compP: 36900, uncompQ: 9800, compQ: 5100,
          uncompS: 47200, compS: 40300,
        },
      },
    ],
  },
];
