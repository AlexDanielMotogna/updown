/**
 * SVG path builders for the line chart. Two flavours:
 *   - smoothPath: cubic Bezier through every point (true spline).
 *   - stepPath: rounded "wave step" — horizontal hold then S-curve into
 *     the next price; the Polymarket / Kalshi look.
 *
 * Both take a list of (x, y) points in absolute coordinates and return a
 * path string ready to drop into a <path d=…/>.
 */

export interface Point { x: number; y: number }

/** Catmull-Rom-ish smoothing: control points placed at the segment midpoint
 *  X so the curve interpolates each data point exactly without overshoot. */
export function smoothPath(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    d += ` C${cpx.toFixed(1)},${prev.y.toFixed(1)} ${cpx.toFixed(1)},${curr.y.toFixed(1)} ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`;
  }
  return d;
}

/** Wave-step path: holds horizontal at the previous price for the first
 *  half of each segment, then runs a cubic Bezier S-curve into the new
 *  price. Control points pulled in toward the corners so the curve enters
 *  and exits the flat portions horizontally — no 90° peaks, no free swoop. */
export function stepPath(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const dx = curr.x - prev.x;
    const holdEndX = prev.x + dx * 0.5;
    const cp1x = holdEndX + dx * 0.18;
    const cp2x = curr.x - dx * 0.18;
    d += ` L${holdEndX.toFixed(1)},${prev.y.toFixed(1)}`;
    d += ` C${cp1x.toFixed(1)},${prev.y.toFixed(1)} ${cp2x.toFixed(1)},${curr.y.toFixed(1)} ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`;
  }
  return d;
}

/** Close a line path into an area path by dropping to the bottom of the
 *  chart and back to the start. Used for the gradient fill under the line. */
export function areaPathFromLine(linePath: string, points: Point[], bottomY: number): string {
  if (points.length === 0) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath} L${last.x.toFixed(1)},${bottomY} L${first.x.toFixed(1)},${bottomY} Z`;
}
