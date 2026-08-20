"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
  Marker,
} from "react-simple-maps";
import type { MouseEvent } from "react";
import type { Site } from "../../types/site";
import type { DeviceStatus } from "../../types/site";
import { STATUS_LABEL, STATUS_PRIORITY } from "../../lib/deviceStatus";

const GEO_URL = "/korea-provinces.json";

const GEO_TO_REGION: Record<string, string> = {
  서울특별시: "서울",
  부산광역시: "부산",
  대구광역시: "대구",
  인천광역시: "인천",
  광주광역시: "광주",
  대전광역시: "대전",
  울산광역시: "울산",
  세종특별자치시: "세종",
  경기도: "경기도",
  강원도: "강원도",
  강원특별자치도: "강원도",
  충청북도: "충청북도",
  충청남도: "충청남도",
  전라북도: "전북특별자치도",
  전북특별자치도: "전북특별자치도",
  전라남도: "전라남도",
  경상북도: "경상북도",
  경상남도: "경상남도",
  제주특별자치도: "제주특별자치도",
};

type StatusStyle = { active: string; selected: string; stroke: string };

const STATUS_STYLE: Record<DeviceStatus, StatusStyle> = {
  running: { active: "#0a2e14", selected: "#0f4520", stroke: "#5ee986" },
  standby: { active: "#2a1e00", selected: "#3d2c00", stroke: "#fcd34d" },
  start: { active: "#2a1e00", selected: "#3d2c00", stroke: "#fcd34d" },
  fault: { active: "#2d0a0a", selected: "#3f0e0e", stroke: "#f87171" },
  offline: { active: "#161e2c", selected: "#1e2840", stroke: "#9ca3af" },
};

