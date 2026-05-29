// Renders a solved triangle as an SVG string.
//
// Convention (same as solver.ts): side `a` is opposite angle `A`. We place the
// triangle in math coordinates, then flip Y so it reads naturally (apex up) in
// SVG's y-down space. Labels are pushed outward from the centroid so they clear
// the edges; the right angle (if any) gets a small square marker.

import type { Triangle } from "./solver.js";

const DEG2RAD = Math.PI / 180;

// SVG canvas. The viewBox is fixed; the triangle is scaled to fit inside a
// padded box so labels never clip regardless of the triangle's real size.
const VIEW = 320;
const PADDING = 52; // room for labels outside the triangle

type Point = { x: number; y: number };

// Is this angle (degrees) close enough to 90 to mark as a right angle?
// Exported for unit testing alongside the other pure geometry helpers below.
export function isRightAngle(angle: number): boolean {
  return Math.abs(angle - 90) < 0.05;
}

// Place the three vertices in math space from the side lengths and angle A.
// A at origin; B along +x at distance c (side c = AB); C at angle A above AB
// at distance b (side b = AC).
export function rawVertices(triangle: Triangle): { A: Point; B: Point; C: Point } {
  const A: Point = { x: 0, y: 0 };
  const B: Point = { x: triangle.c, y: 0 };
  const C: Point = {
    x: triangle.b * Math.cos(triangle.A * DEG2RAD),
    y: triangle.b * Math.sin(triangle.A * DEG2RAD),
  };
  return { A, B, C };
}

// Scale + translate the raw vertices to fit the padded viewBox, flipping Y.
export function fitToView(raw: { A: Point; B: Point; C: Point }): {
  A: Point;
  B: Point;
  C: Point;
} {
  const points = [raw.A, raw.B, raw.C];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const available = VIEW - PADDING * 2;
  const scale = Math.min(available / spanX, available / spanY);

  // Centre the scaled triangle in the viewBox.
  const drawnWidth = spanX * scale;
  const drawnHeight = spanY * scale;
  const offsetX = (VIEW - drawnWidth) / 2;
  const offsetY = (VIEW - drawnHeight) / 2;

  const place = (point: Point): Point => ({
    x: offsetX + (point.x - minX) * scale,
    // Flip Y: math-up becomes SVG-down.
    y: VIEW - (offsetY + (point.y - minY) * scale),
  });

  return { A: place(raw.A), B: place(raw.B), C: place(raw.C) };
}

function centroid(A: Point, B: Point, C: Point): Point {
  return { x: (A.x + B.x + C.x) / 3, y: (A.y + B.y + C.y) / 3 };
}

// Push a point away from the centroid by `distance` px (for outward labels).
function outward(point: Point, from: Point, distance: number): Point {
  const dx = point.x - from.x;
  const dy = point.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: point.x + (dx / length) * distance,
    y: point.y + (dy / length) * distance,
  };
}

function midpoint(p1: Point, p2: Point): Point {
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}

// A small right-angle square at vertex `corner`, oriented into the triangle
// along its two adjacent edges.
function rightAngleMarker(corner: Point, toward1: Point, toward2: Point): string {
  const size = 16;
  const unit = (from: Point, to: Point): Point => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length };
  };
  const u1 = unit(corner, toward1);
  const u2 = unit(corner, toward2);
  const p1 = { x: corner.x + u1.x * size, y: corner.y + u1.y * size };
  const p3 = { x: corner.x + u2.x * size, y: corner.y + u2.y * size };
  const p2 = {
    x: corner.x + (u1.x + u2.x) * size,
    y: corner.y + (u1.y + u2.y) * size,
  };
  return `<polyline points="${p1.x.toFixed(1)},${p1.y.toFixed(1)} ${p2.x.toFixed(
    1,
  )},${p2.y.toFixed(1)} ${p3.x.toFixed(1)},${p3.y.toFixed(1)}" class="tri-right-angle" />`;
}

