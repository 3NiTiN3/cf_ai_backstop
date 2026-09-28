export interface Point {
  x: number;
  y: number;
}

export function sparklineSegments(
  values: (number | null)[],
  width: number,
  height: number,
): Point[][] {
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const segments: Point[][] = [];
  let current: Point[] = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (current.length > 0) segments.push(current);
      current = [];
      return;
    }
    current.push({ x: index * step, y: height - clamp(value) * height });
  });
  if (current.length > 0) segments.push(current);
  return segments;
}

function clamp(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}