function lerpColor(a: string, b: string, t: number): string {
  const pa = [
    parseInt(a.slice(1, 3), 16),
    parseInt(a.slice(3, 5), 16),
    parseInt(a.slice(5, 7), 16),
  ];
  const pb = [
    parseInt(b.slice(1, 3), 16),
    parseInt(b.slice(3, 5), 16),
    parseInt(b.slice(5, 7), 16),
  ];
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

function regionHealthColors(stats: RegionStats): {
  fill: string;
  fillSelected: string;
  stroke: string;
} {
  const { total, counts } = stats;
  if (total === 0)
    return { fill: "#161e2c", fillSelected: "#1e2840", stroke: "#9ca3af" };

  const okRatio = (counts.running ?? 0) / total;
  const faultRatio = (counts.fault ?? 0) / total;
  const standbyRatio =
    ((counts.standby ?? 0) + (counts.start ?? 0)) / total;
  const offlineRatio = (counts.offline ?? 0) / total;

  // 100% running → green, any fault → red blend
  if (faultRatio > 0) {
    const fill = lerpColor("#0a2e14", "#2d0a0a", Math.min(faultRatio * 3, 1));
    const fillSel = lerpColor(
      "#0f4520",
      "#3f0e0e",
      Math.min(faultRatio * 3, 1),
    );
    const stroke = lerpColor(
      "#5ee986",
      "#f87171",
      Math.min(faultRatio * 2.5, 1),
    );
    return { fill, fillSelected: fillSel, stroke };
  }
  if (okRatio >= 0.8)
    return { fill: "#0a2e14", fillSelected: "#0f4520", stroke: "#5ee986" };
  if (okRatio >= 0.5) {
    const fill = lerpColor("#0a2e14", "#2a1e00", 1 - okRatio);
    const fillSel = lerpColor("#0f4520", "#3d2c00", 1 - okRatio);
    const stroke = lerpColor("#5ee986", "#fcd34d", 1 - okRatio);
    return { fill, fillSelected: fillSel, stroke };
  }
  // 가동 절반 미만: 오프라인이 대기보다 많으면 회색, 아니면 노랑
  if (offlineRatio >= standbyRatio) {
    return { fill: "#161e2c", fillSelected: "#1e2840", stroke: "#9ca3af" };
  }
  return { fill: "#2a1e00", fillSelected: "#3d2c00", stroke: "#fcd34d" };
}

const STATUS_DOT: Record<DeviceStatus, string> = {
  running: "#34C759",
  standby: "#F59E0B",
  start: "#F59E0B",
  fault: "#EF4444",
  offline: "#4B5563",
};

type SiteMarker = {
  siteId: string;
  siteName: string;
  instCount: number;
  firstInstId: string;
  coordinates: [number, number];
  status: DeviceStatus;
};

type MarkerCluster = {
  id: string;
  center: [number, number];
  members: SiteMarker[];
  status: DeviceStatus;
};

function worstStatus(members: SiteMarker[]): DeviceStatus {
  let worst: DeviceStatus = "running";
  for (const m of members) {
    if (STATUS_PRIORITY[m.status] > STATUS_PRIORITY[worst]) worst = m.status;
  }
  return worst;
}

function clusterMarkers(markers: SiteMarker[], zoom: number): MarkerCluster[] {
  const cell = 0.09 / Math.max(zoom, 1);
  const buckets = new Map<string, SiteMarker[]>();
  for (const m of markers) {
    const [lng, lat] = m.coordinates;
    const key = `${Math.round(lng / cell)}_${Math.round(lat / cell)}`;
    const arr = buckets.get(key) ?? [];
    arr.push(m);
    buckets.set(key, arr);
  }
  return [...buckets.values()].map((members) => {
    const lng =
      members.reduce((sum, m) => sum + m.coordinates[0], 0) / members.length;
    const lat =
      members.reduce((sum, m) => sum + m.coordinates[1], 0) / members.length;
    return {
      id: members
        .map((m) => m.siteId)
        .sort()
        .join("|"),
      center: [lng, lat] as [number, number],
      members,
      status: worstStatus(members),
    };
  });
}

function spiderfyOffsets(
  center: [number, number],
  count: number,
  zoom: number,
): [number, number][] {
  if (count <= 1) return [center];
  const radius = (0.15 + 0.028 * count) / Math.max(zoom, 1);
  const latScale = Math.cos((center[1] * Math.PI) / 180) || 1;
  return Array.from({ length: count }, (_, i) => {
    const a = (2 * Math.PI * i) / count - Math.PI / 2;
    return [
      center[0] + (radius * Math.cos(a)) / latScale,
      center[1] + radius * Math.sin(a),
    ];
  });
}

const CITY_COORDS: Record<string, [number, number]> = {
  // 광역시/특별시 구 단위
  송파구: [127.11, 37.51],
  강남구: [127.05, 37.5],
  종로구: [126.98, 37.57],
  마포구: [126.9, 37.55],
  서초구: [127.01, 37.48],
  양재동: [127.04, 37.47],
  동안구: [126.95, 37.39],
  분당구: [127.12, 37.41],
  야탑동: [127.13, 37.41],
  영등포구: [126.9, 37.52],
  해운대구: [129.16, 35.16],
  마린시티: [129.14, 35.15],
  센텀중앙로: [129.13, 35.17],
  사하구: [128.97, 35.1],
  수영구: [129.11, 35.15],
  연수구: [126.68, 37.41],
  송도동: [126.66, 37.39],
  테크노파크로: [126.70, 37.42],
  남동구: [126.73, 37.45],
  상암동: [126.88, 37.58],
  신수로: [126.92, 37.54],
  유성구: [127.34, 36.36],
  "테크노4로 77": [127.38, 36.38],
  "테크노4로 17": [127.32, 36.34],
  수성구: [128.63, 35.85],
  달서구: [128.53, 35.83],
  // 경기도 시 단위
  안양시: [126.92, 37.40],
  수원시: [127.0, 37.26],
  성남시: [127.13, 37.42],
  화성시: [127.10, 37.18],
  동탄: [127.07, 37.20],
  용인시: [127.18, 37.24],
  고양시: [126.77, 37.66],
  일산: [126.77, 37.68],
  평택시: [127.09, 36.99],
  파주시: [126.78, 37.76],
  김포시: [126.72, 37.62],
  시흥시: [126.8, 37.38],
  광명시: [126.87, 37.47],
  광주시: [127.26, 37.43],
  하남시: [127.21, 37.54],
  // 경상북도 시 단위
  구미시: [128.34, 36.12],
  포항시: [129.34, 36.02],
  경주시: [129.23, 35.86],
  안동시: [128.73, 36.57],
  김천시: [128.11, 36.12],
  영주시: [128.74, 36.81],
  // 경상남도
  창원시: [128.68, 35.23],
  진주시: [128.08, 35.18],
  김해시: [128.89, 35.23],
  // 충청북도
  청주시: [127.49, 36.64],
  충주시: [127.93, 36.99],
  제천시: [128.19, 37.13],
  // 충청남도
  천안시: [127.15, 36.82],
  아산시: [127.0, 36.79],
  서산시: [126.45, 36.78],
  // 전북특별자치도
  전주시: [127.15, 35.82],
  익산시: [126.95, 35.95],
  군산시: [126.74, 35.97],
  // 전라남도
  여수시: [127.66, 34.76],
  순천시: [127.49, 34.95],
  목포시: [126.39, 34.81],
  // 강원도
  춘천시: [127.73, 37.88],
  원주시: [127.92, 37.34],
  강릉시: [128.9, 37.75],
  // 제주
  제주시: [126.53, 33.51],
  서귀포시: [126.56, 33.25],
  // 광역시 폴백 (구 매칭 실패 시)
  서울: [127.0, 37.56],
  부산: [129.08, 35.18],
  대구: [128.6, 35.87],
  인천: [126.7, 37.46],
  광주: [126.85, 35.16],
  대전: [127.38, 36.35],
  울산: [129.31, 35.54],
  세종: [127.0, 36.48],
  // 도 폴백
  경기도: [127.05, 37.28],
  강원도: [128.2, 37.75],
  충청북도: [127.7, 36.64],
  충청남도: [126.8, 36.52],
  전북특별자치도: [127.1, 35.82],
  전라남도: [126.95, 34.82],
  경상북도: [128.73, 36.07],
  경상남도: [128.25, 35.24],
  제주특별자치도: [126.57, 33.38],
};

// 남구/북구/서구/동구/중구는 여러 도시에 있어서 지역별로만 매칭한다.
const REGION_DISTRICT_COORDS: Record<string, Record<string, [number, number]>> =
  {
    서울: { 중구: [126.997, 37.564] },
    부산: {
      중구: [129.034, 35.106],
      서구: [129.024, 35.098],
      동구: [129.047, 35.129],
      남구: [129.084, 35.136],
      북구: [129.011, 35.198],
    },
    대구: {
      중구: [128.608, 35.869],
      동구: [128.635, 35.887],
      서구: [128.559, 35.872],
      남구: [128.598, 35.846],
      북구: [128.583, 35.886],
    },
    인천: {
      중구: [126.618, 37.474],
      동구: [126.643, 37.474],
      서구: [126.676, 37.545],
    },
    광주: {
      동구: [126.923, 35.146],
      서구: [126.89, 35.152],
      남구: [126.903, 35.133],
      북구: [126.882, 35.174],
      광산구: [126.793, 35.14],
    },
    대전: {
      동구: [127.455, 36.329],
      중구: [127.421, 36.325],
      서구: [127.384, 36.355],
      대덕구: [127.416, 36.347],
    },
    울산: {
      중구: [129.333, 35.569],
      남구: [129.33, 35.544],
      동구: [129.417, 35.505],
      북구: [129.361, 35.582],
      울주군: [129.242, 35.522],
    },
  };

const METRO_FALLBACKS = new Set([
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
]);

function matchLongestKey(
  address: string,
  table: Record<string, [number, number]>,
): [number, number] | null {
  const keys = Object.keys(table).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (address.includes(key)) return table[key];
  }
  return null;
}

