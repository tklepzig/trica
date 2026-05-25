// Triangle solver. All angles are in degrees externally.
//
// Convention: side `a` is opposite angle `A` (at vertex A, where sides b and c meet).
// Same for b/B and c/C.

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

// Tolerance for verifying user-supplied redundant values against computed ones.
// 1e-6 absolute is loose enough for human input typed to ~5 decimal places.
const VERIFY_TOL = 1e-6;

// Tolerance for "is the angle sum exactly 180?" and similar geometric checks.
// Tighter than VERIFY_TOL because these come from our own arithmetic.
const GEOM_TOL = 1e-9;

export type SideKey = "a" | "b" | "c";
export type AngleKey = "A" | "B" | "C";
export type Key = SideKey | AngleKey;

export type TriangleInput = Partial<Record<Key, number>>;

export type Triangle = Record<Key, number>;

export type GivenSet = Record<Key, boolean>;

export type TriangleClassification = "acute" | "right" | "obtuse";

export type Derived = {
  area: number;
  perimeter: number;
  classification: TriangleClassification;
  isRight: boolean;
  isEquilateral: boolean;
  isIsoceles: boolean;
  altitudes: { a: number; b: number; c: number };
  inradius: number;
  circumradius: number;
};

export type SolveResult =
  | {
      kind: "unique";
      triangle: Triangle;
      derived: Derived;
      given: GivenSet;
      method: SolveMethod;
    }
  | {
      kind: "ambiguous";
      triangles: [Triangle, Triangle];
      derived: [Derived, Derived];
      given: GivenSet;
      method: "SSA";
    }
  | { kind: "underdetermined"; given: GivenSet; reason: string }
  | { kind: "inconsistent"; given: GivenSet; reason: string; mismatch?: Key }
  | { kind: "impossible"; given: GivenSet; reason: string };

export type SolveMethod = "SSS" | "SAS" | "ASA" | "AAS" | "SSA" | "right-pythagoras";

const SIDE_KEYS: SideKey[] = ["a", "b", "c"];
const ANGLE_KEYS: AngleKey[] = ["A", "B", "C"];

// Sides meeting at the vertex of a given angle.
// Angle A is at vertex A; sides b and c emanate from there. Side a is opposite.
function adjacentSides(angle: AngleKey): [SideKey, SideKey] {
  return angle === "A" ? ["b", "c"] : angle === "B" ? ["a", "c"] : ["a", "b"];
}

function oppositeSide(angle: AngleKey): SideKey {
  return angle.toLowerCase() as SideKey;
}

function oppositeAngle(side: SideKey): AngleKey {
  return side.toUpperCase() as AngleKey;
}

function sanitize(input: TriangleInput): {
  cleaned: TriangleInput;
  given: GivenSet;
  invalid: Key[];
} {
  const cleaned: TriangleInput = {};
  const given: GivenSet = { a: false, b: false, c: false, A: false, B: false, C: false };
  const invalid: Key[] = [];

  ([...SIDE_KEYS, ...ANGLE_KEYS] as Key[]).forEach((key) => {
    const value = input[key];
    if (value === undefined || value === null) return;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      invalid.push(key);
      return;
    }
    const isSide = SIDE_KEYS.includes(key as SideKey);
    if (isSide) {
      if (value <= 0) {
        invalid.push(key);
        return;
      }
    } else {
      if (value <= 0 || value >= 180) {
        invalid.push(key);
        return;
      }
    }
    cleaned[key] = value;
    given[key] = true;
  });

  return { cleaned, given, invalid };
}

function emptyGiven(): GivenSet {
  return { a: false, b: false, c: false, A: false, B: false, C: false };
}

// Law of cosines: returns the angle (degrees) opposite `opp`, given the two
// adjacent sides. Returns null if the inputs are not geometrically valid
// (which manifests as |cosA| > 1 due to triangle inequality violation).
function angleFromSides(opp: number, adj1: number, adj2: number): number | null {
  const cosValue = (adj1 * adj1 + adj2 * adj2 - opp * opp) / (2 * adj1 * adj2);
  if (cosValue > 1 + GEOM_TOL || cosValue < -1 - GEOM_TOL) return null;
  const clamped = Math.max(-1, Math.min(1, cosValue));
  return Math.acos(clamped) * RAD2DEG;
}

