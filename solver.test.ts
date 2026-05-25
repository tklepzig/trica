import { solve, isPythagorasApplicable } from "./solver";

// Match a number to a target with an absolute tolerance.
function close(actual: number, expected: number, tolerance = 1e-4): void {
  expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
}

describe("solve - underdetermined", () => {
  test("no inputs → underdetermined", () => {
    const result = solve({});
    expect(result.kind).toBe("underdetermined");
  });

  test("one side only → underdetermined", () => {
    const result = solve({ a: 5 });
    expect(result.kind).toBe("underdetermined");
  });

  test("two sides only → underdetermined", () => {
    const result = solve({ a: 5, b: 7 });
    expect(result.kind).toBe("underdetermined");
  });

  test("three angles (summing to 180) but no side → underdetermined (no scale)", () => {
    const result = solve({ A: 60, B: 60, C: 60 });
    expect(result.kind).toBe("underdetermined");
  });

  test("two angles but no side → underdetermined", () => {
    const result = solve({ A: 50, B: 60 });
    expect(result.kind).toBe("underdetermined");
  });
});

describe("solve - SSS", () => {
  test("3-4-5 right triangle", () => {
    const result = solve({ a: 3, b: 4, c: 5 });
    expect(result.kind).toBe("unique");
    if (result.kind !== "unique") return;
    expect(result.method).toBe("SSS");
    close(result.triangle.A, 36.8699);
    close(result.triangle.B, 53.1301);
    close(result.triangle.C, 90);
    expect(result.derived.isRight).toBe(true);
    close(result.derived.area, 6);
    close(result.derived.perimeter, 12);
  });

  test("equilateral", () => {
    const result = solve({ a: 1, b: 1, c: 1 });
    expect(result.kind).toBe("unique");
    if (result.kind !== "unique") return;
    close(result.triangle.A, 60);
    close(result.triangle.B, 60);
    close(result.triangle.C, 60);
    expect(result.derived.isEquilateral).toBe(true);
    expect(result.derived.isIsoceles).toBe(false);
  });

  test("isoceles", () => {
    const result = solve({ a: 5, b: 5, c: 6 });
    expect(result.kind).toBe("unique");
    if (result.kind !== "unique") return;
    expect(result.derived.isIsoceles).toBe(true);
    expect(result.derived.isEquilateral).toBe(false);
    close(result.triangle.A, result.triangle.B);
  });

  test("triangle inequality violation → impossible", () => {
    const result = solve({ a: 1, b: 2, c: 10 });
    expect(result.kind).toBe("impossible");
  });

  test("degenerate (a + b = c) → impossible", () => {
    const result = solve({ a: 3, b: 4, c: 7 });
    expect(result.kind).toBe("impossible");
  });
});

describe("solve - SAS", () => {
  test("two sides and included angle", () => {
    // a=5, b=7, C=60° (C is between a and b)
    const result = solve({ a: 5, b: 7, C: 60 });
    expect(result.kind).toBe("unique");
    if (result.kind !== "unique") return;
    expect(result.method).toBe("SAS");
    // c² = 25 + 49 - 2·5·7·cos60° = 74 - 35 = 39 → c ≈ 6.2450
    close(result.triangle.c, Math.sqrt(39));
  });

  test("right triangle via SAS (legs 3 and 4, included angle 90)", () => {
    const result = solve({ a: 3, b: 4, C: 90 });
    expect(result.kind).toBe("unique");
    if (result.kind !== "unique") return;
    close(result.triangle.c, 5);
    expect(result.derived.isRight).toBe(true);
  });
});

describe("solve - ASA / AAS", () => {
  test("ASA: two angles + included side", () => {
    // A=40°, B=80°, c=5 (c is between A and B since c is opposite C)
    const result = solve({ A: 40, B: 80, c: 5 });
    expect(result.kind).toBe("unique");
    if (result.kind !== "unique") return;
    expect(result.method).toBe("ASA");
    close(result.triangle.C, 60);
  });

  test("AAS: two angles + non-included side", () => {
    // A=40°, B=80°, a=5 (a is opposite A, one of the given angles)
    const result = solve({ A: 40, B: 80, a: 5 });
    expect(result.kind).toBe("unique");
    if (result.kind !== "unique") return;
    expect(result.method).toBe("AAS");
    close(result.triangle.C, 60);
  });

  test("angles already sum to ≥ 180 → impossible", () => {
    const result = solve({ A: 100, B: 90, a: 5 });
    expect(result.kind).toBe("impossible");
  });
});

