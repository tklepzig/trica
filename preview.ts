// Builds a representative triangle from PARTIAL input, for the live diagram
// preview shown before the triangle is fully determined.
//
// A partial triangle is underdetermined — "c = 5" alone fits infinitely many
// triangles — so we HONOUR every value the user has entered and fill the
// unknowns with neutral defaults (missing angles split toward 60°; an absent
// scale → a unit side). The one subtlety is two given sides: their relative
// length is only meaningful once the angle between them is fixed, so we default
// THAT included angle (→ SAS) rather than inventing free angles that would
// contradict the lengths. The completed set is handed to the real solver, so
// triangle inequality / angle-sum validity is checked there, not reinvented —
// an impossible partial returns null and the caller falls back to the neutral
// placeholder.

import { solve } from "./solver.js";
import type { AngleKey, SideKey, Triangle, TriangleInput } from "./solver.js";

const SIDE_KEYS: SideKey[] = ["a", "b", "c"];
const ANGLE_KEYS: AngleKey[] = ["A", "B", "C"];

// Complete a partial input to a solvable set, or null if the entered values
// already preclude any triangle.
export function completeForPreview(input: TriangleInput): TriangleInput | null {
  const givenSides = SIDE_KEYS.filter((key) => input[key] !== undefined);
  const givenAngles = ANGLE_KEYS.filter((key) => input[key] !== undefined);
  const angleSum = givenAngles.reduce(
    (sum, key) => sum + (input[key] as number),
    0,
  );

  // Angle sets that can't belong to any triangle.
  if (
    givenAngles.some(
      (key) => (input[key] as number) <= 0 || (input[key] as number) >= 180,
    )
  ) {
    return null;
  }
  if (givenAngles.length >= 2 && angleSum >= 180) return null;
  if (givenAngles.length === 3 && Math.abs(angleSum - 180) > 1e-6) return null;

  // Already enough for the real solver to take over (it validates and, for SSA,
  // disambiguates).
  if (givenSides.length + givenAngles.length >= 3 && givenSides.length >= 1) {
    return { ...input };
  }

  const completed: TriangleInput = { ...input };

  // Two sides, no angle: fix the shape via the included angle (the one opposite
  // the missing side) so both lengths stay honoured.
  if (givenSides.length === 2 && givenAngles.length === 0) {
    const missingSide = SIDE_KEYS.find(
      (key) => input[key] === undefined,
    ) as SideKey;
    completed[missingSide.toUpperCase() as AngleKey] = 60;
    return completed;
  }

  // Otherwise at most one side constrains the shape, so angles can be chosen
  // freely: fill the missing ones so all three sum to 180.
  const missingAngles = ANGLE_KEYS.filter((key) => completed[key] === undefined);
  const budget = 180 - angleSum;
  if (missingAngles.length === 3) {
    completed.A = 60;
    completed.B = 60;
    completed.C = 60;
  } else if (missingAngles.length === 2) {
    completed[missingAngles[0]] = budget / 2;
    completed[missingAngles[1]] = budget / 2;
  } else if (missingAngles.length === 1) {
    completed[missingAngles[0]] = budget;
  }

  // Ensure a length so the shape has a scale to be drawn at.
  if (givenSides.length === 0) completed.c = 1;

  return completed;
}

// The triangle to preview for `input`, or null if no triangle is possible.
export function buildPreviewTriangle(input: TriangleInput): Triangle | null {
  const completed = completeForPreview(input);
  if (!completed) return null;
  const result = solve(completed);
  if (result.kind === "unique") return result.triangle;
  if (result.kind === "ambiguous") return result.triangles[0];
  return null;
}