function sideFromSAS(adj1: number, adj2: number, included: number): number {
  const includedRad = included * DEG2RAD;
  const squared = adj1 * adj1 + adj2 * adj2 - 2 * adj1 * adj2 * Math.cos(includedRad);
  return Math.sqrt(Math.max(0, squared));
}

// Returns sin(angle_in_degrees) safely.
function sinDeg(degrees: number): number {
  return Math.sin(degrees * DEG2RAD);
}

function cosDeg(degrees: number): number {
  return Math.cos(degrees * DEG2RAD);
}

function classify(triangle: Triangle): TriangleClassification {
  const maxAngle = Math.max(triangle.A, triangle.B, triangle.C);
  if (Math.abs(maxAngle - 90) < 1e-6) return "right";
  if (maxAngle > 90) return "obtuse";
  return "acute";
}

function deriveAll(triangle: Triangle): Derived {
  const { a, b, c, A, B, C } = triangle;
  const perimeter = a + b + c;
  // Two area formulas would converge; use the most numerically friendly one (½ab sin C).
  const area = 0.5 * a * b * sinDeg(C);
  const semiperimeter = perimeter / 2;
  const altitudes = {
    a: (2 * area) / a,
    b: (2 * area) / b,
    c: (2 * area) / c,
  };
  const inradius = area / semiperimeter;
  const circumradius = a / (2 * sinDeg(A));
  const classification = classify(triangle);
  const isRight = classification === "right";
  const sortedSides = [a, b, c].slice().sort((left, right) => left - right);
  const isEquilateral = Math.abs(sortedSides[2] - sortedSides[0]) < 1e-6;
  const isIsoceles =
    !isEquilateral &&
    (Math.abs(a - b) < 1e-6 || Math.abs(b - c) < 1e-6 || Math.abs(a - c) < 1e-6);
  return {
    area,
    perimeter,
    classification,
    isRight,
    isEquilateral,
    isIsoceles,
    altitudes,
    inradius,
    circumradius,
  };
}

// Verify that a fully-built triangle agrees with all user-supplied values.
function verifyAgainstGiven(
  triangle: Triangle,
  input: TriangleInput,
): { ok: true } | { ok: false; mismatch: Key } {
  for (const key of [...SIDE_KEYS, ...ANGLE_KEYS] as Key[]) {
    const givenValue = input[key];
    if (givenValue === undefined) continue;
    const computed = triangle[key];
    if (Math.abs(computed - givenValue) > VERIFY_TOL) {
      return { ok: false, mismatch: key };
    }
  }
  return { ok: true };
}

function uniqueResult(
  triangle: Triangle,
  given: GivenSet,
  method: SolveMethod,
): SolveResult {
  return {
    kind: "unique",
    triangle,
    derived: deriveAll(triangle),
    given,
    method,
  };
}

// --- Solving cases ---------------------------------------------------------

// SSS: three sides given. One law-of-cosines call per angle.
function solveSSS(input: Required<Pick<TriangleInput, "a" | "b" | "c">>): SolveResult {
  const { a, b, c } = input;
  if (a + b <= c + GEOM_TOL || a + c <= b + GEOM_TOL || b + c <= a + GEOM_TOL) {
    return {
      kind: "impossible",
      given: { a: true, b: true, c: true, A: false, B: false, C: false },
      reason: "triangle inequality violated: each side must be shorter than the sum of the other two",
    };
  }
  const A = angleFromSides(a, b, c);
  const B = angleFromSides(b, a, c);
  if (A === null || B === null) {
    return {
      kind: "impossible",
      given: { a: true, b: true, c: true, A: false, B: false, C: false },
      reason: "sides do not form a valid triangle",
    };
  }
  const C = 180 - A - B;
  return uniqueResult({ a, b, c, A, B, C }, fullGiven(["a", "b", "c"]), "SSS");
}

