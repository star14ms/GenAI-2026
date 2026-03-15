"use client";

type HistoryPoint = {
  date: string;
  close: number | null;
};

const RANGES = [1, 3, 5, 10] as const;

const CHART_WIDTH = 900;
const CHART_HEIGHT = 300;
const PAD_LEFT = 60;
const PAD_RIGHT = 90;
const PAD_TOP = 0;
const PAD_BOTTOM = 60;
const PLOT_WIDTH = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_HEIGHT = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

function formatDateLabel(dateStr: string, years: number): string {
  const d = new Date(dateStr);
  if (years <= 1) {
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { year: "numeric" });
}

function getXTickIndices(pointCount: number, years: number): number[] {
  if (pointCount <= 1) return [0];
  const targetTicks = years <= 1 ? 8 : years <= 3 ? 6 : years <= 5 ? 5 : 6;
  const step = Math.max(1, Math.floor((pointCount - 1) / (targetTicks - 1)));
  const indices: number[] = [];
  for (let i = 0; i < pointCount; i += step) {
    indices.push(i);
  }
  if (indices[indices.length - 1] !== pointCount - 1) {
    indices.push(pointCount - 1);
  }
  return indices;
}

function getYTickValues(minVal: number, maxVal: number, count: number): number[] {
  const range = Math.max(maxVal - minVal, 0.01);
  const rawStep = range / (count - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const step = (normalized <= 1.5 ? 1 : normalized <= 3 ? 2 : normalized <= 7 ? 5 : 10) * magnitude;
  const start = Math.floor(minVal / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= maxVal + step * 0.01; v += step) {
    const rounded = Number(v.toFixed(2));
    if (ticks.length === 0 || ticks[ticks.length - 1] !== rounded) {
      ticks.push(rounded);
    }
  }
  if (ticks.length < 2) return [minVal, maxVal];
  return ticks;
}

interface StockChartProps {
  points: HistoryPoint[];
  years: (typeof RANGES)[number];
  height?: string;
}

export default function StockChart({ points, years, height = "20rem" }: StockChartProps) {
  if (!points.length) return null;

  const values = points.map((p) => p.close ?? 0);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const dataRange = Math.max(maxVal - minVal, 1);
  const yPadding = dataRange * 0.08; // 15% padding top/bottom so min tick doesn't overlap x-axis
  const plotMin = minVal - yPadding;
  const plotMax = maxVal + yPadding;
  const range = plotMax - plotMin;
  const lastVal = points[points.length - 1]?.close ?? 0;

  const minIdx = values.indexOf(minVal);
  const maxIdx = values.indexOf(maxVal);
  const lastIdx = points.length - 1;

  const xScale = (i: number) =>
    PAD_LEFT + (i / Math.max(points.length - 1, 1)) * PLOT_WIDTH;
  const yScale = (v: number) =>
    PAD_TOP + PLOT_HEIGHT - ((v - plotMin) / range) * PLOT_HEIGHT;

  const polyline = points
    .map((p, i) => `${xScale(i)},${yScale(p.close ?? minVal)}`)
    .join(" ");

  const xTicks = getXTickIndices(points.length, years);
  const yTicks = getYTickValues(plotMin, plotMax, 5);

  const LABEL_RIGHT_EXTRA = 70;
  const svgWidth = CHART_WIDTH + LABEL_RIGHT_EXTRA;
  const svgHeight = PAD_TOP + PLOT_HEIGHT + PAD_BOTTOM;

  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        padding: "1rem",
        background: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}
    >
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="xMidYMax meet"
        style={{ width: "100%", height, display: "block" }}
        role="img"
        aria-label="Historical stock close price chart"
      >
        <polyline
          fill="none"
          stroke="#2563eb"
          strokeWidth="2"
          points={polyline}
        />

        {/* Y-axis tick labels */}
        {yTicks.map((v, i) => (
          <text
            key={i}
            x={PAD_LEFT - 8}
            y={yScale(v)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize="11"
            fill="#64748b"
          >
            ${v.toFixed(2)}
          </text>
        ))}

        {/* X-axis tick labels - deduplicate by label to avoid overlap (keep last occurrence) */}
        {xTicks
          .reduce<{ i: number; label: string }[]>((acc, i) => {
            const label = formatDateLabel(points[i]?.date ?? "", years);
            const existing = acc.findIndex((a) => a.label === label);
            if (existing >= 0) acc[existing] = { i, label };
            else acc.push({ i, label });
            return acc;
          }, [])
          .map(({ i }) => {
            const x = xScale(i);
            const label = formatDateLabel(points[i]?.date ?? "", years);
            return (
              <text
                key={i}
                x={x}
                y={PAD_TOP + PLOT_HEIGHT + 48}
                textAnchor="middle"
                dominantBaseline="hanging"
                fontSize="11"
                fill="#64748b"
              >
                {label}
              </text>
            );
          })}

        {/* Min label - below plot with line to point (outside graph area) */}
        {minIdx !== maxIdx && (
          <g>
            <line
              x1={xScale(minIdx)}
              y1={yScale(minVal)}
              x2={xScale(minIdx)}
              y2={PAD_TOP + PLOT_HEIGHT + 12}
              stroke="#94a3b8"
              strokeWidth="1"
              strokeDasharray="3 2"
            />
            <text
              x={xScale(minIdx)}
              y={PAD_TOP + PLOT_HEIGHT + 28}
              textAnchor="middle"
              fontSize="11"
              fontWeight="600"
              fill="#475569"
            >
              Min: ${minVal.toFixed(2)}
            </text>
          </g>
        )}

        {/* Max label - above plot with line to point (outside graph area) */}
        <g>
          <line
            x1={xScale(maxIdx)}
            y1={yScale(maxVal)}
            x2={xScale(maxIdx)}
            y2={PAD_TOP - 4}
            stroke="#94a3b8"
            strokeWidth="1"
            strokeDasharray="3 2"
          />
          <text
            x={xScale(maxIdx)}
            y={PAD_TOP - 14}
            textAnchor="middle"
            fontSize="11"
            fontWeight="600"
            fill="#475569"
          >
            {minIdx === maxIdx ? `Min/Max: $${maxVal.toFixed(2)}` : `Max: $${maxVal.toFixed(2)}`}
          </text>
        </g>

        {/* Last label - right of plot with line to point (outside graph area) */}
        <g>
          <line
            x1={xScale(lastIdx)}
            y1={yScale(lastVal)}
            x2={CHART_WIDTH - PAD_RIGHT + 8}
            y2={yScale(lastVal)}
            stroke="#94a3b8"
            strokeWidth="1"
            strokeDasharray="3 2"
          />
          <text
            x={CHART_WIDTH - PAD_RIGHT + 16}
            y={yScale(lastVal)}
            textAnchor="start"
            dominantBaseline="middle"
            fontSize="11"
            fontWeight="600"
            fill="#475569"
          >
            Last: ${lastVal.toFixed(2)}
          </text>
        </g>
      </svg>
    </div>
  );
}

export { RANGES };
export type { HistoryPoint };
