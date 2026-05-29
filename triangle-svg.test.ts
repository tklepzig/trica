import {
  fitToView,
  formatLabel,
  isRightAngle,
  placeholderSvg,
  rawVertices,
  triangleSvg,
} from "./triangle-svg.js";
import type { Triangle } from "./solver.js";

// The renderer's viewBox is 0..320 (must match VIEW in triangle-svg.ts).
const VIEW = 320;

// A clean equilateral (side 2) gives exact-ish coordinates to assert against.
const EQUILATERAL: Triangle = { a: 2, b: 2, c: 2, A: 60, B: 60, C: 60 };

// 3-4-5 right triangle, right angle at C.
const RIGHT: Triangle = { a: 3, b: 4, c: 5, A: 36.8699, B: 53.1301, C: 90 };

describe("isRightAngle", () => {
  it("accepts 90 and values within tolerance", () => {
    expect(isRightAngle(90)).toBe(true);
    expect(isRightAngle(90.04)).toBe(true);
    expect(isRightAngle(89.96)).toBe(true);
  });

  it("rejects clearly non-right angles", () => {
    expect(isRightAngle(89.9)).toBe(false);
    expect(isRightAngle(60)).toBe(false);
    expect(isRightAngle(0)).toBe(false);
  });
});

describe("formatLabel", () => {
  it("drops trailing zeros", () => {
    expect(formatLabel(5)).toBe("5");
    expect(formatLabel(3.1)).toBe("3.1");
  });

  it("rounds to two decimals", () => {
    expect(formatLabel(4.2426)).toBe("4.24"); // rounds down
    expect(formatLabel(1.236)).toBe("1.24"); // rounds up
  });
});

describe("rawVertices", () => {
  it("places A at the origin and B along +x at distance c", () => {
    const { A, B } = rawVertices(EQUILATERAL);
    expect(A).toEqual({ x: 0, y: 0 });
    expect(B.x).toBeCloseTo(2, 6);
    expect(B.y).toBeCloseTo(0, 6);
  });

  it("places C using angle A and side b", () => {
    // C = (b·cosA, b·sinA) = (2·cos60, 2·sin60) = (1, √3)
    const { C } = rawVertices(EQUILATERAL);
    expect(C.x).toBeCloseTo(1, 6);
    expect(C.y).toBeCloseTo(Math.sqrt(3), 6);
  });
});

describe("fitToView", () => {
  it("keeps every vertex inside the viewBox", () => {
    const fitted = fitToView(rawVertices(RIGHT));
    for (const point of [fitted.A, fitted.B, fitted.C]) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(VIEW);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(VIEW);
    }
  });

  it("flips Y so the apex sits above the base (smaller SVG y)", () => {
    // In EQUILATERAL, C is the apex (A and B form the base).
    const fitted = fitToView(rawVertices(EQUILATERAL));
    expect(fitted.C.y).toBeLessThan(fitted.A.y);
    expect(fitted.C.y).toBeLessThan(fitted.B.y);
    // Base vertices share a Y after the flip.
    expect(fitted.A.y).toBeCloseTo(fitted.B.y, 6);
  });

  it("scales uniformly (no aspect distortion: angles preserved)", () => {
    const fitted = fitToView(rawVertices(RIGHT));
    // Angle at C should remain 90° after fit. Use the normalised cosine so the
    // check is scale-independent (the raw dot product is in ~200px² units).
    const ca = { x: fitted.A.x - fitted.C.x, y: fitted.A.y - fitted.C.y };
    const cb = { x: fitted.B.x - fitted.C.x, y: fitted.B.y - fitted.C.y };
    const cosAngle =
      (ca.x * cb.x + ca.y * cb.y) /
      (Math.hypot(ca.x, ca.y) * Math.hypot(cb.x, cb.y));
    expect(cosAngle).toBeCloseTo(0, 4);
  });
});

describe("triangleSvg", () => {
  it("emits a right-angle marker only when a right angle is present", () => {
    expect(triangleSvg(RIGHT)).toContain("tri-right-angle");
    expect(triangleSvg(EQUILATERAL)).not.toContain("tri-right-angle");
  });

  it("labels all three vertices and sides", () => {
    const svg = triangleSvg(RIGHT);
    expect(svg).toContain(">A</text>");
    expect(svg).toContain(">B</text>");
    expect(svg).toContain(">C</text>");
    expect(svg).toContain("a=3");
    expect(svg).toContain("b=4");
    expect(svg).toContain("c=5");
  });
});

describe("placeholderSvg", () => {
  it("renders a labelled reference triangle", () => {
    const svg = placeholderSvg();
    expect(svg).toContain("tri-placeholder");
    // Vertices and sides are named so the layout is clear before any input.
    expect(svg).toContain(">A</text>");
    expect(svg).toContain(">a</text>");
  });
});