// SAS: two sides and the angle between them.
// `included` is the angle between the two `sides`.
function solveSAS(
  sides: [{ key: SideKey; value: number }, { key: SideKey; value: number }],
  included: { key: AngleKey; value: number },
): SolveResult {
  const [first, second] = sides;
  const thirdSideKey = oppositeSide(included.key);
  const thirdSideValue = sideFromSAS(first.value, second.value, included.value);
  const partial: Triangle = {
    a: 0,
    b: 0,
    c: 0,
    A: 0,
    B: 0,
    C: 0,
  };
  partial[first.key] = first.value;
  partial[second.key] = second.value;
  partial[thirdSideKey] = thirdSideValue;
  partial[included.key] = included.value;
  // Fill in the other two angles via law of cosines.
  const firstOppAngle = oppositeAngle(first.key);
  const secondOppAngle = oppositeAngle(second.key);
  const computed1 = angleFromSides(first.value, second.value, thirdSideValue);
  const computed2 = angleFromSides(second.value, first.value, thirdSideValue);
  if (computed1 === null || computed2 === null) {
    return {
      kind: "impossible",
      given: fullGiven([first.key, second.key, included.key]),
      reason: "law of cosines produced an invalid angle",
    };
  }
  partial[firstOppAngle] = computed1;
  partial[secondOppAngle] = computed2;
  return uniqueResult(
    partial,
    fullGiven([first.key, second.key, included.key]),
    "SAS",
  );
}

// Two angles + one side. Always one solution if the angle sum is < 180.
function solveTwoAnglesOneSide(
  angles: [{ key: AngleKey; value: number }, { key: AngleKey; value: number }],
  side: { key: SideKey; value: number },
): SolveResult {
  const [first, second] = angles;
  if (first.value + second.value >= 180 - GEOM_TOL) {
    return {
      kind: "impossible",
      given: fullGiven([first.key, second.key, side.key]),
      reason: "given angles sum to ≥ 180°",
    };
  }
  const allAngleKeys: AngleKey[] = ["A", "B", "C"];
  const thirdAngleKey = allAngleKeys.find(
    (key) => key !== first.key && key !== second.key,
  )!;
  const thirdAngleValue = 180 - first.value - second.value;
  // Law of sines: side / sin(opposite angle) = side / sin(opposite angle).
  const triangle: Triangle = { a: 0, b: 0, c: 0, A: 0, B: 0, C: 0 };
  triangle[first.key] = first.value;
  triangle[second.key] = second.value;
  triangle[thirdAngleKey] = thirdAngleValue;
  triangle[side.key] = side.value;
  const ratio = side.value / sinDeg(triangle[oppositeAngle(side.key)]);
  for (const sideKey of SIDE_KEYS) {
    if (sideKey === side.key) continue;
    triangle[sideKey] = ratio * sinDeg(triangle[oppositeAngle(sideKey)]);
  }
  // ASA: given side is between the two given angles (i.e. opposite to the unknown angle).
  // AAS: given side is opposite one of the given angles.
  const method: SolveMethod =
    oppositeAngle(side.key) === thirdAngleKey ? "ASA" : "AAS";
  return uniqueResult(triangle, fullGiven([first.key, second.key, side.key]), method);
}

