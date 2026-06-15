// Renders a solved triangle as an SVG string.
//
// Convention (same as solver.ts): side `a` is opposite angle `A`. We place the
// triangle in math coordinates, then flip Y so it reads naturally (apex up) in
// SVG's y-down space. Labels are pushed outward from the centroid so they clear
// the edges; the right angle (if any) gets a small square marker.

import type { Key, Triangle } from "./solver.js";

const DEG2RAD = Math.PI / 180;

// SVG canvas. The viewBox is fixed; the triangle is scaled to fit inside a
// padded box so labels never clip regardless of the triangle's real size.
const VIEW = 320;
const PADDING = 52; // room for labels outside the triangle
const CENTER = VIEW / 2;

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

// Build a placement function: math-space points → SVG-space, centred on the
// triangle's centroid and scaled so the farthest of `points` from that centroid
// just fits within the padded half-view. Centring on the centroid (rather than
// the bounding box) and bounding by *radius* makes the result rotation-safe:
// the figure can be spun about the view centre afterwards and never clips a
// corner, because every point stays within `CENTER - PADDING` of the centre.
// `extra` lets non-vertex geometry (the Thales arc) widen the fit so it, too,
// stays inside the canvas.
function placer(
  vertices: [Point, Point, Point],
  extra: Point[] = [],
): (point: Point) => Point {
  const pivot = centroid(vertices[0], vertices[1], vertices[2]);
  const radius =
    Math.max(
      ...[...vertices, ...extra].map((point) =>
        Math.hypot(point.x - pivot.x, point.y - pivot.y),
      ),
    ) || 1;
  const scale = (CENTER - PADDING) / radius;
  return (point: Point): Point => ({
    x: CENTER + (point.x - pivot.x) * scale,
    // Flip Y: math-up becomes SVG-down.
    y: CENTER - (point.y - pivot.y) * scale,
  });
}

// Scale + translate the raw vertices to fit the padded viewBox, flipping Y.
export function fitToView(raw: { A: Point; B: Point; C: Point }): {
  A: Point;
  B: Point;
  C: Point;
} {
  const place = placer([raw.A, raw.B, raw.C]);
  return { A: place(raw.A), B: place(raw.B), C: place(raw.C) };
}

