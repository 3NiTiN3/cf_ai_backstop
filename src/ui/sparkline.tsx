import { sparklineSegments } from "./sparkline-points";

const WIDTH = 80;
const HEIGHT = 20;

export function Sparkline({
  values,
  label,
}: {
  values: (number | null)[];
  label: string;
}) {
  const segments = sparklineSegments(values, WIDTH, HEIGHT);
  return (
    <svg
      role="img"
      aria-label={label}
      width={WIDTH}
      height={HEIGHT}
      viewBox={`-2 -2 ${WIDTH + 4} ${HEIGHT + 4}`}
      className="text-kumo-danger"
    >
      <line
        x1={0}
        x2={WIDTH}
        y1={HEIGHT}
        y2={HEIGHT}
        className="stroke-kumo-line"
        strokeWidth={1}
      />
      {segments.map((segment) => {
        const [first] = segment;
        if (segment.length === 1 && first) {
          return (
            <circle
              key={`${first.x}`}
              cx={first.x}
              cy={first.y}
              r={1.5}
              fill="currentColor"
            />
          );
        }
        const points = segment.map(({ x, y }) => `${x},${y}`).join(" ");
        return (
          <polyline
            key={points}
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}
