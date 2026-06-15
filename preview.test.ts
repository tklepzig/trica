import { buildPreviewTriangle, completeForPreview } from "./preview.js";
import type { TriangleInput } from "./solver.js";

describe("completeForPreview", () => {
  it("keeps the entered values untouched", () => {
    const completed = completeForPreview({ c: 5 });
    expect(completed).not.toBeNull();
    expect(completed!.c).toBe(5);
  });

  it("fills a lone side into an equilateral default", () => {
    const completed = completeForPreview({ c: 5 })!;
    expect(completed.A).toBe(60);
    expect(completed.B).toBe(60);
    expect(completed.C).toBe(60);
  });

  it("splits the remaining budget when one angle is given", () => {
    const completed = completeForPreview({ A: 90 })!;
    expect(completed.A).toBe(90);
    expect(completed.B).toBe(45);
    expect(completed.C).toBe(45);
    // No side given → a unit scale is added so the shape can be drawn.
    expect(completed.c).toBe(1);
  });

  it("fixes two sides with the included angle (SAS), not free angles", () => {
    // Sides a and b meet at vertex C → C is the included angle.
    const completed = completeForPreview({ a: 3, b: 4 })!;
    expect(completed.a).toBe(3);
    expect(completed.b).toBe(4);
    expect(completed.C).toBe(60);
    expect(completed.A).toBeUndefined();
    expect(completed.B).toBeUndefined();
  });

  it("determines the third angle from two given angles", () => {
    const completed = completeForPreview({ A: 50, B: 60 })!;
    expect(completed.C).toBe(70);
    expect(completed.c).toBe(1);
  });

  it("rejects angle sets that cannot form a triangle", () => {
    expect(completeForPreview({ A: 100, B: 100 })).toBeNull();
    expect(completeForPreview({ A: 200 })).toBeNull();
    expect(completeForPreview({ A: 60, B: 60, C: 70 })).toBeNull(); // sum ≠ 180
  });

  it("passes already-sufficient input straight through for the solver to judge", () => {
    const input: TriangleInput = { a: 3, b: 4, c: 5 };
    expect(completeForPreview(input)).toEqual(input);
  });
});

describe("buildPreviewTriangle", () => {
  it("honours a single entered side", () => {
    const triangle = buildPreviewTriangle({ c: 5 })!;
    expect(triangle.c).toBeCloseTo(5, 6);
    // Equilateral default → all sides equal.
    expect(triangle.a).toBeCloseTo(5, 6);
  });

  it("honours an entered right angle", () => {
    const triangle = buildPreviewTriangle({ A: 90 })!;
    expect(triangle.A).toBeCloseTo(90, 6);
  });

  it("honours two entered sides", () => {
    const triangle = buildPreviewTriangle({ a: 3, b: 4 })!;
    expect(triangle.a).toBeCloseTo(3, 6);
    expect(triangle.b).toBeCloseTo(4, 6);
  });

  it("honours a side and an angle together", () => {
    const triangle = buildPreviewTriangle({ c: 5, A: 90 })!;
    expect(triangle.c).toBeCloseTo(5, 6);
    expect(triangle.A).toBeCloseTo(90, 6);
  });

  it("returns null for an impossible triangle", () => {
    // Violates the triangle inequality; the solver rejects it.
    expect(buildPreviewTriangle({ a: 1, b: 1, c: 10 })).toBeNull();
    expect(buildPreviewTriangle({ A: 100, B: 100 })).toBeNull();
  });
});