// Rotate an already-placed (SVG-space) point about the view centre. Positive
// `degrees` reads clockwise on screen, matching a clockwise drag/twist — we
// rotate the anchor points and re-emit horizontal <text>, so glyphs stay
// upright (unlike wrapping the SVG in a <g transform="rotate">).
function rotateAboutCenter(point: Point, degrees: number): Point {
  if (!degrees) return point;
  const radians = degrees * DEG2RAD;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - CENTER;
  const dy = point.y - CENTER;
  return {
    x: CENTER + dx * cos - dy * sin,
    y: CENTER + dx * sin + dy * cos,
  };
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
// degree value placed just inside the triangle along the angle bisector. In a
// preview, `showValue` is false for angles the user hasn't entered — we then
// draw only a plain arc (no square, no number), so the diagram never asserts a
// guessed angle.
function angleAnnotation(
  corner: Point,
  toward1: Point,
  toward2: Point,
  value: number,
  showValue = true,
): string {
  const right = isRightAngle(value) && showValue;
  const marker = right
    ? rightAngleMarker(corner, toward1, toward2)
    : angleArc(corner, toward1, toward2);
  if (!showValue) return marker;

  const u1 = unitVector(corner, toward1);
  const u2 = unitVector(corner, toward2);
  let bx = u1.x + u2.x;
  let by = u1.y + u2.y;
  const length = Math.hypot(bx, by) || 1;
  bx /= length;
  by /= length;
  // Sit far enough along the bisector that the value clears both edges. A
  // narrow angle's edges nearly meet, so the label must sit deeper in — the
  // edge clearance at distance d is d·sin(angle/2), so scale by 1/sin. Capped
  // so it can't shoot past the opposite side on very sharp angles.
  const halfAngle = Math.max(value / 2, 8) * DEG2RAD;
  const clearance = 24 / Math.sin(halfAngle);
  const distance = Math.min(80, Math.max(right ? 34 : 40, clearance));
  const labelX = corner.x + bx * distance;
  const labelY = corner.y + by * distance;
  const label = `<text x="${labelX.toFixed(1)}" y="${labelY.toFixed(
    1,
  )}" class="tri-angle-label" text-anchor="middle" dominant-baseline="middle">${formatLabel(
    value,
  )}°</text>`;

  return marker + label;
}

// A vertex letter, placed just outside the triangle (away from the centroid).
function vertexLabel(point: Point, center: Point, key: string): string {
  const at = outward(point, center, 22);
  return `<text x="${at.x.toFixed(1)}" y="${at.y.toFixed(
    1,
  )}" class="tri-vertex-label" text-anchor="middle" dominant-baseline="middle">${key}</text>`;
}

// A side label (letter, optionally with a value), placed outside the edge.
function sideLabel(p1: Point, p2: Point, center: Point, text: string): string {
  const at = outward(midpoint(p1, p2), center, 20);
  return `<text x="${at.x.toFixed(1)}" y="${at.y.toFixed(
    1,
  )}" class="tri-side-label" text-anchor="middle" dominant-baseline="middle">${text}</text>`;
}

// Satz des Thales: in a right triangle the hypotenuse is the diameter of the
// circumscribed circle, and the right-angle vertex lies exactly on that circle.
// We return the semicircle over the hypotenuse (the arc that passes through the
// right-angle vertex) as sampled math-space points — empty if not right-angled.
// Sampling (rather than an SVG arc command) lets the points both widen the fit
// and render as a <polyline>, the same sweep-flag-free approach as angleArc.
function thalesArcPoints(
  triangle: Triangle,
  raw: { A: Point; B: Point; C: Point },
): Point[] {
  // Find the right-angle vertex; the other two span the hypotenuse.
  const rightVertex = isRightAngle(triangle.A)
    ? { corner: raw.A, ends: [raw.B, raw.C] as const }
    : isRightAngle(triangle.B)
      ? { corner: raw.B, ends: [raw.A, raw.C] as const }
      : isRightAngle(triangle.C)
        ? { corner: raw.C, ends: [raw.A, raw.B] as const }
        : null;
  if (!rightVertex) return [];

  const [start, end] = rightVertex.ends;
  const center = midpoint(start, end);
  const radius = Math.hypot(end.x - start.x, end.y - start.y) / 2;
  const angleStart = Math.atan2(start.y - center.y, start.x - center.x);
  const angleCorner = Math.atan2(
    rightVertex.corner.y - center.y,
    rightVertex.corner.x - center.x,
  );
  // Sweep from `start` toward the side the right-angle vertex sits on, so the
  // arc passes through it and bulges away from the hypotenuse.
  const TWO_PI = Math.PI * 2;
  const toCorner = (angleCorner - angleStart + TWO_PI) % TWO_PI;
  const direction = toCorner < Math.PI ? 1 : -1;

  const samples = 48;
  const points: Point[] = [];
  for (let step = 0; step <= samples; step += 1) {
    const angle = angleStart + direction * (step / samples) * Math.PI;
    points.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    });
  }
  return points;
}

// Render placed (and rotated) Thales arc points as a polyline.
function thalesArc(points: Point[]): string {
  if (points.length === 0) return "";
  const coords = points
    .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");
  return `<polyline points="${coords}" class="tri-thales" />`;
}