function resolveCoords(
  address: string,
  region: string,
): [number, number] | null {
  const districtHit = matchLongestKey(
    address,
    REGION_DISTRICT_COORDS[region] ?? {},
  );
  if (districtHit) return districtHit;

  const parts = address
    .replace(/특별시|광역시|특별자치시|특별자치도/g, "")
    .split(/\s+/);
  const allKeys = Object.keys(CITY_COORDS).sort(
    (a, b) => b.length - a.length,
  );
  for (const key of allKeys) {
    if (!address.includes(key)) continue;
    if (METRO_FALLBACKS.has(key) && region !== key) continue;
    return CITY_COORDS[key];
  }
  for (const part of parts) {
    if (CITY_COORDS[part]) return CITY_COORDS[part];
  }
  return CITY_COORDS[region] ?? null;
}

const INITIAL_CENTER: [number, number] = [127.8, 36.45];
const INITIAL_ZOOM = 1.4;
const ZOOM_STEP = 1.6;
const MIN_ZOOM = 1;
const MAX_ZOOM = 10;

type RegionStats = {
  majority: DeviceStatus;
  hasFault: boolean;
  total: number;
  counts: Record<DeviceStatus, number>;
  sites: Site[];
};

type Props = {
  allSites: Site[];
  selectedSiteId: string;
  deriveSiteStatus: (site: Site) => DeviceStatus;
  onSelect: (siteId: string) => void;
  onSelectRegion?: (region: string, siteId?: string) => void;
};

type Tooltip = { lines: string[]; x: number; y: number };