describe("solve - SSA (ambiguous case)", () => {
  test("two solutions", () => {
    // Classic ambiguous: A=40°, a=7, b=10 → two valid triangles.
    const result = solve({ A: 40, a: 7, b: 10 });
    expect(result.kind).toBe("ambiguous");
    if (result.kind !== "ambiguous") return;
    const [t1, t2] = result.triangles;
    // The two B values are supplementary.
    close(t1.B + t2.B, 180);
  });

  test("one solution (right-angle boundary)", () => {
    // A=30°, a=5, b=10: sin B = 10·sin30°/5 = 1 → B=90° exactly. Unique.
    const result = solve({ A: 30, a: 5, b: 10 });
    expect(result.kind).toBe("unique");
    if (result.kind !== "unique") return;
    close(result.triangle.B, 90);
  });

  test("no solution (side too short)", () => {
    // A=60°, a=1, b=10: sin B = 10·sin60°/1 ≈ 8.66 > 1 → impossible.
    const result = solve({ A: 60, a: 1, b: 10 });
    expect(result.kind).toBe("impossible");
  });

  test("one solution (obtuse known angle eliminates ambiguity)", () => {
    // When the known angle is obtuse, only one triangle is possible.
    const result = solve({ A: 120, a: 10, b: 5 });
    expect(result.kind).toBe("unique");
  });
});

describe("solve - right triangle (Pythagoras)", () => {
  test("two legs given + 90° angle (SAS with C=90)", () => {
    const result = solve({ a: 3, b: 4, C: 90 });
    expect(result.kind).toBe("unique");
    if (result.kind !== "unique") return;
    close(result.triangle.c, 5);
  });

  test("leg + hypotenuse + 90° (SSA with right angle)", () => {
    // C=90°, c=5 (hypotenuse), a=3 → b=4
    const result = solve({ C: 90, c: 5, a: 3 });
    expect(result.kind).toBe("unique");
    if (result.kind !== "unique") return;
    close(result.triangle.b, 4);
  });

  test("isPythagorasApplicable detects 90° input", () => {
    expect(isPythagorasApplicable({ C: 90 })).toBe(true);
    expect(isPythagorasApplicable({ A: 90 })).toBe(true);
    expect(isPythagorasApplicable({ a: 3, b: 4, c: 5 })).toBe(true);
    expect(isPythagorasApplicable({ a: 3, b: 4, c: 6 })).toBe(false);
  });
});

describe("solve - over-specified", () => {
  test("4 consistent values → unique", () => {
    // 3-4-5 right triangle with C=90 explicitly given.
    const result = solve({ a: 3, b: 4, c: 5, C: 90 });
    expect(result.kind).toBe("unique");
  });

  test("4 inconsistent values → inconsistent", () => {
    // 3-4-5 but with C explicitly set wrong.
    const result = solve({ a: 3, b: 4, c: 5, C: 60 });
    expect(result.kind).toBe("inconsistent");
  });

  test("6 fully consistent values → unique", () => {
    // First compute a known triangle then re-feed it all back.
    const seed = solve({ a: 5, b: 7, C: 60 });
    if (seed.kind !== "unique") throw new Error("seed failed");
    const t = seed.triangle;
    const result = solve({ a: t.a, b: t.b, c: t.c, A: t.A, B: t.B, C: t.C });
    expect(result.kind).toBe("unique");
  });

  test("3 angles with sum ≠ 180 → inconsistent", () => {
    const result = solve({ A: 60, B: 60, C: 70, a: 5 });
    expect(result.kind).toBe("inconsistent");
  });
});

describe("solve - invalid inputs", () => {
  test("negative side → impossible", () => {
    const result = solve({ a: -3, b: 4, c: 5 });
    expect(result.kind).toBe("impossible");
  });

  test("zero side → impossible", () => {
    const result = solve({ a: 0, b: 4, c: 5 });
    expect(result.kind).toBe("impossible");
  });

  test("angle ≥ 180 → impossible", () => {
    const result = solve({ A: 180, B: 60, a: 5 });
    expect(result.kind).toBe("impossible");
  });

  test("NaN → impossible", () => {
    const result = solve({ a: NaN, b: 4, c: 5 });
    expect(result.kind).toBe("impossible");
  });
});

describe("solve - derived quantities", () => {
  test("3-4-5: area=6, perimeter=12, inradius=1, circumradius=2.5", () => {
    const result = solve({ a: 3, b: 4, c: 5 });
    if (result.kind !== "unique") throw new Error();
    close(result.derived.area, 6);
    close(result.derived.perimeter, 12);
    close(result.derived.inradius, 1);
    close(result.derived.circumradius, 2.5);
  });

  test("equilateral side 2: area = √3", () => {
    const result = solve({ a: 2, b: 2, c: 2 });
    if (result.kind !== "unique") throw new Error();
    close(result.derived.area, Math.sqrt(3));
  });

  test("altitudes correct for 3-4-5", () => {
    const result = solve({ a: 3, b: 4, c: 5 });
    if (result.kind !== "unique") throw new Error();
    // h_a = 2·area/a = 12/3 = 4 (altitude from vertex A to side a)
    close(result.derived.altitudes.a, 4);
    close(result.derived.altitudes.b, 3);
    close(result.derived.altitudes.c, 2.4);
  });
});
