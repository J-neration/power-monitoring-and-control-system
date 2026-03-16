declare module "react-simple-maps" {
  import type { ReactNode, CSSProperties, MouseEvent } from "react";

  export interface ProjectionConfig {
    center?: [number, number];
    scale?: number;
    rotate?: [number, number, number];
    parallels?: [number, number];
  }

  export interface ComposableMapProps {
    projection?: string;
    projectionConfig?: ProjectionConfig;
    width?: number;
    height?: number;
    style?: CSSProperties;
    children?: ReactNode;
  }

  export function ComposableMap(props: ComposableMapProps): JSX.Element;

  // ── ZoomableGroup ──────────────────────────────────────────────────────────
  export interface MoveEndEvent {
    coordinates: [number, number];
    zoom: number;
  }

  export interface ZoomableGroupProps {
    zoom?: number;
    center?: [number, number];
    minZoom?: number;
    maxZoom?: number;
    onMoveStart?: (event: MoveEndEvent) => void;
    onMove?: (event: MoveEndEvent) => void;
    onMoveEnd?: (event: MoveEndEvent) => void;
    children?: ReactNode;
  }

  export function ZoomableGroup(props: ZoomableGroupProps): JSX.Element;

  // ── Geographies / Geography ────────────────────────────────────────────────
  export interface GeoFeature {
    rsmKey: string;
    properties: Record<string, unknown>;
    [key: string]: unknown;
  }

  export interface GeographiesChildrenProps {
    geographies: GeoFeature[];
  }

  export interface GeographiesProps {
    geography: string | object;
    children: (props: GeographiesChildrenProps) => ReactNode;
  }

  export function Geographies(props: GeographiesProps): JSX.Element;

  export interface GeographyStyle {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    outline?: string;
    cursor?: string;
    [key: string]: unknown;
  }

  export interface GeographyProps {
    geography: GeoFeature;
    style?: {
      default?: GeographyStyle;
      hover?: GeographyStyle;
      pressed?: GeographyStyle;
    };
    onClick?: (event: MouseEvent<SVGPathElement>) => void;
    onMouseEnter?: (event: MouseEvent<SVGPathElement>) => void;
    onMouseLeave?: (event: MouseEvent<SVGPathElement>) => void;
    onMouseMove?: (event: MouseEvent<SVGPathElement>) => void;
    [key: string]: unknown;
  }

  export function Geography(props: GeographyProps): JSX.Element;

  // ── Marker ─────────────────────────────────────────────────────────────────
  export interface MarkerProps {
    coordinates: [number, number];
    children?: ReactNode;
    onClick?: () => void;
    onMouseEnter?: (event: MouseEvent<SVGGElement>) => void;
    onMouseLeave?: (event: MouseEvent<SVGGElement>) => void;
    [key: string]: unknown;
  }

  export function Marker(props: MarkerProps): JSX.Element;
}