export default function KoreaMap({
  allSites,
  selectedSiteId,
  deriveSiteStatus,
  onSelect,
  onSelectRegion,
}: Props) {
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const [center, setCenter] = useState<[number, number]>(INITIAL_CENTER);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [expandedClusterId, setExpandedClusterId] = useState<string | null>(
    null,
  );
  const prevSelectedSiteId = useRef(selectedSiteId);

  const regionStats = useMemo(() => {
    const map = new Map<string, RegionStats>();
    for (const site of allSites) {
      const region = site.region;
      const stats = map.get(region) ?? {
        majority: "running" as DeviceStatus,
        hasFault: false,
        total: 0,
        counts: { running: 0, standby: 0, start: 0, fault: 0, offline: 0 },
        sites: [],
      };
      stats.sites.push(site);
      for (const inst of site.installations) {
        const s = (inst.device?.status ?? "offline") as DeviceStatus;
        stats.counts[s] = (stats.counts[s] ?? 0) + 1;
        stats.total++;
        if (s === "fault") stats.hasFault = true;
      }
      map.set(region, stats);
    }
    for (const [, stats] of map) {
      let maxCount = 0;
      let majority: DeviceStatus = "running";
      for (const [s, count] of Object.entries(stats.counts)) {
        if (count > maxCount) {
          maxCount = count;
          majority = s as DeviceStatus;
        }
      }
      stats.majority = majority;
    }
    return map;
  }, [allSites]);

  const siteMarkers = useMemo(() => {
    return allSites
      .map((site) => {
        const coords = resolveCoords(site.address, site.region);
        if (!coords) return null;
        const status = deriveSiteStatus(site);
        return {
          siteId: site.id,
          siteName: site.name,
          instCount: site.installations.length,
          firstInstId: site.installations[0]?.id ?? site.id,
          coordinates: coords,
          status,
        };
      })
      .filter(Boolean) as SiteMarker[];
  }, [allSites, deriveSiteStatus]);

  const clusters = useMemo(
    () => clusterMarkers(siteMarkers, zoom),
    [siteMarkers, zoom],
  );

  useEffect(() => {
    if (prevSelectedSiteId.current === selectedSiteId) return;
    prevSelectedSiteId.current = selectedSiteId;
    const cluster = clusters.find((c) =>
      c.members.some((m) => m.siteId === selectedSiteId),
    );
    setExpandedClusterId(
      cluster && cluster.members.length > 1 ? cluster.id : null,
    );
  }, [selectedSiteId, clusters]);

  const handleZoomIn = () => setZoom((z) => Math.min(z * ZOOM_STEP, MAX_ZOOM));
  const handleZoomOut = () => setZoom((z) => Math.max(z / ZOOM_STEP, MIN_ZOOM));
  const handleReset = () => {
    setZoom(INITIAL_ZOOM);
    setCenter(INITIAL_CENTER);
  };

  const updateTooltipPos = (evt: MouseEvent<SVGElement>) => {
    setTooltip((prev) =>
      prev ? { ...prev, x: evt.clientX, y: evt.clientY } : null,
    );
  };

  return (
    <div className="korea-map-wrapper">
      {/* Zoom controls */}
      <div className="map-zoom-controls">
        <button className="zoom-btn" onClick={handleZoomIn} title="확대">
          +
        </button>
        <button className="zoom-btn" onClick={handleZoomOut} title="축소">
          −
        </button>
        {Math.abs(zoom - INITIAL_ZOOM) > 0.08 && (
          <button
            className="zoom-btn zoom-btn-reset"
            onClick={handleReset}
            title="초기화"
          >
            ↺
          </button>
        )}
      </div>

      {/* Hint */}
      <div className={`map-zoom-hint${zoom > INITIAL_ZOOM * 1.05 ? " active" : ""}`}>
        {zoom > INITIAL_ZOOM * 1.05
          ? "드래그로 이동 · 스크롤로 확대/축소"
          : "스크롤로 확대 · 드래그로 이동"}
      </div>

      {/* Tooltip (fixed, follows cursor) */}
      {tooltip && (
        <div
          className="map-tooltip"
          style={{ left: tooltip.x + 14, top: tooltip.y - 12 }}
        >
          {tooltip.lines.map((line, i) => (
            <p key={i} className={i === 0 ? "tooltip-title" : "tooltip-sub"}>
              {line}
            </p>
          ))}
        </div>
      )}

      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ center: [127.8, 35.7], scale: 3000 }}
        width={300}
        height={400}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup
          zoom={zoom}
          center={center}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          {...({
            filterZoomEvent: (evt: { type: string }) => evt.type !== "wheel",
          } as Record<string, unknown>)}
          onMoveEnd={({ zoom: z, coordinates }) => {
            setZoom(z);
            setCenter(coordinates);
          }}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const geoName = geo.properties.name as string;
                const regionKey = GEO_TO_REGION[geoName];
                const stats = regionKey
                  ? regionStats.get(regionKey)
                  : undefined;

                if (!stats) {
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      style={{
                        default: {
                          fill: "#161c28",
                          stroke: "rgba(203, 213, 225, 0.55)",
                          strokeWidth: 0.5,
                          outline: "none",
                        },
                        hover: {
                          fill: "#1c2433",
                          stroke: "rgba(226, 232, 240, 0.72)",
                          strokeWidth: 0.95,
                          outline: "none",
                        },
                        pressed: { fill: "#161c28", outline: "none" },
                      }}
                    />
                  );
                }

                const isSelected = stats.sites.some(
                  (s) => s.id === selectedSiteId,
                );
                const colors = regionHealthColors(stats);
                const fill = isSelected ? colors.fillSelected : colors.fill;
                const firstSite = stats.sites[0];

                const makeTooltipLines = (): string[] => {
                  const okPct =
                    stats.total > 0
                      ? Math.round(
                          ((stats.counts.running ?? 0) / stats.total) * 100,
                        )
                      : 0;
                  const summary = Object.entries(stats.counts)
                    .filter(([, n]) => n > 0)
                    .map(([s, n]) => `${STATUS_LABEL[s as DeviceStatus]} ${n}`)
                    .join(" · ");
                  return [
                    `${regionKey} — ${stats.sites.length}현장 · ${stats.total}대 (정상 ${okPct}%)`,
                    summary,
                  ];
                };

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onClick={() => {
                      setExpandedClusterId(null);
                      if (onSelectRegion) {
                        onSelectRegion(regionKey, firstSite?.id);
                      } else if (firstSite) {
                        onSelect(firstSite.id);
                      }
                    }}
                    onMouseEnter={(evt) =>
                      setTooltip({
                        lines: makeTooltipLines(),
                        x: evt.clientX,
                        y: evt.clientY,
                      })
                    }
                    onMouseMove={updateTooltipPos}
                    onMouseLeave={() => setTooltip(null)}
                    style={{
                      default: {
                        fill,
                        stroke: colors.stroke,
                        strokeWidth: isSelected ? 2.4 : 1.05,
                        outline: "none",
                        cursor: "pointer",
                        filter: isSelected
                          ? "drop-shadow(0 0 6px rgba(0, 212, 170, 0.65))"
                          : undefined,
                      },
                      hover: {
                        fill: colors.fillSelected,
                        stroke: colors.stroke,
                        strokeWidth: 1.45,
                        outline: "none",
                        cursor: "pointer",
                      },
                      pressed: { fill: colors.fillSelected, outline: "none" },
                    }}
                  />
                );
              })
            }
          </Geographies>

          {/* Site markers — nearby/overlapping sites are clustered */}
          {clusters.map((cluster, idx) => {
            const isExpanded = expandedClusterId === cluster.id;
            const hasSelected = cluster.members.some(
              (m) => m.siteId === selectedSiteId,
            );

            if (cluster.members.length > 1 && !isExpanded) {
              const color = STATUS_DOT[cluster.status];
              const innerR = 6.2 / zoom;
              const outerR = 9.4 / zoom;
              const names = cluster.members
                .slice(0, 5)
                .map((m) => m.siteName);
              const extra = cluster.members.length - names.length;
              return (
                <Marker
                  key={cluster.id}
                  coordinates={cluster.center}
                  onClick={() => {
                    if (zoom < 2.3) {
                      setCenter(cluster.center);
                      setZoom((z) => Math.min(z * 1.7, MAX_ZOOM));
                    }
                    setExpandedClusterId(cluster.id);
                  }}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(evt) =>
                    setTooltip({
                      lines: [
                        `${cluster.members.length}개 현장 · 클릭해서 펼치기`,
                        extra > 0
                          ? `${names.join(", ")} 외 ${extra}곳`
                          : names.join(", "),
                      ],
                      x: evt.clientX,
                      y: evt.clientY,
                    })
                  }
                  onMouseLeave={() => setTooltip(null)}
                >
                  <circle r={outerR * 1.6} fill="transparent" />
                  <circle
                    r={outerR}
                    fill={color}
                    opacity={0.22}
                    stroke={hasSelected ? "var(--pmcs-accent-bright)" : color}
                    strokeWidth={(hasSelected ? 1.3 : 0.8) / zoom}
                  />
                  <circle
                    r={innerR}
                    fill={color}
                    stroke="#0b0d12"
                    strokeWidth={0.85 / zoom}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#0b0d12"
                    fontSize={7.4 / zoom}
                    fontWeight={800}
                    style={{ pointerEvents: "none" }}
                  >
                    {cluster.members.length}
                  </text>
                </Marker>
              );
            }

            const members = [...cluster.members].sort((a, b) => {
              if (a.siteId === selectedSiteId) return 1;
              if (b.siteId === selectedSiteId) return -1;
              return 0;
            });
            const offsets =
              cluster.members.length > 1
                ? spiderfyOffsets(cluster.center, cluster.members.length, zoom)
                : null;

            return (
              <g key={cluster.id}>
                {members.map((marker, mIdx) => {
              const sourceIdx = cluster.members.findIndex(
                (m) => m.siteId === marker.siteId,
              );
              const coordinates =
                offsets?.[sourceIdx] ?? marker.coordinates;
              const isFault = marker.status === "fault";
              const isSelected = marker.siteId === selectedSiteId;
              const isLinked = marker.status !== "offline";
              const isDimmed = Boolean(selectedSiteId) && !isSelected;
              const color = STATUS_DOT[marker.status];
              const sizeBoost = isSelected ? 1.55 : 1;
              const innerR = (3 / zoom) * sizeBoost;
              const outerR = (7 / zoom) * sizeBoost;
              return (
                <Marker
                  key={marker.siteId}
                  coordinates={coordinates}
                  onClick={() => onSelect(marker.siteId)}
                  onMouseEnter={(evt) =>
                    setTooltip({
                      lines: [
                        marker.siteName,
                        `${marker.instCount}개 설치지점 · ${STATUS_LABEL[marker.status]}`,
                      ],
                      x: evt.clientX,
                      y: evt.clientY,
                    })
                  }
                  onMouseLeave={() => setTooltip(null)}
                  className={isSelected ? "map-marker-selected" : undefined}
                  style={{
                    cursor: "pointer",
                    opacity: isDimmed ? 0.22 : 1,
                    transition: "opacity 0.25s ease",
                  }}
                >
                  {isSelected && (
                    <>
                      <circle
                        r={outerR * 2}
                        fill="none"
                        stroke="var(--pmcs-accent)"
                        strokeWidth={1.4 / zoom}
                        className="marker-selection-halo marker-selection-halo--outer"
                        style={{ pointerEvents: "none" }}
                      />
                      <circle
                        r={outerR * 1.45}
                        fill="none"
                        stroke="var(--pmcs-accent-bright)"
                        strokeWidth={1.1 / zoom}
                        className="marker-selection-halo marker-selection-halo--inner"
                        style={{ pointerEvents: "none" }}
                      />
                      <circle
                        r={outerR * 1.12}
                        fill="var(--pmcs-accent)"
                        opacity={0.2}
                        style={{ pointerEvents: "none" }}
                      />
                    </>
                  )}
                  {isLinked && !isSelected && (
                    <circle
                      r={outerR * 1.8}
                      fill="none"
                      stroke={color}
                      strokeWidth={0.55 / zoom}
                      opacity={0}
                      className="marker-lte-ping"
                      style={{
                        pointerEvents: "none",
                        animationDelay: `${((idx + mIdx) % 5) * 1.1}s`,
                      }}
                    />
                  )}
                  {isFault && !isSelected && (
                    <circle
                      r={outerR * 1.8}
                      fill={color}
                      opacity={0}
                      className="marker-pulse-ring"
                      style={{ pointerEvents: "none" }}
                    />
                  )}
                  <circle
                    r={outerR}
                    fill={color}
                    opacity={isSelected ? 0.35 : 0.2}
                    stroke={isSelected ? "var(--pmcs-accent-bright)" : color}
                    strokeWidth={(isSelected ? 1.3 : 0.8) / zoom}
                  />
                  <circle
                    r={innerR}
                    fill={isSelected ? "#ffffff" : color}
                    stroke={isSelected ? color : "#0b0d12"}
                    strokeWidth={(isSelected ? 1.4 : 0.8) / zoom}
                  />
                </Marker>
              );
                })}
              </g>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>
    </div>
  );
}
