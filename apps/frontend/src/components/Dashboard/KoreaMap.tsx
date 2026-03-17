"use client";

import { useState, useMemo } from "react";
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
  running: { active: "#0a2e14", selected: "#0f4520", stroke: "#34C759" },
  standby: { active: "#2a1e00", selected: "#3d2c00", stroke: "#F59E0B" },
  start:   { active: "#2a1e00", selected: "#3d2c00", stroke: "#F59E0B" },
  fault:   { active: "#2d0a0a", selected: "#3f0e0e", stroke: "#EF4444" },
  offline: { active: "#161e2c", selected: "#1e2840", stroke: "#4B5563" },
};

function lerpColor(a: string, b: string, t: number): string {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

function regionHealthColors(stats: RegionStats): { fill: string; fillSelected: string; stroke: string } {
  const { total, counts } = stats;
  if (total === 0) return { fill: "#161e2c", fillSelected: "#1e2840", stroke: "#4B5563" };

  const okRatio = (counts.running ?? 0) / total;
  const faultRatio = (counts.fault ?? 0) / total;

  // 100% running → pure green, 100% fault → pure red, mix → blend
  // standby/offline pulls toward amber/grey
  if (faultRatio > 0) {
    const fill = lerpColor("#0a2e14", "#2d0a0a", Math.min(faultRatio * 3, 1));
    const fillSel = lerpColor("#0f4520", "#3f0e0e", Math.min(faultRatio * 3, 1));
    const stroke = lerpColor("#34C759", "#EF4444", Math.min(faultRatio * 2.5, 1));
    return { fill, fillSelected: fillSel, stroke };
  }
  if (okRatio >= 0.8) return { fill: "#0a2e14", fillSelected: "#0f4520", stroke: "#34C759" };
  if (okRatio >= 0.5) {
    const fill = lerpColor("#0a2e14", "#2a1e00", 1 - okRatio);
    const fillSel = lerpColor("#0f4520", "#3d2c00", 1 - okRatio);
    const stroke = lerpColor("#34C759", "#F59E0B", 1 - okRatio);
    return { fill, fillSelected: fillSel, stroke };
  }
  return { fill: "#2a1e00", fillSelected: "#3d2c00", stroke: "#F59E0B" };
}

const STATUS_DOT: Record<DeviceStatus, string> = {
  running: "#34C759",
  standby: "#F59E0B",
  start:   "#F59E0B",
  fault:   "#EF4444",
  offline: "#4B5563",
};

const STATUS_LABEL: Record<DeviceStatus, string> = {
  running: "정상",
  standby: "대기",
  start:   "기동 중",
  fault:   "이상",
  offline: "오프라인",
};

const CITY_COORDS: Record<string, [number, number]> = {
  // 광역시/특별시 구 단위
  송파구: [127.11, 37.51], 강남구: [127.05, 37.50], 종로구: [126.98, 37.57],
  마포구: [126.90, 37.55], 서초구: [127.01, 37.48], 영등포구: [126.90, 37.52],
  해운대구: [129.16, 35.16], 사하구: [128.97, 35.10], 수영구: [129.11, 35.15],
  연수구: [126.68, 37.41], 서구: [126.68, 37.53], 남동구: [126.73, 37.45],
  유성구: [127.34, 36.36], 동구: [127.46, 36.31], 중구: [127.42, 36.33],
  // 경기도 시 단위
  안양시: [126.95, 37.39], 수원시: [127.00, 37.26], 성남시: [127.13, 37.42],
  화성시: [127.07, 37.20], 용인시: [127.18, 37.24], 고양시: [126.83, 37.66],
  평택시: [127.09, 36.99], 파주시: [126.78, 37.76], 김포시: [126.72, 37.62],
  시흥시: [126.80, 37.38], 광명시: [126.87, 37.47], 하남시: [127.21, 37.54],
  // 경상북도 시 단위
  구미시: [128.34, 36.12], 포항시: [129.34, 36.02], 경주시: [129.23, 35.86],
  안동시: [128.73, 36.57], 김천시: [128.11, 36.12], 영주시: [128.74, 36.81],
  // 경상남도
  창원시: [128.68, 35.23], 진주시: [128.08, 35.18], 김해시: [128.89, 35.23],
  // 충청북도
  청주시: [127.49, 36.64], 충주시: [127.93, 36.99], 제천시: [128.19, 37.13],
  // 충청남도
  천안시: [127.15, 36.82], 아산시: [127.00, 36.79], 서산시: [126.45, 36.78],
  // 전북특별자치도
  전주시: [127.15, 35.82], 익산시: [126.95, 35.95], 군산시: [126.74, 35.97],
  // 전라남도
  여수시: [127.66, 34.76], 순천시: [127.49, 34.95], 목포시: [126.39, 34.81],
  // 강원도
  춘천시: [127.73, 37.88], 원주시: [127.92, 37.34], 강릉시: [128.90, 37.75],
  // 제주
  제주시: [126.53, 33.51], 서귀포시: [126.56, 33.25],
  // 광역시 폴백 (구 매칭 실패 시)
  서울: [127.00, 37.56], 부산: [129.08, 35.18], 대구: [128.60, 35.87],
  인천: [126.70, 37.46], 광주: [126.85, 35.16], 대전: [127.38, 36.35],
  울산: [129.31, 35.54], 세종: [127.00, 36.48],
  // 도 폴백
  경기도: [127.05, 37.28], 강원도: [128.20, 37.75],
  충청북도: [127.70, 36.64], 충청남도: [126.80, 36.52],
  전북특별자치도: [127.10, 35.82], 전라남도: [126.95, 34.82],
  경상북도: [128.73, 36.07], 경상남도: [128.25, 35.24],
  제주특별자치도: [126.57, 33.38],
};

function resolveCoords(address: string, region: string): [number, number] | null {
  const parts = address.replace(/특별시|광역시|특별자치시|특별자치도/g, "").split(/\s+/);
  for (const part of parts) {
    if (CITY_COORDS[part]) return CITY_COORDS[part];
  }
  for (const part of parts) {
    const match = Object.keys(CITY_COORDS).find((k) => part.includes(k) || k.includes(part));
    if (match) return CITY_COORDS[match];
  }
  return CITY_COORDS[region] ?? null;
}

const INITIAL_CENTER: [number, number] = [127.8, 36.0];
const INITIAL_ZOOM = 1;
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
};