// Placeholder shown before anything is solved: a reference triangle that names
// where the sides (a, b, c) and vertices (A, B, C) sit, matching the solved
// layout (C apex, A bottom-left, B bottom-right; side a opposite vertex A …).
// Defined in math space and run through the same placer + rotation as a solved
// triangle, so it can be spun to match a real-world object before any value is
// entered — and so the fit reserves label room at every angle.
export function placeholderSvg(rotation = 0): string {
  const raw = {
    C: { x: 0, y: 1 }, // apex
    A: { x: -1, y: -0.7 }, // bottom-left
    B: { x: 1, y: -0.7 }, // bottom-right
  };
  const place = placer([raw.A, raw.B, raw.C]);
  const put = (point: Point): Point =>
    rotateAboutCenter(place(point), rotation);
  const apexC = put(raw.C);
  const leftA = put(raw.A);
  const rightB = put(raw.B);
  const center = centroid(apexC, leftA, rightB);
  const corners = [apexC, leftA, rightB]
    .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");
  return [
    `<svg viewBox="0 0 ${VIEW} ${VIEW}" xmlns="http://www.w3.org/2000/svg" class="tri tri-placeholder" role="img" aria-label="Noch kein Dreieck – Beschriftung">`,
    `<polygon points="${corners}" class="tri-edge" />`,
    sideLabel(rightB, apexC, center, "a"),
    sideLabel(leftA, apexC, center, "b"),
    sideLabel(leftA, rightB, center, "c"),
    vertexLabel(apexC, center, "C"),
    vertexLabel(leftA, center, "A"),
    vertexLabel(rightB, center, "B"),
    `</svg>`,
  ].join("");
}

type TriangleSvgOptions = {
  // Provisional (partial) preview: dashed outline instead of a solid fill.
  provisional?: boolean;
  // Which keys show their numeric value. Omitted → all do (a fully-solved
  // triangle). In a preview, only the keys the user entered are set, so guessed
  // sides/angles render as bare letters.
  valued?: Partial<Record<Key, boolean>>;
};

// Render a triangle, optionally rotated by `rotation` degrees (clockwise on
// screen) so the user can align it with their real-world setup. With
// `provisional`/`valued` it renders a partial preview (see TriangleSvgOptions).
export function triangleSvg(
  triangle: Triangle,
  rotation = 0,
  options: TriangleSvgOptions = {},
): string {
  const showValue = (key: Key): boolean =>
    options.valued ? Boolean(options.valued[key]) : true;

  const raw = rawVertices(triangle);
  const arcRaw = thalesArcPoints(triangle, raw);

  // Fit once over vertices + arc so the (rotation-invariant) scale leaves room
  // for both; then place and spin every point in screen space.
  const place = placer([raw.A, raw.B, raw.C], arcRaw);
  const put = (point: Point): Point => rotateAboutCenter(place(point), rotation);
  const A = put(raw.A);
  const B = put(raw.B);
  const C = put(raw.C);
  const arc = arcRaw.map(put);
  const center = centroid(A, B, C);

  // Angle markers (arc or right-angle square) + the degree value at each vertex.
  const markers: string[] = [
    angleAnnotation(A, B, C, triangle.A, showValue("A")),
    angleAnnotation(B, A, C, triangle.B, showValue("B")),
    angleAnnotation(C, A, B, triangle.C, showValue("C")),
  ];

  const corners = `${A.x.toFixed(1)},${A.y.toFixed(1)} ${B.x.toFixed(
    1,
  )},${B.y.toFixed(1)} ${C.x.toFixed(1)},${C.y.toFixed(1)}`;
  const face = options.provisional
    ? `<polygon points="${corners}" class="tri-edge" />`
    : `<polygon points="${corners}" class="tri-face" />`;

  return [
    `<svg viewBox="0 0 ${VIEW} ${VIEW}" xmlns="http://www.w3.org/2000/svg" class="tri" role="img" aria-label="Gelöstes Dreieck">`,
    // Thales semicircle behind the face so the translucent fill sits on top.
    thalesArc(arc),
    face,
    ...markers,
    // Side a is opposite vertex A → the edge between B and C, etc.
    sideLabel(B, C, center, showValue("a") ? `a=${formatLabel(triangle.a)}` : "a"),
    sideLabel(A, C, center, showValue("b") ? `b=${formatLabel(triangle.b)}` : "b"),
    sideLabel(A, B, center, showValue("c") ? `c=${formatLabel(triangle.c)}` : "c"),
    vertexLabel(A, center, "A"),
    vertexLabel(B, center, "B"),
    vertexLabel(C, center, "C"),
    `</svg>`,
  ].join("");
}

// Short label number: trim to ~3 significant decimals, drop trailing zeros.
export function formatLabel(value: number): string {
  return Number(value.toFixed(2)).toString();
}
