import { Triangle } from "./solver.js";

const DEG2RAD = Math.PI / 180;

const VIEWBOX_SIZE = 320;
const PADDING = 36;

// Build the SVG markup for a triangle.
//
// Coordinates: place A at the origin, B along +x at distance c (the side
// connecting A and B has length c, by convention). C lies at angle A from the
// AB direction, distance b away. After computing the three vertices we flip Y
// so the triangle reads upright in screen space, then scale to fit the viewBox.
export function renderTriangleSVG(triangle: Triangle): string {
  const { a, b, c, A, B, C } = triangle;
  const ARad = A * DEG2RAD;

  // Vertex positions in math coordinates (y up).
  const vA = { x: 0, y: 0 };
  const vB = { x: c, y: 0 };
  const vC = { x: b * Math.cos(ARad), y: b * Math.sin(ARad) };

  // Compute bounding box.
  const minX = Math.min(vA.x, vB.x, vC.x);
  const maxX = Math.max(vA.x, vB.x, vC.x);
  const minY = Math.min(vA.y, vB.y, vC.y);
  const maxY = Math.max(vA.y, vB.y, vC.y);
  const width = maxX - minX || 1;
  const height = maxY - minY || 1;
  const usable = VIEWBOX_SIZE - 2 * PADDING;
  const scale = Math.min(usable / width, usable / height);
  const offsetX = (VIEWBOX_SIZE - width * scale) / 2;
  const offsetY = (VIEWBOX_SIZE - height * scale) / 2;

  // Transform a math-coord point to SVG-coord (flip Y).
  function project(point: { x: number; y: number }): { x: number; y: number } {
    return {
      x: offsetX + (point.x - minX) * scale,
      // Flip vertically: SVG y grows downward.
      y: VIEWBOX_SIZE - offsetY - (point.y - minY) * scale,
    };
  }

  const pA = project(vA);
  const pB = project(vB);
  const pC = project(vC);

  // Midpoint of a side, nudged outward along its outward normal for the label.
  function midOutside(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    interior: { x: number; y: number },
    distance: number,
  ): { x: number; y: number } {
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const dirX = midX - interior.x;
    const dirY = midY - interior.y;
    const length = Math.hypot(dirX, dirY) || 1;
    return {
      x: midX + (dirX / length) * distance,
      y: midY + (dirY / length) * distance,
    };
  }

  // A vertex label sits just inside the triangle, along the bisector from the vertex.
  function inwardLabel(
    vertex: { x: number; y: number },
    other1: { x: number; y: number },
    other2: { x: number; y: number },
    distance: number,
  ): { x: number; y: number } {
    const dirX = (other1.x + other2.x) / 2 - vertex.x;
    const dirY = (other1.y + other2.y) / 2 - vertex.y;
    const length = Math.hypot(dirX, dirY) || 1;
    return {
      x: vertex.x + (dirX / length) * distance,
      y: vertex.y + (dirY / length) * distance,
    };
  }

  const sideLabelA = midOutside(pB, pC, pA, 18);
  const sideLabelB = midOutside(pA, pC, pB, 18);
  const sideLabelC = midOutside(pA, pB, pC, 18);
  const angleLabelA = inwardLabel(pA, pB, pC, 28);
  const angleLabelB = inwardLabel(pB, pA, pC, 28);
  const angleLabelC = inwardLabel(pC, pA, pB, 28);

  const numberFormatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 3,
    useGrouping: false,
  });
  const fmt = (value: number): string => numberFormatter.format(value);

  return `
<svg
  viewBox="0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}"
  xmlns="http://www.w3.org/2000/svg"
  class="triangle-svg"
  role="img"
  aria-label="Triangle visualization"
>
  <polygon
    points="${pA.x},${pA.y} ${pB.x},${pB.y} ${pC.x},${pC.y}"
    class="triangle-shape"
  />
  <circle cx="${pA.x}" cy="${pA.y}" r="3" class="vertex-dot" />
  <circle cx="${pB.x}" cy="${pB.y}" r="3" class="vertex-dot" />
  <circle cx="${pC.x}" cy="${pC.y}" r="3" class="vertex-dot" />

  <text x="${sideLabelA.x}" y="${sideLabelA.y}" class="side-label">a = ${fmt(a)}</text>
  <text x="${sideLabelB.x}" y="${sideLabelB.y}" class="side-label">b = ${fmt(b)}</text>
  <text x="${sideLabelC.x}" y="${sideLabelC.y}" class="side-label">c = ${fmt(c)}</text>

  <text x="${angleLabelA.x}" y="${angleLabelA.y}" class="angle-label">A ${fmt(A)}°</text>
  <text x="${angleLabelB.x}" y="${angleLabelB.y}" class="angle-label">B ${fmt(B)}°</text>
  <text x="${angleLabelC.x}" y="${angleLabelC.y}" class="angle-label">C ${fmt(C)}°</text>
</svg>
`;
}
