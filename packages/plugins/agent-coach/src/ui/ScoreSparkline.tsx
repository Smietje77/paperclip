/**
 * Minimal dependency-free SVG sparkline for run-score trends.
 *
 * Accepts a chronologically-ordered series of (timestamp, score) samples
 * and renders a polyline scaled to the fixed viewBox. Empty or single-point
 * series render a short placeholder bar so the layout never jumps.
 */

export interface SparklineSample {
  readonly recordedAt: string;
  readonly score: number;
}

interface ScoreSparklineProps {
  readonly samples: readonly SparklineSample[];
  readonly width?: number;
  readonly height?: number;
  readonly stroke?: string;
}

const VIEW_BOX_WIDTH = 200;
const VIEW_BOX_HEIGHT = 40;
const SCORE_MAX = 100;
const DEFAULT_STROKE = "#2563eb";

function sortedByTime(samples: readonly SparklineSample[]): SparklineSample[] {
  return [...samples].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}

function toPolylinePoints(samples: readonly SparklineSample[]): string {
  if (samples.length === 0) return "";
  if (samples.length === 1) {
    const y = VIEW_BOX_HEIGHT - (samples[0]!.score / SCORE_MAX) * VIEW_BOX_HEIGHT;
    return `0,${y} ${VIEW_BOX_WIDTH},${y}`;
  }
  const step = VIEW_BOX_WIDTH / (samples.length - 1);
  return samples
    .map((sample, index) => {
      const clamped = Math.max(0, Math.min(SCORE_MAX, sample.score));
      const x = index * step;
      const y = VIEW_BOX_HEIGHT - (clamped / SCORE_MAX) * VIEW_BOX_HEIGHT;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function ScoreSparkline({
  samples,
  width = VIEW_BOX_WIDTH,
  height = VIEW_BOX_HEIGHT,
  stroke = DEFAULT_STROKE,
}: ScoreSparklineProps) {
  const ordered = sortedByTime(samples);
  const points = toPolylinePoints(ordered);
  const latest = ordered.at(-1);
  const trendLabel =
    ordered.length === 0
      ? "No samples"
      : `${ordered.length} run${ordered.length === 1 ? "" : "s"} · latest ${latest!.score}`;

  return (
    <figure style={{ margin: 0, display: "grid", gap: "0.25rem" }}>
      <svg
        role="img"
        aria-label={`Score trend: ${trendLabel}`}
        viewBox={`0 0 ${VIEW_BOX_WIDTH} ${VIEW_BOX_HEIGHT}`}
        width={width}
        height={height}
        style={{ display: "block" }}
      >
        <line
          x1={0}
          x2={VIEW_BOX_WIDTH}
          y1={VIEW_BOX_HEIGHT}
          y2={VIEW_BOX_HEIGHT}
          stroke="#e5e7eb"
          strokeWidth={1}
        />
        {points && (
          <polyline
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />
        )}
      </svg>
      <figcaption style={{ fontSize: "0.75rem", color: "#6b7280" }}>{trendLabel}</figcaption>
    </figure>
  );
}
