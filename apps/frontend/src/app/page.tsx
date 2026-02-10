import Link from "next/link";
import { fetchDevices } from "../lib/api";
import { Device } from "../types/device";
import DashboardAccordion from "../components/DashboardAccordion";


const now = () => new Date().toISOString();

// const mockDevices17: Device[] = [
//   { id: "site-seoul", name: "서울 테스트", location: "서울", status: "running", lastSeenAt: now(), numOfMods: 8, moduleStatus: Array(8).fill(2) },
//   { id: "site-busan", name: "부산 테스트", location: "부산", status: "running", lastSeenAt: now(), numOfMods: 8, moduleStatus: [2,2,2,2,2,2,2,2] },
//   { id: "site-daegu", name: "대구 테스트", location: "대구", status: "standby", lastSeenAt: now(), numOfMods: 8, moduleStatus: [2,2,2,1,1,2,2,2] },
//   { id: "site-incheon", name: "인천 테스트", location: "인천", status: "running", lastSeenAt: now(), numOfMods: 8, moduleStatus: [2,2,2,2,2,2,2,2] },
//   { id: "site-gwangju", name: "광주 테스트", location: "광주", status: "fault", lastSeenAt: now(), numOfMods: 8, moduleStatus: [2,2,3,2,2,2,2,2] },
//   { id: "site-daejeon", name: "대전 테스트", location: "대전", status: "running", lastSeenAt: now(), numOfMods: 6, moduleStatus: [2,2,2,2,2,2] },
//   { id: "site-ulsan", name: "울산 테스트", location: "울산", status: "running", lastSeenAt: now(), numOfMods: 6, moduleStatus: [2,2,2,2,2,2] },
//   { id: "site-sejong", name: "세종 테스트", location: "세종", status: "standby", lastSeenAt: now(), numOfMods: 6, moduleStatus: [2,1,1,2,2,2] },
//   { id: "site-gyeonggi", name: "경기도 테스트", location: "경기도", status: "running", lastSeenAt: now(), numOfMods: 10, moduleStatus: Array(10).fill(2) },
//   { id: "site-gangwon", name: "강원도 테스트", location: "강원도", status: "running", lastSeenAt: now(), numOfMods: 6, moduleStatus: [2,2,2,2,2,2] },
//   { id: "site-chungbuk", name: "충청북도 테스트", location: "충청북도", status: "running", lastSeenAt: now(), numOfMods: 6, moduleStatus: [2,2,2,2,2,2] },
//   { id: "site-chungnam", name: "충청남도 테스트", location: "충청남도", status: "standby", lastSeenAt: now(), numOfMods: 6, moduleStatus: [2,2,1,1,2,2] },
//   { id: "site-jeonbuk", name: "전북특별자치도 테스트", location: "전북특별자치도", status: "running", lastSeenAt: now(), numOfMods: 6, moduleStatus: [2,2,2,2,2,2] },
//   { id: "site-jeonnam", name: "전라남도 테스트", location: "전라남도", status: "running", lastSeenAt: now(), numOfMods: 6, moduleStatus: [2,2,2,2,2,2] },
//   { id: "site-gyeongbuk", name: "경상북도 테스트", location: "경상북도", status: "running", lastSeenAt: now(), numOfMods: 6, moduleStatus: [2,2,2,2,2,2] },
//   { id: "site-gyeongnam", name: "경상남도 테스트", location: "경상남도", status: "fault", lastSeenAt: now(), numOfMods: 6, moduleStatus: [2,3,2,2,2,2] },
//   { id: "site-jeju", name: "제주특별자치도 테스트", location: "제주특별자치도", status: "running", lastSeenAt: now(), numOfMods: 4, moduleStatus: [2,2,2,2] },
// ];
const knownRegions = [
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "경기도",
  "강원도",
  "충청북도",
  "충청남도",
  "전북특별자치도",
  "전라남도",
  "경상북도",
  "경상남도",
  "제주특별자치도",
];

