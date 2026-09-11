import type { TelemetryReading } from "../types/site";

/** 테스트용: 경기도 AYG1 1호기 이력 탭에 항상 24시간 그래프를 보여준다. */
export const DEMO_HISTORY_INSTALLATION_ID = "PSVG-CPN-AYG1-01";

const INTERVAL_MINUTES = 15;
const TOTAL_POINTS = 96; // 24시간

const BASE = {
  moduleStatus: [2, 2, 2, 2, 2, 2],
  numOfMods: 6,
  vL1: 220.4,
  vL2: 219.9,
  vL3: 220.7,
  gridCurrentL1: 62.8,
  gridCurrentL2: 62.2,
  gridCurrentL3: 63.5,
  loadCurrentL1: 66.4,
  loadCurrentL2: 65.8,
  loadCurrentL3: 67.1,
  loadCurrentTHDL1: 26.2,
  loadCurrentTHDL2: 26.6,
  loadCurrentTHDL3: 25.9,
  gridCurrentTHDL1: 1.6,
  gridCurrentTHDL2: 1.7,
  gridCurrentTHDL3: 1.6,
  tpf1: 78,
  tpf2: 99,
  dpf1: 80,
  dpf2: 99,
  uncompP: 88,
  compP: 87,
  uncompQ: 74,
  compQ: 13,
  uncompS: 96,
  compS: 75,
  uncompH: 61,
  compH: 6,
  capacity: 200,
};

function round(v: number, decimals = 2) {
  return Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function wave(hour: number, phase: number, amp: number) {
  return 1 + amp * Math.sin((hour / 24) * 2 * Math.PI + phase);
}

/** 야간 저부하 ~ 오후 피크 */
function loadFactor(hour: number) {
  if (hour >= 0 && hour < 6) return 0.58;
  if (hour >= 6 && hour < 9) return 0.72 + (hour - 6) * 0.08;
  if (hour >= 9 && hour < 12) return 0.96;
  if (hour >= 12 && hour < 15) return 1.08;
  if (hour >= 15 && hour < 18) return 1.0;
  if (hour >= 18 && hour < 22) return 0.86 - (hour - 18) * 0.03;
  return 0.65;
}

export function buildDemoHistoryReadings(
  installationId: string,
  now = Date.now(),
): TelemetryReading[] {
  const phase = (installationId.charCodeAt(installationId.length - 1) % 10) * 0.628;
  const readings: TelemetryReading[] = [];

  for (let i = 0; i < TOTAL_POINTS; i++) {
    const minutesAgo = (TOTAL_POINTS - 1 - i) * INTERVAL_MINUTES;
    const recordedAt = new Date(now - minutesAgo * 60 * 1000);
    const h = recordedAt.getHours() + recordedAt.getMinutes() / 60;
    const lf = loadFactor(h);

    const wV = wave(h, phase, 0.008);
    const wI = wave(h, phase + 1.0, 0.05) * lf;
    const wTHD = wave(h, phase + 2.0, 0.1) * (0.85 + 0.2 * lf);
    const wPF = wave(h, phase + 0.5, 0.02);

    const diurnal = 0.92 + 0.12 * lf;
    const wTemp = wave(h, phase + 3.0, 0.05) * diurnal;
    const opCap = round(clamp(BASE.capacity * (0.55 + 0.38 * lf), 80, 190), 1);
    const rpCap = round(opCap * clamp(0.62 + 0.22 * lf, 0.45, 0.92), 1);

    readings.push({
      id: `demo-${installationId}-${i}`,
      installationId,
      recordedAt: recordedAt.toISOString(),
      moduleStatus: BASE.moduleStatus,
      numOfMods: BASE.numOfMods,
      vL1: round(BASE.vL1 * wV),
      vL2: round(BASE.vL2 * wV),
      vL3: round(BASE.vL3 * wV),
      gridCurrentL1: round(BASE.gridCurrentL1 * wI),
      gridCurrentL2: round(BASE.gridCurrentL2 * wI),
      gridCurrentL3: round(BASE.gridCurrentL3 * wI),
      loadCurrentL1: round(BASE.loadCurrentL1 * wI),
      loadCurrentL2: round(BASE.loadCurrentL2 * wI),
      loadCurrentL3: round(BASE.loadCurrentL3 * wI),
      loadCurrentTHDL1: round(BASE.loadCurrentTHDL1 * wTHD),
      loadCurrentTHDL2: round(BASE.loadCurrentTHDL2 * wTHD),
      loadCurrentTHDL3: round(BASE.loadCurrentTHDL3 * wTHD),
      gridCurrentTHDL1: round(BASE.gridCurrentTHDL1 * wTHD),
      gridCurrentTHDL2: round(BASE.gridCurrentTHDL2 * wTHD),
      gridCurrentTHDL3: round(BASE.gridCurrentTHDL3 * wTHD),
      tpf1: clamp(round(BASE.tpf1 * wPF, 1), 55, 99),
      tpf2: clamp(round(BASE.tpf2 * wPF, 1), 90, 100),
      dpf1: clamp(round(BASE.dpf1 * wPF, 1), 55, 99),
      dpf2: clamp(round(BASE.dpf2 * wPF, 1), 90, 100),
      uncompP: round(BASE.uncompP * wI, 0),
      compP: round(BASE.compP * wI, 0),
      uncompQ: round(BASE.uncompQ * wI, 0),
      compQ: round(BASE.compQ * wI, 0),
      uncompS: round(BASE.uncompS * wI, 0),
      compS: round(BASE.compS * wI, 0),
      uncompH: round(BASE.uncompH * wI, 0),
      compH: round(BASE.compH * wI, 0),
      areaTemp: [32.4, 34.8, 33.6, 31.8].map((b) => round(b * wTemp, 1)),
      moduleTemp: [38, 42, 40, 37, 41, 39].map((b) => round(b * wTemp, 1)),
      fanSpeed: [7.2, 8.6].map((b) => round(b * (0.85 + 0.25 * lf), 1)),
      totalCapacity: BASE.capacity,
      operatingCapacity: opCap,
      reactivePowerCapacity: rpCap,
      availableMargin: round(BASE.capacity - opCap, 1),
    });
  }

  return readings;
}