type Tooltip = { lines: string[]; x: number; y: number };

export default function KoreaMap({
  allSites,
  selectedSiteId,
  deriveSiteStatus,
  onSelect,
}: Props) {
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const [center, setCenter] = useState<[number, number]>(INITIAL_CENTER);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

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
    return allSites.map((site) => {
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
    }).filter(Boolean) as {
      siteId: string;
      siteName: string;
      instCount: number;
      firstInstId: string;
      coordinates: [number, number];
      status: DeviceStatus;
    }[];
  }, [allSites, deriveSiteStatus]);

  const handleZoomIn  = () => setZoom((z) => Math.min(z * ZOOM_STEP, MAX_ZOOM));
  const handleZoomOut = () => setZoom((z) => Math.max(z / ZOOM_STEP, MIN_ZOOM));
  const handleReset   = () => { setZoom(INITIAL_ZOOM); setCenter(INITIAL_CENTER); };

  const updateTooltipPos = (evt: MouseEvent<SVGElement>) => {
    setTooltip((prev) => prev ? { ...prev, x: evt.clientX, y: evt.clientY } : null);
  };

  return (
    <div className="korea-map-wrapper">
      {/* Zoom controls */}
      <div className="map-zoom-controls">
        <button className="zoom-btn" onClick={handleZoomIn} title="확대">+</button>
        <button className="zoom-btn" onClick={handleZoomOut} title="축소">−</button>
        {zoom > 1.05 && (
          <button className="zoom-btn zoom-btn-reset" onClick={handleReset} title="초기화">
            ↺
          </button>
        )}
      </div>

      {/* Hint */}
      <div className={`map-zoom-hint${zoom > 1.05 ? " active" : ""}`}>
        {zoom > 1.05 ? "드래그로 이동 · 스크롤로 확대/축소" : "스크롤로 확대 · 드래그로 이동"}
      </div>

      {/* Tooltip (fixed, follows cursor) */}
      {tooltip && (
        <div className="map-tooltip" style={{ left: tooltip.x + 14, top: tooltip.y - 12 }}>
          {tooltip.lines.map((line, i) => (
            <p key={i} className={i === 0 ? "tooltip-title" : "tooltip-sub"}>{line}</p>
          ))}
        </div>
      )}

      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ center: [127.8, 36.0], scale: 4500 }}
        width={300}
        height={400}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup
          zoom={zoom}
          center={center}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
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
                const stats = regionKey ? regionStats.get(regionKey) : undefined;

                if (!stats) {
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      style={{
                        default: { fill: "#0e1118", stroke: "#1a2030", strokeWidth: 0.4, outline: "none" },
                        hover:   { fill: "#141b28", stroke: "#1a2030", strokeWidth: 0.4, outline: "none" },
                        pressed: { fill: "#0e1118", outline: "none" },
                      }}
                    />
                  );
                }

                const isSelected = stats.sites.some((s) => s.id === selectedSiteId);
                const colors = regionHealthColors(stats);
                const fill = isSelected ? colors.fillSelected : colors.fill;
                const firstSite = stats.sites[0];

                const makeTooltipLines = (): string[] => {
                  const okPct = stats.total > 0
                    ? Math.round(((stats.counts.running ?? 0) / stats.total) * 100)
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
                    onClick={() => firstSite && onSelect(firstSite.id)}
                    onMouseEnter={(evt) =>
                      setTooltip({ lines: makeTooltipLines(), x: evt.clientX, y: evt.clientY })
                    }
                    onMouseMove={updateTooltipPos}
                    onMouseLeave={() => setTooltip(null)}
                    style={{
                      default: {
                        fill,
                        stroke: colors.stroke,
                        strokeWidth: isSelected ? 1.2 : 0.7,
                        outline: "none",
                        cursor: "pointer",
                      },
                      hover: {
                        fill: colors.fillSelected,
                        stroke: colors.stroke,
                        strokeWidth: 1.2,
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

          {/* Site markers — one dot per site, worst status */}
          {siteMarkers.map((marker) => {
            const isFault = marker.status === "fault";
            const isSelected = marker.siteId === selectedSiteId;
            const color = STATUS_DOT[marker.status];
            const innerR = (isSelected ? 4 : 3) / zoom;
            const outerR = (isSelected ? 9 : 7) / zoom;
            return (
              <Marker
                key={marker.siteId}
                coordinates={marker.coordinates}
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
                style={{ cursor: "pointer" }}
              >
                {isFault && (
                  <circle
                    r={outerR * 1.8}
                    fill={color}
                    opacity={0}
                    className="marker-pulse-ring"
                  />
                )}
                <circle
                  r={outerR}
                  fill={color}
                  opacity={0.2}
                  stroke={color}
                  strokeWidth={0.8 / zoom}
                />
                <circle
                  r={innerR}
                  fill={color}
                  stroke="#0b0d12"
                  strokeWidth={0.8 / zoom}
                />
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>
    </div>
  );
}