// Unit vector pointing from `from` to `to`.
function unitVector(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

// An arc marking the interior angle at `corner`, traced as a polyline between
// the two adjacent edges (nlerp between the edge directions — always the minor
// arc, so no SVG sweep-flag guesswork).
function angleArc(corner: Point, toward1: Point, toward2: Point): string {
  const u1 = unitVector(corner, toward1);
  const u2 = unitVector(corner, toward2);
  const radius = 20;
  const samples = 14;
  const points: string[] = [];
  for (let step = 0; step <= samples; step += 1) {
    const t = step / samples;
    let dx = (1 - t) * u1.x + t * u2.x;
    let dy = (1 - t) * u1.y + t * u2.y;
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    points.push(
      `${(corner.x + radius * dx).toFixed(1)},${(corner.y + radius * dy).toFixed(1)}`,
    );
  }
  return `<polyline points="${points.join(" ")}" class="tri-angle-arc" />`;
}

// The angle at `corner`: a right-angle square (if ~90°) or an arc, plus the
// degree value placed just inside the triangle along the angle bisector.
function angleAnnotation(
  corner: Point,
  toward1: Point,
  toward2: Point,
  value: number,
): string {
  const right = isRightAngle(value);
  const marker = right
    ? rightAngleMarker(corner, toward1, toward2)
    : angleArc(corner, toward1, toward2);

  const u1 = unitVector(corner, toward1);
  const u2 = unitVector(corner, toward2);
  let bx = u1.x + u2.x;
  let by = u1.y + u2.y;
  const length = Math.hypot(bx, by) || 1;
  bx /= length;
  by /= length;
  const distance = right ? 30 : 34;
  const labelX = corner.x + bx * distance;
  const labelY = corner.y + by * distance;
  const label = `<text x="${labelX.toFixed(1)}" y="${labelY.toFixed(
    1,
  )}" class="tri-angle-label" text-anchor="middle" dominant-baseline="middle">${formatLabel(
    value,
  )}°</text>`;

  return marker + label;
}

// Faint placeholder shown before anything is solved.
export function placeholderSvg(): string {
  const p = PADDING + 8;
  const apex = { x: VIEW / 2, y: p };
  const left = { x: p, y: VIEW - p };
  const right = { x: VIEW - p, y: VIEW - p };
  return [
    `<svg viewBox="0 0 ${VIEW} ${VIEW}" xmlns="http://www.w3.org/2000/svg" class="tri tri-placeholder" role="img" aria-label="No triangle yet">`,
    `<polygon points="${apex.x},${apex.y} ${left.x},${left.y} ${right.x},${right.y}" class="tri-edge" />`,
    `<text x="${VIEW / 2}" y="${VIEW / 2 + 28}" class="tri-hint" text-anchor="middle">Werte eingeben</text>`,
    `</svg>`,
  ].join("");
}

// Render a fully-solved triangle.
export function triangleSvg(triangle: Triangle): string {
  const fitted = fitToView(rawVertices(triangle));
  const { A, B, C } = fitted;
  const center = centroid(A, B, C);

  const vertexLabel = (point: Point, key: string): string => {
    const at = outward(point, center, 22);
    return `<text x="${at.x.toFixed(1)}" y="${at.y.toFixed(
      1,
    )}" class="tri-vertex-label" text-anchor="middle" dominant-baseline="middle">${key}</text>`;
  };

  // Side a is opposite vertex A → the edge between B and C, etc.
  const sideLabel = (p1: Point, p2: Point, key: string, value: number): string => {
    const at = outward(midpoint(p1, p2), center, 20);
    return `<text x="${at.x.toFixed(1)}" y="${at.y.toFixed(
      1,
    )}" class="tri-side-label" text-anchor="middle" dominant-baseline="middle">${key}=${formatLabel(
      value,
    )}</text>`;
  };

  // Angle markers (arc or right-angle square) + the degree value at each vertex.
  const markers: string[] = [
    angleAnnotation(A, B, C, triangle.A),
    angleAnnotation(B, A, C, triangle.B),
    angleAnnotation(C, A, B, triangle.C),
  ];

  return [
    `<svg viewBox="0 0 ${VIEW} ${VIEW}" xmlns="http://www.w3.org/2000/svg" class="tri" role="img" aria-label="Solved triangle">`,
    `<polygon points="${A.x.toFixed(1)},${A.y.toFixed(1)} ${B.x.toFixed(
      1,
    )},${B.y.toFixed(1)} ${C.x.toFixed(1)},${C.y.toFixed(1)}" class="tri-face" />`,
    ...markers,
    sideLabel(B, C, "a", triangle.a),
    sideLabel(A, C, "b", triangle.b),
    sideLabel(A, B, "c", triangle.c),
    vertexLabel(A, "A"),
    vertexLabel(B, "B"),
    vertexLabel(C, "C"),
    `</svg>`,
  ].join("");
}

// Short label number: trim to ~3 significant decimals, drop trailing zeros.
export function formatLabel(value: number): string {
  return Number(value.toFixed(2)).toString();
}
