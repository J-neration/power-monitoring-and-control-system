import Link from "next/link";
import { fetchSites } from "../lib/api";
import type { Site } from "../types/site";
import DashboardAccordion from "../components/DashboardAccordion";

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
  summary: ReturnType<typeof summarizeStatus>,
): RegionStatus => {
  if (summary.fault > 0) return "fault";
  if (summary.standby > 0) return "standby";
  return "running";
};


const summarizeStatus = (installations: Site["installations"]) => {
  return installations.reduce(
    (acc, inst) => {
      const device = inst.device;
      if (!device) {
        acc.offline += 1;
        return acc;
      }

      const list = device.moduleStatus ?? [];
      const running = list.filter((c) => c === 2).length;
      const fault = list.filter((c) => c === 3).length;
      const check = list.filter((c) => c !== 2 && c !== 3).length;

      acc.running += running;
      acc.fault += fault;
      acc.standby += check;
      return acc;
    },
    { running: 0, standby: 0, start: 0, fault: 0, offline: 0 },
  );
};




export default async function HomePage({ searchParams }: HomePageProps) {
  const sites = await fetchSites();

  const regions = sites.reduce<Record<string, Site[]>>((acc, site) => {
    const key = site.region || "기타";
    acc[key] = acc[key] ? [...acc[key], site] : [site];
    return acc;
  }, {});
  
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
            {regionEntries.map(([region, regionSites]) => {
              const summary = summarizeStatus(
                regionSites.flatMap((s) => s.installations),
              );

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
              총 {regionEntries.length}개 지역
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