// SSA: two sides + an angle opposite one of them. The ambiguous case.
function solveSSA(
  knownAngle: { key: AngleKey; value: number },
  sideOppositeKnownAngle: { key: SideKey; value: number },
  otherSide: { key: SideKey; value: number },
): SolveResult {
  const given = fullGiven([knownAngle.key, sideOppositeKnownAngle.key, otherSide.key]);
  const A = knownAngle.value;
  const a = sideOppositeKnownAngle.value;
  const b = otherSide.value;
  // Law of sines: sin B = b · sin A / a
  const sinB = (b * sinDeg(A)) / a;
  if (sinB > 1 + GEOM_TOL) {
    return {
      kind: "impossible",
      given,
      reason: "no triangle exists with these inputs (side too short relative to angle)",
    };
  }
  const clamped = Math.min(1, Math.max(-1, sinB));
  // When sin B is at or near 1, the two branches collapse to a single right angle.
  // Using a tolerance larger than GEOM_TOL because sinDeg(30°) etc. are not bit-exact.
  const RIGHT_ANGLE_TOL = 1e-9;
  const isRightBoundary = Math.abs(clamped - 1) < RIGHT_ANGLE_TOL;
  const B1 = isRightBoundary ? 90 : Math.asin(clamped) * RAD2DEG;
  const B2 = 180 - B1;
  // Decide which of the two candidate B values are valid:
  // - B1 (acute) is always a candidate if A + B1 < 180.
  // - B2 (obtuse, or its acute supplement) is a valid second triangle only if
  //   A + B2 < 180 AND it's distinguishable from B1 (i.e. not a right triangle case
  //   where B1 == B2 == 90).
  const candidates: number[] = [];
  if (A + B1 < 180 - GEOM_TOL) candidates.push(B1);
  if (!isRightBoundary && Math.abs(B2 - B1) > GEOM_TOL && A + B2 < 180 - GEOM_TOL)
    candidates.push(B2);

  if (candidates.length === 0) {
    return { kind: "impossible", given, reason: "no triangle exists with these inputs" };
  }

  const triangles = candidates.map((BValue): Triangle => {
    const CValue = 180 - A - BValue;
    const ratio = a / sinDeg(A);
    const triangle: Triangle = { a: 0, b: 0, c: 0, A: 0, B: 0, C: 0 };
    triangle[knownAngle.key] = A;
    triangle[oppositeAngle(sideOppositeKnownAngle.key)] = A;
    triangle[sideOppositeKnownAngle.key] = a;
    triangle[otherSide.key] = b;
    // Now we need to map BValue and CValue to the right angle keys.
    // The other side (b) is opposite some angle; that angle's value is BValue.
    const otherSideOppAngle = oppositeAngle(otherSide.key);
    triangle[otherSideOppAngle] = BValue;
    // The remaining angle is the third one.
    const remainingAngle = ANGLE_KEYS.find(
      (key) => key !== knownAngle.key && key !== otherSideOppAngle,
    )!;
    triangle[remainingAngle] = CValue;
    // The remaining side, opposite that remaining angle.
    const remainingSide = SIDE_KEYS.find(
      (key) => key !== sideOppositeKnownAngle.key && key !== otherSide.key,
    )!;
    triangle[remainingSide] = ratio * sinDeg(CValue);
    return triangle;
  });

  if (triangles.length === 1) {
    return uniqueResult(triangles[0], given, "SSA");
  }
  return {
    kind: "ambiguous",
    triangles: [triangles[0], triangles[1]],
    derived: [deriveAll(triangles[0]), deriveAll(triangles[1])],
    given,
    method: "SSA",
  };
}

function fullGiven(keys: Key[]): GivenSet {
  const result = emptyGiven();
  keys.forEach((key) => {
    result[key] = true;
  });
  return result;
}

// --- Entry point -----------------------------------------------------------