const regionMarkers: Record<string, { top: string; left: string }> = {
  경기도: { top: "26%", left: "41.5%" },
  부산: { top: "68.5%", left: "79%" },
  대구: { top: "55%", left: "68%" },
  인천: { top: "24%", left: "28%" },
  광주: { top: "68.5%", left: "33.5%" },
  대전: { top: "48.5%", left: "47%" },
  울산: { top: "62%", left: "82%" },
  세종: { top: "42%", left: "47%" },
  서울: { top: "21.7%", left: "36.3%" },
  강원도: { top: "19.7%", left: "68%" },
  충청북도: { top: "33%", left: "57.5%" },
  충청남도: { top: "42%", left: "28%" },
  전북특별자치도: { top: "55%", left: "33.4%" },
  전라남도: { top: "75%", left: "31%" },
  경상북도: { top: "44%", left: "71%" },
  경상남도: { top: "64%", left: "65.5%" },
  제주특별자치도: { top: "96.5%", left: "25.2%" },
};
type HomePageProps = {
  searchParams?: { region?: string };
};
const extractRegion = (location?: string) => {
  if (!location) {
    return "기타";
  }
  const match = knownRegions.find((region) => location.includes(region));
  if (match) {
    return match;
  }
  return location.split(" ")[0] || "기타";
};

const toInt = (value?: number | string) => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};



type RegionStatus =
  | "running"
  | "standby"
  | "start"
  | "fault"
  | "offline";

const getRegionStatus = (
  summary: ReturnType<typeof summarizeStatus>
): RegionStatus => {
  if (summary.fault > 0) {
    return "fault";
  }

  if (summary.check > 0) {
    // check는 standby / start 계열로 본다
    return "standby";
  }

  return "running";
};


const summarizeStatus = (devices: Device[]) => {
  return devices.reduce(
    (acc, device) => {
      const totalMods =
        toInt(device.numOfMods) ??
        (device.moduleStatus ? device.moduleStatus.length : 0);
      const list = device.moduleStatus ?? [];
      const running = list.filter((code) => code === 2).length;
      const fault = list.filter((code) => code === 3).length;
      const check = list.filter((code) => code !== 2 && code !== 3).length;
      const missing = Math.max(0, totalMods - list.length);

      acc.total += totalMods;
      acc.ok += running;
      acc.fault += fault;
      acc.check += check + missing;
      return acc;
    },
    { total: 0, ok: 0, check: 0, fault: 0 },
  );
};



export default async function HomePage({ searchParams }: HomePageProps) {
  const devices = await fetchDevices();
  // const devices = mockDevices17;
  const regions = devices.reduce<Record<string, typeof devices>>(
    (acc, device) => {
      const key = extractRegion(device.location);
      acc[key] = acc[key] ? [...acc[key], device] : [device];
      return acc;
    },
    {},
  );
  const regionEntries = Object.entries(regions).sort(([a], [b]) =>
    a.localeCompare(b, "ko"),
  );
  const selectedRegion = searchParams?.region
    ? decodeURIComponent(searchParams.region)
    : undefined;

  return (
    <main>
      <section className="dashboard-map">
        <div className="map-panel panel">
          <div className="map-canvas">
            {regionEntries.map(([region, regionDevices]) => {
              const summary = summarizeStatus(regionDevices);
              const marker = regionMarkers[region];
              if (!marker) {
                return null;
              }
              return (
               
                <Link
                key={region}
                href={`/?region=${encodeURIComponent(region)}`}
                className={`map-marker ${getRegionStatus(summary)}`}
                style={{
                  top: marker.top,
                  left: marker.left,
                }}
                aria-label={`${region} 이동`}
              />
              

              );
            })}
          </div>
        </div>
        <div className="region-panel panel">
          <div className="region-panel-header">
            <span className="region-panel-subtitle">
              총 {devices.length}개 사이트
            </span>
          </div>
          <DashboardAccordion
            regionEntries={regionEntries}
            selectedRegion={selectedRegion}
          />
         
        </div>


      </section>
    </main>
  );
}
