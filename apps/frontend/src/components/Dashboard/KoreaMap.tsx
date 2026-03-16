"use client";

import { useState } from "react";
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

const INITIAL_CENTER: [number, number] = [127.8, 36.0];
const INITIAL_ZOOM = 1;
const ZOOM_STEP = 1.6;
const MIN_ZOOM = 1;
const MAX_ZOOM = 10;

type Props = {
  regionToSite: Record<string, Site>;
  allSites: Site[];
  selectedSiteId: string;
  deriveSiteStatus: (site: Site) => DeviceStatus;
  onSelect: (siteId: string) => void;
};

type Tooltip = { lines: string[]; x: number; y: number };

export default function KoreaMap({
  regionToSite,
  allSites,
  selectedSiteId,
  deriveSiteStatus,
  onSelect,
}: Props) {
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const [center, setCenter] = useState<[number, number]>(INITIAL_CENTER);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  const deviceMarkers = allSites.flatMap((site) =>
    site.installations
      .filter((inst) => inst.coordinates)
      .map((inst) => ({
        id: inst.id,
        label: inst.label,
        coordinates: inst.coordinates as [number, number],
        status: (inst.device?.status ?? "offline") as DeviceStatus,
        siteName: site.name,
        siteId: site.id,
      }))
  );

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
                const site = regionKey ? regionToSite[regionKey] : null;
                const status = site ? deriveSiteStatus(site) : null;
                const isSelected = !!site && site.id === selectedSiteId;

                const makeTooltipLines = (): string[] => {
                  if (!site || !status) return [geoName];
                  const counts = site.installations.reduce(
                    (acc, inst) => {
                      acc[inst.device?.status ?? "offline"] =
                        (acc[inst.device?.status ?? "offline"] ?? 0) + 1;
                      return acc;
                    },
                    {} as Record<string, number>
                  );
                  const statusSummary = Object.entries(counts)
                    .map(([s, n]) => `${STATUS_LABEL[s as DeviceStatus]} ${n}`)
                    .join(" · ");
                  return [
                    site.name,
                    `${geoName} · ${site.installations.length}개 설치`,
                    statusSummary,
                  ];
                };

                const handleMouseEnter = (evt: MouseEvent<SVGElement>) => {
                  if (!site) return;
                  setTooltip({ lines: makeTooltipLines(), x: evt.clientX, y: evt.clientY });
                };

                if (!status) {
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

                const s = STATUS_STYLE[status];
                const fill = isSelected ? s.selected : s.active;

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onClick={() => site && onSelect(site.id)}
                    onMouseEnter={handleMouseEnter}
                    onMouseMove={updateTooltipPos}
                    onMouseLeave={() => setTooltip(null)}
                    style={{
                      default: {
                        fill,
                        stroke: s.stroke,
                        strokeWidth: isSelected ? 1.2 : 0.7,
                        outline: "none",
                        cursor: "pointer",
                      },
                      hover: {
                        fill: s.selected,
                        stroke: s.stroke,
                        strokeWidth: 1.2,
                        outline: "none",
                        cursor: "pointer",
                      },
                      pressed: { fill: s.selected, outline: "none" },
                    }}
                  />
                );
              })
            }
          </Geographies>

          {/* Device markers — always visible */}
          {deviceMarkers.map((marker) => {
            const isFault = marker.status === "fault";
            const color = STATUS_DOT[marker.status];
            const innerR = 3 / zoom;
            const outerR = 7 / zoom;
            return (
              <Marker
                key={marker.id}
                coordinates={marker.coordinates}
                onMouseEnter={(evt) =>
                  setTooltip({
                    lines: [marker.siteName, marker.label, STATUS_LABEL[marker.status]],
                    x: evt.clientX,
                    y: evt.clientY,
                  })
                }
                onMouseLeave={() => setTooltip(null)}
              >
                {/* Pulse ring — fault only */}
                {isFault && (
                  <circle
                    r={outerR * 1.8}
                    fill={color}
                    opacity={0}
                    className="marker-pulse-ring"
                  />
                )}
                {/* Outer ring */}
                <circle
                  r={outerR}
                  fill={color}
                  opacity={0.2}
                  stroke={color}
                  strokeWidth={0.8 / zoom}
                />
                {/* Inner dot */}
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