export function solve(input: TriangleInput): SolveResult {
  const { cleaned, given, invalid } = sanitize(input);

  if (invalid.length > 0) {
    return {
      kind: "impossible",
      given,
      reason: `invalid value(s) for: ${invalid.join(", ")}`,
    };
  }

  const givenSides = SIDE_KEYS.filter((key) => cleaned[key] !== undefined);
  const givenAngles = ANGLE_KEYS.filter((key) => cleaned[key] !== undefined);
  const totalGiven = givenSides.length + givenAngles.length;

  // Pre-check angle sum if 2 or 3 angles are given.
  const angleSum = givenAngles.reduce((sum, key) => sum + (cleaned[key] as number), 0);
  if (givenAngles.length === 3 && Math.abs(angleSum - 180) > VERIFY_TOL) {
    return { kind: "inconsistent", given, reason: "given angles do not sum to 180°" };
  }
  if (givenAngles.length === 2 && angleSum >= 180 - GEOM_TOL) {
    return { kind: "impossible", given, reason: "given two angles already sum to ≥ 180°" };
  }

  if (totalGiven < 3) {
    return {
      kind: "underdetermined",
      given,
      reason: `need at least 3 values (with at least one side); got ${totalGiven}`,
    };
  }

  if (givenSides.length === 0) {
    return {
      kind: "underdetermined",
      given,
      reason: "all angles given but no sides — triangle shape known but not scale",
    };
  }

  // Pick a minimal solvable subset of exactly 3 values.
  // Strategy: if there are ≥3 givens, find one that gives a unique triangle and
  // then verify the rest of the user's input matches.
  let primary: SolveResult | null = null;

  if (givenSides.length === 3) {
    primary = solveSSS({
      a: cleaned.a as number,
      b: cleaned.b as number,
      c: cleaned.c as number,
    });
  } else if (givenAngles.length >= 2 && givenSides.length >= 1) {
    // ASA / AAS: prefer because it's unambiguous.
    const [angleKey1, angleKey2] = givenAngles.slice(0, 2);
    const sideKey = givenSides[0];
    primary = solveTwoAnglesOneSide(
      [
        { key: angleKey1, value: cleaned[angleKey1] as number },
        { key: angleKey2, value: cleaned[angleKey2] as number },
      ],
      { key: sideKey, value: cleaned[sideKey] as number },
    );
  } else if (givenAngles.length === 1 && givenSides.length >= 2) {
    const angleKey = givenAngles[0];
    const angleValue = cleaned[angleKey] as number;
    const oppositeSideKey = oppositeSide(angleKey);
    const sideKeysGiven = givenSides.slice();
    const adjSidesForAngle = adjacentSides(angleKey);
    const isSAS =
      sideKeysGiven.includes(adjSidesForAngle[0]) &&
      sideKeysGiven.includes(adjSidesForAngle[1]) &&
      !sideKeysGiven.includes(oppositeSideKey);
    if (isSAS) {
      primary = solveSAS(
        [
          { key: adjSidesForAngle[0], value: cleaned[adjSidesForAngle[0]] as number },
          { key: adjSidesForAngle[1], value: cleaned[adjSidesForAngle[1]] as number },
        ],
        { key: angleKey, value: angleValue },
      );
    } else {
      // SSA: angle is opposite one of the given sides.
      const knownAngleOppositeSide = oppositeSideKey;
      const otherSideKey = sideKeysGiven.find((key) => key !== knownAngleOppositeSide);
      if (!sideKeysGiven.includes(knownAngleOppositeSide) || !otherSideKey) {
        // Edge: angle is opposite the missing side — that's actually SAS handled above.
        // Reaching here means the angle's opposite side isn't given AND it's not SAS.
        // Shouldn't happen with 2 sides + 1 angle, but be defensive.
        return {
          kind: "impossible",
          given,
          reason: "unexpected configuration of given values",
        };
      }
      primary = solveSSA(
        { key: angleKey, value: angleValue },
        {
          key: knownAngleOppositeSide,
          value: cleaned[knownAngleOppositeSide] as number,
        },
        { key: otherSideKey, value: cleaned[otherSideKey] as number },
      );
    }
  }

  if (!primary) {
    return { kind: "impossible", given, reason: "could not determine solving method" };
  }

  // If user supplied >3 values, verify the extras match what we computed.
  if (totalGiven > 3) {
    if (primary.kind === "unique") {
      const check = verifyAgainstGiven(primary.triangle, cleaned);
      if (!check.ok) {
        return {
          kind: "inconsistent",
          given,
          reason: `value for ${check.mismatch} disagrees with the rest of the inputs`,
          mismatch: check.mismatch,
        };
      }
    } else if (primary.kind === "ambiguous") {
      // For ambiguous, keep only branches that match the extra given values.
      const matching = primary.triangles.filter(
        (triangle) => verifyAgainstGiven(triangle, cleaned).ok,
      );
      if (matching.length === 0) {
        return {
          kind: "inconsistent",
          given,
          reason: "extra inputs do not match either ambiguous solution",
        };
      }
      if (matching.length === 1) {
        return uniqueResult(matching[0], given, "SSA");
      }
      // Both still match — keep ambiguous (rare).
    }
  }

  // Replace `given` on the primary result with the full given set (in case the
  // case-solver only tracked the minimal subset).
  if (primary.kind === "unique") {
    return { ...primary, given };
  }
  if (primary.kind === "ambiguous") {
    return { ...primary, given };
  }
  return primary;
}

// Convenience export: detect right-triangle inputs and prefer Pythagoras when
// applicable. This is just a hint to the UI for showing "Pythagoras" as the
// method label — the actual solving is already handled by the generic solver
// via SSS / SAS / ASA depending on which values are given.
export function isPythagorasApplicable(input: TriangleInput): boolean {
  return (
    input.A === 90 ||
    input.B === 90 ||
    input.C === 90 ||
    // Or detect implicit right triangle from three sides (Pythagorean triple)
    (input.a !== undefined &&
      input.b !== undefined &&
      input.c !== undefined &&
      isPythagoreanTriple(input.a, input.b, input.c))
  );
}

function isPythagoreanTriple(a: number, b: number, c: number): boolean {
  const sides = [a, b, c].sort((left, right) => left - right);
  return Math.abs(sides[0] * sides[0] + sides[1] * sides[1] - sides[2] * sides[2]) < 1e-6;
}
