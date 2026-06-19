import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  badge?: string;
  wide?: boolean;
  large?: boolean;
  legend?: ReactNode;
  children: ReactNode;
};

export default function ChartCard({
  title,
  subtitle,
  badge,
  wide,
  large,
  legend,
  children,
}: Props) {
  return (
    <div
      className={`chart-card scada-chart-card${wide ? " chart-card-wide" : ""}${large ? " chart-card-lg" : ""}`}
    >
      <div className="scada-chart-card-head">
        <div className="scada-chart-card-titles">
          <h3 className="chart-title">
            {title}
            {subtitle ? (
              <span className="chart-title-sub"> {subtitle}</span>
            ) : null}
          </h3>
          {legend}
        </div>
        {badge ? <span className="scada-chart-badge">{badge}</span> : null}
      </div>
      {children}
    </div>
  );
}
